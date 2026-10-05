import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
import { buildTypedMetricGuestBundle, buildSchemaValidators, buildTrustedCommonJsBundle } from './buildNextProvenanceArtifacts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const base = 'docs/contracts/next/provenance-v2';
const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const lfText = file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const fail = code => { throw new Error(`metric_artifact_build_${code}`); };

// Explicit build recipe for the disposable CHILD only. This does not pretend
// to include the parent host/recorder/acceptance validators in its TCB root.
// The CJS entry and packaged SES distribution have explicit logical .js paths;
// source bytes are preserved exactly, not normalized or re-read at execution.
export function buildMetricChildCapsule() {
    const project = ['executionProfile', 'artifactLoader', 'instrumentedAccess',
        'claimBinding', 'executionRegistry', 'observationContract',
        'observationScalars', 'proofContextBinding', 'proofParentBinding', 'materialFingerprintCore', 'proofObservedValues',
        'pinnedCivilTimezone', 'civilCalendar', 'literalTypes', 'phaseCompositionProfile', 'claimMonthIsolatedProfile'];
    const recipe = [
        ['provenance/executionHostChild.js', 'src/next/provenance/executionHostChild.cjs'],
        ...project.map(name => [`provenance/${name}.js`, `src/next/provenance/${name}.js`]),
        ['kernel/canonicalValue.js', 'src/next/kernel/canonicalValue.js'],
        ['vendor/ses.js', 'node_modules/ses/dist/ses.cjs']
    ];
    const sources = recipe.map(([logical, physical]) => {
        const bytes = fs.readFileSync(path.join(root, physical));
        const source = bytes.toString('utf8');
        if (!Buffer.from(source, 'utf8').equals(bytes)) fail('capsule_utf8');
        return { path: logical, source };
    });
    const built = buildTrustedCommonJsBundle({ sources,
        entry: 'provenance/executionHostChild.js', exportName: 'run' });
    const source = `${built.source}(require);\n`;
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
        kind: 'tcb', entry: 'bootstrap.js', files: [{ path: 'bootstrap.js',
            media_type: 'text/javascript', sha256: sha256(Buffer.from(source, 'utf8')) }] });
    return Object.freeze({ stage: 'child_capsule_candidate_only', validation_tcb_complete: false,
        source, manifest, artifact_root: sha256(manifest),
        sourceHashes: Object.freeze(built.sourceHashes), nativeExternals: Object.freeze(built.nativeExternals) });
}
const groups = Object.freeze({
    metricSelection: Object.freeze({
        exportName: 'evaluateEconomicMetric',
        modes: Object.freeze({
            consumption_total: 'total', category_consumption: 'category', category_spent: 'spent',
            income_realized: 'income', consumption_by_instrument: 'instrument',
            budget_class_consumption: 'budget_class', category_budget_remaining: 'budget_remaining',
            statement_total: 'statement', safe_daily_pace: 'safe_pace'
        }),
        closure: Object.freeze(['metricSelection', 'civilCalendar', 'literalTypes', 'metricReferences'])
    }),
    metricEffects: Object.freeze({
        exportName: 'evaluateEffects',
        modes: Object.freeze(Object.fromEntries([
            'consumption_effect', 'net_consumption', 'invoice_payment_consumption_effect',
            'gross_consumption', 'refund_amount'
        ].map(id => [id, id]))),
        closure: Object.freeze(['metricEffects', 'metricSelection', 'civilCalendar', 'literalTypes', 'metricReferences'])
    }),
    metricInstallments: Object.freeze({
        exportName: 'evaluateInstallments',
        modes: Object.freeze(Object.fromEntries([
            'installments_projected', 'installments_projected_amount',
            'installments_realized', 'installments_realized_amount', 'projected_installments'
        ].map(id => [id, id]))),
        closure: Object.freeze(['metricInstallments', 'civilCalendar', 'literalTypes', 'metricReferences'])
    }),
    metricDirectReads: Object.freeze({
        exportName: 'evaluateDirectMetric',
        modes: Object.freeze(Object.fromEntries([
            'account_balance', 'balance_delta', 'bills_open', 'calendar_event_count',
            'due_bill_ids', 'due_bills_total', 'eligible_event_count',
            'invoice_payment_amount', 'invoice_payment_target_card', 'merchant_rule_ids',
            'movement_ids', 'owned_cards', 'reminder_count', 'side_effect_count',
            'similar_event_ids', 'source_coverage', 'statement_payment_correspondence'
        ].map(id => [id, id]))),
        closure: Object.freeze(['metricDirectReads', 'metricSelection', 'civilCalendar', 'literalTypes', 'metricReferences'])
    }),
    metricParents: Object.freeze({
        exportName: 'evaluateParentMetric',
        modes: Object.freeze(Object.fromEntries([
            'consumption_difference', 'income_minus_open_bills', 'ranking_winner'
        ].map(id => [id, id]))),
        closure: Object.freeze(['metricParents', 'civilCalendar', 'literalTypes'])
    })
});

// Development build evidence only. The authoring registry cannot be promoted
// to execution by these computed values; review and freeze must bind all 39.
export function buildAvailableMetricArtifacts() {
    const registryPath = path.join(root, base, 'metric-evaluator-registry-v1.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    if (registry.stage !== 'authoring' || registry.entries.length !== 39
        || registry.entries.some(entry => entry.artifact_status !== 'not_built'
            || Object.hasOwn(entry, 'evaluator_artifact_root'))) fail('stage');
    const known = new Map();
    for (const [kernel, group] of Object.entries(groups)) {
        for (const [metric, mode] of Object.entries(group.modes)) {
            if (known.has(metric)) fail('duplicate');
            known.set(metric, { kernel, group, mode });
        }
    }
    const identities = new Set(registry.entries.map(entry => entry.evaluator_id));
    if (identities.size !== 39 || identities.size !== known.size
        || [...known.keys()].some(id => !identities.has(id))) fail('inventory');
    const entries = [];
    for (const entry of registry.entries) {
        const plan = known.get(entry.evaluator_id);
        if (!plan || entry.metric !== entry.evaluator_id || entry.evaluator_version !== 1
            || entry.contract_path !== `${base}/evaluator-contracts/${entry.evaluator_id}.json`) fail('identity');
        // Authoring hashes are over repository LF bytes; the Windows working
        // copy can use CRLF. Execute the exact LF-normalized source we hash.
        const contractBytes = Buffer.from(lfText(path.join(root, entry.contract_path)), 'utf8');
        if (sha256(contractBytes) !== entry.evaluator_contract_hash) fail('contract_hash');
        const contract = JSON.parse(contractBytes.toString('utf8'));
        if (contract.stage !== 'authoring' || contract.metric !== entry.metric || contract.unit !== entry.unit
            || contract.signature?.operands !== 'resolve_roles_from_metric_evaluator_registry') fail('contract');
        const sources = plan.group.closure.map(name => ({ path: `${name}.js`,
            source: lfText(path.join(root, 'src/next/provenance', `${name}.js`)) }));
        const built = buildTypedMetricGuestBundle({ sources, entry: `${plan.kernel}.js`,
            exportName: plan.group.exportName, constants: [plan.mode],
            unit: entry.unit, kind: contract.signature.output.kind });
        const bytes = Buffer.from(built.source, 'utf8');
        const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
            kind: 'metric', entry: 'bundle.js',
            files: [{ path: 'bundle.js', media_type: 'text/javascript', sha256: sha256(bytes) }] });
        entries.push(Object.freeze({ evaluator_id: entry.evaluator_id,
            evaluator_version: 1, artifact_root: sha256(manifest),
            manifest, source: built.source, sourceHashes: built.sourceHashes }));
    }
    return Object.freeze({ stage: 'metric_build_evidence_only',
        built: Object.freeze(entries) });
}

// Candidate bytes only. Publishing this as authority requires independent
// review, freeze linkage and host admission; a computed root is not a GO.
export function buildExecutionRegistryCandidate() {
    const built = buildAvailableMetricArtifacts();
    const registry = JSON.parse(lfText(path.join(root, base, 'metric-evaluator-registry-v1.json')));
    const roots = new Map(built.built.map(item => [item.evaluator_id, item.artifact_root]));
    registry.stage = 'execution';
    for (const entry of registry.entries) {
        const root = roots.get(entry.evaluator_id);
        if (!root) fail('missing_artifact');
        entry.artifact_status = 'bound';
        entry.evaluator_artifact_root = root;
    }
    const validators = buildSchemaValidators().validators;
    if (validators.registry(registry) !== true) fail('execution_schema');
    const bytes = canonicalValue(registry);
    return Object.freeze({ stage: 'execution_registry_candidate_only',
        registry: freezeDeep(registry), bytes, registry_hash: sha256(bytes) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.length !== 3 || process.argv[2] !== '--check') fail('usage');
    const result = buildAvailableMetricArtifacts();
    console.log(JSON.stringify({ stage: result.stage, built: result.built.length }));
}
