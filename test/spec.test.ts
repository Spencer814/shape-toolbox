import { describe, expect, it } from 'vitest';
import { applySpecAsync } from '../src/spec.js';
import { failedPath } from '../src/failure.js';
import type { Spec } from '../src/types.js';

/**
 * Waits one macrotask.
 *
 * @returns A promise that resolves on the next tick.
 */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('applySpecAsync', () => {
  it('is lazy and reusable, passes every argument without appending a signal', async () => {
    /** The arguments each leaf received. */
    const calls: unknown[][] = [];
    /** A runner whose leaf records its arguments. */
    const run = applySpecAsync({ x: (...args: number[]) => { calls.push(args); return args.reduce((a, b) => a + b, 0); } });
    expect(calls).toEqual([]);
    expect(await run(1, 2)).toEqual({ x: 3 });
    expect(await run(4)).toEqual({ x: 4 });
    expect(calls).toEqual([[1, 2], [4]]);
  });

  it('preserves nested arrays, empty shapes, null prototypes and sparse positions', async () => {
    /** A sparse spec array. */
    const array = new Array<() => number>(3); array[1] = () => 7;
    /** A null-prototype spec. */
    const nullProto = Object.assign(Object.create(null), { value: () => 2 }) as { value: () => number };
    /** Results for empty and nested containers. */
    const out = await applySpecAsync({ empty: {}, list: [], nested: [[() => Promise.resolve(1)]], sparse: array, nullProto })();
    expect(out.empty).toEqual({});
    expect(out.list).toEqual([]);
    expect(out.nested).toEqual([[1]]);
    expect(out.sparse.length).toBe(3);
    expect(0 in out.sparse).toBe(false);
    expect(out.sparse[1]).toBe(7);
    expect(Object.getPrototypeOf(out.nullProto)).toBe(null);
    expect(out.nullProto.value).toBe(2);
    expect(await applySpecAsync([])()).toEqual([]);
  });

  it('writes dangerous-looking own keys without changing prototypes', async () => {
    /** A spec with `__proto__` and `constructor` keys. */
    const spec = JSON.parse('{"__proto__":{},"constructor":{}}') as Record<string, Spec>;
    Object.defineProperty(spec, '__proto__', { value: { polluted: () => true }, enumerable: true });
    /** Its result. */
    const out = await applySpecAsync(spec)();
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.hasOwn(out, '__proto__')).toBe(true);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('uses one concurrency budget across branches and retains output positions', async () => {
    /** Leaves in flight. */
    let active = 0; /** The most leaves at once. */ let peak = 0;
    /**
     * A leaf that records concurrency.
     *
     * @param id - The id.
     * @returns The id.
     */
    const fn = async (id: number): Promise<number> => { active++; peak = Math.max(peak, active); await tick(); active--; return id; };
    /** A nested spec under one limit. */
    const out = await applySpecAsync({ a: [fn, fn], b: { c: fn, d: [fn, fn] } }, { concurrency: 2 })(3);
    expect(peak).toBe(2);
    expect(out).toEqual({ a: [3, 3], b: { c: 3, d: [3, 3] } });
  });

  it('keeps input key order when leaves complete out of order', async () => {
    /** Results completing out of order. */
    const out = await applySpecAsync({ first: async () => { await tick(); return 1; }, middle: {}, last: () => 3 })();
    expect(Object.keys(out)).toEqual(['first', 'middle', 'last']);
  });

  it('rejects invalid leaves and cycles at definition, before any leaf can run', () => {
    /** Counts leaf calls. */
    let calls = 0;
    /** Specs that must be rejected at definition. */
    const invalids: unknown[] = [null, 1, undefined, new Date(), { [Symbol('key')]: () => 1 }, { a: () => calls++, b: null }];
    /** A cyclic spec, added to the invalid list. */
    const cyc: Record<string, unknown> = {}; cyc['self'] = cyc; invalids.push(cyc);
    for (const spec of invalids) expect(() => applySpecAsync(spec as Spec)).toThrow(TypeError);
    expect(() => applySpecAsync({ a: { b: [() => 1, 2] } } as unknown as Spec)).toThrow(/leaf at a\.b\.1 is not a function/);
    expect(calls).toBe(0);
  });

  it('allows a shared noncyclic branch twice', async () => {
    /** A branch shared by two keys, which is not a cycle. */
    const branch = { a: () => 1 };
    expect(await applySpecAsync({ x: branch, y: branch })()).toEqual({ x: { a: 1 }, y: { a: 1 } });
  });

  it('preserves original error identity and records numeric failure paths', async () => {
    /** A frozen error. */
    const error = Object.freeze(new Error('broken'));
    await expect(applySpecAsync({ nested: [() => { throw error; }] })()).rejects.toBe(error);
    expect(failedPath(error)).toEqual(['nested', 0]);
    expect(Object.isFrozen(failedPath(error))).toBe(true);
  });

  it('retains primitive failures and settles individual leaves without stopping siblings', async () => {
    await expect(applySpecAsync({ a: () => Promise.reject('bad') })()).rejects.toBe('bad');
    expect(failedPath('bad')).toBeUndefined();
    /** The failure to locate. */
    const error = new Error('bad');
    /** The settled result. */
    const out = await applySpecAsync({ a: [() => 1, () => { throw error; }], b: () => Promise.reject(null) }, { mode: 'settled', concurrency: 1 })();
    expect(out).toEqual({ a: [{ status: 'fulfilled', value: 1 }, { status: 'rejected', reason: error }], b: { status: 'rejected', reason: null } });
    expect(failedPath(error)).toEqual(['a', 1]);
  });

  it('rejects with the abort reason and does not start queued leaves', async () => {
    /** Aborted by the first leaf. */
    const controller = new AbortController(); /** The abort reason. */ const reason = new Error('stop'); /** Set if the second leaf starts. */ let second = false;
    /** A run whose first leaf aborts it. */
    const result = applySpecAsync({ a: () => { controller.abort(reason); return 1; }, b: () => { second = true; return 2; } }, { signal: controller.signal, concurrency: 1 })();
    await expect(result).rejects.toBe(reason);
    expect(second).toBe(false);
    await expect(applySpecAsync({ a: () => 1 }, { signal: AbortSignal.abort(reason) })()).rejects.toBe(reason);
  });

  it('handles every started rejection even after fail-fast', async () => {
    /** Unhandled rejections seen. */
    const errors: unknown[] = [];
    /**
     * Records an unhandled rejection.
     *
     * @param error - The reason.
     */
    const handler = (error: unknown): void => { errors.push(error); };
    process.on('unhandledRejection', handler);
    try {
      for (const concurrency of [1, Infinity]) {
        await expect(applySpecAsync({ a: () => Promise.reject(new Error('a')), b: async () => { await tick(); throw new Error('b'); } }, { concurrency })()).rejects.toThrow('a');
        await tick(); await tick();
      }
      expect(errors).toEqual([]);
    } finally { process.off('unhandledRejection', handler); }
  });
});


it('snapshots the spec at definition, so later changes to the spec object do not leak into calls', async () => {
  /** A spec modified after the runner is built. */
  const spec: Record<string, () => number> = { value: () => 1 };
  /** The runner, built first. */
  const run = applySpecAsync(spec);
  spec.value = () => 2;
  spec.added = () => 3;
  expect(await run()).toEqual({ value: 1 });
});

it('snapshots array specs too, so a later push adds no hole', async () => {
  /** A spec array extended after the runner is built. */
  const spec: (() => number)[] = [() => 1];
  /** The runner, built first. */
  const run = applySpecAsync(spec);
  spec.push(() => 2);
  /** The result after the push. */
  const result = await run();
  expect(result).toEqual([1]);
  expect(result).toHaveLength(1);
});

it('creates a fresh signal per call from a signal factory', async () => {
  /** Signals created by the factory. */
  let made = 0;
  /** A runner with a fresh signal per call. */
  const run = applySpecAsync({ value: () => 1 }, { signal: () => { made++; return new AbortController().signal; } });
  expect(await run()).toEqual({ value: 1 });
  expect(await run()).toEqual({ value: 1 });
  expect(made).toBe(2);
  /** A runner whose static signal is already aborted. */
  const stale = applySpecAsync({ value: () => 1 }, { signal: AbortSignal.abort(new Error('stale')) });
  await expect(stale()).rejects.toThrow('stale');
});

describe('applySpecAsync: contracts the mutation run found unpinned', () => {
  it('names the root in errors about the spec itself', () => {
    expect(() => applySpecAsync({ [Symbol('key')]: () => 1 } as never)).toThrow(new TypeError('applySpecAsync: spec keys at (root) must be strings or array indices'));
  });
});
