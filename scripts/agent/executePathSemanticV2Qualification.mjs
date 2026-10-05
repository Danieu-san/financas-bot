// Local serial diagnostic/qualification, never financial acceptance or GO.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadLocalAuthoringPackage } from './executeNextDomainInvariantMatrix.mjs';
import { buildAdmittedSchemaValidators } from './buildNextProvenanceArtifacts.mjs';
import { executePathSemanticV2Batch } from './executeNextPredicateStrategyMatrix.mjs';
const require = createRequire(import.meta.url);
const { admittedDocuments } = require('../../src/next/provenance/packageContract');
const { compileAuthoringIR } = require('../../src/next/provenance/graphCompiler');
const { enumeratePathInventoryCandidate, verifyMaterializedPathMigration, FROZEN_V1_HASH } = require('../../src/next/provenance/pathMutationInventory');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const local = name => path.join(root, '.codex-temp', name);
const job = local('path-semantic-v2-job-20261004.json');
const output = local('path-semantic-v2-full-20261004.json');
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const measured = ['src/next', 'docs/contracts/next/provenance-v2', 'tests/fixtures/financasbot-next',
    'scripts/agent/executeNextPredicateStrategyMatrix.mjs', 'scripts/agent/executePathSemanticV2Qualification.mjs',
    'scripts/agent/executeNextDomainInvariantMatrix.mjs', 'tests/next/provenance/pathSemanticV2.cases.js',
    'tests/next/provenance/pathInventoryV2.cases.js',
    'scripts/agent/buildNextMetricArtifacts.mjs', 'scripts/agent/buildNextProvenanceArtifacts.mjs',
    'scripts/agent/lowerNextProofProgram.mjs', 'scripts/agent/verifyNextProofStrategySites.mjs',
    'docs/audit-evidence/n02g-causal-authoring-profile/path-inventory-v1-frozen.json',
    'docs/audit-evidence/n02g-causal-authoring-profile/path-authorship-v1-frozen.json',
    'docs/audit-evidence/n02g-causal-authoring-profile/path-inventory-v1-v2-migration-r2.json'];
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
if (process.version !== 'v22.17.0' || process.argv.length !== 3 || process.argv[2] !== '--check') throw new Error('pinned_node_or_usage');
if (fs.existsSync(job) || fs.existsSync(output)) throw new Error('duplicate_invocation');
const started_at = new Date().toISOString();
const status = (state, fields = {}) => fs.writeFileSync(job, JSON.stringify({ state, pid: process.pid,
    node: process.version, started_at, report: output, global_g11: false, ...fields }) + '\n');
let before;
try {
    before = identity();
    status('path_semantic_v2_running', { measured_sources_sha256: before });
    const packageReceipt = loadLocalAuthoringPackage();
    const ir = compileAuthoringIR(packageReceipt, buildAdmittedSchemaValidators(packageReceipt).validators);
    const inventory = enumeratePathInventoryCandidate({ packageReceipt, ir });
    const expected = inventory.requirements.filter(row => row.family === 'predicate_path_semantic');
    const evidence = name => fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile', name), 'utf8');
    verifyMaterializedPathMigration({ packageReceipt, ir, frozenSource: evidence('path-inventory-v1-frozen.json'),
        expectedFrozenHash: FROZEN_V1_HASH, frozenAuthorshipSource: evidence('path-authorship-v1-frozen.json'),
        migrationSource: evidence('path-inventory-v1-v2-migration-r2.json') });
    const corpus = admittedDocuments(packageReceipt).find(row => row.path.endsWith('/graphs-v2.json')).value;
    status('path_semantic_v2_running', { measured_sources_sha256: before, expected: expected.length,
        requested_baselines: corpus.graphs.length, migration_verified: true });
    const result = await executePathSemanticV2Batch({ packageReceipt, fact_keys: corpus.graphs.map(row => row.fact_key) });
    const ids = result.rows.map(row => row.mutation_id).sort();
    const expectedIds = expected.map(row => row.mutation_id).sort();
    const invocations = result.rows.filter(row => row.dp_execution).map(row => row.invocation_id);
    const unchanged = identity() === before;
    const complete = ids.length === expectedIds.length && new Set(ids).size === ids.length
        && JSON.stringify(ids) === JSON.stringify(expectedIds)
        && new Set(invocations).size === invocations.length
        && result.mutations.generated === result.rows.filter(row => row.generated).length
        && result.mutations.executed === invocations.length
        && result.mutations.matched === result.rows.filter(row => row.matched).length
        && result.rows.every(row => row.matched !== result.unsatisfied.some(item => item.mutation_id === row.mutation_id));
    const valid = complete && unchanged && result.batch_complete && result.baselines.length === corpus.graphs.length
        && Object.values(result.mutations).every(value => value === expected.length)
        && result.unsatisfied.length === 0 && result.financial_receipt === false && result.global_g11 === false;
    const report = { ...result, accounting_complete: complete, measured_sources_unchanged: unchanged,
        measured_sources_sha256: before, unique_ids: new Set(ids).size,
        unique_invocations: new Set(invocations).size, migration_verified: true, activated: false, valid };
    fs.writeFileSync(output, JSON.stringify(report) + '\n', { flag: 'wx' });
    status(valid ? 'completed_local_family_only' : 'completed_with_pending', {
        completed_at: new Date().toISOString(), exit_code: valid ? 0 : 1,
        report_sha256: sha(fs.readFileSync(output)), measured_sources_sha256: before,
        measured_sources_unchanged: unchanged, accounting_complete: complete,
        mutations: result.mutations, baselines: result.baselines.length,
        unique_ids: new Set(ids).size, unique_invocations: new Set(invocations).size,
        unsatisfied: result.unsatisfied.length, valid, independent_code_audit: 'pending' });
    console.log(JSON.stringify({ state: valid ? 'completed_local_family_only' : 'completed_with_pending',
        mutations: result.mutations, unsatisfied: result.unsatisfied.length, accounting_complete: complete, valid }));
    if (!valid) process.exitCode = 1;
} catch (error) {
    status('blocked', { exit_code: 1, error: error.message,
        measured_sources_sha256: before ?? null, measured_sources_unchanged: before ? identity() === before : null });
    console.error(error.message); process.exitCode = 1;
}
