// @ts-check
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
 * Usage in a consuming repo (`eslint.config.mjs`):
 *
 *   import upfluence from '@upfluence/w-conf/eslint';
 *   export default upfluence;
 */
import js from '@eslint/js';
import eslintConfigPrettierPlaceLast from 'eslint-config-prettier';
import ember from 'eslint-plugin-ember/recommended';
import n from 'eslint-plugin-n';
import qunit from 'eslint-plugin-qunit';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * A single ESLint flat-config element accepted by {@link defineConfig}.
 * Equivalent to `Parameters<typeof defineConfig>[number]`.
 *
 * @typedef {Parameters<typeof defineConfig>[number]} ESLintConfigElement
 */

/**
 * Options accepted by {@link buildConfiguration}.
 *
 * @typedef {Object} ESLintConfigOptions
 * @property {string[]} [ignores]
 *   Custom ignore patterns. When provided, replaces {@link DEFAULT_IGNORES} entirely.
 *   Pass an empty array to disable all default ignores.
 * @property {string[]} [testFiles]
 *   Glob patterns for QUnit test files. Defaults to {@link DEFAULT_TEST_FILES}.
 * @property {string[]} [nodeFiles]
 *   Glob patterns for Node.js / config-file overrides. Defaults to {@link DEFAULT_NODE_FILES}.
 */

/*
 * Ember "classic"-era rules that every Upfluence repo already disables today.
 * They are enabled by `ember.configs.base` but kept OFF here so adoption of the
 * shared config introduces no new violations. Re-enabling any of these is a
 * deliberate modernization step, not core work.
 */
export const emberCompatibilityDisables = {
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
export const DEFAULT_NODE_FILES = [
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
export const DEFAULT_TEST_FILES = ['tests/**/*-test.{js,ts}'];

/* --- Building blocks (named exports for composition) --- */

/* `eslint:recommended` core. */
export const core = [js.configs.recommended];

/*
 * Ember recommended with the compatibility disables. */
export const emberConfig = /** @type {ESLintConfigElement[]} */ ([
  ember.configs.base,
  { name: 'upfluence/ember-compatibility-disables', rules: emberCompatibilityDisables }
]);

/*
 * typescript-eslint recommended, scoped to TS files.
 * Uses the UNTYPED `recommended` set on purpose: typed linting
 * (`recommendedTypeChecked`) needs a per-repo tsconfig/projectService and is
 * deferred to a later phase.
 */
export const typescript = [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
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
export const javascript = [
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

/**
 * @param {string[]} [files=DEFAULT_TEST_FILES]
 * @returns {ESLintConfigElement[]}
 */
export const qunitTests = (files = DEFAULT_TEST_FILES) => [
  {
    files,
    plugins: { qunit },
    rules: qunit.configs.recommended.rules
  }
];

/**
 * @param {string[]} [files=DEFAULT_NODE_FILES]
 * @returns {ESLintConfigElement[]}
 */
export const nodeFiles = (files = DEFAULT_NODE_FILES) => [
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
];

/**
 * Builds a complete ESLint flat-config array for an Upfluence web project.
 *
 * Assembles the standard rule set in the following order:
 *
 *  1. Ignore patterns — custom `options.ignores` or {@link DEFAULT_IGNORES}
 *  2. Linter meta-options (`reportUnusedDisableDirectives`, `reportUnusedInlineConfigs`)
 *  3. `eslint:recommended` core rules — {@link core}
 *  4. `eslint-plugin-ember` recommended + {@link emberCompatibilityDisables} — {@link emberConfig}
 *  5. JavaScript files (TypeScript parser, browser globals) — {@link javascript}
 *  6. TypeScript files (`typescript-eslint` recommended, untyped) — {@link typescript}
 *  7. QUnit test files (`eslint-plugin-qunit`) — {@link qunitTests}
 *  8. Node.js / config files (`eslint-plugin-n`, node globals) — {@link nodeFiles}
 *  9. Any additional flat-config elements passed via `extraESLintConfigs`
 * 10. `eslint-config-prettier` — always last to silence formatting rules
 *
 * ---
 *
 * **Zero-config** (`eslint.config.mjs` — recommended starting point):
 * ```js
 * import upfluence from '@upfluence/w-conf/eslint';
 * export default upfluence;
 * ```
 *
 * **With custom glob overrides:**
 * ```js
 * import { buildConfiguration } from '@upfluence/w-conf/eslint';
 * export default buildConfiguration({
 *   ignores: ['dist/', 'coverage/'],
 *   testFiles: ['packages/\*\/tests/\*\*\/*-test.{js,ts}'],
 *   nodeFiles: ['ember-cli-build.js', 'config/\*\*\/*.js'],
 * });
 * ```
 *
 * **With extra rules appended** (monorepo overrides, third-party plugins, etc.):
 * ```js
 * import { buildConfiguration } from '@upfluence/w-conf/eslint';
 * export default buildConfiguration(
 *   {},
 *   { rules: { 'no-console': 'warn' } },
 * );
 * ```
 *
 * @param {ESLintConfigOptions} [options={}]
 *   Glob customization options. All properties are optional; omitted ones fall
 *   back to their respective defaults ({@link DEFAULT_IGNORES},
 *   {@link DEFAULT_TEST_FILES}, {@link DEFAULT_NODE_FILES}).
 * @param {...ESLintConfigElement} extraESLintConfigs
 *   Additional flat-config elements inserted after the standard blocks but
 *   before `eslint-config-prettier`. Useful for monorepo-specific overrides,
 *   custom rules, or third-party plugins not included in the base set.
 * @returns {ReturnType<typeof defineConfig>}
 *   A fully resolved flat-config array, ready to export directly or to spread
 *   into a parent `defineConfig` call.
 */
export function buildConfiguration(options = {}, ...extraESLintConfigs) {
  const ignoresOrFallback = options.ignores !== undefined ? [{ ignores: options.ignores }] : DEFAULT_IGNORES;
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
