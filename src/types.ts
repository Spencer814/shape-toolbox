/** Matches every function without `any`: `never[]` parameters accept any function under strict variance. */
export type AnyFunction = (...args: never[]) => unknown;
/** True only for `any`. */
export type IsAny<T> = 0 extends (1 & T) ? true : false;
/** Values the deep helpers and path suggestions treat as leaves instead of walking into. */
export type Atomic =
  | string | number | boolean | bigint | symbol | null | undefined
  | AnyFunction | Date | RegExp | ReadonlyMap<unknown, unknown> | ReadonlySet<unknown>
  | WeakMap<object, unknown> | WeakSet<object> | Error | ArrayBuffer | ArrayBufferView;

/**
 * The type {@link allDeep} resolves to: `T` with every promise inside plain objects and arrays replaced by its value.
 *
 * @remarks
 * Promises that resolve to promises are unwrapped all the way down. `readonly` is removed, because the result is a new
 * object. TypeScript cannot tell a class instance from a plain object structurally, so promise fields of a class are
 * typed as awaited even though {@link allDeep} leaves the instance untouched at runtime. `any` input gives `unknown`.
 *
 * @typeParam T - The input shape.
 *
 * @example
 * ```ts
 * import type { DeepAwaited } from 'shape-toolbox';
 *
 * type Page = DeepAwaited<{ user: Promise<{ id: number }>; tags: Promise<string>[] }>;
 * const page: Page = { user: { id: 1 }, tags: ['vip'] };
 * void page;
 * ```
 */
export type DeepAwaited<T> = IsAny<T> extends true ? unknown : T extends PromiseLike<infer U> ? DeepAwaited<U> : T extends Atomic ? T : T extends object ? { -readonly [K in keyof T]: DeepAwaited<T[K]> } : T;

/**
 * A settled result, as `Promise.allSettled` gives, but with the rejection `reason` typed `unknown` instead of `any`.
 *
 * @remarks
 * TypeScript's own `PromiseSettledResult` types `reason` as `any`, which would let it spread into calling code. Narrow
 * `reason` before using it, as you would a caught error.
 *
 * @typeParam T - The fulfilled value's type.
 *
 * @example
 * ```ts
 * import type { Settled } from 'shape-toolbox';
 *
 * const result: Settled<number> = { status: 'rejected', reason: new Error('timeout') };
 * if (result.status === 'rejected' && result.reason instanceof Error) console.log(result.reason.message);
 * ```
 */
export type Settled<T> = PromiseFulfilledResult<T> | {
  /** Always `'rejected'`. */
  status: 'rejected';
  /** Why it failed. Anything can be thrown, so narrow it before use. */
  reason: unknown;
};

/**
 * The type {@link allSettledDeep} resolves to: each promise becomes a {@link Settled} result in place.
 *
 * @remarks
 * Plain values stay as they are. A fulfilled value is itself settled recursively, so a promise of an object holding
 * promises becomes a settled result whose `value` holds more settled results. `any` input gives `unknown`.
 *
 * @typeParam T - The input shape.
 *
 * @example
 * ```ts
 * import type { DeepSettled } from 'shape-toolbox';
 *
 * type Checks = DeepSettled<{ credit: Promise<number>; note: string }>;
 * const checks: Checks = { credit: { status: 'rejected', reason: new Error('timeout') }, note: 'x' };
 * void checks;
 * ```
 */
export type DeepSettled<T> = IsAny<T> extends true ? unknown : T extends PromiseLike<infer U> ? Settled<DeepSettled<Awaited<U>>> : T extends Atomic ? T : T extends object ? { -readonly [K in keyof T]: DeepSettled<T[K]> } : T;

/** Cancellation option accepted by {@link allDeep} and {@link allSettledDeep}. */
export interface SignalOption {
  /**
   * Rejects the result with `signal.reason` as soon as it aborts, including when it is already aborted.
   *
   * @remarks
   * Work that already started keeps running unless it listens to the same signal. After an abort the walk reads
   * nothing more: no getter runs, no custom `then` is called, and resolved values are not followed. Native promises it
   * can still reach through data properties get a handler, so none is reported as unhandled.
   * @defaultValue `undefined` (no cancellation)
   */
  readonly signal?: AbortSignal | undefined;
}

/** Options for {@link mapLimit}. */
export interface LimitOptions extends SignalOption {
  /**
   * The most calls in flight at once: a positive integer, or `Infinity`.
   *
   * @remarks Any other value rejects with a `RangeError` before the mapper is called.
   * @defaultValue `Infinity`
   */
  readonly concurrency?: number | undefined;
}

/** One node of a {@link Spec}: a leaf function or a nested spec. */
type SpecNode = AnyFunction | Spec;
/**
 * A spec for {@link applySpecAsync}: plain objects and arrays, nested to any depth, whose leaves are functions.
 *
 * @remarks Keys are strings or array indices. Symbol keys, non-function leaves and cycles are rejected.
 *
 * @example
 * ```ts
 * import type { Spec } from 'shape-toolbox';
 *
 * const spec = {
 *   profile: async (id: number) => ({ id }),
 *   loan: { rate: async (_id: number) => 6.25 },
 *   terms: [() => 30, () => 15],
 * } satisfies Spec;
 * void spec;
 * ```
 */
export type Spec = { readonly [key: string]: SpecNode } | readonly SpecNode[];

/** Exact type equality, stricter than mutual assignability: `any` equals only `any`. */
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
/** True when `S` is already in `Seen`, which stops recursion through self-referencing spec types. */
type SeenType<S, Seen extends readonly unknown[]> = Seen extends readonly [infer H, ...infer T] ? Same<S, H> extends true ? true : SeenType<S, T> : false;
/** What a bare `AnyFunction` leaf becomes, so its parameters read as `unknown[]`, not `never[]`. */
type UnknownFunction = (...args: unknown[]) => unknown;
/** The union of every leaf function type in a spec. A recursive back edge adds no new leaf, so each node type is visited once. */
type Leaves<S, Seen extends readonly unknown[] = []> = S extends AnyFunction
  ? Same<S, AnyFunction> extends true ? UnknownFunction : S
  : S extends object
    ? SeenType<S, Seen> extends true ? never
      : S extends readonly (infer V)[] ? Leaves<V, [...Seen, S]>
        : { [K in keyof S]-?: Leaves<Required<S>[K], [...Seen, S]> }[keyof S]
    : never;
/** The parameter tuple of a function type, distributed over a union of functions. */
type ParametersOf<F> = F extends (...args: infer A) => unknown ? A : never;
/** True when `U` is a union of more than one member. */
type IsUnion<U, All = U> = U extends unknown ? [All] extends [U] ? false : true : never;
/** True when some parameter list in `U` has a first position (required or optional). */
type HasFixedHead<U> = U extends readonly unknown[] ? '0' extends keyof U ? true : false : false;
/** True when some parameter list in `U` requires its first position. */
type HasRequiredHead<U> = U extends readonly [unknown, ...unknown[]] ? true : false;
/** The first parameter's type, the rest element's type for a rest list, or `unknown` for an empty list. */
type Head<P extends readonly unknown[]> = P extends readonly [] ? unknown : P extends readonly [infer H, ...unknown[]] ? H : '0' extends keyof P ? P[0] : P[number];
/** A parameter list without its first position; rest lists stay as they are. */
type Tail<P extends readonly unknown[]> = P extends readonly [] ? [] : P extends readonly [unknown, ...infer R] ? R : P extends readonly [unknown?, ...infer R] ? R : P;
/** {@link Tail} for each list in a union. */
type Tails<U> = U extends readonly unknown[] ? Tail<U> : never;
/** Each list's first parameter as a setter, so inferring from the union intersects whole parameter types, not the members of a union parameter. */
type HeadFunctions<U> = U extends readonly unknown[] ? (value: Head<U>) => void : never;
/** The type that satisfies the first parameter of every list in `U`. */
type SharedHead<U> = HeadFunctions<U> extends (value: infer H) => void ? H : never;
/** Each list's element type as a setter; an empty list accepts anything. */
type RestFunctions<U> = U extends readonly [] ? (value: unknown) => void : U extends readonly unknown[] ? (value: U[number]) => void : never;
/** The element type that satisfies every rest list in `U`. */
type SharedRest<U> = RestFunctions<U> extends (value: infer E) => void ? E : never;
/** True when some list in `U` is open-ended. */
type HasRest<U> = U extends readonly unknown[] ? number extends U['length'] ? true : false : false;
/** The merged list when no leaf requires the first position: optional if any leaf accepts `undefined` there, otherwise all-or-nothing. */
type OptionalHead<U, H = SharedHead<U>> = [H] extends [never] ? [] : undefined extends H ? [arg?: H, ...MergeParameters<Tails<U>>] : [] | [arg: H, ...MergeParameters<Tails<U>>];
/** Merges several parameter lists position by position, as {@link SpecArgs} describes. */
type MergeParameters<U> = true extends HasFixedHead<U>
  ? true extends HasRequiredHead<U> ? [arg: SharedHead<U>, ...MergeParameters<Tails<U>>] : OptionalHead<U>
  : true extends HasRest<U> ? SharedRest<U>[] : [];

/**
 * The parameters of the function {@link applySpecAsync} returns: position `i` satisfies every leaf that reads it.
 *
 * @remarks
 * When every leaf has the same parameter list, that list is used as is, so parameter names show in editor hovers.
 * Otherwise parameters are intersected position by position; a position is required if any leaf requires it, and rest
 * parameters merge. Leaves that need incompatible values at the same position are rejected where the spec is written.
 *
 * @typeParam S - The spec type.
 */
export type SpecArgs<S> = [ParametersOf<Leaves<S>>] extends [never] ? [] : true extends IsUnion<ParametersOf<Leaves<S>>> ? MergeParameters<ParametersOf<Leaves<S>>> : ParametersOf<Leaves<S>>;

/**
 * What {@link applySpecAsync} resolves to in `'all'` mode: each leaf replaced by its awaited return value.
 *
 * @remarks Objects stay objects and arrays and tuples keep their positions.
 * @typeParam S - The spec type.
 */
export type SpecResult<S> = Same<S, Spec> extends true ? unknown : S extends AnyFunction ? Awaited<ReturnType<S>> : { -readonly [K in keyof S]: SpecResult<S[K]> };

/**
 * What {@link applySpecAsync} resolves to in `'settled'` mode: each leaf replaced by a {@link Settled} result.
 *
 * @typeParam S - The spec type.
 */
export type SpecSettled<S> = Same<S, Spec> extends true ? unknown : S extends AnyFunction ? Settled<Awaited<ReturnType<S>>> : { -readonly [K in keyof S]: SpecSettled<S[K]> };

/** Options for {@link applySpecAsync}. */
export interface SpecOptions {
  /**
   * The most leaves in flight at once, counted across the whole spec at every depth.
   *
   * @remarks A positive integer or `Infinity`; anything else rejects each call with a `RangeError`.
   * @defaultValue `Infinity`
   */
  readonly concurrency?: number | undefined;
  /**
   * Stops leaves that have not started and rejects the call with the signal's reason.
   *
   * @remarks
   * An aborted signal stays aborted, so a plain signal fails every call after it fires. Pass a function instead, such
   * as `() => AbortSignal.timeout(5_000)`, to create a fresh signal for each call. Leaves do not receive the signal;
   * pass it through your own arguments when their I/O should stop too.
   * @defaultValue `undefined` (no cancellation)
   */
  readonly signal?: AbortSignal | (() => AbortSignal) | undefined;
  /**
   * `'all'` rejects on the first failing leaf with its error, unchanged. `'settled'` never rejects for a leaf and puts
   * a {@link Settled} result at each leaf's position.
   *
   * @defaultValue `'all'`
   */
  readonly mode?: 'all' | 'settled' | undefined;
}

/** True for a declared property that must be present; index signatures and optional keys aren't required. */
type RequiredKey<T, K extends keyof T> = string extends K ? false : number extends K ? false : symbol extends K ? false : Pick<T, K> extends Required<Pick<T, K>> ? true : false;
/** For each required property of `T`, whether its type can never be satisfied. */
type ImpossibleProperties<T, Seen extends readonly unknown[]> = { [K in keyof T as K]-?: RequiredKey<T, K> extends true ? ImpossibleValue<T[K], [...Seen, T]> : false };
/** True when one non-union object type has a required property that can never be satisfied. */
type ImpossibleMember<T, Seen extends readonly unknown[]> = T extends Atomic ? false : T extends object
  ? SeenType<T, Seen> extends true ? false
    : true extends ImpossibleProperties<T, Seen>[keyof ImpossibleProperties<T, Seen>] ? true : false
  : false;
/** True when no value fits `T`, such as `never` or an object needing a `never` field. A union is impossible only when every alternative is; optional fields may be absent. */
type ImpossibleValue<T, Seen extends readonly unknown[] = []> = IsAny<T> extends true ? false : [T] extends [never] ? true : false extends (T extends unknown ? ImpossibleMember<T, Seen> : never) ? false : true;
/** True when a required merged argument can never be supplied, which means two leaves disagree about it. */
type HasImpossibleRequired<A extends readonly unknown[]> = A extends readonly [infer H, ...infer T] ? ImpossibleValue<H> extends true ? true : HasImpossibleRequired<T> : false;
/** The keys of a spec node that hold children; array methods are excluded. */
type OwnSpecKeys<S> = S extends readonly unknown[] ? Exclude<keyof S, keyof unknown[]> : keyof S;
/** A string naming the first problem in a spec (a symbol key or a non-function leaf), or `never` when it is valid. */
type InvalidNodes<S, Seen extends readonly unknown[] = []> = S extends AnyFunction ? never : S extends object
  ? SeenType<S, Seen> extends true ? never
    : Extract<OwnSpecKeys<S>, symbol> extends never
      ? { [K in OwnSpecKeys<S>]-?: InvalidNodes<Required<S>[K], [...Seen, S]> }[OwnSpecKeys<S>]
        | (S extends readonly unknown[] ? InvalidNodes<S[number], [...Seen, S]> : never)
      : 'symbol specification key'
  : 'non-function specification leaf';
/** Rejects symbolic keys, non-function leaves, and impossible required arguments at their definition. */
export type CompatibleSpec<S> = Spec extends S ? unknown : S extends AnyFunction ? never : [InvalidNodes<S>] extends [never] ? HasImpossibleRequired<SpecArgs<S>> extends true ? never : unknown : never;
