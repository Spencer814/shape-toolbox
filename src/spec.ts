import { recordFailure } from './failure.js';
import { defineValue, fulfilled, isContainer, rejected, toSegment, type Key } from './internal.js';
import { mapLimit } from './map-limit.js';
import type { CompatibleSpec, SpecArgs, SpecOptions, SpecResult, SpecSettled } from './types.js';

/** A spec leaf as the runtime sees it, after the types have checked its parameters. */
type Leaf = (...args: readonly unknown[]) => unknown;
/** A leaf index, or a container captured at definition: kind, length and prototype never follow later spec edits. */
type Shape = number | { readonly length: number | undefined; readonly prototype: object | null; readonly entries: readonly (readonly [string, Shape])[] };

/** A validated spec: the shape to rebuild, plus each leaf in call order with its path. */
interface Compiled {
  /** How to rebuild the result from the leaf results. */
  readonly shape: Shape;
  /** Every leaf function, in the order its result appears, with its path for {@link failedPath}. */
  readonly leaves: readonly { readonly fn: Leaf; readonly path: readonly Key[] }[];
}

/**
 * Formats a spec path for error messages, such as `loan.rate`, or `(root)`.
 *
 * @param path - The path.
 * @returns The label.
 */
const label = (path: readonly Key[]): string => path.length === 0 ? '(root)' : path.join('.');

/**
 * Validates the spec once and records where each leaf goes, so each call only runs leaves and fills slots.
 *
 * @param spec - The caller's spec.
 * @returns The shape and the leaf list.
 * @throws `TypeError` for a non-container spec, a non-function leaf, a cycle or an enumerable symbol key.
 */
function compile(spec: unknown): Compiled {
  /** Every leaf, in depth-first order; a leaf's position here is where its result goes. */
  const leaves: { fn: Leaf; path: readonly Key[] }[] = [];
  /**
   * Compiles one node, appending leaves in depth-first order.
   *
   * @param node - The spec node.
   * @param path - Its location.
   * @param ancestors - The containers above it, for cycle detection.
   * @returns The leaf's index, or the container's shape.
   */
  const visit = (node: unknown, path: readonly Key[], ancestors: readonly object[]): Shape => {
    if (typeof node === 'function') return leaves.push({ fn: node as Leaf, path }) - 1;
    if (!isContainer(node)) throw new TypeError(`applySpecAsync: the leaf at ${label(path)} is not a function`);
    if (ancestors.includes(node)) throw new TypeError(`applySpecAsync: circular spec at ${label(path)}`);
    if (Object.getOwnPropertySymbols(node).some(key => Object.prototype.propertyIsEnumerable.call(node, key))) {
      throw new TypeError(`applySpecAsync: spec keys at ${label(path)} must be strings or array indices`);
    }
    /** Ancestors for the children: this node plus everything above it. */
    const chain = [...ancestors, node];
    /** Each key with its compiled child, in key order. */
    const entries = Object.keys(node).map(key =>
      [key, visit((node as Record<string, unknown>)[key], [...path, toSegment(node, key)], chain)] as const);
    return { length: Array.isArray(node) ? node.length : undefined, prototype: Object.getPrototypeOf(node) as object | null, entries };
  };
  if (!isContainer(spec)) throw new TypeError('applySpecAsync expects an object or array spec');
  return { shape: visit(spec, [], []), leaves };
}

/**
 * Rebuilds the result: each leaf index becomes its result, each container a fresh copy of the captured kind.
 *
 * @param shape - The compiled shape.
 * @param results - Leaf results in leaf order.
 * @returns The result for this shape.
 */
function materialize(shape: Shape, results: readonly unknown[]): unknown {
  if (typeof shape === 'number') return results[shape];
  /** A fresh object with the captured prototype, or an array of the captured length. */
  const output: object = shape.length === undefined ? Object.create(shape.prototype) as object : new Array<unknown>(shape.length);
  for (const [key, child] of shape.entries) defineValue(output, key, materialize(child, results));
  return output;
}

/**
 * Turns a nested object or array of functions into one async function. Calling it calls every leaf with the same
 * arguments and resolves to the same shape, each leaf replaced by its result.
 *
 * @remarks
 * The spec is read and validated once, here; later changes to the spec object don't affect the returned function.
 * No leaf runs until that function is called, and it can be called any number of times. `concurrency` counts leaves
 * across the whole spec, so `concurrency: 4` means at most four leaves in flight at every depth combined. Leaves are
 * called with exactly the arguments you pass: no currying and no extra signal argument.
 *
 * @typeParam S - The spec type, inferred as a literal so each leaf's result type is kept.
 * @param spec - Plain objects and arrays whose leaves are functions. See {@link Spec}.
 * @param options - Optional {@link SpecOptions}. Omit `mode` or pass `'all'` to reject on the first failure.
 * @returns A function taking {@link SpecArgs} and resolving to {@link SpecResult}.
 * @throws `TypeError`, immediately, when a leaf is not a function, a key is a symbol, or the spec has a cycle. The
 * message names the path, such as `the leaf at loan.rate is not a function`.
 * @throws From the returned function: the first leaf error, unchanged, as a rejection ({@link failedPath} gives the
 * leaf's path); the signal's reason when it aborts; `RangeError` for an invalid `concurrency`.
 *
 * @example
 * ```ts
 * import { applySpecAsync } from 'shape-toolbox';
 *
 * const loadLoan = applySpecAsync(
 *   {
 *     borrower: async (id: number) => ({ id, name: 'Ada' }),
 *     pricing: { rate: async (_id: number) => 6.25 },
 *     documents: [async (_id: number) => 'w2', async (_id: number) => 'paystub'],
 *   },
 *   { concurrency: 2, signal: () => AbortSignal.timeout(5_000) },
 * );
 * const loan = await loadLoan(42);
 * // { borrower: { id: 42, name: 'Ada' }, pricing: { rate: 6.25 }, documents: ['w2', 'paystub'] }
 * void loan;
 * ```
 *
 * @see {@link failedPath} for where a failure happened.
 */
export function applySpecAsync<const S extends object>(spec: S & CompatibleSpec<NoInfer<S>>, options?: SpecOptions & { readonly mode?: 'all' | undefined }): (...args: SpecArgs<S>) => Promise<SpecResult<S>>;
/**
 * The settled form of {@link applySpecAsync}: every leaf runs and its position holds a `PromiseSettledResult`.
 *
 * @remarks A failing leaf never rejects the call, but still records its path for {@link failedPath}.
 *
 * @typeParam S - The spec type.
 * @param spec - Plain objects and arrays whose leaves are functions.
 * @param options - {@link SpecOptions} with `mode: 'settled'`.
 * @returns A function taking {@link SpecArgs} and resolving to {@link SpecSettled}.
 * @throws `TypeError`, immediately, for an invalid spec. The returned function rejects only on abort or an invalid
 * `concurrency`.
 *
 * @example
 * ```ts
 * import { applySpecAsync } from 'shape-toolbox';
 *
 * const checkAll = applySpecAsync(
 *   { credit: async () => { throw new Error('timeout'); }, income: async () => 5200 },
 *   { mode: 'settled' },
 * );
 * const { credit, income } = await checkAll();
 * console.log(credit.status, income.status); // 'rejected' 'fulfilled'
 * ```
 */
export function applySpecAsync<const S extends object>(spec: S & CompatibleSpec<NoInfer<S>>, options: SpecOptions & { readonly mode: 'settled' }): (...args: SpecArgs<S>) => Promise<SpecSettled<S>>;
/**
 * {@link applySpecAsync} with a `mode` only known at runtime: the result is either shape.
 *
 * @typeParam S - The spec type.
 * @param spec - Plain objects and arrays whose leaves are functions.
 * @param options - {@link SpecOptions} whose `mode` is `'all' | 'settled'`.
 * @returns A function resolving to {@link SpecResult} or {@link SpecSettled}.
 * @throws `TypeError`, immediately, for an invalid spec.
 */
export function applySpecAsync<const S extends object>(spec: S & CompatibleSpec<NoInfer<S>>, options?: SpecOptions): (...args: SpecArgs<S>) => Promise<SpecResult<S> | SpecSettled<S>>;
/**
 * @privateRemarks
 * Implementation shared by every `applySpecAsync` overload: compiles once, then each call runs the leaves through
 * {@link mapLimit} and rebuilds the shape.
 */
export function applySpecAsync(spec: object, options?: SpecOptions): (...args: readonly unknown[]) => Promise<unknown> {
  /** The compiled spec, built once for every call. */
  const { shape, leaves } = compile(spec);
  /** Whether leaf failures become settled results instead of rejecting. */
  const settled = options?.mode === 'settled';
  return async (...args) => {
    /** This call's signal: a fresh one from the factory, or the shared one. */
    const signal = typeof options?.signal === 'function' ? options.signal() : options?.signal;
    /** Each leaf's result (or settled result), in leaf order. */
    const results = await mapLimit(leaves, async ({ fn, path }) => {
      try {
        /** The leaf's result, awaited inside `try` so its error can be recorded with the leaf's path. */
        const value = await fn(...args);
        return settled ? fulfilled(value) : value;
      } catch (error) {
        recordFailure(error, path);
        if (settled) return rejected(error);
        throw error;
      }
    }, { concurrency: options?.concurrency, signal });
    return materialize(shape, results);
  };
}
