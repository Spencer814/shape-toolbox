import { recordFailure } from './failure.js';
import { onAbort } from './internal.js';
import type { LimitOptions } from './types.js';

/**
 * Maps an array through an async function with at most `concurrency` calls in flight, keeping input order.
 *
 * @remarks
 * `items` is copied first, so a mapper that changes the source array doesn't change what runs. It fails fast: the
 * first error rejects the result, queued items never start, and the `signal` passed to running calls aborts with that
 * error. Running calls stop only if they listen to it. For async iterables, backpressure or collecting every error,
 * use a dedicated pool such as `p-map`.
 *
 * @typeParam T - The item type.
 * @typeParam R - What `fn` returns, possibly a promise.
 * @param items - The array to map.
 * @param fn - Called as `fn(item, index, signal)`. `signal` aborts when another call fails or `options.signal` aborts.
 * @param options - Optional {@link LimitOptions}: `concurrency` and `signal`.
 * @returns A promise of the results in input order.
 * @throws `RangeError`, as a rejection, when `concurrency` is not a positive integer or `Infinity`.
 * @throws The first error a call throws, unchanged, as a rejection. {@link failedPath} gives `[index]`.
 * @throws The signal's reason, as a rejection, when `options.signal` aborts.
 *
 * @example
 * ```ts
 * import { mapLimit } from 'shape-toolbox';
 *
 * const ids = [1, 2, 3, 4, 5];
 * const users = await mapLimit(
 *   ids,
 *   async (id, _index, signal) => {
 *     signal.throwIfAborted();
 *     return { id };
 *   },
 *   { concurrency: 2, signal: AbortSignal.timeout(10_000) },
 * );
 * console.log(users.length); // 5
 * ```
 */
export function mapLimit<T, R>(
  items: readonly T[],
  fn: (item: T, index: number, signal: AbortSignal) => R | PromiseLike<R>,
  options?: LimitOptions,
): Promise<Awaited<R>[]> {
  /** The most calls in flight at once. */
  const limit = options?.concurrency ?? Number.POSITIVE_INFINITY;
  if (!(limit === Number.POSITIVE_INFINITY || (Number.isInteger(limit) && limit >= 1))) {
    return Promise.reject(new RangeError(`concurrency must be a positive integer or Infinity, got ${String(limit)}`));
  }
  /** The caller's signal; aborting it fails the whole map. */
  const outer = options?.signal;
  if (outer?.aborted) return Promise.reject(outer.reason as unknown);
  /** A copy of the items, so a mapper that changes the source array doesn't change what runs. */
  const input = items.slice();
  /** Aborted on the first failure, telling calls still running to stop. */
  const inner = new AbortController();
  /** The signal each call receives: aborts when either the caller's signal or `inner` does. */
  const signal = outer ? AbortSignal.any([outer, inner.signal]) : inner.signal;
  /** The result promise, settled by {@link fail} or when the last item finishes. */
  const { promise, resolve, reject } = Promise.withResolvers<Awaited<R>[]>();
  /** Results by input index, filled as calls finish in any order. */
  const output: Awaited<R>[] = [];
  /** The index of the next item to start. */
  let next = 0;
  /** How many calls have finished successfully. */
  let done = 0;
  /** Set once the result has settled; late results and failures are ignored after it. */
  let finished = false;
  /** Removes the listener on the caller's signal once the map settles. */
  const stop = onAbort(outer, reason => { fail(reason, undefined); });

  /**
   * Finishes with a rejection, once: aborts running calls and records `[index]` for {@link failedPath}.
   *
   * @param error - The rejection reason.
   * @param index - The failing item, or `undefined` for an outer abort.
   */
  function fail(error: unknown, index: number | undefined): void {
    if (finished) return;
    finished = true;
    stop();
    if (index !== undefined) recordFailure(error, [index]);
    inner.abort(error);
    reject(error);
  }

  /** Resolves when every item is done; otherwise starts items until `limit` are in flight. */
  const launch = (): void => {
    if (done === input.length) {
      stop();
      resolve(output);
      return;
    }
    while (next < input.length && next - done < limit) {
      /** The item this call handles, claimed before `next` moves on. */
      const index = next++;
      Promise.resolve()
        .then(() => finished ? undefined : fn(input[index] as T, index, signal))
        .then(result => {
          // Stryker disable next-line ConditionalExpression: equivalent. After a failure, a late result only queues calls that skip the mapper.
          if (finished) return;
          output[index] = result as Awaited<R>;
          done++;
          launch();
        }, (error: unknown) => { fail(error, index); });
    }
  };
  launch();
  return promise;
}
