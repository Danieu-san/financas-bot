import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const requiredFiles = [
  'docs/plans/workstreams/financasbot-next-roadmap-draft-v2.md',
  'docs/plans/workstreams/financasbot-next-roadmap-ratification-v1.md',
  'docs/plans/workstreams/financasbot-next-00.md',
  'docs/plans/workstreams/financasbot-next-00-inventory-v1.md',
  'docs/plans/workstreams/financasbot-next-00-contracts-1-4-validation-v1.md',
  'docs/plans/workstreams/financasbot-next-00-contracts-5-8-validation-v1.md',
  'docs/plans/workstreams/financasbot-next-00-golden-set-v1-validation.md',
  'docs/plans/workstreams/financasbot-next-00-final-validation-v1.md',
  'docs/contracts/next/data-authority-contract-v0.md',
  'docs/contracts/next/coexistence-single-writer-contract-v0.md',
  'docs/contracts/next/conversation-proposal-contract-v0.md',
  'docs/contracts/next/model-data-boundary-contract-v0.md',
  'docs/contracts/next/integration-capability-manifest-v0.md',
  'docs/contracts/next/capability-cutover-matrix-v0.md',
  'docs/contracts/next/tool-budget-failure-policy-v0.md',
  'docs/contracts/next/quality-stability-retention-contract-v0.md',
  'tests/fixtures/financasbot-next/golden-financial-fixture-v1.json',
  'tests/fixtures/financasbot-next/golden-conversation-set-v1.json',
  'scripts/agent/validateFinancasBotNextGoldenSet.mjs',
  'scripts/agent/validateFinancasBotNext00.mjs'
];

for (const file of requiredFiles) assert(fs.existsSync(path.join(root, file)), `missing required file: ${file}`);

const normativeFiles = requiredFiles.filter(file => file.endsWith('.md'));
const normativeText = normativeFiles.map(file => read(file)).join('\n');
assert(!/\b(?:TODO|FIXME)\b/.test(normativeText), 'normative artifact contains TODO/FIXME');
assert(!/(?:[:=]\s*|\|\s*)TBD(?:\s*$|\s*\|)/im.test(normativeText), 'normative artifact contains an unresolved TBD value');
assert(!/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(normativeText), 'private key marker found');
assert(!/\bsk-[A-Za-z0-9_-]{8,}\b/.test(normativeText), 'API key marker found');

const charter = read('docs/plans/workstreams/financasbot-next-00.md');
assert(charter.includes('ZERO IMPLEMENTAÇÃO FUNCIONAL'), 'charter lost zero-runtime boundary');
assert(charter.includes('NEXT00-05'), 'charter does not identify NEXT00-05');
assert(charter.includes('67 casos documentais') || charter.includes('67 testes documentais'),
  'charter lost 67-test traceability requirement/result');

const inventory = read('docs/plans/workstreams/financasbot-next-00-inventory-v1.md');
const inventoryCaps = inventory.match(/^\| CAP-\d{2} \|/gm) ?? [];
const inventoryAssets = inventory.match(/^\| AST-\d{2} \|/gm) ?? [];
const inventoryDoNotPort = inventory.match(/^\| DNP-\d{2} \|/gm) ?? [];
assert(inventoryCaps.length === 30, `inventory capabilities: expected 30, found ${inventoryCaps.length}`);
assert(inventoryAssets.length === 15, `inventory assets: expected 15, found ${inventoryAssets.length}`);
assert(inventoryDoNotPort.length === 12, `DO_NOT_PORT entries: expected 12, found ${inventoryDoNotPort.length}`);

const manifest = read('docs/contracts/next/integration-capability-manifest-v0.md');
const manifestSections = manifest.match(/^### INT-\d{2} — /gm) ?? [];
const manifestRecords = manifest.slice(manifest.indexOf('### INT-01'));
const enabledWrites = manifestRecords.match(/^  write_enabled: \[\]$/gm) ?? [];
assert(manifestSections.length === 9, `integration manifests: expected 9, found ${manifestSections.length}`);
assert(enabledWrites.length === 9, `empty write_enabled: expected 9, found ${enabledWrites.length}`);
assert(!/^  write_enabled: \[(?!\])/m.test(manifestRecords), 'a manifest enables write during NEXT-00');

const matrix = read('docs/contracts/next/capability-cutover-matrix-v0.md');
const matrixRows = [...matrix.matchAll(/^\| (CAP-(\d{2})(?:[AB])?) \|[^\n]*?\| ([1-4]) \|/gm)];
const sourceCaps = new Set(matrixRows.map(match => `CAP-${match[2]}`));
const tierCounts = matrixRows.reduce((out, match) => {
  out[match[3]] = (out[match[3]] ?? 0) + 1;
  return out;
}, {});
assert(matrixRows.length === 32, `capability slices: expected 32, found ${matrixRows.length}`);
assert(sourceCaps.size === 30, `source capability ids: expected 30, found ${sourceCaps.size}`);
assert(tierCounts['1'] === 13 && tierCounts['2'] === 11 && tierCounts['3'] === 6 && tierCounts['4'] === 2,
  `tier counts differ: ${JSON.stringify(tierCounts)}`);

const testSources = [
  'docs/plans/workstreams/financasbot-next-00-contracts-1-4-validation-v1.md',
  'docs/contracts/next/integration-capability-manifest-v0.md',
  'docs/contracts/next/capability-cutover-matrix-v0.md',
  'docs/contracts/next/tool-budget-failure-policy-v0.md',
  'docs/contracts/next/quality-stability-retention-contract-v0.md'
];
const testIds = new Set(testSources.flatMap(file => read(file).match(/\b(?:DA|SW|CP|MB|IM|CM|TB|QS)-\d{2}\b/g) ?? []));
assert(testIds.size === 67, `documented contract tests: expected 67, found ${testIds.size}`);

const numericMarkers = [
  ['docs/contracts/next/tool-budget-failure-policy-v0.md', ['6', '12', '30']],
  ['docs/contracts/next/quality-stability-retention-contract-v0.md', ['7', '14', '200', '500', '1.000', '0.05', '35']]
];
for (const [file, markers] of numericMarkers) {
  const contents = read(file);
  for (const marker of markers) assert(contents.includes(marker), `${file}: missing numeric marker ${marker}`);
}

const base = 'fc577e5d5e21fdc5402ace1cf662a6ea1bef255f';
const gitLines = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  .split(/\r?\n/).filter(Boolean);
const changedPaths = [...new Set([
  ...gitLines(['diff', '--name-only', `${base}..HEAD`]),
  ...gitLines(['diff', '--name-only']),
  ...gitLines(['diff', '--cached', '--name-only']),
  ...gitLines(['ls-files', '--others', '--exclude-standard'])
])].sort();
const allowedPath = file =>
  file.startsWith('docs/contracts/next/') ||
  file.startsWith('docs/plans/workstreams/financasbot-next') ||
  file === 'docs/agent-memory/workstreams/financasbot-next-00.md' ||
  file === 'docs/agent-memory/workstreams/financasbot-next-roadmap.md' ||
  file === 'docs/agent-memory/workstreams/index.md' ||
  file === 'scripts/agent/validateFinancasBotNextGoldenSet.mjs' ||
  file === 'scripts/agent/validateFinancasBotNext00.mjs' ||
  file.startsWith('tests/fixtures/financasbot-next/');
for (const file of changedPaths) assert(allowedPath(file), `out-of-scope changed path: ${file}`);
assert(changedPaths.every(file => !file.startsWith('src/')), 'runtime source changed during NEXT-00');

const golden = spawnSync(process.execPath, ['scripts/agent/validateFinancasBotNextGoldenSet.mjs'], {
  cwd: root, encoding: 'utf8'
});
assert(golden.status === 0, `Golden Set validator failed: ${golden.stderr || golden.stdout}`);

if (failures.length > 0) {
  console.error(`NEXT-00 DOCUMENTAL: FAIL (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('NEXT-00 DOCUMENTAL: PASS');
console.log(`required_files=${requiredFiles.length}`);
console.log(`inventory=30 capabilities,15 assets,12 do_not_port`);
console.log(`manifests=${manifestSections.length},write_enabled_nonempty=0`);
console.log(`capability_slices=${matrixRows.length},source_capabilities=${sourceCaps.size},tiers=${JSON.stringify(tierCounts)}`);
console.log(`contract_tests=${testIds.size}/67`);
console.log(`changed_paths=${changedPaths.length},runtime_paths=0`);
console.log(golden.stdout.trim());
