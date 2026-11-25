import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const output = new URL('.docs-check/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output);
const docs = ['README.md', ...(await readdir(new URL('docs/', root))).filter(n => n.endsWith('.md')).map(n => `docs/${n}`)];
let count = 0;
let examples = 0;
for (const name of (await readdir(new URL('src/', root))).filter(n => n.endsWith('.ts'))) {
  const text = await readFile(new URL(`src/${name}`, root), 'utf8');
  for (const comment of text.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
    const body = comment[0].replace(/^\s*\* ?/gm, '');
    for (const match of body.matchAll(/@example\s*```(?:ts|typescript)\n([\s\S]*?)```/g)) {
      await writeFile(new URL(`example-${++examples}.ts`, output), match[1]);
    }
  }
}
for (const name of docs) {
  const text = await readFile(new URL(name, root), 'utf8');
  for (const match of text.matchAll(/```(?:ts|typescript)\n([\s\S]*?)```/g)) {
    await writeFile(new URL(`snippet-${++count}.ts`, output), match[1]);
  }
}
await writeFile(new URL('tsconfig.json', output), JSON.stringify({ extends: '../tsconfig.json', include: ['./*.ts'] }));
execFileSync(process.execPath, [fileURLToPath(new URL('node_modules/typescript/bin/tsc', root)), '-p', fileURLToPath(new URL('tsconfig.json', output))], { stdio: 'inherit' });
console.log(`${count} documentation snippets and ${examples} JSDoc examples typecheck.`);
