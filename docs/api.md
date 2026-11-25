# Async API guide

For nested reads, immutable writes, reusable data-last functions, and lenses, see the [path guide](paths.md).

## allDeep

`allDeep<T>(value: T, options?): Promise<DeepAwaited<T>>` recursively awaits promises inside plain objects and arrays. Promise fulfillment can reveal more nested containers and promises.

```ts
import { allDeep } from 'shape-toolbox';

const result = await allDeep({
  id: Promise.resolve(1),
  nested: [Promise.resolve({ name: Promise.resolve('Andre') })],
});
const id: number = result.id;
const name: string | undefined = result.nested[0]?.name;
void [id, name];
```

Non-plain values remain the same objects. Neither this helper nor its signal can prevent work that started before the helper was called. Cycles are structural errors and reject the returned promise.

## allSettledDeep

`allSettledDeep<T>(value: T, options?): Promise<DeepSettled<T>>` preserves ordinary values and replaces each promise boundary with a settled result. A fulfilled promise's value is recursively processed, so a promise resolving to an object retains an outer fulfilled wrapper.

```ts
import { allSettledDeep } from 'shape-toolbox';

const result = await allSettledDeep({
  plain: 1,
  ok: Promise.resolve('ready'),
  bad: Promise.reject('unavailable'),
  nested: Promise.resolve({ count: Promise.resolve(2) }),
});
// plain: 1
// ok: { status: 'fulfilled', value: 'ready' }
// bad: { status: 'rejected', reason: 'unavailable' }
// nested: { status: 'fulfilled',
//           value: { count: { status: 'fulfilled', value: 2 } } }
void result;
```

Native promise assimilation collapses directly chained promises before settlement. A promise resolving to another promise therefore has one settled wrapper, while promises found inside its resolved object retain their own wrappers.

A rejected input promise becomes data. Structural cycles still reject the entire call. An abort also rejects the whole call with the signal's reason.

## allKeyed and allSettledKeyed

Both functions accept an object, including a callable object, and read its own enumerable string and symbol properties. They ignore inherited and non-enumerable properties. Results have a null prototype, so keys such as `__proto__` are ordinary data keys. Neither function delegates to a native keyed method.

```ts
import { allKeyed, allSettledKeyed } from 'shape-toolbox';

const values = await allKeyed({ count: Promise.resolve(2), label: 'ready' });
const results = await allSettledKeyed({
  ok: Promise.resolve(2),
  bad: Promise.reject('unavailable'),
});
const count: number = values.count;
if (results.ok.status === 'fulfilled') {
  const value: number = results.ok.value;
  void value;
}
void count;
```

These helpers are shallow. If a property resolves to an object containing another promise, that inner promise remains unchanged. `allKeyed` rejects on failure; `allSettledKeyed` records each property's success or failure.

See the [keyed combinators proposal](https://github.com/tc39/proposal-keyed-combinators) for the proposal semantics.

## mapLimit

`mapLimit(items, mapper, options?)` accepts an array and calls `mapper(item, index, signal)`. Results preserve input order regardless of completion order. The default concurrency is unbounded. A configured limit must be a positive integer or `Infinity`.

```ts
import { mapLimit } from 'shape-toolbox';

const result = await mapLimit(
  [3, 1, 2],
  async (value, index, signal) => {
    signal.throwIfAborted();
    return { index, doubled: value * 2 };
  },
  { concurrency: 2 },
);
void result;
```

On the first failure, the returned promise rejects with that reason, queued callbacks stop, and the signal supplied to running callbacks is aborted. Running callbacks must observe the signal to stop their own external work. Callback rejections remain observed after the result has rejected.

## applySpecAsync

`applySpecAsync(spec, options?)` creates an asynchronous function. Every function leaf receives the arguments passed to that function. Leaves can return ordinary values or promises. The specification may contain nested objects and arrays of leaves.

```ts
import { applySpecAsync } from 'shape-toolbox';

const build = applySpecAsync(
  {
    total: async (amount: number, tax = 0) => amount + tax,
    nested: { label: (amount: number) => String(amount) },
    list: [async (amount: number) => amount * 2],
  },
  { concurrency: 2 },
);
const result = await build(10, 2);

const collect = applySpecAsync(
  { ok: () => 1, bad: () => Promise.reject('unavailable') },
  { mode: 'settled' },
);
const settled = await collect();
void [result, settled];
```

The specification is read and validated once, when `applySpecAsync` is called. Its functions and container shape are captured then, so later changes to the specification object do not affect the returned function.

Specification keys are strings or array indices. Enumerable symbol specification keys are rejected, while deep and keyed helpers support symbol keys. Invalid runtime leaves and cycles throw a `TypeError` from `applySpecAsync` itself, naming the path, before any leaf can run.

Leaves must have compatible parameter types. A nested leaf's required parameters are still required at the returned function's call site. Optional and rest parameters are supported without adding an implicit signal parameter.

A signal in the options belongs to the returned function, and an aborted signal stays aborted. For a deadline on each call, pass a factory instead: `signal: () => AbortSignal.timeout(5_000)` creates a fresh signal per call. Pass a signal explicitly through your own arguments or a closure when the leaf's I/O needs it.

The concurrency limit applies to function leaf execution across the whole specification, not independently at each nesting level. Nested promises returned inside a leaf's ordinary result are not recursively resolved by this helper; use `allDeep` explicitly where needed.

## failedPath

`failedPath(error)` returns a readonly path of string keys and array indices, or `undefined`. The original rejection reason is never wrapped or mutated.

```ts
import { applySpecAsync, failedPath } from 'shape-toolbox';

const failure = new Error('Orders unavailable');
const load = applySpecAsync({
  nested: { orders: async () => { throw failure; } },
});
try {
  await load();
} catch (error) {
  const path = failedPath(error); // ['nested', 'orders']
  const sameError = error === failure; // true
  void [path, sameError];
}
```

Deep helpers record promise rejections and property/thenable getter failures. Specifications record failed function leaves, and `mapLimit` records failed mapper indices. Root deep rejections have an empty path. A failure beneath any symbol key has no recorded path because symbols cannot be represented by the string/number path API. Aborts and structural cycle errors do not receive a new leaf path.

Path metadata is stored separately with weak object keys. Primitive rejection reasons have no path. If the same error object is reused for more than one failure, its metadata cannot uniquely identify all of those occurrences; use distinct errors when that distinction matters.

## Type helpers

Valid interface-shaped specifications are checked by their members and do not need an index signature. Prefer inferred specifications or `satisfies Spec` to retain precise keys and result types. Annotating a value only as the broad `Spec` type erases result details, so its result is `unknown`; recursive specifications still retain known required leaf arguments.

| Type | Meaning |
| --- | --- |
| `DeepAwaited<T>` | Awaited shape for deep traversal |
| `DeepSettled<T>` | Shape with settled results at promise boundaries |
| `Spec` | Supported specification structure |
| `SpecArgs<S>` | Shared argument tuple accepted by the specification |
| `SpecResult<S>` | Shape containing awaited function results |
| `SpecSettled<S>` | Shape containing settled function results |

```ts
import { applySpecAsync } from 'shape-toolbox';
import type {
  DeepAwaited,
  DeepSettled,
  Spec,
  SpecArgs,
  SpecResult,
  SpecSettled,
} from 'shape-toolbox';

const specification = { value: async (id: number) => String(id) } satisfies Spec;
type Input = SpecArgs<typeof specification>;
type Output = SpecResult<typeof specification>;
type SettledOutput = SpecSettled<typeof specification>;
type DeepOutput = DeepAwaited<{ value: Promise<number> }>;
type DeepSettledOutput = DeepSettled<{ value: Promise<number> }>;

const args: Input = [1];
const result: Output = await applySpecAsync(specification)(...args);
const settled: SettledOutput = { value: { status: 'fulfilled', value: '1' } };
const deep: DeepOutput = { value: 1 };
const deepSettled: DeepSettledOutput = {
  value: { status: 'fulfilled', value: 1 },
};
void [result, settled, deep, deepSettled];
```
