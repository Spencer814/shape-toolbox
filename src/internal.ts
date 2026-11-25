import type { Settled } from './types.js';

/** A property name or numeric array index. */
export type Key = string | number;


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
const isPlain = (value: unknown): value is Record<PropertyKey, unknown> => {
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
 * Whether a string is the canonical form of an integer: `'0'`, `'12'` or `'-1'`, but not `'01'`, `'-0'` or `'1e3'`.
 *
 * @param key - A path segment or property name.
 * @returns Whether `Number(key)` is an integer that prints back as `key`.
 */
export const isIntegerKey = (key: string): boolean => {
  /** The key as a number. */
  const number = Number(key);
  return Number.isInteger(number) && String(number) === key;
};

/**
 * True for canonical array index strings: `'0'`, `'12'`, not `'01'` or a number past `Number.MAX_SAFE_INTEGER`.
 *
 * @param key - A property key.
 * @returns Whether it names an array index.
 */
export const isIndexKey = (key: string): boolean => isIntegerKey(key) && !key.startsWith('-');

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
 * @param handler - Called on abort with the signal's reason.
 * @returns A function that removes the listener.
 */
export const onAbort = (signal: AbortSignal | undefined, handler: (reason: unknown) => void): (() => void) => {
  if (signal === undefined) return () => undefined;
  /** Passes the signal's reason to `handler`. */
  const listener = (): void => { handler(signal.reason); };
  // Stryker disable next-line ObjectLiteral,BooleanLiteral: equivalent. Every caller removes the listener when it settles; `once` only frees it sooner when the work never settles.
  signal.addEventListener('abort', listener, { once: true });
  return () => { signal.removeEventListener('abort', listener); };
};

/**
 * Builds a fulfilled `Settled` result.
 *
 * @typeParam T - The value type.
 * @param value - The value.
 * @returns `{ status: 'fulfilled', value }`.
 */
export const fulfilled = <T>(value: T): PromiseFulfilledResult<T> => ({ status: 'fulfilled', value });
/**
 * Builds a rejected `Settled` result.
 *
 * @param reason - The rejection reason.
 * @returns `{ status: 'rejected', reason }`.
 */
export const rejected = (reason: unknown): Settled<never> => ({ status: 'rejected', reason });
