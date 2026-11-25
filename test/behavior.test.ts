import { describe, expect, it } from 'vitest';
import { allSettledDeep, applySpecAsync, failedPath, get, set } from '../src/index.js';
import type { Spec } from '../src/index.js';

// One case per behavior that is easy to get wrong, each asserted directly.
describe('edge behavior', () => {
  it('reads through class instances like property access', () => {
    class User { name = 'x'; }
    expect(get({ u: new User() }, 'u.name')).toBe('x');
  });

  it('rejects a non-function spec leaf at definition', () => {
    expect(() => applySpecAsync({ a: 1 } as unknown as Spec)).toThrow(/leaf at a is not a function/);
  });

  it('records failedPath for settled deep rejections', async () => {
    /** The error whose location is checked. */
    const error = new Error('x');
    /** The settled result. */
    const settled = await allSettledDeep({ a: { b: Promise.reject(error) } });
    expect(settled.a.b.status).toBe('rejected');
    expect(failedPath(error)).toEqual(['a', 'b']);
  });

  it('keeps getters and hidden properties when writing a sibling', () => {
    /** A getter beside the property being written. */
    const source = Object.defineProperty({ v: 0 }, 'g', { get: () => 1, enumerable: true });
    /** The written copy. */
    const written = set(source, 'v', 2);
    expect(typeof Object.getOwnPropertyDescriptor(written, 'g')?.get).toBe('function');
  });

  it('rejects extra arguments instead of ignoring them', () => {
    expect(() => (get as (...args: unknown[]) => unknown)({ a: 1 }, 'a', 'extra')).toThrow(/expected/);
  });

  it('returns promise-free input without waiting on nested work', async () => {
    /** Data for the typed-path assertions. */
    const input = { a: [1, { b: 2 }] };
    expect(await allSettledDeep(input)).toEqual(input);
  });
});
