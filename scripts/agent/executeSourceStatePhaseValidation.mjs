// Local-only serial qualification job. No acceptance/release authority.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadLocalAuthoringPackage } from './executeNextDomainInvariantMatrix.mjs';
import { executeSourceStateMutationBatch } from './executeNextSourceStateMutationMatrix.mjs';
const require = createRequire(import.meta.url);
const { admittedDocuments } = require('../../src/next/provenance/packageContract');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const local = name => path.join(root, '.codex-temp', name);
const job = local('source-state-phase-job-20261002.json');
const output = local('source-state-phase-full-20261002.json');
const previous = local('source-state-scope-full-20261002.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const measured = ['src/next', 'docs/contracts/next/provenance-v2', 'tests/fixtures/financasbot-next',
    'scripts/agent/executeNextSourceStateMutationMatrix.mjs', 'scripts/agent/sourceStateNegativeReference.cjs',
    'scripts/agent/executeNextDomainInvariantMatrix.mjs', 'scripts/agent/buildNextMetricArtifacts.mjs',
    'scripts/agent/buildNextProvenanceArtifacts.mjs', 'scripts/agent/lowerNextProofProgram.mjs',
    'scripts/agent/executeSourceStatePhaseValidation.mjs', 'tests/next/provenance/sourceStateMatrix.cases.js',
    'tests/next/provenance/sourceStateReference.cases.js'];
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
const status = (stage, fields = {}) => fs.writeFileSync(job, JSON.stringify({ stage,
    pid: process.pid, time: new Date().toISOString(), global_g11: false, ...fields }) + '\n');
if (process.version !== 'v22.17.0' || process.argv.length !== 2) throw new Error('pinned_node_or_usage');
if (fs.existsSync(job) || fs.existsSync(output)) throw new Error('duplicate_invocation');
let before;
try {
    const oldBytes = fs.readFileSync(previous);
    if (sha(oldBytes) !== '7ed64c89428615e95d0f6d1f9b0032cd6ecf4cf6abbe68f262d56efde4fe6012') throw new Error('historical_report_identity');
    const old = JSON.parse(oldBytes);
    const oldIds = [...new Set([...old.rows, ...old.unsatisfied].map(row => row.mutation_id))].sort();
    if (oldIds.length !== 48 || old.mutations.matched !== 39) throw new Error('historical_inventory');
    before = identity();
    const packageReceipt = loadLocalAuthoringPackage();
    const corpus = admittedDocuments(packageReceipt).find(row => row.path.endsWith('/graphs-v2.json')).value;
    const keys = corpus.graphs.filter(graph => graph.predicates.some(p => p.op === 'eq'
        && ['period', 'coverage'].includes(p.atom) && graph.nodes[p.args?.[0]?.field?.node]?.kind === 'source_state'))
        .map(graph => graph.fact_key);
    status('source_state_phase_running', { measured_sources_sha256: before, requested_baselines: keys.length });
    const result = await executeSourceStateMutationBatch({ packageReceipt, fact_keys: keys });
    const unchanged = identity() === before;
    const newIds = result.rows.map(row => row.mutation_id).sort();
    const idsPreserved = JSON.stringify(newIds) === JSON.stringify(oldIds);
    const oldGreen = new Set(old.rows.filter(row => row.matched).map(row => row.mutation_id));
    const retained = result.rows.filter(row => row.matched && oldGreen.has(row.mutation_id)).length;
    const divergent = result.rows.filter(row => !row.positive_oracle_matched);
    const valid = unchanged && result.batch_complete && result.baselines.length === 23
        && result.source_state_scope_expected === 48 && Object.values(result.mutations).every(value => value === 48)
        && new Set(newIds).size === 48 && new Set(result.rows.map(row => row.execution_id)).size === 48
        && idsPreserved && retained === 39 && result.unsatisfied.length === 0
        && divergent.length === 2 && divergent.every(row => row.target.fact_key === 'S-16#1#1'
            && ['binding_11', 'r0004_include_coverage'].includes(row.target.predicate_id))
        && result.rows.every(row => row.counterfactual_reference_matched && row.negative_witness_qualified
            && row.target_read_observed && !row.proof_satisfied && !row.graph_accepted && !row.financial_receipt)
        && result.global_g11 === false && result.financial_receipt === false;
    const report = { ...result, measured_sources_unchanged: unchanged, measured_sources_sha256: before,
        historical_39_preserved: retained, inventory_ids_preserved: idsPreserved, valid };
    fs.writeFileSync(output, JSON.stringify(report) + '\n');
    if (!valid) throw new Error('source_state_phase_incomplete');
    status('source_state_phase_completed_only', { exit_code: 0, measured_sources_unchanged: true,
        measured_sources_sha256: before, baselines: 23, mutations: result.mutations,
        historical_39_preserved: retained, inventory_ids_preserved: true, report_sha256: sha(fs.readFileSync(output)),
        independent_code_audit: 'pending', other_g11_families: 'pending' });
    console.log(JSON.stringify({ stage: 'source_state_phase_completed_only', baselines: 23,
        mutations: result.mutations, historical_39_preserved: retained, global_g11: false }));
} catch (error) {
    status('blocked', { exit_code: 1, error: error.message,
        measured_sources_unchanged: before ? identity() === before : null });
    console.error(error.message); process.exitCode = 1;
}
