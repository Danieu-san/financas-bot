import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdmittedSchemaValidators } from './buildNextProvenanceArtifacts.mjs';

const require = createRequire(import.meta.url);
const { admitPackage, admittedDocuments } = require('../../src/next/provenance/packageContract');
const { compileAuthoringIR } = require('../../src/next/provenance/graphCompiler');
const { enumerateMutationRequirements, materializeSingletonDomainCandidate } = require('../../src/next/provenance/mutationWitnesses');
const { canonicalValue, freezeDeep } = require('../../src/next/kernel/canonicalValue');
const prefix = 'docs/contracts/next/provenance-v2/';
const sha = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

// Local HARNESS evidence, not a guest receipt or a G11 acceptance authority.
// The sole input is an opaque package. IR, inventory, candidates, validators
// and counters are produced here; callers cannot submit credited outcomes.
export function executeSingletonDomainMatrix(packageReceipt) {
    const documents = admittedDocuments(packageReceipt);
    const byPath = new Map(documents.map(row => [row.path, row.value]));
    const { validators, schemaHashes } = buildAdmittedSchemaValidators(packageReceipt);
    const ir = compileAuthoringIR(packageReceipt, validators);
    const corpus = byPath.get(prefix + 'graphs-v2.json');
    const inventory = enumerateMutationRequirements({ packageReceipt, ir,
        graphSchema: byPath.get(prefix + 'provenance-graph.schema.json'),
        materialRegistry: byPath.get(corpus.material_registry.path),
        operatorRegistry: byPath.get(corpus.operator_registry.path),
        evaluatorRegistry: byPath.get(corpus.metric_evaluator_registry.path),
        witnessContracts: byPath.get(prefix + 'evaluator-witness-contracts-v1.json') });
    const required = inventory.requirements.filter(row => row.family === 'singleton_domain_invariant');
    const counts = { expected: required.length, generated: 0, executed: 0, matched: 0 };
    const rows = [];
    for (const requirement of required) {
        const { fact_key, alias, field } = requirement.target;
        const generated = materializeSingletonDomainCandidate({ packageReceipt, fact_key, alias, field });
        if (generated.mutation_id !== requirement.mutation_id
            || canonicalValue(generated.target) !== canonicalValue(requirement.target)) {
            throw new Error('domain_matrix_coordinate_mismatch');
        }
        counts.generated++;
        const baseline_accepted = validators.snapshot(generated.baseline) === true;
        const negative_rejected = validators.snapshot(generated.candidate) === false;
        const errors = validators.snapshot.errors || [];
        const domain_error_observed = errors.some(error => error.instancePath === `/payload/${field}`
            && (generated.target.descriptor.type === 'enum'
                ? error.keyword === 'enum' && canonicalValue(error.params.allowedValues) === canonicalValue(generated.domain)
                : error.keyword === 'maximum' && error.params.limit === generated.domain[0]));
        counts.executed++;
        const matched = baseline_accepted && negative_rejected && domain_error_observed;
        if (matched) counts.matched++;
        rows.push({ mutation_id: requirement.mutation_id, fact_key, alias, field,
            baseline_sha256: sha(canonicalValue(generated.baseline)),
            negative_sha256: sha(canonicalValue(generated.candidate)),
            baseline_accepted, negative_rejected, domain_error_observed, matched });
    }
    return freezeDeep({ stage: 'domain_admission_matrix_executed_only',
        global_g11: false, dp_execution: false, authority_refs: ir.authority_refs, schema_sources: schemaHashes,
        requirement_ids_sha256: sha(inventory.requirements.map(row => row.mutation_id).join('\n')),
        domain_partition: inventory.domain_partition, domain_invariants: counts,
        semantic_mutations: { expected: inventory.requirements.length - required.length,
            generated: 0, executed: 0, matched: 0 }, rows });
}

// Fixed synthetic authoring inputs only. Self-measured local admission binds
// this execution's contents; it is not independent review or release approval.
export function loadLocalAuthoringPackage() {
    const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
    const fixturePaths = new Set(['golden-conversation-set-v1', 'golden-fact-contracts-v1', 'golden-financial-fixture-v1']
        .map(name => `tests/fixtures/financasbot-next/${name}.json`));
    const files = new Map();
    const add = relative => {
        if (typeof relative !== 'string' || !/^[A-Za-z0-9_.\/-]+\.json$/.test(relative)
            || relative.split('/').some(part => !part || part === '.' || part === '..')
            || !relative.startsWith(prefix) && !fixturePaths.has(relative)) throw new Error('domain_matrix_local_path');
        if (!files.has(relative)) {
            const actual = fs.realpathSync(path.join(root, relative));
            const resolved = path.relative(root, actual);
            if (path.isAbsolute(resolved) || resolved === '..' || resolved.startsWith(`..${path.sep}`)
                || resolved.split(path.sep).join('/') !== relative
                || !fs.statSync(actual).isFile()) throw new Error('domain_matrix_local_containment');
            const bytes = Buffer.from(fs.readFileSync(actual, 'utf8').replaceAll('\r\n', '\n'));
            files.set(relative, { path: relative, bytes });
        }
        return JSON.parse(files.get(relative).bytes);
    };
    const corpus = add(prefix + 'graphs-v2.json');
    for (const file of ['predicate-templates-v1.json', 'phase-composition-profile-v1.json', 'claim-contract.schema.json', 'evidence-snapshot.schema.json',
        'provenance-graph.schema.json', 'evaluator-contract.schema.json', 'metric-evaluator-registry.schema.json',
        'evaluator-witness-contracts.schema.json', 'evaluator-witness-contracts-v1.json']) add(prefix + file);
    for (const key of ['claim_contract', 'snapshot_manifest', 'material_registry', 'operator_registry', 'metric_evaluator_registry']) add(corpus[key].path);
    for (const source of add(corpus.snapshot_manifest.path).sources) add(source.path);
    for (const row of add(corpus.metric_evaluator_registry.path).entries) add(row.contract_path);
    for (const graph of corpus.graphs) for (const source of graph.authoring_sources) add(source.path);
    const entries = [...files.values()];
    return admitPackage({ entries, authority: entries.map(row => ({ path: row.path, sha256: sha(row.bytes) })) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.length !== 3 || process.argv[2] !== '--check') throw new Error('usage: executeNextDomainInvariantMatrix.mjs --check');
    const result = executeSingletonDomainMatrix(loadLocalAuthoringPackage());
    const counters = Object.values(result.domain_invariants);
    const class_complete = counters.every(value => value === counters[0]);
    console.log(JSON.stringify({ stage: result.stage, scope: 'singleton_domain_invariants_only',
        normalization: 'CRLF_to_LF', authority_refs_sha256: sha(canonicalValue(result.authority_refs)),
        requirement_ids_sha256: result.requirement_ids_sha256, domain_partition: result.domain_partition,
        domain_invariants: result.domain_invariants, semantic_mutations: result.semantic_mutations,
        class_complete, global_g11: false, dp_execution: false }));
    if (!class_complete) process.exitCode = 1;
}
