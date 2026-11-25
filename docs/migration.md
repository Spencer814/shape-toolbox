# Migration from ramda-toolbox

shape-toolbox retains every original capability through modern names and explicit calling conventions. It does not export the legacy aliases, depend on Ramda or Bluebird, or reproduce automatic currying. Both path operations and asynchronous composition ship in this package.

## Every original export

The table covers all 28 original exports: 20 lens-family helpers, three async composition helpers, and five native Promise wrappers.

| Original export | Replacement |
| --- | --- |
| `viewLens` | `get(object, path)` or `get(path)(object)` |
| `viewLensIndex` | `get(array, index)` or `get(index)(array)` |
| `viewLensPath` | `get(object, path)` or `get(path)(object)` |
| `viewLensProp` | `get(object, key)` or `get(key)(object)` |
| `setLens` | `set(object, path, value)` or `set(path, value)(object)` |
| `setLensIndex` | `set(array, index, value)` or `set(index, value)(array)` |
| `setLensPath` | `set(object, path, value)` or `set(path, value)(object)` |
| `setLensProp` | `set(object, key, value)` or `set(key, value)(object)` |
| `viewOr` | `getOr(object, path, fallback)` or `getOr(path, fallback)(object)` |
| `viewOrIndex` | `getOr(array, index, fallback)` or `getOr(index, fallback)(array)` |
| `viewOrPath` | `getOr(object, path, fallback)` or `getOr(path, fallback)(object)` |
| `viewOrProp` | `getOr(object, key, fallback)` or `getOr(key, fallback)(object)` |
| `viewWith` | `getWith(object, path, fn)` or `getWith(path, fn)(object)` |
| `viewWithIndex` | `getWith(array, index, fn)` or `getWith(index, fn)(array)` |
| `viewWithPath` | `getWith(object, path, fn)` or `getWith(path, fn)(object)` |
| `viewWithProp` | `getWith(object, key, fn)` or `getWith(key, fn)(object)` |
| `viewEq` | `getEq(object, path, expected, compare?)` |
| `viewEqIndex` | `getEq(array, index, expected, compare?)` |
| `viewEqPath` | `getEq(object, path, expected, compare?)` |
| `viewEqProp` | `getEq(object, key, expected, compare?)` |
| `applySpecP` | `applySpecAsync(spec)(...args)` |
| `promiseAllRecursive` | `allDeep(value)` |
| `propsP` | `allKeyed(object)` |
| `allP` | `Promise.all(values)` |
| `allSettledP` | `Promise.allSettled(values)` |
| `anyP` | `Promise.any(values)` |
| `resolveP` | `Promise.resolve(value)` |
| `rejectP` | `Promise.reject(reason)` |

## Calling conventions

Data-first calls make a one-off transformation explicit. Data-last calls capture the path and operation for reuse in maps or pipelines.

```ts
import { get, getEq, getOr, getWith, set, update } from 'shape-toolbox';

const original = { profile: { name: 'Andre', count: 1 } };
const readName = get('profile.name');

readName(original); //=> 'Andre'
getOr('profile.name', 'Unknown')(original); //=> 'Andre'
getWith('profile.name', (name: string) => name.toUpperCase())(original); //=> 'ANDRE'
getEq('profile.name', 'Andre')(original); //=> true
set('profile.name', 'Sam')(original); //=> { profile: { count: 1, name: 'Sam' } }
update('profile.count', (count: number) => count + 1)(original); //=> { profile: { name: 'Andre', count: 2 } }
```

For custom data-last equality use `getEq(path, expected)(object, compare)`. A lens instead accepts the comparator while configuring its method: `lens<T>()(path).getEq(expected, compare)(object)`.

## Deliberate behavior changes

- **Equality:** `getEq` uses `Object.is` unless supplied a comparator. Previous deep comparisons need an explicit comparator with the required semantics.
- **Missing parents:** writes through optional parents are compile errors. Runtime writes through missing parents throw. Create a missing parent by setting the complete parent value.
- **Currying:** explicit data-last forms preserve reusable functions. Calls do not automatically curry according to argument count, and specifications do not inspect `fn.length`.
- **Paths:** dotted strings traverse nested keys. Use a tuple path when a literal key contains a period.
- **Class instances:** deep async helpers leave non-plain values unchanged instead of flattening their properties.
- **Specification arrays:** arrays stay arrays, including nested arrays.
- **Failures:** object rejection reasons retain their identity. `failedPath` stores available path metadata separately; primitive rejection reasons have no metadata.
- **Promise wrappers:** native methods use native settlement and `AggregateError` conventions. Do not depend on Bluebird-specific result methods.
- **Rejected promises:** the earlier `rejectP` accidentally resolved. Use `Promise.reject` for actual rejection.
- **Runtime and modules:** the package is ESM only and requires Node.js 26 or newer.

`getOr` retains fallback for `null`, `undefined`, and `NaN`, while preserving `false`, `0`, and `''`. Native `??` covers only the nullish cases.

See the [path guide](paths.md) and [async API guide](api.md) for complete behavior.
