import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const corpusPath = path.join(root, 'tests/fixtures/financasbot-next/golden-conversation-set-v1.json');
const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
const fixturePath = path.join(path.dirname(corpusPath), corpus.fixture_file);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const countBy = (items, key) => items.reduce((out, item) => {
  out[item[key]] = (out[item[key]] ?? 0) + 1;
  return out;
}, {});

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
  // Contracts 1-4 have their test ids in the shared validation index.
  'docs/plans/workstreams/financasbot-next-00-contracts-1-4-validation-v1.md',
  'docs/contracts/next/integration-capability-manifest-v0.md',
  'docs/contracts/next/capability-cutover-matrix-v0.md',
  'docs/contracts/next/tool-budget-failure-policy-v0.md',
  'docs/contracts/next/quality-stability-retention-contract-v0.md'
];
const contractIdPattern = /\b(?:DA|SW|CP|MB|IM|CM|TB|QS)-\d{2}\b/g;
const expectedContracts = [...new Set(contractFiles.flatMap(file => {
  const contents = fs.readFileSync(path.join(root, file), 'utf8');
  return contents.match(contractIdPattern) ?? [];
}))].sort();

function collectIds(value, ids = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, ids);
  } else if (value && typeof value === 'object') {
    if (typeof value.id === 'string') ids.add(value.id);
    for (const item of Object.values(value)) collectIds(item, ids);
  }
  return ids;
}

assert(corpus.schema_version === 1, 'corpus schema_version must be 1');
assert(corpus.synthetic === true, 'corpus must be synthetic');
assert(fixture.synthetic === true, 'financial fixture must be synthetic');
assert(corpus.fixed_clock === fixture.fixed_clock, 'corpus and fixture clocks must match');
assert(Array.isArray(corpus.cases), 'corpus cases must be an array');
assert(corpus.cases.length === 48, `expected 48 cases, found ${corpus.cases.length}`);

const ids = corpus.cases.map(item => item.id);
assert(new Set(ids).size === ids.length, 'case ids must be unique');

const classCounts = countBy(corpus.cases, 'class');
for (const [className, expected] of Object.entries(corpus.required_class_counts)) {
  assert(classCounts[className] === expected,
    `class ${className}: expected ${expected}, found ${classCounts[className] ?? 0}`);
}
assert(Object.values(classCounts).reduce((a, b) => a + b, 0) === 48,
  'unexpected class outside required_class_counts');

const fixtureIds = collectIds(fixture);
const dimensionCounts = Object.fromEntries(corpus.critical_dimensions.map(name => [name, 0]));
const allowedOutcomes = new Set([
  'answer', 'insufficient', 'refuse_estimate', 'blocked', 'correct_false_premise'
]);

for (const item of corpus.cases) {
  assert(typeof item.title === 'string' && item.title.length > 0, `${item.id}: missing title`);
  assert(Array.isArray(item.dimensions) && item.dimensions.length > 0, `${item.id}: missing dimensions`);
  assert(Array.isArray(item.fixture_refs) && item.fixture_refs.length > 0, `${item.id}: missing fixture_refs`);
  assert(Array.isArray(item.turns) && item.turns.length > 0, `${item.id}: missing turns`);
  assert(Array.isArray(item.must_not) && item.must_not.length > 0, `${item.id}: missing must_not assertions`);
  assert(allowedOutcomes.has(item.expected_outcome), `${item.id}: unsupported expected_outcome`);

  if (item.class === 'follow_up') assert(item.turns.length >= 2, `${item.id}: follow_up requires at least two turns`);
  else assert(item.turns.length === 1, `${item.id}: non-follow_up must have exactly one turn`);
  if (item.class === 'negative') assert(item.expected_outcome !== 'answer', `${item.id}: negative case cannot be a plain answer`);

  for (const dimension of item.dimensions) {
    assert(corpus.critical_dimensions.includes(dimension), `${item.id}: unknown dimension ${dimension}`);
    if (dimension in dimensionCounts) dimensionCounts[dimension] += 1;
  }
  for (const ref of item.fixture_refs) assert(fixtureIds.has(ref), `${item.id}: unknown fixture ref ${ref}`);

  for (const [turnIndex, turn] of item.turns.entries()) {
    assert(typeof turn.user === 'string' && turn.user.length > 0, `${item.id}/${turnIndex}: missing user text`);
    assert(Array.isArray(turn.expected_tools), `${item.id}/${turnIndex}: expected_tools must be array`);
    assert(Array.isArray(turn.expected_claims) && turn.expected_claims.length > 0,
      `${item.id}/${turnIndex}: expected_claims must be non-empty`);
    for (const tool of turn.expected_tools) assert(toolAllowlist.has(tool), `${item.id}: tool not in read allowlist: ${tool}`);
  }
}

for (const [dimension, count] of Object.entries(dimensionCounts)) {
  assert(count >= 3, `critical dimension ${dimension}: expected at least 3 cases, found ${count}`);
}

assert(Array.isArray(corpus.contract_traceability), 'contract_traceability must be an array');
const traceModes = new Set(['conversation_guard', 'corpus_evidence', 'deferred_executable', 'mixed']);
const traceIds = [];
for (const [index, trace] of corpus.contract_traceability.entries()) {
  assert(Array.isArray(trace.ids) && trace.ids.length > 0, `traceability/${index}: ids required`);
  assert(traceModes.has(trace.mode), `traceability/${index}: unsupported mode ${trace.mode}`);
  assert(Array.isArray(trace.cases), `traceability/${index}: cases must be array`);
  assert(typeof trace.target_phase === 'string' && trace.target_phase.length > 0,
    `traceability/${index}: target_phase required`);
  assert(typeof trace.rationale === 'string' && trace.rationale.length > 0,
    `traceability/${index}: rationale required`);
  if (trace.mode === 'conversation_guard') {
    assert(trace.cases.length > 0, `traceability/${index}: conversation_guard requires cases`);
  }
  for (const caseId of trace.cases) assert(ids.includes(caseId), `traceability/${index}: unknown case ${caseId}`);
  traceIds.push(...trace.ids);
}

const traceRefs = new Set(traceIds);
const missingContracts = expectedContracts.filter(ref => !traceRefs.has(ref));
const unknownContracts = [...traceRefs].filter(ref => !expectedContracts.includes(ref));
assert(expectedContracts.length === 67, `documented contract inventory must contain 67 ids, found ${expectedContracts.length}`);
assert(traceRefs.size === traceIds.length, 'each contract id must appear in exactly one traceability entry');
assert(missingContracts.length === 0, `missing contract refs: ${missingContracts.join(', ')}`);
assert(unknownContracts.length === 0, `unknown contract refs: ${unknownContracts.join(', ')}`);

const serialized = `${JSON.stringify(corpus)}\n${JSON.stringify(fixture)}`;
const forbiddenMarkers = [
  /Daniel/i, /Tha[ií]s/i, /Cristina/i, /Nubank/i, /Ita[uú]/i,
  /Pluggy/i, /WhatsApp/i, /docs\.google\.com/i, /sk-[A-Za-z0-9_-]{8,}/,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/
];
for (const marker of forbiddenMarkers) assert(!marker.test(serialized), `private/production marker found: ${marker}`);

if (failures.length > 0) {
  console.error(`NEXT00-04 GOLDEN SET: FAIL (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('NEXT00-04 GOLDEN SET: PASS');
console.log(`cases=${corpus.cases.length}`);
console.log(`classes=${JSON.stringify(classCounts)}`);
console.log(`dimensions=${JSON.stringify(dimensionCounts)}`);
console.log(`contract_traceability=${traceRefs.size}/67`);
console.log(`fixture_ids=${fixtureIds.size}`);
