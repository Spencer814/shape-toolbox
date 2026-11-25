// Fails when a published declaration file mentions `any`, or a built-in type whose fields are `any`.
// Comments are not tokens, so prose about any is fine.
import { readdir, readFile } from 'node:fs/promises';
import ts from 'typescript';
const directory = new URL('../dist/', import.meta.url);
const hits = [];
// TypeScript's settled-result types carry `reason: any`; the package's own `Settled` type replaces them.
const anyCarriers = new Set(['PromiseSettledResult', 'PromiseRejectedResult']);
for (const name of await readdir(directory)) {
  if (!name.endsWith('.d.ts')) continue;
  const text = await readFile(new URL(name, directory), 'utf8');
  const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
  const visit = node => {
    const carrier = ts.isTypeReferenceNode(node) && anyCarriers.has(node.typeName.getText(file));
    if (node.kind === ts.SyntaxKind.AnyKeyword || carrier) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
      hits.push(`dist/${name}:${line + 1}${carrier ? ` (${node.typeName.getText(file)} has reason: any)` : ''}`);
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
