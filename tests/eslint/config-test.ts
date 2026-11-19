/// <reference types="node" />
// Snapshot the resolved ESLint rule set for representative file scopes.
// Refresh intentionally with `UPDATE_ESLINT_RULES_SNAPSHOT=1 pnpm test`.
import { ESLint } from 'eslint';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';

import config, {
  buildConfiguration,
  DEFAULT_IGNORES,
  DEFAULT_NODE_FILES,
  DEFAULT_TEST_FILES
} from '../../src/eslint/index.mjs';

type ConfigurationName = 'default' | 'monorepo';
type ProfileSample = { configuration: ConfigurationName; file: string };
type Profile = { name: string; samples: ProfileSample[] };
type NormalizedRule = ['off' | 'warn' | 'error', ...unknown[]];
type RuleVariant = { config: NormalizedRule; profiles: string[] };
type RuleInventory = {
  profiles: Record<string, ProfileSample[]>;
  rules: Record<string, RuleVariant[]>;
};
type OverrideConfig = NonNullable<ConstructorParameters<typeof ESLint>[0]>['overrideConfig'];

const createESLint = (overrideConfig: OverrideConfig): ESLint =>
  new ESLint({ overrideConfigFile: true, overrideConfig });
const defaultESLint = createESLint(config);

const prefixed = (globs: string[]): string[] =>
  ['', 'packages/*/'].flatMap((prefix) => globs.map((glob) => `${prefix}${glob}`));

const monorepoConfig = buildConfiguration({
  ignores: DEFAULT_IGNORES.flatMap((entry) => entry.ignores).map((pattern) => `**/${pattern}`),
  testFiles: prefixed(DEFAULT_TEST_FILES),
  nodeFiles: prefixed(DEFAULT_NODE_FILES)
});
const monorepoESLint = createESLint(monorepoConfig);

const eslintByConfiguration: Record<ConfigurationName, ESLint> = { default: defaultESLint, monorepo: monorepoESLint };
const snapshotPath = new URL('./config-rules.snapshot.json', import.meta.url);

const createProfile = (name: string, defaultFiles: string[], monorepoFiles: string[] = defaultFiles): Profile => ({
  name,
  samples: [
    ...defaultFiles.map(
      (file): ProfileSample => ({
        configuration: 'default',
        file
      })
    ),
    ...monorepoFiles.map(
      (file): ProfileSample => ({
        configuration: 'monorepo',
        file: `packages/example/${file}`
      })
    )
  ]
});

const profiles: Profile[] = [
  createProfile('base-js', ['app/components/foo.js', 'addon/components/foo.js']),
  createProfile('base-ts', ['app/components/foo.ts', 'addon/components/foo.ts', 'tests/test-helper.ts']),
  createProfile(
    'qunit-js',
    ['tests/unit/components/foo-test.js', 'tests/integration/components/foo-test.js'],
    ['tests/integration/components/foo-test.js']
  ),
  createProfile(
    'qunit-ts',
    ['tests/unit/components/foo-test.ts', 'tests/integration/components/foo-test.ts', 'tests/acceptance/foo-test.ts'],
    ['tests/integration/components/foo-test.ts', 'tests/acceptance/foo-test.ts']
  ),
  createProfile(
    'node-js',
    ['ember-cli-build.js', 'tests/dummy/config/environment.js'],
    ['ember-cli-build.js', 'scripts/foo.js', 'tests/dummy/config/environment.js']
  ),
  createProfile('node-cjs', ['scripts/foo.cjs']),
  createProfile('node-mjs', ['eslint.config.mjs', 'prettier.config.mjs'], ['scripts/foo.mjs'])
];

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const sortObject = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortObject);
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort(compare)
        .map((key) => [key, sortObject(record[key])])
    );
  }
  return value;
};

const severityByLevel = new Map<string, NormalizedRule[0]>([
  ['0', 'off'],
  ['1', 'warn'],
  ['2', 'error'],
  ['off', 'off'],
  ['warn', 'warn'],
  ['error', 'error']
]);

const normalizeRule = (entry: unknown, rule: string, file: string): NormalizedRule => {
  const [level, ...options] = Array.isArray(entry) ? entry : [entry];
  const severity = severityByLevel.get(String(level));
  assert.ok(severity, `Unexpected severity for ${rule} in ${file}: ${level}`);
  return [severity, ...options.map(sortObject)];
};

const resolvedRulesFor = async ({ configuration, file }: ProfileSample): Promise<Record<string, NormalizedRule>> => {
  const resolved = await eslintByConfiguration[configuration].calculateConfigForFile(file);
  assert.ok(resolved, `ESLint did not resolve a config for ${file}`);

  const activeRules: [string, NormalizedRule][] = [];
  for (const [rule, entry] of Object.entries(resolved.rules)) {
    const ruleConfig = normalizeRule(entry, rule, file);
    if (ruleConfig[0] !== 'off') activeRules.push([rule, ruleConfig]);
  }

  return Object.fromEntries(activeRules.sort(([left], [right]) => compare(left, right)));
};

const resolvedRuleInventory = async (): Promise<RuleInventory> => {
  const rulesByName = new Map<string, Map<string, RuleVariant>>();
  const profileSamples: Record<string, ProfileSample[]> = {};

  for (const { name, samples } of profiles) {
    const [firstSample, ...remainingSamples] = samples;
    assert.ok(firstSample, `Profile ${name} has no sample files`);
    const profileRules = await resolvedRulesFor(firstSample);

    for (const sample of remainingSamples) {
      assert.deepEqual(
        await resolvedRulesFor(sample),
        profileRules,
        `${name} resolves differently for ${sample.file} than ${firstSample.file}`
      );
    }

    profileSamples[name] = samples;

    for (const [rule, ruleConfig] of Object.entries(profileRules)) {
      let variants = rulesByName.get(rule);
      if (!variants) {
        variants = new Map<string, RuleVariant>();
        rulesByName.set(rule, variants);
      }

      const key = JSON.stringify(ruleConfig);
      assert.ok(key, `Could not serialize config for ${rule}`);

      let variant = variants.get(key);
      if (!variant) {
        variant = { config: ruleConfig, profiles: [] };
        variants.set(key, variant);
      }

      variant.profiles.push(name);
    }
  }

  return {
    profiles: profileSamples,
    rules: Object.fromEntries(
      [...rulesByName]
        .sort(([left], [right]) => compare(left, right))
        .map(([rule, variants]) => [rule, [...variants.values()]])
    )
  };
};

test('resolved active ESLint rules match the profile snapshot', async () => {
  const actual = await resolvedRuleInventory();

  if (process.env.UPDATE_ESLINT_RULES_SNAPSHOT === '1')
    writeFileSync(snapshotPath, `${JSON.stringify(actual, null, 2)}\n`);

  const expected = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  assert.deepEqual(actual, expected);
});
