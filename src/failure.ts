import { isObjectLike, type Key } from './internal.js';

/**
 * A location inside a nested value: object keys and array indexes, outermost first, such as `['user', 'orders', 0]`.
 */
export type FailurePath = readonly Key[];

/** Error object to its first recorded location; a `WeakMap`, so tracked errors can still be garbage collected. */
const paths = new WeakMap<object, FailurePath | undefined>();

/**
 * Tells you where a rejection from {@link allDeep}, {@link allSettledDeep}, {@link applySpecAsync} or
 * {@link mapLimit} came from.
 *
 * @remarks
 * The error is never wrapped or changed, so `instanceof` checks and error identity keep working. The location is kept
 * in a `WeakMap` keyed by the error object. If the same error object fails in two places, the first location wins.
 * For {@link mapLimit} the location is `[index]`.
 *
 * @param error - The rejection reason you caught.
 * @returns A frozen array of keys and indexes, or `undefined` for abort reasons, cycles, primitive reasons such as a
 * rejected string, errors from other code, and locations under a symbol key.
 *
 * @example
 * ```ts
 * import { applySpecAsync, failedPath } from 'shape-toolbox';
 *
 * const load = applySpecAsync({ user: { orders: async () => { throw new Error('orders down'); } } });
 * try {
 *   await load();
 * } catch (error) {
 *   console.log(failedPath(error)); // ['user', 'orders']
 * }
 * ```
 */
export function failedPath(error: unknown): FailurePath | undefined {
  return isObjectLike(error) ? paths.get(error) : undefined;
}

/**
 * Remembers where `error` happened. The first location wins, and the stored path is frozen.
 *
 * @param error - The rejection reason; primitives can't be tracked and are ignored.
 * @param path - The location, or `undefined` for one that can't be written as string and number keys.
 */
export const recordFailure = (error: unknown, path: FailurePath | undefined): void => {
  if (isObjectLike(error) && !paths.has(error)) paths.set(error, path === undefined ? undefined : Object.freeze([...path]));
};
