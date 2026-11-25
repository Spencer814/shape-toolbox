import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { applySpecAsync, failedPath } from '../dist/index.js';
const directory = new URL('../fixtures/', import.meta.url);
let count = 0;
for (const name of await readdir(directory)) {
  if (!name.endsWith('.json')) continue;
  const fixture = JSON.parse(await readFile(new URL(name, directory), 'utf8'));
  const errors = [];
  const build = (node) => {
    if (node && typeof node === 'object' && '$task' in node) {
      const task = fixture.tasks[node.$task];
      if ('rejectError' in task) {
        const error = new Error(task.rejectError.message);
        error.name = task.rejectError.name;
        errors.push(error);
        return () => Promise.reject(error);
      }
      if ('reject' in task) return () => Promise.reject(task.reject);
      return () => Promise.resolve(task.resolve);
    }
    if (Array.isArray(node)) return node.map(build);
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, build(value)]));
  };
  assert.equal(fixture.operation, 'applySpecAsync');
  const run = applySpecAsync(build(fixture.spec), { mode: fixture.mode, concurrency: 2 });
  if (fixture.expectedRejection) {
    await assert.rejects(run(...fixture.args), error => {
      assert.equal(error.name, fixture.expectedRejection.name);
      assert.equal(error.message, fixture.expectedRejection.message);
      if (fixture.expectedRejection.sameIdentity) assert.equal(error, errors[0]);
      assert.deepEqual(failedPath(error), fixture.expectedRejection.path);
      return true;
    });
  } else {
    assert.deepEqual(await run(...fixture.args), fixture.expected);
  }
  count++;
}
assert.ok(count > 0);
console.log(`${count} portable behavior fixtures pass.`);
