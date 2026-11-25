# shape-toolbox

Typed async composition, nested data access and immutable updates, with no runtime dependencies and no `any`.

## Rules

- `npm run check` must exit 0 before any commit. It builds, then checks the API report, type cost, types, lint, unused code, 100% coverage, no `any`, docs, imports, package, size, capabilities and a packed consumer.
- Every declaration in `src` and `test` carries JSDoc; functions document every parameter and the return. `eslint-plugin-jsdoc` enforces it.
- Doc examples show each result with `//=>`, never `void`. `npm run docs:check` typechecks every README snippet and `@example`.
- No runtime dependencies. Dev dependencies are pinned to exact versions.
- New behavior gets tests next to the existing ones, in their `it('...')` style. Property tests use fast-check; async ordering uses `fc.scheduler()`.
- An intended public API change needs `npm run api:update` and the updated `etc/shape-toolbox.api.md` in the same commit.
- A type-cost baseline in `bench/types.attest.ts` changes only on purpose, with the reason in the commit message.
- `npm run test:browser` (Chromium, Firefox, WebKit) and `npm run test:mutation` (Stryker, 85% floor) run in CI; run them for changes to `src`.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `test:`, `build:`, `docs:`).

## Review focus

Correctness under every completion order and abort timing, input mutation after a call, `any` leaking into public types, prototype safety on writes, and type instantiation cost.
