import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'next00-golden-structural-'));
const files = [
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
];

function restore() {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(temp, { recursive: true });
  for (const file of files) {
    const destination = path.join(temp, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
}

function mutateJson(file, change) {
  const target = path.join(temp, file);
  const value = JSON.parse(fs.readFileSync(target, 'utf8'));
  change(value);
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const runGolden = () => spawnSync(process.execPath, ['scripts/agent/validateFinancasBotNextGoldenSet.mjs'], { cwd: temp, encoding: 'utf8' });
const runHashes = () => spawnSync(process.execPath, ['scripts/agent/validateFinancasBotNextContractHashes.mjs'], { cwd: temp, encoding: 'utf8' });
const EXPECTED_STRUCTURAL_MUTATIONS = 11;
let redCount = 0;

function expectRed(name, expectedFragment, mutation, run = runGolden) {
  restore();
  mutation();
  const result = run();
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0 || !output.includes(expectedFragment)) {
    throw new Error(`${name}: expected RED containing ${expectedFragment}; got status=${result.status}\n${output}`);
  }
  redCount += 1;
  console.log(`structural_mutation=${name}: RED`);
}

restore();
const baselineGolden = runGolden();
if (baselineGolden.status !== 0) throw new Error(`golden baseline failed:\n${baselineGolden.stdout}\n${baselineGolden.stderr}`);
const baselineHashes = runHashes();
if (baselineHashes.status !== 0) throw new Error(`hash baseline failed:\n${baselineHashes.stdout}\n${baselineHashes.stderr}`);
console.log('structural_baseline: PASS');

expectRed('missing_materialized_fact', 'M-15#1: fact contract cardinality mismatch', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => { value.turns['M-15#1'].facts.pop(); });
});
expectRed('executable_marked_as_corpus', 'TB-01: expected causal mode deferred_executable', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-conversation-set-v1.json', value => {
    value.contract_traceability.find(item => item.ids.includes('TB-01')).mode = 'corpus_evidence';
  });
});
expectRed('critical_dimension_self_reduced', 'critical_dimensions must equal the independent 14-dimension contract', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-conversation-set-v1.json', value => {
    value.critical_dimensions = value.critical_dimensions.filter(item => item !== 'refund');
    for (const item of value.cases) item.dimensions = item.dimensions.filter(dimension => dimension !== 'refund');
  });
});
expectRed('class_counts_self_changed', 'required_class_counts must equal the independent 16/16/8/8 contract', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-conversation-set-v1.json', value => {
    value.required_class_counts.simple = 15;
    value.required_class_counts.multi_tool = 17;
  });
});
expectRed('private_email_in_fixture', 'private/production marker found', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-financial-fixture-v1.json', value => { value.notice = 'contato real@example.com'; });
});
expectRed('legacy_event_state', 'fixture event state outside canonical vocabulary', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-financial-fixture-v1.json', value => { value.events[0].state = 'realized'; });
});
expectRed('uncovered_numeric_threshold_changed', 'frozen SHA-256 mismatch', () => {
  const file = path.join(temp, 'docs/contracts/next/quality-stability-retention-contract-v0.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('lease TTL: 60 segundos', 'lease TTL: 61 segundos'), 'utf8');
}, runHashes);
expectRed('reviewed_fact_contract_changed', 'golden-fact-contracts-v1.json: frozen SHA-256 mismatch', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-fact-contracts-v1.json', value => {
    value.turns['M-08#1'][1].entity = 'budget-snack:person-c';
  });
}, runHashes);
expectRed('coverage_not_closed_world', 'financial fixture must explicitly declare a synthetic closed world', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-financial-fixture-v1.json', value => { value.closed_world = false; });
});
expectRed('calendar_zero_is_not_constant', 'M-15#1/calendar_event_count: factual oracle diverges', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-financial-fixture-v1.json', value => {
    value.calendar_events.push({ id: 'calendar-synthetic-1', person_id: 'person-b', scheduled_at: '2042-06-20', evidence_state: 'confirmed' });
  });
});
expectRed('source_budget_state_disagrees', 'source budget-snack does not substantiate evidence_state confirmed', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-financial-fixture-v1.json', value => {
    value.budgets.find(item => item.id === 'budget-snack').evidence_state = 'committed';
  });
});

fs.rmSync(temp, { recursive: true, force: true });
if (redCount !== EXPECTED_STRUCTURAL_MUTATIONS) {
  throw new Error(`expected ${EXPECTED_STRUCTURAL_MUTATIONS} structural mutations, executed ${redCount}`);
}
console.log(`NEXT00 STRUCTURAL MUTATIONS: PASS (${redCount}/${EXPECTED_STRUCTURAL_MUTATIONS} RED)`);
