#!/usr/bin/env node
// Dry-run ESLint statistics for one or more repos (never writes source files).
//
//   node scripts/eslint-wave-stats.mjs --out stats.json <repo-dir>...
//
// Each repo dir must already be installed with `@upfluence/w-conf` pointing at
// the config under test. Every folder holding an `eslint.config.*` is a target.
// ESLint runs twice per target with the repo's own binary:
//   1. `--format json`              -> total issues (+ which are auto-fixable)
//   2. `--fix-dry-run --format json` -> issues left after auto-fix
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { codeQuality } from '../src/eslint/index.mjs';

export const WAVE_2_RULES = new Set([
  ...Object.keys(codeQuality[0].rules),
  '@typescript-eslint/array-type',
  '@typescript-eslint/consistent-type-assertions'
]);

const findTargets = (repo) =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: repo, encoding: 'utf8' })
    .split('\n')
    .filter((file) => /(^|\/)eslint\.config\.[cm]?js$/.test(file))
    .map((file) => dirname(file))
    .sort();

const runEslint = (cwd, extraArgs) => {
  const bin = ['node_modules/.bin/eslint', '../../node_modules/.bin/eslint'].map((p) => join(cwd, p)).find(existsSync);
  if (!bin) return { problem: 'eslint binary not found' };
  const { stdout, stderr, status } = spawnSync(bin, ['.', '--format', 'json', ...extraArgs], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 ** 3
  });
  if (status === 2 || !stdout.trim().startsWith('['))
    return { problem: (stderr || stdout).trim().split('\n').slice(0, 5).join('\n') };
  return { results: JSON.parse(stdout) };
};

// Count messages per rule. `null` ruleId = parse error / unused directive.
const countByRule = (results, repo) => {
  const rules = new Map();
  for (const { filePath, messages } of results)
    for (const message of messages) {
      const rule = message.ruleId ?? '(parse-or-directive)';
      const entry = rules.get(rule) ?? { count: 0, fixable: 0, files: new Set(), first: null };
      entry.count++;
      if (message.fix) entry.fixable++;
      entry.files.add(filePath);
      entry.first ??= { file: relative(repo, filePath), line: message.line };
      rules.set(rule, entry);
    }
  return rules;
};

const statsForTarget = (repo, target) => {
  const cwd = join(repo, target);
  const before = runEslint(cwd, []);
  if (before.problem) return { path: target, problem: before.problem };
  const after = runEslint(cwd, ['--fix-dry-run']);
  if (after.problem) return { path: target, problem: after.problem };

  const total = countByRule(before.results, repo);
  const left = countByRule(after.results, repo);
  const rules = [...total].map(([rule, { count, fixable, files, first }]) => ({
    rule,
    wave2: WAVE_2_RULES.has(rule),
    count,
    fixable,
    leftAfterFix: left.get(rule)?.count ?? 0,
    files: files.size,
    first
  }));
  // A fix can surface new reports (e.g. curly after no-else-return): keep them visible.
  for (const [rule, { count, files, first }] of left)
    if (!total.has(rule))
      rules.push({
        rule,
        wave2: WAVE_2_RULES.has(rule),
        count: 0,
        fixable: 0,
        leftAfterFix: count,
        files: files.size,
        first
      });

  const changedFiles = after.results.filter((result) => result.output !== undefined).length;
  return {
    path: target,
    filesLinted: before.results.length,
    changedFiles,
    rules: rules.sort((a, b) => b.count - a.count)
  };
};

const summarize = (targets, filter) => {
  const rules = targets.flatMap((target) => target.rules ?? []).filter(filter);
  const sum = (key) => rules.reduce((total, rule) => total + rule[key], 0);
  return { issues: sum('count'), fixable: sum('fixable'), leftAfterFix: sum('leftAfterFix') };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' } } });
  if (!values.out || positionals.length === 0) {
    console.error('usage: eslint-wave-stats.mjs --out stats.json <repo-dir>...');
    process.exit(1);
  }
  const out = resolve(values.out);
  const data = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { repos: {} };

  for (const repoDir of positionals) {
    const repo = resolve(repoDir);
    const name = basename(repo);
    const startedAt = Date.now();
    const targets = findTargets(repo);
    const results = targets.length
      ? targets.map((target) => statsForTarget(repo, target))
      : [{ path: '.', problem: 'no eslint.config.* found' }];
    data.repos[name] = {
      targets: results,
      wave2: summarize(results, (rule) => rule.wave2),
      preExisting: summarize(results, (rule) => !rule.wave2),
      seconds: Math.round((Date.now() - startedAt) / 1000)
    };
    writeFileSync(out, JSON.stringify({ ...data, generatedAt: new Date().toISOString() }, null, 2));
    const { issues, fixable, leftAfterFix } = data.repos[name].wave2;
    const problems = results.filter((target) => target.problem).map((target) => `${target.path}: ${target.problem}`);
    console.log(
      `${name}: ${issues} wave-2 issues, ${fixable} fixable, ${leftAfterFix} left${problems.length ? ` | PROBLEM ${problems.join(' ; ')}` : ''}`
    );
  }
}
