// One local serial diagnostic sweep; never turns UNSATISFIED into PASS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadLocalAuthoringPackage } from './executeNextDomainInvariantMatrix.mjs';
import { executePredicateStrategyBatch } from './executeNextPredicateStrategyMatrix.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const local = name => path.join(root, '.codex-temp', name);
const job = local('predicate-strategy-job-20261003.json');
const output = local('predicate-strategy-full-20261003.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const measured = ['src/next', 'docs/contracts/next/provenance-v2', 'tests/fixtures/financasbot-next',
    'scripts/agent/executeNextPredicateStrategyMatrix.mjs', 'scripts/agent/executePredicateStrategyQualification.mjs',
    'scripts/agent/executeNextDomainInvariantMatrix.mjs', 'scripts/agent/buildNextMetricArtifacts.mjs',
    'scripts/agent/buildNextProvenanceArtifacts.mjs', 'scripts/agent/lowerNextProofProgram.mjs',
    'tests/next/provenance/predicateStrategyMatrix.cases.js'];
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
    const expected = corpus.graphs.reduce((count, graph) => count + graph.predicates.filter(row => row.op === 'eq').length, 0);
    status('predicate_strategy_running', { requested_graphs: factKeys.length,
        scoped_expected: expected, measured_sources_sha256: before });
    const result = await executePredicateStrategyBatch({ packageReceipt: loadLocalAuthoringPackage(), fact_keys: factKeys });
    const unchanged = identity() === before;
    const examined = new Set([...result.rows, ...result.unsatisfied].map(row => row.mutation_id));
    const captured = result.rows.map(row => row.execution_id);
    const qualified = result.rows.filter(row => row.matched);
    const accountingComplete = unchanged && result.mutations.expected === expected
        && result.full_scalar_scope_expected === expected && examined.size === expected
        && new Set(captured).size === captured.length && captured.length === result.mutations.executed
        && qualified.length === result.mutations.matched
        && result.unsatisfied.length === expected - qualified.length
        && result.predicate_atom_credit === 0 && result.global_g11 === false;
    const report = { ...result, measured_sources_unchanged: unchanged,
        measured_sources_sha256: before, accounting_complete: accountingComplete,
        valid: accountingComplete && result.batch_complete, independent_code_audit: 'pending' };
    fs.writeFileSync(output, JSON.stringify(report) + '\n');
    if (!accountingComplete) throw new Error('scope_accounting_incomplete');
    const causes = result.unsatisfied.reduce((counts, row) => {
        counts[row.cause] = (counts[row.cause] || 0) + 1; return counts;
    }, {});
    status(result.batch_complete ? 'predicate_strategy_completed_only' : 'predicate_strategy_completed_with_pending', {
        exit_code: result.batch_complete ? 0 : 1, measured_sources_unchanged: true,
        measured_sources_sha256: before, accounting_complete: true, mutations: result.mutations,
        baselines: result.baselines.length, unsatisfied: result.unsatisfied.length, causes,
        report_sha256: sha(fs.readFileSync(output)), matrix_valid: report.valid,
        independent_code_audit: 'pending' });
    console.log(JSON.stringify({ mutations: result.mutations, causes, accounting_complete: true,
        matrix_valid: report.valid, global_g11: false }));
    if (!result.batch_complete) process.exitCode = 1;
} catch (error) {
    status('blocked', { exit_code: 1, error: error.message,
        measured_sources_unchanged: before ? identity() === before : null });
    console.error(error.message); process.exitCode = 1;
}
