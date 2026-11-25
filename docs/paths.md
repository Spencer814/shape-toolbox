# Typed paths and immutable updates

The path helpers ship in the same package as the async helpers. They work on plain objects and arrays without Ramda, persistent collection wrappers, or runtime dependencies.

## API forms

| Operation | Data-first | Reusable data-last |
| --- | --- | --- |
| Read | `get(object, path)` | `get(path)(object)` |
| Default | `getOr(object, path, fallback)` | `getOr(path, fallback)(object)` |
| Transform a read | `getWith(object, path, fn)` | `getWith(path, fn)(object)` |
| Compare | `getEq(object, path, expected, compare?)` | `getEq(path, expected)(object, compare?)` |
| Replace | `set(object, path, value)` | `set(path, value)(object)` |
| Update | `update(object, path, fn)` | `update(path, fn)(object)` |
| Reusable lens | `lens<T>()(path)` | Methods capture the path and accept the object last. |

The comparator belongs to the returned function in data-last `getEq`: use `getEq(object, path, expected, compare)` or `getEq(path, expected)(object, compare)`. This keeps its three-argument data-first form unambiguous.

## Paths, arrays, and literal keys

Dotted paths separate property names with periods, such as `'profile.name'` and `'items.0.name'`. Tuple paths express the same traversal without splitting their keys. Use a tuple when a literal key contains a period. Numeric paths select array indices, including negative indices counted from the end.

```ts
import { get } from 'shape-toolbox';

const data = { items: [{ name: 'first' }, { name: 'last' }] };
const first = get(data, 'items.0.name');
const last = get(data, ['items', -1, 'name'] as const);
const literal = get({ 'a.b': { value: 3 } }, ['a.b', 'value'] as const);
const finalItem = get(['first', 'last'], -1);
void [first, last, literal, finalItem];
```

The empty string and an empty tuple select the root. Reads of missing values or out-of-range indices yield `undefined`. Typed paths reject invalid keys where the input type makes that possible. Dynamic paths cannot provide the same static guarantees as literal paths. Reusable helpers snapshot tuple paths so later changes to the caller's tuple do not redirect the operation.

## Defaults and transformed reads

`getOr` uses the fallback for `null`, `undefined`, and `NaN`. It preserves `0`, `false`, and the empty string. This retains the earlier toolbox's defaulting behavior; `??` alone does not default for `NaN`.

`getWith` passes the selected value to your function and returns that function's result. It does not modify the input.

```ts
import { getOr, getWith } from 'shape-toolbox';

const data = { score: Number.NaN, active: false, count: 0, label: '' };
const score = getOr(data, 'score', 10);
const active = getOr(data, 'active', true);
const count = getOr(data, 'count', 10);
const label = getOr(data, 'label', 'Unknown');
const display = getWith({ profile: { name: 'Andre' } }, 'profile.name', name => name.toUpperCase());
void [score, active, count, label, display];
```

## Equality

`getEq` defaults to `Object.is`. Primitive values compare predictably, including `NaN`. Distinct objects compare unequal unless you provide a comparator. `0` and `-0` are different under `Object.is`.

```ts
import { getEq } from 'shape-toolbox';

const user = { profile: { id: 1 }, score: Number.NaN };
const sameScore = getEq(user, 'score', Number.NaN);
const sameProfile = getEq(
  user,
  'profile',
  { id: 1 },
  (actual, expected) => actual.id === expected.id,
);
const hasProfile = getEq('profile', { id: 1 });
const reusableComparison = hasProfile(
  user,
  (actual, expected) => actual.id === expected.id,
);
void [sameScore, sameProfile, reusableComparison];
```

The comparator receives `(actual, expected)`. Supply a comparator with the needed semantics when migrating code that relied on Ramda's deep equality.

## Immutable writes

`set` replaces a value. `update` calls a function with the current value and stores its result. Changed ancestors are copied; unrelated branches remain shared. An update that leaves the selected value unchanged retains the original reference. Unchanged own properties retain their descriptors, including non-enumerable fields, symbols, and accessors; cloning does not evaluate those accessors. The selected property is replaced with a data property. Array length is managed by the new array so frozen inputs can still be updated immutably.

```ts
import { set, update } from 'shape-toolbox';

const original = { profile: { name: 'Andre', count: 1 }, unchanged: { id: 2 } };
const renamed = set(original, 'profile.name', 'Sam');
const incremented = update(original, 'profile.count', count => count + 1);
const same = set(original, 'profile.name', 'Andre');
const sharedBranch = renamed.unchanged === original.unchanged;
const sameRoot = same === original;
void [incremented, sharedBranch, sameRoot];
```

Writes never silently invent a missing parent. A write through an optional parent is a compile error. Set a complete parent value to create it, or update the parent only when it is present.

```ts
import { set, update } from 'shape-toolbox';

type User = { address?: { city: string; zip: string } };
const user: User = {};
const created = set(user, 'address', { city: 'Columbia', zip: '65201' });
const ifPresent = update(user, 'address', address =>
  address ? { ...address, city: 'Columbia' } : address,
);
void [created, ifPresent];
```

For untyped inputs or runtime paths, encountering a missing parent throws a `TypeError` naming the path. Writes through non-plain parents also throw. Writes to unsafe prototype-related keys are rejected. Replacing a complete field is distinct from traversing into a non-plain value.

A final array index equal to the current length appends one value. Writes do not create gaps. Negative indices are resolved from the current array length. Deep writes through a generic array index can be rejected by the type checker because the element may be missing; tuple positions or explicit parent updates provide stronger guarantees.

## Reusable functions and lenses

The explicit data-last forms retain the earlier toolbox's reusable getter and updater pattern without automatic argument-count currying. Their returned callbacks accept normal `map` and `filter` calls, ignoring the extra index and collection arguments that those methods supply.

```ts
import { get, getOr, set, update } from 'shape-toolbox';

const users = [
  { profile: { name: 'Andre', visits: 1 } },
  { profile: { name: 'Sam', visits: 2 } },
];
const names = users.map(get('profile.name'));
const defaults = users.map(getOr('profile.name', 'Unknown'));
const renamed = users.map(set('profile.name', 'Pat'));
const visited = users.map(update('profile.visits', (visits: number) => visits + 1));
void [names, defaults, renamed, visited];
```

A lens fixes both the object type and the path:

```ts
import { lens } from 'shape-toolbox';

type User = { profile: { name: string } };
const name = lens<User>()('profile.name');
const user: User = { profile: { name: 'Andre' } };
const value = name.get(user);
const fallback = name.getOr('Unknown')(user);
const uppercase = name.getWith(value => value.toUpperCase())(user);
const matches = name.getEq('Andre')(user);
const changed = name.set('Sam')(user);
const updated = name.update(value => value.toUpperCase())(user);
void [value, fallback, uppercase, matches, changed, updated];
```

Use `name.getEq(expected, compare)(object)` for a custom lens comparator. The lens methods preserve the focused value type.

## Use a lens as a path

Pass a typed lens directly wherever a path is accepted. The lens carries its captured tuple path, so it can be reused with both calling styles:

```ts
import { get, getEq, lens, set } from 'shape-toolbox';

type User = { address: { city: string; zip: string }; active: boolean };
const user: User = {
  address: { city: 'St. Louis', zip: '63101' },
  active: true,
};
const focus = lens<User>()('address.city');
const city = get(user, focus);
const changed = set(user, focus, 'Columbia');
const readCity = get(focus);
const reusable = readCity(user);
const users: User[] = [user, changed];
const cities = users.map(readCity);
const activeUsers = users.filter(getEq('active', true));
void [city, reusable, cities, activeUsers];
```

Passing the lens as a path preserves the same type checks and strict write rules as its original path. The `map` and `filter` callbacks above do not interpret their automatically supplied index arguments as operation options or equality comparators.

## Reusable predicate typing

For the strongest compile-time checking of reusable predicates, construct a typed lens first. TypeScript can widen a generic `getEq(path, expected)` predicate when it is passed directly to `filter`, which can allow an incompatible comparison value through type checking. Direct calls and `lens<T>()(path).getEq(expected)` retain the expected-value check. Runtime comparison semantics are the same.

## Dynamic paths

Literal paths retain their checked value and result types. A path known only at runtime produces an `unknown` read or write result; validate that result before assuming its shape. Unbounded template-literal strings, including prefixed templates, are treated conservatively too. Finite literal paths retain their checked types. The runtime still checks paths and requires existing intermediate parents.
