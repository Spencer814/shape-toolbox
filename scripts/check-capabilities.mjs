import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as toolbox from '../dist/index.js';
import * as asyncOnly from '../dist/async.js';
import * as pathOnly from '../dist/path.js';
const asynchronous = ['allDeep', 'allSettledDeep', 'allKeyed', 'allSettledKeyed', 'mapLimit', 'applySpecAsync', 'failedPath'];
const paths = ['get', 'getOr', 'getWith', 'getEq', 'set', 'update', 'lens'];
for (const [entry, names] of [[toolbox, [...asynchronous, ...paths]], [asyncOnly, asynchronous], [pathOnly, paths]]) {
  assert.deepEqual(Object.keys(entry).sort(), [...names].sort());
  for (const name of names) assert.equal(typeof entry[name], 'function');
}
const originals = ['applySpecP', 'promiseAllRecursive', 'propsP', 'allP', 'allSettledP', 'anyP', 'resolveP', 'rejectP'];
for (const family of ['viewLens', 'setLens', 'viewOr', 'viewWith', 'viewEq']) {
  for (const suffix of ['', 'Index', 'Path', 'Prop']) originals.push(family + suffix);
}
const guide = await readFile(new URL('../docs/migration.md', import.meta.url), 'utf8');
const rows = [...guide.matchAll(/^\| `([^`]+)` \|/gm)].map(match => match[1]);
assert.deepEqual(rows.sort(), originals.sort());
console.log('All 28 original exports have migration entries; all 14 modern helpers and both subpaths are present.');
