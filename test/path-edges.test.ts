import { describe, expect, it } from 'vitest';
import { get, getEq, getOr, getWith, lens, set, update } from '../src/path.js';

/**
 * The public way to parse a path: a lens exposes its frozen tuple.
 *
 * @param path - Any path form.
 * @returns The parsed tuple.
 */
const toPath = (path: string | number | readonly (string | number)[]): readonly (string | number)[] => lens<unknown>()(path as never).path;

describe('typed path access', () => {
  /** Data shared by the access tests. */
  const data = {
    user: { name: 'Ada', score: 0 },
    list: ['first', 'last'],
    'key.with.dots': { value: 7 },
    empty: null as number | null,
    missing: undefined as string | undefined,
  };

  it('reads dot, numeric, and tuple paths with property-access semantics', () => {
    expect(get(data, 'user.name')).toBe('Ada');
    expect(get(data, '')).toBe(data);
    expect(get(data, 'list.1')).toBe('last');
    expect(get(data, ['key.with.dots', 'value'])).toBe(7);
    expect(get({ value: Number.NaN }, 'value')).toBeNaN();
    expect(get({ inherited: Object.create({ value: 1 }) as unknown }, 'inherited.value')).toBe(1);
    expect(toPath(['key.with.dots', 'value'])).toEqual(['key.with.dots', 'value']);
    expect(Object.isFrozen(toPath('user.name'))).toBe(true);
  });

  it('supports data-last access, fallbacks, callbacks, and equality', () => {
    expect(get('user.name')(data)).toBe('Ada');
    expect(getOr('empty', 5)(data)).toBe(5);
    expect(getOr({ value: Number.NaN }, 'value', 5)).toBe(5);
    expect(getWith(data, 'missing', (value) => value === undefined)).toBe(true);
    expect(getEq('user.score', 0)(data)).toBe(true);
    expect(getEq(data, 'user.name', 'ADA', (actual, expected) =>
      actual.toUpperCase() === expected,
    )).toBe(true);
  });
});

describe('immutable path updates', () => {
  it('clones only changed containers and preserves identity for no-ops', () => {
    /** Data with an untouched sibling branch. */
    const data = { nested: { value: 1 }, unchanged: { value: 2 } };
    /** The written copy. */
    const changed = set(data, 'nested.value', 3);
    expect(changed).not.toBe(data);
    expect(changed.nested).not.toBe(data.nested);
    expect(changed.unchanged).toBe(data.unchanged);
    expect(set(data, 'nested.value', 1)).toBe(data);
    expect(update(data, 'nested.value', (value) => value)).toBe(data);
  });

  it('supports data-last updates and negative/append array indices', () => {
    /** An array to read with negative indexes. */
    const data = { items: ['a', 'b'] };
    expect(set(data, 'items.-1', 'B').items).toEqual(['a', 'B']);
    expect(set(data, 'items.2', 'c').items).toEqual(['a', 'b', 'c']);
    expect(update('items.0', (value: string | undefined) => `${value ?? ''}!`)(data).items).toEqual(['a!', 'b']);
  });

  it('throws instead of creating missing parents or array holes', () => {
    // @ts-expect-error the path does not exist on {}
    expect(() => set({}, 'missing.value', 1)).toThrow(TypeError);
    expect(() => set({ items: ['a'] }, 'items.3', 'x')).toThrow(RangeError);
    // @ts-expect-error runtime guard for a path the types already reject
    expect(() => set({}, '__proto__.polluted', true)).toThrow(TypeError);
    // @ts-expect-error runtime guard for a path the types already reject
    expect(() => set({ items: ['a'] }, 'items.length', 0)).toThrow(TypeError);
    // @ts-expect-error runtime guard for a path the types already reject
    expect(() => set({ items: ['a'] }, 'items.map', () => undefined)).toThrow(TypeError);
    expect(() => set({ items: ['a'] }, ['items', Number.NaN], 'x')).toThrow(TypeError);
  });

  it('creates frozen typed lenses with equivalent read and update behavior', () => {
    /** Data for the lens tests. */
    const data = {
      user: { name: 'Ada', score: 0 },
      list: ['first', 'last'],
      'key.with.dots': { value: 7 },
      empty: null as number | null,
    };
    /** A lens reading a nested score. */
    const score = lens<typeof data>()('user.score');
    expect(get(data, score)).toBe(0);
    expect(get(score)(data)).toBe(0);
    expect(set(data, score, 2).user.score).toBe(2);
    expect(set(score, 2)(data).user.score).toBe(2);
    expect(update(data, score, (value) => value + 1).user.score).toBe(1);
    expect(update(score, (value: number) => value + 1)(data).user.score).toBe(1);
    expect(getEq(data, score, 0)).toBe(true);
    expect(Object.isFrozen(score)).toBe(true);
    expect(Object.isFrozen(score.path)).toBe(true);
    expect(score.get(data)).toBe(0);
    expect(score.set(4)(data).user.score).toBe(4);
    expect(score.update(value => value + 1)(data).user.score).toBe(1);
  });
});

describe('paths: contracts the mutation run found unpinned', () => {
  it('turns only canonical integer segments into numbers', () => {
    expect(lens<unknown>()('a.1.-1.0.12.01.-0.1a.a1.1.5').path).toEqual(['a', 1, -1, 0, 12, '01', '-0', '1a', 'a1', 1, 5]);
  });
  it('names the function and both arities when called with the wrong number of arguments', () => {
    /** Each function with its data-first arity. */
    const cases: [string, (...args: unknown[]) => unknown, number][] = [
      ['get', get as (...args: unknown[]) => unknown, 2],
      ['getOr', getOr as (...args: unknown[]) => unknown, 3],
      ['getWith', getWith as (...args: unknown[]) => unknown, 3],
      ['set', set as (...args: unknown[]) => unknown, 3],
      ['update', update as (...args: unknown[]) => unknown, 3],
    ];
    for (const [name, fn, arity] of cases) {
      expect(() => fn()).toThrow(new TypeError(`${name}: expected ${String(arity)} arguments (data first) or ${String(arity - 1)} (data last)`));
    }
  });
  it('names the out-of-range index and refuses a constructor write', () => {
    /** `set` without its types, to pass paths the types reject. */
    const untypedSet = set as (obj: unknown, path: unknown, value: unknown) => unknown;
    expect(() => untypedSet([1], [5], 0)).toThrow(RangeError);
    expect(() => untypedSet([1], [5], 0)).toThrow(/^index out of range at /);
    expect(() => untypedSet({}, 'constructor', 1)).toThrow(/^unsafe write path: /);
  });
});
