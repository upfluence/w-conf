/*
 * Extensible Prettier configurations for Upfluence
 * @see https://prettier.io/docs/en/configuration.html
 */

const DEFAULT_SORT_IMPORT_CONFIG_OPTS = {
  enabled: true,
  globPatterns: ['**/*.(js|ts)'],
  packages: []
};

function buildSortImportConfig(globPatterns, packages) {
  return {
    files: globPatterns,
    options: {
      plugins: ['@trivago/prettier-plugin-sort-imports'],
      importOrderParserPlugins: ['decorators-legacy', 'typescript'],
      importOrder: [
        '^@(ember|ember-data|embroider|glimmer)/(.*)$',
        '<THIRD_PARTY_MODULES>',
        ...packages.map((pkg) => `^(${pkg}.*)$`),
        '^[./]'
      ],
      importOrderSeparation: true
    }
  };
}

export function buildConfiguration(opts = {}) {
  const sortImportOpts = { ...DEFAULT_SORT_IMPORT_CONFIG_OPTS, ...opts.sortImport };

  return {
    arrowParens: 'always',
    bracketSpacing: true,
    printWidth: 120,
    proseWrap: 'preserve',
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'none',
    useTabs: false,
    overrides: [
      {
        files: '*.hbs',
        options: {
          singleQuote: false
        }
      },
      ...(sortImportOpts.enabled ? [buildSortImportConfig(sortImportOpts.globPatterns, sortImportOpts.packages)] : [])
    ]
  };
}

export default buildConfiguration();
