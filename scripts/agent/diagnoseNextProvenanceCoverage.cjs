'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
// Development diagnostic, NOT an acceptance gate. Fixture authority is built
// locally; it does not authenticate the host, artifacts or parent receipts.
const usage = 'Usage: node scripts/agent/diagnoseNextProvenanceCoverage.cjs [--details | --output .codex-temp/<file>.json]';
const argv = process.argv.slice(2);
if (!(argv.length === 0 || argv.length === 1 && argv[0] === '--details'
    || argv.length === 2 && argv[0] === '--output')) throw new Error(usage);
let outputPath;
if (argv[0] === '--output') {
 outputPath = path.resolve(root, argv[1]);
 const relative = path.relative(path.join(root, '.codex-temp'), outputPath);
 if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !outputPath.endsWith('.json')) throw new Error(usage);
 // Refuse linked destinations and accidental replacement of earlier evidence.
 const tempRoot = path.join(root, '.codex-temp');
 if (!fs.existsSync(tempRoot) || fs.lstatSync(tempRoot).isSymbolicLink()
     || path.dirname(outputPath) !== tempRoot) throw new Error(usage);
}
const { admitPackage } = require('../../src/next/provenance/packageContract');
const { compileSnapshotAccess } = require('../../src/next/provenance/graphCompiler');
const { createCausalRecorder } = require('../../src/next/provenance/causalRecorder');
const { compareReadEdgeCoverage, compareSelectionCoverage, comparePhaseCoverage } = require('../../src/next/provenance/proofAcceptance');
const { evaluateDirectMetric } = require('../../src/next/provenance/metricDirectReads');
const { evaluateEconomicMetric } = require('../../src/next/provenance/metricSelection');
const { evaluateInstallments } = require('../../src/next/provenance/metricInstallments');
const { evaluateEffects } = require('../../src/next/provenance/metricEffects');
const prefix = 'docs/contracts/next/provenance-v2/';
const docs = new Map();
function add(file) {
 if (!docs.has(file)) docs.set(file, { path: file, bytes: Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')) });
 return JSON.parse(docs.get(file).bytes);
}
async function main() {
 const bundle = add(prefix + 'graphs-v2.json');
 for (const file of ['predicate-templates-v1.json', 'claim-contract.schema.json', 'evidence-snapshot.schema.json']) add(prefix + file);
 for (const key of ['claim_contract', 'snapshot_manifest', 'material_registry', 'operator_registry', 'metric_evaluator_registry']) add(bundle[key].path);
 for (const item of add(bundle.snapshot_manifest.path).sources) add(item.path);
 for (const item of add(bundle.metric_evaluator_registry.path).entries) add(item.contract_path);
 for (const graph of bundle.graphs) for (const source of graph.authoring_sources) add(source.path);
 const entries = [...docs.values()];
 const admitted = admitPackage({ entries, authority: entries.map(e => ({ path: e.path, sha256: 'sha256:' + createHash('sha256').update(e.bytes).digest('hex') })) });
 const builder = await import(pathToFileURL(path.join(root, 'scripts/agent/buildNextProvenanceArtifacts.mjs')));
 const plan = compileSnapshotAccess(admitted, builder.buildSchemaValidators().validators);
 const claims = add(bundle.claim_contract.path).claims;
 const modes = { consumption_total: 'total', category_consumption: 'category', category_spent: 'spent', income_realized: 'income', consumption_by_instrument: 'instrument', budget_class_consumption: 'budget_class', category_budget_remaining: 'budget_remaining', statement_total: 'statement', safe_daily_pace: 'safe_pace' };
 const direct = ['balance_delta', 'invoice_payment_amount', 'invoice_payment_target_card', 'statement_payment_correspondence', 'source_coverage', 'owned_cards', 'merchant_rule_ids', 'eligible_event_count', 'side_effect_count', 'bills_open', 'due_bill_ids', 'due_bills_total', 'reminder_count', 'calendar_event_count', 'similar_event_ids', 'account_balance', 'movement_ids'];
 const installments = ['installments_realized', 'installments_realized_amount', 'installments_projected', 'installments_projected_amount', 'projected_installments'];
 const effects = ['consumption_effect', 'net_consumption', 'invoice_payment_consumption_effect', 'gross_consumption', 'refund_amount'];
 const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
 const trackedChanges = execFileSync('git', ['diff', 'HEAD', '--name-only'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
 const records = []; const pending = []; const eventClasses = {}; const dimensions = {};
 for (const claim of claims) {
  const evaluate = Object.hasOwn(modes, claim.metric) ? operands => evaluateEconomicMetric(operands, modes[claim.metric])
   : direct.includes(claim.metric) ? operands => evaluateDirectMetric(operands, claim.metric)
   : installments.includes(claim.metric) ? operands => evaluateInstallments(operands, claim.metric)
   : effects.includes(claim.metric) ? operands => evaluateEffects(operands, claim.metric) : null;
  if (!evaluate) { pending.push({ fact_key: claim.fact_key, metric: claim.metric }); continue; }
  const matchingGraphs = bundle.graphs.filter(g => g.fact_key === claim.fact_key);
  if (matchingGraphs.length !== 1) throw new Error('diagnostic_graph_identity');
  const graph = matchingGraphs[0];
  const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
  const operandSets = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set')
   .map(([role, b]) => ({ role, aliases: b.aliases }));
  const executionId = 'coverage-diagnostic'; const invocationId = claim.fact_key;
  const recorder = createCausalRecorder({ executionId, maxEvents: 10000 });
  const phase = recorder.open({ invocationId, phase: 'derivation' });
  const controls = []; const operands = {};
  for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
   const selector = { fact_key: claim.fact_key, role_id };
   const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
    : binding.kind === 'node_set' ? plan.openSet(selector, phase.observe)
    : plan.open({ ...selector, alias: binding.alias }, phase.observe);
   controls.push(access); operands[role_id] = access.handle;
  }
  evaluate(Object.freeze(operands));
  for (const control of controls) { control.revoke(); control.assertHealthy(); }
  phase.seal(); const trace = recorder.finish();
  const expected = graph.trace_contract.derivation;
  const coverage = compareReadEdgeCoverage({ trace, executionId, invocationId, phase: 'derivation', expected: Object.fromEntries(['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural'].map(k => [k, expected[k]])) });
  const bindings = expected.required_selections.map(s => {
   const roles = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set' && JSON.stringify(b.aliases) === JSON.stringify(graph.sets[s.candidate_set]));
   if (roles.length !== 1) throw new Error('ambiguous diagnostic role');
   return { role: roles[0][0], ...s };
  });
  const selection = compareSelectionCoverage({ trace, executionId, invocationId, phase: 'derivation', sets: graph.sets, bindings, expected: { required_selections: expected.required_selections, selected_nodes: expected.selected_nodes } });
  const composition = comparePhaseCoverage({ trace, executionId, invocationId, phase: 'derivation', sets: graph.sets, bindings, operandSets, accessBindings,
   expected: Object.fromEntries(['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural', 'required_selections', 'selected_nodes'].map(k => [k, expected[k]])) });
  const eventCoverage = { covered: 0, invalid: 0, unsupported: 0 };
  for (const event of composition.event_coverage) eventCoverage[event.status]++;
  const bySequence = new Map(trace.derivation_trace.map(e => [e.sequence, e]));
  const unclassified = {};
  for (const item of coverage.unclassified) {
   const e = bySequence.get(item.sequence); const key = (e.projection || 'measurement') + '/' + item.operation;
   unclassified[key] = (unclassified[key] || 0) + 1; eventClasses[key] = (eventClasses[key] || 0) + 1;
  }
  for (const item of coverage.mismatches) dimensions[item.dimension] = (dimensions[item.dimension] || 0) + 1;
  records.push({ fact_key: claim.fact_key, metric: claim.metric, selection_matched: selection.matched, read_edge_matched: coverage.matched,
   phase_composition_matched: composition.matched, event_coverage: eventCoverage,
   metadata_errors: composition.components.access_metadata.errors, unclassified, mismatches: coverage.mismatches });
 }
 const normalizedInputs = [...docs.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  .map(e => [e.path, createHash('sha256').update(e.bytes).digest('hex')]);
 const report = {
  kind: 'diagnostic_only_not_acceptance', phase: 'derivation', graph_accepted: false,
  source_head: sourceHead, tracked_changes: trackedChanges,
  diagnostic_sha256: createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  fixture_authority: 'self_admitted_lf_normalized_not_trusted_host',
  fixture_documents: normalizedInputs.length,
  fixture_digest: createHash('sha256').update(JSON.stringify(normalizedInputs)).digest('hex'),
  oracle_used: false, functional_results_checked: false,
  graphs: bundle.graphs.length, exercised: records.length, pending,
  selection_matched: records.filter(r => r.selection_matched).length,
  read_edge_matched: records.filter(r => r.read_edge_matched).length,
  phase_composition_matched: records.filter(r => r.phase_composition_matched).length,
  event_coverage: records.reduce((total, r) => {
   for (const key of Object.keys(total)) total[key] += r.event_coverage[key];
   return total;
  }, { covered: 0, invalid: 0, unsupported: 0 }),
  dimensions_exact: records.filter(r => !r.mismatches.length).length,
  eventClasses, dimensions, records
 };
 if (outputPath) fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
 const { records: details, ...summary } = report;
 console.log(JSON.stringify(argv[0] === '--details' ? report : summary, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
