# Recipes

## A deadline for each call

Pass a signal factory. Each call of the returned function gets a fresh timeout:

```ts
import { applySpecAsync } from 'shape-toolbox';

const loadUser = applySpecAsync(
  { profile: async (id: number) => ({ id }) },
  { signal: () => AbortSignal.timeout(5_000) },
);
void loadUser;
```

## A deadline that also reaches `fetch`

Create the timeout signal when the operation starts and pass it to both the spec and each leaf's I/O.

```ts
import { applySpecAsync } from 'shape-toolbox';

const load = async (id: number): Promise<{ profile: unknown }> => {
  const signal = AbortSignal.timeout(5_000);
  return applySpecAsync(
    {
      profile: async (userId: number) => {
        const response = await fetch(
          `https://example.com/users/${userId}`,
          { signal },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<unknown>;
      },
    },
    { signal },
  )(id);
};
void load;
```

This signal rejects the composition and also reaches `fetch`. Passing it only to `applySpecAsync` would stop queued leaves and reject the result, but would not automatically abort a leaf's fetch.

## Abort a limited map

```ts
import { mapLimit } from 'shape-toolbox';

const controller = new AbortController();
const pending = mapLimit(
  [1, 2, 3],
  async (id, _index, signal) => {
    const response = await fetch(`https://example.com/users/${id}`, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
  },
  { concurrency: 2, signal: controller.signal },
);

controller.abort(new Error('Canceled'));
try {
  await pending;
} catch (error) {
  const canceled = error === controller.signal.reason;
  void canceled;
}
```

## Advanced pooling with p-map

Use `mapLimit` for an array, an ordered result, fail-fast errors, and a signal. For async iterables, streaming consumption, backpressure, skipped items, or collecting multiple errors, use [p-map](https://github.com/sindresorhus/p-map#readme) directly.

Its ordinary mapping form is `await pMap(input, mapper, { concurrency: 4 })`. Use `pMapIterable(input, mapper, { concurrency: 4, backpressure: 8 })` with `for await` when results should be consumed incrementally. These are alternatives, not dependencies of shape-toolbox.

## Existing Effect applications

If your inputs are already Effects and the shape is flat, use Effect directly: `Effect.all({ profile, orders }, { concurrency: 4 })`. To preserve individual typed successes and failures, use `Effect.all({ profile, orders }, { concurrency: 4, mode: 'result' })`.

[Effect.all](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Effect.ts) already handles arrays and records of Effects. shape-toolbox accepts ordinary function leaves and promises; it does not execute Effect values or provide an Effect runtime. Convert at a deliberate application boundary only if you need both.

## Class instances and deep types

```ts
import { allDeep } from 'shape-toolbox';

class Box {
  value = Promise.resolve(1);
}

const box = new Box();
const result = await allDeep({ box });
// result.box is the original Box at runtime, with its promise still present.
const unchanged = Object.is(result.box, box);
void unchanged;
```

TypeScript's structural type system cannot generally distinguish a class instance from a plain object with the same fields. `DeepAwaited` and `DeepSettled` can therefore describe a class's promise properties as transformed even though runtime traversal leaves that instance unchanged. Keep deeply traversed inputs to ordinary data objects when you need exact type/runtime agreement.
