// Separate serial A/B qualification. Never overwrites the historical RED sweep.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadLocalAuthoringPackage } from './executeNextDomainInvariantMatrix.mjs';
import { executePredicateStrategyBoundaryBatch } from './executeNextPredicateStrategyMatrix.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const job = path.join(root, '.codex-temp/predicate-strategy-boundary-presence-job-20261003.json');
const output = path.join(root, '.codex-temp/predicate-strategy-boundary-presence-full-20261003.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const measured = ['src/next', 'docs/contracts/next/provenance-v2', 'tests/fixtures/financasbot-next',
    'scripts/agent/executeNextPredicateStrategyMatrix.mjs',
    'scripts/agent/executePredicateStrategyBoundaryQualification.mjs',
    'scripts/agent/verifyNextProofStrategySites.mjs',
    'scripts/agent/executeNextDomainInvariantMatrix.mjs', 'scripts/agent/buildNextMetricArtifacts.mjs',
    'scripts/agent/buildNextProvenanceArtifacts.mjs', 'scripts/agent/lowerNextProofProgram.mjs',
    'tests/next/provenance/predicateStrategyMatrix.cases.js',
    'tests/next/provenance/predicateStrategySites.cases.js'];
function identity() {
    const rows = [];
    function visit(relative) {
        const file = path.join(root, relative); const stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) throw new Error('measured_reparse_point');
        if (stat.isDirectory()) fs.readdirSync(file).sort().forEach(name => visit(path.join(relative, name)));
        else if (stat.isFile()) rows.push([relative.replaceAll('\\', '/'), sha(fs.readFileSync(file))]);
        else throw new Error('measured_not_regular');
    }
    measured.forEach(visit); return sha(JSON.stringify(rows.sort()));
}
function status(stage, fields = {}) {
    fs.writeFileSync(job, JSON.stringify({ stage, pid: process.pid, time: new Date().toISOString(),
        global_g11: false, ...fields }) + '\n');
}
if (process.version !== 'v22.17.0' || process.argv.length !== 2) throw new Error('pinned_node_or_usage');
if (fs.existsSync(job) || fs.existsSync(output)) throw new Error('duplicate_invocation');
let before;
try {
    before = identity();
    const corpus = JSON.parse(fs.readFileSync(path.join(root, 'docs/contracts/next/provenance-v2/graphs-v2.json')));
    const factKeys = corpus.graphs.map(graph => graph.fact_key);
    if (factKeys.length !== 76 || new Set(factKeys).size !== 76) throw new Error('corpus_identity');
    const coordinate = target => JSON.stringify([target.fact_key, target.predicate_id]);
    const coordinates = corpus.graphs.flatMap(graph => graph.predicates.filter(row => row.op === 'eq')
        .map(row => JSON.stringify([graph.fact_key, row.id])));
    const expected = coordinates.length;
    if (new Set(coordinates).size !== expected) throw new Error('coordinate_duplicate');
    status('predicate_strategy_boundary_running', { requested_graphs: 76, scoped_expected: expected,
        measured_sources_sha256: before });
    const result = await executePredicateStrategyBoundaryBatch({
        packageReceipt: loadLocalAuthoringPackage(), fact_keys: factKeys });
    const unchanged = identity() === before;
    const examined = new Set([...result.rows, ...result.unsatisfied].map(row => coordinate(row.target)));
    const captured = result.rows.map(row => row.invocation_id);
    const authoring = result.authoring_probe;
    const semantic = result.semantic_assertion_fault;
    const unique = rows => new Set(rows.map(row => row.mutation_id)).size === rows.length;
    const qualified = result.rows.filter(row => row.matched);
    const accountingComplete = unchanged && result.mutations.expected === expected
        && result.full_scalar_scope_expected === expected && examined.size === expected
        && coordinates.every(id => examined.has(id)) && unique(result.rows) && unique(result.unsatisfied)
        && new Set(captured).size === captured.length && captured.length === result.mutations.executed
        && qualified.length === result.mutations.matched && result.unsatisfied.length === expected - qualified.length
        && authoring.mutations.expected === expected && semantic.mutations.expected === expected
        && unique(authoring.rows) && authoring.rows.length === authoring.mutations.executed
        && authoring.rows.filter(row => row.matched).length === authoring.mutations.matched
        && result.rows.length === semantic.mutations.executed
        && result.rows.filter(row => row.semantic_assertion_fault_matched).length === semantic.mutations.matched
        && result.rows.every(row => row.negative_witness_only && !row.graph_accepted && !row.financial_receipt)
        && result.baselines.length === 76 && new Set(result.baselines.map(row => row.fact_key)).size === 76
        && result.baselines.every(row => row.oracle_matched && row.proof_satisfied)
        && result.qualification_boundary === 'authoring_plus_isolated_final_assertion'
        && result.predicate_atom_credit === 0 && result.global_g11 === false;
    const ledgersComplete = [result.mutations, authoring.mutations, semantic.mutations]
        .every(ledger => Object.values(ledger).every(count => count === expected));
    const valid = accountingComplete && ledgersComplete && result.batch_complete && !result.unsatisfied.length;
    const report = { ...result, measured_sources_unchanged: unchanged, measured_sources_sha256: before,
        accounting_complete: accountingComplete, valid, independent_code_audit: 'pending' };
    fs.writeFileSync(output, JSON.stringify(report) + '\n');
    const causes = result.unsatisfied.reduce((counts, row) => {
        counts[row.cause] = (counts[row.cause] || 0) + 1; return counts;
    }, {});
    status(valid ? 'predicate_strategy_boundary_completed_only' : 'predicate_strategy_boundary_completed_with_pending', {
        exit_code: valid ? 0 : 1, measured_sources_unchanged: unchanged,
        measured_sources_sha256: before, accounting_complete: accountingComplete,
        mutations: result.mutations, authoring_probe: authoring.mutations,
        semantic_assertion_fault: semantic.mutations, baselines: result.baselines.length,
        unsatisfied: result.unsatisfied.length, causes, report_sha256: sha(fs.readFileSync(output)),
        matrix_valid: valid, independent_code_audit: 'pending' });
    console.log(JSON.stringify({ mutations: result.mutations, authoring_probe: authoring.mutations,
        semantic_assertion_fault: semantic.mutations, causes, accounting_complete: accountingComplete,
        matrix_valid: valid, global_g11: false }));
    if (!valid) process.exitCode = 1;
} catch (error) {
    status('blocked', { exit_code: 1, error: error.message,
        measured_sources_unchanged: before ? identity() === before : null });
    console.error(error.message); process.exitCode = 1;
}
