import { describe, expect, it } from 'vitest';
import { allDeep, applySpecAsync } from '../src/index.js';

describe('retained promiseAllRecursive behavior', () => {
  it.each([
    [42, 42],
    ['hello', 'hello'],
    [[1, 2, 3], [1, 2, 3]],
    [{ a: 1, b: 2 }, { a: 1, b: 2 }],
    [{ a: 1, b: {} }, { a: 1, b: {} }],
    [Promise.resolve('resolved'), 'resolved'],
    [[Promise.resolve(1), Promise.resolve(2)], [1, 2]],
    [[Promise.resolve(1), 2, Promise.resolve(3)], [1, 2, 3]],
    [{ a: Promise.resolve(1), b: Promise.resolve(2), c: 3 }, { a: 1, b: 2, c: 3 }],
    [{ nested: { a: Promise.resolve(1) }, b: Promise.resolve(2), c: 3 }, { nested: { a: 1 }, b: 2, c: 3 }],
    [{ nested: [Promise.resolve(1), 2], b: Promise.resolve(2), c: 3 }, { nested: [1, 2], b: 2, c: 3 }],
    [{ a: 1, nested: [{ b: [Promise.resolve(42)] }] }, { a: 1, nested: [{ b: [42] }] }],
  ])('resolves legacy fixture %#', async (input, expected) => {
    expect(await allDeep(input)).toEqual(expected);
  });
});

describe('retained applySpecP behavior without currying or fn.length', () => {
  /**
   * Adds two numbers asynchronously.
   *
   * @param a - One number.
   * @param b - The other.
   * @returns The sum.
   */
  const add = async (a: number, b: number): Promise<number> => a + b;
  it('handles empty, unary, binary, nested and map-key specifications', async () => {
    expect(await applySpecAsync({})()).toEqual({});
    expect(await applySpecAsync({ v: async (a: number) => a + 1, u: async (a: number) => a - 1 })(1)).toEqual({ v: 2, u: 0 });
    expect(await applySpecAsync({ sum: add })(1, 2)).toEqual({ sum: 3 });
    expect(await applySpecAsync({ mul: async (a: number, b: number) => a * b, nested: { sum: add } })(1, 2)).toEqual({ mul: 2, nested: { sum: 3 } });
    expect(await applySpecAsync({ map: async (value: { a: number }) => value.a })({ a: 1 })).toEqual({ map: 1 });
  });
  it('passes shared arguments to mixed arities and preserves arrays', async () => {
    /**
     * Formats a two-argument call.
     *
     * @param a - First.
     * @param b - Second.
     * @returns The description.
     */
    const binary = async (a: number, b: number): Promise<string> => `BinaryFn called with ${a}, ${b}`;
    /**
     * Formats a three-argument call.
     *
     * @param a - First.
     * @param b - Second.
     * @param c - Third.
     * @returns The description.
     */
    const ternary = async (a: number, b: number, c: number): Promise<string> => `TernaryFn called with ${a}, ${b}, ${c}`;
    /**
     * A leaf reading its third argument.
     *
     * @param _a - Unused.
     * @param _b - Unused.
     * @param c - The third argument.
     * @returns `c`.
     */
    const third = (_a: number, _b: number, c: number): number => c;
    expect(await applySpecAsync({ f1: binary, f2: ternary, list: [third, third, third, third] })(0, 1, 2)).toEqual({
      f1: 'BinaryFn called with 0, 1', f2: 'TernaryFn called with 0, 1, 2', list: [2, 2, 2, 2],
    });
  });
});
