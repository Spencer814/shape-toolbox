import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allDeep, allSettledDeep, failedPath } from '../src/index.js';

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
 * Rejects after a delay.
 *
 * @param ms - The delay.
 * @param message - The error message.
 * @returns A promise that rejects.
 */
const fail = (ms: number, message: string): Promise<never> =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));

/** Rejections nothing handled during a test. */
let unhandled: unknown[] = [];
/**
 * Records an unhandled rejection.
 *
 * @param reason - The rejection reason.
 */
const onUnhandled = (reason: unknown): void => {
  unhandled.push(reason);
};
beforeEach(() => {
  unhandled = [];
  process.on('unhandledRejection', onUnhandled);
});
afterEach(() => {
  process.off('unhandledRejection', onUnhandled);
});

// Ported from v1 src/lib/helper/__tests__/promiseAllRecursive.spec.ts
describe('allDeep: v1 promiseAllRecursive parity', () => {
  it('resolves primitives', async () => {
    expect(await allDeep(42)).toBe(42);
    expect(await allDeep('hello')).toBe('hello');
  });
  it('handles plain arrays and objects', async () => {
    expect(await allDeep([1, 2, 3])).toEqual([1, 2, 3]);
    expect(await allDeep({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(await allDeep({ a: 1, b: {} })).toEqual({ a: 1, b: {} });
  });
  it('handles promises, arrays of promises and mixed arrays', async () => {
    expect(await allDeep(Promise.resolve('resolved'))).toBe('resolved');
    expect(await allDeep([Promise.resolve(1), Promise.resolve(2)])).toEqual([1, 2]);
    expect(await allDeep([Promise.resolve(1), 2, Promise.resolve(3)])).toEqual([1, 2, 3]);
  });
  it('handles flat and nested objects and arrays with promises', async () => {
    expect(await allDeep({ a: Promise.resolve(1), b: Promise.resolve(2), c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
    expect(await allDeep({ nested: { a: Promise.resolve(1) }, b: Promise.resolve(2), c: 3 })).toEqual({
      nested: { a: 1 },
      b: 2,
      c: 3,
    });
    expect(await allDeep({ nested: [Promise.resolve(1), 2], b: Promise.resolve(2), c: 3 })).toEqual({
      nested: [1, 2],
      b: 2,
      c: 3,
    });
    expect(await allDeep({ a: 1, nested: [{ b: [Promise.resolve(42)] }] })).toEqual({ a: 1, nested: [{ b: [42] }] });
  });
});

describe('allDeep: v1 defects stay fixed', () => {
  it('walks into the value a promise resolves to', async () => {
    expect(await allDeep(Promise.resolve({ a: Promise.resolve(1) }))).toEqual({ a: 1 });
  });
  it('leaves class instances, Date and Map alone instead of flattening them', async () => {
    class Box {
      p = Promise.resolve(1);
    }
    /** A class instance that must stay a leaf. */
    const box = new Box();
    /** A date that must stay a leaf. */
    const when = new Date(0);
    /** A map that must stay a leaf. */
    const map = new Map([['k', 1]]);
    /** The resolved result. */
    const out = await allDeep({ box, when, map });
    expect(out.box).toBe(box);
    expect(out.when).toBe(when);
    expect(out.map).toBe(map);
  });
  it('leaves no unhandled rejection when two leaves reject', async () => {
    await expect(allDeep({ a: Promise.reject(new Error('a')), b: [Promise.reject(new Error('b'))] })).rejects.toThrow();
    await delay(20, undefined);
    expect(unhandled).toEqual([]);
  });
});

describe('allDeep', () => {
  it('rejects with the first rejection in time and records its path', async () => {
    /** The first rejection by time, which must be thrown. */
    const error = await allDeep({ user: { orders: fail(5, 'orders') }, slow: fail(30, 'slow') }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('orders');
    expect(failedPath(error)).toEqual(['user', 'orders']);
    await delay(40, undefined);
    expect(unhandled).toEqual([]);
  });
  it('records array indexes in the path', async () => {
    /** The rejection from an array element. */
    const error = await allDeep({ list: [1, fail(1, 'x')] }).catch((e: unknown) => e);
    expect(failedPath(error)).toEqual(['list', 1]);
  });
  it('rejects a cycle, including one through a promise, with no path', async () => {
    /** A direct self-reference. */
    const direct: Record<string, unknown> = { a: 1 };
    direct.self = direct;
    /** A structure whose cycle appears after a promise. */
    const viaPromise: Record<string, unknown> = {};
    viaPromise.p = Promise.resolve(viaPromise);
    await expect(allDeep(direct)).rejects.toThrow(/circular/);
    /** The cycle error. */
    const error = await allDeep(viaPromise).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(failedPath(error)).toBeUndefined();
  });
  it('allows the same object twice when it is not a cycle', async () => {
    /** One object referenced twice, which is not a cycle. */
    const shared = { n: Promise.resolve(1) };
    expect(await allDeep({ x: shared, y: shared })).toEqual({ x: { n: 1 }, y: { n: 1 } });
  });
  it('keeps symbol keys, null prototypes and a key named __proto__ as own data', async () => {
    /** A symbol key to keep. */
    const sym = Symbol('s');
    /** A null-prototype object. */
    const bare = Object.assign(Object.create(null) as object, { a: Promise.resolve(1) });
    /** An object with an own `__proto__` key. */
    const parsed = JSON.parse('{"__proto__": {"polluted": true}}') as object;
    /** The resolved result. */
    const out = await allDeep({ [sym]: Promise.resolve(2), bare, parsed });
    expect(out[sym]).toBe(2);
    expect(Object.getPrototypeOf(out.bare)).toBeNull();
    expect(Object.hasOwn(out.parsed, '__proto__')).toBe(true);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
  it('returns plain values without promises synchronously walked', async () => {
    expect(await allDeep({ a: [1, { b: 2 }] })).toEqual({ a: [1, { b: 2 }] });
  });
  it('stops on abort with the signal reason and removes its listener', async () => {
    /** Its signal is aborted after the call. */
    const controller = new AbortController();
    /** A resolution that never finishes on its own. */
    const pending = allDeep({ slow: new Promise(() => undefined) }, { signal: controller.signal });
    controller.abort(new Error('stop'));
    /** The abort error. */
    const error = await pending.catch((e: unknown) => e);
    expect((error as Error).message).toBe('stop');
    expect(failedPath(error)).toBeUndefined();
  });
  it('rejects, not throws, for an already aborted signal', async () => {
    /** A signal aborted before the call. */
    const signal = AbortSignal.abort(new Error('pre'));
    /** The call made with an already-aborted signal. */
    let pending: Promise<unknown> | undefined;
    expect(() => {
      pending = allDeep({ a: 1 }, { signal });
    }).not.toThrow();
    await expect(pending).rejects.toThrow('pre');
  });
  it('ignores values that resolve after an abort', async () => {
    /** Aborted just before the late value resolves. */
    const controller = new AbortController();
    /** Resolution that loses to the abort. */
    const pending = allDeep({ late: delay(10, 1) }, { signal: controller.signal });
    controller.abort(new Error('stop'));
    await expect(pending).rejects.toThrow('stop');
    await delay(20, undefined);
  });
  it('ignores an abort after it has settled', async () => {
    /** Aborted to check listener cleanup. */
    const controller = new AbortController();
    expect(await allDeep({ a: Promise.resolve(1) }, { signal: controller.signal })).toEqual({ a: 1 });
    controller.abort();
  });
  it('does not record a path for a primitive rejection reason', async () => {
    /** A primitive rejection reason. */
    const reason = await allDeep({ a: Promise.reject('plain') }).catch((e: unknown) => e);
    expect(reason).toBe('plain');
    expect(failedPath(reason)).toBeUndefined();
  });
});

describe('allDeep with hostile inputs', () => {
  /**
   * Builds an input whose getter throws.
   *
   * @returns The input.
   */
  const withThrowingGetter = (): object =>
    Object.defineProperty({ a: Promise.reject(new Error('a')) }, 'b', {
      get() {
        throw new Error('getter b');
      },
      enumerable: true,
    });
  it('rejects on a throwing getter without leaving a sibling rejection unhandled', async () => {
    await expect(allDeep(withThrowingGetter())).rejects.toThrow();
    await expect(allSettledDeep(withThrowingGetter())).rejects.toThrow('getter b');
    await delay(10, undefined);
    expect(unhandled).toEqual([]);
  });
  it('handles a throwing getter on an array index', async () => {
    /** An array whose second element's getter throws. */
    const list = Object.defineProperty([Promise.reject(new Error('first'))], 1, {
      get() {
        throw new Error('index getter');
      },
      enumerable: true,
    });
    await expect(allDeep(list)).rejects.toThrow();
    await delay(10, undefined);
    expect(unhandled).toEqual([]);
  });
  it('reads a thenable then only once', async () => {
    /** Counts `then` reads. */
    let reads = 0;
    /** A thenable with a counting `then` getter. */
    const thenable = {
      get then() {
        reads++;
        return (resolve: (v: number) => void) => resolve(1);
      },
    };
    expect(await allDeep({ t: thenable })).toEqual({ t: 1 });
    expect(reads).toBe(1);
  });
  it('treats a then getter that throws as a rejection at that path', async () => {
    /** An object whose `then` getter throws. */
    const bad = Object.defineProperty({}, 'then', {
      get() {
        throw new Error('then getter');
      },
    });
    /** The `then` error from strict mode. */
    const error = await allDeep({ x: { bad } }).catch((e: unknown) => e);
    expect((error as Error).message).toBe('then getter');
    expect(failedPath(error)).toEqual(['x', 'bad']);
    /** The `then` error from settled mode. */
    const settled = await allSettledDeep({ bad });
    expect(settled.bad).toMatchObject({ status: 'rejected' });
  });
  it('treats a then that throws when called as a rejection', async () => {
    /** A thenable resolving to a value. */
    const thenable = {
      then() {
        throw new Error('then call');
      },
    };
    await expect(allDeep({ thenable })).rejects.toThrow('then call');
  });
});

describe('allSettledDeep', () => {
  it('replaces each promise with its settled result in place, at every depth', async () => {
    /** The rejection to keep. */
    const boom = new Error('boom');
    /** Settled results for mixed values. */
    const out = await allSettledDeep({
      a: Promise.resolve(1),
      b: [Promise.reject(boom), 2],
      c: { d: Promise.resolve({ e: Promise.reject(boom) }) },
    });
    expect(out).toEqual({
      a: { status: 'fulfilled', value: 1 },
      b: [{ status: 'rejected', reason: boom }, 2],
      c: { d: { status: 'fulfilled', value: { e: { status: 'rejected', reason: boom } } } },
    });
    await delay(10, undefined);
    expect(unhandled).toEqual([]);
  });
  it('still rejects on a cycle and on abort', async () => {
    /** A structure with a cycle behind a promise. */
    const viaPromise: Record<string, unknown> = {};
    viaPromise.p = Promise.resolve(viaPromise);
    await expect(allSettledDeep(viaPromise)).rejects.toThrow(TypeError);
    await expect(allSettledDeep({ a: 1 }, { signal: AbortSignal.abort(new Error('pre')) })).rejects.toThrow('pre');
  });
});
