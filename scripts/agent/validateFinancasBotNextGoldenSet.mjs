import fs from 'node:fs';
import path from 'node:path';
import { validateMaterializedFacts } from './validateFinancasBotNextFacts.mjs';

const root = process.cwd();
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const corpusPath = 'tests/fixtures/financasbot-next/golden-conversation-set-v1.json';
const corpus = readJson(corpusPath);
const fixture = readJson(path.join(path.dirname(corpusPath), corpus.fixture_file));
const oracle = readJson(path.join(path.dirname(corpusPath), corpus.claim_oracle_file));
const factContracts = readJson(path.join(path.dirname(corpusPath), corpus.fact_contract_file));

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const countBy = (items, key) => items.reduce((out, item) => {
  out[item[key]] = (out[item[key]] ?? 0) + 1;
  return out;
}, {});
const sameSet = (actual, expected) =>
  actual.length === expected.length && actual.every(item => expected.includes(item));

const expectedClassCounts = { simple: 16, multi_tool: 16, follow_up: 8, negative: 8 };
const expectedCaseIds = [
  ...Array.from({ length: 16 }, (_, index) => `S-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 16 }, (_, index) => `M-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 8 }, (_, index) => `F-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 8 }, (_, index) => `N-${String(index + 1).padStart(2, '0')}`),
];
const expectedCriticalDimensions = [
  'person_family', 'account_card', 'category', 'period', 'time_basis',
  'transfer', 'invoice_payment', 'refund', 'projection', 'zero', 'empty',
  'incomplete', 'unavailable', 'source_coverage'
];
const expectedDispositionCounts = {
  materialized: 44, insufficient: 6, unavailable: 2, blocked: 3, refused: 1
};

const toolAllowlist = new Set([
  'transactions.search', 'transactions.summarize', 'balances.get_as_of',
  'accounts.list', 'cards.list', 'card_statement.get',
  'installments.get_schedule', 'budgets.get_cycle',
  'category_limits.get_status', 'recurring.list', 'income.summarize',
  'debts.get_status', 'goals.get_status', 'bills.list_due',
  'reminders.list', 'merchant_rules.lookup', 'forecasts.run',
  'calendar.events.list', 'open_finance.unregistered_events',
  'financial_sources.get_coverage'
]);

const contractFiles = [
  'docs/contracts/next/data-authority-contract-v0.md',
  'docs/contracts/next/coexistence-single-writer-contract-v0.md',
  'docs/contracts/next/conversation-proposal-contract-v0.md',
  'docs/contracts/next/model-data-boundary-contract-v0.md',
  'docs/contracts/next/integration-capability-manifest-v0.md',
  'docs/contracts/next/capability-cutover-matrix-v0.md',
  'docs/contracts/next/tool-budget-failure-policy-v0.md',
  'docs/contracts/next/quality-stability-retention-contract-v0.md'
];
const contractIdPattern = /\b(?:DA|SW|CP|MB|IM|CM|TB|QS)-\d{2}\b/g;
const expectedContracts = [...new Set(contractFiles.flatMap(file =>
  fs.readFileSync(path.join(root, file), 'utf8').match(contractIdPattern) ?? []
))].sort();
const expectedPrefixCounts = { DA: 6, SW: 5, CP: 5, MB: 5, IM: 12, CM: 8, TB: 12, QS: 14 };
for (const [prefix, count] of Object.entries(expectedPrefixCounts)) {
  assert(expectedContracts.filter(id => id.startsWith(`${prefix}-`)).length === count,
    `primary contracts: expected ${count} ${prefix} ids`);
}

function collectIds(value, ids = new Set()) {
  if (Array.isArray(value)) for (const item of value) collectIds(item, ids);
  else if (value && typeof value === 'object') {
    if (typeof value.id === 'string') ids.add(value.id);
    for (const item of Object.values(value)) collectIds(item, ids);
  }
  return ids;
}

assert(corpus.schema_version === 1, 'corpus schema_version must be 1');
assert(corpus.synthetic === true, 'corpus must be synthetic');
assert(fixture.synthetic === true, 'financial fixture must be synthetic');
assert(oracle.synthetic === true, 'claim oracle must be synthetic');
assert(corpus.fixed_clock === fixture.fixed_clock && corpus.fixed_clock === oracle.fixed_clock,
  'corpus, fixture and oracle clocks must match');
assert(corpus.claim_oracle_file === 'golden-claim-oracles-v1.json', 'unexpected claim oracle file');
assert(corpus.fact_contract_file === 'golden-fact-contracts-v1.json', 'unexpected fact contract file');
assert(corpus.traceability_policy_version === 'causal-trace-v2', 'unexpected traceability policy');
assert(Array.isArray(corpus.cases) && corpus.cases.length === 48, 'expected exactly 48 cases');
assert(JSON.stringify(corpus.required_class_counts) === JSON.stringify(expectedClassCounts),
  'required_class_counts must equal the independent 16/16/8/8 contract');
assert(sameSet(corpus.critical_dimensions, expectedCriticalDimensions),
  'critical_dimensions must equal the independent 14-dimension contract');

const ids = corpus.cases.map(item => item.id);
assert(new Set(ids).size === ids.length, 'case ids must be unique');
assert(sameSet(ids, expectedCaseIds), 'case ids differ from the independent 48-case inventory');
const classCounts = countBy(corpus.cases, 'class');
for (const [className, expected] of Object.entries(expectedClassCounts)) {
  assert(classCounts[className] === expected,
    `class ${className}: expected ${expected}, found ${classCounts[className] ?? 0}`);
}

const fixtureIds = collectIds(fixture);
const dimensionCounts = Object.fromEntries(expectedCriticalDimensions.map(name => [name, 0]));
const allowedOutcomes = new Set(['answer', 'insufficient', 'refuse_estimate', 'blocked', 'correct_false_premise']);
const turnKeys = [];

for (const item of corpus.cases) {
  assert(typeof item.title === 'string' && item.title.length > 0, `${item.id}: missing title`);
  assert(Array.isArray(item.dimensions) && item.dimensions.length > 0, `${item.id}: missing dimensions`);
  assert(Array.isArray(item.fixture_refs) && item.fixture_refs.length > 0, `${item.id}: missing fixture_refs`);
  assert(Array.isArray(item.turns) && item.turns.length > 0, `${item.id}: missing turns`);
  assert(Array.isArray(item.must_not) && item.must_not.length > 0, `${item.id}: missing must_not assertions`);
  assert(allowedOutcomes.has(item.expected_outcome), `${item.id}: unsupported expected_outcome`);
  if (item.class === 'follow_up') assert(item.turns.length >= 2, `${item.id}: follow_up requires two turns`);
  else assert(item.turns.length === 1, `${item.id}: non-follow_up must have exactly one turn`);
  if (item.class === 'negative') assert(item.expected_outcome !== 'answer', `${item.id}: negative cannot be plain answer`);
  for (const dimension of item.dimensions) {
    assert(expectedCriticalDimensions.includes(dimension), `${item.id}: unknown dimension ${dimension}`);
    if (dimension in dimensionCounts) dimensionCounts[dimension] += 1;
  }
  for (const ref of item.fixture_refs) assert(fixtureIds.has(ref), `${item.id}: unknown fixture ref ${ref}`);
  for (const [turnIndex, turn] of item.turns.entries()) {
    const key = `${item.id}#${turnIndex + 1}`;
    turnKeys.push(key);
    assert(turn.oracle_ref === key, `${key}: oracle_ref must be exact`);
    assert(typeof turn.user === 'string' && turn.user.length > 0, `${key}: missing user text`);
    assert(Array.isArray(turn.expected_tools), `${key}: expected_tools must be array`);
    assert(Array.isArray(turn.expected_claims) && turn.expected_claims.length > 0,
      `${key}: expected_claims must be non-empty`);
    for (const tool of turn.expected_tools) assert(toolAllowlist.has(tool), `${key}: tool not read-only: ${tool}`);
  }
}
assert(turnKeys.length === 56, `expected 56 turns, found ${turnKeys.length}`);
for (const [dimension, count] of Object.entries(dimensionCounts)) {
  assert(count >= 3, `critical dimension ${dimension}: expected at least 3, found ${count}`);
}

const oracleKeys = Object.keys(oracle.turns ?? {});
assert(sameSet(oracleKeys, turnKeys), 'claim oracle must cover every turn exactly once');
const allowedDispositions = new Set(Object.keys(expectedDispositionCounts));
const allowedEvidenceStates = new Set(['confirmed', 'committed', 'projected', 'estimated', 'incomplete', 'unavailable']);
const dispositionCounts = {};
for (const key of turnKeys) {
  const entry = oracle.turns[key];
  assert(entry && allowedDispositions.has(entry.disposition), `${key}: unsupported/missing oracle disposition`);
  dispositionCounts[entry?.disposition] = (dispositionCounts[entry?.disposition] ?? 0) + 1;
  assert(Array.isArray(entry?.facts), `${key}: oracle facts must be array`);
  if (entry?.disposition === 'materialized') {
    assert(entry.facts.length > 0, `${key}: materialized oracle requires facts`);
    for (const [factIndex, fact] of entry.facts.entries()) {
      const prefix = `${key}/fact-${factIndex + 1}`;
      for (const field of ['metric','unit','entity','period','time_basis','coverage','evidence_state']) {
        assert(typeof fact[field] === 'string' && fact[field].length > 0, `${prefix}: ${field} required`);
      }
      assert(['number','string','boolean'].includes(typeof fact.value) || Array.isArray(fact.value), `${prefix}: typed value required`);
      assert(allowedEvidenceStates.has(fact.evidence_state), `${prefix}: invalid evidence_state`);
      assert(Array.isArray(fact.evidence_refs) && fact.evidence_refs.length > 0, `${prefix}: evidence_refs required`);
      for (const ref of fact.evidence_refs) assert(fixtureIds.has(ref), `${prefix}: unknown evidence ref ${ref}`);
    }
  } else {
    assert(entry.facts.length === 0, `${key}: non-materialized result cannot carry factual values`);
    assert(typeof entry.reason === 'string' && entry.reason.length > 0, `${key}: failure reason required`);
    assert(typeof entry.coverage === 'string' && entry.coverage.length > 0, `${key}: failure coverage required`);
  }
}
for (const [disposition, expected] of Object.entries(expectedDispositionCounts)) {
  assert(dispositionCounts[disposition] === expected,
    `oracle disposition ${disposition}: expected ${expected}, found ${dispositionCounts[disposition] ?? 0}`);
}
assert(Object.keys(dispositionCounts).length === Object.keys(expectedDispositionCounts).length,
  'oracle contains an unexpected disposition');

const factValidation = validateMaterializedFacts(fixture, oracle, factContracts);
for (const failure of factValidation.failures) failures.push(failure);
assert(factValidation.materializedFacts === 76, `expected 76 materialized facts, found ${factValidation.materializedFacts}`);
assert(factValidation.metricCount === 39, `expected 39 deterministic metric evaluators, found ${factValidation.metricCount}`);

assert(Array.isArray(corpus.contract_traceability), 'contract_traceability must be an array');
const traceModes = new Set(['conversation_guard','corpus_evidence','documentary_static','deferred_executable','mixed']);
const mixedIds = new Set(['DA-03','DA-04','DA-05','DA-06','CP-01','CP-03','MB-03','MB-04','QS-01','QS-02']);
const documentaryIds = new Set(['CM-04','CM-07','CM-08']);
const traceIds = [];
for (const [index, trace] of corpus.contract_traceability.entries()) {
  assert(Array.isArray(trace.ids) && trace.ids.length > 0, `traceability/${index}: ids required`);
  assert(traceModes.has(trace.mode), `traceability/${index}: unsupported mode ${trace.mode}`);
  assert(Array.isArray(trace.cases), `traceability/${index}: cases must be array`);
  assert(typeof trace.target_phase === 'string' && trace.target_phase.length > 0, `traceability/${index}: target_phase required`);
  assert(typeof trace.rationale === 'string' && trace.rationale.length > 0, `traceability/${index}: rationale required`);
  for (const id of trace.ids) {
    const expectedMode = mixedIds.has(id) ? 'mixed' : documentaryIds.has(id) ? 'documentary_static' : 'deferred_executable';
    assert(trace.mode === expectedMode, `${id}: expected causal mode ${expectedMode}, found ${trace.mode}`);
  }
  if (trace.mode === 'mixed') assert(trace.cases.length > 0, `traceability/${index}: mixed requires guard cases`);
  else assert(trace.cases.length === 0, `traceability/${index}: ${trace.mode} must not imply conversation proof`);
  for (const caseId of trace.cases) assert(ids.includes(caseId), `traceability/${index}: unknown case ${caseId}`);
  traceIds.push(...trace.ids);
}
const traceRefs = new Set(traceIds);
assert(expectedContracts.length === 67, `primary contract inventory must contain 67 ids, found ${expectedContracts.length}`);
assert(traceRefs.size === traceIds.length, 'each contract id must appear in exactly one traceability entry');
assert(expectedContracts.every(id => traceRefs.has(id)), 'traceability misses a primary contract id');
assert([...traceRefs].every(id => expectedContracts.includes(id)), 'traceability contains unknown contract id');

const serialized = `${JSON.stringify(corpus)}\n${JSON.stringify(fixture)}\n${JSON.stringify(oracle)}`;
const forbiddenMarkers = [
  /Daniel/i, /Tha[ií]s/i, /Cristina/i, /Nubank/i, /Ita[uú]/i, /Pluggy/i,
  /https?:\/\//i, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/,
  /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b[0-9a-f]{32,}\b/i, /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
  /\b(?:sk|AIza|ghp|github_pat)_[A-Za-z0-9_-]{8,}\b/i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/
];
for (const marker of forbiddenMarkers) assert(!marker.test(serialized), `private/production marker found: ${marker}`);
assert(fixture.people.every(item => /^Pessoa [A-C]$/.test(item.label)), 'human labels must use the synthetic Pessoa A-C allowlist');
assert(fixture.families.every(item => /^Familia (Exemplo|Externa)$/.test(item.label)), 'family labels must be synthetic');
assert(fixture.events.every(item => ['confirmed','projected'].includes(item.state)), 'fixture event state outside canonical vocabulary');
assert(fixture.proposals.every(item => ['presented','expired','superseded'].includes(item.state)), 'fixture proposal state outside canonical vocabulary');
const fixtureCategoryIds = new Set(fixture.categories.map(item => item.id));
for (const source of fixture.source_states) {
  if (source.category_id) assert(fixtureCategoryIds.has(source.category_id), `${source.id}: unknown category_id`);
}

if (failures.length > 0) {
  console.error(`NEXT00-04 GOLDEN SET: FAIL (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('NEXT00-04 GOLDEN SET: PASS');
console.log(`cases=${corpus.cases.length},turns=${turnKeys.length}`);
console.log(`classes=${JSON.stringify(classCounts)}`);
console.log(`dimensions=${JSON.stringify(dimensionCounts)}`);
console.log(`oracles=${oracleKeys.length},dispositions=${JSON.stringify(dispositionCounts)},facts=${factValidation.materializedFacts},metric_evaluators=${factValidation.metricCount}`);
console.log(`contract_traceability=${traceRefs.size}/67,source=primary_contracts,policy=causal-trace-v2`);
console.log(`fixture_ids=${fixtureIds.size}`);
