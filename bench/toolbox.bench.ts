import { describe, test } from 'vitest';
import { allDeep, applySpecAsync, get, lens, mapLimit, set } from 'shape-toolbox';

/** A four-level object for the path benchmarks. */
const deep = { a: { b: { c: { d: 1, e: 2 }, f: [1, 2, 3] }, g: 'x' }, h: true };
/** Holds each result so the engine cannot drop the work. */
let sink: unknown;
/** A lens on the same leaf, built once. */
const focus = lens<typeof deep>()('a.b.c.d');

/** Fifty numbers for the async benchmarks. */
const numbers = Array.from({ length: 50 }, (_, i) => i);

/**
 * Builds a tree of resolved promises, ten keys of five each.
 *
 * @returns The tree.
 */
const promiseTree = (): Record<string, Promise<number>[]> =>
  Object.fromEntries(Array.from({ length: 10 }, (_, k) => [`k${String(k)}`, numbers.slice(k * 5, k * 5 + 5).map(n => Promise.resolve(n))]));

/**
 * Doubles a number asynchronously.
 *
 * @param n - The number.
 * @returns Twice `n`.
 */
const double = (n: number): Promise<number> => Promise.resolve(n * 2);

/** A spec of ten keys with five async leaves each. */
const spec = Object.fromEntries(Array.from({ length: 10 }, (_, k) => [`k${String(k)}`, numbers.slice(0, 5).map(n => () => Promise.resolve(n + k))]));
/** The compiled spec runner. */
const runSpec = applySpecAsync(spec);

describe('path access', () => {
  test('deep get', async ({ bench }) => {
    await bench.compare(
      bench('native property access', () => { sink = deep.a.b.c.d; }),
      bench('get with a dot path', () => { sink = get(deep, 'a.b.c.d'); }),
      bench('get with a tuple', () => { sink = get(deep, ['a', 'b', 'c', 'd']); }),
      bench('prebuilt lens', () => { sink = focus.get(deep); }),
    );
  });

  test('deep set', async ({ bench }) => {
    await bench.compare(
      bench('native spread', () => { sink = { ...deep, a: { ...deep.a, b: { ...deep.a.b, c: { ...deep.a.b.c, d: 9 } } } }; }),
      bench('set with a dot path', () => { sink = set(deep, 'a.b.c.d', 9); }),
      bench('prebuilt lens', () => { sink = focus.set(9)(deep); }),
    );
  });
});

describe('async composition', () => {
  test('allDeep on 50 promises in 10 arrays', async ({ bench }) => {
    await bench.compare(
      bench('native Promise.all per key', async () => {
        /** The tree to resolve. */
        const tree = promiseTree();
        /** The resolved arrays, in key order. */
        const values = await Promise.all(Object.values(tree).map(async list => Promise.all(list)));
        sink = Object.fromEntries(Object.keys(tree).map((k, i) => [k, values[i]]));
      }),
      bench('allDeep', async () => { sink = await allDeep(promiseTree()); }),
    );
  });

  test('mapLimit over 50 items', async ({ bench }) => {
    await bench.compare(
      bench('native Promise.all', async () => { sink = await Promise.all(numbers.map(double)); }),
      bench('mapLimit, no limit', async () => { sink = await mapLimit(numbers, double); }),
      bench('mapLimit, limit 8', async () => { sink = await mapLimit(numbers, double, { concurrency: 8 }); }),
    );
  });

  test('applySpecAsync with 50 leaves', async ({ bench }) => {
    await bench.compare(
      bench('native Promise.all and rebuild', async () => {
        /** Every leaf's result, in key order. */
        const values = await Promise.all(Object.values(spec).map(async leaves => Promise.all(leaves.map(async fn => fn()))));
        sink = Object.fromEntries(Object.keys(spec).map((k, i) => [k, values[i]]));
      }),
      bench('applySpecAsync, compiled once', async () => { sink = await runSpec(); }),
    );
  });
});

test('keeps the results', ({ expect }) => { expect(sink).toBeDefined(); });
