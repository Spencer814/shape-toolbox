import { expectTypeOf } from 'vitest';
import { get, getOr, getWith, getEq, set, update, lens } from '../src/path.js';
import type { HasOptionalParent, ParsePath, PathValue, SlotValue, WriteOutput } from '../src/path-types.js';
/** A model covering every path shape the type tests exercise. */
interface User {
  /** A required number. */
  id: number;
  /** A required string. */
  name: string;
  /** A literal union. */
  status: 'active' | 'inactive';
  /** A boolean. */
  enabled: boolean;
  /** An open array. */
  tags: string[];
  /** An optional object with a nullable field. */
  address?: { city: string; zip: string | null };
  /** A readonly tuple with a nested object. */
  pair: readonly [number, { deep: boolean }];
  /** A tuple with an optional element. */
  optionalPair: readonly [number, string?];
  /** An index signature. */
  meta: Record<string, { score: number }>;
  /** A method-like property. */
  action: (id: number) => string;
}
/** A value of the model, never created at runtime. */
declare const user: User;
/** A list of the model. */
declare const users: User[];
/** Path parsing, read types and write slots. */
expectTypeOf<ParsePath<'a.b.0.c'>>().toEqualTypeOf<['a', 'b', 0, 'c']>();
expectTypeOf<ParsePath<'items.-1'>>().toEqualTypeOf<['items', -1]>();
expectTypeOf<ParsePath<'a.01'>>().toEqualTypeOf<['a', '01']>();
expectTypeOf<ParsePath<'a.1e3'>>().toEqualTypeOf<['a', '1e3']>();
expectTypeOf<ParsePath<'a.-0'>>().toEqualTypeOf<['a', '-0']>();
expectTypeOf<PathValue<User, 'address.city'>>().toEqualTypeOf<string | undefined>();
expectTypeOf<PathValue<User, 'address.zip'>>().toEqualTypeOf<string | null | undefined>();
expectTypeOf<PathValue<User, 'tags.0'>>().toEqualTypeOf<string | undefined>();
expectTypeOf<PathValue<User, 'pair.1.deep'>>().toEqualTypeOf<boolean>();
expectTypeOf<PathValue<User, ['pair', -1, 'deep']>>().toEqualTypeOf<boolean>();
expectTypeOf<PathValue<User, ['pair', -2]>>().toEqualTypeOf<number>();
expectTypeOf<PathValue<User, ['optionalPair', -1]>>().toEqualTypeOf<number | string | undefined>();
expectTypeOf<PathValue<User, 'meta.x.score'>>().toEqualTypeOf<number | undefined>();
expectTypeOf<SlotValue<User, 'address'>>().toEqualTypeOf<{ city: string; zip: string | null }>();
expectTypeOf<SlotValue<User, 'tags.0'>>().toEqualTypeOf<string>();
expectTypeOf<SlotValue<User, ['pair', -2]>>().toEqualTypeOf<number>();
expectTypeOf<PathValue<{ a: { b: 1 } } | { c: 2 }, 'a.b'>>().toEqualTypeOf<1 | undefined>();
expectTypeOf<HasOptionalParent<User, 'address.city'>>().toEqualTypeOf<true>();
expectTypeOf<HasOptionalParent<User | null, 'id'>>().toEqualTypeOf<true>();

/** A read through an optional parent. */
const city = get(user, 'address.city');
/** A read through a negative tuple index. */
const deep = get(user, ['pair', -1, 'deep']);
/** A read of a nullable field with a fallback. */
const defaulted = getOr(user, 'address.zip', 0);
/** A negative index into a tuple. */
const exactTupleIndex = get(user, ['pair', -2]);
/** A boolean write. */
const enabled = set(user, 'enabled', false);
/** A write of another union member. */
const status = set(user, 'status', 'inactive');
/** An update of an array. */
const updated = update(user, 'tags', tags => [...tags, 'x']);
/** A transformed read. */
const count = getWith(user, 'tags', tags => tags.length);
/** An equality check on a union. */
const comparison = getEq(user, 'status', 'active');
getEq(user, 'tags', ['x'], (actual, expected) => { /** The comparator's actual value, typed from the path. */ const a: string[] = actual; /** The comparator's expected value, typed from the path. */ const b: string[] = expected; return a.length === b.length; });
/** Data-first calls give precise types. */
expectTypeOf<typeof city>().toEqualTypeOf<string | undefined>();
expectTypeOf<typeof deep>().toEqualTypeOf<boolean>();
expectTypeOf<typeof defaulted>().toEqualTypeOf<string | 0>();
expectTypeOf<typeof exactTupleIndex>().toEqualTypeOf<number>();
expectTypeOf<typeof enabled>().toEqualTypeOf<User>();
expectTypeOf<typeof status>().toEqualTypeOf<User>();
expectTypeOf<typeof updated>().toEqualTypeOf<User>();
expectTypeOf<typeof count>().toEqualTypeOf<number>();
expectTypeOf<typeof comparison>().toEqualTypeOf<boolean>();
// @ts-expect-error invalid readable property
get(user, 'adress.city');
// @ts-expect-error fixed tuple index does not exist
get(user, ['pair', 2]);
// @ts-expect-error negative tuple index is out of bounds
get(user, ['pair', -3]);
// @ts-expect-error a literal negative string is a property, not an end-relative index
get(user, ['pair', '-1']);
// @ts-expect-error wrong tuple element type for this exact negative index
set(user, ['pair', -2], 'wrong');
// @ts-expect-error tuple writes cannot silently widen the tuple length
set(user, ['pair', 2], 1);
// @ts-expect-error optional parent must be provided as a complete object
set(user, 'address.city', 'X');
// @ts-expect-error replacement must satisfy the slot's literal union
set(user, 'status', 'deleted');
// @ts-expect-error a present exact-optional field cannot store implicit undefined
set(user, 'address', undefined);
// @ts-expect-error function must return the replacement type
update(user, 'id', id => String(id));
// @ts-expect-error comparator parameters reflect the actual path type
getEq(user, 'id', 1, (actual: string, expected: number) => actual === String(expected));
// @ts-expect-error generic array elements are not guaranteed parents
set(user, ['tags', 0, 'length'], 1);
// @ts-expect-error dictionary entries are not guaranteed parents
set(user, 'meta.some.score', 1);
// @ts-expect-error root may be absent
set(user as User | null, 'id', 1);

/** A data-last read mapped over users. */
const cities = users.map(get('address.city'));
/** A data-last read through a tuple path. */
const tags = users.map(get(['tags', 0]));
/** A data-last write mapped over users. */
const names = users.map(set('name', 'new name'));
/** A data-last predicate used by `filter`. */
const statuses = users.filter(getEq('status', 'active'));
/** A data-last update. */
const increased = users.map(update('id', (id: number) => id + 1));
/** A data-last transform. */
const tagCounts = users.map(getWith('tags', (values: readonly string[]) => values.length));
/** A predicate on an array path. */
const predicates = getEq('tags', ['x']);
predicates(user, (actual, expected) => { /** The comparator's actual array. */ const a: string[] = actual; /** The comparator's expected array. */ const b: string[] = expected; return a.length === b.length; });
/** Data-last calls give precise types. */
expectTypeOf<typeof cities>().toEqualTypeOf<(string | undefined)[]>();
expectTypeOf<typeof tags>().toEqualTypeOf<(string | undefined)[]>();
expectTypeOf<typeof names>().toEqualTypeOf<User[]>();
expectTypeOf<typeof statuses>().toEqualTypeOf<User[]>();
expectTypeOf<typeof increased>().toEqualTypeOf<User[]>();
expectTypeOf<typeof tagCounts>().toEqualTypeOf<number[]>();
// @ts-expect-error data-last writes retain strict optional parents
users.map(set('address.city', 'X'));
// @ts-expect-error data-last writes retain value types
users.map(set('id', 'wrong'));
// @ts-expect-error data-last transform cannot omit possible undefined
users.map(getWith('address.city', (value: string) => value.length));
// @ts-expect-error equality expected value must fit the eventual input
getEq('status', 'deleted')(user);

/** A lens on a required field. */
const idLens = lens<User>()('id');
/** A lens through an optional parent. */
const addressCityLens = lens<User>()('address.city');
/** A lens used as a path. */
const idRead = get(user, idLens);
/** A write through a lens path. */
const idSet = set(user, idLens, 2);
/** A data-last read with a lens. */
const idReadLast = get(idLens)(user);
/** An update through a lens path. */
const idUpdate = update(user, idLens, id => id + 1);
/** A lens transform. */
const idLensTransform = idLens.getWith(id => String(id));
/** A lens update. */
const idLensUpdate = idLens.update(id => id + 1);
/** A lens equality predicate. */
const idLensEquality = idLens.getEq(1, (actual, expected) => actual === expected);
users.map(idLensTransform);
users.filter(idLensEquality);
addressCityLens.getWith(value => value?.length);
/** Lens operations give precise types. */
expectTypeOf<typeof idRead>().toEqualTypeOf<number>();
expectTypeOf<typeof idSet>().toEqualTypeOf<User>();
expectTypeOf<typeof idReadLast>().toEqualTypeOf<number>();
expectTypeOf<typeof idUpdate>().toEqualTypeOf<User>();
expectTypeOf<typeof idLensTransform>().toEqualTypeOf<(obj: User) => string>();
expectTypeOf<typeof idLensUpdate>().toEqualTypeOf<(obj: User) => User>();
// @ts-expect-error lens paths remain readonly
idLens.path.push('extra');
// @ts-expect-error optional-parent writes are disabled on the lens
addressCityLens.set('X');
// @ts-expect-error using a lens as a path does not bypass the target shape's optional parent
set({ address: undefined } as { address?: { city: string } }, lens<{ address: { city: string } }>()('address.city'), 'X');
// @ts-expect-error typo in a typed lens path
lens<User>()('address.cty');

// Union writes must remain valid for every possible original variant.
/** A discriminated union. */
declare const union: { kind: 'number'; value: number } | { kind: 'string'; value: string };
// @ts-expect-error writing a number into the string variant would violate the return type
set(union, 'value', 1);
/** A union where a key is missing from one member. */
declare const missingUnion: { a: number } | { b: number };
/** A read of that key. */
const unionRead = get(missingUnion, 'a');
// @ts-expect-error adding a field to a union variant is not a guaranteed existing slot
set(missingUnion, 'a', 1);
/** A path that varies between two keys. */
declare const varyingPath: readonly ['id' | 'name'];
// @ts-expect-error a union path must accept a replacement fitting both possible slots
set(user, varyingPath, 1);
/** Keys containing dots and exponent text. */
const dotted = { 'a.b': { value: 1 }, '1e3': 'literal' };
/** A tuple read of a literal dot key. */
const literalDot = get(dotted, ['a.b', 'value']);
/** A read of an exponent-like key. */
const literalExponent = get(dotted, '1e3');
// @ts-expect-error literal dotted property keys require tuple form
get(dotted, 'a.b.value');

// Dynamic paths and erased input types carry no unchecked return-type promise.
/** A path only known at runtime. */
declare const dynamicPath: string;
// Erased external data must not produce unchecked return-type promises.
/** Data typed as `any`. */
declare const external: any;
/** A read with a runtime path. */
const dynamic = get(user, dynamicPath);
/** A read of `any` data. */
const erased = get(external, 'id');
/** A read below `unknown`. */
const unknownNested = get({ payload: null as unknown }, 'payload.value');
/** Paths only known at runtime read as `unknown`. */
expectTypeOf<typeof dynamic>().toEqualTypeOf<unknown>();
expectTypeOf<typeof erased>().toEqualTypeOf<unknown>();
expectTypeOf<typeof unknownNested>().toEqualTypeOf<unknown>();
expectTypeOf<typeof unionRead>().toEqualTypeOf<number | undefined>();
expectTypeOf<typeof literalDot>().toEqualTypeOf<number>();
expectTypeOf<typeof literalExponent>().toEqualTypeOf<string>();

// Higher-order values remain values, and ordinary opaque properties remain readable.
/**
 * A function value to write.
 *
 * @param id - A number.
 * @returns Its text.
 */
const action = (id: number): string => String(id);
/** Writing a function value. */
const newAction = set(user, 'action', action);
/** The data-last form of that write. */
const newActionLast = set('action', action)(user);
/** Reading a function value. */
const readAction = get(user, 'action');
/** Reading a function's `name`. */
const functionName = get(user, 'action.name');
/** Reading a built-in method. */
const dateMethod = get({ date: new Date() }, 'date.getTime');
// @ts-expect-error immutable writes cannot clone an opaque function parent
set(user, 'action.name', 'new');
/** An array with a custom property. */
const labeled = Object.assign([1, 2], { label: 'x' });
/** Reading the custom property. */
const label = get(labeled, 'label');
/** Writing it. */
const relabeled = set(labeled, 'label', 'y');
/** Updating it. */
const labelUpdated = update(labeled, 'label', value => value.toUpperCase());
// @ts-expect-error array prototype length writes are not supported
set(labeled, 'length', 0);
/** Reads below opaque values stay typed. */
expectTypeOf<typeof newAction>().toEqualTypeOf<User>();
expectTypeOf<typeof newActionLast>().toEqualTypeOf<User>();
expectTypeOf<typeof readAction>().toEqualTypeOf<(id: number) => string>();
expectTypeOf<typeof functionName>().toEqualTypeOf<string>();
expectTypeOf<typeof dateMethod>().toEqualTypeOf<() => number>();
expectTypeOf<typeof label>().toEqualTypeOf<string>();
expectTypeOf<typeof relabeled>().toEqualTypeOf<typeof labeled>();
expectTypeOf<typeof labelUpdated>().toEqualTypeOf<typeof labeled>();
/** Keys that look like internal marker types. */
const markerValues = { missing: { __missingPathKey: true as const }, optional: { __optionalParent: true as const } };
/** A read of a marker-like key. */
const readMarker = get(markerValues, 'missing');
/** A write of a marker-like value. */
const writeMarker = set(markerValues, 'optional', { __optionalParent: true });
/** Data that resembles the library's internal markers is treated as ordinary data. */
expectTypeOf<typeof readMarker>().toEqualTypeOf<{ __missingPathKey: true }>();
expectTypeOf<typeof writeMarker>().toEqualTypeOf<typeof markerValues>();

// Correlated updaters may preserve a missing value without assigning undefined to a present exact-optional slot.
/** Updating an optional parent when present. */
const optionalUpdated = update(user, 'address', address => address ? { ...address, city: 'X' } : address);
/** The lens form of that update. */
const optionalLensUpdated = lens<User>()('address').update(address => address ? { ...address, city: 'X' } : address)(user);
// @ts-expect-error unconditional undefined would clear a present exact-optional field
update(user, 'address', () => undefined);
// @ts-expect-error lens updaters preserve the same correlation
lens<User>()('address').update(() => undefined);
// @ts-expect-error even an identity updater cannot write through an optional parent
addressCityLens.update(value => value);
/** A field that may be explicitly `undefined`. */
const explicitUndefined = { value: undefined as number | undefined };
update(explicitUndefined, 'value', () => undefined);

// Standard callback APIs may supply index/context arguments; valid equality callbacks remain assignable.
/** A predicate passed to `Array.from`. */
const fromEquality = Array.from(users, getEq('enabled', true));
/** A comparator on a function value. */
const higherOrderEquality = getEq('action', action)(user, (actual, expected) => actual === expected);
/** Keys beyond the safe integer range. */
const hugeKeys = { '9007199254740993': 'odd', '9007199254740992': 123 };
/** Reading a huge key. */
const hugeKey = get(hugeKeys, '9007199254740993');
/** An array with a fraction-like property. */
const fractionalMeta = Object.assign([1], { '1.5': 'fractional metadata' });
/** Reading it. */
const fractionalRead = get(fractionalMeta, ['1.5']);
/** Writing it. */
const fractionalWrite = set(fractionalMeta, ['1.5'], 'new metadata');
/** A readonly tuple with a negative-looking property. */
const negativeMeta = Object.assign([1, 2] as const, { '-1': 'negative metadata' });
/** Reading that property. */
const negativeProperty = get(negativeMeta, ['-1']);
// @ts-expect-error numeric negative indexes do not fall through to custom negative string properties
get(negativeMeta, -3);
/** A write to a string index of an open array. */
const genericStringIndex = set(user.tags, ['0'], 'new tag');
/** A deeply nested object. */
const deepObject = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
/** A read deeper than the suggestion depth. */
const deepRead = get(deepObject, 'a.b.c.d.e.f.g');
// @ts-expect-error actual path validation continues past autocomplete's depth cap
get(deepObject, 'a.b.c.d.e.f.nope');

// Runtime-only writes return unknown rather than pretending an unchecked replacement preserves T.
/** A write with a runtime path. */
const dynamicSet = set(user, dynamicPath, 'unchecked');
/** The data-last form. */
const dynamicSetLast = set(dynamicPath, 'unchecked')(user);
/** An update with a runtime path. */
const dynamicUpdate = update(user, dynamicPath, () => 'unchecked');
/** A lens from a runtime path. */
const dynamicFocus = lens<User>()(dynamicPath);
/** A write through it. */
const dynamicLensSet = dynamicFocus.set('unchecked')(user);
/** An update through it. */
const dynamicLensUpdate = dynamicFocus.update(() => 'unchecked')(user);
/** A write on `any` data. */
const erasedSet = set(external, 'id', 'unchecked');
/** A tuple path with a runtime key. */
declare const dynamicTuple: readonly [string];
/** A write with it. */
const dynamicTupleSet = set(user, dynamicTuple, 'unchecked');
/** The id after an unchecked write. */
// @ts-expect-error unchecked dynamic writes do not promise the original shape
const unsafeId: number = dynamicSet.id;
/** Further edge cases: fractional, huge and generic index keys. */
expectTypeOf<typeof optionalUpdated>().toEqualTypeOf<User>();
expectTypeOf<typeof optionalLensUpdated>().toEqualTypeOf<User>();
expectTypeOf<typeof fromEquality>().toEqualTypeOf<boolean[]>();
expectTypeOf<typeof higherOrderEquality>().toEqualTypeOf<boolean>();
expectTypeOf<typeof hugeKey>().toEqualTypeOf<string>();
expectTypeOf<typeof fractionalRead>().toEqualTypeOf<string>();
expectTypeOf<typeof fractionalWrite>().toEqualTypeOf<typeof fractionalMeta>();
expectTypeOf<typeof negativeProperty>().toEqualTypeOf<string>();
expectTypeOf<typeof genericStringIndex>().toEqualTypeOf<string[]>();
expectTypeOf<typeof deepRead>().toEqualTypeOf<number>();
expectTypeOf<typeof dynamicSet>().toEqualTypeOf<unknown>();
expectTypeOf<typeof dynamicSetLast>().toEqualTypeOf<unknown>();
expectTypeOf<typeof dynamicUpdate>().toEqualTypeOf<unknown>();
expectTypeOf<typeof dynamicLensSet>().toEqualTypeOf<unknown>();
expectTypeOf<typeof dynamicLensUpdate>().toEqualTypeOf<unknown>();
expectTypeOf<typeof erasedSet>().toEqualTypeOf<unknown>();
expectTypeOf<typeof dynamicTupleSet>().toEqualTypeOf<unknown>();
void unsafeId;

void [city, deep, defaulted, exactTupleIndex, enabled, status, updated, count, comparison, cities, tags, names, statuses, increased, tagCounts, predicates, idLens, addressCityLens, idRead, idSet, idReadLast, idUpdate, idLensTransform, idLensUpdate, idLensEquality, unionRead, dotted, literalDot, literalExponent, dynamic, erased, unknownNested, action, newAction, newActionLast, readAction, functionName, dateMethod, labeled, label, relabeled, labelUpdated, markerValues, readMarker, writeMarker, optionalUpdated, optionalLensUpdated, explicitUndefined, fromEquality, higherOrderEquality, hugeKeys, hugeKey, fractionalMeta, fractionalRead, fractionalWrite, negativeMeta, negativeProperty, genericStringIndex, deepObject, deepRead, dynamicSet, dynamicSetLast, dynamicUpdate, dynamicFocus, dynamicLensSet, dynamicLensUpdate, erasedSet, dynamicTupleSet];


// A raw dot path may contain additional separators inside an unbounded interpolation.
/** A record of named entries. */
const templateRecord: Record<string, { name: string }> = { id: { name: 'x' } };
/** A template-literal path. */
const interpolatedPath = 'id.name' as `id${string}`;
/** A read with it. */
const interpolatedRead = get(templateRecord, interpolatedPath);
/** A write with it. */
const interpolatedWrite = set(templateRecord, interpolatedPath, { name: 'wrong' });
/** The data-last write. */
const interpolatedWriteLast = set(interpolatedPath, { name: 'wrong' })(templateRecord);
/** An update with it. */
const interpolatedUpdate = update(templateRecord, interpolatedPath, () => ({ name: 'wrong' }));
/** A data-last read mapped over records. */
const interpolatedReads = [templateRecord].map(get(interpolatedPath));
/** The path wrapped in a tuple. */
const interpolatedTuple = [interpolatedPath] as const;
/** A lens-like object carrying the tuple. */
const interpolatedReference = { path: interpolatedTuple };
/** A tuple read. */
const interpolatedTupleRead = get(templateRecord, interpolatedTuple);
/** A tuple write. */
const interpolatedTupleWrite = set(templateRecord, interpolatedTuple, { name: 'wrong' });
/** A read through the carrying object. */
const interpolatedReferenceRead = get(templateRecord, interpolatedReference);
/** A write through the carrying object. */
const interpolatedReferenceWrite = set(templateRecord, interpolatedReference, { name: 'wrong' });
/** A lens built from the template path. */
const interpolatedLens = lens<typeof templateRecord>()(interpolatedPath);
/** A lens read. */
const interpolatedLensRead = interpolatedLens.get(templateRecord);
/** A lens write. */
const interpolatedLensWrite = interpolatedLens.set({ name: 'wrong' })(templateRecord);
/** A lens update. */
const interpolatedLensUpdate = interpolatedLens.update(() => ({ name: 'wrong' }))(templateRecord);
/** The lens used as a path. */
const interpolatedLensAsPath = get(templateRecord, interpolatedLens);
getWith(templateRecord, interpolatedPath, value => typeof value === 'string' ? value.toUpperCase() : undefined);
// @ts-expect-error interpolated paths do not promise the record element type to callbacks
getWith(templateRecord, interpolatedPath, (value: { name: string }) => value.name);
// @ts-expect-error data-last callbacks must also handle an unknown value
getWith(interpolatedPath, (value: { name: string }) => value.name)(templateRecord);
// @ts-expect-error a dynamic lens cannot promise an unchecked callback parameter type
interpolatedLens.getWith((value: { name: string }) => value.name);
getEq(interpolatedPath, { name: 'x' })(templateRecord, (actual, expected) => {
  /** The comparator's actual value, which is `unknown`. */
  const checkedActual: unknown = actual;
  /** The comparator's expected value. */
  const checkedExpected: { name: string } = expected;
  return checkedActual === checkedExpected;
});

/** Open template types that must all be treated as dynamic. */
type TemplatePaths = [
  `id${string}`, `${number}`, `${bigint}`, Uppercase<string>, Lowercase<string>,
  Capitalize<string>, Uncapitalize<string>, `${Uppercase<string>}suffix`,
  `prefix${Lowercase<string>}`, `prefix${number}suffix`, `prefix${bigint}suffix`,
  Uppercase<`id${string}`>, `prefix.${Capitalize<string>}.name`,
  `${number & { readonly __numberBrand: 'index' }}`
];
/** The read type for each template path. */
type ReadForEvery<P extends readonly unknown[]> = { [K in keyof P]: PathValue<typeof templateRecord, P[K]> };
/** The write type for each template path. */
type WriteForEvery<P extends readonly unknown[]> = { [K in keyof P]: WriteOutput<typeof templateRecord, P[K]> };
/** The read type for each template used as a tuple key. */
type TupleReadForEvery<P extends readonly unknown[]> = { [K in keyof P]: PathValue<typeof templateRecord, readonly [P[K] & string]> };
/** The write type for each template carried by an object. */
type ReferenceWriteForEvery<P extends readonly unknown[]> = { [K in keyof P]: WriteOutput<typeof templateRecord, { readonly path: readonly [P[K] & string] }> };
/** The expected result: `unknown` for every template. */
type EveryTemplateUnknown = [unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown, unknown];
/** Unbounded template paths read and write as `unknown`. */
expectTypeOf<typeof interpolatedRead>().toEqualTypeOf<unknown>();
expectTypeOf<typeof interpolatedWrite>().toEqualTypeOf<unknown>();
expectTypeOf<typeof interpolatedWriteLast>().toEqualTypeOf<unknown>();
expectTypeOf<typeof interpolatedUpdate>().toEqualTypeOf<unknown>();
expectTypeOf<typeof interpolatedReads>().toEqualTypeOf<unknown[]>();
expectTypeOf<typeof interpolatedTupleRead>().toEqualTypeOf<unknown>();
expectTypeOf<typeof interpolatedTupleWrite>().toEqualTypeOf<unknown>();
expectTypeOf<typeof interpolatedReferenceRead>().toEqualTypeOf<unknown>();
expectTypeOf<typeof interpolatedReferenceWrite>().toEqualTypeOf<unknown>();
expectTypeOf<typeof interpolatedLensRead>().toEqualTypeOf<unknown>();
expectTypeOf<typeof interpolatedLensWrite>().toEqualTypeOf<unknown>();
expectTypeOf<typeof interpolatedLensUpdate>().toEqualTypeOf<unknown>();
expectTypeOf<typeof interpolatedLensAsPath>().toEqualTypeOf<unknown>();
expectTypeOf<ReadForEvery<TemplatePaths>>().toEqualTypeOf<EveryTemplateUnknown>();
expectTypeOf<WriteForEvery<TemplatePaths>>().toEqualTypeOf<EveryTemplateUnknown>();
expectTypeOf<TupleReadForEvery<TemplatePaths>>().toEqualTypeOf<EveryTemplateUnknown>();
expectTypeOf<ReferenceWriteForEvery<TemplatePaths>>().toEqualTypeOf<EveryTemplateUnknown>();
expectTypeOf<PathValue<typeof templateRecord, 'id.name' | `other${string}`>>().toEqualTypeOf<unknown>();
expectTypeOf<WriteOutput<typeof templateRecord, readonly ['id'] | readonly [`other${string}`]>>().toEqualTypeOf<unknown>();

// Finite templates, Unicode keys, and prototype-looking literal names remain statically precise.
/** A small model with two matching branches. */
const finiteModel = { left: { value: 1 }, right: { value: 2 } };
/** A finite template dot path. */
declare const finiteDotPath: `${'left' | 'right'}.value`;
/** A finite tuple path. */
declare const finiteTuplePath: readonly ['left' | 'right', 'value'];
/** A read across both branches. */
const finiteRead = get(finiteModel, finiteDotPath);
/** A write across both branches. */
const finiteWrite = set(finiteModel, finiteDotPath, 3);
/** A tuple read. */
const finiteTupleRead = get(finiteModel, finiteTuplePath);
/** A tuple write. */
const finiteTupleWrite = set(finiteModel, finiteTuplePath, 3);
/** A write through an object path. */
const finiteReferenceWrite = set(finiteModel, { path: finiteTuplePath }, 3);
/** A lens from a finite path. */
const finiteLens = lens<typeof finiteModel>()(finiteDotPath);
/** A lens read. */
const finiteLensRead = finiteLens.get(finiteModel);
/** A lens write. */
const finiteLensWrite = finiteLens.set(3)(finiteModel);
/** A finite numeric string key. */
declare const finiteNumericString: `${0 | 1}`;
/** A two-element tuple. */
const finiteNumericTuple: [number, number] = [1, 2];
/** A read with the finite index. */
const finiteNumericRead = get(finiteNumericTuple, finiteNumericString);
/** A write with the finite index. */
const finiteNumericWrite = set(finiteNumericTuple, finiteNumericString, 3);
/** A read of a literal array. */
const indexedRead = get([1, 2], 0);
/** A read from the end. */
const negativeIndexedRead = get([1, 2], -1);
/** Keys that collide with prototype names. */
const literalKeys = { toString: 'literal', constructor: 'literal', ' ': 'space', 'é': 'accent', '😀': 'emoji' };
/** A read of a `toString` key. */
const literalPrototypeRead = get(literalKeys, 'toString');
/** A read of a space key. */
const literalSpaceRead = get(literalKeys, ' ');
/** A read of an emoji key. */
const literalUnicodeRead = get(literalKeys, '😀');
/** An uppercase template key. */
declare const finiteUpper: Uppercase<'left' | 'right'>;
/** A read with it. */
const finiteUpperRead = get({ LEFT: 1, RIGHT: 2 }, finiteUpper);
/** A boolean template path. */
declare const finiteBoolean: `flag.${boolean}`;
/** A read with it. */
const finiteBooleanRead = get({ flag: { true: 1, false: 2 } }, finiteBoolean);
/** A literal dot key given as a tuple. */
const tupleLiteralDotRead = get({ 'a.b': 1 }, ['a.b']);
/** Finite template paths stay precise. */
expectTypeOf<typeof finiteRead>().toEqualTypeOf<number>();
expectTypeOf<typeof finiteWrite>().toEqualTypeOf<typeof finiteModel>();
expectTypeOf<typeof finiteTupleRead>().toEqualTypeOf<number>();
expectTypeOf<typeof finiteTupleWrite>().toEqualTypeOf<typeof finiteModel>();
expectTypeOf<typeof finiteReferenceWrite>().toEqualTypeOf<typeof finiteModel>();
expectTypeOf<typeof finiteLensRead>().toEqualTypeOf<number>();
expectTypeOf<typeof finiteLensWrite>().toEqualTypeOf<typeof finiteModel>();
expectTypeOf<typeof finiteNumericRead>().toEqualTypeOf<number>();
expectTypeOf<typeof finiteNumericWrite>().toEqualTypeOf<[number, number]>();
expectTypeOf<typeof indexedRead>().toEqualTypeOf<number | undefined>();
expectTypeOf<typeof negativeIndexedRead>().toEqualTypeOf<number | undefined>();
expectTypeOf<typeof literalPrototypeRead>().toEqualTypeOf<string>();
expectTypeOf<typeof literalSpaceRead>().toEqualTypeOf<string>();
expectTypeOf<typeof literalUnicodeRead>().toEqualTypeOf<string>();
expectTypeOf<typeof finiteUpperRead>().toEqualTypeOf<number>();
expectTypeOf<typeof finiteBooleanRead>().toEqualTypeOf<number>();
expectTypeOf<typeof tupleLiteralDotRead>().toEqualTypeOf<number>();

void [city, deep, defaulted, exactTupleIndex, enabled, status, updated, count, comparison, cities, tags, names, statuses, increased, tagCounts, predicates, idLens, addressCityLens, idRead, idSet, idReadLast, idUpdate, idLensTransform, idLensUpdate, idLensEquality, unionRead, dotted, literalDot, literalExponent, dynamic, erased, unknownNested, action, newAction, newActionLast, readAction, functionName, dateMethod, labeled, label, relabeled, labelUpdated, markerValues, readMarker, writeMarker, optionalUpdated, optionalLensUpdated, explicitUndefined, fromEquality, higherOrderEquality, hugeKeys, hugeKey, fractionalMeta, fractionalRead, fractionalWrite, negativeMeta, negativeProperty, genericStringIndex, deepObject, deepRead, dynamicSet, dynamicSetLast, dynamicUpdate, dynamicFocus, dynamicLensSet, dynamicLensUpdate, erasedSet, dynamicTupleSet, interpolatedPath, interpolatedRead, interpolatedWrite, interpolatedWriteLast, interpolatedUpdate, interpolatedReads, interpolatedTuple, interpolatedReference, interpolatedTupleRead, interpolatedTupleWrite, interpolatedReferenceRead, interpolatedReferenceWrite, interpolatedLens, interpolatedLensRead, interpolatedLensWrite, interpolatedLensUpdate, interpolatedLensAsPath, finiteModel, finiteRead, finiteWrite, finiteTupleRead, finiteTupleWrite, finiteReferenceWrite, finiteLens, finiteLensRead, finiteLensWrite, finiteNumericRead, finiteNumericWrite, indexedRead, negativeIndexedRead, literalKeys, literalPrototypeRead, literalSpaceRead, literalUnicodeRead, finiteUpperRead, finiteBooleanRead, tupleLiteralDotRead];
