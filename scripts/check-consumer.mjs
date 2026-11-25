import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'shape-toolbox-consumer-'));
const npm = (args, cwd) => execFileSync('npm', args, { cwd, encoding: 'utf8' });
const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', scratch], root));
const artifact = join(scratch, packed[0].filename);
await writeFile(join(scratch, 'package.json'), JSON.stringify({ name: 'shape-toolbox-consumer', private: true, type: 'module' }));
npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', artifact], scratch);
await writeFile(join(scratch, 'test.mjs'), `import assert from 'node:assert/strict';
import { allDeep, allSettledDeep, allKeyed, allSettledKeyed, applySpecAsync, mapLimit, failedPath, get, getOr, getWith, getEq, set, update, lens } from 'shape-toolbox';
import * as asyncOnly from 'shape-toolbox/async';
import * as pathOnly from 'shape-toolbox/path';
assert.deepEqual(await allDeep({ n: Promise.resolve(1) }), { n: 1 });
assert.deepEqual(await applySpecAsync({ n: (n) => n + 1 })(1), { n: 2 });
assert.deepEqual(await mapLimit([1], (n) => n), [1]);
assert.equal((await allKeyed({ n: 1 })).n, 1);
assert.equal((await allSettledKeyed({ n: 1 })).n.status, 'fulfilled');
assert.equal((await allSettledDeep({ n: Promise.resolve(1) })).n.status, 'fulfilled');
assert.equal(failedPath(null), undefined);
const user = { id: 1, address: { city: 'Columbia' }, count: NaN };
assert.equal(get(user, ['address', 'city']), 'Columbia');
assert.equal(getOr(user, 'count', 0), 0);
assert.equal(getWith(user, 'id', n => n + 1), 2);
assert.equal(getEq(user, 'id', 1), true);
assert.deepEqual(set(user, 'address.city', 'Denver'), { ...user, address: { city: 'Denver' } });
assert.equal(user.address.city, 'Columbia');
assert.equal(update(user, 'id', n => n + 1).id, 2);
const city = lens()('address.city');
assert.equal(get(user, city), 'Columbia');
assert.equal(get(city)(user), 'Columbia');
assert.equal(city.set('Denver')(user).address.city, 'Denver');
assert.deepEqual([user].map(get('id')), [1]);
assert.deepEqual([user].filter(getEq('id', 1)), [user]);
assert.equal('get' in asyncOnly, false);
assert.equal('allDeep' in pathOnly, false);
assert.equal(typeof asyncOnly.allDeep, 'function');
assert.equal(typeof pathOnly.get, 'function');
const hidden = Object.defineProperty({ id: 1, length: 3 }, 'hidden', { value: 42 });
const changed = set(hidden, 'id', 2);
assert.equal(changed.hidden, 42);
assert.equal(changed.length, 3);
assert.deepEqual(Object.getOwnPropertyDescriptor(changed, 'hidden'), Object.getOwnPropertyDescriptor(hidden, 'hidden'));
const metadata = Symbol('x');
const symbolic = { [metadata]: 42, 'Symbol(x)': 1 };
assert.equal(set(symbolic, 'Symbol(x)', 2)[metadata], 42);
const frozen = Object.freeze([1, 2]);
assert.deepEqual(set(frozen, 0, 3), [3, 2]);

`);
await writeFile(join(scratch, 'test.ts'), `import { allDeep, allSettledDeep, applySpecAsync, get, set, update, lens } from 'shape-toolbox';
import { get as pathGet } from 'shape-toolbox/path';
import { allDeep as asyncDeep } from 'shape-toolbox/async';
import type { Spec } from 'shape-toolbox';
const deep: Promise<{ n: number }> = allDeep({ n: Promise.resolve(1) });
const result: Promise<{ n: number }> = applySpecAsync({ n: (n: number) => n + 1 })(1);
void deep; void result;
// @ts-expect-error specification arguments remain checked
applySpecAsync({ n: (n: number) => n })('bad');
interface Load { n: (id: number) => number }
const specification: Load = { n: id => id };
const typed: Promise<{ n: number }> = applySpecAsync(specification)(1);
void typed;
declare const erased: Spec;
const broad: Promise<unknown> = applySpecAsync(erased)(1);
void broad;
const assimilated = await allSettledDeep(new Promise<Promise<number>>(resolve => resolve(Promise.resolve(1))));
if (assimilated.status === 'fulfilled') { const n: number = assimilated.value; void n; }
// @ts-expect-error incompatible required object fields fail at definition
applySpecAsync({ a: (x: { id: number }) => x.id, b: (x: { id: string }) => x.id });
interface User { id: number; address?: { city: string; zip: string } }
declare const user: User;
const city: string | undefined = get(user, 'address.city');
const id: number = pathGet(user, 'id');
const focused = lens<User>()('id');
const focusedId: number = get(user, focused);
const label: string = focused.getWith(value => value.toFixed())(user);
set(user, 'address', { city: 'Columbia', zip: '65201' });
update(user, 'address', address => address ? { ...address, city: 'Denver' } : address);
// @ts-expect-error a missing parent cannot be invented
set(user, 'address.city', 'Denver');
// @ts-expect-error replacement parents must satisfy their complete shape
set(user, 'address', { city: 'Denver' });
// @ts-expect-error literal paths remain validated
get(user, 'does.not.exist');
// @ts-expect-error typed focus retains its numeric write type
focused.set('bad');
void [city, id, focusedId, label, asyncDeep];
const record: Record<string, { name: string }> = { id: { name: 'x' } };
const templatePath = 'id.name' as \`id\${string}\`;
const templateRead: unknown = get(record, templatePath);
const templateWrite: unknown = set(record, templatePath, { name: 'wrong' });
// @ts-expect-error runtime-parsed template paths do not prove the original shape
const falseWrite: typeof record = set(record, templatePath, { name: 'wrong' });
// @ts-expect-error runtime-parsed template paths do not prove the property value type
const falseRead: { name: string } | undefined = get(record, templatePath);
void [templateRead, templateWrite, falseWrite, falseRead];

`);
execFileSync(process.execPath, [join(scratch, 'test.mjs')], { stdio: 'inherit' });
await writeFile(join(scratch, 'tsconfig.json'), JSON.stringify({ compilerOptions: { noEmit: true, strict: true, target: 'ES2024', module: 'NodeNext' }, include: ['test.ts'] }));
for (const version of ['5.9.3', '6.0.3', '7.0.2']) {
  execFileSync('npm', ['exec', '--yes', `--package=typescript@${version}`, '--', 'tsc', '-p', join(scratch, 'tsconfig.json')], { cwd: scratch, stdio: 'inherit' });
  console.log(`Packed consumer types pass on TypeScript ${version}.`);
}
const installed = JSON.parse(await readFile(join(scratch, 'node_modules/shape-toolbox/package.json')));
if (Object.keys(installed.dependencies ?? {}).length) throw new Error('Unexpected runtime dependencies');
console.log(`Packed artifact installs, executes, and typechecks in a clean consumer: ${scratch}`);
