// Scoped native type-pass controls, not whole-compiler or semantic D/P credit.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadLocalAuthoringPackage } from './executeNextDomainInvariantMatrix.mjs';
import { buildAdmittedSchemaValidators } from './buildNextProvenanceArtifacts.mjs';
const require = createRequire(import.meta.url);
const { admittedDocuments } = require('../../src/next/provenance/packageContract');
const { compileAuthoringIR } = require('../../src/next/provenance/graphCompiler');
const { compilePredicateTypes, readPredicateTypeDiagnostic } = require('../../src/next/provenance/predicateTypes');
const { validateTemplateReferences, readTemplateReferenceDiagnostic } = require('../../src/next/provenance/templateReferences');
const { enumerateMutationRequirements, materializeUnknownPredicatePath } = require('../../src/next/provenance/mutationWitnesses');
const { canonicalValue, freezeDeep } = require('../../src/next/kernel/canonicalValue');
const prefix = 'docs/contracts/next/provenance-v2/';
const hash = value => 'sha256:' + createHash('sha256').update(value).digest('hex');

export function executeUnknownPathAdmissionMatrix(packageReceipt, scopeClass = 'paths') {
    if (!['paths', 'references', 'template_bindings'].includes(scopeClass)) throw new Error('unknown_path_scope');
    const docs = new Map(admittedDocuments(packageReceipt).map(row => [row.path, row.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const { validators } = buildAdmittedSchemaValidators(packageReceipt);
    const ir = compileAuthoringIR(packageReceipt, validators);
    const input = { packageReceipt, ir, graphSchema: docs.get(prefix + 'provenance-graph.schema.json'),
        materialRegistry: docs.get(corpus.material_registry.path),
        operatorRegistry: docs.get(corpus.operator_registry.path),
        evaluatorRegistry: docs.get(corpus.metric_evaluator_registry.path),
        witnessContracts: docs.get(prefix + 'evaluator-witness-contracts-v1.json') };
    const required = enumerateMutationRequirements(input).requirements.filter(row =>
        row.family === 'predicate_path_strategy' && row.target.strategy === 'unknown_path');
    const sourceIds = new Map();
    for (const graph of corpus.graphs) for (const predicate of graph.predicates)
        for (let operand_index = 0; operand_index < predicate.args.length; operand_index++) {
            const target = { fact_key: graph.fact_key, predicate_id: predicate.id, operand_index, strategy: 'unknown_path' };
            const id = hash(canonicalValue({ domain: 'financasbot.mutation-requirement.v1', family: 'predicate_path_strategy', target }));
            if (sourceIds.has(id)) throw new Error('unknown_path_source_duplicate');
            sourceIds.set(id, target);
        }
    if (sourceIds.size !== required.length || required.some(row => !sourceIds.has(row.mutation_id)
        || canonicalValue(sourceIds.get(row.mutation_id)) !== canonicalValue(row.target)))
        throw new Error('unknown_path_inventory');
    const inventoryIdsHash = hash([...sourceIds.keys()].sort().join('\n'));
    const context = { claims: docs.get(corpus.claim_contract.path).claims,
        snapshots: docs.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: input.materialRegistry, operatorRegistry: input.operatorRegistry,
        claimSchema: docs.get(prefix + 'claim-contract.schema.json') };
    const graphs = new Map(corpus.graphs.map(graph => [graph.fact_key, graph]));
    const baseline = compilePredicateTypes({ ...context, graphs: corpus.graphs });
    const templateContext = { templates: docs.get(prefix + 'predicate-templates-v1.json'),
        operators: input.operatorRegistry.operators, materialRegistry: input.materialRegistry,
        claims: context.claims };
    if (scopeClass === 'template_bindings') validateTemplateReferences({ ...templateContext, graphs: corpus.graphs });
    const ledger = { expected: required.length, generated: 0, executed: 0, matched: 0 };
    const scope = { expected: 0, generated: 0, executed: 0, matched: 0 };
    const rows = [];
    for (const requirement of required) {
        const { fact_key, predicate_id, operand_index } = requirement.target;
        const original = graphs.get(fact_key);
        const predicate = original.predicates.find(row => row.id === predicate_id);
        const arg = predicate.args[operand_index];
        const form = ['field', 'claim', 'presence', 'selector'].find(key => Object.hasOwn(arg, key));
        const reference = ['node', 'edge', 'set', 'period_ref', 'period_bound'].find(key => Object.hasOwn(arg, key));
        const templateBinding = arg.template && Object.keys(arg.bindings).filter(name => arg.bindings[name].selector).sort()[0];
        const location = form ? [form, 'segments'] : arg.ref_set?.field ? ['ref_set', 'field', 'segments']
            : reference === 'period_bound' ? ['period_bound', 'period'] : reference ? [reference]
            : templateBinding ? ['bindings', templateBinding, 'selector', 'segments'] : null;
        const coordinateClass = reference ? 'references' : templateBinding ? 'template_bindings' : 'paths';
        if (!location || scopeClass !== coordinateClass) {
            rows.push({ mutation_id: requirement.mutation_id, target: requirement.target,
                status: 'UNSATISFIED_MUTATION_WITNESS', reason: location ? 'outside_requested_scope' : 'operand_has_no_supported_path',
                operand_form: Object.keys(arg).join('+'), dp_execution: false, semantic_mutation_credit: 0 });
            continue;
        }
        scope.expected++;
        const generated = materializeUnknownPredicatePath({ packageReceipt, fact_key, predicate_id, operand_index });
        const expected = structuredClone(original);
        let before = arg; for (const key of location) before = before[key];
        const unknown = 'unknown_' + requirement.mutation_id.slice(7, 23);
        const after = reference ? unknown : [...before.slice(0, -1), unknown];
        let patch = expected.predicates.find(row => row.id === predicate_id).args[operand_index];
        for (const key of location.slice(0, -1)) patch = patch[key];
        patch[location.at(-1)] = after;
        if (generated.mutation_id !== requirement.mutation_id
            || canonicalValue(generated.target) !== canonicalValue(requirement.target)
            || JSON.stringify(generated.graph) !== JSON.stringify(expected)
            || generated.dp_execution !== false || generated.semantic_mutation_credit !== 0)
            throw new Error('unknown_path_coordinate');
        ledger.generated++; scope.generated++;
        const templateHint = predicate.args.some(arg => arg.template && Object.values(arg.bindings).some(binding => binding.selector));
        const code = reference === 'node' ? 'node_missing' : reference === 'edge' ? 'edge_missing'
            : reference === 'set' ? ['set_eq', 'set_subset'].includes(predicate.op) || templateHint ? 'set_missing' : 'set_kind_unresolved'
            : reference ? 'window_missing' : form === 'claim' ? 'claim_path' : 'field_material';
        const expectedDiagnostic = freezeDeep(templateBinding
            ? { checker: 'template_references', code: 'binding_field', fact_key, predicate_id, operand_index, binding_name: templateBinding }
            : { checker: 'predicate_types', code, fact_key, predicate_id, operand_index });
        const schemaValid = validators.graphs({ ...corpus, graphs: [generated.graph] }) === true;
        let diagnostic = null; let rejected = false;
        if (schemaValid) {
            try {
                if (templateBinding) validateTemplateReferences({ ...templateContext, graphs: [generated.graph] });
                else compilePredicateTypes({ ...context, graphs: [generated.graph] });
            }
            catch (error) { rejected = true; diagnostic = templateBinding
                ? readTemplateReferenceDiagnostic(error) : readPredicateTypeDiagnostic(error); }
        }
        ledger.executed++; scope.executed++;
        const matched = schemaValid && rejected && diagnostic !== null
            && canonicalValue(diagnostic) === canonicalValue(expectedDiagnostic);
        if (matched) { ledger.matched++; scope.matched++; }
        rows.push({ mutation_id: requirement.mutation_id, target: requirement.target,
            status: matched ? 'type_admission_control_matched' : 'UNSATISFIED_MUTATION_WITNESS',
            schema_valid: schemaValid, native_rejected: rejected, diagnostic,
            graph_sha256: hash(JSON.stringify(generated.graph)), matched,
            dp_execution: false, semantic_mutation_credit: 0 });
    }
    return freezeDeep({ stage: 'unknown_path_scoped_type_admission_only', scope_class: scopeClass, baseline_graphs: baseline.graphs,
        source_inventory_ids_sha256: inventoryIdsHash,
        inventory: ledger, scoped_admission_controls: scope, rows,
        unique_ids: new Set(rows.map(row => row.mutation_id)).size,
        unsatisfied: rows.filter(row => row.status === 'UNSATISFIED_MUTATION_WITNESS').length,
        scope_complete: Object.values(scope).every(value => value === scope.expected),
        global_g11: false, whole_compiler_mutant_executed: false, dp_execution: false,
        semantic_mutation_credit: 0, financial_receipt: false });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.version !== 'v22.17.0' || process.argv[2] !== '--check'
        || !(process.argv.length === 3 || process.argv.length === 4
            && ['--references', '--references-template', '--template-bindings'].includes(process.argv[3])))
        throw new Error('pinned_node_or_usage');
    const scopeClass = process.argv[3] === '--template-bindings' ? 'template_bindings'
        : process.argv[3]?.startsWith('--references') ? 'references' : 'paths';
    const suffix = process.argv[3] === '--template-bindings' ? '-template-bindings'
        : process.argv[3] === '--references-template' ? '-references-template'
        : scopeClass === 'references' ? '-references' : '';
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const job = path.join(root, `.codex-temp/unknown-path-admission${suffix}-job-20261003.json`);
    const report = path.join(root, `.codex-temp/unknown-path-admission${suffix}-full-20261003.json`);
    if (fs.existsSync(job) || fs.existsSync(report)) throw new Error('duplicate_invocation');
    const measured = ['src/next', 'docs/contracts/next/provenance-v2', 'tests/fixtures/financasbot-next',
        'scripts/agent/executeUnknownPathAdmissionMatrix.mjs', 'scripts/agent/buildNextProvenanceArtifacts.mjs',
        'scripts/agent/executeNextDomainInvariantMatrix.mjs', 'tests/next/provenance/unknownPathAdmission.cases.js'];
    const identity = () => {
        const rows = [];
        const visit = relative => {
            const stat = fs.lstatSync(path.join(root, relative));
            if (stat.isSymbolicLink()) throw new Error('measured_reparse_point');
            if (stat.isDirectory()) fs.readdirSync(path.join(root, relative)).sort().forEach(name => visit(path.join(relative, name)));
            else if (stat.isFile()) rows.push([relative.replaceAll('\\', '/'), hash(fs.readFileSync(path.join(root, relative)))]);
            else throw new Error('measured_not_regular');
        };
        measured.forEach(visit); return hash(JSON.stringify(rows.sort()));
    };
    const status = (stage, fields = {}) => fs.writeFileSync(job, JSON.stringify({ stage, pid: process.pid,
        time: new Date().toISOString(), global_g11: false, dp_execution: false, ...fields }) + '\n');
    const before = identity();
    status('unknown_path_admission_running', { measured_sources_sha256: before, scope_class: scopeClass });
    try {
        const result = executeUnknownPathAdmissionMatrix(loadLocalAuthoringPackage(), scopeClass);
        const unchanged = identity() === before;
        const accounting = result.rows.length === result.inventory.expected && result.unique_ids === result.inventory.expected;
        const scope_valid = unchanged && accounting && result.scope_complete;
        fs.writeFileSync(report, JSON.stringify({ ...result, measured_sources_sha256: before,
            measured_sources_unchanged: unchanged, accounting_complete: accounting, scope_valid,
            valid: false, independent_code_audit: 'pending' }) + '\n');
        // Deliberately non-green while the full required family remains pending.
        status('completed_with_pending', { exit_code: 1, report_sha256: hash(fs.readFileSync(report)),
            inventory: result.inventory, scoped_admission_controls: result.scoped_admission_controls,
            unsatisfied: result.unsatisfied, measured_sources_unchanged: unchanged,
            accounting_complete: accounting, scope_valid, valid: false });
        console.log(JSON.stringify({ inventory: result.inventory, scope: result.scoped_admission_controls,
            unsatisfied: result.unsatisfied, scope_valid, valid: false }));
        process.exitCode = 1;
    } catch (error) {
        status('blocked', { exit_code: 1, error: error.message, measured_sources_unchanged: identity() === before });
        console.error(error.message); process.exitCode = 1;
    }
}
