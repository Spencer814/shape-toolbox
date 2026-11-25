// Fails when a published declaration file mentions `any`. Comments are not tokens, so prose about any is fine.
import { readdir, readFile } from 'node:fs/promises';
import ts from 'typescript';
const directory = new URL('../dist/', import.meta.url);
const hits = [];
for (const name of await readdir(directory)) {
  if (!name.endsWith('.d.ts')) continue;
  const text = await readFile(new URL(name, directory), 'utf8');
  const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
  const visit = node => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
      hits.push(`dist/${name}:${line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}
if (hits.length) {
  console.error(`Published types contain any:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('Published declarations contain no any.');
