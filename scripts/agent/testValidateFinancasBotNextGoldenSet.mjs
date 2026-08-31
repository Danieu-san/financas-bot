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
  'scripts/agent/validateFinancasBotNextGoldenSet.mjs'
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

function run() {
  return spawnSync(process.execPath, ['scripts/agent/validateFinancasBotNextGoldenSet.mjs'], {
    cwd: temp,
    encoding: 'utf8'
  });
}

function expectRed(name, expectedFragment, mutation) {
  restore();
  mutation();
  const result = run();
  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0 || !output.includes(expectedFragment)) {
    throw new Error(`${name}: expected RED containing ${expectedFragment}; got status=${result.status}\n${output}`);
  }
  console.log(`mutation=${name}: RED`);
}

restore();
const baseline = run();
if (baseline.status !== 0) throw new Error(`baseline failed:\n${baseline.stdout}\n${baseline.stderr}`);
console.log('baseline: PASS');

expectRed('wrong_quantitative_oracle', 'S-01 factual oracle diverges', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => {
    value.turns['S-01#1'].facts[0].value += 1;
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
  mutateJson('tests/fixtures/financasbot-next/golden-conversation-set-v1.json', value => {
    value.required_class_counts.simple = 15;
    value.required_class_counts.multi_tool = 17;
  });
});

expectRed('private_email_in_fixture', 'private/production marker found', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-financial-fixture-v1.json', value => {
    value.notice = 'contato real@example.com';
  });
});

expectRed('legacy_event_state', 'fixture event state outside canonical vocabulary', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-financial-fixture-v1.json', value => {
    value.events[0].state = 'realized';
  });
});

expectRed('unknown_evidence_ref', 'unknown evidence ref secret-real-id', () => {
  mutateJson('tests/fixtures/financasbot-next/golden-claim-oracles-v1.json', value => {
    value.turns['S-01#1'].facts[0].evidence_refs.push('secret-real-id');
  });
});

fs.rmSync(temp, { recursive: true, force: true });
console.log('NEXT00 GOLDEN VALIDATOR MUTATIONS: PASS (7/7 RED)');
