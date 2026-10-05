// HARNESS: schema + native admission controls, never semantic D/P or activation.
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
const { enumeratePathInventoryCandidate, materializePathAdmissionCandidate, readPathAdmissionCandidate,
    verifyMaterializedPathMigration, FROZEN_V1_HASH } = require('../../src/next/provenance/pathMutationInventory');
const { canonicalValue, freezeDeep } = require('../../src/next/kernel/canonicalValue');
const prefix = 'docs/contracts/next/provenance-v2/';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const equal = (a, b) => canonicalValue(a) === canonicalValue(b);

export function createPathAdmissionValidation(packageReceipt) {
    const documents = new Map(admittedDocuments(packageReceipt).map(row => [row.path, row.value]));
    const corpus = documents.get(prefix + 'graphs-v2.json');
    const graphs = new Map(corpus.graphs.map(row => [row.fact_key, row]));
    const context = { claims: documents.get(corpus.claim_contract.path).claims,
        snapshots: documents.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: documents.get(corpus.material_registry.path),
        operatorRegistry: documents.get(corpus.operator_registry.path),
        claimSchema: documents.get(prefix + 'claim-contract.schema.json') };
    const templateContext = { templates: documents.get(prefix + 'predicate-templates-v1.json'),
        operators: context.operatorRegistry.operators, materialRegistry: context.materialRegistry, claims: context.claims };
    const { validators } = buildAdmittedSchemaValidators(packageReceipt);
    compilePredicateTypes({ ...context, graphs: corpus.graphs });
    validateTemplateReferences({ ...templateContext, graphs: corpus.graphs });
    // Expected codes/coordinates are authored rules sealed before any negative.
    function expectation(target) {
        const graph = graphs.get(target.fact_key);
        const predicate = graph.predicates.find(row => row.id === target.predicate_id);
        const operand_index = target.site_path[1];
        const bindingAt = target.site_path.indexOf('bindings');
        const binding_name = bindingAt >= 0 ? target.site_path[bindingAt + 1] : null;
        const template = target.namespace === 'predicate_templates' || binding_name !== null;
        const templateHint = predicate.args.some(arg => arg.template && Object.values(arg.bindings).some(value => value.selector));
        let code;
        if (target.namespace === 'predicate_templates') code = 'missing';
        else if (binding_name !== null) code = target.strategy === 'unknown_path'
            ? target.definition === 'claimPath' ? 'binding_unresolved' : 'binding_field'
            : target.namespace === 'nodes' ? 'binding_node' : target.namespace === 'windows' ? 'binding_period' : 'binding_unresolved';
        else if (target.strategy === 'unknown_path') code = target.definition === 'claimPath' ? 'claim_path' : 'field_material';
        else if (target.namespace === 'nodes') code = 'node_missing';
        else if (target.namespace === 'edges') code = 'edge_missing';
        else if (target.namespace === 'windows') code = 'window_missing';
        else if (target.namespace === 'sets') code = ['set_eq', 'set_subset'].includes(predicate.op) || templateHint ? 'set_missing' : 'set_kind_unresolved';
        else throw new Error('path_admission_v2_namespace');
        return freezeDeep({ checker: template ? 'template_references' : 'predicate_types', code,
            fact_key: target.fact_key, predicate_id: target.predicate_id, operand_index,
            ...(binding_name !== null ? { binding_name } : {}) });
    }
    return generated => {
        const privateRecord = readPathAdmissionCandidate(generated);
        if (!privateRecord || !equal(privateRecord.target, generated.target)
            || privateRecord.graph_sha256 !== sha(JSON.stringify(generated.graph))) throw new Error('path_admission_v2_candidate_authority');
        const target = privateRecord.target; const expectedDiagnostic = expectation(target);
        const original = graphs.get(target.fact_key); const expected = structuredClone(original);
        let slot = expected.predicates.find(row => row.id === target.predicate_id);
        for (const token of target.site_path.slice(0, -1)) slot = slot[token];
        const leaf = target.site_path.at(-1); const before = slot[leaf];
        const unknown = 'unknown_' + generated.mutation_id.slice(7, 23);
        slot[leaf] = target.strategy === 'unknown_path' ? [...before.slice(0, -1), unknown] : unknown;
        if (!equal(expected, generated.graph) || generated.baseline_graph_sha256 !== sha(JSON.stringify(original))
            || generated.dp_execution !== false || generated.semantic_mutation_credit !== 0) throw new Error('path_admission_v2_single_change');
        const schemaValid = validators.graphs({ ...corpus, graphs: [generated.graph] }) === true;
        let diagnostic = null; let rejected = false;
        if (schemaValid) {
            try {
                if (expectedDiagnostic.checker === 'template_references') validateTemplateReferences({ ...templateContext, graphs: [generated.graph] });
                else compilePredicateTypes({ ...context, graphs: [generated.graph] });
            } catch (error) {
                rejected = true;
                diagnostic = expectedDiagnostic.checker === 'template_references'
                    ? readTemplateReferenceDiagnostic(error) : readPredicateTypeDiagnostic(error);
                if (diagnostic && (expectedDiagnostic.checker === 'template_references'
                    ? readTemplateReferenceDiagnostic(new Error(error.message)) : readPredicateTypeDiagnostic(new Error(error.message))) !== null)
                    throw new Error('path_admission_v2_forged_diagnostic');
            }
        }
        const restored = structuredClone(generated.graph);
        let restoreSlot = restored.predicates.find(row => row.id === target.predicate_id);
        for (const token of target.site_path.slice(0, -1)) restoreSlot = restoreSlot[token];
        restoreSlot[leaf] = structuredClone(before);
        let restoreAdmitted = false;
        if (equal(restored, original) && validators.graphs({ ...corpus, graphs: [restored] }) === true) {
            try {
                if (expectedDiagnostic.checker === 'template_references') validateTemplateReferences({ ...templateContext, graphs: [restored] });
                else compilePredicateTypes({ ...context, graphs: [restored] });
                restoreAdmitted = true;
            } catch { /* Positive restore failure never receives negative credit. */ }
        }
        const matched = schemaValid && rejected && restoreAdmitted && diagnostic !== null && equal(diagnostic, expectedDiagnostic);
        return freezeDeep({ mutation_id: generated.mutation_id, target,
            status: matched ? 'native_admission_control_matched' : 'UNSATISFIED_MUTATION_WITNESS',
            schema_valid: schemaValid, native_rejected: rejected, restore_admitted: restoreAdmitted,
            expected_diagnostic: expectedDiagnostic, diagnostic,
            graph_sha256: generated.graph_sha256, baseline_graph_sha256: generated.baseline_graph_sha256,
            matched, dp_execution: false, semantic_mutation_credit: 0, whole_compiler_mutant_executed: false,
            financial_receipt: false });
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.version !== 'v22.17.0' || process.argv.length !== 3 || process.argv[2] !== '--check') throw new Error('pinned_node_or_usage');
    const temp = path.join(root, '.codex-temp');
    const jobPath = path.join(temp, 'path-inventory-v2-admission-job-20261003.json');
    const reportPath = path.join(temp, 'path-inventory-v2-admission-full-20261003.json');
    if (fs.existsSync(jobPath) || fs.existsSync(reportPath)) throw new Error('preserve_existing_job_no_automatic_retry');
    const measured = ['src/next/provenance/pathMutationInventory.js', 'src/next/provenance/mutationWitnesses.js',
        'src/next/provenance/predicateTypes.js', 'src/next/provenance/templateReferences.js',
        'src/next/provenance/authoringIR.js', 'src/next/provenance/graphCompiler.js',
        'scripts/agent/executePathAdmissionV2.mjs', 'scripts/agent/buildNextProvenanceArtifacts.mjs',
        'docs/audit-evidence/n02g-causal-authoring-profile/path-inventory-v1-frozen.json',
        'docs/audit-evidence/n02g-causal-authoring-profile/path-authorship-v1-frozen.json',
        'docs/audit-evidence/n02g-causal-authoring-profile/path-inventory-v2-candidate.json',
        'docs/audit-evidence/n02g-causal-authoring-profile/path-inventory-v1-v2-migration-r2.json'];
    const packageReceipt = loadLocalAuthoringPackage();
    for (const row of admittedDocuments(packageReceipt)) measured.push(row.path);
    const sourceHash = () => sha(canonicalValue([...new Set(measured)].sort().map(name => ({ path: name,
        sha256: sha(fs.readFileSync(path.join(root, name), 'utf8').replaceAll('\r\n', '\n')) }))));
    const before = sourceHash(); const started_at = new Date().toISOString();
    const status = (state, fields = {}) => fs.writeFileSync(jobPath, JSON.stringify({ state, pid: process.pid,
        node: process.version, started_at, measured_sources_sha256: before, report: reportPath, ...fields }, null, 2) + '\n');
    status('path_inventory_v2_admission_running');
    try {
        const ir = compileAuthoringIR(packageReceipt, buildAdmittedSchemaValidators(packageReceipt).validators);
        const candidate = enumeratePathInventoryCandidate({ packageReceipt, ir });
        const evidence = path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile');
        const migration = verifyMaterializedPathMigration({ packageReceipt, ir, expectedFrozenHash: FROZEN_V1_HASH,
            frozenSource: fs.readFileSync(path.join(evidence, 'path-inventory-v1-frozen.json'), 'utf8'),
            frozenAuthorshipSource: fs.readFileSync(path.join(evidence, 'path-authorship-v1-frozen.json'), 'utf8'),
            migrationSource: fs.readFileSync(path.join(evidence, 'path-inventory-v1-v2-migration-r2.json'), 'utf8') });
        if (!equal(candidate, JSON.parse(fs.readFileSync(path.join(evidence, 'path-inventory-v2-candidate.json'), 'utf8'))))
            throw new Error('persisted_inventory_changed');
        const qualify = createPathAdmissionValidation(packageReceipt);
        const ledgers = Object.fromEntries(['predicate_path_admission', 'predicate_reference_admission'].map(family => [family,
            { expected: candidate.requirements.filter(row => row.family === family).length, generated: 0, executed: 0, matched: 0 }]));
        const rows = [];
        for (const requirement of candidate.requirements.filter(row => row.family !== 'predicate_path_semantic')) {
            const ledger = ledgers[requirement.family];
            const generated = materializePathAdmissionCandidate({ inventoryCandidate: candidate, mutation_id: requirement.mutation_id });
            ledger.generated++; const row = qualify(generated); ledger.executed++; if (row.matched) ledger.matched++;
            rows.push({ ...row, invocation_id: rows.length + 1 });
        }
        const unchanged = sourceHash() === before;
        const unique = new Set(rows.map(row => row.mutation_id)).size;
        const scope_valid = unchanged && unique === rows.length && Object.values(ledgers).every(ledger =>
            Object.values(ledger).every(value => value === ledger.expected));
        const report = { stage: 'path_inventory_v2_native_admission_candidate_only', addendum: candidate.addendum,
            baseline_graphs: ir.graphs.length, ledgers, rows, unique_ids: unique, unique_invocations: rows.length,
            migration_verified: migration.verified, accounting_complete: unique === rows.length,
            measured_sources_unchanged: unchanged, scope_valid,
            semantic: { expected: candidate.requirements.filter(row => row.family === 'predicate_path_semantic').length,
                generated: 0, executed: 0, matched: 0 },
            unsatisfied: rows.filter(row => !row.matched).length,
            activated: false, valid: false, global_g11: false, dp_execution: false,
            semantic_mutation_credit: 0, whole_compiler_mutant_executed: false, financial_receipt: false };
        const source = JSON.stringify(report) + '\n'; fs.writeFileSync(reportPath, source, { flag: 'wx' });
        status('completed_with_pending', { completed_at: new Date().toISOString(), exit_code: 1,
            report_sha256: sha(source), measured_sources_unchanged: unchanged, scope_valid, ledgers,
            accounting_complete: report.accounting_complete, unsatisfied: report.unsatisfied });
        console.log(JSON.stringify({ scope_valid, ledgers, unsatisfied: report.unsatisfied, semantic: report.semantic,
            report_sha256: sha(source), activated: false, valid: false }));
        process.exitCode = 1;
    } catch (error) {
        status('blocked', { completed_at: new Date().toISOString(), exit_code: 1, error: error.message,
            measured_sources_unchanged: sourceHash() === before }); throw error;
    }
}
