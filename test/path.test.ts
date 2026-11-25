import { describe, expect, it } from 'vitest';
import { get, getEq, getOr, getWith, lens, set, update } from '../src/path.js';

/** A path operation with untyped arguments, to reach runtime checks. */
type Operation = (...args: unknown[]) => unknown;
/** `get` without its types. */
const callGet = get as Operation;
/** `set` without its types. */
const callSet = set as Operation;
/** `update` without its types. */
const callUpdate = update as Operation;
/** `getEq` without its types. */
const callEq = getEq as Operation;

describe('path reads', () => {
  it('reads properties, indexes, negative indexes, dot strings, tuples, and roots', () => {
    /** Data with dotted and zero-padded keys. */
    const source = { nested: { items: [{ value: 1 }, { value: 2 }] }, 'literal.dot': { '01': 3 } };
    expect(get(source, 'nested.items.0.value')).toBe(1);
    expect(get(source, ['nested', 'items', -1, 'value'])).toBe(2);
    expect(get(source, ['literal.dot', '01'])).toBe(3);
    expect(get(source, '')).toBe(source);
    expect(get(source, [])).toBe(source);
    expect(get([1, 2], -1)).toBe(2);
    expect(get([1, 2], '-2')).toBe(1);
    expect(callGet([1, 2], ['-1'])).toBeUndefined();
    expect(callGet([1, 2], -3)).toBeUndefined();
    expect(callGet([1, 2], 3)).toBeUndefined();
    /** An array with a property named like a negative index. */
    const withNegativeProperty = Object.assign([1, 2], { '-1': 'custom' });
    expect(callGet(withNegativeProperty, -3)).toBeUndefined();
    expect(callGet(withNegativeProperty, ['-1'])).toBe('custom');
    /** An array with a property named like a fraction. */
    const fractional = Object.assign([1, 2], { '0.5': 'metadata' });
    /** A non-integer index. */
    const numericIndex: number = 0.5;
    expect(get(fractional, numericIndex)).toBeUndefined();
    expect(get(fractional, ['0.5'])).toBe('metadata');
    /** Keys beyond the safe integer range, which must stay strings. */
    const exactKeys = { '9007199254740993': 'odd', '9007199254740992': 123 };
    expect(get(exactKeys, '9007199254740993')).toBe('odd');
    expect(callGet(null, ['a', 'b'])).toBeUndefined();
    expect(callGet({ a: null }, ['a', 'b'])).toBeUndefined();
    expect(get([1, 2], 'length')).toBe(2);
    expect(get(new Date(0), 'getTime')).toBe(Date.prototype.getTime);
    expect(callGet({ '1.5': 'float' }, 1.5)).toBe('float');
  });

  it('provides reusable data-last reads compatible with array callbacks', () => {
    /** Records for the filtering tests. */
    const users = [{ name: 'Andre', active: true }, { name: 'Sam', active: false }];
    expect(users.map(get('name'))).toEqual(['Andre', 'Sam']);
    expect(users.filter(getEq('active', true))).toEqual([users[0]]);
    expect(Array.from(users, getEq('active', true))).toEqual([true, false]);
    expect(get(['nested', 'value'])({ nested: { value: 3 } })).toBe(3);
    expect(getOr('value', 0)({ value: null })).toBe(0);
    expect(getWith('value', (n: number) => n * 2)({ value: 3 })).toBe(6);
  });

  it('defaults only null, undefined, and NaN', () => {
    /** Every value `getOr` must treat differently. */
    const values = [null, undefined, NaN, 0, false, '', 2] as const;
    /** A value that may be missing or falsy. */
    const source = { value: values[0] } as { value: (typeof values)[number] };
    /** A reusable reader with a fallback. */
    const read = getOr('value', 'fallback');
    for (const value of values) {
      source.value = value;
      expect(getOr(source, 'value', 'fallback')).toBe(value == null || Number.isNaN(value) ? 'fallback' : value);
      expect(read(source)).toBe(value == null || Number.isNaN(value) ? 'fallback' : value);
    }
  });

  it('transforms reads with the current value', () => {
    expect(getWith({ amount: 4 }, 'amount', value => value * 3)).toBe(12);
    expect(getWith({ amount: undefined }, 'amount', value => value === undefined)).toBe(true);
  });

  it('uses Object.is and accepts typed comparators without confusing function values', () => {
    /**
     * Compares by id.
     *
     * @param actual - The read value.
     * @param expected - The expected value.
     * @returns Whether ids match.
     */
    const compare = (actual: { id: number }, expected: { id: number }): boolean => actual.id === expected.id;
    /** A structurally equal object. */
    const expected = { id: 1 };
    /** Data holding an object to compare. */
    const source = { value: { id: 1 } };
    expect(getEq(source, 'value', expected)).toBe(false);
    expect(getEq(source, 'value', expected, compare)).toBe(true);
    expect(getEq('value', expected)(source, compare)).toBe(true);
    expect(getEq('value', expected)(source)).toBe(false);
    expect(getEq({ value: NaN }, 'value', NaN)).toBe(true);
    expect(getEq({ value: 0 }, 'value', -0)).toBe(false);
    /**
     * A function value, read without being called.
     *
     * @returns Always 1.
     */
    const fn = (): number => 1;
    expect(getEq({ value: fn }, 'value', fn)).toBe(true);
    expect(callEq([], 0, fn)).toBe(false);
    expect((getEq('value', 1) as Operation)({ value: 1 }, 42)).toBe(true);
    expect(() => callEq({ value: 1 }, 'value', 1, false)).toThrow(/comparator/);
  });

  it('snapshots caller paths for every data-last reader', () => {
    /** A tuple path. */
    const path = ['first'];
    /** A reusable reader. */
    const read = get(path);
    /** A reusable reader with a fallback. */
    const withDefault = getOr(path, 0);
    /** A reusable transforming reader. */
    const transform = getWith(path, (n: unknown) => (n as number) * 2);
    /** A reusable equality predicate. */
    const equal = getEq(path, 1);
    path[0] = 'second';
    /** Data for the reusable forms. */
    const source = { first: 1, second: 2 };
    expect(read(source)).toBe(1);
    expect(withDefault(source)).toBe(1);
    expect(transform(source)).toBe(2);
    expect(equal(source)).toBe(true);
  });
});

describe('immutable writes', () => {
  it('copies only changed ancestors and returns original references for no-op writes', () => {
    /** Data with an untouched sibling. */
    const source = { inner: { value: 1 }, other: { value: 2 } };
    /** The written copy. */
    const changed = set(source, 'inner.value', 3);
    expect(changed).toEqual({ inner: { value: 3 }, other: { value: 2 } });
    expect(changed).not.toBe(source);
    expect(changed.inner).not.toBe(source.inner);
    expect(changed.other).toBe(source.other);
    expect(source.inner.value).toBe(1);
    expect(set(source, 'inner.value', 1)).toBe(source);
    expect(update(source, 'inner.value', value => value)).toBe(source);
    expect(set(source, [], source)).toBe(source);
    expect(set(source, [], changed)).toBe(changed);
    expect(update(source, '', value => value)).toBe(source);
  });

  it('supports data-last set/update and snapshots caller tuple paths', () => {
    /** A tuple path. */
    const path = ['a'];
    /** A reusable writer. */
    const replace = set(path, 3);
    /** A reusable updater. */
    const increase = update(path, (value: unknown) => (value as number) + 1);
    path[0] = 'b';
    expect(replace({ a: 1, b: 2 })).toEqual({ a: 3, b: 2 });
    expect(increase({ a: 1, b: 2 })).toEqual({ a: 2, b: 2 });
  });

  it('writes array indices and appends without creating gaps', () => {
    /** An array to write into. */
    const source = [1, 2];
    expect(set(source, -1, 3)).toEqual([1, 3]);
    expect(set(source, 2, 3)).toEqual([1, 2, 3]);
    expect(set(source, '-2', 3)).toEqual([3, 2]);
    expect(set(source, 0, 1)).toBe(source);
    expect(source).toEqual([1, 2]);
    expect(() => callSet(source, -3, 3)).toThrow(RangeError);
    expect(() => callSet(source, 3, 3)).toThrow(RangeError);
    expect(() => callSet(source, 0.5, 3)).toThrow(/integer index/);
    expect(() => callSet(source, 'length', 0)).toThrow(/integer index/);
    /** A one-hole sparse array. */
    const sparse = new Array<undefined>(1);
    /** The result of writing `undefined` to the hole. */
    const explicit = callSet(sparse, 0, undefined) as undefined[];
    expect(explicit).not.toBe(sparse);
    expect(0 in explicit).toBe(true);
    expect(0 in sparse).toBe(false);
  });

  it('preserves enumerable array metadata, safe own __proto__ data, and named property writes', () => {
    /** A symbol property. */
    const symbol = Symbol('metadata');
    /** An object shared by reference. */
    const shared = {};
    /** An array with extra string and symbol properties. */
    const source = Object.assign([1, 2], { label: 'old', [symbol]: shared });
    Object.defineProperty(source, '__proto__', { value: shared, enumerable: true });
    Object.defineProperty(source, 'hidden', { value: 1 });
    /** The written copy. */
    const changed = set(source, 0, 3);
    expect(changed[0]).toBe(3);
    expect(changed.label).toBe('old');
    expect(changed[symbol]).toBe(shared);
    expect(Object.getOwnPropertyDescriptor(changed, '__proto__')?.value).toBe(shared);
    expect(Object.getPrototypeOf(changed)).toBe(Array.prototype);
    expect(Object.hasOwn(changed, 'hidden')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(changed, 'hidden')).toEqual(Object.getOwnPropertyDescriptor(source, 'hidden'));
    expect(get(source, 'label')).toBe('old');
    expect(set(source, 'label', 'new').label).toBe('new');
    expect(callSet(source, ['0'], 4)).toEqual(expect.arrayContaining([4, 2]));
    expect(() => callSet(source, ['3'], 4)).toThrow(RangeError);
    expect(() => callSet(source, 'map', 4)).toThrow(/integer index or custom property/);
    /** A write to a property named like a negative index. */
    const literal = callSet(source, ['-1'], 'named') as Record<string, unknown>;
    expect(literal['-1']).toBe('named');
    expect(source.label).toBe('old');
    /** An array with a huge-integer property name. */
    const wide = Object.assign([1], { '9007199254740993': 'odd' });
    /** The written copy. */
    const wideChanged = callSet(wide, ['9007199254740993'], 'changed') as Record<string, unknown>;
    expect(wideChanged['9007199254740993']).toBe('changed');
    expect(wideChanged[0]).toBe(1);
  });

  it('preserves hidden descriptors while immutably updating frozen and non-writable values', () => {
    /** A source with a non-enumerable property. */
    const source = Object.defineProperty({ id: 1 }, 'hidden', { value: 42 }) as { id: number; hidden: number };
    /** The written copy. */
    const changed = set(source, 'id', 2);
    expect(changed.hidden).toBe(42);
    expect(Object.getOwnPropertyDescriptor(changed, 'hidden')).toEqual(Object.getOwnPropertyDescriptor(source, 'hidden'));
    expect(Object.keys(changed)).toEqual(['id']);
    /** A frozen source. */
    const locked = Object.freeze<{ id: number; nested: { untouched: boolean } }>({ id: 1, nested: { untouched: true } });
    /** The written copy of the frozen source. */
    const unlockedChange = set(locked, 'id', 2);
    expect(unlockedChange.id).toBe(2);
    expect(locked.id).toBe(1);
    expect(unlockedChange.nested).toBe(locked.nested);
    expect(Object.getOwnPropertyDescriptor(unlockedChange, 'nested')).toEqual(Object.getOwnPropertyDescriptor(locked, 'nested'));
    expect(Object.getOwnPropertyDescriptor(unlockedChange, 'id')).toEqual({ value: 2, writable: true, enumerable: true, configurable: true });
    /** A non-enumerable numeric property. */
    const numbered = Object.defineProperty({ id: 1 }, '1', { value: 10, enumerable: false }) as { id: number; 1: number };
    expect(set(numbered, 1, 20)[1]).toBe(20);
    expect(numbered[1]).toBe(10);
  });

  it('copies accessor descriptors without invoking unrelated getters', () => {
    /** Counts getter calls. */
    let reads = 0;
    /**
     * A getter that counts its calls.
     *
     * @returns A constant.
     */
    const getter = (): number => { reads++; return 42; };
    /** A source with accessor properties. */
    const source = Object.defineProperties({ id: 1 }, {
      visible: { get: getter, enumerable: true },
      hidden: { get: getter, enumerable: false },
    });
    /** The written copy. */
    const changed = set(source, 'id', 2);
    expect(reads).toBe(0);
    expect(Object.getOwnPropertyDescriptor(changed, 'visible')).toEqual(Object.getOwnPropertyDescriptor(source, 'visible'));
    expect(Object.getOwnPropertyDescriptor(changed, 'hidden')).toEqual(Object.getOwnPropertyDescriptor(source, 'hidden'));
    /** An array with an accessor property. */
    const items = Object.defineProperty([1, 2], 'metadata', { get: getter });
    /** The written array. */
    const changedItems = set(items, 0, 3);
    expect(reads).toBe(0);
    expect(Object.getOwnPropertyDescriptor(changedItems, 'metadata')).toEqual(Object.getOwnPropertyDescriptor(items, 'metadata'));
  });

  it('preserves ordinary length fields and distinct symbol keys without string coercion collisions', () => {
    /** A symbol sharing a description with a string key. */
    const symbol = Symbol('same');
    /** A source with both the string and symbol keys. */
    const source = Object.defineProperty({ id: 1, 'Symbol(same)': 'before', [symbol]: 'symbol' }, 'length', { value: 42 });
    /** The written copy. */
    const changed = set(source, 'Symbol(same)', 'after');
    expect(changed[symbol]).toBe('symbol');
    expect(changed['Symbol(same)']).toBe('after');
    expect(Object.getOwnPropertyDescriptor(changed, 'length')).toEqual(Object.getOwnPropertyDescriptor(source, 'length'));
    expect(Object.getOwnPropertyDescriptor(changed, symbol)).toEqual(Object.getOwnPropertyDescriptor(source, symbol));
  });

  it('preserves sparse array descriptors and permits immutable updates and appends to frozen sources', () => {
    /** A sparse array. */
    const source = new Array<number>(3);
    Object.defineProperty(source, '0', { value: 1, enumerable: false });
    Object.defineProperty(source, 'hidden', { value: 42 });
    Object.freeze(source);
    /** The written copy. */
    const changed = set(source, 0, 2);
    expect(changed[0]).toBe(2);
    expect(changed).toHaveLength(3);
    expect(1 in changed).toBe(false);
    expect(2 in changed).toBe(false);
    expect(Object.getOwnPropertyDescriptor(changed, 'hidden')).toEqual(Object.getOwnPropertyDescriptor(source, 'hidden'));
    /** A write one past the end. */
    const appended = set(source, 3, 4);
    expect(appended).toHaveLength(4);
    expect(appended[3]).toBe(4);
    expect(Object.getOwnPropertyDescriptor(appended, '0')).toEqual(Object.getOwnPropertyDescriptor(source, '0'));
    expect(source).toHaveLength(3);
    expect(3 in source).toBe(false);
    expect(set(source, 0, 1)).toBe(source);
  });

  it('preserves ancestor descriptors and untouched references during nested changes and no-ops', () => {
    /** An object shared by two branches. */
    const shared = {};
    /** A nested object with a hidden property. */
    const inner = Object.defineProperty({ value: 1, shared }, 'hidden', { value: 42 });
    /** A source with hidden properties at two levels. */
    const source = Object.defineProperty({ inner, shared }, 'hidden', { value: 43 });
    Object.freeze(inner);
    Object.freeze(source);
    /** The written copy. */
    const changed = set(source, 'inner.value', 2);
    expect(changed.inner.value).toBe(2);
    expect(changed.inner).not.toBe(source.inner);
    expect(changed.shared).toBe(shared);
    expect(changed.inner.shared).toBe(shared);
    expect(Object.getOwnPropertyDescriptor(changed, 'hidden')).toEqual(Object.getOwnPropertyDescriptor(source, 'hidden'));
    expect(Object.getOwnPropertyDescriptor(changed.inner, 'hidden')).toEqual(Object.getOwnPropertyDescriptor(inner, 'hidden'));
    expect(set(source, 'inner.value', 1)).toBe(source);
    expect(update(source, 'inner.value', value => value)).toBe(source);
  });

  it('requires existing intermediate parents and never invents branches', () => {
    for (const source of [{}, { a: null }, { a: undefined }, { a: 2 }]) {
      expect(() => callSet(source, 'a.value', 1)).toThrow(/parent.*a.value/);
      expect(() => callUpdate(source, 'a.value', () => 1)).toThrow(/parent.*a.value/);
    }
    expect(() => callSet([], [0, 'value'], 1)).toThrow(/missing parent/);
    expect(() => callSet(null, ['value'], 1)).toThrow(/missing parent/);
    /** A source whose parent is missing. */
    const source: { parent?: { value: number; name: string } } = {};
    expect(set(source, 'parent', { value: 1, name: 'complete' })).toEqual({ parent: { value: 1, name: 'complete' } });
    expect(update(source, 'parent', value => value ? { ...value, value: 2 } : value)).toBe(source);
  });

  it('refuses non-plain parents while allowing whole-slot replacement', () => {
    class Box { value = 1; }
    /** A source holding a class instance. */
    const source = { box: new Box() };
    expect(() => callSet(source, 'box.value', 2)).toThrow(/non-plain/);
    /** The replacement instance. */
    const replacement = new Box();
    expect(set(source, 'box', replacement).box).toBe(replacement);
    expect(() => callSet(new Date(), 'value', 1)).toThrow(/non-plain/);
  });

  it('protects unsafe writes and does not traverse inherited parents', () => {
    for (const path of ['__proto__.polluted', 'constructor.prototype.polluted', ['prototype']]) {
      expect(() => callSet({}, path, true)).toThrow(/unsafe write path/);
      expect(() => callUpdate({}, path, () => true)).toThrow(/unsafe write path/);
    }
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(() => callSet({}, ['toString', 'value'], 1)).toThrow(/missing parent/);
  });

  it('preserves null prototypes and symbols and safely copies existing __proto__ data', () => {
    /** A symbol key. */
    const symbol = Symbol('shared');
    /** A null-prototype source. */
    const source = Object.assign(Object.create(null) as { value: number; [symbol]: object }, { value: 1, [symbol]: {} });
    /** The written copy. */
    const changed = set(source, 'value', 2);
    expect(Object.getPrototypeOf(changed)).toBeNull();
    expect(changed[symbol]).toBe(source[symbol]);
    /** A source with an own enumerable `__proto__` data property. */
    const ordinary = Object.defineProperty({ value: 1 }, '__proto__', { value: { polluted: true }, enumerable: true });
    /** The written copy. */
    const copied = set(ordinary, 'value', 2);
    expect(Object.getPrototypeOf(copied)).toBe(Object.prototype);
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(Object.getOwnPropertyDescriptor(copied, '__proto__')?.value).toEqual({ polluted: true });
    expect(set(Object.freeze<{ value: number }>({ value: 1 }), 'value', 2)).toEqual({ value: 2 });
  });
});

describe('reusable lenses', () => {
  it('provides every read and write operation and retains structural sharing', () => {
    /** A source with a nested branch and a sibling. */
    interface Source { /** The nested branch. */ nested: { value: number; other: object }; }
    /** A lens into the nested value. */
    const focus = lens<Source>()('nested.value');
    /** The data to focus. */
    const source = { nested: { value: 2, other: {} } };
    expect(focus.get(source)).toBe(2);
    expect(focus.getOr(0)(source)).toBe(2);
    expect(focus.getOr(0)({ nested: { value: NaN, other: {} } })).toBe(0);
    expect(focus.getWith(value => value * 3)(source)).toBe(6);
    expect(focus.getEq(2)(source)).toBe(true);
    expect(focus.getEq(2, (actual, expected) => actual === expected)(source)).toBe(true);
    /** The lens-written copy. */
    const changed = focus.set(3)(source);
    expect(changed.nested.value).toBe(3);
    expect(changed.nested.other).toBe(source.nested.other);
    expect(focus.update(value => value + 1)(source).nested.value).toBe(3);
    expect(focus.set(2)(source)).toBe(source);
  });

  it('freezes and snapshots tuple paths without retargeting closures', () => {
    /** A one-segment tuple path. */
    const path: ['first'] = ['first'];
    /** A lens built from the tuple. */
    const focus = lens<{ first: number; second: number }>()(path);
    (path as string[])[0] = 'second';
    expect(focus.path).toEqual(['first']);
    expect(Object.isFrozen(focus.path)).toBe(true);
    expect(() => (focus.path as unknown as string[]).push('extra')).toThrow(TypeError);
    expect(focus.get({ first: 1, second: 2 })).toBe(1);
    expect(focus.set(3)({ first: 1, second: 2 })).toEqual({ first: 3, second: 2 });
  });

  it('accepts a reusable lens wherever a path is accepted', () => {
    /** A source for the data-last lens test. */
    interface Source { /** The nested branch. */ nested: { value: number }; }
    /** A lens into it. */
    const focus = lens<Source>()('nested.value');
    /** The data. */
    const source = { nested: { value: 2 } };
    expect(get(source, focus)).toBe(2);
    expect(get(focus)(source)).toBe(2);
    expect(getOr(source, focus, 0)).toBe(2);
    expect(getWith(source, focus, n => n + 1)).toBe(3);
    expect(getEq(source, focus, 2)).toBe(true);
    expect(set(source, focus, 3)).toEqual({ nested: { value: 3 } });
    expect(update(source, focus, n => n + 1)).toEqual({ nested: { value: 3 } });
    expect(lens<Source>()(focus).get(source)).toBe(2);
  });

  it('applies the same write guards to lens operations', () => {
    /** A lens naming a prototype key. */
    const unsafe = lens<unknown>()('__proto__.polluted');
    /** The lens viewed without its types, to call its write methods. */
    const operations = unsafe as unknown as { set: (value: unknown) => Operation; update: (fn: Operation) => Operation };
    expect(() => operations.set(true)({})).toThrow(/unsafe write path/);
    expect(() => operations.update(() => true)({})).toThrow(/unsafe write path/);
  });
});

describe('argument and path validation', () => {
  it('validates exact public helper and builder counts', () => {
    for (const [operation, args] of [
      [get, []], [get, [{}, 'a', 'extra']],
      [getOr, ['a']], [getOr, [{}, 'a', 1, 'extra']],
      [getWith, []], [set, ['a']], [update, ['a']],
      [getEq, []], [getEq, ['a']], [getEq, [{}, 'a', 1, Object.is, 'extra']],
    ] as [Operation, unknown[]][]) expect(() => operation(...args)).toThrow(/expected/);
    expect(() => (lens as Operation)('unexpected')).toThrow(/expected no arguments/);
    expect(() => (lens<unknown>() as Operation)()).toThrow(/expected one path/);
    expect(() => (lens<unknown>() as Operation)('a', 'b')).toThrow(/expected one path/);
  });

  it('rejects unsupported path inputs and snapshots structural path references', () => {
    for (const path of [null, undefined, true, Symbol(), Infinity, [null], [NaN], new Array(1), {}]) {
      expect(() => callGet({}, path)).toThrow(/path must be/);
      expect(() => callGet(path)).toThrow(/path must be/);
    }
    /** A tuple path. */
    const path = ['a'];
    /** An object that carries a path, like a lens. */
    const reference = { path };
    /** A reader built from the carrying object. */
    const read = get(reference);
    path[0] = 'b';
    expect(read({ a: 1, b: 2 })).toBe(1);
    expect(callGet({ a: 1 }, Object.assign(() => 0, { path: ['a'] }))).toBe(1);
  });
});
