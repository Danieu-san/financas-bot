// Structural admission control only. Never claims semantic D/P qualification.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { buildAdmittedSchemaValidators } from './buildNextProvenanceArtifacts.mjs';
import { loadLocalAuthoringPackage } from './executeNextDomainInvariantMatrix.mjs';
const require = createRequire(import.meta.url);
const { admittedDocuments } = require('../../src/next/provenance/packageContract');
const { compileAuthoringIR } = require('../../src/next/provenance/graphCompiler');
const { enumerateMutationRequirements, materializeUnknownPredicateOperator } = require('../../src/next/provenance/mutationWitnesses');
const { canonicalValue, freezeDeep } = require('../../src/next/kernel/canonicalValue');
const prefix = 'docs/contracts/next/provenance-v2/';
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

export function executeUnknownOperatorAdmissionMatrix(packageReceipt) {
    const documents = admittedDocuments(packageReceipt);
    const byPath = new Map(documents.map(row => [row.path, row.value]));
    const corpus = byPath.get(prefix + 'graphs-v2.json');
    const schema = byPath.get(prefix + 'provenance-graph.schema.json');
    const { validators, schemaHashes } = buildAdmittedSchemaValidators(packageReceipt);
    const ir = compileAuthoringIR(packageReceipt, validators);
    const inventory = enumerateMutationRequirements({ packageReceipt, ir, graphSchema: schema,
        materialRegistry: byPath.get(corpus.material_registry.path), operatorRegistry: byPath.get(corpus.operator_registry.path),
        evaluatorRegistry: byPath.get(corpus.metric_evaluator_registry.path),
        witnessContracts: byPath.get(prefix + 'evaluator-witness-contracts-v1.json') });
    const required = inventory.requirements.filter(row => row.family === 'predicate_strategy' && row.target.strategy === 'unknown_operator');
    const enumValues = schema.definitions.predicate.properties.op.enum;
    if (!validators.graphs(corpus)) throw new Error('unknown_operator_baseline');
    const counts = { expected: required.length, generated: 0, executed: 0, matched: 0 };
    const rows = [];
    for (const requirement of required) {
        const { fact_key, predicate_id } = requirement.target;
        const generated = materializeUnknownPredicateOperator({ packageReceipt, fact_key, predicate_id });
        const graphIndex = corpus.graphs.findIndex(graph => graph.fact_key === fact_key);
        const graph = corpus.graphs[graphIndex];
        const predicateIndex = graph.predicates.findIndex(predicate => predicate.id === predicate_id);
        // Expected patch and exact error path derive from the original corpus
        // and inventory, never from the generated candidate or validator error.
        const unknown = 'unknown_' + requirement.mutation_id.slice(7, 23);
        const expected = { ...corpus, graphs: corpus.graphs.map((row, index) => index !== graphIndex ? row : {
            ...graph, predicates: graph.predicates.map((row, index) => index !== predicateIndex ? row : { ...row, op: unknown }) }) };
        const expectedSource = JSON.stringify(expected);
        const expectedPath = `/graphs/${graphIndex}/predicates/${predicateIndex}/op`;
        if (generated.mutation_id !== requirement.mutation_id
            || canonicalValue(generated.target) !== canonicalValue(requirement.target)
            || generated.changes.length !== 1 || generated.changes[0].path !== prefix + 'graphs-v2.json'
            || generated.changes[0].source !== expectedSource || generated.changes[0].sha256 !== sha(expectedSource)
            || enumValues.includes(unknown) || generated.dp_execution !== false || generated.semantic_mutation_credit !== 0)
            throw new Error('unknown_operator_coordinate');
        counts.generated++;
        const candidate = JSON.parse(generated.changes[0].source);
        const rejected = validators.graphs(candidate) === false;
        const errors = validators.graphs.errors ?? [];
        counts.executed++;
        const matched = rejected && errors.length > 0 && errors.every(error => error.keyword === 'enum'
            && error.instancePath === expectedPath && canonicalValue(error.params.allowedValues) === canonicalValue(enumValues));
        if (matched) counts.matched++;
        rows.push({ mutation_id: requirement.mutation_id, target: requirement.target,
            candidate_sha256: generated.changes[0].sha256, expected_error_path: expectedPath,
            schema_enum_rejected: rejected, exact_barrier_matched: matched, matched,
            dp_execution: false, semantic_mutation_credit: 0, graph_accepted: false, financial_receipt: false });
    }
    return freezeDeep({ stage: 'unknown_operator_admission_matrix_only', global_g11: false,
        dp_execution: false, semantic_mutation_credit: 0, predicate_atom_credit: 0,
        baseline_admitted: true, authority_refs: ir.authority_refs, schema_sources: schemaHashes,
        requirement_ids_sha256: sha(required.map(row => row.mutation_id).join('\n')),
        admission_controls: counts, rows,
        admission_control_complete: Object.values(counts).every(count => count === counts.expected),
        graph_accepted: false, financial_receipt: false });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.version !== 'v22.17.0' || process.argv.length !== 3 || process.argv[2] !== '--check')
        throw new Error('pinned_node_or_usage');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const job = path.join(root, '.codex-temp/unknown-operator-admission-job-20261003.json');
    const output = path.join(root, '.codex-temp/unknown-operator-admission-full-20261003.json');
    if (fs.existsSync(job) || fs.existsSync(output)) throw new Error('duplicate_invocation');
    const measured = ['src/next', 'docs/contracts/next/provenance-v2', 'tests/fixtures/financasbot-next',
        'scripts/agent/executeUnknownOperatorAdmissionMatrix.mjs', 'scripts/agent/buildNextProvenanceArtifacts.mjs',
        'scripts/agent/executeNextDomainInvariantMatrix.mjs', 'tests/next/provenance/mutationWitnesses.cases.js'];
    function identity() {
        const rows = [];
        function visit(relative) {
            const stat = fs.lstatSync(path.join(root, relative));
            if (stat.isSymbolicLink()) throw new Error('measured_reparse_point');
            if (stat.isDirectory()) fs.readdirSync(path.join(root, relative)).sort().forEach(name => visit(path.join(relative, name)));
            else if (stat.isFile()) rows.push([relative.replaceAll('\\', '/'), sha(fs.readFileSync(path.join(root, relative)))]);
            else throw new Error('measured_not_regular');
        }
        measured.forEach(visit); return sha(JSON.stringify(rows.sort()));
    }
    const status = (stage, fields = {}) => fs.writeFileSync(job, JSON.stringify({ stage, pid: process.pid,
        time: new Date().toISOString(), global_g11: false, dp_execution: false, ...fields }) + '\n');
    const before = identity();
    try {
        const packageReceipt = loadLocalAuthoringPackage();
        const corpus = admittedDocuments(packageReceipt).find(row => row.path === prefix + 'graphs-v2.json').value;
        if (corpus.graphs.length !== 76 || new Set(corpus.graphs.map(row => row.fact_key)).size !== 76)
            throw new Error('corpus_identity');
        const expected = corpus.graphs.reduce((count, graph) => count + graph.predicates.length, 0);
        status('unknown_operator_admission_running', { measured_sources_sha256: before,
            requested_graphs: 76, scoped_expected: expected });
        const result = executeUnknownOperatorAdmissionMatrix(packageReceipt);
        const unchanged = identity() === before;
        const unique = new Set(result.rows.map(row => row.mutation_id)).size === result.rows.length;
        const valid = unchanged && unique && result.admission_controls.expected === expected
            && result.rows.length === result.admission_controls.expected
            && result.admission_control_complete;
        fs.writeFileSync(output, JSON.stringify({ ...result, measured_sources_sha256: before,
            measured_sources_unchanged: unchanged, valid, independent_code_audit: 'pending' }) + '\n');
        status(valid ? 'unknown_operator_admission_completed_only' : 'blocked', { exit_code: valid ? 0 : 1,
            admission_controls: result.admission_controls, measured_sources_unchanged: unchanged,
            report_sha256: sha(fs.readFileSync(output)), valid, independent_code_audit: 'pending' });
        console.log(JSON.stringify({ admission_controls: result.admission_controls, valid,
            dp_execution: false, semantic_mutation_credit: 0, global_g11: false }));
        if (!valid) process.exitCode = 1;
    } catch (error) {
        status('blocked', { exit_code: 1, error: error.message, measured_sources_unchanged: identity() === before });
        console.error(error.message); process.exitCode = 1;
    }
}
