# shape-toolbox

Read and update nested data, resolve nested promises, and compose asynchronous specifications without runtime dependencies.

ESM only. Requires Node.js 26 or newer. TypeScript declarations are included.

## Install

```sh
npm install shape-toolbox
```

## Compose a nested result

```ts
import { applySpecAsync } from 'shape-toolbox';

const load = applySpecAsync(
  {
    profile: async (id: number) => ({ id, name: 'Andre' }),
    nested: {
      orders: async (id: number) => [{ ownerId: id, total: 42 }],
    },
    labels: [(id: number) => `user-${id}`],
  },
  { concurrency: 2 },
);

const result = await load(1);
// { profile: { id: 1, name: 'Andre' },
//   nested: { orders: [{ ownerId: 1, total: 42 }] },
//   labels: ['user-1'] }
void result;
```

No specification function runs until `load` is called. Every leaf shares the same concurrency budget, including leaves in nested objects and arrays. The output shape and each leaf's result type are inferred.

## Read and update nested data

```ts
import { get, getOr, getWith, set, update } from 'shape-toolbox';

const original = { profile: { name: 'Andre', visits: 1 } };
const name = get(original, 'profile.name');
const label = getWith(original, 'profile.name', value => value.toUpperCase());
const fallback = getOr({ name: null }, 'name', 'Unknown');
const changed = set(original, 'profile.name', 'Sam');
const incremented = update(original, 'profile.visits', value => value + 1);
const names = [original, changed].map(get('profile.name'));
void [name, label, fallback, incremented, names];
```

Typed dotted and tuple paths support objects, arrays, reusable data-last functions, and lenses. Writes preserve the original, copy changed ancestors, and retain identity for unchanged values. See the [path guide](docs/paths.md).

## API

| Export | Purpose |
| --- | --- |
| `get`, `getOr`, `getWith`, `getEq` | Read a path, default, transform, or compare its value. |
| `set`, `update` | Immutably replace or transform a path value. |
| `lens<T>()(path)` | Create reusable typed path operations. |
| `allDeep(value, { signal }?)` | Await promises throughout plain objects and arrays. |
| `allSettledDeep(value, { signal }?)` | Replace promise boundaries with settled results and recursively settle their fulfilled values. |
| `allKeyed(object)` | Await the object's own enumerable property values into a null-prototype object. |
| `allSettledKeyed(object)` | Collect a settled result for each own enumerable property value. |
| `mapLimit(items, mapper, { concurrency, signal }?)` | Map an array with a concurrency limit and ordered output. |
| `applySpecAsync(spec, { concurrency, signal, mode }?)` | Create a function that executes a nested specification. |
| `failedPath(error)` | Retrieve a deep, specification, or mapper failure path without wrapping its error. |

The public type helpers are `DeepAwaited`, `DeepSettled`, `Spec`, `SpecArgs`, `SpecResult`, and `SpecSettled`. See the [async API guide](docs/api.md), [path guide](docs/paths.md), [recipes](docs/recipes.md), and [Go equivalents](docs/go-equivalents.md).

## Behavior

- Deep traversal visits plain objects and arrays. Class instances, dates, maps, sets, and other non-plain values remain unchanged.
- Cycles reject with a `TypeError`, including cycles through resolved promises. Shared references without a cycle are allowed.
- `allKeyed` and `allSettledKeyed` are shallow. They follow the proposal's own-enumerable-key behavior, including symbol keys, and do not delegate to native keyed methods.
- `applySpecAsync` reads and validates the specification once, when it is called, and throws a `TypeError` naming the path of any invalid leaf or cycle. Later changes to the specification object do not affect the returned function.
- `signal` in `applySpecAsync` options may be a factory, such as `() => AbortSignal.timeout(5_000)`, to give each call its own deadline.
- `applySpecAsync` accepts functions at leaves. Nested arrays stay arrays. Specification keys must be strings or array indices; enumerable symbol keys are rejected. It does not curry arguments or add an argument to leaf calls.
- The default specification mode, `'all'`, rejects on the first observed failure. The `'settled'` mode returns `PromiseSettledResult` at every function leaf.
- `failedPath` records deep-helper, specification, and mapper failures using string keys and numeric array indices. Failures beneath symbol keys have no recorded path.
- No export returns `any`. Untyped (`any`) input reads as `unknown`, so it cannot spread into calling code.
- Abort rejects with the signal's reason and prevents queued work from starting. Already-running I/O stops only if it cooperates with cancellation. `mapLimit` supplies its mapper with a signal.
- Already-created promises are already running. `allDeep` cannot limit their concurrency; use `mapLimit` or `applySpecAsync` to control when work starts.
- TypeScript cannot generally distinguish a class instance from a plain object structurally. Deep types may describe promise properties of a class as awaited even though runtime traversal leaves the instance unchanged.

## Migration from ramda-toolbox

Every original capability has a modern replacement. The 20 lens-family exports become `get`, `getOr`, `getWith`, `getEq`, and `set`, with explicit data-first and reusable data-last forms. `applySpecP`, `promiseAllRecursive`, and `propsP` become `applySpecAsync`, `allDeep`, and `allKeyed`. Native Promise methods replace the five simple Promise wrappers.

See the [complete 28-export migration table](docs/migration.md), including argument order, reusable functions, equality, defaults, and strict missing-parent writes. Legacy export names and full automatic currying are not retained.

## Development

```sh
npm ci
npm run build
npm test               # unit, type and property tests in Node
npm run test:browser   # the same runtime tests in Chromium, Firefox and WebKit
npm run test:mutation  # Stryker: how many deliberately broken versions the tests catch
npm run check          # everything CI runs on each push
```

`test:browser` needs the Playwright browsers once: `npx playwright install chromium firefox webkit`. Every exported and internal declaration carries JSDoc, enforced by `eslint-plugin-jsdoc`, and every `@example` is typechecked by `npm run docs:check`.

MIT licensed.
