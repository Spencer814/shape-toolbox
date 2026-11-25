import { describe, expect, it } from 'vitest';
import { allKeyed, allSettledKeyed, mapLimit } from '../src/index.js';

/**
 * Resolves a value after a delay.
 *
 * @typeParam T - The value type.
 * @param ms - The delay.
 * @param value - The value.
 * @returns A promise of the value.
 */
const delay = <T>(ms: number, value: T): Promise<T> => new Promise((r) => setTimeout(() => r(value), ms));

describe('allKeyed and allSettledKeyed (v1 propsP)', () => {
  it('follow the Stage 3 shape: null prototype, symbol keys, own enumerable keys only', async () => {
    /** A symbol key. */
    const sym = Symbol('s');
    /** A source with a hidden property and a symbol key. */
    const source = Object.defineProperty({ p1: Promise.resolve('p1'), p2: 'p2', [sym]: Promise.resolve(3) }, 'hidden', {
      value: 1,
      enumerable: false,
    });
    /** The keyed result. */
    const out = await allKeyed(source);
    expect(Object.getPrototypeOf(out)).toBeNull();
    expect({ ...out }).toEqual({ p1: 'p1', p2: 'p2', [sym]: 3 });
    expect('hidden' in out).toBe(false);
  });
  it('accepts arrays, as the proposal does', async () => {
    expect({ ...(await allKeyed([Promise.resolve(1), 2])) }).toEqual({ 0: 1, 1: 2 });
  });
  it('keeps a key named __proto__ as own data', async () => {
    /** The result for an own `__proto__` key. */
    const out = await allKeyed(JSON.parse('{"__proto__": 1}') as object);
    expect(Object.hasOwn(out, '__proto__')).toBe(true);
  });
  it('settles each key without rejecting', async () => {
    /** A settled result with one rejection. */
    const out = await allSettledKeyed({ ok: 1, bad: Promise.reject(new Error('x')) });
    expect(out.ok).toEqual({ status: 'fulfilled', value: 1 });
    expect(out.bad.status).toBe('rejected');
  });
  it('rejects, not throws, on a throwing getter, and leaves no earlier rejection unhandled', async () => {
    /** Rejections nothing handled. */
    const unhandled: unknown[] = [];
    /**
     * Records an unhandled rejection.
     *
     * @param reason - The rejection reason.
     */
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    /**
     * Builds an object whose later getter throws.
     *
     * @returns The object.
     */
    const make = (): object =>
      Object.defineProperty({ a: Promise.reject(new Error('a')) }, 'b', {
        get() {
          throw new Error('getter b');
        },
        enumerable: true,
      });
    /** The pending keyed call. */
    let pending: Promise<unknown> | undefined;
    expect(() => {
      pending = allKeyed(make());
    }).not.toThrow();
    await expect(pending).rejects.toThrow('getter b');
    await expect(allSettledKeyed(make())).rejects.toThrow('getter b');
    await delay(10, undefined);
    process.off('unhandledRejection', onUnhandled);
    expect(unhandled).toEqual([]);
  });
  it('rejects on the first failure', async () => {
    await expect(allKeyed({ a: Promise.reject(new Error('a')) })).rejects.toThrow('a');
  });
  it('rejects non-objects with a TypeError (Maps, Sets and promises are caught by the types instead)', async () => {
    /** Inputs that are not valid concurrency values. */
    const bad: unknown[] = [1, null];
    for (const value of bad) {
      await expect(allKeyed(value as object)).rejects.toThrow(TypeError);
      await expect(allSettledKeyed(value as object)).rejects.toThrow(TypeError);
    }
  });
});

describe('mapLimit', () => {
  it('keeps order and never exceeds the limit', async () => {
    /** Calls in flight. */
    let active = 0;
    /** The most calls at once. */
    let peak = 0;
    /** Results in input order. */
    const out = await mapLimit(
      [30, 10, 20, 5, 1],
      async (ms) => {
        active++;
        peak = Math.max(peak, active);
        await delay(ms, undefined);
        active--;
        return ms * 2;
      },
      { concurrency: 2 },
    );
    expect(out).toEqual([60, 20, 40, 10, 2]);
    expect(peak).toBe(2);
  });
  it('runs everything at once by default and handles an empty list', async () => {
    /** Calls in flight. */
    let active = 0;
    /** The most calls at once. */
    let peak = 0;
    await mapLimit([1, 2, 3], async () => {
      active++;
      peak = Math.max(peak, active);
      await delay(5, undefined);
      active--;
    });
    expect(peak).toBe(3);
    expect(await mapLimit([], () => 1)).toEqual([]);
  });
  it('accepts sync results and catches sync throws', async () => {
    expect(await mapLimit([1, 2], (n) => n + 1)).toEqual([2, 3]);
    await expect(
      mapLimit([1], () => {
        throw new Error('sync');
      }),
    ).rejects.toThrow('sync');
  });
  it('fails fast and aborts the signal seen by running calls', async () => {
    /** Set when a running call sees the abort. */
    let sawAbort = false;
    await expect(
      mapLimit([1, 2], async (n, _i, signal) => {
        if (n === 1) throw new Error('boom');
        await delay(20, undefined);
        sawAbort = signal.aborted;
      }),
    ).rejects.toThrow('boom');
    await delay(30, undefined);
    expect(sawAbort).toBe(true);
  });
  it('rejects once when several calls fail', async () => {
    await expect(
      mapLimit([1, 2, 3], async (n) => {
        await delay(n, undefined);
        throw new Error(`fail ${n}`);
      }),
    ).rejects.toThrow('fail 1');
    await delay(10, undefined);
  });
  it('stops starting work after a failure', async () => {
    /** Items that started. */
    const started: number[] = [];
    await expect(
      mapLimit(
        [1, 2, 3],
        async (n) => {
          started.push(n);
          if (n === 1) throw new Error('first');
          return n;
        },
        { concurrency: 1 },
      ),
    ).rejects.toThrow('first');
    await delay(10, undefined);
    expect(started).toEqual([1]);
  });
  it('honors an outer signal, before and during the run', async () => {
    await expect(mapLimit([1], async () => 1, { signal: AbortSignal.abort(new Error('pre')) })).rejects.toThrow('pre');
    /** Cancels the map. */
    const controller = new AbortController();
    /** A map that never finishes on its own. */
    const pending = mapLimit([1], () => new Promise(() => undefined), { signal: controller.signal });
    controller.abort(new Error('later'));
    await expect(pending).rejects.toThrow('later');
  });
  it('rejects a concurrency that is not a whole number of at least 1', async () => {
    for (const concurrency of [0, -1, 1.5, Number.NaN]) {
      await expect(mapLimit([1], () => 1, { concurrency })).rejects.toThrow(RangeError);
    }
    expect(await mapLimit([1], () => 1, { concurrency: Number.POSITIVE_INFINITY })).toEqual([1]);
  });
});
