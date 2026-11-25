import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
const directory = new URL('../dist/', import.meta.url);
for (const name of await readdir(directory)) {
  if (!name.endsWith('.js')) continue;
  const text = await readFile(new URL(name, directory), 'utf8');
  const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      assert.ok(node.moduleSpecifier.text.startsWith('.'), `${name}: external package import`);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(file) === 'require')) {
      assert.fail(`${name}: unexpected dynamic import or require`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
assert.equal(Object.keys(pkg.peerDependencies ?? {}).length, 0);
console.log('Built JavaScript has no external imports or runtime dependencies.');
