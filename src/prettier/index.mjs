/*
 * Extensible Prettier configurations for Upfluence
 * @see https://prettier.io/docs/en/configuration.html
 */

export function buildConfiguration(opts = {}) {
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
      {
        files: ['**/*.(js|ts)'],
        options: {
          plugins: ['@trivago/prettier-plugin-sort-imports'],
          importOrderParserPlugins: ['decorators-legacy', 'typescript'],
          importOrder: [
            '^@(ember|ember-data|embroider|glimmer)/(.*)$',
            '<THIRD_PARTY_MODULES>',
            ...(opts.packages ?? []).map((pkg) => `^(${pkg}.*)$`),
            '^[./]'
          ],
          importOrderSeparation: true
        }
      }
    ]
  };
}

export default buildConfiguration({});
