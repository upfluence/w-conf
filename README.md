# @upfluence/w-conf

This package provides shared configuration for web projects at Upfluence.

## Installation

```bash
pnpm add -D @upfluence/w-conf
```

## Usage

You can extend your project's configuration files with the shared configurations provided by `@upfluence/w-conf`.

### Prettier

The base Prettier configuration includes sensible defaults for code formatting that align with Upfluence's coding standards, including settings for Handlebars files and import sorting.

The Prettier configuration exports a `buildConfiguration` function that you can use to create your own Prettier configuration. It takes the following options:

```ts
interface PrettierConfigurationOptions {
  sortImports?: {
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
  sortImports: {
    globPatterns: ['packages/(settings-web|affiliates-web)/**/*.(ts)'],
    packages: ['@upfluence/settings-web', '@upfluence/affiliates-web']
  }
});
```

#### Prettier — Ensure local package grouping

```js
import { buildConfiguration } from '@upfluence/w-conf/prettier';

export default buildConfiguration({
  sortImports: {
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
