#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { getCompatibleVersions } from 'baseline-browser-mapping';
import browserslist from 'browserslist';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const policyPath = path.join(root, 'src/browsers/web-baseline-policy.json');
const analyticsScope = 'https://www.googleapis.com/auth/analytics.readonly';
const baselineBrowserAliases = {
  chrome: 'chrome',
  chrome_android: 'and_chr',
  edge: 'edge',
  firefox: 'firefox',
  firefox_android: 'and_ff',
  opera: 'opera',
  opera_android: 'op_mob',
  safari: 'safari',
  safari_ios: 'ios_saf',
  samsunginternet_android: 'samsung',
  webview_android: 'android'
};

const browserAliases = {
  'android webview': 'android',
  chrome: 'chrome',
  edge: 'edge',
  firefox: 'firefox',
  opera: 'opera',
  safari: 'safari',
  'safari (in-app)': 'safari',
  'samsung internet': 'samsung'
};

main().catch((error) => {
  console.error(`\nWeb baseline check failed: ${error.message}`);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const policy = await readJson(policyPath);
  const targetQueries = await readTargetQueries(policy);
  const supportedTargets = resolveSupportedTargets(targetQueries);

  if (args.help) {
    printHelp();
    return;
  }

  if (args['check-target-only']) {
    printTargetSummary(targetQueries, supportedTargets);
    return;
  }

  const source = await loadTrafficRows(args, policy);
  const result = analyzeTraffic(source.rows, supportedTargets, policy);

  printReport({
    dateRange: source.dateRange,
    policy,
    result,
    targetQueries
  });

  const knownCoverage = result.covered.sessions / result.known.sessions;
  const unknownRate = result.unknown.sessions / result.total.sessions;
  const failures = [];

  if (knownCoverage < policy.minimumSessionCoverage) {
    failures.push(
      `known session coverage ${formatPercent(knownCoverage)} is below ${formatPercent(policy.minimumSessionCoverage)}`
    );
  }

  if (unknownRate > policy.maximumUnknownTraffic) {
    failures.push(
      `unknown session traffic ${formatPercent(unknownRate)} is above ${formatPercent(policy.maximumUnknownTraffic)}`
    );
  }

  if (failures.length > 0) {
    console.log('\nResult: FAIL');
    failures.forEach((failure) => console.log(`- ${failure}`));
    process.exit(1);
  }

  console.log('\nResult: PASS');
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--csv') {
      const next = argv[index + 1];
      if (next && !next.startsWith('--')) {
        args.csv = next;
        index += 1;
      } else {
        args.csv = process.env.WEB_BASELINE_CSV_PATH || true;
      }
    } else if (arg === '--check-target-only') {
      args['check-target-only'] = true;
    } else if (arg === '--start-date') {
      args.startDate = argv[index + 1];
      index += 1;
    } else if (arg === '--end-date') {
      args.endDate = argv[index + 1];
      index += 1;
    } else if (!args.csv && !arg.startsWith('--')) {
      args.csv = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  pnpm web-baseline:check
  pnpm web-baseline:check:csv <path>
  node scripts/check-web-baseline-coverage.mjs --check-target-only

Environment:
  GA_PROPERTY_ID
  GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64
  WEB_BASELINE_CSV_PATH
`);
}

async function loadTrafficRows(args, policy) {
  if (args.csv && args.csv !== true) {
    return parseCsvExport(await readFile(path.resolve(args.csv), 'utf8'));
  }

  if (args.csv === true) {
    throw new Error('CSV mode needs a path argument or WEB_BASELINE_CSV_PATH.');
  }

  return fetchAnalyticsRows(args, policy);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readTargetQueries(policy) {
  const targetPath = path.resolve(path.dirname(policyPath), policy.target);
  return readJson(targetPath);
}

function resolveSupportedTargets(targetQueries) {
  const targets = browserslist(targetQueries);
  const minimums = new Map();

  for (const target of getCompatibleVersions({ includeDownstreamBrowsers: true })) {
    const browser = baselineBrowserAliases[target.browser];
    const candidate = parseVersion(target.version);

    if (!browser || !candidate) {
      continue;
    }

    mergeMinimum(minimums, browser, candidate);
  }

  for (const query of targetQueries.filter((targetQuery) => !targetQuery.startsWith('baseline '))) {
    for (const target of browserslist(query)) {
      const [browser, version] = target.split(' ');
      const candidate = parseVersion(version);

      if (!candidate) {
        continue;
      }

      mergeMinimum(minimums, browser, candidate);
    }
  }

  return { minimums, targets };
}

function mergeMinimum(minimums, browser, candidate) {
  const current = minimums.get(browser);

  if (!current || compareVersions(candidate, current) < 0) {
    minimums.set(browser, candidate);
  }
}

function printTargetSummary(targetQueries, supportedTargets) {
  console.log('Web baseline target parsed successfully.');
  console.log(`Queries: ${targetQueries.join(', ')}`);
  console.log('Resolved practical minimums:');

  [...supportedTargets.minimums.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([browser, version]) => {
      console.log(`- ${browser} >= ${formatVersion(version)}`);
    });
}

async function fetchAnalyticsRows(args, policy) {
  const propertyId = process.env.GA_PROPERTY_ID;
  const credentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64;

  if (!propertyId) {
    throw new Error('GA_PROPERTY_ID is required for GA4 mode.');
  }

  if (!credentialsBase64) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64 is required for GA4 mode.');
  }

  const credentials = JSON.parse(Buffer.from(credentialsBase64, 'base64').toString('utf8'));
  const client = new BetaAnalyticsDataClient({
    credentials,
    scopes: [analyticsScope]
  });
  const endDate = args.endDate || 'yesterday';
  const startDate = args.startDate || `${policy.windowDays}daysAgo`;
  const request = {
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: 'browser' },
      { name: 'browserVersion' },
      { name: 'deviceCategory' },
      { name: 'operatingSystem' },
      { name: 'operatingSystemVersion' }
    ],
    metrics: [{ name: policy.primaryMetric }, { name: policy.secondaryMetric }],
    limit: 250000
  };
  const [response] = await client.runReport(request);

  return {
    dateRange: `${startDate} to ${endDate}`,
    rows: (response.rows || []).map((row) => ({
      browser: row.dimensionValues[0]?.value || '',
      browserVersion: row.dimensionValues[1]?.value || '',
      deviceCategory: row.dimensionValues[2]?.value || '',
      operatingSystem: row.dimensionValues[3]?.value || '',
      osVersion: row.dimensionValues[4]?.value || '',
      views: Number(row.metricValues[1]?.value || 0),
      sessions: Number(row.metricValues[0]?.value || 0)
    }))
  };
}

function parseCsvExport(input) {
  const lines = input.split(/\r?\n/).filter(Boolean);
  const dateRange = lines.find((line) => /^#\s*\d{8}-\d{8}/.test(line))?.replace(/^#\s*/, '') || 'CSV export';
  const headerIndex = lines.findIndex((line) => line.startsWith('Browser,Browser version,'));

  if (headerIndex === -1) {
    throw new Error('CSV header not found.');
  }

  const headers = parseCsvLine(lines[headerIndex]);
  const rows = [];

  for (const line of lines.slice(headerIndex + 1)) {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));

    if (values.includes('Grand total')) {
      continue;
    }

    rows.push({
      browser: record.Browser,
      browserVersion: record['Browser version'],
      deviceCategory: record['Device category'],
      operatingSystem: record['Operating system'],
      osVersion: record['OS version'],
      views: parseMetric(record.Views),
      sessions: parseMetric(record.Sessions)
    });
  }

  return { dateRange, rows };
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

function parseMetric(value) {
  return Number(String(value || '0').replace(/,/g, ''));
}

function analyzeTraffic(rows, supportedTargets, policy) {
  const result = {
    total: emptyMetrics(),
    known: emptyMetrics(),
    covered: emptyMetrics(),
    unsupported: emptyMetrics(),
    unknown: emptyMetrics(),
    devices: new Map(),
    unsupportedRows: []
  };

  for (const row of rows) {
    const metrics = { sessions: row.sessions, views: row.views };
    addMetrics(result.total, metrics);

    const classification = classifyRow(row, supportedTargets.minimums);
    const device = normalize(row.deviceCategory) || 'unknown';
    const deviceResult = result.devices.get(device) || {
      total: emptyMetrics(),
      covered: emptyMetrics(),
      unsupported: emptyMetrics(),
      unknown: emptyMetrics()
    };

    result.devices.set(device, deviceResult);
    addMetrics(deviceResult.total, metrics);

    if (classification.status === 'covered') {
      addMetrics(result.known, metrics);
      addMetrics(result.covered, metrics);
      addMetrics(deviceResult.covered, metrics);
    } else if (classification.status === 'unsupported') {
      addMetrics(result.known, metrics);
      addMetrics(result.unsupported, metrics);
      addMetrics(deviceResult.unsupported, metrics);
      result.unsupportedRows.push({ ...row, reason: classification.reason });
    } else {
      addMetrics(result.unknown, metrics);
      addMetrics(deviceResult.unknown, metrics);
    }
  }

  result.unsupportedRows.sort((left, right) => right.sessions - left.sessions);
  return result;
}

function classifyRow(row, minimums) {
  const browser = normalize(row.browser);
  const operatingSystem = normalize(row.operatingSystem);

  if (!browser || browser === '(not set)' || browser === 'mozilla compatible agent') {
    return { status: 'unknown', reason: 'unmapped browser' };
  }

  const targetBrowser = resolveTargetBrowser(row, browser, operatingSystem);
  const minimum = minimums.get(targetBrowser);

  if (!targetBrowser || !minimum) {
    return { status: 'unknown', reason: `no target mapping for ${row.browser}` };
  }

  const version = targetBrowser === 'ios_saf' ? parseVersion(row.osVersion) : parseVersion(row.browserVersion);

  if (!version) {
    return { status: 'unknown', reason: 'missing version' };
  }

  if (compareVersions(version, minimum) >= 0) {
    return { status: 'covered' };
  }

  return {
    status: 'unsupported',
    reason: `${targetBrowser} ${formatVersion(version)} < ${formatVersion(minimum)}`
  };
}

function resolveTargetBrowser(row, browser, operatingSystem) {
  if (isIos(row, operatingSystem)) {
    return 'ios_saf';
  }

  if (browser === 'chrome' && normalize(row.deviceCategory) === 'mobile') {
    return 'and_chr';
  }

  if (browser === 'firefox' && normalize(row.deviceCategory) === 'mobile') {
    return 'and_ff';
  }

  return browserAliases[browser];
}

function isIos(row, operatingSystem) {
  return (
    operatingSystem === 'ios' ||
    operatingSystem === 'ipados' ||
    normalize(row.osVersion).startsWith('ios ') ||
    normalize(row.osVersion).startsWith('ipados ')
  );
}

function parseVersion(value) {
  const match = String(value || '').match(/\d+(?:\.\d+)*/);

  if (!match) {
    return null;
  }

  return match[0].split('.').map((part) => Number(part));
}

function compareVersions(left, right) {
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] || 0;
    const rightPart = right[index] || 0;

    if (leftPart !== rightPart) {
      return leftPart - rightPart;
    }
  }

  return 0;
}

function emptyMetrics() {
  return { sessions: 0, views: 0 };
}

function addMetrics(target, source) {
  target.sessions += source.sessions;
  target.views += source.views;
}

function printReport({ dateRange, policy, result, targetQueries }) {
  const knownCoverage = result.covered.sessions / result.known.sessions;
  const totalCoverage = result.covered.sessions / result.total.sessions;
  const unknownRate = result.unknown.sessions / result.total.sessions;

  console.log('Web baseline coverage check');
  console.log(`Date range: ${dateRange}`);
  console.log(`Target: ${targetQueries.join(', ')}`);
  console.log(`Minimum known-session coverage: ${formatPercent(policy.minimumSessionCoverage)}`);
  console.log(`Maximum unknown-session traffic: ${formatPercent(policy.maximumUnknownTraffic)}`);
  console.log('');
  console.log('Sessions');
  console.log(`- total: ${formatNumber(result.total.sessions)}`);
  console.log(`- covered: ${formatNumber(result.covered.sessions)} (${formatPercent(totalCoverage)} including unknown, ${formatPercent(knownCoverage)} excluding unknown)`);
  console.log(`- unsupported: ${formatNumber(result.unsupported.sessions)}`);
  console.log(`- unknown: ${formatNumber(result.unknown.sessions)} (${formatPercent(unknownRate)})`);
  console.log('');
  console.log('Views');
  console.log(`- total: ${formatNumber(result.total.views)}`);
  console.log(`- covered: ${formatNumber(result.covered.views)}`);
  console.log(`- unsupported: ${formatNumber(result.unsupported.views)}`);
  console.log(`- unknown: ${formatNumber(result.unknown.views)}`);

  if (policy.deviceBreakdown) {
    console.log('');
    console.log('Device split');
    [...result.devices.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([device, metrics]) => {
        const covered = metrics.covered.sessions / metrics.total.sessions;
        console.log(
          `- ${device}: ${formatNumber(metrics.covered.sessions)} / ${formatNumber(metrics.total.sessions)} sessions covered (${formatPercent(covered)})`
        );
      });
  }

  if (result.unsupportedRows.length > 0) {
    console.log('');
    console.log('Top unsupported traffic');
    result.unsupportedRows.slice(0, 10).forEach((row) => {
      console.log(
        `- ${formatNumber(row.sessions)} sessions, ${formatNumber(row.views)} views: ${row.browser} ${row.browserVersion}, ${row.deviceCategory}, ${row.operatingSystem} ${row.osVersion} (${row.reason})`
      );
    });
  }
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return '0.00%';
  }

  return `${(value * 100).toFixed(2)}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatVersion(version) {
  return version.join('.');
}
