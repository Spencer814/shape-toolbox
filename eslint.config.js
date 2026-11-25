import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';

const FUNCTIONS = ['FunctionDeclaration', 'TSDeclareFunction', 'VariableDeclaration > VariableDeclarator > ArrowFunctionExpression'];
const DECLARATIONS = [
  'TSDeclareFunction',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSInterfaceBody > TSPropertySignature',
  'TSInterfaceBody > TSMethodSignature',
  'VariableDeclaration > VariableDeclarator > ArrowFunctionExpression',
  'Program > VariableDeclaration',
  'BlockStatement > VariableDeclaration',
  'Program > ExportNamedDeclaration > VariableDeclaration',
];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'site', 'node_modules', '.docs-check', 'reports', '.stryker-tmp'] },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // Abort and rejection reasons are unknown by design and must pass through unchanged.
      '@typescript-eslint/prefer-promise-reject-errors': ['error', { allowThrowingUnknown: true }],
    },
  },
  {
    // Library source: no `any`, and no inline comment can switch a rule off.
    files: ['src/**/*.ts'],
    linterOptions: { noInlineConfig: true },
    rules: { '@typescript-eslint/no-explicit-any': ['error', { fixToUnknown: true }] },
  },
  {
    // Every declaration in the library and its tests carries checked JSDoc; functions also document params and returns.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    ...jsdoc.configs['flat/recommended-typescript-error'],
    settings: { jsdoc: { mode: 'typescript', tagNamePreference: { template: 'typeParam' } } },
    rules: {
      ...jsdoc.configs['flat/recommended-typescript-error'].rules,
      'jsdoc/require-jsdoc': ['error', {
        require: { FunctionDeclaration: true },
        contexts: DECLARATIONS,
      }],
      // Inline object types like `{ id: number }` are documented by the parameter itself, not per property.
      'jsdoc/check-param-names': ['error', { checkDestructured: false }],
      'jsdoc/require-param': ['error', { checkDestructured: false, checkDestructuredRoots: false, contexts: FUNCTIONS, exemptedBy: ['privateRemarks'] }],
      'jsdoc/require-returns': ['error', { contexts: FUNCTIONS, exemptedBy: ['privateRemarks'] }],
      // TSDoc writes thrown types in prose (`TypeError` when ...), not as `{TypeError}`.
      'jsdoc/require-throws-type': 'off',
      'jsdoc/check-tag-names': ['error', { definedTags: ['remarks', 'typeParam', 'defaultValue', 'privateRemarks'] }],
      'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }],
    },
  },
  {
    files: ['src/path-types.ts', 'src/path.ts'],
    rules: {
      // DynamicString compares against an empty record on purpose to detect index-signature template paths.
      '@typescript-eslint/no-generated-empty-object-type': 'off',
      // getEq's two predicate overloads let `.filter(getEq(path, v))` type-check; one optional parameter would not.
      '@typescript-eslint/unified-signatures': 'off',
    },
  },
  {
    // Tests feed untyped data on purpose to prove `any` input comes out as `unknown`.
    files: ['test/**/*.ts', 'examples/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-meaningless-void-operator': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // Tests reject and throw primitives on purpose to prove reasons pass through unchanged.
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': false }],
    },
  },
  { files: ['**/*.js', '**/*.mjs'], ...tseslint.configs.disableTypeChecked },
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly' } } },
);
