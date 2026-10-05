// HARNESS candidate only. Historical freeze uses the unchanged v1 enumerator,
// never the v2 migrator; activation remains subject to independent code audit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadLocalAuthoringPackage } from './executeNextDomainInvariantMatrix.mjs';
import { buildAdmittedSchemaValidators } from './buildNextProvenanceArtifacts.mjs';
const require = createRequire(import.meta.url);
const { compileAuthoringIR } = require('../../src/next/provenance/graphCompiler');
const { admittedDocuments } = require('../../src/next/provenance/packageContract');
const { enumerateMutationRequirements } = require('../../src/next/provenance/mutationWitnesses');
const { canonicalValue } = require('../../src/next/kernel/canonicalValue');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const output = path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile');
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const addendum = 'f892a35fce88fe21d474bd7ed408fe2697052ce7';
if (process.version !== 'v22.17.0' || process.argv.length !== 3
    || !['--freeze-v1', '--freeze-authorship-v1', '--check-v2'].includes(process.argv[2])) throw new Error('pinned_node_or_usage');
const packageReceipt = loadLocalAuthoringPackage();
const documents = new Map(admittedDocuments(packageReceipt).map(row => [row.path, row.value]));
const corpus = documents.get(prefix + 'graphs-v2.json');
const ir = compileAuthoringIR(packageReceipt, buildAdmittedSchemaValidators(packageReceipt).validators);
if (process.argv[2] === '--freeze-authorship-v1') {
    const frozen = JSON.parse(fs.readFileSync(path.join(output, 'path-inventory-v1-frozen.json'), 'utf8'));
    const source = fs.readFileSync(path.join(root, prefix + 'graphs-v2.json'), 'utf8').replaceAll('\r\n', '\n');
    const expected = frozen.authority_refs.find(row => row.path === prefix + 'graphs-v2.json').sha256;
    if (sha(source) !== expected) throw new Error('historic_authorship_identity');
    fs.writeFileSync(path.join(output, 'path-authorship-v1-frozen.json'), source, { flag: 'wx' });
    console.log(JSON.stringify({ frozen_authorship_sha256: sha(source), historic_state_changed: false }));
} else if (process.argv[2] === '--freeze-v1') {
    const reportSource = fs.readFileSync(path.join(root, '.codex-temp/unknown-path-admission-full-20261003.json'));
    const historicalReportHash = 'sha256:9e44a8651713bbbbe4bdf4a8854276d4a8f10c91c961c0da1cf7de4303573134';
    if (sha(reportSource) !== historicalReportHash) throw new Error('historical_report_changed');
    const report = JSON.parse(reportSource);
    const rows = enumerateMutationRequirements({ packageReceipt, ir,
        graphSchema: documents.get(prefix + 'provenance-graph.schema.json'),
        materialRegistry: documents.get(corpus.material_registry.path),
        operatorRegistry: documents.get(corpus.operator_registry.path),
        evaluatorRegistry: documents.get(corpus.metric_evaluator_registry.path),
        witnessContracts: documents.get(prefix + 'evaluator-witness-contracts-v1.json') }).requirements
        .filter(row => row.family === 'predicate_path_strategy').map(({ mutation_id, family, target }) => ({ mutation_id, family, target }));
    const oldUnknown = rows.filter(row => row.target.strategy === 'unknown_path');
    const historic = new Map(report.rows.map(row => [row.mutation_id, row.target]));
    if (historic.size !== report.rows.length || historic.size !== oldUnknown.length
        || oldUnknown.some(row => canonicalValue(row.target) !== canonicalValue(historic.get(row.mutation_id))))
        throw new Error('historical_inventory_identity');
    const freeze = { format: 'financasbot.path-inventory.v1.frozen', version: 1,
        historical_state_unchanged: true, runtime_credit: 0,
        producer: 'existing_unchanged_v1_enumerator_before_v2_migration',
        producer_lf_sha256: sha(fs.readFileSync(path.join(root, 'src/next/provenance/mutationWitnesses.js'), 'utf8').replaceAll('\r\n', '\n')),
        historical_report_sha256: historicalReportHash, authority_refs: ir.authority_refs,
        requirements: rows };
    const source = JSON.stringify(freeze) + '\n';
    fs.writeFileSync(path.join(output, 'path-inventory-v1-frozen.json'), source, { flag: 'wx' });
    console.log(JSON.stringify({ frozen_v1: rows.length, source_sha256: sha(source),
        historical_unknown_ids_compared: historic.size, executed: 0, matched: 0 }));
} else {
    const { enumeratePathInventoryCandidate, materializePathMigration, FROZEN_V1_HASH } = require('../../src/next/provenance/pathMutationInventory');
    const candidate = enumeratePathInventoryCandidate({ packageReceipt, ir });
    const migration = materializePathMigration({ packageReceipt, ir,
        frozenSource: fs.readFileSync(path.join(output, 'path-inventory-v1-frozen.json'), 'utf8'),
        frozenAuthorshipSource: fs.readFileSync(path.join(output, 'path-authorship-v1-frozen.json'), 'utf8'),
        expectedFrozenHash: FROZEN_V1_HASH });
    const files = [['path-inventory-v2-candidate.json', candidate], ['path-inventory-v1-v2-migration-r2.json', migration]];
    for (const [name, value] of files) {
        const source = JSON.stringify(value) + '\n'; const target = path.join(output, name);
        if (fs.existsSync(target)) {
            if (fs.readFileSync(target, 'utf8') !== source) throw new Error('candidate_output_changed');
        } else fs.writeFileSync(target, source, { flag: 'wx' });
    }
    console.log(JSON.stringify({ addendum, candidate_requirements: candidate.requirements.length,
        semantic: candidate.requirements.filter(row => row.family === 'predicate_path_semantic').length,
        paths: candidate.requirements.filter(row => row.family === 'predicate_path_admission').length,
        references: candidate.requirements.filter(row => row.family === 'predicate_reference_admission').length,
        migration_rows: migration.rows.length, frozen_v1_sha256: migration.frozen_v1_sha256,
        activated: false, executed: 0, matched: 0 }));
}
