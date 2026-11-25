import { recordFailure } from './failure.js';
import { defineValue, emptyLike, fulfilled, isContainer, onAbort, ownEnumerableKeys, rejected, toSegment, type Key } from './internal.js';
import type { DeepAwaited, DeepSettled, SignalOption } from './types.js';

/** `'all'` rethrows the first rejection; `'settled'` turns each promise into a `Settled` result. */
type Mode = 'all' | 'settled';
/** What one call's walk needs at every depth. */
interface Context {
  /** How promises are resolved. */
  readonly mode: Mode;
  /** The caller's signal. Once it aborts, the walk reads nothing more. */
  readonly signal: AbortSignal | undefined;
  /** Containers already scanned by {@link observe}, so each is scanned once. */
  readonly seen: Set<object>;
}
/** The location being walked, or `undefined` once it passes through a symbol key and can't be reported. */
type Path = readonly Key[] | undefined;
/** The result of reading `then` once: not thenable, a callable `then`, or the getter's error. */
type ThenRead =
  | { readonly kind: 'none' }
  | { readonly kind: 'then'; readonly then: (this: unknown, ...args: unknown[]) => unknown }
  | { readonly kind: 'error'; readonly error: unknown };

/**
 * Reads `then` once, as promise resolution does; a getter that throws counts as a rejection.
 *
 * @param value - Any value.
 * @returns Whether `value` is thenable, with the `then` function or the getter's error.
 */
function readThen(value: unknown): ThenRead {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return { kind: 'none' };
  try {
    /** The `then` property, read exactly once: a getter may change its answer or throw on a second read. */
    const then: unknown = (value as { then?: unknown }).then;
    // Stryker disable next-line StringLiteral: equivalent. Callers compare `kind` only with 'none' and 'error'.
    return typeof then === 'function' ? { kind: 'then', then: then as (this: unknown, ...args: unknown[]) => unknown } : { kind: 'none' };
  } catch (error) {
    return { kind: 'error', error };
  }
}

/**
 * Narrows the walker's output: a native promise means something below is still pending.
 *
 * @param value - A walked child.
 * @returns Whether it is a promise.
 */
const isPromise = (value: unknown): value is Promise<unknown> => value instanceof Promise;

/** Does nothing. Attached as a rejection handler so a promise counts as handled. */
const ignore = (): void => {};

/**
 * After an abort, gives every native promise still reachable through data properties a handler, so none is
 * reported as unhandled. Runs no getter and calls no custom `then`.
 *
 * @param value - What the walk would have read next.
 * @param seen - Containers already scanned.
 */
function observe(value: unknown, seen: Set<object>): void {
  if (value instanceof Promise) {
    void Promise.prototype.then.call(value, undefined, ignore);
    return;
  }
  if (!isContainer(value) || seen.has(value)) return;
  seen.add(value);
  /** Every own property's descriptor, read without running a getter. */
  const descriptors: Record<PropertyKey, PropertyDescriptor> = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    /** The property's value; `undefined` for an accessor, whose getter is never run. */
    const item: unknown = (descriptors[key] as PropertyDescriptor).value;
    observe(item, seen);
  }
}

/**
 * Ends the walk at `value` after an abort: observes what is left there and returns the abort as a rejection.
 *
 * @param value - What the walk would have read next.
 * @param context - The walk's context; its signal has aborted.
 * @param signal - The aborted signal.
 * @returns A rejection with the signal's reason. The caller's result has already rejected with it.
 */
const stopped = (value: unknown, context: Context, signal: AbortSignal): Promise<never> => {
  observe(value, context.seen);
  return Promise.reject(signal.reason as unknown);
};

/**
 * Reads and walks one child. A throwing getter or a cycle becomes a rejection, so siblings stay handled.
 *
 * @param read - Reads the child from its parent; may run a getter.
 * @param ancestors - The containers above the child, for cycle detection.
 * @param path - The child's location, for {@link recordFailure}.
 * @param context - The walk's mode, signal and scanned containers.
 * @returns The walked child: a plain value, or a promise when something below is asynchronous.
 */
function child(read: () => unknown, ancestors: readonly object[], path: Path, context: Context): unknown {
  /** The child, assigned inside `try` so a throwing getter is caught and recorded. */
  let value: unknown;
  try {
    value = read();
  } catch (error) {
    recordFailure(error, path);
    return Promise.reject(error);
  }
  try {
    return walk(value, ancestors, path, context);
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Resolves `value` deeply. Returns a plain value when nothing below is asynchronous, so promise-free branches cost no
 * microtasks.
 *
 * @param value - The value to walk.
 * @param ancestors - The containers above `value`, for cycle detection.
 * @param path - The location of `value`, for {@link recordFailure}.
 * @param context - The walk's mode, signal and scanned containers.
 * @returns The resolved copy, or a promise of it.
 * @throws `TypeError` synchronously when `value` is one of its own ancestors.
 */
function walk(value: unknown, ancestors: readonly object[], path: Path, context: Context): unknown {
  /** The caller's signal; checked before anything is read. */
  const { mode, signal } = context;
  if (signal?.aborted) return stopped(value, context, signal);
  /** Whether `value` is thenable, decided by a single read of `then`. */
  const read = readThen(value);
  if (read.kind !== 'none') {
    /** `value` adopted as a real promise. Calling the captured `then` inside a resolve job keeps it asynchronous and reads the getter only once. */
    const promise: Promise<unknown> = read.kind === 'error'
      ? Promise.reject(read.error)
      : Promise.resolve({ then: (resolve: (r: unknown) => void, reject: (e: unknown) => void): void => { read.then.call(value, resolve, reject); } });
    // Only the promise's own rejection is settled; invalid structure underneath still rejects.
    return promise.then(
      resolved => mode === 'all' ? walk(resolved, ancestors, path, context) : Promise.resolve(walk(resolved, ancestors, path, context)).then(fulfilled),
      (reason: unknown) => {
        recordFailure(reason, path);
        if (mode === 'settled') return rejected(reason);
        throw reason;
      },
    );
  }
  if (!isContainer(value)) return value;
  if (ancestors.includes(value)) throw new TypeError('shape-toolbox: circular structure');
  /** Ancestors for the children: this container plus everything above it. */
  const chain = [...ancestors, value];
  /** The keys to copy, fixed now so the result's key order matches the input's. */
  const keys = ownEnumerableKeys(value);
  /** A fresh container of the same kind, prototype and length, made now so later changes to the input can't reach it. */
  const output = emptyLike(value);
  /** Each child walked, in key order: plain values where possible, promises where something below is pending. */
  const values: unknown[] = [];
  for (const key of keys) {
    // A getter may abort the signal; stop before reading the next key.
    if (signal?.aborted) {
      values.push(stopped(value, context, signal));
      break;
    }
    values.push(child(
      () => (value as Record<PropertyKey, unknown>)[key],
      chain,
      path !== undefined && typeof key === 'string' ? [...path, toSegment(value, key)] : undefined,
      context,
    ));
  }
  /**
   * Fills the output with each key's resolved value, in the original key order.
   *
   * @param resolved - The children's values, in key order.
   * @returns The output.
   */
  const build = (resolved: readonly unknown[]): object => {
    keys.forEach((key, index) => { defineValue(output, key, resolved[index]); });
    return output;
  };
  return values.some(isPromise) ? Promise.all(values).then(build) : build(values);
}

/**
 * Runs {@link walk} for {@link allDeep} and {@link allSettledDeep}, racing it against the abort signal. The walk starts
 * during the call, so the input is read as it is then.
 *
 * @typeParam R - The declared result type.
 * @param value - The input to resolve.
 * @param mode - How promises are resolved.
 * @param options - The caller's options, possibly with a signal.
 * @returns A promise of the resolved value.
 */
function run<R>(value: unknown, mode: Mode, options: SignalOption | undefined): Promise<R> {
  /** The caller's signal, if any. */
  const signal = options?.signal;
  /** The result promise, settled by whichever finishes first: the walk or the abort. */
  const { promise, resolve, reject } = Promise.withResolvers<R>();
  /** Removes the abort listener once the walk settles, so a long-lived signal doesn't keep this call alive. An already-aborted signal never fires; the walk rejects with its reason instead. */
  const stop = onAbort(signal, reject);
  /** The walk's result: a plain value, or a promise when something is pending. An already-aborted walk only observes. */
  let walked: unknown;
  try {
    // Stryker disable next-line ArrayDeclaration: equivalent. Ancestors are only compared with containers.
    walked = walk(value, [], [], { mode, signal, seen: new Set() });
  } catch (error) {
    walked = Promise.reject(error);
  }
  Promise.resolve(walked).then(result => { stop(); resolve(result as R); }, (error: unknown) => { stop(); reject(error); });
  return promise;
}

/**
 * Awaits every promise inside nested plain objects and arrays and returns the same shape, fully resolved.
 *
 * @remarks
 * A promise that resolves to more promises, or to objects holding promises, is followed all the way down. Thenables are
 * read once, as `await` would. Class instances, `Date`, `Map`, `Set` and other non-plain values are returned as is.
 * Branches without promises are rebuilt synchronously, so they cost no extra microtasks. Symbol keys, null prototypes,
 * sparse arrays and own `__proto__` keys are preserved. Shared references are fine; cycles are not.
 *
 * Promises in the input are already running. To control when work starts, use {@link mapLimit} or
 * {@link applySpecAsync}.
 *
 * @typeParam T - The input shape. The result type is {@link DeepAwaited}.
 * @param value - A promise, a plain object or array holding promises at any depth, or any other value.
 * @param options - Optional {@link SignalOption}.
 * @returns A promise of a copy of `value` with every promise replaced by its value.
 * @throws The first rejection reason, unchanged, as a rejection. {@link failedPath} gives where it came from.
 * @throws `TypeError`, as a rejection, when the structure has a cycle, including one reached through a promise.
 * @throws The signal's reason, as a rejection, when `options.signal` aborts.
 *
 * @example
 * ```ts
 * import { allDeep } from 'shape-toolbox';
 *
 * const page = await allDeep({
 *   user: Promise.resolve({ id: 7 }),
 *   orders: [Promise.resolve('A-1'), 'A-2'],
 *   at: new Date(0),
 * });
 * // { user: { id: 7 }, orders: ['A-1', 'A-2'], at: Date }
 * void page;
 * ```
 *
 * @see {@link allSettledDeep} to keep every result when some fail.
 */
export function allDeep<T>(value: T, options?: SignalOption): Promise<DeepAwaited<T>> {
  return run(value, 'all', options);
}

/**
 * Like {@link allDeep}, but each promise becomes `{ status, value }` or `{ status, reason }` in place, so one failure
 * doesn't hide the rest.
 *
 * @remarks
 * Only promises are wrapped; plain leaves are returned as they are. A failed promise still records its location for
 * {@link failedPath}. Structural problems are not data: a cycle or a throwing getter still rejects the whole call.
 *
 * @typeParam T - The input shape. The result type is {@link DeepSettled}.
 * @param value - A promise, a plain object or array holding promises at any depth, or any other value.
 * @param options - Optional {@link SignalOption}.
 * @returns A promise of a copy of `value` with every promise replaced by its settled result.
 * @throws `TypeError`, as a rejection, on a cycle; a getter's error, as a rejection, when reading a property throws.
 * @throws The signal's reason, as a rejection, when `options.signal` aborts.
 *
 * @example
 * ```ts
 * import { allSettledDeep } from 'shape-toolbox';
 *
 * const checks = await allSettledDeep({
 *   credit: Promise.reject(new Error('bureau timeout')),
 *   income: Promise.resolve(5200),
 *   note: 'plain values stay as they are',
 * });
 * if (checks.credit.status === 'rejected') console.log(checks.credit.reason);
 * ```
 */
export function allSettledDeep<T>(value: T, options?: SignalOption): Promise<DeepSettled<T>> {
  return run(value, 'settled', options);
}
