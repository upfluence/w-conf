# @upfluence/w-conf

This package provides shared configuration for web projects at Upfluence.

## Installation

```bash
pnpm add -D @upfluence/w-conf
```

## Usage

You can extend your project's configuration files with the shared configurations provided by `@upfluence/w-conf`.

### Browsers

The shared browser target is exported as JSON. It is intended for use with Ember `config/targets.js` files:

````js
// config/targets.js
'use strict';

const browsers = require('@upfluence/w-conf/browsers/web-baseline.json');

module.exports = { browsers };

The current baseline uses Web Platform Baseline Widely Available, including
compatible downstream browsers, with an explicit iOS Safari safety floor:

```json
["baseline widely available with downstream", "last 5 ios_saf major versions"]
````

`baseline widely available with downstream` tracks features that are broadly
available across the Baseline core browser set and includes compatible
downstream browsers, such as browsers derived from Chromium or Gecko.

`last 5 ios_saf major versions` is intentionally added as a mobile safety rail. Based on our
traffic analysis, older iOS/Safari versions are the main unsupported pocket, and
mobile Safari traffic is important enough for us to keep this explicit floor.

This removes legacy targets such as IE 11 while keeping a stable, shared target
set across Ember apps, addons, engines, and host apps.

Consumer projects need a Browserslist toolchain that supports Baseline queries.
If a build fails with `Unknown browser query`, update the consumer's
Browserslist-related dependencies before using this shared target.

`pnpm dlx update-browserslist-db latest`

#### Web Baseline Coverage Check

`w-conf` also ships a repository-level check that compares the shared browser
target against real Google Analytics traffic:

```bash
pnpm web-baseline:check
```

The GA-backed check uses a 180-day window, `Sessions` as the primary metric, and
fails when known-session coverage drops below 95% or unknown traffic rises above
1%.

For local CSV exports matching the GA browser export shape:

```bash
pnpm web-baseline:check:csv /path/to/analytics-export.csv
```

To validate that the configured target can be parsed by the bundled Browserslist
version:

```bash
pnpm web-baseline:check:target
```

GA4 mode requires a property ID and a base64-encoded service-account JSON value:

```bash
export GA_PROPERTY_ID=123456789
export GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64="$(base64 -i service-account.json)"
```

### Prettier

The base Prettier configuration includes sensible defaults for code formatting that align with Upfluence's coding standards, including settings for Handlebars files and import sorting.

The Prettier configuration exports a `buildConfiguration` function that you can use to create your own Prettier configuration. It takes the following options:

```ts
interface PrettierConfigurationOptions {
  sortImport?: {
    enabled?: boolean; // default: true
    globPatterns?: string[]; // default: ['**/*.(js|ts)']
    packages?: string[]; // default: []
  };
}
```

To use, create a `prettier.config.mjs` file in the root of your project with the following content:

```js
import { buildConfiguration } from '@upfluence/w-conf/prettier';

export default buildConfiguration();
```

#### Prettier — Incremental adoption of import sorting

```js
import { buildConfiguration } from '@upfluence/w-conf/prettier';

export default buildConfiguration({
  sortImport: {
    globPatterns: ['packages/(settings-web|affiliates-web)/**/*.(ts)'],
    packages: ['@upfluence/settings-web', '@upfluence/affiliates-web']
  }
});
```

#### Prettier — Ensure local package grouping

```js
import { buildConfiguration } from '@upfluence/w-conf/prettier';

export default buildConfiguration({
  sortImport: {
    packages: ['@upfluence/my-local-package']
  }
});
```

This configuration will ensure that imports from `@upfluence/my-local-package` are grouped together in your import statements, separately from other external packages.

#### Prettier — Extending the configuration

If for some reason, you need to extend the base Prettier configuration to either add or override specific settings, you can do so by importing the base configuration and modifying it as needed:

```js
import { buildConfiguration } from '@upfluence/w-conf/prettier';

export default {
  ...buildConfiguration(),
  printWidth: 80 // Override the print width setting
};
```

### ESLint

A shared flat ESLint config (ESLint ≥ 10) for Upfluence Ember apps/addons.
It includes:

- `eslint:recommended`
- `eslint-plugin-ember` (+ `emberCompatibilityDisables`)
- `typescript-eslint` (`recommended`, untyped)
- `eslint-plugin-qunit` for tests
- `eslint-plugin-n` for node/config files
- `eslint-config-prettier`

References:

- [`eslint-phase1-rule-matrix.md`](https://linear.app/upfluence/issue/CD-205/introduce-shared-eslint-configuration#comment-09e0d01c)
- [`audit.md`](https://linear.app/upfluence/issue/CD-249/w-conf-package-ships-with-a-shared-eslint-config-projectsaddons-can#comment-74f1dbec)

#### Requirements

The ESLint export bundles its plugins and presets as package dependencies.
In consumer repositories, the minimal install is:

```bash
pnpm add -D @upfluence/w-conf eslint
```

#### Legacy Package Removal

When migrating from legacy `.eslintrc`, you can remove:

```bash
pnpm remove @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

#### Usage

Create an `eslint.config.mjs` at the root of your project.

By default, the package exports a standard, zero-config resolved array:

```js
// @ts-check
import { defineConfig } from 'eslint/config';
import upfluence from '@upfluence/w-conf/eslint';

export default defineConfig(...upfluence);
```

To customize globs/ignores, use `buildConfiguration`:

```js
import { defineConfig } from 'eslint/config';
import { buildConfiguration } from '@upfluence/w-conf/eslint';

export default defineConfig(
  ...buildConfiguration({
    ignores: ['dist/', 'vendor/', 'declarations/', 'coverage/', 'my-custom-unlinted-folder/'],
    testFiles: ['packages/*/tests/**/*-test.{js,ts}'],
    nodeFiles: ['eslint.config.mjs', 'ember-cli-build.js', 'config/**/*.js', 'scripts/**/*.mjs']
  })
);
```

> Unlike the legacy `.eslintrc.js` setup, flat config lints `.ts` files by
> default — no `--ext` flag needed.

> Note: `.ts` files are linted via `typescript-eslint` with its `recommended`
> (untyped) preset. Type-aware linting (`recommendedTypeChecked`) is intentionally
> deferred.

For advanced composition (monorepos, custom blocks), use named exports and keep
`eslintConfigPrettierPlaceLast` last:

```js
import { defineConfig } from 'eslint/config';
import {
  core,
  emberConfig,
  javascript,
  typescript,
  qunitTests,
  nodeFiles,
  DEFAULT_IGNORES,
  eslintConfigPrettierPlaceLast
} from '@upfluence/w-conf/eslint';

export default defineConfig(
  ...DEFAULT_IGNORES,
  ...core,
  ...emberConfig,
  ...javascript,
  ...typescript,
  ...qunitTests(['packages/*/tests/**/*-test.{js,ts}']),
  ...nodeFiles(),
  eslintConfigPrettierPlaceLast
);
```
