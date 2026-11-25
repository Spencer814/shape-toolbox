import { expectTypeOf } from 'vitest';
import { allDeep, allSettledDeep, allKeyed, allSettledKeyed, applySpecAsync, mapLimit } from '../src/index.js';
import type { DeepAwaited, DeepSettled, Spec, SpecArgs, SpecOptions, SpecResult, SpecSettled } from '../src/index.js';

/** Deep resolution types unwrap nested promises and keep leaves. */
expectTypeOf<DeepAwaited<Promise<{ a: Promise<1>; readonly b: readonly [Promise<'x'>, 2] }>>>().toEqualTypeOf<{ a: 1; b: ['x', 2] }>();
expectTypeOf<DeepAwaited<{ a?: Promise<number>; date: Date; map: Map<string, Promise<number>> }>>().toEqualTypeOf<{ a?: number; date: Date; map: Map<string, Promise<number>> }>();
expectTypeOf<DeepSettled<{ a: Promise<number>; b: 1; c: readonly [Promise<string>] }>>().toEqualTypeOf<{ a: PromiseSettledResult<number>; b: 1; c: [PromiseSettledResult<string>] }>();
expectTypeOf<DeepSettled<Promise<{ a: Promise<number> }>>>().toEqualTypeOf<PromiseSettledResult<{ a: PromiseSettledResult<number> }>>();

/**
 * Adds two numbers asynchronously.
 *
 * @param a - One number.
 * @param b - The other.
 * @returns The sum.
 */
const add = async (a: number, b: number): Promise<number> => a + b;
/**
 * Formats a number.
 *
 * @param a - The number.
 * @returns Its text.
 */
const label = (a: number): string => String(a);
/** A runner over a spec with mixed shapes. */
const load = applySpecAsync({ sum: add, nested: { label }, array: [add, label], empty: [] });
/** Spec runners keep parameter types and result shapes for mixed leaves. */
expectTypeOf<Parameters<typeof load>>().toEqualTypeOf<[number, number]>();
expectTypeOf<ReturnType<typeof load>>().toEqualTypeOf<Promise<{ sum: number; nested: { label: string }; array: [number, string]; empty: [] }>>();
expectTypeOf<SpecArgs<{}>>().toEqualTypeOf<[]>();
expectTypeOf<SpecArgs<{ a: (x: { id: number }) => 1; b: (x: { name: string }, enabled: boolean) => 2 }>>().toEqualTypeOf<[{ id: number } & { name: string }, boolean]>();

/** A leaf with an optional argument beside one without. */
const optional = applySpecAsync({ a: (id: number, label?: string) => label, b: (id: number) => id });
optional(1);
optional(1, 'ok');
// @ts-expect-error optional argument must retain its type
optional(1, 2);
// @ts-expect-error required argument cannot disappear
optional();
/** Leaves where every argument is optional. */
const allOptional = applySpecAsync({ a: (id?: number) => id, b: () => 1 });
allOptional();
allOptional(1);
// @ts-expect-error optional argument cannot have a different type
allOptional('bad');
/** Leaves where one requires what another makes optional. */
const requiredWins = applySpecAsync({ a: (id?: number) => id, b: (id: number) => id });
requiredWins(1);
// @ts-expect-error a required leaf argument remains required
requiredWins();
/** Leaves with a rest parameter. */
const rest = applySpecAsync({ a: (id: number, ...labels: string[]) => labels, b: (id: number) => id });
rest(1);
rest(1, 'a', 'b');
// @ts-expect-error rest argument must be a string
rest(1, 'a', 2);
/** A rest leaf beside a leaf with no parameters. */
const onlyRest = applySpecAsync({ a: (...ids: number[]) => ids, b: () => 1 });
onlyRest();
onlyRest(1, 2, 3);
// @ts-expect-error rest arguments retain element types
onlyRest('bad');
/** Two leaves taking the same boolean. */
const booleanArg = applySpecAsync({ a: (enabled: boolean) => enabled, b: (enabled: boolean, id: number) => id });
booleanArg(true, 1);
booleanArg(false, 1);
// @ts-expect-error contradictory required parameters are rejected at the definition
applySpecAsync({ a: (id: number) => id, b: (id: string) => id });
// @ts-expect-error primitive values are not specification leaves
applySpecAsync({ a: 1 });
// @ts-expect-error promises are not specification leaves
applySpecAsync({ a: Promise.resolve(1) });
/** A symbol, for the symbol-key rejection. */
const symbolKey = Symbol('key');
// @ts-expect-error symbolic spec keys cannot be represented by failure paths
applySpecAsync({ [symbolKey]: () => 1 });
// @ts-expect-error nested symbolic spec keys are rejected
applySpecAsync({ a: { [symbolKey]: () => 1 } });
// @ts-expect-error missing function argument
load(1);
// @ts-expect-error incompatible arguments
load('1', 2);

/** A settled-mode runner. */
const settled = applySpecAsync({ list: [async (id: number) => id] }, { mode: 'settled' });
/** Options whose mode is only known at runtime. */
const unionOptions: SpecOptions = { mode: Math.random() > 0.5 ? 'all' : 'settled' };
/** A runner built with them. */
const unionMode = applySpecAsync({ a: () => 1 }, unionOptions);
/** The `mode` option picks the result type, including a union when unknown. */
expectTypeOf<ReturnType<typeof settled>>().toEqualTypeOf<Promise<{ list: [PromiseSettledResult<number>] }>>();
expectTypeOf<ReturnType<typeof unionMode>>().toEqualTypeOf<Promise<{ a: number } | { a: PromiseSettledResult<number> }>>();
expectTypeOf<SpecResult<readonly [() => Promise<1>]>>().toEqualTypeOf<[1]>();
expectTypeOf<SpecSettled<readonly [() => Promise<1>]>>().toEqualTypeOf<[PromiseSettledResult<1>]>();

/** A keyed resolution. */
const keyed = allKeyed({ a: Promise.resolve(1), b: 'two' });
/** A settled keyed resolution. */
const keyedSettled = allSettledKeyed({ a: Promise.resolve(1) });
/** A deep resolution. */
const deep = allDeep({ a: [Promise.resolve(1)] });
/** A settled deep resolution. */
const deepSettled = allSettledDeep({ a: [Promise.resolve(1)] });
/** A limited map using the signal and index. */
const limited = mapLimit([1, 2], (id, index, signal) => { signal.throwIfAborted(); return Promise.resolve(id + index); });
/** The keyed, deep and map helpers infer their results. */
expectTypeOf<typeof keyed>().toEqualTypeOf<Promise<{ a: number; b: 'two' }>>();
expectTypeOf<typeof keyedSettled>().toEqualTypeOf<Promise<{ a: PromiseSettledResult<number> }>>();
expectTypeOf<typeof deep>().toEqualTypeOf<Promise<{ a: number[] }>>();
expectTypeOf<typeof deepSettled>().toEqualTypeOf<Promise<{ a: PromiseSettledResult<number>[] }>>();
expectTypeOf<typeof limited>().toEqualTypeOf<Promise<number[]>>();

void [settled, unionMode, keyed, keyedSettled, deep, deepSettled, limited];

/** A leaf with a default parameter. */
const defaults = applySpecAsync({ total: async (amount: number, tax = 0) => amount + tax, nested: { label: (amount: number) => String(amount) }, list: [async (amount: number) => amount * 2] }, { concurrency: 2 });
defaults(10);
defaults(10, 2);
// @ts-expect-error default-valued parameters keep their inferred type
defaults(10, 'tax');
/** A keyed result over a tuple. */
const indexed = await allKeyed([Promise.resolve(1), Promise.resolve('two')] as const);
/** A settled keyed result over a tuple. */
const indexedSettled = await allSettledKeyed([Promise.resolve(1)] as const);
/** The first element's type. */
const first: number = indexed[0];
/** The second element's type. */
const second: string = indexed[1];
/** The first settled element's type. */
const firstSettled: PromiseSettledResult<number> = indexedSettled[0];
// @ts-expect-error keyed output is a record, not an array
void indexed.map;
// @ts-expect-error nonenumerable array length is absent
void indexed.length;
// @ts-expect-error keyed settled output is a record, not an array
void indexedSettled.map;
// @ts-expect-error nonenumerable array length is absent
void indexedSettled.length;
void [first, second, firstSettled];

/** Options that may be `undefined`. */
const maybeOptions: SpecOptions | undefined = Math.random() > 0.5 ? { mode: 'settled' } : undefined;
/** A runner built with them. */
const optionalOptions = applySpecAsync({ a: () => 1 }, maybeOptions);
/** A symbol key for the decorated array. */
const customKey = Symbol('custom');
/** An array with string and symbol properties. */
const decoratedInput = Object.assign([Promise.resolve(1)], { title: Promise.resolve('title'), [customKey]: Promise.resolve(true) });
/** Its keyed result. */
const decoratedOutput = await allKeyed(decoratedInput);
/** Its settled keyed result. */
const decoratedSettledOutput = await allSettledKeyed(decoratedInput);
/** The awaited string property. */
const title: string = decoratedOutput.title;
/** The awaited symbol property. */
const custom: boolean = decoratedOutput[customKey];
/** The settled string property. */
const settledTitle: PromiseSettledResult<string> = decoratedSettledOutput.title;
/** The settled symbol property. */
const settledCustom: PromiseSettledResult<boolean> = decoratedSettledOutput[customKey];
void [optionalOptions, title, custom, settledTitle, settledCustom];

/** A rest leaf beside an optional one. */
const restWithOptional = applySpecAsync({ a: (...ids: number[]) => ids, b: (id?: number) => id });
restWithOptional();
restWithOptional(1, 2);
// @ts-expect-error omission is valid but explicit undefined is not accepted by the rest-only leaf
restWithOptional(undefined);
/** Two leaves whose optional types never overlap. */
const disjointOptionalRest = applySpecAsync({ a: (...ids: number[]) => ids, b: (id?: string) => id });
disjointOptionalRest();
// @ts-expect-error these leaves can only share an empty argument list
disjointOptionalRest(1);
// @ts-expect-error explicit undefined is not accepted by the number rest leaf
disjointOptionalRest(undefined);

// Native assimilation removes nested promise/thenable wrappers before settlement.
/** A promise that resolves to a promise. */
const nestedPromise = new Promise<Promise<number>>((resolve) => resolve(Promise.resolve(1)));
/** Its settled result. */
const nativeSettled = await allSettledDeep(nestedPromise);
if (nativeSettled.status === 'fulfilled') {
  /** The value inside the settled result. */
  const value: number = nativeSettled.value;
  void value;
}
/** Nested promises are assimilated as the runtime resolves them. */
expectTypeOf<DeepSettled<Promise<Promise<number>>>>().toEqualTypeOf<PromiseSettledResult<number>>();
expectTypeOf<DeepSettled<PromiseLike<PromiseLike<number>>>>().toEqualTypeOf<PromiseSettledResult<number>>();
expectTypeOf<DeepSettled<Promise<{ child: Promise<number> }>>>().toEqualTypeOf<PromiseSettledResult<{ child: PromiseSettledResult<number> }>>();

// Broad annotations erase leaf signatures but must not trigger recursive instantiation.
/** A spec of unknown shape. */
declare const broadSpec: Spec;
/** An array of specs. */
declare const broadArray: readonly Spec[];
/** A record of specs. */
declare const broadRecord: Record<string, Spec>;
/** A call on the broad spec. */
const broadOutput = applySpecAsync(broadSpec)(1, 'value');
/** A call on the broad array. */
const broadArrayOutput = applySpecAsync(broadArray)(1, 'value');
/** A call on the broad record. */
const broadRecordOutput = applySpecAsync(broadRecord)(1, 'value');
/** A known leaf beside a broad spec. */
const mixedBroad = applySpecAsync({ known: (id: number) => id, erased: broadSpec });
mixedBroad(1);
// @ts-expect-error a broad sibling does not erase the known leaf's required argument
mixedBroad();
// @ts-expect-error a broad sibling does not erase the known leaf's parameter type
mixedBroad('bad');
/** Specs of unknown shape stay usable. */
expectTypeOf<SpecArgs<Spec>>().toEqualTypeOf<unknown[]>();
expectTypeOf<SpecArgs<readonly Spec[]>>().toEqualTypeOf<unknown[]>();
expectTypeOf<typeof broadOutput>().toEqualTypeOf<Promise<unknown>>();
expectTypeOf<typeof broadArrayOutput>().toEqualTypeOf<Promise<unknown[]>>();
expectTypeOf<typeof broadRecordOutput>().toEqualTypeOf<Promise<{ [key: string]: unknown }>>();
void [broadOutput, broadArrayOutput, broadRecordOutput];

// Structural interface validation cannot require an index signature.
/** A spec described by an interface. */
interface InterfaceSpec { /** Its single leaf. */ read: (id: number) => number }
/** A value of that interface. */
declare const interfaceSpec: InterfaceSpec;
/** A runner from it. */
const fromInterface = applySpecAsync(interfaceSpec);
/** Its result type. */
const interfaceOutput: Promise<{ read: number }> = fromInterface(1);
// @ts-expect-error interface-typed leaves retain required parameters
fromInterface();
/** A spec interface that refers to itself. */
interface RecursiveSpec { /** Its leaf. */ leaf: (id: number) => number; /** Its optional children. */ children?: readonly RecursiveSpec[] }
/** A value of the recursive spec. */
declare const recursiveSpec: RecursiveSpec;
/** A runner from it. */
const fromRecursive = applySpecAsync(recursiveSpec);
/** Its result. */
const recursiveOutput = await fromRecursive(1);
/** The top-level leaf value. */
const recursiveValue: number = recursiveOutput.leaf;
/** A child leaf value. */
const recursiveChildValue: number | undefined = recursiveOutput.children?.[0]?.leaf;
// @ts-expect-error recursive spec back edges cannot erase known required arguments
fromRecursive();
void [interfaceOutput, recursiveValue, recursiveChildValue];

// Detect impossible required properties without rejecting optional or union alternatives.
// @ts-expect-error a required field cannot be both number and string
applySpecAsync({ a: (x: { id: number }) => x.id, b: (x: { id: string }) => x.id });
// @ts-expect-error impossibility can occur inside a required nested object
applySpecAsync({ a: (x: { parent: { id: number } }) => x.parent.id, b: (x: { parent: { id: string } }) => x.parent.id });
// @ts-expect-error required tuple elements cannot satisfy disjoint constraints
applySpecAsync({ a: (x: [number]) => x[0], b: (x: [string]) => x[0] });
/** Leaves needing different optional parents. */
const optionalFields = applySpecAsync({ a: (x: { parent?: { id: number } }) => x.parent, b: (x: { parent?: { id: string } }) => x.parent });
optionalFields({});
/** Leaves needing overlapping union fields. */
const unionFields = applySpecAsync({ a: (x: { id: number } | { name: string }) => x, b: (x: { id: string }) => x.id });
unionFields({ id: 'ok', name: 'still inhabitable' });
/** Leaves needing records of different values. */
const dictionaries = applySpecAsync({ a: (x: Record<string, number>) => x, b: (x: Record<string, string>) => x });
dictionaries({});
/** A parameter type that refers to itself. */
interface RecursiveInput { /** Its value. */ value: number; /** Its next node. */ next: RecursiveInput }
/** A value of that type. */
declare const recursiveInput: RecursiveInput;
/** Two leaves sharing a recursive argument. */
const recursiveArguments = applySpecAsync({ a: (x: RecursiveInput) => x.value, b: (x: RecursiveInput) => x.next.value });
recursiveArguments(recursiveInput);
// @ts-expect-error incompatible required values inside recursive arguments remain impossible
applySpecAsync({ a: (x: RecursiveInput) => x.value, b: (x: { next: { value: string } }) => x.next.value });
/** Leaves with callback arguments. */
const callbacks = applySpecAsync({ a: (x: { callback: (id: number) => void }) => x, b: (x: { callback: (name: string) => void }) => x });
callbacks({ callback: (value: unknown) => { void value; } });

/** A twelve-level spec. */
const depth12 = applySpecAsync({ nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: (id: number) => id } } } } } } } } } } } });
depth12(1);
// @ts-expect-error deeply nested required arguments cannot be silently dropped
depth12();

/** An eighteen-level spec, past common recursion limits. */
const depth18 = applySpecAsync({ nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: { nested: (id: number) => id } } } } } } } } } } } } } } } } } });
depth18(1);
// @ts-expect-error deeply nested required arguments cannot be silently dropped
depth18();

// No export hands `any` back to a caller, even when the input is `any`.
import { failedPath, get, getOr, set } from '../src/index.js';
/** Data typed as `any`. */
declare const loose: any;
/** `any` input never comes out of the async helpers as `any`. */
expectTypeOf<Awaited<ReturnType<typeof allDeep<typeof loose>>>>().not.toBeAny();
expectTypeOf<Awaited<ReturnType<typeof allSettledDeep<typeof loose>>>>().not.toBeAny();
expectTypeOf<ReturnType<typeof failedPath>>().not.toBeAny();
/** A read of `any` data. */
const looseRead = get(loose, 'a.b');
/** A fallback read of `any` data. */
const looseFallback = getOr(loose, 'a', 1);
/** A write on `any` data. */
const looseWrite = set(loose, 'a', 1);
/** `any` input never comes out of the path helpers as `any`. */
expectTypeOf<typeof looseRead>().not.toBeAny();
expectTypeOf<typeof looseFallback>().not.toBeAny();
expectTypeOf<typeof looseWrite>().not.toBeAny();
