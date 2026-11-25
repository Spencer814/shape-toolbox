import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allDeep, applySpecAsync, mapLimit } from '../src/index.js';
import type { Spec } from '../src/index.js';

/** A generated tree: a number leaf (maybe async, maybe failing), an array or a plain object. */
type Desc = { readonly leaf: number; readonly wrap: boolean; readonly fail: boolean } | readonly Desc[] | { readonly [key: string]: Desc };

/**
 * Tells a leaf from a container.
 *
 * @param d - The generated node.
 * @returns Whether it is a leaf.
 */
const isLeaf = (d: Desc): d is { readonly leaf: number; readonly wrap: boolean; readonly fail: boolean } =>
  typeof (d as { leaf?: unknown }).leaf === 'number';

/** Trees of up to a few levels whose leaves may be async and may fail. */
const descTree = fc.letrec<{ node: Desc }>(tie => ({
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.record({ leaf: fc.integer(), wrap: fc.boolean(), fail: fc.boolean() }),
    fc.array(tie('node'), { maxLength: 4 }),
    fc.dictionary(fc.constantFrom('a', 'b', 'c', 'd', 'e'), tie('node'), { maxKeys: 4 }),
  ),
})).node;

/** The same trees with no failing leaves. */
const okTree = descTree.map(function clear(d: Desc): Desc {
  if (isLeaf(d)) return { ...d, fail: false };
  if (Array.isArray(d)) return (d as readonly Desc[]).map(clear);
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, clear(v)]));
});

/** Everything a test needs to drive one scheduled tree. */
interface Built {
  /** The input, with async leaves held by the scheduler. */
  readonly input: unknown;
  /** The input with every leaf as its plain value. */
  readonly expected: unknown;
  /** The error of each failing leaf. */
  readonly errors: readonly Error[];
  /** Leaf numbers in the order the scheduler released them. */
  readonly released: number[];
  /** Every container in the input, for mutating after the call. */
  readonly containers: object[];
}

/**
 * Turns a generated tree into scheduled input and its expected result.
 *
 * @param s - The fast-check scheduler.
 * @param desc - The generated tree.
 * @returns The input, expected value, leaf errors, release log and containers.
 */
const build = (s: fc.Scheduler, desc: Desc): Built => {
  /** Errors of failing leaves. */
  const errors: Error[] = [];
  /** Release order of async leaves. */
  const released: number[] = [];
  /** Containers in the input. */
  const containers: object[] = [];
  /** The next leaf id. */
  let id = 0;
  /**
   * Builds one node.
   *
   * @param d - The node.
   * @returns The input node and its expected value.
   */
  const go = (d: Desc): [unknown, unknown] => {
    if (isLeaf(d)) {
      /** This leaf's id. */
      const n = id++;
      if (!d.wrap) return [d.leaf, d.leaf];
      /** The error this leaf rejects with, when it fails. */
      const error = new Error(`leaf ${String(n)}`);
      if (d.fail) errors.push(error);
      return [s.schedule(Promise.resolve()).then(() => {
        released.push(n);
        if (d.fail) throw error;
        return d.leaf;
      }), d.leaf];
    }
    /** The node's children, built. */
    const kids = Object.entries(d).map(([k, v]) => [k, go(v)] as const);
    /** The input container. */
    const input: object = Array.isArray(d) ? kids.map(([, v]) => v[0]) : Object.fromEntries(kids.map(([k, v]) => [k, v[0]]));
    containers.push(input);
    return [input, Array.isArray(d) ? kids.map(([, v]) => v[1]) : Object.fromEntries(kids.map(([k, v]) => [k, v[1]]))];
  };
  /** The built root and its expected value. */
  const [input, expected] = go(desc);
  return { input, expected, errors, released, containers };
};

/**
 * Overwrites, adds and removes entries in every container, as a caller changing its input mid-flight would.
 *
 * @param containers - The containers to change.
 */
const scramble = (containers: readonly object[]): void => {
  for (const c of containers) {
    if (Array.isArray(c)) {
      c.splice(0, c.length, 'changed');
    } else {
      for (const key of Object.keys(c)) (c as Record<string, unknown>)[key] = 'changed';
      (c as Record<string, unknown>)['added'] = 'changed';
    }
  }
};

/** The result of a call, observed without letting it reject unhandled. */
type Outcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: unknown };

/**
 * Observes a promise's outcome and whether it has settled yet.
 *
 * @param promise - The promise to watch.
 * @param progress - Reads how many leaves have completed.
 * @returns A live `settled` flag, the completed count when it settled, and the eventual outcome.
 */
const watch = (
  promise: Promise<unknown>,
  progress: () => number = () => 0,
): { readonly settled: () => boolean; readonly settledAt: () => number | undefined; readonly outcome: Promise<Outcome> } => {
  /** Leaves completed when the promise settled. */
  let at: number | undefined;
  /** The outcome, recorded on settle. */
  const outcome = promise.then(
    (value): Outcome => { at = progress(); return { ok: true, value }; },
    (error: unknown): Outcome => { at = progress(); return { ok: false, error }; },
  );
  return { settled: () => at !== undefined, settledAt: () => at, outcome };
};

/**
 * Schedules an abort at a random point and records what had happened by then.
 *
 * @param s - The fast-check scheduler.
 * @param controller - The controller to abort.
 * @param state - Reads how many leaves were released and whether the result had settled.
 * @returns The abort reason and a reader for the snapshot taken when it fired.
 */
const scheduleAbort = (
  s: fc.Scheduler,
  controller: AbortController,
  state: () => { readonly released: number; readonly settled: boolean },
): { readonly reason: Error; readonly at: () => { readonly released: number; readonly settled: boolean } | undefined } => {
  /** The abort reason. */
  const reason = new Error('aborted');
  /** The state when the abort fired. */
  let snapshot: { readonly released: number; readonly settled: boolean } | undefined;
  void s.schedule(Promise.resolve()).then(() => {
    snapshot = state();
    controller.abort(reason);
  });
  return { reason, at: () => snapshot };
};

/**
 * Checks the outcome of a call that may have been aborted.
 *
 * @param outcome - What the call did.
 * @param expected - The value it returns when not aborted.
 * @param reason - The abort reason.
 * @param at - The state when the abort fired, if it did.
 * @param total - How many async leaves must finish before the call can resolve.
 * @param settledAt - Leaves completed when the call settled.
 */
const expectAbortOutcome = (
  outcome: Outcome,
  expected: unknown,
  reason: Error,
  at: { readonly released: number; readonly settled: boolean } | undefined,
  total: number,
  settledAt: number | undefined,
): void => {
  if (at === undefined || at.settled) {
    expect(outcome).toEqual({ ok: true, value: expected });
  } else if (at.released < total) {
    expect(outcome).toEqual({ ok: false, error: reason });
    expect((outcome as { error: unknown }).error).toBe(reason);
    // Rejects at the abort, not when the next leaf happens to finish.
    expect(settledAt).toBe(at.released);
  } else if (outcome.ok) {
    expect(outcome.value).toEqual(expected);
  } else {
    expect(outcome.error).toBe(reason);
  }
};

describe('allDeep under random completion orders', () => {
  it('resolves the same tree for every order, even when the input changes after the call', async () => {
    await fc.assert(fc.asyncProperty(fc.scheduler(), okTree, async (s, desc) => {
      /** The scheduled input and what it should resolve to. */
      const { input, expected, containers } = build(s, desc);
      /** The result under test. */
      const result = watch(allDeep(input));
      void s.schedule(Promise.resolve()).then(() => { scramble(containers); });
      await s.waitIdle();
      expect(await result.outcome).toEqual({ ok: true, value: expected });
    }), { numRuns: 100 });
  });

  it('rejects with one of the failing leaves\' errors when any leaf fails', async () => {
    await fc.assert(fc.asyncProperty(fc.scheduler(), descTree, async (s, desc) => {
      /** The scheduled input and what it should resolve to. */
      const { input, expected, errors } = build(s, desc);
      /** The result under test. */
      const result = watch(allDeep(input));
      await s.waitIdle();
      /** What the call did. */
      const outcome = await result.outcome;
      if (errors.length === 0) expect(outcome).toEqual({ ok: true, value: expected });
      else expect(errors).toContain((outcome as { error: unknown }).error);
    }), { numRuns: 100 });
  });

  it('rejects with the abort reason unless every leaf finished first', async () => {
    await fc.assert(fc.asyncProperty(fc.scheduler(), okTree, async (s, desc) => {
      /** The scheduled input and what it should resolve to. */
      const { input, expected, released } = build(s, desc);
      /** Async leaves in the input. */
      const total = s.count();
      /** The controller under test. */
      const controller = new AbortController();
      /** The result under test. */
      const result = watch(allDeep(input, { signal: controller.signal }), () => released.length);
      /** The abort reason and the state when it fired. */
      const { reason, at } = scheduleAbort(s, controller, () => ({ released: released.length, settled: result.settled() }));
      await s.waitIdle();
      expectAbortOutcome(await result.outcome, expected, reason, at(), total, result.settledAt());
    }), { numRuns: 100 });
  });
});

describe('mapLimit under random completion orders', () => {
  /** Items with a value and whether the mapper fails on them. */
  const items = fc.array(fc.record({ v: fc.integer(), fail: fc.boolean() }), { maxLength: 10 });
  /** A concurrency limit, including Infinity. */
  const limit = fc.oneof(fc.integer({ min: 1, max: 5 }), fc.constant(Number.POSITIVE_INFINITY));

  it('keeps input order, fills the limit and never exceeds it, even when the array changes after the call', async () => {
    await fc.assert(fc.asyncProperty(fc.scheduler(), items, limit, async (s, list, concurrency) => {
      /** The caller's array, changed after the call. */
      const source = list.map(x => x.v);
      /** Calls in flight. */
      let live = 0;
      /** The most calls at once. */
      let peak = 0;
      /** The result under test. */
      const result = watch(mapLimit(source, (v, i) => {
        peak = Math.max(peak, ++live);
        return s.schedule(Promise.resolve()).then(() => {
          live--;
          return [v, i] as const;
        });
      }, { concurrency }));
      void s.schedule(Promise.resolve()).then(() => { source.splice(0, source.length, -1, -2); });
      await s.waitIdle();
      expect(await result.outcome).toEqual({ ok: true, value: list.map((x, i) => [x.v, i]) });
      expect(peak).toBe(Math.min(concurrency, list.length));
    }), { numRuns: 100 });
  });

  it('rejects with the first failure to complete and starts nothing after rejecting', async () => {
    await fc.assert(fc.asyncProperty(fc.scheduler(), items, limit, async (s, list, concurrency) => {
      /** Indexes in completion order. */
      const completed: number[] = [];
      /** Calls started after the result settled. */
      let late = 0;
      /** The errors, one per item. */
      const errors = list.map((_, i) => new Error(`item ${String(i)}`));
      /**
       * Reads whether the result has settled; replaced once the result is watched.
       *
       * @returns Whether it has settled.
       */
      let settled = (): boolean => false;
      /** The call under test. */
      const call = mapLimit(list, (x, i) => {
        if (settled()) late++;
        return s.schedule(Promise.resolve()).then(() => {
          completed.push(i);
          if (x.fail) throw errors[i] as Error;
          return x.v;
        });
      }, { concurrency });
      /** The result under test. */
      const result = watch(call);
      settled = result.settled;
      await s.waitIdle();
      /** The first failing index to complete. */
      const first = completed.find(i => list[i]?.fail);
      expect(await result.outcome).toEqual(first === undefined
        ? { ok: true, value: list.map(x => x.v) }
        : { ok: false, error: errors[first] });
      expect(late).toBe(0);
    }), { numRuns: 100 });
  });

  it('rejects with the abort reason unless every call finished first, and starts nothing after it', async () => {
    await fc.assert(fc.asyncProperty(fc.scheduler(), items, limit, async (s, list, concurrency) => {
      /** Calls completed. */
      let completed = 0;
      /** Calls started after the abort. */
      let late = 0;
      /** The controller under test. */
      const controller = new AbortController();
      /** The result under test. */
      const result = watch(mapLimit(list, x => {
        if (controller.signal.aborted) late++;
        return s.schedule(Promise.resolve()).then(() => { completed++; return x.v; });
      }, { concurrency, signal: controller.signal }), () => completed);
      /** The abort reason and the state when it fired. */
      const { reason, at } = scheduleAbort(s, controller, () => ({ released: completed, settled: result.settled() }));
      await s.waitIdle();
      expectAbortOutcome(await result.outcome, list.map(x => x.v), reason, at(), list.length, result.settledAt());
      expect(late).toBe(0);
    }), { numRuns: 100 });
  });
});

describe('applySpecAsync under random completion orders', () => {
  /** Specs whose leaves are numbers, keyed a to e, with a limit. */
  const shape = fc.dictionary(fc.constantFrom('a', 'b', 'c', 'd', 'e'), fc.array(fc.integer(), { maxLength: 3 }), { minKeys: 1 });
  /** A concurrency limit, including Infinity. */
  const limit = fc.oneof(fc.integer({ min: 1, max: 4 }), fc.constant(Number.POSITIVE_INFINITY));

  /**
   * Builds a spec whose leaves wait on the scheduler.
   *
   * @param s - The fast-check scheduler.
   * @param values - The value each leaf returns.
   * @param log - Counts leaves started, live and completed.
   * @param log.live - Leaves in flight.
   * @param log.peak - The most leaves at once.
   * @param log.completed - Leaves that finished.
   * @param log.started - Called when a leaf starts.
   * @returns The spec.
   */
  const scheduledSpec = (
    s: fc.Scheduler,
    values: Record<string, number[]>,
    log: { live: number; peak: number; completed: number; started: () => void },
  ): Record<string, (() => Promise<number>)[]> =>
    Object.fromEntries(Object.entries(values).map(([k, vs]) => [k, vs.map(v => () => {
      log.started();
      log.peak = Math.max(log.peak, ++log.live);
      return s.schedule(Promise.resolve()).then(() => { log.live--; log.completed++; return v; });
    })]));

  it('mirrors the spec for every order and limit, even when the spec changes after compiling', async () => {
    await fc.assert(fc.asyncProperty(fc.scheduler(), shape, limit, async (s, values, concurrency) => {
      /** Counters for the leaves. */
      const log = { live: 0, peak: 0, completed: 0, started: (): void => {} };
      /** The spec, changed after compiling. */
      const spec = scheduledSpec(s, values, log);
      /** The compiled runner. */
      const run = applySpecAsync(spec as Spec, { concurrency });
      for (const key of Object.keys(spec)) spec[key] = [async () => -1];
      /** The result under test. */
      const result = watch(run());
      await s.waitIdle();
      expect(await result.outcome).toEqual({ ok: true, value: values });
      expect(log.peak).toBeLessThanOrEqual(concurrency);
    }), { numRuns: 100 });
  });

  it('rejects with the abort reason unless every leaf finished first, and starts nothing after it', async () => {
    await fc.assert(fc.asyncProperty(fc.scheduler(), shape, limit, async (s, values, concurrency) => {
      /** The controller under test. */
      const controller = new AbortController();
      /** Leaves started after the abort. */
      let late = 0;
      /** Counters for the leaves. */
      const log = { live: 0, peak: 0, completed: 0, started: (): void => { if (controller.signal.aborted) late++; } };
      /** The total number of leaves. */
      const total = Object.values(values).flat().length;
      /** The result under test, with a fresh signal read per call. */
      const result = watch(applySpecAsync(scheduledSpec(s, values, log) as Spec, { concurrency, signal: () => controller.signal })(), () => log.completed);
      /** The abort reason and the state when it fired. */
      const { reason, at } = scheduleAbort(s, controller, () => ({ released: log.completed, settled: result.settled() }));
      await s.waitIdle();
      expectAbortOutcome(await result.outcome, values, reason, at(), total, result.settledAt());
      expect(late).toBe(0);
    }), { numRuns: 100 });
  });
});
