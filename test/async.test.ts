import { describe, expect, it, vi } from 'vitest';
import { allDeep, allSettledDeep, allKeyed, allSettledKeyed, mapLimit } from '../src/async.js';
import { failedPath, recordFailure } from '../src/failure.js';

/**
 * Lets queued macrotasks run.
 *
 * @returns A promise that resolves on the next timer tick.
 */
const turn = async (): Promise<void> => { await new Promise(resolve => setTimeout(resolve, 0)); };
/**
 * A promise the test settles by hand.
 *
 * @typeParam T - The value type.
 * @returns The promise and its settlers.
 */
const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } => {
  /** Captured resolver. */
  let resolve!: (value: T) => void;
  /** Captured rejecter. */
  let reject!: (error: unknown) => void;
  /** The controllable promise. */
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

describe('deep resolution', () => {
  it('resolves nested promises and preserves ordinary leaf identity', async () => {
    class Box { field = Promise.resolve(1); }
    /** A class instance that must stay a leaf. */
    const box = new Box();
    /** A built-in that must stay a leaf. */
    const date = new Date();
    /** A collection that must stay a leaf. */
    const map = new Map();
    /**
     * A function, which is a leaf.
     *
     * @returns Always 1.
     */
    const fn = (): number => 1;
    /** Promises mixed with every leaf kind. */
    const input = { direct: 1, inner: [Promise.resolve({ n: Promise.resolve(2) })], box, date, map, fn, nil: null };
    /** The resolved copy. */
    const output = await allDeep(input);
    expect(output.inner).toEqual([{ n: 2 }]);
    expect(output.box).toBe(box);
    expect(output.date).toBe(date);
    expect(output.map).toBe(map);
    expect(output.fn).toBe(fn);
    expect(output.nil).toBeNull();
    expect(output).not.toBe(input);
    expect(input.inner[0]).toBeInstanceOf(Promise);
    expect(await allDeep(undefined)).toBeUndefined();
  });

  it('preserves symbols, null prototypes, dangerous own keys and input key order', async () => {
    /** A symbol key on a null-prototype object. */
    const symbol = Symbol('key');
    /** Settled by the test after resolution starts. */
    const first = deferred<number>();
    /** A null-prototype source with promises under string and symbol keys. */
    const source = Object.create(null) as Record<PropertyKey, unknown>;
    source.first = first.promise;
    source.second = Promise.resolve(2);
    source.__proto__ = Promise.resolve('ordinary property');
    source[symbol] = Promise.resolve(3);
    Object.defineProperty(source, 'hidden', { value: Promise.resolve(4) });
    /** Pending resolution of the source. */
    const result = allDeep(source);
    first.resolve(1);
    /** The resolved copy. */
    const output = await result;
    expect(Object.getPrototypeOf(output)).toBeNull();
    expect(Reflect.ownKeys(output)).toEqual(['first', 'second', '__proto__', symbol]);
    expect(output.__proto__).toBe('ordinary property');
    expect(output[symbol]).toBe(3);
    expect(output.hidden).toBeUndefined();
    expect({}.toString).toBe(Object.prototype.toString);
    /** An own enumerable `__proto__` property holding a promise. */
    const ordinary = Object.defineProperty({}, '__proto__', { value: Promise.resolve(5), enumerable: true });
    expect(Object.getPrototypeOf(await allDeep(ordinary))).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(await allDeep(ordinary), '__proto__')?.value).toBe(5);
  });

  it('preserves sparse arrays and ignores inherited members', async () => {
    /** A sparse array, whose holes must survive. */
    const input = new Array<unknown>(3);
    input[2] = Promise.resolve(9);
    /** The resolved sparse array. */
    const output = await allDeep(input);
    expect(output).toHaveLength(3);
    expect(0 in output).toBe(false);
    expect(output[2]).toBe(9);
    expect(await allDeep([])).toEqual([]);
    expect(await allDeep({})).toEqual({});
  });

  it('allows shared structures but rejects direct and promise-mediated cycles', async () => {
    /** One object reached by two paths, which is not a cycle. */
    const shared = { n: Promise.resolve(1) };
    expect(await allDeep({ a: shared, b: shared })).toEqual({ a: { n: 1 }, b: { n: 1 } });
    /** A direct self-reference. */
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await expect(allDeep(cyclic)).rejects.toThrow(TypeError);
    /** A cycle through an array. */
    const indirect: Record<string, unknown> = {};
    indirect.self = Promise.resolve(indirect);
    await expect(allDeep(indirect)).rejects.toThrow(TypeError);
    await expect(allSettledDeep(indirect)).rejects.toThrow(TypeError);
    /** A self-containing array. */
    const array: unknown[] = [];
    array.push(array);
    await expect(allDeep(array)).rejects.toThrow(TypeError);
  });

  it('assimilates thenables, including callable thenables', async () => {
    /** A minimal thenable. */
    const thenable = { then(resolve: (value: number) => void): void { resolve(3); } };
    /** A function that is also thenable. */
    const fn = Object.assign(() => 1, { then(resolve: (value: number) => void): void { resolve(4); } });
    expect(await allDeep({ thenable, fn })).toEqual({ thenable: 3, fn: 4 });
    expect(await allDeep({ then: 3 })).toEqual({ then: 3 });
  });

  it('reads thenable accessors once and preserves the receiver and asynchronous invocation', async () => {
    for (const settled of [false, true]) {
      /** Counts `then` reads. */
      let reads = 0;
      /** Set once the thenable is called. */
      let called = false;
      /** An object with a counting `then` getter. */
      const source = {
        get then(): (resolve: (value: number) => void) => void {
          reads++;
          if (reads > 1) throw new Error('then read twice');
          return function (this: unknown, resolve: (value: number) => void): void {
            expect(this).toBe(source);
            called = true;
            resolve(42);
          };
        },
      };
      /** The strict or settled resolution under test. */
      const result = settled ? allSettledDeep(source) : allDeep(source);
      expect(called).toBe(false);
      expect(await result).toEqual(settled ? { status: 'fulfilled', value: 42 } : 42);
      expect(reads).toBe(1);
    }
  });

  it('observes sibling rejections after a cycle, getter error or earlier rejection', async () => {
    /** A structure with a cycle. */
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await expect(allDeep({ cycle: cyclic, bad: Promise.reject(new Error('sibling')) })).rejects.toThrow();
    /** Thrown by a getter. */
    const error = new Error('getter');
    /** A throwing getter beside a rejected sibling, which must still be handled. */
    const input = { get first(): never { throw error; }, second: Promise.reject(new Error('second')) };
    await expect(allDeep(input)).rejects.toBe(error);
    /** Thrown by a `then` getter. */
    const thenError = new Error('then getter');
    /** A value whose `then` getter throws. */
    const badThen = { get then(): never { throw thenError; } };
    await expect(allDeep(badThen)).rejects.toBe(thenError);
    await expect(allSettledDeep(badThen)).resolves.toEqual({ status: 'rejected', reason: thenError });
    /** The rejection expected first. */
    const first = new Error('first');
    await expect(allDeep([Promise.reject(first), Promise.reject(new Error('second'))])).rejects.toBe(first);
    await turn();
  });

  it('aborts immediately with the original reason and observes later rejections', async () => {
    /** The abort reason. */
    const reason = new Error('stop');
    /** A promise that resolves after the abort. */
    const later = deferred<number>();
    /** Its signal cancels the resolution. */
    const controller = new AbortController();
    /** Resolution cancelled mid-flight. */
    const pending = allDeep({ later: later.promise }, { signal: controller.signal });
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    later.reject(new Error('later'));
    await turn();
    await expect(allDeep(Promise.reject(new Error('observed')), { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
    await expect(allDeep(1, { signal: new AbortController().signal })).resolves.toBe(1);
    /** Aborted alongside a rejection. */
    const rejectController = new AbortController();
    /** The rejection that races the abort. */
    const failure = new Error('failure');
    await expect(allDeep(Promise.reject(failure), { signal: rejectController.signal })).rejects.toBe(failure);
  });
});

describe('deep settlement', () => {
  it('settles promise boundaries without wrapping ordinary leaves', async () => {
    /** The rejection recorded by settled mode. */
    const error = new Error('bad');
    /** Plain values, promises and a rejection together. */
    const input = { plain: 1, nested: [Promise.resolve(2), Promise.reject(error)], wrapped: Promise.resolve({ inner: Promise.resolve(3) }) };
    expect(await allSettledDeep(input)).toEqual({
      plain: 1,
      nested: [{ status: 'fulfilled', value: 2 }, { status: 'rejected', reason: error }],
      wrapped: { status: 'fulfilled', value: { inner: { status: 'fulfilled', value: 3 } } },
    });
    expect(await allSettledDeep(Promise.reject(null))).toEqual({ status: 'rejected', reason: null });
    /** A non-error rejection reason, passed through as is. */
    const reason = {};
    await expect(allSettledDeep({}, { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
  });
});

describe('keyed proposal ponyfills', () => {
  it('handles own enumerable string and symbol keys in input order with a null prototype', async () => {
    /** A symbol key to keep. */
    const symbol = Symbol('key');
    /** Resolves after `allKeyed` has read the keys. */
    const slow = deferred<number>();
    /** Inherited and own keys, to check only own enumerable ones are read. */
    const input = Object.assign(Object.create({ inherited: 9 }) as Record<PropertyKey, unknown>, { a: slow.promise, b: Promise.resolve(2) });
    input[symbol] = Promise.resolve(3);
    Object.defineProperty(input, 'hidden', { value: 4 });
    Object.defineProperty(input, '__proto__', { value: Promise.resolve(5), enumerable: true });
    /** The keyed resolution under test. */
    const pending = allKeyed(input);
    slow.resolve(1);
    /** Its result. */
    const output = await pending;
    expect(Object.getPrototypeOf(output)).toBeNull();
    expect(Reflect.ownKeys(output)).toEqual(['a', 'b', '__proto__', symbol]);
    expect({ ...output }).toEqual({ a: 1, b: 2, ['__proto__']: 5, [symbol]: 3 });
    expect(output.__proto__).toBe(5);
    expect(output.inherited).toBeUndefined();
    expect(output.hidden).toBeUndefined();
  });

  it('does not resolve nested values and accepts arrays and callable objects', async () => {
    /** A promise nested one level down, which must stay a promise. */
    const inner = { n: Promise.resolve(1) };
    expect((await allKeyed({ inner })).inner).toBe(inner);
    /** An array input. */
    const keyedArray = await allKeyed([Promise.resolve(2)]);
    expect({ ...keyedArray }).toEqual({ 0: 2 });
    expect(Object.getPrototypeOf(keyedArray)).toBeNull();
    expect(Reflect.ownKeys(keyedArray)).toEqual(['0']);
    expect('map' in keyedArray).toBe(false);
    expect('length' in keyedArray).toBe(false);
    /** A settled array input. */
    const settledArray = await allSettledKeyed([Promise.resolve(2)]);
    expect(Object.getPrototypeOf(settledArray)).toBeNull();
    expect(Reflect.ownKeys(settledArray)).toEqual(['0']);
    expect(settledArray[0]).toEqual({ status: 'fulfilled', value: 2 });
    expect('map' in settledArray).toBe(false);
    expect('length' in settledArray).toBe(false);
    /** A symbol key on an array. */
    const extra = Symbol('extra');
    /** An array with extra string and symbol keys. */
    const extended = Object.assign([Promise.resolve(2)], { label: Promise.resolve('label'), [extra]: Promise.resolve(true) });
    /** The keyed result keeps the extras. */
    const extendedOutput = await allKeyed(extended);
    expect(extendedOutput[0]).toBe(2);
    expect(extendedOutput.label).toBe('label');
    expect(extendedOutput[extra]).toBe(true);
    /** The settled result keeps the extras. */
    const extendedSettled = await allSettledKeyed(extended);
    expect(extendedSettled.label).toEqual({ status: 'fulfilled', value: 'label' });
    expect(extendedSettled[extra]).toEqual({ status: 'fulfilled', value: true });
    /** A function input, which is keyable. */
    const fn = Object.assign(() => 0, { n: Promise.resolve(3) });
    expect({ ...await allKeyed(fn) }).toEqual({ n: 3 });
    expect(await allKeyed({})).toEqual(Object.create(null));
    expect(await allSettledKeyed({})).toEqual(Object.create(null));
  });

  it('rejects primitive inputs asynchronously', async () => {
    for (const value of [null, undefined, 1, 'x', true, Symbol(), 1n]) {
      await expect(allKeyed(value as never)).rejects.toThrow(TypeError);
      await expect(allSettledKeyed(value as never)).rejects.toThrow(TypeError);
    }
  });

  it('reads getters in order, handles abrupt completion, and observes prior rejections', async () => {
    /** Thrown by a getter. */
    const error = new Error('getter');
    /** Getters that ran. */
    const seen: string[] = [];
    /** Getters that record reads, with one throwing. */
    const input = {
      get first(): Promise<never> { seen.push('first'); return Promise.reject(new Error('first')); },
      get second(): never { seen.push('second'); throw error; },
      get third(): number { seen.push('third'); return 3; },
    };
    await expect(allKeyed(input)).rejects.toBe(error);
    expect(seen).toEqual(['first', 'second']);
    await expect(allSettledKeyed(input)).rejects.toBe(error);
    await turn();
  });

  it('follows live descriptors while traversing the initial own-key snapshot', async () => {
    /** An object filled with many keys. */
    const input: Record<string, unknown> = {};
    Object.defineProperty(input, 'first', { enumerable: true, get: () => { delete input.second; input.third = 3; return 1; } });
    input.second = 2;
    expect({ ...await allKeyed(input) }).toEqual({ first: 1 });
  });

  it('preserves rejection identity and settles each property independently', async () => {
    /** The rejection to settle. */
    const error = new Error('original');
    await expect(allKeyed({ a: Promise.reject(error), b: Promise.reject(2) })).rejects.toBe(error);
    /** Settled results by key. */
    const output = await allSettledKeyed({ a: Promise.resolve(1), b: Promise.reject(error), c: null });
    expect(Object.getPrototypeOf(output)).toBeNull();
    expect(output.a).toEqual({ status: 'fulfilled', value: 1 });
    expect(output.b).toEqual({ status: 'rejected', reason: error });
    expect(output.c).toEqual({ status: 'fulfilled', value: null });
    await turn();
  });

  it('does not delegate to native keyed methods', async () => {
    /** Fails if the native `Promise.allKeyed` is called. */
    const fake = vi.fn(() => { throw new Error('must not call native'); });
    /** The native methods that may exist on `Promise`. */
    const names = ['allKeyed', 'allSettledKeyed'] as const;
    /** Their original descriptors, restored after the test. */
    const originals = names.map(name => Object.getOwnPropertyDescriptor(Promise, name));
    try {
      for (const name of names) Object.defineProperty(Promise, name, { configurable: true, value: fake });
      expect({ ...await allKeyed({ n: 1 }) }).toEqual({ n: 1 });
      expect((await allSettledKeyed({ n: 1 })).n).toEqual({ status: 'fulfilled', value: 1 });
      expect(fake).not.toHaveBeenCalled();
    } finally {
      names.forEach((name, index) => {
        /** The original descriptor, if there was one. */
        const descriptor = originals[index];
        if (descriptor) Object.defineProperty(Promise, name, descriptor);
        else Reflect.deleteProperty(Promise, name);
      });
    }
  });
});

describe('mapLimit', () => {
  it('limits work, preserves result order and uses one signal', async () => {
    /** Calls in flight. */
    let active = 0;
    /** The most calls at once. */
    let maximum = 0;
    /** Signals passed to calls. */
    const signals = new Set<AbortSignal>();
    /** Results in input order. */
    const output = await mapLimit([3, 1, 2, 0], async (value, index, signal) => {
      active++;
      maximum = Math.max(maximum, active);
      signals.add(signal);
      await turn();
      active--;
      return [value, index];
    }, { concurrency: 2 });
    expect(output).toEqual([[3, 0], [1, 1], [2, 2], [0, 3]]);
    expect(maximum).toBe(2);
    expect(signals.size).toBe(1);
    expect([...signals][0]?.aborted).toBe(false);
    expect(await mapLimit([], () => 0)).toEqual([]);
    expect(await mapLimit([1], value => value)).toEqual([1]);
  });

  it('snapshots input length and values before mappers can mutate the source array', async () => {
    /** Shrunk while mapping. */
    const shrinking = [1, 2];
    expect(await mapLimit(shrinking, value => { shrinking.length = 0; return value; }, { concurrency: 1 })).toEqual([1, 2]);
    /** Grown while mapping. */
    const growing = [1, 2];
    expect(await mapLimit(growing, value => { growing.push(3); return value; }, { concurrency: 1 })).toEqual([1, 2]);
    /** Elements replaced while mapping. */
    const replacing = [1, 2];
    expect(await mapLimit(replacing, value => { replacing[1] = 99; return value; }, { concurrency: 1 })).toEqual([1, 2]);
  });

  it('rejects invalid concurrency without invoking the mapper', async () => {
    /** A mapper that should never run. */
    const fn = vi.fn();
    for (const concurrency of [0, -1, 1.5, NaN, -Infinity]) {
      await expect(mapLimit([1], fn, { concurrency })).rejects.toThrow(RangeError);
    }
    expect(fn).not.toHaveBeenCalled();
  });

  it('fails fast, stops queued work, and retains the original error and failure index', async () => {
    /** The failure that stops the map. */
    const error = new Error('first');
    /** A mapper that throws immediately. */
    const fn = vi.fn(() => { throw error; });
    await expect(mapLimit([0, 1, 2], fn, { concurrency: 1 })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(failedPath(error)).toEqual([0]);
    /** A call still running when the first fails. */
    const sibling = deferred<number>();
    /** The signal that call received. */
    let signal: AbortSignal | undefined;
    await expect(mapLimit([0, 1, 2], (value, _index, passedSignal) => {
      signal = passedSignal;
      if (value === 0) return Promise.reject(error);
      if (value === 1) return sibling.promise;
      return Promise.reject(new Error('third'));
    })).rejects.toBe(error);
    expect(signal?.aborted).toBe(true);
    sibling.reject(new Error('second'));
    await turn();
  });

  it('stops scheduled callbacks when aborted before their microtasks run', async () => {
    /** A mapper that should not run. */
    const fn = vi.fn();
    /** Aborted before the call. */
    const controller = new AbortController();
    /** The abort reason. */
    const reason = new Error('abort');
    /** The mapping that rejects immediately. */
    const pending = mapLimit([1, 2], fn, { signal: controller.signal });
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects already-aborted calls and notifies running mappers', async () => {
    /** A non-error reason. */
    const reason = {};
    /** A mapper that records calls. */
    const fn = vi.fn();
    await expect(mapLimit([1], fn, { signal: AbortSignal.abort(reason) })).rejects.toBe(reason);
    expect(fn).not.toHaveBeenCalled();
    /** Aborted mid-map. */
    const controller = new AbortController();
    /** The running call's signal. */
    let running: AbortSignal | undefined;
    /** Resolved after the abort. */
    const later = deferred<number>();
    /** The mapping cancelled mid-flight. */
    const pending = mapLimit([1, 2], (_item, _index, signal) => { running = signal; return later.promise; }, { signal: controller.signal, concurrency: 1 });
    await turn();
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(running?.aborted).toBe(true);
    expect(running?.reason).toBe(reason);
    later.reject(new Error('after abort'));
    await turn();
  });
});

describe('failure provenance', () => {
  it('records frozen paths without replacing or modifying rejection objects', () => {
    /** A frozen error, which can still be located. */
    const error = Object.freeze(new Error('frozen'));
    /** The path expected for it. */
    const path = ['nested', 1];
    recordFailure(error, path);
    path.push('later');
    expect(failedPath(error)).toEqual(['nested', 1]);
    expect(Object.isFrozen(failedPath(error))).toBe(true);
    recordFailure(error, ['other']);
    expect(failedPath(error)).toEqual(['nested', 1]);
    expect(failedPath({})).toBeUndefined();
    for (const value of [null, undefined, 'x', 1, true, Symbol(), 1n]) {
      recordFailure(value, ['ignored']);
      expect(failedPath(value)).toBeUndefined();
    }
    /**
     * A leaf that returns nothing.
     */
    const fn = (): void => {};
    recordFailure(fn, []);
    expect(failedPath(fn)).toEqual([]);
  });
});


describe('deep failure provenance regressions', () => {
  it('records nested numeric paths and preserves rejected object identity in both modes', async () => {
    /** A deep rejection to locate. */
    const failure = Object.freeze(new Error('deep leaf'));
    await expect(allDeep({ nested: [Promise.reject(failure)] })).rejects.toBe(failure);
    expect(failedPath(failure)).toEqual(['nested', 0]);
    expect(Object.isFrozen(failedPath(failure))).toBe(true);
    /** A rejection located in settled mode. */
    const settledFailure = new Error('settled leaf');
    expect(await allSettledDeep({ nested: [Promise.reject(settledFailure)] })).toEqual({ nested: [{ status: 'rejected', reason: settledFailure }] });
    expect(failedPath(settledFailure)).toEqual(['nested', 0]);
    /** A rejection at the root. */
    const rootFailure = new Error('root');
    await expect(allDeep(Promise.reject(rootFailure))).rejects.toBe(rootFailure);
    expect(failedPath(rootFailure)).toEqual([]);
  });

  it('records getter failures without re-reading them or leaving siblings unobserved', async () => {
    /** Thrown by a getter. */
    const failure = new Error('property getter');
    /** A throwing getter beside a rejected sibling. */
    const input = { nested: { get bad(): never { throw failure; }, later: Promise.reject('observed') } };
    await expect(allDeep(input)).rejects.toBe(failure);
    expect(failedPath(failure)).toEqual(['nested', 'bad']);
    /** Thrown by a `then` getter. */
    const thenFailure = new Error('then getter');
    /** A value whose `then` getter throws. */
    const bad = { get then(): never { throw thenFailure; } };
    expect(await allSettledDeep({ bad })).toEqual({ bad: { status: 'rejected', reason: thenFailure } });
    expect(failedPath(thenFailure)).toEqual(['bad']);
    await turn();
  });

  it('leaves unrepresentable symbol paths absent instead of recording a misleading prefix', async () => {
    /** A symbol key, which paths cannot express. */
    const key = Symbol('private');
    /** A rejection under a symbol key. */
    const failure = new Error('symbol');
    await expect(allDeep({ outer: { [key]: { deeper: Promise.reject(failure) } } })).rejects.toBe(failure);
    expect(failedPath(failure)).toBeUndefined();
    /** A getter error under a symbol key. */
    const getterFailure = new Error('symbol getter');
    /** A throwing getter nested under a symbol key. */
    const input = { outer: { [key]: { get bad(): never { throw getterFailure; } } } };
    await expect(allDeep(input)).rejects.toBe(getterFailure);
    expect(failedPath(getterFailure)).toBeUndefined();
    /** A `then` error under a symbol key. */
    const thenFailure = new Error('symbol then getter');
    /** A value under a symbol key whose `then` throws. */
    const badThen = { get then(): never { throw thenFailure; } };
    expect(await allSettledDeep({ [key]: badThen })).toEqual({ [key]: { status: 'rejected', reason: thenFailure } });
    expect(failedPath(thenFailure)).toBeUndefined();
  });

  it('settles assimilated promise chains only once', async () => {
    /** A promise that resolves to another promise. */
    const promise = new Promise<Promise<number>>(resolve => resolve(Promise.resolve(1)));
    expect(await allSettledDeep(promise)).toEqual({ status: 'fulfilled', value: 1 });
  });
});


it('retains the first unknown symbol provenance when a later leaf reuses its error', async () => {
  /** One error rejected from two places. */
  const failure = new Error('shared');
  /** Settled after the first rejection. */
  const later = deferred<never>();
  /** A symbol key for the first location. */
  const key = Symbol('first');
  await expect(allDeep({ named: later.promise, [key]: Promise.reject(failure) })).rejects.toBe(failure);
  expect(failedPath(failure)).toBeUndefined();
  later.reject(failure);
  await turn();
  expect(failedPath(failure)).toBeUndefined();
});
