/** A property name or numeric array index. */
export type Key = string | number;

/** A canonical non-negative integer string, with no leading zeros. */
export const INDEX: RegExp = /^(?:0|[1-9]\d*)$/;

/**
 * True for anything that can hold properties: objects and functions.
 *
 * @param value - Any value.
 * @returns Whether `value` is an object or a function.
 */
export const isObjectLike = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

/**
 * True for object literals and null-prototype objects; false for arrays, class instances and built-ins.
 *
 * @param value - Any value.
 * @returns Whether `value` is a plain object.
 */
export const isPlain = (value: unknown): value is Record<PropertyKey, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  /** Typed `unknown`, because `Object.getPrototypeOf` is typed `any`. */
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * The values the deep walkers and the spec compiler descend into: arrays and plain objects.
 *
 * @param value - Any value.
 * @returns Whether `value` is walked into.
 */
export const isContainer = (value: unknown): value is object => Array.isArray(value) || isPlain(value);

/**
 * Own enumerable string and symbol keys, in property order; array holes are skipped.
 *
 * @param value - The object.
 * @returns Its keys.
 */
export const ownEnumerableKeys = (value: object): (string | symbol)[] =>
  Reflect.ownKeys(value).filter(key => Object.prototype.propertyIsEnumerable.call(value, key));

/**
 * True for canonical array index strings: `'0'`, `'12'`, not `'01'` or a number past `Number.MAX_SAFE_INTEGER`.
 *
 * @param key - A property key.
 * @returns Whether it names an array index.
 */
export const isIndexKey = (key: string): boolean => INDEX.test(key) && String(Number(key)) === key;

/**
 * Turns an array's index key into a number, so failure paths read `['items', 0]`.
 *
 * @param container - The parent being walked.
 * @param key - One of its keys.
 * @returns The key as a path segment.
 */
export const toSegment = (container: object, key: string): Key =>
  Array.isArray(container) && isIndexKey(key) ? Number(key) : key;

/**
 * Defines a data property, so a key named `__proto__` stays an own key instead of changing the prototype.
 *
 * @param target - The object to write to.
 * @param key - The key.
 * @param value - The value.
 */
export const defineValue = (target: object, key: PropertyKey, value: unknown): void => {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
};

/**
 * An empty copy of an array (same length, holes kept) or a plain object (same prototype).
 *
 * @param source - The container to copy.
 * @returns The empty copy.
 */
export const emptyLike = (source: object): object =>
  Array.isArray(source) ? new Array<unknown>(source.length) : Object.create(Object.getPrototypeOf(source) as object | null) as object;

/**
 * Runs `handler` once when the signal aborts.
 *
 * @param signal - The signal, or `undefined` for none.
 * @param handler - Called on abort.
 * @returns A function that removes the listener.
 */
export const onAbort = (signal: AbortSignal | undefined, handler: () => void): (() => void) => {
  if (signal === undefined) return () => undefined;
  signal.addEventListener('abort', handler, { once: true });
  return () => { signal.removeEventListener('abort', handler); };
};

/**
 * Builds a fulfilled `PromiseSettledResult`.
 *
 * @typeParam T - The value type.
 * @param value - The value.
 * @returns `{ status: 'fulfilled', value }`.
 */
export const fulfilled = <T>(value: T): PromiseFulfilledResult<T> => ({ status: 'fulfilled', value });
/**
 * Builds a rejected `PromiseSettledResult`.
 *
 * @param reason - The rejection reason.
 * @returns `{ status: 'rejected', reason }`.
 */
export const rejected = (reason: unknown): PromiseRejectedResult => ({ status: 'rejected', reason });
