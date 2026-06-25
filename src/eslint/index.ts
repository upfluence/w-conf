/*
 * Shared ESLint flat configuration for Upfluence web projects.
 *
 * Built following https://typescript-eslint.io/getting-started/ and the
 * CD-205 Phase 1 audit (see `docs/eslint-phase1-rule-matrix.md`).
 *
 * Separation of concerns:
 *   - ESLint   -> code quality / correctness (this file)
 *   - Prettier -> formatting (`@upfluence/w-conf/prettier`)
 *
 * Authored in pure TypeScript and exported directly. No compilation or transformation
 * is needed because all consuming Upfluence codebases are TS-ready.
 *
 * Usage in a consuming repo (`eslint.config.mjs`):
 *
 *   import upfluence from '@upfluence/w-conf/eslint';
 *   export default upfluence;
 */
import js from '@eslint/js';
import type { Linter } from 'eslint';
import eslintConfigPrettierPlaceLast from 'eslint-config-prettier';
// @ts-expect-error - eslint plugins rarely ship types
import ember from 'eslint-plugin-ember/recommended';
import n from 'eslint-plugin-n';
import qunit from 'eslint-plugin-qunit';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

type ESLintConfigArgs = Parameters<typeof defineConfig>;
export type ESLintConfigElement = ESLintConfigArgs[number];

/*
 * Ember "classic"-era rules that every Upfluence repo already disables today.
 * They are enabled by `ember.configs.base` but kept OFF here so adoption of the
 * shared config introduces no new violations. Re-enabling any of these is a deliberate
 *  modernization step, not core work.
 */
export const emberCompatibilityDisables: Partial<Linter.RulesRecord> = {
  'ember/avoid-leaking-state-in-ember-objects': 'off',
  'ember/classic-decorator-no-classic-methods': 'off',
  'ember/closure-actions': 'off',
  'ember/no-actions-hash': 'off',
  'ember/no-assignment-of-untracked-properties-used-in-tracking-contexts': 'off',
  'ember/no-classic-classes': 'off',
  'ember/no-classic-components': 'off',
  'ember/no-component-lifecycle-hooks': 'off',
  'ember/no-computed-properties-in-native-classes': 'off',
  'ember/no-controller-access-in-routes': 'off',
  'ember/no-get': 'off',
  'ember/no-global-jquery': 'off',
  'ember/no-jquery': 'off',
  'ember/no-mixins': 'off',
  'ember/no-new-mixins': 'off',
  'ember/no-observers': 'off',
  'ember/no-settled-after-test-helper': 'off',
  'ember/require-tagless-components': 'off',
  'ember/use-ember-data-rfc-395-imports': 'off'
};

/*
 * Default node/config-file globs (standard ember-cli addon + app layout).
 * Normalizes the override that was inert in 6 repos (declared `plugins: ['node']`
 * but never extended the recommended set). Repos can pass their own list.
 */
export const DEFAULT_NODE_FILES: string[] = [
  '**/*.cjs',
  '.eslintrc.js',
  '.prettierrc.js',
  '.stylelintrc.js',
  '.template-lintrc.js',
  'ember-cli-build.js',
  'index.js',
  'testem.js',
  'testem*.js',
  'addon-main.cjs',
  'blueprints/*/index.js',
  'config/**/*.js',
  'lib/*/index.js',
  'server/**/*.js',
  'tests/dummy/config/**/*.js'
];

/* Default test globs (qunit). Covers js and ts test files. */
export const DEFAULT_TEST_FILES: string[] = ['tests/**/*-test.{js,ts}'];

/* --- Building blocks (named exports for composition) --- */

/* `eslint:recommended` core. */
export const core: ESLintConfigElement[] = [js.configs.recommended];

/*
 * Ember recommended with the compatibility disables.
 */
export const emberConfig: ESLintConfigElement[] = [
  ember.configs.base,
  { name: 'upfluence/ember-compatibility-disables', rules: emberCompatibilityDisables }
];

/*
 * typescript-eslint recommended, scoped to TS files.
 * Uses the UNTYPED `recommended` set on purpose: typed linting
 * (`recommendedTypeChecked`) needs a per-repo tsconfig/projectService and is
 * deferred to a later phase.
 */
export const typescript: ESLintConfigElement[] = [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    extends: [...tseslint.configs.recommended]
  }
];

/*
 * JavaScript files.
 * Uses `tseslint.parser` instead of Babel. It is completely capable of parsing
 * standard JS files containing decorators, allowing us to drop Babel!
 */
export const javascript: ESLintConfigElement[] = [
  {
    files: ['**/*.js'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.browser
      }
    }
  }
];

/* QUnit on test files. */
export const qunitTests = (files: string[] = DEFAULT_TEST_FILES): ESLintConfigElement[] => [
  {
    files,
    plugins: { qunit },
    rules: qunit.configs.recommended.rules
  }
];

/* Node/config files: CJS, node globals, eslint-plugin-n. */
export const nodeFiles = (files: string[] = DEFAULT_NODE_FILES): ESLintConfigElement[] => [
  {
    files,
    plugins: { n },
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 'latest',
      globals: {
        ...globals.node
      }
    }
  }
];

/* Re-export prettier so consumers always place it correctly (last). */
export { eslintConfigPrettierPlaceLast };

/* Sensible default ignores (node_modules is ignored by ESLint by default). */
export const DEFAULT_IGNORES = [
  {
    ignores: [
      'dist/',
      'declarations/',
      'coverage/',
      'tmp/',
      'blueprints/*/files/',
      'bower_components/',
      '.node_modules.ember-try/',
      'bower.json.ember-try',
      'package.json.ember-try'
    ]
  }
] as ESLintConfigElement[];

export interface ESLintConfigOptions {
  ignores?: string[];
  testFiles?: string[];
  nodeFiles?: string[];
}

/*
 * Create extensible and parameterized flat configuration for Upfluence web projects.
 */
export function buildConfiguration(options: ESLintConfigOptions = {}, ...extraESLintConfigs: ESLintConfigArgs) {
  const ignoresOrFallback: ESLintConfigElement[] =
    options.ignores !== undefined ? [{ ignores: options.ignores }] : DEFAULT_IGNORES;
  const testFilesOrFallback = options?.testFiles ?? DEFAULT_TEST_FILES;
  const nodeFilesOrFallback = options?.nodeFiles ?? DEFAULT_NODE_FILES;

  return defineConfig(
    ...ignoresOrFallback,
    {
      name: 'upfluence/linter-options',
      linterOptions: {
        reportUnusedDisableDirectives: 'error',
        reportUnusedInlineConfigs: 'error'
      }
    },
    ...core,
    ...emberConfig,
    ...javascript,
    ...typescript,
    ...qunitTests(testFilesOrFallback),
    ...nodeFiles(nodeFilesOrFallback),
    ...extraESLintConfigs,
    eslintConfigPrettierPlaceLast
  );
}

export default buildConfiguration();
