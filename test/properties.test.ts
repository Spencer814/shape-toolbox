import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allDeep, allSettledDeep, applySpecAsync, get, lens, mapLimit, set, update } from '../src/index.js';
import type { PathTuple, Spec } from '../src/index.js';

/** Path keys and sibling keys come from disjoint alphabets, so a sibling never lands on the path. */
const pathKey = fc.constantFrom('a', 'b', 'c', 'd');
/** Random sibling values, keyed away from the path. */
const siblings = fc.dictionary(fc.constantFrom('x', 'y', 'z'), fc.jsonValue(), { maxKeys: 3 });

/** A nested plain object guaranteed to contain `path`, with random siblings at every level. */
const withPath = fc
  .array(pathKey, { minLength: 1, maxLength: 4 })
  .chain(path => fc.record({
    path: fc.constant(path as PathTuple),
    levels: fc.array(siblings, { minLength: path.length, maxLength: path.length }),
    leaf: fc.jsonValue(),
    value: fc.jsonValue(),
  }))
  .map(({ path, levels, leaf, value }) => {
    /** The tree being built from the leaf upward. */
    let node: unknown = leaf;
    for (let i = path.length - 1; i >= 0; i--) node = { ...levels[i], [path[i] as string]: node };
    return { obj: node as Record<string, unknown>, path, leaf, value };
  });

/** A JSON-like tree with some leaves wrapped in promises, paired with the same tree unwrapped. */
const promiseTree = fc.letrec<{ node: [unknown, unknown] }>(tie => ({
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.tuple(fc.jsonValue({ maxDepth: 0 }), fc.boolean()).map(([v, wrap]): [unknown, unknown] => [wrap ? Promise.resolve(v) : v, v]),
    fc.array(tie('node'), { maxLength: 4 }).map((kids): [unknown, unknown] => [kids.map(k => k[0]), kids.map(k => k[1])]),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 3 }).filter(k => k !== '__proto__'), tie('node'), { maxKeys: 4 })
      .map((kids): [unknown, unknown] => [
        Object.fromEntries(Object.entries(kids).map(([k, v]) => [k, v[0]])),
        Object.fromEntries(Object.entries(kids).map(([k, v]) => [k, v[1]])),
      ]),
  ),
})).node;

describe('set and update laws', () => {
  it('reads back what was written', () => {
    fc.assert(fc.property(withPath, ({ obj, path, value }) => {
      expect(get(set(obj, path, value) as unknown, path)).toEqual(value);
    }));
  });

  it('never changes its input', () => {
    fc.assert(fc.property(withPath, ({ obj, path, value }) => {
      /** The object before writing. */
      const before = structuredClone(obj);
      set(obj, path, value);
      update(obj, path, () => value);
      expect(obj).toEqual(before);
    }));
  });

  it('shares every branch off the path', () => {
    fc.assert(fc.property(withPath, ({ obj, path, value }) => {
      /** The written copy. */
      const out = set(obj, path, value) as Record<string, unknown>;
      /** A cursor into the original. */
      let a: Record<string, unknown> = obj;
      /** A cursor into the copy. */
      let b: Record<string, unknown> = out;
      for (const key of path) {
        for (const sibling of Object.keys(a)) if (sibling !== key) expect(b[sibling]).toBe(a[sibling]);
        a = a[key as string] as Record<string, unknown>;
        b = b[key as string] as Record<string, unknown>;
      }
    }));
  });

  it('returns the same object when the value is already there', () => {
    fc.assert(fc.property(withPath, ({ obj, path, leaf }) => {
      expect(set(obj, path, leaf)).toBe(obj);
      expect(update(obj, path, (v: unknown) => v)).toBe(obj);
    }));
  });

  it('writes any in-range array index without touching other elements', () => {
    fc.assert(fc.property(
      fc.array(fc.jsonValue(), { minLength: 1, maxLength: 8 }).chain(arr => fc.tuple(fc.constant(arr), fc.nat(arr.length - 1), fc.jsonValue())),
      ([arr, i, value]) => {
        /** The written array. */
        const out = set(arr as unknown, [i], value) as unknown[];
        expect(out[i]).toEqual(value);
        out.forEach((x, j) => { if (j !== i) expect(x).toBe(arr[j]); });
        expect(out).toHaveLength(arr.length);
      },
    ));
  });

  it('parses a dot path into the same keys as its tuple', () => {
    fc.assert(fc.property(fc.array(fc.stringMatching(/^[a-z][a-z0-9]{0,4}$/), { minLength: 1, maxLength: 5 }), keys => {
      expect(lens<unknown>()(keys.join('.')).path).toEqual(keys);
    }));
  });
});

describe('async laws', () => {
  it('allDeep returns the tree with every promise replaced by its value', async () => {
    await fc.assert(fc.asyncProperty(promiseTree, async ([input, expected]) => {
      expect(await allDeep(input)).toEqual(expected);
    }), { numRuns: 60 });
  });

  it('allSettledDeep never rejects for a rejected leaf and keeps the rest', async () => {
    await fc.assert(fc.asyncProperty(fc.array(fc.tuple(fc.integer(), fc.boolean()), { maxLength: 10 }), async items => {
      /** The settled results. */
      const settled = await allSettledDeep(items.map(([v, ok]) => ok ? Promise.resolve(v) : Promise.reject(new Error(String(v)))));
      settled.forEach((r, i) => {
        /** The input value and whether it fulfilled. */
        const [v, ok] = items[i] as [number, boolean];
        expect(r).toEqual(ok ? { status: 'fulfilled', value: v } : { status: 'rejected', reason: new Error(String(v)) });
      });
    }), { numRuns: 60 });
  });

  it('mapLimit keeps input order and never exceeds the limit', async () => {
    await fc.assert(fc.asyncProperty(fc.array(fc.nat(4), { maxLength: 12 }), fc.integer({ min: 1, max: 5 }), async (delays, concurrency) => {
      /** Calls in flight. */
      let live = 0;
      /** The most calls at once. */
      let peak = 0;
      /** The mapped indexes. */
      const out = await mapLimit(delays, async (d, i) => {
        peak = Math.max(peak, ++live);
        await new Promise(r => setTimeout(r, d));
        live--;
        return i;
      }, { concurrency });
      expect(out).toEqual(delays.map((_, i) => i));
      expect(peak).toBeLessThanOrEqual(concurrency);
    }), { numRuns: 40 });
  });

  it('applySpecAsync mirrors the spec shape and never exceeds the limit', async () => {
    await fc.assert(fc.asyncProperty(
      fc.dictionary(fc.constantFrom('a', 'b', 'c', 'd', 'e'), fc.array(fc.integer(), { maxLength: 3 }), { minKeys: 1 }),
      fc.integer({ min: 1, max: 4 }),
      async (shape, concurrency) => {
        /** Leaves in flight. */
        let live = 0;
        /** The most leaves at once. */
        let peak = 0;
        /**
         * Builds a leaf that records concurrency.
         *
         * @param v - The value to return.
         * @returns A leaf function.
         */
        const leaf = (v: number) => async () => {
          peak = Math.max(peak, ++live);
          await Promise.resolve();
          live--;
          return v;
        };
        /** The generated spec. */
        const spec = Object.fromEntries(Object.entries(shape).map(([k, vs]) => [k, vs.map(leaf)])) as Spec;
        expect(await applySpecAsync(spec, { concurrency })()).toEqual(shape);
        expect(peak).toBeLessThanOrEqual(concurrency);
      },
    ), { numRuns: 40 });
  });
});

/** Keys for the lens law: plain, index-like, negative, and the unsafe ones. */
const lensKey = fc.constantFrom<string | number>('a', 'b', '0', 0, 1, -1, '__proto__', 'constructor');
/** Trees that may or may not contain the path, with arrays, objects and primitives in between. */
const lensTree = fc.letrec<{ node: unknown }>(tie => ({
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.jsonValue({ maxDepth: 0 }),
    fc.array(tie('node'), { maxLength: 3 }),
    fc.dictionary(fc.constantFrom('a', 'b', '0'), tie('node'), { maxKeys: 3 }),
  ),
})).node;

/** What a call did: its value, or the error it threw. */
type Result = { readonly value: unknown } | { readonly error: string };

/**
 * Runs a call and records its value or error.
 *
 * @param fn - The call.
 * @returns The value, or the error's name and message.
 */
const attempt = (fn: () => unknown): Result => {
  try {
    return { value: fn() };
  } catch (error) {
    return { error: `${(error as Error).name}: ${(error as Error).message}` };
  }
};

/**
 * Checks that two calls on `obj` agree on value, error, and whether they returned `obj` itself.
 *
 * @param obj - The input both calls read.
 * @param viaLens - The call through a lens.
 * @param direct - The direct call.
 */
const expectSame = (obj: unknown, viaLens: () => unknown, direct: () => unknown): void => {
  /** The lens result. */
  const a = attempt(viaLens);
  /** The direct result. */
  const b = attempt(direct);
  expect(a).toEqual(b);
  if ('value' in a && 'value' in b) expect(a.value === obj).toBe(b.value === obj);
};

describe('lens law', () => {
  it('lens(path) get, set and update equal direct get, set and update, for tuple and dot paths', () => {
    fc.assert(fc.property(
      lensTree,
      fc.array(lensKey, { maxLength: 4 }),
      fc.jsonValue({ maxDepth: 1 }),
      fc.boolean(),
      (obj, keys, value, keep) => {
        /** The tuple path. */
        const tuple = keys as PathTuple;
        /** The dot form, when every key survives the round trip through a string. */
        const dot = keys.every(k => typeof k === 'number' ? k >= 0 : !k.includes('.') && !/^\d+$/.test(k)) ? keys.join('.') : undefined;
        /**
         * The update function: identity or a wrap.
         *
         * @param v - The current value.
         * @returns The new value.
         */
        const fn = (v: unknown): unknown => keep ? v : [v];
        for (const path of dot === undefined ? [tuple] : [tuple, dot]) {
          /** The lens under test. */
          const l = attempt(() => lens<unknown>()(path as never));
          if (!('value' in l)) {
            expect(attempt(() => get(obj, path as never))).toEqual(l);
            continue;
          }
          /** The built lens. */
          const focus = l.value as { get: (o: unknown) => unknown; set: (v: unknown) => (o: unknown) => unknown; update: (f: (v: unknown) => unknown) => (o: unknown) => unknown };
          expectSame(obj, () => focus.get(obj), () => get(obj, path as never));
          expectSame(obj, () => focus.set(value)(obj), () => set(obj, path as never, value as never));
          expectSame(obj, () => focus.update(fn)(obj), () => update(obj, path as never, fn as never));
        }
      },
    ), { numRuns: 300 });
  });
});
