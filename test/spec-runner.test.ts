import { describe, expect, it } from 'vitest';
import { applySpecAsync, failedPath } from '../src/index.js';
import type { Spec } from '../src/index.js';

/**
 * Resolves a value after a delay.
 *
 * @typeParam T - The value type.
 * @param ms - The delay.
 * @param value - The value.
 * @returns A promise of the value.
 */
const delay = <T>(ms: number, value: T): Promise<T> => new Promise((r) => setTimeout(() => r(value), ms));
/**
 * Adds two numbers asynchronously.
 *
 * @param a - One number.
 * @param b - The other.
 * @returns The sum.
 */
const addP = async (a: number, b: number): Promise<number> => a + b;

// Ported from v1 src/lib/__tests__/applySpecP.spec.ts, minus currying and fn.length
describe('applySpecAsync: v1 applySpecP parity', () => {
  it('works with an empty spec', async () => {
    expect(await applySpecAsync({})()).toEqual({});
  });
  it('works with unary and binary functions', async () => {
    expect(await applySpecAsync({ v: async (a: number) => 1 + a, u: async (a: number) => -1 + a })(1)).toEqual({
      v: 2,
      u: 0,
    });
    expect(await applySpecAsync({ sum: addP })(1, 2)).toEqual({ sum: 3 });
  });
  it('works with nested specs', async () => {
    /** A nested spec of binary operations. */
    const f = applySpecAsync({ mul: async (a: number, b: number) => a * b, nested: { sum: addP } });
    expect(await f(1, 2)).toEqual({ mul: 2, nested: { sum: 3 } });
  });
  it('works with a spec defining a map key', async () => {
    expect(await applySpecAsync({ map: async (o: { a: number }) => o.a })({ a: 1 })).toEqual({ map: 1 });
  });
  it('passes every argument to every leaf', async () => {
    /** A spec built from an array. */
    const f = applySpecAsync({
      f1: async (a: number, b: number) => `BinaryFn called with ${a}, ${b}`,
      f2: async (a: number, b: number, c: number) => `TrinaryFn called with ${a}, ${b}, ${c}`,
    });
    expect(await f(0, 1, 2)).toEqual({ f1: 'BinaryFn called with 0, 1', f2: 'TrinaryFn called with 0, 1, 2' });
  });
});

describe('applySpecAsync: v1 defects stay fixed', () => {
  it('keeps arrays as arrays (v1 returned { 0, 1, ... })', async () => {
    /**
     * A leaf reading its third argument.
     *
     * @param _a - Unused.
     * @param _b - Unused.
     * @param c - The third argument.
     * @returns `c`.
     */
    const third = (_a: number, _b: number, c: number): number => c;
    expect(await applySpecAsync({ notAFunc: [third, third] })(0, 1, 2)).toEqual({ notAFunc: [2, 2] });
    expect(await applySpecAsync([third, { n: third }])(0, 1, 2)).toEqual([2, { n: 2 }]);
  });
  it('passes arguments to a spec with only nested leaves (v1 computed arity 0)', async () => {
    expect(await applySpecAsync({ nested: { sum: addP } })(1, 2)).toEqual({ nested: { sum: 3 } });
  });
});

describe('applySpecAsync', () => {
  it('calls no leaf until the returned function is called', async () => {
    /** Counts leaf calls. */
    let calls = 0;
    /** A runner that counts calls. */
    const f = applySpecAsync({ a: () => ++calls });
    await delay(5, undefined);
    expect(calls).toBe(0);
    expect(await f()).toEqual({ a: 1 });
    expect(await f()).toEqual({ a: 2 });
  });
  it('applies one concurrency limit across every depth', async () => {
    /** Leaves in flight. */
    let active = 0;
    /** The most leaves at once. */
    let peak = 0;
    /**
     * A leaf that records concurrency.
     *
     * @returns Always 1.
     */
    const leaf = async (): Promise<number> => {
      active++;
      peak = Math.max(peak, active);
      await delay(5, undefined);
      active--;
      return 1;
    };
    /** A nested spec of identical leaves. */
    const spec = { a: leaf, b: { c: leaf, d: [leaf, { e: leaf }] }, f: [leaf, leaf] };
    /** The result under a limit of two. */
    const out = await applySpecAsync(spec, { concurrency: 2 })();
    expect(out).toEqual({ a: 1, b: { c: 1, d: [1, { e: 1 }] }, f: [1, 1] });
    expect(peak).toBe(2);
  });
  it('runs leaves in spec order at concurrency 1', async () => {
    /** Leaf completion order. */
    const order: string[] = [];
    /**
     * Builds a slow leaf that records when it finishes.
     *
     * @param tag - Its label.
     * @param ms - Its delay.
     * @returns The leaf.
     */
    const slow = (tag: string, ms: number) => async (): Promise<string> => {
      order.push(`start ${tag}`);
      await delay(ms, undefined);
      order.push(`end ${tag}`);
      return tag;
    };
    expect(await applySpecAsync({ a: slow('a', 20), b: slow('b', 1) }, { concurrency: 1 })()).toEqual({ a: 'a', b: 'b' });
    expect(order).toEqual(['start a', 'end a', 'start b', 'end b']);
  });
  it('rejects with the leaf error itself and records its path', async () => {
    /** The failure from one leaf. */
    const boom = new Error('boom');
    /** A runner with a failing leaf among slow ones. */
    const f = applySpecAsync({
      ok: async () => 1,
      user: {
        orders: [
          async () => 1,
          async () => {
            throw boom;
          },
        ],
      },
    });
    /** The rejection. */
    const error = await f().catch((e: unknown) => e);
    expect(error).toBe(boom);
    expect(failedPath(error)).toEqual(['user', 'orders', 1]);
  });
  it('returns every result in settled mode', async () => {
    /** The failure for settled mode. */
    const boom = new Error('x');
    /** The settled result. */
    const out = await applySpecAsync(
      {
        ok: async () => 1,
        bad: async () => {
          throw boom;
        },
      },
      { mode: 'settled' },
    )();
    expect(out).toEqual({ ok: { status: 'fulfilled', value: 1 }, bad: { status: 'rejected', reason: boom } });
  });
  it('stops unstarted leaves on abort, with no path', async () => {
    /** Leaves that started. */
    const started: string[] = [];
    /** Aborted while leaves are queued. */
    const controller = new AbortController();
    /**
     * Builds a leaf that records its start.
     *
     * @param tag - Its label.
     * @returns The leaf.
     */
    const leaf = (tag: string) => async (): Promise<string> => {
      started.push(tag);
      await delay(20, undefined);
      return tag;
    };
    /** A run limited to one leaf, so the rest stay queued. */
    const pending = applySpecAsync({ a: leaf('a'), b: leaf('b') }, { concurrency: 1, signal: controller.signal })();
    await delay(5, undefined);
    controller.abort(new Error('stop'));
    /** The abort error. */
    const error = await pending.catch((e: unknown) => e);
    expect((error as Error).message).toBe('stop');
    expect(failedPath(error)).toBeUndefined();
    await delay(30, undefined);
    expect(started).toEqual(['a']);
  });
  it('makes a fresh signal per call when given a factory', async () => {
    /** Signals created by the factory. */
    let made = 0;
    /** A runner given a signal factory. */
    const f = applySpecAsync(
      { a: async () => 1 },
      {
        signal: () => {
          made++;
          return new AbortController().signal;
        },
      },
    );
    await f();
    await f();
    expect(made).toBe(2);
  });
  it('keeps a spec key named __proto__ as own data', async () => {
    /** A spec with an own `__proto__` key. */
    const spec = JSON.parse('{"__proto__": 0}') as Record<string, unknown>;
    spec['__proto__'] = () => 1;
    /** The result of running it. */
    const out = (await applySpecAsync(spec as Spec)()) as object;
    expect(Object.hasOwn(out, '__proto__')).toBe(true);
  });
  it('throws a TypeError at definition for a bad spec', () => {
    /** A spec that contains itself. */
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => applySpecAsync({ a: { b: 1 } } as unknown as Spec)).toThrow(/a\.b is not a function/);
    expect(() => applySpecAsync(cyclic as Spec)).toThrow(/circular spec at self/);
    expect(() => applySpecAsync((() => 1) as unknown as Spec)).toThrow(/expects an object or array/);
    expect(() => applySpecAsync(1 as unknown as Spec)).toThrow(TypeError);
  });
  it('names array indexes in errors', () => {
    /** An array that contains itself. */
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    expect(() => applySpecAsync(cyclic as unknown as Spec)).toThrow(/circular spec at 0/);
  });
});
