import type { Atomic, IsAny } from './types.js';
import type { Key } from './internal.js';

export type { Key } from './internal.js';
/**
 * A path as an array of keys and indexes, such as `['user', 'orders', 0]`.
 *
 * @remarks Each element is used as is, so keys containing dots (`['a.b']`) need this form.
 */
export type PathTuple = readonly Key[];
/**
 * Every way to name a path: a key or index (`'name'`, `0`), a dot string (`'items.0.name'`), a {@link PathTuple}, or
 * a {@link PathLens}.
 *
 * @remarks In a dot string, a segment of digits is an array index; a negative index such as `'-1'` counts from the end.
 */
export type PathInput = Key | PathTuple | HasPath;
/** Anything carrying a parsed path, such as a {@link PathLens}; it can stand in for the path itself. */
export interface HasPath {
  /** The parsed path the object focuses on. */
  readonly path: PathTuple;
}

/** Primitive values; written as-is by `set`, so they never become readonly tuples. */
type Primitive = string | number | boolean | bigint | symbol | null | undefined;
/** Values path suggestions never descend into: leaves and promises. */
type Opaque = Atomic | PromiseLike<unknown>;
/** True for `any` and `unknown` data, whose paths can't be checked, so results are `unknown`. */
type IsLoose<T> = IsAny<T> extends true ? true : unknown extends T ? true : false;
/** Turns a canonical integer segment such as `'0'` or `'-1'` into a number literal, as the runtime parser does. */
type ToKey<S extends string> = S extends `${bigint}` ? S extends `${infer N extends number}` ? `${N}` extends S ? N : S : S : S;

/** Parses dot paths; tuple paths preserve literal keys without parsing them. */
export type ParsePath<S extends string> = S extends '' ? [] : S extends `${infer H}.${infer T}` ? [ToKey<H>, ...ParsePath<T>] : [ToKey<S>];
/** Extracts the segments used by the runtime path parser. */
export type ToTuple<P> = P extends { readonly path: infer Q extends PathTuple } ? Q : P extends string ? string extends P ? PathTuple : ParsePath<P> : P extends number ? [P] : P extends PathTuple ? P : never;

/** Brand for {@link Missing}. */
declare const missing: unique symbol;
/** Marks a path step that can't exist in the type: a compile error for reads and writes. */
interface Missing {
  /** The brand. */
  readonly [missing]: true;
}
/** Brand for {@link Absent}. */
declare const absent: unique symbol;
/** Marks a step through `null` or `undefined`: reads give `undefined`. */
interface Absent {
  /** The brand. */
  readonly [absent]: true;
}
/** Brand for {@link OptionalParent}. */
declare const optionalParent: unique symbol;
/** Marks a write whose parent may be missing; writes reject it. */
interface OptionalParent {
  /** The brand. */
  readonly [optionalParent]: true;
}
/** Wraps a writable slot's type, so a `never` slot isn't lost in a union. */
interface Slot<V> {
  /** The type the slot accepts. */
  readonly value: V;
}
/** True for tuples (a literal length), false for open arrays. */
type IsTuple<T extends readonly unknown[]> = number extends T['length'] ? false : true;
/** True for integer literals and plain `number`; false for literals like `1.5`. */
type Integer<N extends number> = number extends N ? true : `${N}` extends `${bigint}` ? true : false;
/** The tuple `[0, 1, ..., L - 1]`, for counting back from the end. */
type Indices<L extends number, A extends number[] = []> = A['length'] extends L ? A : Indices<L, [...A, A['length']]>;
/** The index `N` places from the end of `A`, or {@link Missing}. */
type BackIndex<A extends readonly number[], N extends number, Count extends unknown[] = []> = A extends readonly [...infer R extends number[], infer Last extends number] ? [...Count, unknown]['length'] extends N ? Last : BackIndex<R, N, [...Count, unknown]> : Missing;
/** Resolves a negative index such as `-1` against a tuple's length. */
type NegativeIndex<T extends readonly unknown[], N extends number, L = T['length']> = L extends number ? `${N}` extends `-${infer Count extends number}` ? BackIndex<Indices<L>, Count> : Missing : Missing;
/** The tuple key a numeric segment reads: the literal index, a negative index resolved, or {@link Missing}. */
type TupleIndex<T extends readonly unknown[], N extends number> = number extends N ? keyof T & `${number}` : `${N}` extends `-${string}` ? NegativeIndex<T, N> : `${N}` extends keyof T ? `${N}` : Missing;
/** The element type at a resolved tuple key, or {@link Missing}. */
type TupleRead<T extends readonly unknown[], I> = I extends Missing ? Missing : I extends keyof T ? T[I] : I extends number ? I extends keyof T ? T[I] : Missing : Missing;
/** Reads a numeric segment from an array or tuple; open arrays may be shorter, so they add `undefined`. */
type ArrayRead<T extends readonly unknown[], N extends number> = Integer<N> extends true ? IsTuple<T> extends true ? number extends N ? T[number] | undefined : TupleRead<T, TupleIndex<T, N>> : T[number] | undefined : Missing;
/** The real key of `T` that segment `K` names, matching `'0'` and `0` both ways, or {@link Missing}. */
type Property<T, K> = K extends keyof T ? K : K extends number ? `${K}` extends keyof T ? `${K}` : Missing : K extends `${infer N extends number}` ? N extends keyof T ? N : Missing : Missing;
/** True when `K` is served by an index signature, so the read may be `undefined`. */
type Indexed<T, K> = K extends number ? number extends keyof T ? true : false : K extends string ? string extends keyof T ? true : K extends `${number}` ? number extends keyof T ? true : false : false : false;
/** Functions also expose `CallableFunction` members such as `name`, so paths can read them. */
type ReadTarget<T> = T extends (...args: never[]) => unknown ? T & CallableFunction : T;
/** Reads a property segment from an object or function, adding `undefined` for index signatures. */
type NamedRead<T, K, R = Property<ReadTarget<T>, K>> = R extends keyof ReadTarget<T> ? Indexed<ReadTarget<T>, K> extends true ? ReadTarget<T>[R] | undefined : ReadTarget<T>[R] : Missing;
/** Reads a declared key from an array type, such as `length` or an extra property. */
type LiteralNamedRead<T, K> = K extends keyof T ? string extends keyof T ? T[K] | undefined : T[K] : Missing;
/** Reads a string segment from an array: integer strings act as indexes, others as named keys. */
type ArrayNamedRead<T extends readonly unknown[], K> = K extends string ? ToKey<K> extends infer N ? N extends number ? `${N}` extends `-${string}` ? LiteralNamedRead<T, K> : ArrayRead<T, N> : LiteralNamedRead<T, K> : Missing : LiteralNamedRead<T, K>;
/** One read step: dispatches on loose data, absent values, arrays and objects. */
type ReadStep<T, K> = IsLoose<T> extends true ? unknown : T extends Missing ? Missing : T extends Absent ? Absent : T extends null | undefined ? Absent : T extends readonly unknown[] ? K extends number ? ArrayRead<T, K> : ArrayNamedRead<T, K> : NamedRead<T, K>;
/** Applies {@link ReadStep} along every segment of a tuple path. */
type ReadWalk<T, P extends PathTuple> = P extends readonly [] ? T : P extends readonly [infer K, ...infer R extends PathTuple] ? ReadWalk<ReadStep<T, K>, R> : unknown;
/** Turns the walk's markers into a public type: {@link Missing} alone is `never`, absent steps become `undefined`. */
type Clean<V> = [V] extends [Missing] ? never : Exclude<V, Missing | Absent> | ([Extract<V, Missing | Absent>] extends [never] ? never : undefined);
/** True for an open template such as `` `item-${string}` ``: an empty record satisfies it; a finite key needs a property. A `never` value keeps inherited names such as `toString` from passing. */
type DynamicString<S extends string> = S extends unknown ? Record<never, never> extends Record<S, never> ? true : false : never;
/** True for a segment only known at runtime: plain `string`, `number`, or an open template. */
type DynamicSegment<K> = K extends string ? DynamicString<K> : number extends K ? true : false;
/** True when any segment is dynamic, or the tuple's length isn't fixed. */
type DynamicSegments<P extends PathTuple> = P extends readonly [infer K, ...infer R extends PathTuple] ? true extends DynamicSegment<K> ? true : DynamicSegments<R> : number extends P['length'] ? true : false;
/** True when the path can't be checked at compile time, so its value is `unknown`. */
type Dynamic<P> = true extends DynamicSegments<ToTuple<P>> ? true : false;

/**
 * The type {@link get} returns for path `P` in `T`.
 *
 * @remarks
 * Includes `undefined` wherever a step can be missing: an optional property, a union member without the key, or an
 * array element. Untyped (`any`) data or a path only known at runtime gives `unknown`.
 *
 * @typeParam T - The data type.
 * @typeParam P - The path type.
 *
 * @example
 * ```ts
 * import type { PathValue } from 'shape-toolbox';
 *
 * type User = { name: string; tags: string[]; address?: { city: string } };
 * const city: PathValue<User, 'address.city'> = undefined; // string | undefined
 * const tag: PathValue<User, 'tags.0'> = 'vip'; // string | undefined
 * void city; void tag;
 * ```
 */
export type PathValue<T, P> = IsLoose<T> extends true ? unknown : Dynamic<P> extends true ? unknown : Clean<ReadWalk<T, ToTuple<P>>>;

/** A setter signature for a tuple slot, so a union of slots intersects the value types. */
type TupleSlotFunctions<T extends readonly unknown[], I> = I extends keyof T ? (value: Required<T>[I]) => void : never;
/** The value type a resolved tuple key accepts, or {@link Missing}. */
type TupleSlot<T extends readonly unknown[], I> = [Extract<I, Missing>] extends [never] ? TupleSlotFunctions<T, I> extends (value: infer V) => void ? V : never : Missing;
/** The value type a numeric segment accepts in an array or tuple. */
type ArrayWriteNumber<T extends readonly unknown[], K extends number> = Integer<K> extends true ? IsTuple<T> extends true ? TupleSlot<T, TupleIndex<T, K>> : T[number] : Missing;
/** The value type a string segment accepts in an array: integer strings act as indexes. */
type ArrayWriteNamed<T extends readonly unknown[], K> = K extends string ? ToKey<K> extends infer N ? N extends number ? `${N}` extends `-${string}` ? K extends Exclude<keyof T, keyof unknown[]> ? Required<T>[K] : Missing : ArrayWriteNumber<T, N> : K extends Exclude<keyof T, keyof unknown[]> ? Required<T>[K] : Missing : Missing : Missing;
/** The value type the last segment accepts in its parent. */
type WriteAt<T, K> = T extends readonly unknown[] ? K extends number ? ArrayWriteNumber<T, K> : ArrayWriteNamed<T, K> : Property<T, K> extends infer R ? R extends keyof T ? Required<T>[R] : Missing : Missing;
/** The last segment's {@link Slot}, distributed over a union of keys. */
type FinalSlot<T, K> = K extends unknown ? WriteAt<T, K> extends infer V ? [V] extends [Missing] ? Missing : Slot<V> : never : never;
/** Walks a write path, marking missing parents, absent parents and opaque values on the way. */
type WriteWalk<T, P extends PathTuple> = P extends readonly [] ? Slot<T> : P extends readonly [infer K, ...infer R extends PathTuple]
  ? IsLoose<T> extends true ? Slot<unknown> : T extends Missing ? Missing : T extends Absent ? OptionalParent : T extends null | undefined ? OptionalParent : T extends Opaque ? Missing
    : R extends readonly [] ? FinalSlot<T, K> : WriteWalk<ReadStep<T, K>, R>
  : Slot<unknown>;
/** {@link WriteWalk} for any path form. */
type WriteResult<T, P> = WriteWalk<T, ToTuple<P>>;
/** Turns each slot into a setter, so union members combine by intersection. */
type SlotFunctions<R> = R extends Slot<infer V> ? (value: V) => void : never;
/**
 * The type {@link set} accepts for path `P` in `T`: a value that fits the slot in every shape `T` can take.
 *
 * @typeParam T - The data type.
 * @typeParam P - The path type.
 */
export type SlotValue<T, P> = IsLoose<T> extends true ? unknown : Dynamic<P> extends true ? unknown : [Extract<WriteResult<T, P>, Missing | OptionalParent>] extends [never] ? SlotFunctions<WriteResult<T, P>> extends (value: infer V) => void ? V : never : never;
/** Writes retain the input shape only when both the input and path were statically checked. */
export type WriteOutput<T, P> = IsLoose<T> extends true ? unknown : Dynamic<P> extends true ? unknown : T;
/** Whether a write could require constructing an absent parent. */
export type HasOptionalParent<T, P> = IsLoose<T> extends true ? false : Dynamic<P> extends true ? false : [Extract<WriteResult<T, P>, OptionalParent>] extends [never] ? false : true;
/** Whether no member of the input shape supports a readable path. */
export type IsBadPath<T, P> = IsLoose<T> extends true ? false : Dynamic<P> extends true ? false : [Exclude<ReadWalk<T, ToTuple<P>>, Absent>] extends [never] ? false : [Exclude<ReadWalk<T, ToTuple<P>>, Absent>] extends [Missing] ? true : false;

/** A key as it can appear in a suggested dot path; keys containing dots can't, so they're dropped. */
type HintKey<K> = K extends string | number ? `${K}` extends `${string}.${string}` ? never : `${K}` : never;
/** Autocomplete suggestions only; actual path validation has no depth cap. */
export type Paths<T, D extends number = 5, Seen extends unknown[] = []> = Seen['length'] extends D ? never : T extends Opaque ? never : T extends readonly unknown[] ? IsTuple<T> extends true ? { [K in keyof T & `${number}`]: K | `${K}.${Paths<NonNullable<T[K]>, D, [...Seen, unknown]>}` }[keyof T & `${number}`] : `${number}` | `${number}.${Paths<NonNullable<T[number]>, D, [...Seen, unknown]>}` : T extends object ? { [K in keyof T & Key]-?: HintKey<K> | `${HintKey<K>}.${Paths<NonNullable<T[K]>, D, [...Seen, unknown]>}` }[keyof T & Key] : never;
/** Suggested paths plus dynamically checked strings, indices, tuples and lenses. */
export type PathFor<T> = IsLoose<T> extends true ? PathInput : Paths<T> | PathTuple | number | (string & Record<never, never>) | HasPath;
/**
 * The type a rejected path or value is checked against. It can't be satisfied, so the compiler error shows its
 * message and what would have fit.
 *
 * @typeParam Msg - What is wrong.
 * @typeParam Expected - What would have been accepted.
 * @typeParam Got - What was passed.
 */
export interface PathTypeError<Msg extends string, Expected, Got> {
  /** What is wrong, shown in the compiler error. */
  readonly __pathTypeError: Msg;
  /** What would have been accepted, such as the suggested paths. */
  readonly expected: Expected;
  /** What was passed. */
  readonly got: Got;
}
/** Validates readable literal paths without claiming a shape for dynamic paths. */
export type CheckPath<T, P> = IsBadPath<T, P> extends true ? PathTypeError<'path not found; expected one of the suggested paths', Paths<T>, P> : unknown;
/** Rejects writes through missing, nullable, or unsupported parents. */
export type CheckWritePath<T, P> = IsLoose<T> extends true ? unknown : Dynamic<P> extends true ? unknown : HasOptionalParent<T, P> extends true ? PathTypeError<'a parent may be missing; set the whole parent instead', P, T> : [Extract<WriteResult<T, P>, Missing>] extends [never] ? unknown : PathTypeError<'path is not writable in every input shape; expected one of the suggested paths', Paths<T>, P>;
/** Validates a replacement value and its parent path. */
export type CheckSet<T, P, V> = CheckWritePath<T, P> & ([V] extends [SlotValue<T, P>] ? unknown : PathTypeError<'value does not fit the path', SlotValue<T, P>, V>);
/** Validates a data-last transform callback against the eventual input. */
export type CheckRead<T, P, A> = CheckPath<T, P> & ([PathValue<T, P>] extends [A] ? unknown : PathTypeError<'function does not accept the path value', A, PathValue<T, P>>);
/** Validates an equality operand against the eventual input. */
export type CheckEq<T, P, V> = CheckPath<T, P> & ([V] extends [PathValue<T, P>] ? unknown : PathTypeError<'value cannot equal the path value', PathValue<T, P>, V>);
/** Values inferred without automatically making replacement arrays readonly tuples. */
export type Narrow = Primitive | object;
/**
 * A reusable, frozen focus on one path, created by {@link lens}. Every method is data-last.
 *
 * @remarks
 * A lens can be passed anywhere a path is accepted, such as `get(obj, someLens)`. When a parent on the path may be
 * missing, `W` is `never`, so `set` and `update` cannot be called; set the parent instead.
 *
 * @typeParam T - The data type the lens reads.
 * @typeParam A - The focused value's type, as {@link PathValue} gives it.
 * @typeParam W - The type writes accept, as {@link SlotValue} gives it, or `never`.
 * @typeParam P - The path as a tuple.
 */
export interface PathLens<T, A, W, P extends PathTuple = PathTuple> {
  /** The parsed path, frozen, such as `['stats', 'visits']`. */
  readonly path: Readonly<P>;
  /**
   * Reads the focused value, like {@link get}.
   *
   * @param obj - The data.
   * @returns The value, or `undefined` where a step is missing.
   */
  get(obj: T): A;
  /**
   * Like {@link getOr}: returns a reader that falls back for `null`, `undefined` or `NaN`.
   *
   * @param fallback - Returned instead of a missing value.
   * @returns A reader of `obj`.
   */
  getOr<const F>(fallback: F): (obj: T) => NonNullable<A> | F;
  /**
   * Like {@link getWith}: returns a reader that passes the focused value through `fn`.
   *
   * @param fn - Called with the value, even when it is `undefined`.
   * @returns A reader of `obj`.
   */
  getWith<R>(fn: (value: A) => R): (obj: T) => R;
  /**
   * Like {@link getEq}: returns a predicate comparing the focused value with `expected`.
   *
   * @param expected - The value to compare with.
   * @param compare - Optional comparator; defaults to `Object.is`.
   * @returns A predicate of `obj`, ready for `.filter`.
   */
  getEq(expected: A, compare?: (actual: A, expected: A) => boolean): (obj: T) => boolean;
  /**
   * Like {@link set}: returns a writer that copies `obj` with `value` at the path.
   *
   * @param value - The replacement.
   * @returns A writer of `obj`. It throws a `TypeError` when a parent is missing.
   */
  set(value: W): (obj: T) => WriteOutput<T, P>;
  /**
   * Like {@link update}: returns a writer that replaces the focused value with `fn(value)`.
   *
   * @param fn - Computes the new value from the current one.
   * @returns A writer of `obj`. It throws a `TypeError` when a parent is missing.
   */
  update(fn: [W] extends [never] ? never : <V extends A>(value: V) => V | W): (obj: T) => WriteOutput<T, P>;
}
