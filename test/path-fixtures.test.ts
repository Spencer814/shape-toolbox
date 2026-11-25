import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allDeep, allSettledDeep, applySpecAsync, failedPath, get, getOr, set } from '../src/index.js';
import type { Spec } from '../src/index.js';

/** Any JSON value, as the fixtures express it. */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
/** What the strict mode should do: a value, or a rejection with a path. */
type AllExpectation = { value: Json } | { rejects: { message: string; path: (string | number)[] } };

/** One `deep.json` fixture case. */
interface DeepCase {
  /** The case name. */
  name: string;
  /** The input before promises are added. */
  input: Json;
  /** The strict-mode expectation. */
  all: AllExpectation;
  /** The settled-mode expectation. */
  settled: Json;
}
/** One `spec.json` fixture case. */
interface SpecCase {
  /** The case name. */
  name: string;
  /** The spec before functions are added. */
  spec: Json;
  /** The concurrency limit, `null` for unlimited. */
  concurrency: number | null;
  /** The most leaves expected in flight. */
  maxInFlight?: number;
  /** The strict-mode expectation. */
  all: AllExpectation;
  /** The settled-mode expectation. */
  settled: Json;
}

/**
 * Reads one fixture file.
 *
 * @typeParam T - The case type.
 * @param file - The file name.
 * @returns The cases.
 */
const load = <T>(file: string): T[] => JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8')) as T[];
/**
 * Narrows JSON to a plain object.
 *
 * @param x - A JSON value.
 * @returns Whether it is an object.
 */
const isObject = (x: Json): x is { [key: string]: Json } => typeof x === 'object' && x !== null && !Array.isArray(x);
/**
 * Waits.
 *
 * @param ms - The delay.
 * @returns A promise that resolves after `ms`.
 */
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Reads a fixture leaf marker, if the node is one.
 *
 * @param node - A fixture object.
 * @returns A thunk producing the leaf's value, or `undefined`.
 */
const leafOf = (node: { [key: string]: Json }): (() => Promise<unknown>) | undefined => {
  /** The leaf's delay. */
  const after = typeof node.after === 'number' ? node.after : 0;
  if ('$resolve' in node) return () => wait(after).then(() => decode(node.$resolve as Json, 'promise'));
  if ('$reject' in node) {
    return () =>
      wait(after).then(() => {
        throw new Error(typeof node.$reject === "string" ? node.$reject : JSON.stringify(node.$reject));
      });
  }
  return undefined;
};

/**
 * Turns fixture JSON into promises (for deep cases) or functions (for spec cases).
 *
 * @param node - Fixture JSON.
 * @param as - What each leaf becomes.
 * @returns The decoded value.
 */
function decode(node: Json, as: 'promise' | 'function'): unknown {
  if (Array.isArray(node)) return node.map((x) => decode(x, as));
  if (!isObject(node)) return node;
  /** The leaf thunk for this node, if any. */
  const leaf = leafOf(node);
  if (leaf) return as === 'promise' ? leaf() : leaf;
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, decode(v, as)]));
}

/**
 * Replaces settled `reason` errors with their message, the form the fixtures use.
 *
 * @param value - A settled result tree.
 * @returns The normalized copy.
 */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value !== 'object' || value === null) return value;
  /** The settled result, viewed as a record. */
  const record = value as Record<string, unknown>;
  if (record.status === 'rejected' && record.reason instanceof Error) {
    return { status: 'rejected', message: record.reason.message };
  }
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, normalize(v)]));
}

/**
 * Runs `run` and checks it against the strict expectation.
 *
 * @param run - The call.
 * @param expected - The expectation.
 */
async function expectAll(run: () => Promise<unknown>, expected: AllExpectation): Promise<void> {
  if ('value' in expected) {
    expect(await run()).toEqual(expected.value);
    return;
  }
  /** The rejection reason, or `undefined` if the call resolves. */
  const error = await run().then(
    () => undefined,
    (e: unknown) => e,
  );
  expect((error as Error).message).toBe(expected.rejects.message);
  expect(failedPath(error)).toEqual(expected.rejects.path);
}

describe('fixtures/deep.json', () => {
  for (const c of load<DeepCase>('deep.json')) {
    it(c.name, async () => {
      await expectAll(() => allDeep(decode(c.input, 'promise')), c.all);
      expect(normalize(await allSettledDeep(decode(c.input, 'promise')))).toEqual(c.settled);
      await wait(40);
    });
  }
});

describe('fixtures/spec.json', () => {
  for (const c of load<SpecCase>('spec.json')) {
    it(c.name, async () => {
      /** Leaves in flight. */
      let active = 0;
      /** The most leaves at once. */
      let peak = 0;
      /**
       * Wraps each leaf to record concurrency.
       *
       * @param node - A decoded spec node.
       * @returns The wrapped node.
       */
      const track = (node: unknown): unknown => {
        if (typeof node === 'function') {
          /** The original leaf. */
          const fn = node as () => Promise<unknown>;
          return async () => {
            active++;
            peak = Math.max(peak, active);
            try {
              return await fn();
            } finally {
              active--;
            }
          };
        }
        if (Array.isArray(node)) return node.map(track);
        if (typeof node === 'object' && node !== null) {
          return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, track(v)]));
        }
        return node;
      };
      /** The spec with tracked leaves. */
      const spec = track(decode(c.spec, 'function')) as Spec;
      /** The limit to use. */
      const concurrency = c.concurrency ?? Number.POSITIVE_INFINITY;
      await expectAll(() => applySpecAsync(spec, { concurrency })(), c.all);
      if (c.maxInFlight !== undefined) expect(peak).toBe(c.maxInFlight);
      expect(normalize(await applySpecAsync(spec, { concurrency, mode: 'settled' })())).toEqual(c.settled);
    });
  }
});

/** One `path.json` fixture case. */
interface PathCase {
  /** The case name. */
  name: string;
  /** The operation under test. */
  op: 'get' | 'getOr' | 'set';
  /** The data to operate on. */
  data: Json;
  /** The path. */
  path: (string | number)[];
  /** The `getOr` fallback. */
  fallback?: Json;
  /** The `set` value. */
  value?: Json;
  /** What the result must look like. */
  expect: { value?: Json; absent?: true; same?: true; error?: 'TypeError' | 'RangeError'; sharedPaths?: (string | number)[][] };
}

describe('fixtures/path.json', () => {
  /**
   * Passes a value through typed as `any`, so runtime checks are exercised.
   *
   * @param x - The value.
   * @returns The same value.
   */
  const loose = (x: Json): any => x;
  for (const c of load<PathCase>('path.json')) {
    it(c.name, () => {
      /**
       * Runs the operation for this case.
       *
       * @returns Its result.
       */
      const run = (): unknown =>
        c.op === 'get' ? get(loose(c.data), c.path) : c.op === 'getOr' ? getOr(loose(c.data), c.path, c.fallback) : set(loose(c.data), c.path, c.value);
      if (c.expect.error !== undefined) {
        expect(run).toThrow(c.expect.error === 'TypeError' ? TypeError : RangeError);
        return;
      }
      /** The result. */
      const out = run();
      if (c.expect.absent) expect(out).toBeUndefined();
      if (c.expect.same) expect(out).toBe(c.data);
      if ('value' in c.expect) expect(out).toEqual(c.expect.value);
      for (const shared of c.expect.sharedPaths ?? []) expect(get(loose(out as Json), shared)).toBe(get(loose(c.data), shared));
    });
  }
});
