'use strict';
// Documentary construction only; does not import or execute compiler/WIP/D/P.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const base = '9f232674602e3b528cfd07e61b65537c01a9e784';
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const canon = value => {
    if (Array.isArray(value)) return '[' + value.map(canon).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
        .map(key => JSON.stringify(key) + ':' + canon(value[key])).join(',') + '}';
    return JSON.stringify(value);
};
const gitFile = fs.readFileSync(path.join(root, '.git'), 'utf8').trim();
assert.ok(gitFile.startsWith('gitdir: '));
const gitDir = path.resolve(root, gitFile.slice(8));
const common = path.resolve(gitDir, fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim());
const safe = ['-c', 'safe.directory=' + root, '-c', 'safe.directory=' + path.dirname(common)];
const sources = [];
const source = file => {
    const text = execFileSync('git', [...safe, 'show', base + ':' + file],
        { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    sources.push({ path: file, sha256: sha(text) });
    return text;
};
const prefix = 'docs/contracts/next/provenance-v2/';
const corpus = JSON.parse(source(prefix + 'graphs-v2.json'));
const claims = JSON.parse(source(corpus.claim_contract.path));
const schema = JSON.parse(source(prefix + 'claim-contract.schema.json'));
const types = source('src/next/provenance/predicateTypes.js');
const requirements = source('src/next/provenance/claimRequirements.js');
const context = source('src/next/provenance/claimContext.js');
const operatorRegistry = JSON.parse(source(prefix + 'operator-registry-v2.json'));
const factKey = 'M-01#1#1';
const graph = corpus.graphs.find(row => row.fact_key === factKey);
const claim = claims.claims.find(row => row.fact_key === factKey);
const originalClaimHash = sha(canon(claim));
const predicate = graph.predicates.find(row => row.id === 'binding_1');
assert.equal(predicate.op, 'period_eq');
assert.equal(predicate.atom, 'period');
assert.equal(predicate.obligation, 'period');
assert.equal(claim.period.kind, 'month');
assert.deepEqual(predicate.args, [{ claim: { segments: ['period'] } }, { period_literal: claim.period }]);
assert.equal(schema.definitions.claim.additionalProperties, false);
assert.equal(Object.hasOwn(schema.definitions.claim.properties, 'qualification'), false);
assert.ok(types.includes("if (path === 'period') type = { form: claim.period.kind === 'range' ? 'range' : 'period', periodKind: claim.period.kind }"));
assert.ok(requirements.includes("&& predicate.args.some(arg => claimAt(arg, ['period']))"));
assert.ok(requirements.includes("if (!periods.length) fail('missing')"));
assert.ok(context.includes('const FIELDS = Object.freeze('));
const fieldMatch = context.match(/const FIELDS = Object.freeze\(\[([\s\S]*?)\]\);/);
assert.ok(fieldMatch);
const contextFields = [...fieldMatch[1].matchAll(/'([a-z_]+)'/g)].map(match => match[1]);
assert.equal(contextFields.includes('qualification'), false);
const coreContext = Object.fromEntries(contextFields.filter(key => Object.hasOwn(claim, key))
    .map(key => [key, claim[key]]));
function alternateMonth(value) {
    assert.match(value, /^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/);
    const year = Number(value.slice(0, 4)), month = Number(value.slice(5));
    const next = year === 9999 && month === 12 ? [9999, 11]
        : month === 12 ? [year + 1, 1] : [year, month + 1];
    return String(next[0]).padStart(4, '0') + '-' + String(next[1]).padStart(2, '0');
}
let probes = 0;
for (let year = 1; year <= 9999; year++) for (let month = 1; month <= 12; month++) {
    const original = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0');
    const alternative = alternateMonth(original);
    assert.notEqual(original, alternative);
    assert.match(alternative, /^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])$/);
    probes++;
}
for (const invalid of ['0000-01', '10000-01', '2042-00', '2042-13', '42-06', '2042-6', '2042-06Z']) {
    assert.throws(() => alternateMonth(invalid));
}
const sidecar = { qualification: { alternative_period: {
    kind: 'month', value: alternateMonth(claim.period.value)
} } };
const view = { ...coreContext, ...sidecar };
const { qualification, ...projectedCore } = view;
assert.deepEqual(projectedCore, coreContext);
assert.equal(sha(canon(claim)), originalClaimHash);
const mutant = structuredClone(predicate);
mutant.args[0].claim.segments = ['qualification', 'alternative_period'];
const restored = structuredClone(mutant);
restored.args[0].claim.segments = ['period'];
assert.deepEqual(restored, predicate);
const expectedMutant = { ...predicate,
    args: [{ claim: { segments: ['qualification', 'alternative_period'] } }, predicate.args[1]] };
assert.deepEqual(mutant, expectedMutant);
assert.equal(canon(claim.period), canon(predicate.args[1].period_literal));
assert.notEqual(canon(qualification.alternative_period), canon(predicate.args[1].period_literal));
function assertConstruction(core, proposedView, original, proposedMutant) {
    const { qualification: extension, ...projection } = proposedView;
    assert.deepEqual(projection, core);
    assert.deepEqual(Object.keys(extension), ['alternative_period']);
    assert.deepEqual(Object.keys(extension.alternative_period).sort(), ['kind', 'value']);
    assert.equal(extension.alternative_period.kind, 'month');
    assert.equal(extension.alternative_period.value, alternateMonth(original.args[1].period_literal.value));
    assert.deepEqual(proposedMutant, { ...original,
        args: [{ claim: { segments: ['qualification', 'alternative_period'] } }, original.args[1]] });
}
assertConstruction(coreContext, view, predicate, mutant);
const badOperator = structuredClone(mutant); badOperator.op = 'not_eq';
const badLiteral = structuredClone(mutant); badLiteral.args[1].period_literal.value = '2042-08';
const badView = structuredClone(view); badView.period.value = '2042-08';
const equalAlternative = structuredClone(view); equalAlternative.qualification.alternative_period.value = claim.period.value;
const extraExtension = structuredClone(view); extraExtension.qualification.extra = true;
const negativeConstructionProbes = [
    () => assertConstruction(coreContext, view, predicate, badOperator),
    () => assertConstruction(coreContext, view, predicate, badLiteral),
    () => assertConstruction(coreContext, badView, predicate, mutant),
    () => assertConstruction(coreContext, equalAlternative, predicate, mutant),
    () => assertConstruction(coreContext, extraExtension, predicate, mutant)
];
for (const probe of negativeConstructionProbes) assert.throws(probe);
const selectionConsumers = (graph.selections || []).filter(selection =>
    JSON.stringify(selection).includes('"' + predicate.id + '"'));
const sourcesByPath = Object.fromEntries(sources.map(row => [row.path, row.sha256]));
const witness = {
    stage: 'documentary_claim_month_path_completion_construction',
    extraction_and_construction_only: true, normative_approval: false,
    runtime_tests_executed: false, original_corpus_witness_qualified: false,
    profile_witness_qualified: false, global_g11: false,
    immutable_base: base, profile_proposed: 'claim-month-path-completion/v1',
    sources, target: { fact_key: factKey, predicate_id: predicate.id,
        family: 'predicate_path_semantic', site: ['args', 0, 'claim', 'segments'] },
    original_claim: claim, original_predicate: predicate,
    proposed_mutant_predicate: mutant, proposed_restore_predicate: restored,
    proposed_view: view, proposed_sidecar: sidecar,
    original_claim_sha256: sha(canon(claim)), core_context_sha256: sha(canon(coreContext)),
    proposed_view_sha256: sha(canon(view)), proposed_sidecar_sha256: sha(canon(sidecar)),
    original_graph_sha256: sha(canon(graph)),
    projected_core_equals_original_context: true,
    one_authored_locator_change: true,
    proposed_nominal_rule: { locator: ['qualification', 'alternative_period'],
        form: 'period', periodKind: 'month', authority: 'ratified_profile_required_not_current_schema' },
    reference_construction: { original: claim.period, alternative: qualification.alternative_period,
        literal: predicate.args[1].period_literal, control: true, mutant: false, restore: true,
        reads_actual: false, computes_R: false },
    property_probes: { exhaustive_valid_months: probes, invalid_months_rejected: 7,
        perturbed_constructions_rejected: negativeConstructionProbes.length,
        last_month_alternative: alternateMonth('9999-12'),
        runtime_credit: 0 },
    immutable_blockers: {
        original_schema_does_not_declare_extension: true,
        original_nominal_rule_only_top_level_period: true,
        original_claim_requirements_requires_direct_period_binding: true,
        original_context_projection_drops_extension: true,
        selection_consumers_extracted: selectionConsumers,
        claim_schema_hash: sourcesByPath[prefix + 'claim-contract.schema.json'],
        period_operator_signature: operatorRegistry.operators.find(row => row.id === 'period_eq')
    },
    required_future_controls: [
        'full_mutated_authoring_quarantine_compile_not_post_IR_injection',
        'private_ticket_bound_to_original_ID_core_oracle_parents_and_profile',
        'independent_authorship_to_IR_locator_conformance',
        'only_target_static_binding_transport_no_generic_checker_bypass',
        'D_original_context_P_extended_view_isolation',
        'external_recorder_core_exact_and_target_fringe_only',
        'target_P_executed_false_other_predicates_and_barriers_valid',
        'positive_original_oracle_unchanged_no_counterfactual_R',
        'C_M_S_no_receipt_or_validated_parent',
        'mandatory_ID_unchanged_unique_mutant_invocation'
    ],
    limitation: 'Pure documentary extraction/construction. No runtime typing, claim admission, compiler lowering, D/P, recorder, release or WIP conformance is tested; the new profile is not ratified.'
};
const output = path.join(__dirname, 'path-singleton-month-profile-witness.json');
if (process.argv.length === 3 && process.argv[2] === '--write')
    fs.writeFileSync(output, JSON.stringify(witness, null, 2) + '\n', { flag: 'wx' });
else {
    assert.equal(process.argv.length, 2);
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), witness);
}
console.log(JSON.stringify({ documentary_construction_matched: true, base,
    target: witness.target, property_probes: probes, selection_consumers: selectionConsumers.length,
    witness_sha256: sha(fs.readFileSync(output)), runtime_tests_executed: false,
    profile_witness_qualified: false, global_g11: false }));
