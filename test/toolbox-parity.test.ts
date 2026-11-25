import { describe, expect, it } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import { get, getOr, getWith, getEq, set, update, lens } from '../src/index.js';

describe('modern equivalents of every lens family', () => {
  /** Path cases compared against the previous behavior. */
  const cases = [
    { name: 'property', input: { value: 2 }, path: 'value', expected: { value: 3 } },
    { name: 'index', input: [0, 2], path: 1, expected: [0, 3] },
    { name: 'nested path', input: { nested: [{ value: 2 }] }, path: ['nested', 0, 'value'], expected: { nested: [{ value: 3 }] } },
  ] as const;
  it.each(cases)('preserves the five lens capabilities for $name', ({ input, path, expected }) => {
    // This table crosses different source types; the dedicated type suite checks each public signature.
    // `any` data hands callbacks `unknown`, never `any`.
    /** The input, untyped to feed every case. */
    const source: any = input;
    /** The path, untyped to feed every case. */
    const at: any = path;
    expect(get(source, at)).toBe(2);
    expect(get(at)(source)).toBe(2);
    expect(getOr(source, at, 99)).toBe(2);
    expect(getOr(at, 99)(source)).toBe(2);
    expect(getWith(source, at, (n: unknown) => (n as number) * 2)).toBe(4);
    expect(getWith(at, (n: unknown) => (n as number) * 2)(source)).toBe(4);
    expect(getEq(source, at, 2)).toBe(true);
    expect(getEq(at, 2)(source)).toBe(true);
    expect(set(source, at, 3)).toEqual(expected);
    expect(set(at, 3)(source)).toEqual(expected);
    expect(update(source, at, (n: unknown) => (n as number) + 1)).toEqual(expected);
    expect(get(source, at)).toBe(2);
  });

  it('retains reusable getters, predicates, and immutable transformers', () => {
    /** Records for the predicate cases. */
    const users = [{ name: 'Andre', enabled: true }, { name: 'Sam', enabled: false }];
    expect(users.map(get('name'))).toEqual(['Andre', 'Sam']);
    expect(users.filter(getEq('enabled', true))).toEqual([users[0]]);
    expect(users.map(set('enabled', false))).toEqual([{ name: 'Andre', enabled: false }, { name: 'Sam', enabled: false }]);
    /** A lens into a user name. */
    const name = lens<{ name: string; enabled: boolean }>()('name');
    expect(users.map(name.get)).toEqual(['Andre', 'Sam']);
    expect(name.getWith(value => value.toUpperCase())(users[0]!)).toBe('ANDRE');
  });

  it('preserves deep comparison capability through an explicit comparator', () => {
    /** A source with a nested array. */
    const source = { value: { nested: [1, 2] } };
    expect(getEq(source, 'value', { nested: [1, 2] })).toBe(false);
    expect(getEq(source, 'value', { nested: [1, 2] }, isDeepStrictEqual)).toBe(true);
    expect(getEq('value', { nested: [1, 2] })(source, isDeepStrictEqual)).toBe(true);
    /** A lens into its value. */
    const at = lens<typeof source>()('value');
    expect(at.getEq({ nested: [1, 2] }, isDeepStrictEqual)(source)).toBe(true);
  });
});
