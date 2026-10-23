/**
 * @file   eslint.config.js
 * @brief  ESLint flat config: strict typed TypeScript rules, size limits and layer rules.
 *
 * Responsibility: enforce the size and structure rules of 10 §2 and the dependency rule
 *                 of 02 §3 (via eslint-plugin-boundaries). Formatting is left to Prettier.
 * Depends on:     tsconfig.json of the root and of every workspace project (typed linting),
 *                 tsconfig.base.json (the "@sbr/*" alias for import resolution)
 * Spec:           docs/spec/10-repository-structure.md §2, docs/spec/02-software-architecture.md §3
 */
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import boundariesModule from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

// The package types declare an ESM default export, but the package is CommonJS and its
// module.exports is the plugin itself, so the default import already is the plugin.
const boundaries = /** @type {import('eslint').ESLint.Plugin} */ (
  /** @type {unknown} */ (boundariesModule)
);

// One boundaries element per workspace project; the type is the folder name.
const ELEMENTS = [
  { type: 'domain', pattern: 'packages/domain' },
  { type: 'application', pattern: 'packages/application' },
  { type: 'contracts', pattern: 'packages/contracts' },
  { type: 'ui', pattern: 'packages/ui' },
  { type: 'server', pattern: 'apps/server' },
  { type: 'web', pattern: 'apps/web' },
  { type: 'admin', pattern: 'apps/admin' },
  { type: 'embed-loader', pattern: 'apps/embed-loader' },
];

/**
 * Which element may import which (02 §3). Anything not listed is disallowed, so domain,
 * contracts and embed-loader import nothing from other workspace projects.
 * @param {string} from
 * @param {string[]} to
 */
const allow = (from, to) => ({
  from: { element: { type: from } },
  allow: { to: { element: { types: { anyOf: to } } } },
});
const LAYER_POLICIES = [
  allow('application', ['domain', 'contracts']),
  allow('ui', ['contracts']),
  allow('server', ['domain', 'application', 'contracts']),
  allow('web', ['contracts', 'ui']),
  allow('admin', ['contracts', 'ui']),
];

// Default exports are banned so every import names what it uses.
const NO_DEFAULT_EXPORT = [
  { selector: 'ExportDefaultDeclaration', message: 'Use a named export.' },
  { selector: 'ExportSpecifier[exported.name="default"]', message: 'Use a named export.' },
];

export default defineConfig(
  // Build and test output, and the git-ignored scratch folder of runs (docs/NIGHT-RUN.md).
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/coverage/',
      'tmp/',
      'test-results/',
      'playwright-report/',
      // Static files served as they are (the plain early theme script, outside the TS
      // projects); apps/web/src/shell/theme.test.tsx runs it.
      'apps/web/public/',
      // The load check: a plain Node script against a running stack, outside the TS projects.
      'load/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { boundaries },
    settings: {
      'boundaries/elements': ELEMENTS,
      // The resolver only needs the "@sbr/*" alias, which lives in the base config.
      'import/resolver': { typescript: { project: 'tsconfig.base.json' } },
    },
    rules: {
      'no-restricted-syntax': ['error', ...NO_DEFAULT_EXPORT],
      'max-lines': ['error', { max: 300 }],
      'max-lines-per-function': ['error', { max: 60 }],
      complexity: ['error', 12],
      'max-params': ['error', 4],
      // Underscore-prefix is the TS convention for a deliberately unused parameter;
      // dispatch maps whose handler type requires an argument the specific handler
      // doesn't consume rely on it (see packages/domain/src/match/decide.ts).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'boundaries/dependencies': ['error', { default: 'disallow', policies: LAYER_POLICIES }],
    },
  },
  {
    // The server's build script and its stub: plain JavaScript run by Node, outside the TS projects.
    files: ['apps/server/build.mjs', 'apps/server/devStub.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: { projectService: false, project: false, program: null },
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: { 'max-lines': ['error', { max: 400 }] },
  },
  {
    // Tool config files must default-export their configuration (Vite, Vitest, etc.);
    // so must Playwright's global setup.
    files: ['*.config.js', '*.config.ts', '**/*.config.js', '**/*.config.ts', 'e2e/globalSetup.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  prettier,
);
