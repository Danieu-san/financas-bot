import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { frozenContractHashes, validateFrozenContractHashes } from './validateFinancasBotNextContractHashes.mjs';

const root = process.cwd();
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const requiredFiles = [
  'docs/plans/workstreams/financasbot-next-roadmap-draft-v2.md',
  'docs/plans/workstreams/financasbot-next-roadmap-review-resolution-v1.md',
  'docs/plans/workstreams/financasbot-next-roadmap-ratification-v1.md',
  'docs/plans/workstreams/financasbot-next-00.md',
  'docs/agent-memory/workstreams/financasbot-next-00.md',
  'docs/plans/workstreams/financasbot-next-00-inventory-v1.md',
  'docs/plans/workstreams/financasbot-next-00-contracts-1-4-validation-v1.md',
  'docs/plans/workstreams/financasbot-next-00-contracts-5-8-validation-v1.md',
  'docs/plans/workstreams/financasbot-next-00-golden-set-v1-validation.md',
  'docs/plans/workstreams/financasbot-next-00-final-validation-v1.md',
  'docs/plans/workstreams/financasbot-next-00-audit-resolution-v1.md',
  'docs/plans/workstreams/financasbot-next-00-reaudit-resolution-v2.md',
  'docs/plans/workstreams/financasbot-next-00-reaudit-resolution-v3.md',
  'docs/plans/workstreams/financasbot-next-00-reaudit-resolution-v4.md',
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
  'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json',
  'tests/fixtures/financasbot-next/golden-fact-contracts-v1.json',
  'scripts/agent/validateFinancasBotNextGoldenSet.mjs',
  'scripts/agent/validateFinancasBotNextFacts.mjs',
  'scripts/agent/validateFinancasBotNextContractHashes.mjs',
  'scripts/agent/testValidateFinancasBotNextGoldenSet.mjs',
  'scripts/agent/testFinancasBotNextFactContracts.mjs',
  'scripts/agent/validateFinancasBotNext00.mjs',
  'scripts/agent/validateAgentWorkflow.js'
];
for (const file of requiredFiles) assert(fs.existsSync(path.join(root, file)), `missing required file: ${file}`);

const normativeFiles = requiredFiles.filter(file => file.endsWith('.md'));
const normativeText = normativeFiles.map(file => read(file)).join('\n');
assert(!/\b(?:TODO|FIXME)\b/.test(normativeText), 'normative artifact contains TODO/FIXME');
assert(!/(?:[:=]\s*|\|\s*)TBD(?:\s*$|\s*\|)/im.test(normativeText), 'normative artifact contains unresolved TBD');
assert(!/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(normativeText), 'private key marker found');
assert(!/\b(?:sk|AIza|ghp|github_pat)[-_][A-Za-z0-9_-]{8,}\b/i.test(normativeText), 'API key marker found');

const charter = read('docs/plans/workstreams/financasbot-next-00.md');
assert(charter.includes('ZERO IMPLEMENTAÇÃO FUNCIONAL'), 'charter lost zero-runtime boundary');
assert(charter.includes('NEXT00-05'), 'charter does not identify NEXT00-05');
assert(charter.includes('67 casos documentais') || charter.includes('67 testes documentais'),
  'charter lost 67-test traceability requirement/result');
const factValidatorSource = read('scripts/agent/validateFinancasBotNextFacts.mjs');
assert(!/switch\s*\(\s*fact\.metric\s*\)/.test(factValidatorSource),
  'fact validator regressed to imperative branching by metric');
assert(!/function\s+validateDimensions\b/.test(factValidatorSource),
  'fact validator regressed to ad-hoc validateDimensions');

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

const primaryContracts = [
  'docs/contracts/next/data-authority-contract-v0.md',
  'docs/contracts/next/coexistence-single-writer-contract-v0.md',
  'docs/contracts/next/conversation-proposal-contract-v0.md',
  'docs/contracts/next/model-data-boundary-contract-v0.md',
  'docs/contracts/next/integration-capability-manifest-v0.md',
  'docs/contracts/next/capability-cutover-matrix-v0.md',
  'docs/contracts/next/tool-budget-failure-policy-v0.md',
  'docs/contracts/next/quality-stability-retention-contract-v0.md'
];
const testIds = new Set(primaryContracts.flatMap(file =>
  read(file).match(/\b(?:DA|SW|CP|MB|IM|CM|TB|QS)-\d{2}\b/g) ?? []
));
const prefixCounts = Object.fromEntries(['DA','SW','CP','MB','IM','CM','TB','QS'].map(prefix => [
  prefix, [...testIds].filter(id => id.startsWith(`${prefix}-`)).length
]));
assert(testIds.size === 67, `primary contract tests: expected 67, found ${testIds.size}`);
assert(JSON.stringify(prefixCounts) === JSON.stringify({DA:6,SW:5,CP:5,MB:5,IM:12,CM:8,TB:12,QS:14}),
  `contract id distribution differs: ${JSON.stringify(prefixCounts)}`);

const toolBudget = read('docs/contracts/next/tool-budget-failure-policy-v0.md');
const toolBudgetFields = {
  soft_tool_calls: 6,
  hard_tool_calls: 12,
  max_same_tool_args_fingerprint: 2,
  max_parallel_read_calls: 3,
  max_sequential_decision_rounds: 4,
  max_clarification_questions_per_turn: 2,
  max_response_recompositions: 1,
  total_trajectory_timeout_seconds: 30,
  writer_commit_attempts_after_confirmation: 1,
};
for (const [field, value] of Object.entries(toolBudgetFields)) {
  assert(new RegExp(`^${field}: ${value}$`, 'm').test(toolBudget), `${field}: expected ${value}`);
}

const frozenHashFailures = validateFrozenContractHashes(root);
for (const failure of frozenHashFailures) failures.push(failure);
assert(Object.keys(frozenContractHashes).length === 3, 'expected exactly three frozen contracts');

const quality = read('docs/contracts/next/quality-stability-retention-contract-v0.md');
const qualityAssertions = [
  [/^\| pergunta simples read-only \| <=4 s \| <=10 s \| 30 s \|$/m, 'simple latency'],
  [/^\| investigação multi-tool \| <=8 s \| <=20 s \| 30 s \|$/m, 'multi-tool latency'],
  [/^\| follow-up com cache\/evidência vigente \| <=3 s \| <=8 s \| 20 s \|$/m, 'follow-up latency'],
  [/^\| dashboard snapshot \| <=1\.5 s \| <=3 s \| 5 s \|$/m, 'dashboard latency'],
  [/^\| teto por conversa \| <=US\$0\.05 \|$/m, 'cost ceiling'],
  [/- 7 dias consecutivos na mesma versão causal;/, 'beta 7 days'],
  [/- mínimo de 200 conversas e 500 claims comparáveis;/, 'beta volume'],
  [/- 14 dias consecutivos do conjunto de capabilities classes 1 e 2;/, 'cutover 14 days'],
  [/- mínimo de 500 conversas, 1\.000 claims e 100 efeitos agregados;/, 'cutover volume'],
  [/^\| ledger\/eventos\/propostas\/write ledger \| <=5 min \| <=60 min \|$/m, 'ledger RPO/RTO'],
  [/- retenção rolling de backups: 35 dias;/, 'backup retention'],
  [/^\| traces operacionais sanitizados \| 30 dias \|$/m, 'trace retention'],
  [/^\| auditoria de segurança\/ownership sanitizada \| 180 dias \|$/m, 'audit retention'],
];
for (const [pattern, label] of qualityAssertions) assert(pattern.test(quality), `quality contract missing exact ${label}`);

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
  file === 'AGENTS.md' ||
  file === '.agents/skills/execute-financasbot-gate/SKILL.md' ||
  file.startsWith('docs/contracts/next/') ||
  file.startsWith('docs/plans/workstreams/financasbot-next') ||
  file === 'docs/agent-memory/workstreams/financasbot-next-00.md' ||
  file === 'docs/agent-memory/workstreams/financasbot-next-roadmap.md' ||
  file === 'docs/agent-memory/workstreams/index.md' ||
  file === 'scripts/agent/validateFinancasBotNextGoldenSet.mjs' ||
  file === 'scripts/agent/validateFinancasBotNextFacts.mjs' ||
  file === 'scripts/agent/validateFinancasBotNextContractHashes.mjs' ||
  file === 'scripts/agent/testValidateFinancasBotNextGoldenSet.mjs' ||
  file === 'scripts/agent/testFinancasBotNextFactContracts.mjs' ||
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
console.log('inventory=30 capabilities,15 assets,12 do_not_port');
console.log(`manifests=${manifestSections.length},write_enabled_nonempty=0`);
console.log(`capability_slices=${matrixRows.length},source_capabilities=${sourceCaps.size},tiers=${JSON.stringify(tierCounts)}`);
console.log(`contract_tests=${testIds.size}/67,source=primary_contracts`);
console.log(`frozen_contract_hashes=${Object.keys(frozenContractHashes).length}/3`);
console.log(`changed_paths=${changedPaths.length},runtime_paths=0`);
console.log(golden.stdout.trim());
