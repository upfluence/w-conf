#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const checker = path.join(root, 'scripts/check-web-baseline-coverage.mjs');

const cases = [
  {
    name: 'target parses',
    args: ['--check-target-only'],
    expectedStatus: 0,
    expectedOutput: [
      'Web baseline target parsed successfully.',
      'Resolved browser minimums',
      'Chrome',
      'Q1 2024',
      'Safari',
      'Q4 2023',
      'iOS safety floor'
    ]
  },
  {
    name: 'passing traffic passes',
    args: ['--csv', 'tests/web-baseline/fixtures/pass.csv'],
    expectedStatus: 0,
    expectedOutput: 'Result: PASS'
  },
  {
    name: 'unsupported traffic fails',
    args: ['--csv', 'tests/web-baseline/fixtures/fail-unsupported.csv'],
    expectedStatus: 1,
    expectedOutput: 'known session coverage 90.00% is below 95.00%'
  },
  {
    name: 'unknown traffic fails',
    args: ['--csv', 'tests/web-baseline/fixtures/fail-unknown.csv'],
    expectedStatus: 1,
    expectedOutput: 'unknown session traffic 2.00% is above 1.00%'
  },
  {
    name: 'empty traffic fails',
    args: ['--csv', 'tests/web-baseline/fixtures/fail-empty.csv'],
    expectedStatus: 1,
    expectedOutput: 'traffic result contains zero total sessions'
  }
];

for (const testCase of cases) {
  const result = spawnSync(process.execPath, [checker, ...testCase.args], {
    cwd: root,
    encoding: 'utf8'
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, testCase.expectedStatus, `${testCase.name}: unexpected exit status\n${output}`);
  const expectedOutputs = Array.isArray(testCase.expectedOutput) ? testCase.expectedOutput : [testCase.expectedOutput];

  for (const expectedOutput of expectedOutputs) {
    assert.match(
      output,
      new RegExp(escapeRegExp(expectedOutput)),
      `${testCase.name}: missing expected output\n${output}`
    );
  }
}

console.log(`web-baseline tests passed (${cases.length})`);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
