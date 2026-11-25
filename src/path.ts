import type {
  CheckEq, CheckPath, CheckRead, CheckSet, CheckWritePath, HasOptionalParent,
  Key, Narrow, PathFor, PathInput, PathLens, PathTuple, PathValue, SlotValue, ToTuple, WriteOutput,
} from './path-types.js';
import { emptyLike, isIndexKey, isObjectLike } from './internal.js';

export type { HasPath, PathInput, PathLens, PathTuple, PathValue, SlotValue } from './path-types.js';

/** A dot-path segment that becomes a number: an integer, possibly negative, with no leading zeros. */
const integer = /^(?:0|-?[1-9]\d*)$/;
/** Keys a write refuses, because writing them could change a prototype. */
const unsafe = new Set<Key>(['__proto__', 'constructor', 'prototype']);
/**
 * Own-property check that works on null-prototype objects, which have no `hasOwnProperty`.
 *
 * @param value - The object.
 * @param key - The key.
 * @returns Whether `value` has its own `key`.
 */
const own = (value: object, key: Key): boolean => Object.prototype.hasOwnProperty.call(value, key);

/**
 * Turns any {@link PathInput} into a frozen tuple, splitting dot strings and turning integer segments into numbers.
 *
 * @param path - A key, index, dot string, tuple or lens.
 * @returns The frozen tuple.
 * @throws `TypeError` when the path or one of its keys is not a string or a finite number.
 */
function toPath(path: unknown): PathTuple {
  /** The path itself, or a lens's `path` property. */
  const input: unknown = isObjectLike(path) && !Array.isArray(path) ? (path as { path?: unknown }).path : path;
  /** The segments: a dot string split with integer segments as numbers, a number wrapped, or a tuple copied. Anything else becomes `[undefined]` so the check below rejects it. */
  const parts: unknown[] = typeof input === 'string'
    ? input === '' ? [] : input.split('.').map(key => integer.test(key) && String(Number(key)) === key ? Number(key) : key)
    : typeof input === 'number' ? [input] : Array.isArray(input) ? [...(input as readonly unknown[])] : [undefined];
  if (!parts.every(key => typeof key === 'string' || (typeof key === 'number' && Number.isFinite(key)))) {
    throw new TypeError('path must be a string, number, or tuple of keys');
  }
  return Object.freeze(parts) as PathTuple;
}

/**
 * Reads one step. `null` and `undefined` read as `undefined`; array numbers may be negative, counted from the end.
 *
 * @param value - The current value.
 * @param key - The next key or index.
 * @returns The child, or `undefined`.
 */
function read(value: unknown, key: Key): unknown {
  if (value == null) return undefined;
  if (Array.isArray(value) && typeof key === 'number') {
    if (!Number.isInteger(key)) return undefined;
    /** The index from the start; negative indexes count back from the end. */
    const index = key < 0 ? value.length + key : key;
    return index < 0 || index >= value.length ? undefined : value[index];
  }
  return (value as Record<Key, unknown>)[key];
}

/**
 * Reads every step of a parsed path.
 *
 * @param value - The root value.
 * @param path - The parsed path.
 * @returns The value at the end of the path, or `undefined`.
 */
function readPath(value: unknown, path: PathTuple): unknown {
  for (const key of path) value = read(value, key);
  return value;
}

/**
 * Describes a position for error messages: `"a.b" in path "a.b.c"`, the failing prefix first, then the whole path.
 *
 * @param path - The whole path.
 * @param at - The index of the failing segment; `-1` names the root.
 * @returns The description.
 */
const where = (path: PathTuple, at: number): string => `"${path.slice(0, at + 1).join('.') || '(root)'}" in path "${path.join('.')}"`;

/**
 * Rejects paths that could write to a prototype, before anything is copied.
 *
 * @param path - The parsed path.
 * @throws `TypeError` naming the first `__proto__`, `constructor` or `prototype` segment.
 */
function safePath(path: PathTuple): void {
  /** The position of the first unsafe key, or `-1`. */
  const at = path.findIndex(key => unsafe.has(key));
  if (at !== -1) throw new TypeError(`unsafe write path: ${where(path, at)}`);
}

/**
 * Copies `value` with `replacement` at `path[at..]`, copying only the containers on the path and keeping every
 * property descriptor. Returns `value` itself when nothing changed.
 *
 * @param value - The container at depth `at`.
 * @param path - The whole parsed path.
 * @param at - How many segments are already consumed.
 * @param replacement - The new value for the end of the path.
 * @param preserveMissing - When true, writing `undefined` to an absent key is a no-op, as {@link update} needs.
 * @returns The copy, or `value` unchanged.
 * @throws `TypeError` for a missing or non-plain parent or a bad array key; `RangeError` for an index out of range.
 */
function write(value: unknown, path: PathTuple, at: number, replacement: unknown, preserveMissing = false): unknown {
  if (at === path.length) return replacement;
  /** Arrays take index keys and are copied as arrays. */
  const array = Array.isArray(value);
  if (typeof value !== 'object' || value === null) throw new TypeError(`missing parent ${where(path, at - 1)}; set the parent instead`);
  /** Typed `unknown`, because `Object.getPrototypeOf` is typed `any`. */
  const prototype: unknown = Object.getPrototypeOf(value);
  if (!array && prototype !== Object.prototype && prototype !== null) throw new TypeError(`cannot copy a non-plain parent ${where(path, at - 1)}`);
  /** The key to write at this depth; an index string becomes a number when the parent is an array. */
  let key = path[at] as Key;
  if (array) {
    if (typeof key === 'string' && isIndexKey(key)) key = Number(key);
    if (typeof key === 'number') {
      if (!Number.isInteger(key)) throw new TypeError(`array writes require an integer index at ${where(path, at)}`);
      key = key < 0 ? value.length + key : key;
      if (key < 0 || key > value.length) throw new RangeError(`index out of range at ${where(path, at)}`);
    } else if (key === 'length' || key in Array.prototype) {
      throw new TypeError(`array writes require an integer index or custom property at ${where(path, at)}`);
    }
  }
  /** Whether the key is already an own property; only the last segment may be new. */
  const exists = own(value, key);
  if (at + 1 < path.length && !exists) throw new TypeError(`missing parent ${where(path, at)}; set the parent instead`);
  /** The current value at this key, or `undefined` when it is new. */
  const child: unknown = exists ? (value as Record<Key, unknown>)[key] : undefined;
  /** The child after the write below it. */
  const result = write(child, path, at + 1, replacement, preserveMissing);
  if ((exists || preserveMissing) && Object.is(child, result)) return value;
  /** A fresh container of the same kind and prototype, filled with every original property below. */
  const copy = emptyLike(value);
  /** The written key as a property name, for skipping it while copying. */
  const changedKey = String(key);
  for (const property of Reflect.ownKeys(value)) {
    if (property !== changedKey && !(array && property === 'length')) {
      Object.defineProperty(copy, property, Object.getOwnPropertyDescriptor(value, property) as PropertyDescriptor);
    }
  }
  Object.defineProperty(copy, key, { value: result, enumerable: true, configurable: true, writable: true });
  return copy;
}

/** One operation's logic, given the data, the parsed path and the arguments after the path. */
type Body = (value: unknown, path: PathTuple, rest: readonly unknown[]) => unknown;
/**
 * Runs `body` for a data-first call, or returns a data-last function, deciding by the exact argument count.
 *
 * @param name - The public function's name, for the error message.
 * @param arity - The data-first argument count.
 * @param args - The caller's arguments.
 * @param body - The operation.
 * @returns The operation's result, or a function waiting for the data.
 * @throws `TypeError` for any other argument count.
 */
function dispatch(name: string, arity: number, args: readonly unknown[], body: Body): unknown {
  if (args.length === arity) return body(args[0], toPath(args[1]), args.slice(2));
  if (args.length === arity - 1) {
    /** The path, parsed once, so the returned function only reads or writes. */
    const path = toPath(args[0]);
    /** The arguments after the path, applied when the data arrives. */
    const rest = args.slice(1);
    return (value: unknown): unknown => body(value, path, rest);
  }
  throw new TypeError(`${name}: expected ${arity} arguments (data first) or ${arity - 1} (data last)`);
}

/**
 * The {@link getOr} rule: `null`, `undefined` and `NaN` take the fallback.
 *
 * @param value - The value read.
 * @param fallback - Its replacement.
 * @returns `value` or `fallback`.
 */
const fallbackValue = (value: unknown, fallback: unknown): unknown => value == null || Number.isNaN(value) ? fallback : value;
/**
 * The {@link getEq} rule: `Object.is`, or the caller's comparator coerced to a boolean.
 *
 * @param actual - The value read.
 * @param expected - The value to compare with.
 * @param compare - The comparator, or `undefined`.
 * @returns Whether they are equal.
 * @throws `TypeError` when `compare` is neither `undefined` nor a function.
 */
const equal = (actual: unknown, expected: unknown, compare: unknown): boolean => {
  if (compare === undefined) return Object.is(actual, expected);
  if (typeof compare !== 'function') throw new TypeError('comparator must be a function');
  return Boolean((compare as (actual: unknown, expected: unknown) => unknown)(actual, expected));
};

/**
 * Reads the value at a path, or `undefined` where any step is missing.
 *
 * @remarks
 * Reads through class instances and getters like ordinary property access. Negative array indexes count from the end.
 * Paths that cannot exist in `T` are compile errors with the valid paths suggested, and `any` data reads as `unknown`.
 * Passing more arguments than the signature allows throws a `TypeError`.
 *
 * @typeParam T - The data type.
 * @typeParam P - The path, inferred as a literal so its value type is known.
 * @param obj - The data to read.
 * @param path - A key, index, dot string, tuple or lens. See {@link PathInput}.
 * @returns The value at the path, typed as {@link PathValue}.
 *
 * @example
 * ```ts
 * import { get } from 'shape-toolbox';
 *
 * const loan = { borrower: { name: 'Ada' }, documents: ['w2', 'paystub', 'bank'] };
 * get(loan, 'borrower.name'); // 'Ada'
 * get(loan, 'documents.-1'); // 'bank'
 * get(loan, ['borrower', 'name']); // 'Ada'
 * ```
 */
export function get<T, const P extends PathFor<T>>(obj: T, path: P & CheckPath<T, P>): PathValue<T, P>;
/**
 * The data-last form of {@link get}: returns a reader, ready for `.map` or a pipe.
 *
 * @param path - A key, index, dot string, tuple or lens.
 * @returns A function that reads `path` from its argument.
 *
 * @example
 * ```ts
 * import { get } from 'shape-toolbox';
 *
 * const names = [{ name: 'Ada' }, { name: 'Sam' }].map(get('name')); // ['Ada', 'Sam']
 * void names;
 * ```
 */
export function get<const P extends PathInput>(path: P): <T>(obj: T & CheckPath<T, P>) => PathValue<T, P>;
/**
 * @privateRemarks
 * Implementation shared by every `get` overload: `readPath`, through `dispatch`.
 */
export function get(...args: unknown[]): unknown {
  return dispatch('get', 2, args, (obj, path) => readPath(obj, path));
}

/**
 * Reads the value at a path, or returns `fallback` when it is `null`, `undefined` or `NaN`.
 *
 * @remarks `0`, `''` and `false` are real values and are returned as they are.
 *
 * @typeParam T - The data type.
 * @typeParam P - The path.
 * @typeParam F - The fallback's type, kept literal.
 * @param obj - The data to read.
 * @param path - A key, index, dot string, tuple or lens.
 * @param fallback - Returned in place of a missing value.
 * @returns The value without `null` and `undefined` in its type, or the fallback.
 *
 * @example
 * ```ts
 * import { getOr } from 'shape-toolbox';
 *
 * const score: { value?: number; count: number } = { count: 0 };
 * getOr(score, 'value', -1); // -1
 * getOr(score, 'count', -1); // 0
 * ```
 */
export function getOr<T, const P extends PathFor<T>, const F>(obj: T, path: P & CheckPath<T, P>, fallback: F): NonNullable<PathValue<T, P>> | F;
/**
 * The data-last form of {@link getOr}.
 *
 * @param path - A key, index, dot string, tuple or lens.
 * @param fallback - Returned in place of a missing value.
 * @returns A reader of its argument.
 */
export function getOr<const P extends PathInput, const F>(path: P, fallback: F): <T>(obj: T & CheckPath<T, P>) => NonNullable<PathValue<T, P>> | F;
/**
 * @privateRemarks
 * Implementation shared by every `getOr` overload: `readPath` and `fallbackValue`, through `dispatch`.
 */
export function getOr(...args: unknown[]): unknown {
  return dispatch('getOr', 3, args, (obj, path, rest) => fallbackValue(readPath(obj, path), rest[0]));
}

/**
 * Reads the value at a path and returns `fn(value)`.
 *
 * @remarks `fn` is called even when the value is `undefined`, so it should handle that case.
 *
 * @typeParam T - The data type.
 * @typeParam P - The path.
 * @typeParam R - What `fn` returns.
 * @param obj - The data to read.
 * @param path - A key, index, dot string, tuple or lens.
 * @param fn - Transforms the value.
 * @returns Whatever `fn` returns.
 *
 * @example
 * ```ts
 * import { getWith } from 'shape-toolbox';
 *
 * getWith({ name: 'ada' }, 'name', (name) => name.toUpperCase()); // 'ADA'
 * ```
 */
export function getWith<T, const P extends PathFor<T>, R>(obj: T, path: P & CheckPath<T, P>, fn: (value: PathValue<T, P>) => R): R;
/**
 * The data-last form of {@link getWith}. The data's path value must be assignable to `fn`'s parameter.
 *
 * @param path - A key, index, dot string, tuple or lens.
 * @param fn - Transforms the value.
 * @returns A reader of its argument.
 */
export function getWith<const P extends PathInput, A, R>(path: P, fn: (value: A) => R): <T>(obj: T & CheckRead<T, P, A>) => R;
/**
 * @privateRemarks
 * Implementation shared by every `getWith` overload: `readPath` and the caller's function, through `dispatch`.
 */
export function getWith(...args: unknown[]): unknown {
  return dispatch('getWith', 3, args, (obj, path, rest) => (rest[0] as (value: unknown) => unknown)(readPath(obj, path)));
}

/**
 * The data-last {@link getEq} predicate. Two call signatures, so it fits `.filter` (which passes extra arguments) and
 * still accepts a comparator when called directly.
 *
 * @typeParam P - The path.
 * @typeParam V - The expected value.
 */
type EqPredicate<P, V> = {
  <T>(obj: T & CheckEq<T, P, V>, compare: ((actual: PathValue<T, P>, expected: V) => boolean) | undefined): boolean;
  <T>(obj: T & CheckEq<T, P, V>): boolean;
};

/**
 * True when the value at a path equals `expected`.
 *
 * @remarks
 * Uses `Object.is` by default, so `NaN` equals `NaN` and `0` differs from `-0`. There is no built-in deep equality:
 * arrays and objects compare by reference unless you pass `compare`.
 *
 * @typeParam T - The data type.
 * @typeParam P - The path.
 * @param obj - The data to read.
 * @param path - A key, index, dot string, tuple or lens.
 * @param expected - The value to compare with.
 * @param compare - Optional comparator called as `compare(actual, expected)`.
 * @returns Whether the values are equal.
 * @throws `TypeError` when `compare` is given and is not a function.
 *
 * @example
 * ```ts
 * import { getEq } from 'shape-toolbox';
 *
 * getEq({ status: 'open' }, 'status', 'open'); // true
 * getEq({ ids: [1, 2] }, 'ids', [1, 2], (a, b) => a.join() === b.join()); // true
 * ```
 */
export function getEq<T, const P extends PathFor<T>>(obj: T, path: P & CheckPath<T, P>, expected: PathValue<T, P>, compare?: (actual: PathValue<T, P>, expected: PathValue<T, P>) => boolean): boolean;
/**
 * The data-last form of {@link getEq}: returns a predicate, ready for `.filter`.
 *
 * @param path - A key, index, dot string, tuple or lens.
 * @param expected - The value to compare with.
 * @returns A predicate called as `(obj, compare?)`.
 *
 * @example
 * ```ts
 * import { getEq } from 'shape-toolbox';
 *
 * const open = [{ status: 'open' }, { status: 'done' }].filter(getEq('status', 'open'));
 * void open;
 * ```
 */
export function getEq<const P extends PathInput, V extends Narrow>(path: P, expected: V): EqPredicate<P, V>;
/**
 * @privateRemarks
 * Implementation shared by every `getEq` overload. Handled without `dispatch`, because the comparator makes the
 * data-first form take 3 or 4 arguments.
 */
export function getEq(...args: unknown[]): unknown {
  if (args.length === 3 || args.length === 4) return equal(readPath(args[0], toPath(args[1])), args[2], args[3]);
  if (args.length === 2) {
    /** The path, parsed once, so the predicate only reads. */
    const path = toPath(args[0]);
    return (obj: unknown, compare?: unknown): boolean => equal(readPath(obj, path), args[1], typeof compare === 'function' ? compare : undefined);
  }
  throw new TypeError('getEq: expected 3 or 4 arguments (data first) or 2 (data last)');
}

/**
 * Returns a copy of `obj` with `value` at the path. `obj` itself is never changed.
 *
 * @remarks
 * Only the objects along the path are copied; every other branch is shared with `obj`. Writing the value that is
 * already there returns `obj` itself. Copies keep getters, non-enumerable and symbol properties, and null prototypes.
 * A missing parent is never created, because its type is unknown: set the parent whole instead. For the same reason,
 * writing through an element of an array type (not a tuple) is a compile error, since the element may be missing;
 * map the array instead, as in `update(cart, 'items', (items) => items.map(...))`.
 *
 * @typeParam T - The data type.
 * @typeParam P - The path.
 * @param obj - The data to copy.
 * @param path - A key, index, dot string, tuple or lens. Every parent on it must exist.
 * @param value - The replacement, typed as {@link SlotValue}.
 * @returns The updated copy, or `obj` when nothing changed.
 * @throws `TypeError` when a parent is missing or not a plain object or array, when the path uses `__proto__`,
 * `constructor` or `prototype`, or when an array index is out of range.
 *
 * @example
 * ```ts
 * import { set } from 'shape-toolbox';
 *
 * const before = { user: { name: 'Ada' }, prefs: { theme: 'dark' } };
 * const after = set(before, 'user.name', 'Sam');
 * after.prefs === before.prefs; // true: untouched branches are shared
 * ```
 */
export function set<T, const P extends PathFor<T>>(obj: T, path: P & CheckWritePath<T, P>, value: SlotValue<T, P>): WriteOutput<T, P>;
/**
 * The data-last form of {@link set}: returns a writer, ready for `.map` or a pipe.
 *
 * @param path - A key, index, dot string, tuple or lens.
 * @param value - The replacement.
 * @returns A function that copies its argument with `value` at `path`.
 */
export function set<const P extends PathInput, V extends Narrow>(path: P, value: V): <T>(obj: T & CheckSet<T, P, V>) => WriteOutput<T, P>;
/**
 * @privateRemarks
 * Implementation shared by every `set` overload: `safePath` and `write`, through `dispatch`.
 */
export function set(...args: unknown[]): unknown {
  return dispatch('set', 3, args, (obj, path, rest) => {
    safePath(path);
    return write(obj, path, 0, rest[0]);
  });
}

/**
 * Returns a copy of `obj` with the value at the path replaced by `fn(value)`.
 *
 * @remarks
 * Same copying rules as {@link set}. To change a field of an optional parent only when the parent exists, update the
 * parent: `update(obj, 'address', (a) => a && { ...a, city: 'Denver' })`.
 *
 * @typeParam T - The data type.
 * @typeParam P - The path.
 * @param obj - The data to copy.
 * @param path - A key, index, dot string, tuple or lens. Every parent on it must exist.
 * @param fn - Computes the new value from the current one.
 * @returns The updated copy, or `obj` when `fn` returns the same value.
 * @throws `TypeError` in the same cases as {@link set}.
 *
 * @example
 * ```ts
 * import { update } from 'shape-toolbox';
 *
 * type Cart = { items: [{ qty: number }, { qty: number }] };
 * const cart: Cart = { items: [{ qty: 1 }, { qty: 3 }] };
 * update(cart, 'items.1.qty', (qty) => qty + 1); // { items: [{ qty: 1 }, { qty: 4 }] }
 * ```
 */
export function update<T, const P extends PathFor<T>>(obj: T, path: P & CheckWritePath<T, P>, fn: <V extends PathValue<T, P>>(value: V) => V | SlotValue<T, P>): WriteOutput<T, P>;
/**
 * The data-last form of {@link update}.
 *
 * @param path - A key, index, dot string, tuple or lens.
 * @param fn - Computes the new value from the current one.
 * @returns A function that copies its argument with the value at `path` replaced.
 */
export function update<const P extends PathInput, A, B extends Narrow>(path: P, fn: (value: A) => B): <T>(obj: T & CheckRead<T, P, A> & CheckSet<T, P, B>) => WriteOutput<T, P>;
/**
 * @privateRemarks
 * Implementation shared by every `update` overload: `safePath` and `write`, without creating keys, through `dispatch`.
 */
export function update(...args: unknown[]): unknown {
  return dispatch('update', 3, args, (obj, path, rest) => {
    safePath(path);
    return write(obj, path, 0, (rest[0] as (value: unknown) => unknown)(readPath(obj, path)), true);
  });
}

/**
 * Freezes without losing the contextual type of the object literal passed in.
 *
 * @typeParam L - The object's type.
 * @param value - The object.
 * @returns The same object, frozen.
 */
const frozen = <L extends object>(value: L): L => Object.freeze(value);

/**
 * Creates a reusable focus on one path of `T`, with every read and write operation in data-last form.
 *
 * @remarks
 * Called in two steps, `lens<User>()('stats.visits')`, so you name `T` once while the path is still inferred as a
 * literal and autocompleted. The lens is frozen and can be shared. See {@link PathLens} for its methods.
 *
 * @typeParam T - The data type the lens will read.
 * @returns A function taking the path and returning a {@link PathLens}.
 * @throws From the returned function: `TypeError` for an empty, unsafe or malformed path.
 *
 * @example
 * ```ts
 * import { lens } from 'shape-toolbox';
 *
 * type User = { name: string; stats: { visits: number } };
 * const visits = lens<User>()('stats.visits');
 * const users: User[] = [{ name: 'Ada', stats: { visits: 1 } }];
 * users.map(visits.get); // [1]
 * users.map(visits.update((n) => n + 1)); // visits becomes 2
 * ```
 */
export function lens<T>(): <const P extends PathFor<T>>(path: P & CheckPath<T, P>) => PathLens<T, PathValue<T, P>, HasOptionalParent<T, P> extends true ? never : SlotValue<T, P>, ToTuple<P>> {
  if (arguments.length !== 0) throw new TypeError('lens: expected no arguments before its path builder');
  return function (path) {
    if (arguments.length !== 1) throw new TypeError('lens: expected one path argument');
    /** The parsed path, shared by every method of this lens. */
    const focus = toPath(path);
    return frozen({
      path: focus as never,
      get: obj => readPath(obj, focus) as never,
      getOr: fallback => obj => fallbackValue(readPath(obj, focus), fallback) as never,
      getWith: fn => obj => fn(readPath(obj, focus) as never),
      getEq: (expected, compare) => obj => equal(readPath(obj, focus), expected, compare),
      set: value => obj => { safePath(focus); return write(obj, focus, 0, value) as never; },
      update: fn => obj => { safePath(focus); return write(obj, focus, 0, fn(readPath(obj, focus) as never), true) as never; },
    });
  };
}
