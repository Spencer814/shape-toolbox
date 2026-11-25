import { defineValue, isObjectLike } from './internal.js';

/** Catches `allKeyed(new Map())` and `allKeyed(promise)` at compile time; neither has own keys to await. */
type NotKeyable<T> = T extends ReadonlyMap<unknown, unknown> | ReadonlySet<unknown> | PromiseLike<unknown> ? never : unknown;
/** The keys {@link allKeyed} keeps: own keys of an object, or index and extra keys of an array, never array methods. */
type KeyedKeys<T> = T extends readonly unknown[] ? Exclude<keyof T, keyof unknown[]> | Extract<keyof T, number> : keyof T;
/** The type {@link allKeyed} resolves to: each own property of `T` awaited, one level deep. */
export type Keyed<T> = { -readonly [K in keyof T as K extends KeyedKeys<T> ? K : never]: Awaited<T[K]> };
/** The type {@link allSettledKeyed} resolves to: each own property of `T` as a `PromiseSettledResult`. */
export type KeyedSettled<T> = { -readonly [K in keyof T as K extends KeyedKeys<T> ? K : never]: PromiseSettledResult<Awaited<T[K]>> };

/**
 * Marks a rejection as handled; the real handling happens in `combine`.
 *
 * @returns Nothing.
 */
const handled = (): void => undefined;

/**
 * Shared body of {@link allKeyed} and {@link allSettledKeyed}: reads each own enumerable property, then combines.
 *
 * @typeParam R - The element type `combine` resolves to.
 * @param name - The public function's name, for the error message.
 * @param obj - The caller's object.
 * @param combine - `Promise.all` or `Promise.allSettled`.
 * @returns A promise of a null-prototype object with the combined value under each key.
 */
function collect<R>(name: string, obj: unknown, combine: (values: readonly Promise<unknown>[]) => Promise<readonly R[]>): Promise<object> {
  // Each value gets a handler as it is read, as the proposal does, so a later getter that throws
  // rejects the result without leaving an earlier rejection unhandled.
  /** The enumerable own keys, in the order they were read. */
  const keys: PropertyKey[] = [];
  /** The value under each key, adopted as a promise, at the same position as its key. */
  const values: Promise<unknown>[] = [];
  try {
    if (!isObjectLike(obj)) throw new TypeError(`${name} expects an object`);
    for (const key of Reflect.ownKeys(obj)) {
      if (!Object.prototype.propertyIsEnumerable.call(obj, key)) continue;
      /** The property's value as a promise, so plain values and thenables are awaited the same way. */
      const value = Promise.resolve((obj as Record<PropertyKey, unknown>)[key]);
      value.catch(handled);
      keys.push(key);
      values.push(value);
    }
  } catch (error) {
    return Promise.reject(error);
  }
  return combine(values).then(results => {
    /** Null prototype, so keys such as `constructor` or `__proto__` read back as the caller's values. */
    const output = Object.create(null) as object;
    keys.forEach((key, index) => { defineValue(output, key, results[index]); });
    return output;
  });
}

/**
 * Awaits each own enumerable property of an object and returns the values under the same keys.
 *
 * @remarks
 * Follows the Stage 3 `Promise.allKeyed` proposal (Bluebird's `props`): string and symbol keys, key order taken from
 * the input rather than completion order, and a null-prototype result. It is shallow: promises nested deeper stay
 * promises (use {@link allDeep} for those). Each value gets its rejection handler as it is read, so a later getter that
 * throws never leaves an earlier rejection unhandled.
 *
 * @typeParam T - The input object. The result type is {@link Keyed}.
 * @param obj - Any object, including arrays and functions. Maps, Sets and promises are compile errors, since they have
 * no own keys to await.
 * @returns A promise of a null-prototype object with the same keys and awaited values.
 * @throws `TypeError`, as a rejection, when `obj` is not an object.
 * @throws The first rejection reason or getter error, unchanged, as a rejection.
 *
 * @example
 * ```ts
 * import { allKeyed } from 'shape-toolbox';
 *
 * const { user, rates } = await allKeyed({
 *   user: Promise.resolve({ name: 'Ada' }),
 *   rates: Promise.resolve([6.25, 6.5]),
 * });
 * console.log(user.name, rates.length);
 * ```
 */
export function allKeyed<const T extends object>(obj: T & NotKeyable<T>): Promise<Keyed<T>> {
  return collect('allKeyed', obj, values => Promise.all(values)) as Promise<Keyed<T>>;
}

/**
 * The settled form of {@link allKeyed}: each key holds `{ status, value }` or `{ status, reason }`.
 *
 * @remarks It never rejects because a value failed. A getter that throws still rejects the call.
 *
 * @typeParam T - The input object. The result type is {@link KeyedSettled}.
 * @param obj - Any object, including arrays and functions.
 * @returns A promise of a null-prototype object with a settled result under each key.
 * @throws `TypeError`, as a rejection, when `obj` is not an object; a getter's error, as a rejection.
 *
 * @example
 * ```ts
 * import { allSettledKeyed } from 'shape-toolbox';
 *
 * const panel = await allSettledKeyed({
 *   income: Promise.resolve(5200),
 *   assets: Promise.reject(new Error('no statements')),
 * });
 * console.log(panel.income.status, panel.assets.status); // 'fulfilled' 'rejected'
 * ```
 */
export function allSettledKeyed<const T extends object>(obj: T & NotKeyable<T>): Promise<KeyedSettled<T>> {
  return collect('allSettledKeyed', obj, values => Promise.allSettled(values)) as Promise<KeyedSettled<T>>;
}
