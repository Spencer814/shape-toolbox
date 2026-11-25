import { describe, expect, it } from 'vitest';
import {
  allDeep,
  allKeyed,
  allSettledDeep,
  allSettledKeyed,
  applySpecAsync,
  failedPath,
  mapLimit,
} from '../src/index.js';

describe('deep resolution', () => {
  it('resolves promise leaves while preserving arrays and plain-object prototypes', async () => {
    /** A null-prototype object holding promises, to check the prototype and keys survive. */
    const source = Object.assign(Object.create(null) as { count: Promise<number> }, {
      count: Promise.resolve(3),
      nested: [Promise.resolve('ok')],
    });

    /** The resolved copy under test. */
    const result = await allDeep(source);

    expect(result).toEqual({ count: 3, nested: ['ok'] });
    expect(Object.getPrototypeOf(result)).toBeNull();
  });

  it('leaves class instances and other non-plain values untouched', async () => {
    class Model {
      value = Promise.resolve(4);
    }
    /** A class instance, which must come back untouched. */
    const model = new Model();
    /** A built-in instance, which must come back untouched. */
    const date = new Date();
    /** The resolved result holding both instances. */
    const result = await allDeep({ model, date });
    expect(result.model).toBe(model);
    expect(result.date).toBe(date);
    expect(result.model.value).toBeInstanceOf(Promise);
  });

  it('rejects direct and promise-mediated cycles', async () => {
    /** A direct self-reference. */
    const direct: { self?: unknown } = {};
    direct.self = direct;
    await expect(allDeep(direct)).rejects.toThrow('circular');

    /** A cycle that only appears after a promise resolves. */
    const throughPromise: { child?: unknown } = {};
    throughPromise.child = Promise.resolve(throughPromise);
    await expect(allDeep(throughPromise)).rejects.toThrow('circular');
  });

  it('settles promise nodes at any depth and retains rejection identity', async () => {
    /** The rejection every settled slot should carry. */
    const failure = new Error('leaf');
    /** The settled result under test. */
    const result = await allSettledDeep({
      list: [Promise.resolve(2), Promise.reject(failure)],
      nested: { value: Promise.resolve({ more: Promise.resolve('ok') }) },
    });

    expect(result).toEqual({
      list: [
        { status: 'fulfilled', value: 2 },
        { status: 'rejected', reason: failure },
      ],
      nested: {
        value: {
          status: 'fulfilled',
          value: { more: { status: 'fulfilled', value: 'ok' } },
        },
      },
    });
    expect(failedPath(failure)).toEqual(['list', 1]);
  });

  it('assimilates thenable accessors once and preserves their receiver', async () => {
    /** Counts `then` reads; resolution must read it once. */
    let reads = 0;
    /** Set when the thenable's `then` runs. */
    let called = false;
    /** A thenable whose `then` getter counts its reads. */
    const thenable = {
      get then(): (resolve: (value: number) => void) => void {
        reads++;
        if (reads > 1) throw new Error('then getter read more than once');
        return function (this: unknown, resolve: (value: number) => void): void {
          expect(this).toBe(thenable);
          called = true;
          resolve(5);
        };
      },
    };

    /** Pending resolution of the thenable, held to check asynchrony. */
    const pending = allDeep(thenable);
    expect(called).toBe(false);
    await expect(pending).resolves.toBe(5);
    expect(reads).toBe(1);

    /** Thrown by the `then` getter. */
    const error = new Error('then accessor');
    /** A value whose `then` getter throws. */
    const rejected = { get then(): never { throw error; } };
    await expect(allSettledDeep(rejected)).resolves.toEqual({ status: 'rejected', reason: error });
  });

  it('preserves ordinary rejection identity and records its path with a signal', async () => {
    /** The reason used to reject the leaf. */
    const failure = new Error('request failed');
    /** Aborted before the call starts. */
    const controller = new AbortController();
    await expect(allDeep({ nested: Promise.reject(failure) }, { signal: controller.signal }))
      .rejects.toBe(failure);
    expect(failedPath(failure)).toEqual(['nested']);
  });

  it('rejects cancellation with the signal reason', async () => {
    /** Aborted while the call is in flight. */
    const controller = new AbortController();
    /** The abort reason the result must reject with. */
    const reason = new Error('stop');
    controller.abort(reason);
    await expect(allDeep(Promise.resolve(1), { signal: controller.signal })).rejects.toBe(reason);
  });

  it('resolves pending leaves while an active signal remains open', async () => {
    /** Aborted to reject with the signal's reason. */
    const controller = new AbortController();
    await expect(allDeep({ value: Promise.resolve(1) }, { signal: controller.signal }))
      .resolves.toEqual({ value: 1 });
    expect(controller.signal.aborted).toBe(false);
  });

  it('interrupts a pending deep promise on cancellation', async () => {
    /** Its signal is aborted by the test. */
    const controller = new AbortController();
    /** The deadline reason expected back. */
    const reason = new Error('deadline');
    /** Captures the pending promise's reject so the test can settle it late. */
    let rejectPending: ((reason: unknown) => void) | undefined;
    /** A promise that stays pending until the test rejects it. */
    const pending = new Promise<number>((_resolve, reject) => {
      rejectPending = reject;
    });
    /** Resolution that should be abandoned by the abort. */
    const result = allDeep({ nested: pending }, { signal: controller.signal });
    controller.abort(reason);
    await expect(result).rejects.toBe(reason);
    rejectPending?.(new Error('late rejection'));
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
});

describe('keyed resolution', () => {
  it('resolves all enumerable string and symbol keys', async () => {
    /** A symbol key that must be kept. */
    const symbol = Symbol('value');
    /** An object with an own `__proto__` key, which only `JSON.parse` can create. */
    const source = JSON.parse('{"__proto__":"safe"}') as Record<PropertyKey, unknown>;
    source.value = Promise.resolve(1);
    source[symbol] = Promise.resolve('x');
    /** The keyed result under test. */
    const result = await allKeyed(source);
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(result.value).toBe(1);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(result['__proto__']).toBe('safe');
    expect(result[symbol]).toBe('x');
  });

  it('returns arrays as null-prototype keyed records', async () => {
    /** An array input keeps only its index keys. */
    const result = await allKeyed([Promise.resolve(2)] as const);
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect({ ...result }).toEqual({ 0: 2 });
    expect('map' in result).toBe(false);
    expect('length' in result).toBe(false);
  });

  it('attaches rejection handlers before reading later getters', async () => {
    /** Thrown by a getter partway through the keys. */
    const getterError = new Error('getter');
    /** The getters that ran, in order. */
    const visited: string[] = [];
    /** An object whose getters record reads and throw midway. */
    const source = {
      get first(): Promise<never> {
        visited.push('first');
        return Promise.reject(new Error('earlier rejection'));
      },
      get second(): never {
        visited.push('second');
        throw getterError;
      },
      get third(): number {
        visited.push('third');
        return 3;
      },
    };

    await expect(allKeyed(source)).rejects.toBe(getterError);
    expect(visited).toEqual(['first', 'second']);
    await new Promise((resolve) => setTimeout(resolve, 5));
  });

  it('returns a settled result for each keyed promise', async () => {
    /** A rejection to record in the settled result. */
    const failure = new Error('bad');
    /** The settled keyed result. */
    const result = await allSettledKeyed({
      ok: Promise.resolve(1),
      fail: Promise.reject(failure),
    });
    expect(result.ok).toEqual({ status: 'fulfilled', value: 1 });
    expect(result.fail).toEqual({ status: 'rejected', reason: failure });
  });

  it('handles empty keyed records and fail-fast keyed rejections', async () => {
    /** The result for an empty object. */
    const empty = await allKeyed({});
    expect(Object.getPrototypeOf(empty)).toBeNull();
    expect(Object.keys(empty)).toEqual([]);
    expect(await allSettledKeyed({})).toEqual(Object.create(null));

    /** The failure from the first key. */
    const failure = new Error('first key');
    await expect(allKeyed({
      first: Promise.reject(failure),
      later: Promise.reject(new Error('later key')),
    })).rejects.toBe(failure);
    await new Promise((resolve) => setTimeout(resolve, 5));
  });

  it('settles array keys without exposing array prototype members', async () => {
    /** The settled result for an array input. */
    const result = await allSettledKeyed([Promise.resolve(2)] as const);
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(result[0]).toEqual({ status: 'fulfilled', value: 2 });
    expect('length' in result).toBe(false);
  });
});

describe('mapLimit', () => {
  it('enforces a shared concurrency ceiling and preserves input order', async () => {
    /** How many mapper calls are running. */
    let active = 0;
    /** The most calls running at once. */
    let peak = 0;
    /** Results, expected in input order. */
    const result = await mapLimit([3, 1, 2, 0], async (value) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, value));
      active--;
      return value * 2;
    }, { concurrency: 2 });
    expect(result).toEqual([6, 2, 4, 0]);
    expect(peak).toBe(2);
  });

  it('stops scheduling on first rejection and handles later failures', async () => {
    /** The first failure, which must win. */
    const failure = new Error('first');
    /** How many items have started. */
    let started = 0;
    /** The mapping that should fail fast. */
    const result = mapLimit([0, 1, 2], async (index) => {
      started++;
      if (index === 0) throw failure;
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error(`later-${index}`);
    }, { concurrency: 1 });
    await expect(result).rejects.toBe(failure);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started).toBe(1);
  });

  it('handles concurrent rejections after fail-fast settlement', async () => {
    /** The failure that aborts the others. */
    const failure = new Error('first');
    /** The signals handed to each call. */
    const signals = new Set<AbortSignal>();
    /** A mapping whose first call fails. */
    const result = mapLimit([0, 1, 2], async (index, _position, signal) => {
      signals.add(signal);
      await new Promise((resolve) => setTimeout(resolve, index === 0 ? 0 : 5));
      throw index === 0 ? failure : new Error(`later-${index}`);
    }, { concurrency: 3 });
    await expect(result).rejects.toBe(failure);
    expect([...signals][0]?.aborted).toBe(true);
    expect(signals.size).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it('rejects even when a task rejects with undefined', async () => {
    await expect(mapLimit([1], () => Promise.reject(undefined))).rejects.toBeUndefined();
  });

  it('converts synchronous mapper throws to promise rejections', async () => {
    /** Thrown synchronously by the mapper. */
    const failure = new Error('sync');
    await expect(mapLimit([1], () => { throw failure; })).rejects.toBe(failure);
  });

  it('stops queued work on abort and passes the signal to running work', async () => {
    /** The caller's controller. */
    const controller = new AbortController();
    /** The caller's abort reason. */
    const reason = new Error('cancelled');
    /** How many items started before the abort. */
    let started = 0;
    /** The signal seen by a running call. */
    let runningSignal: AbortSignal | undefined;
    /** The mapping to be cancelled. */
    const work = mapLimit([1, 2, 3], async (_item, _index, signal) => {
      started++;
      runningSignal = signal;
      expect(signal).not.toBe(controller.signal);
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 1;
    }, { concurrency: 1, signal: controller.signal });
    await Promise.resolve();
    expect(started).toBe(1);
    controller.abort(reason);
    await expect(work).rejects.toBe(reason);
    expect(runningSignal?.aborted).toBe(true);
    expect(runningSignal?.reason).toBe(reason);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(started).toBe(1);
  });

  it('snapshots array items before callbacks mutate the input', async () => {
    /** The source array, changed during mapping. */
    const items = [1, 2];
    /** Results from the snapshot of the array. */
    const result = await mapLimit(items, (item) => {
      items[1] = 9;
      items.push(3);
      return item;
    }, { concurrency: 1 });
    expect(result).toEqual([1, 2]);
  });

  it('validates concurrency', async () => {
    await expect(mapLimit([1], (value) => value, { concurrency: 0 })).rejects.toThrow(RangeError);
    await expect(mapLimit([1], (value) => value, { concurrency: Number.NaN })).rejects.toThrow(RangeError);
  });
});

describe('applySpecAsync', () => {
  it('defers execution, preserves nested shape, and shares one concurrency budget', async () => {
    /** Leaves currently in flight. */
    let active = 0;
    /** The most leaves in flight at once. */
    let peak = 0;
    /**
     * A leaf that records concurrency.
     *
     * @param id - The id passed through.
     * @returns The same id.
     */
    const leaf = async (id: number) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return id;
    };
    /** A nested spec run under one limit. */
    const load = applySpecAsync({ profile: leaf, orders: [leaf, { recent: leaf }] }, { concurrency: 2 });
    expect(active).toBe(0);
    expect(await load(4)).toEqual({ profile: 4, orders: [4, { recent: 4 }] });
    expect(peak).toBe(2);
  });

  it('reports the original error and its nested path', async () => {
    /** The failure from a nested leaf. */
    const failure = new Error('fetch failed');
    /** A runner whose nested leaf rejects. */
    const load = applySpecAsync({ nested: { leaf: () => Promise.reject(failure) } });
    await expect(load()).rejects.toBe(failure);
    expect(failedPath(failure)).toEqual(['nested', 'leaf']);
    expect(Object.isFrozen(failedPath(failure))).toBe(true);
    expect(failedPath('primitive')).toBeUndefined();
  });

  it('settles leaf outcomes independently', async () => {
    /** Thrown synchronously by a leaf. */
    const failure = new Error('fetch failed');
    /** A runner with a leaf that throws. */
    const load = applySpecAsync({
      good: () => Promise.resolve(1),
      bad: () => Promise.reject(failure),
    }, { mode: 'settled' });
    expect(await load()).toEqual({
      good: { status: 'fulfilled', value: 1 },
      bad: { status: 'rejected', reason: failure },
    });
    expect(failedPath(failure)).toEqual(['bad']);
  });

  it('keeps the first path when an error object is reused', async () => {
    /** One error object thrown by two leaves. */
    const failure = new Error('shared rejection');
    /** A runner whose two leaves share an error. */
    const run = applySpecAsync({
      first: () => Promise.reject(failure),
      second: () => Promise.reject(failure),
    }, { mode: 'settled', concurrency: 1 });
    await run();
    expect(failedPath(failure)).toEqual(['first']);
  });

  it('forwards arguments to all leaves and rejects invalid runtime leaves', async () => {
    /** A runner with an optional, defaulted parameter. */
    const load = applySpecAsync({ first: (id: number, tag = 'x') => `${tag}:${id}` });
    expect(await load(7, 'a')).toEqual({ first: 'a:7' });

    expect(() => applySpecAsync({ bad: 2 } as never)).toThrow('not a function');
  });

  it('keeps arrays and empty nested shapes in specifications', async () => {
    /** A runner built from an array spec. */
    const run = applySpecAsync([() => Promise.resolve(1), { nested: () => 2 }]);
    expect(await run()).toEqual([1, { nested: 2 }]);
    expect(await applySpecAsync({ emptyObject: {}, emptyArray: [] })()).toEqual({
      emptyObject: {},
      emptyArray: [],
    });
  });

  it('rejects symbol-keyed specifications rather than dropping leaves', () => {
    /** A symbol key, which a spec must refuse. */
    const key = Symbol('hidden leaf');
    expect(() => applySpecAsync({ [key]: () => 1 } as never)).toThrow('must be strings or array indices');
    expect(() => applySpecAsync(new Date() as never)).toThrow('expects an object or array spec');
  });

  it('preserves dangerous keys and rejects cyclic specs at definition', async () => {
    /** A spec with an own `__proto__` key. */
    const spec = JSON.parse('{"__proto__":null}') as Record<string, unknown>;
    Object.defineProperty(spec, '__proto__', {
      value: () => 1,
      enumerable: true,
    });
    /** The result keeps `__proto__` as an own key. */
    const result = await applySpecAsync(spec as never)();
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect((result as Record<string, unknown>)['__proto__']).toBe(1);

    /** A spec that contains itself. */
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => applySpecAsync(cyclic as never)).toThrow('circular');
  });
});
