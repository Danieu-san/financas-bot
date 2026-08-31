import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'next00-golden-mutations-'));
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
  console.log(`mutation=${name}: RED`);
}

restore();
const baselineGolden = runGolden();
if (baselineGolden.status !== 0) throw new Error(`golden baseline failed:\n${baselineGolden.stdout}\n${baselineGolden.stderr}`);
const baselineHashes = runHashes();
if (baselineHashes.status !== 0) throw new Error(`hash baseline failed:\n${baselineHashes.stdout}\n${baselineHashes.stderr}`);
console.log('baseline: PASS');

expectRed('wrong_quantitative_oracle', 'S-01#1/consumption_total: factual oracle diverges', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => { value.turns['S-01#1'].facts[0].value += 1; });
});
expectRed('wrong_non_sentinel_quantitative_oracle', 'M-13#1/safe_daily_pace: factual oracle diverges', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => {
    value.turns['M-13#1'].facts.find(fact => fact.metric === 'safe_daily_pace').value = 999999;
  });
});
expectRed('wrong_unit', 'M-13#1/safe_daily_pace: unit count is not BRL_minor', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => {
    value.turns['M-13#1'].facts.find(fact => fact.metric === 'safe_daily_pace').unit = 'count';
  });
});
expectRed('wrong_entity', 'F-01#1/category_consumption: factual oracle diverges', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => {
    value.turns['F-01#1'].facts[0].entity = 'person-b:food.snack';
  });
});
expectRed('wrong_period', 'F-03#1/consumption_by_instrument: factual oracle diverges', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => { value.turns['F-03#1'].facts[0].period = '2042-05'; });
});
expectRed('wrong_time_basis', 'F-03#1/consumption_by_instrument: unsupported time_basis registry_current', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => { value.turns['F-03#1'].facts[0].time_basis = 'registry_current'; });
});
expectRed('wrong_materialized_coverage', 'F-03#1/consumption_by_instrument: materialized coverage must be complete, found partial', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => { value.turns['F-03#1'].facts[0].coverage = 'partial'; });
});
expectRed('existing_but_wrong_evidence_type', 'S-03#1/category_consumption: evidence ref card-blue has incompatible type cards', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => { value.turns['S-03#1'].facts[0].evidence_refs = ['card-blue']; });
});
expectRed('missing_calendar_fact', 'deterministic metric registry contains unused entries', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => {
    value.turns['M-15#1'].facts = value.turns['M-15#1'].facts.filter(fact => fact.metric !== 'calendar_event_count');
  });
});
expectRed('false_statement_payment_correspondence', 'M-05#1/statement_payment_correspondence: factual oracle diverges', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => {
    value.turns['M-05#1'].facts.find(fact => fact.metric === 'statement_payment_correspondence').value = 'proven';
  });
});
expectRed('incompatible_source_evidence_state', 'M-13#1/category_budget_remaining: incompatible evidence_state committed', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => {
    value.turns['M-13#1'].facts.find(fact => fact.metric === 'category_budget_remaining').evidence_state = 'committed';
  });
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
  mutateJson('tests/fixtures/financasbot-next/golden-conversation-set-v1.json', value => { value.required_class_counts.simple = 15; value.required_class_counts.multi_tool = 17; });
});
expectRed('private_email_in_fixture', 'private/production marker found', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-financial-fixture-v1.json', value => { value.notice = 'contato real@example.com'; });
});
expectRed('legacy_event_state', 'fixture event state outside canonical vocabulary', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-financial-fixture-v1.json', value => { value.events[0].state = 'realized'; });
});
expectRed('unknown_evidence_ref', 'unknown evidence ref secret-real-id', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => { value.turns['S-01#1'].facts[0].evidence_refs.push('secret-real-id'); });
});
expectRed('uncovered_numeric_threshold_changed', 'frozen SHA-256 mismatch', () => {
  const file = path.join(temp, 'docs/contracts/next/quality-stability-retention-contract-v0.md');
  const text = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, text.replace('lease TTL: 60 segundos', 'lease TTL: 61 segundos'), 'utf8');
}, runHashes);

fs.rmSync(temp, { recursive: true, force: true });
console.log(`NEXT00 VALIDATOR MUTATIONS: PASS (${redCount}/${redCount} RED)`);
