// @ts-check
/*
 * Shared ESLint flat configuration for Upfluence web projects.
 *
 * Built following https://typescript-eslint.io/getting-started/ and the
 * CD-205 Phase 1 audit.
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
 *
 * @typedef {Parameters<typeof defineConfig>[number]} ESLintConfigElement
 */

/**
 * Options accepted by {@link buildConfiguration}.
 *
 * @typedef {Object} ESLintConfigOptions
 * @property {string[]} [ignores]
 *   Custom ignore patterns added to {@link DEFAULT_IGNORES}.
 * @property {boolean} [replaceDefaultIgnores]
 *   When true, use only `ignores`. Pass `ignores: []` to disable all default ignores.
 * @property {string[]} [testFiles]
 *   Glob patterns for QUnit test files. Defaults to {@link DEFAULT_TEST_FILES}.
 * @property {string[]} [nodeFiles]
 *   Glob patterns for Node.js / config-file overrides. Defaults to {@link DEFAULT_NODE_FILES}.
 */

/*
 * Ember rules that every Upfluence repo already disables today.
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
  'ember/no-runloop': 'off',
  'ember/no-settled-after-test-helper': 'off',
  'ember/require-tagless-components': 'off',
  'ember/use-ember-data-rfc-395-imports': 'off'
};

/*
 * Default node/config-file globs (standard ember-cli addon + app layout).
 */
export const DEFAULT_NODE_FILES = [
  '.eslintrc.js',
  '.prettierrc.js',
  '.stylelintrc.js',
  '.template-lintrc.js',
  '.template-lintrc.mjs',
  '*.config.js',
  '*.config.mjs',
  '**/*.cjs',
  'addon-main.cjs',
  'blueprints/*/index.js',
  'config/**/*.js',
  'ember-cli-build.js',
  'index.js',
  'lib/*/index.js',
  'scripts/**/*.{js,mjs,cjs}',
  'server/**/*.js',
  'testem.js',
  'testem*.js',
  'tests/dummy/config/**/*.js'
];

/*
 * Default test globs (qunit). Covers js and ts test files.
 */
export const DEFAULT_TEST_FILES = ['tests/**/*-test.{js,ts}'];

/* --- Exported building blocks (for composition) --- */

/*
 * `eslint:recommended` core.
 */
export const core = /** @type {ESLintConfigElement[]} */ ([
  { ...js.configs.recommended, name: 'upfluence/eslint-recommended' },
  {
    name: 'upfluence/core-rules',
    rules: {
      'no-multiple-empty-lines': ['error', { max: 1 }]
    }
  }
]);

/*
 * Ember recommended with the compatibility disables.
 */
export const emberConfig = /** @type {ESLintConfigElement[]} */ ([
  { ...ember.configs.base, name: 'upfluence/ember-base' },
  { name: 'upfluence/ember-compatibility-disables', rules: emberCompatibilityDisables },
  {
    name: 'upfluence/ember-rules',
    rules: {
      'ember/no-empty-glimmer-component-classes': 'off'
    }
  }
]);

/*
 * typescript-eslint recommended, scoped to TS files.
 * Uses the UNTYPED `recommended` set on purpose: typed linting
 * (`recommendedTypeChecked`) needs a per-repo tsconfig/projectService and is
 * deferred to a later phase.
 */
export const typescript = /** @type {ESLintConfigElement[]} */ ([
  {
    name: 'upfluence/typescript',
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.browser
      }
    },
    extends: [...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'always' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          minimumDescriptionLength: 10,
          'ts-check': false,
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true
        }
      ]
    }
  }
]);

/*
 * JavaScript files.
 * Note: `tseslint.parser` can parse JS files.
 */
export const javascript = [
  {
    name: 'upfluence/javascript',
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
export const qunitTests = (files = DEFAULT_TEST_FILES) =>
  files.length === 0
    ? []
    : [
        {
          name: 'upfluence/qunit-tests',
          files,
          plugins: { qunit },
          rules: {
            ...qunit.configs.recommended.rules,
            'qunit/require-expect': ['error', 'except-simple']
          }
        }
      ];

const browserGlobalsOff = Object.fromEntries(Object.keys(globals.browser).map((name) => [name, 'off']));

/**
 * @param {string[]} [files=DEFAULT_NODE_FILES]
 * @returns {ESLintConfigElement[]}
 */
export const nodeFiles = (files = DEFAULT_NODE_FILES) => {
  if (files.length === 0) return [];

  const nodeConfigs = [
    { ...n.configs['flat/recommended-script'], files: ['**/*.{js,cjs}'] },
    { ...n.configs['flat/recommended-module'], files: ['**/*.mjs'] }
  ];

  return nodeConfigs.map((config) => ({
    ...config,
    name: `upfluence/${config.name}`,
    files: config.files.flatMap((moduleGlob) => files.map((fileGlob) => [fileGlob, moduleGlob])),
    languageOptions: {
      ...config.languageOptions,
      ecmaVersion: 'latest',
      globals: {
        ...browserGlobalsOff,
        ...(config.languageOptions?.globals ?? {})
      }
    }
  }));
};

/*
 * Re-export prettier so consumers always place it correctly (last).
 */
export { eslintConfigPrettierPlaceLast };

/*
 * Sensible default ignores (node_modules is ignored by ESLint by default).
 */
export const DEFAULT_IGNORES = [
  {
    name: 'upfluence/default-ignores',
    ignores: [
      '.eslintcache',
      '.node_modules.ember-try/',
      'blueprints/*/files/',
      'bower_components/',
      'bower.json.ember-try',
      'coverage/',
      'declarations/',
      'dist/',
      'package.json.ember-try',
      'storybook-static/',
      'tmp/',
      'vendor/'
    ]
  }
];

/**
 * Builds a complete ESLint flat-config array for an Upfluence web project.
 *
 * Assembles the standard rule set:
 *
 *  - Ignore patterns — {@link DEFAULT_IGNORES} plus custom `options.ignores`
 *  - Linter meta-options (`reportUnusedDisableDirectives`, `reportUnusedInlineConfigs`)
 *  - `eslint:recommended` core rules — {@link core}
 *  - `eslint-plugin-ember` recommended + {@link emberCompatibilityDisables} — {@link emberConfig}
 *  - JavaScript files (TypeScript parser, browser globals) — {@link javascript}
 *  - TypeScript files (`typescript-eslint` recommended, untyped) — {@link typescript}
 *  - QUnit test files (`eslint-plugin-qunit`) — {@link qunitTests}
 *  - Node.js / config files (`eslint-plugin-n`, node globals) — {@link nodeFiles}
 *  - Any additional flat-config elements passed via `extraESLintConfigs`
 *  - `eslint-config-prettier` — always last to silence formatting rules
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
 *   ignores: ['my-custom-unlinted-folder/'],
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
 *   {@link DEFAULT_TEST_FILES}, {@link DEFAULT_NODE_FILES}). Pass an empty
 *   `testFiles` or `nodeFiles` array to disable that configuration block.
 * @param {...ESLintConfigElement} extraESLintConfigs
 *   Additional flat-config elements inserted after the standard blocks.
 *   Useful for monorepo-specific overrides, custom rules, or third-party
 *   plugins not included in the base set.
 * @returns {ReturnType<typeof defineConfig>}
 *   A fully resolved flat-config array, ready to export directly or to spread
 *   into a parent `defineConfig` call.
 */
export function buildConfiguration(options = {}, ...extraESLintConfigs) {
  const { ignores = [] } = options;
  const customIgnores = ignores.length > 0 ? [{ name: 'upfluence/custom-ignores', ignores }] : [];
  const ignoreConfigs = options.replaceDefaultIgnores ? customIgnores : [...DEFAULT_IGNORES, ...customIgnores];
  const testFilesOrFallback = options?.testFiles ?? DEFAULT_TEST_FILES;
  const nodeFilesOrFallback = options?.nodeFiles ?? DEFAULT_NODE_FILES;

  return defineConfig(
    ...ignoreConfigs,
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
    { ...eslintConfigPrettierPlaceLast, name: 'upfluence/prettier' }
  );
}

export default buildConfiguration();
