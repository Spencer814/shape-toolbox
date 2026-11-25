import { describe, expect, it } from 'vitest';
import { get, getEq, getOr, getWith, lens, set, update } from '../src/path.js';

/**
 * The public way to parse a path: a lens exposes its frozen tuple.
 *
 * @param path - Any path form.
 * @returns The parsed tuple.
 */
const toPath = (path: string | number | readonly (string | number)[]): readonly (string | number)[] => lens<unknown>()(path as never).path;

/** Untyped data, to check `any` input is accepted. */
type Loose = any;  

describe('get', () => {
  it('reads indexes, dot paths, tuples and props, data first and data last', () => {
    expect(get(['foobar', false, 1] as Loose, 1)).toBe(false);
    expect(get(['foo', 'bar'])({ foo: { bar: 'foobar' } } as Loose)).toBe('foobar');
    expect(get({ bar: 1 }, 'bar')).toBe(1);
    expect(get(['a', 'b', 'c'] as Loose, -1)).toBe('c');
    expect(get({ x: [{ y: 2 }] } as Loose, 'x.0.y')).toBe(2);
  });
  it('is nullish-safe on the way', () => {
    expect(get({ a: null } as Loose, 'a.b.c')).toBeUndefined();
    expect(get(undefined as Loose, 'a')).toBeUndefined();
  });
  it('reads a key containing a dot through the tuple form', () => {
    expect(get({ 'a.b': 1 } as Loose, ['a.b'])).toBe(1);
  });
  it('throws on the wrong number of arguments', () => {
    expect(() => (get as (...a: unknown[]) => unknown)()).toThrow(TypeError);
    expect(() => (getOr as (...a: unknown[]) => unknown)({ a: 1 }, 'a')).toThrow(TypeError);
  });
});

describe('getOr, getWith, getEq', () => {
  it('falls back on null, undefined and NaN, not on false or 0', () => {
    expect(getOr(['bar', Number.NaN] as Loose, 1, 'foo')).toBe('foo');
    expect(getOr({ bar: null } as Loose, 'bar', 'foo')).toBe('foo');
    expect(getOr('bar', 'foo')({} as Loose)).toBe('foo');
    expect(getOr({ bar: false } as Loose, 'bar', 'foo')).toBe(false);
    expect(getOr({ bar: 0 } as Loose, 'bar', 'foo')).toBe(0);
    expect(getOr([] as Loose, 11, 'foo')).toBe('foo');
  });
  it('applies a function to the value read', () => {
    expect(getWith([4] as const, 0, x => x * 3)).toBe(12);
    expect(getWith('foo', (x: unknown) => x === null)([{ foo: true }] as Loose)).toBe(false);
  });
  it('compares with Object.is by default', () => {
    expect(getEq(['foo', 'bar'] as Loose, 0, 'foo')).toBe(true);
    expect(getEq('bar', true)({ bar: false } as Loose)).toBe(false);
    expect(getEq({ n: Number.NaN } as Loose, 'n', Number.NaN)).toBe(true);
    expect(getEq({ z: -0 } as Loose, 'z', 0)).toBe(false);
    expect(getEq({ a: [1] } as Loose, 'a', [1])).toBe(false);
  });
  it('uses a comparator when given, data first or data last', () => {
    /**
     * Compares two arrays element by element.
     *
     * @param a - One array.
     * @param b - The other.
     * @returns Whether they match.
     */
    const sameItems = (a: readonly number[], b: readonly number[]): boolean =>
      a.length === b.length && a.every((x, i) => x === b[i]);
    expect(getEq({ a: [1, 2] }, 'a', [1, 2], sameItems)).toBe(true);
    expect(getEq('a', [1, 2])({ a: [1, 2] }, sameItems)).toBe(true);
    expect(getEq('a', [1, 3])({ a: [1, 2] }, sameItems)).toBe(false);
  });
  it('rejects a call with too few arguments', () => {
    expect(() => (getEq as (...a: unknown[]) => unknown)({ a: 1 })).toThrow(TypeError);
  });
});

describe('set and update', () => {
  it('writes indexes, paths and props, data first and data last', () => {
    expect(set(['bar', false, 1] as Loose, 0, 'foo')).toEqual(['foo', false, 1]);
    expect(set(['foo', 'bar'], 1)({ foo: { bar: 'baz' } } as Loose)).toEqual({ foo: { bar: 1 } });
    expect(set({ bar: 'baz' } as Loose, 'bar', 'foo')).toEqual({ bar: 'foo' });
    expect(set(['a', 'b'] as Loose, -1, 'z')).toEqual(['a', 'z']);
    expect(set(['a'] as Loose, 1, 'b')).toEqual(['a', 'b']);
  });
  it('copies only the path, shares unchanged branches and returns the same object for no change', () => {
    /** The source for an immutable write. */
    const s = { a: { b: 1 }, c: { d: 2 } };
    expect(set(s, 'a.b', 1)).toBe(s);
    /** The written copy. */
    const t = set(s, 'a.b', 2);
    expect(t).not.toBe(s);
    expect(t.c).toBe(s.c);
    expect(s.a.b).toBe(1);
    expect(update(s, 'c.d', (n) => n)).toBe(s);
  });
  it('throws instead of inventing a missing parent', () => {
    expect(() => set({} as Loose, 'a.b', 1)).toThrow(/missing parent "a" in path "a.b"; set the parent instead/);
    expect(() => set({ a: 1 } as Loose, 'a.b', 1)).toThrow(TypeError);
    expect(() => set(null as Loose, 'a', 1)).toThrow(/missing parent "\(root\)"/);
    expect(() => set({ items: [] } as Loose, 'items.0.price', 5)).toThrow(/missing parent "items.0"/);
    expect(set({ items: [{ price: 1, sku: 'a' }] } as Loose, 'items.0.price', 5)).toEqual({ items: [{ price: 5, sku: 'a' }] });
  });
  it('returns the same array when an element is unchanged', () => {
    /** An array to write into. */
    const list = ['a', 'b'];
    expect(set(list as Loose, 1, 'b')).toBe(list);
  });
  it('rejects a data-last call whose first argument is not a path', () => {
    expect(() => (get as (...a: unknown[]) => unknown)([{}])).toThrow(TypeError);
  });
  it('throws on an index out of range', () => {
    expect(() => set(['a'] as Loose, 5, 'x')).toThrow(RangeError);
    expect(() => set(['a'] as Loose, -5, 'x')).toThrow(RangeError);
  });
  it('refuses unsafe keys and non-plain objects', () => {
    expect(() => set({ a: {} } as Loose, ['a', '__proto__'], 1)).toThrow(/unsafe write path/);
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    class Box {
      v = 1;
    }
    expect(() => set({ box: new Box() } as Loose, 'box.v', 2)).toThrow(/non-plain parent "box"/);
    expect(() => set(new Box() as Loose, 'v', 2)).toThrow(/non-plain parent "\(root\)"/);
    expect(set({ m: new Map() } as Loose, 'm', 1)).toEqual({ m: 1 });
  });
  it('keeps the prototype of a null-prototype object', () => {
    /** A null-prototype object. */
    const bare = Object.assign(Object.create(null) as Record<string, number>, { a: 1 });
    expect(Object.getPrototypeOf(set(bare as Loose, 'a', 2))).toBeNull();
  });
  it('update passes the current value', () => {
    expect(update({ n: 1 }, 'n', n => n + 1)).toEqual({ n: 2 });
    expect(update('list', (xs: number[]) => [...xs, 1])({ list: [0] })).toEqual({ list: [0, 1] });
  });
});

describe('lens and toPath', () => {
  it('builds reusable typed focuses', () => {
    /** A document type with an optional branch. */
    interface Doc {
      /** An optional parent. */
      address?: { city: string };
      /** A required field. */
      n: number;
    }
    /** A lens factory for `Doc`. */
    const at = lens<Doc>();
    /** A lens through the optional parent. */
    const city = at('address.city');
    expect(city.get({ n: 1, address: { city: 'Columbia' } })).toBe('Columbia');
    expect(city.getOr('none')({ n: 1 })).toBe('none');
    expect(at('n').set(5)({ n: 1 })).toEqual({ n: 5 });
    expect(at('n').update((n) => n + 1)({ n: 1 })).toEqual({ n: 2 });
    expect(at('n').getWith((n) => n * 10)({ n: 2 })).toBe(20);
    expect(at('n').getEq(2)({ n: 2 })).toBe(true);
    expect(at('n').getEq(3, (a, b) => Math.abs(a - b) <= 1)({ n: 2 })).toBe(true);
    expect(() => {
      (city.path as unknown as unknown[]).push('x');
    }).toThrow(TypeError);
  });
  it('parses dot paths with numeric segments, caches them and keeps "01" as a key', () => {
    expect(toPath('a.0.b')).toEqual(['a', 0, 'b']);
    expect(toPath('a.-1')).toEqual(['a', -1]);
    expect(toPath('a.01')).toEqual(['a', '01']);
    expect(toPath('')).toEqual([]);
    expect(toPath(3)).toEqual([3]);
  });
});
