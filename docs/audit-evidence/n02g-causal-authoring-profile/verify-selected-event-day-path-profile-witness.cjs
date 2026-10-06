'use strict';
// Documentary extraction/construction only. No repository executable is loaded.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const proposal = 'docs/plans/workstreams/financasbot-next-02-n02g-selected-event-day-path-profile-proposal-v1.md';
const output = path.join(__dirname, 'selected-event-day-path-profile-witness.json');
const parent = '241a08c4e35d257209d9fb8320d7d4828cdc7854';
const prefix = 'docs/contracts/next/provenance-v2/';
const bytes = name => fs.readFileSync(path.join(root, name));
const json = name => JSON.parse(bytes(name).toString('utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const canon = value => Array.isArray(value) ? '[' + value.map(canon).join(',') + ']'
    : value && typeof value === 'object' ? '{' + Object.keys(value).sort()
        .map(key => JSON.stringify(key) + ':' + canon(value[key])).join(',') + '}' : JSON.stringify(value);
const digest = value => 'sha256:' + hash(canon(value));
const clone = value => JSON.parse(JSON.stringify(value));
const sourcePaths = [
    'graphs-v2.json', 'claims-v2.json', 'snapshot-manifest-v1.json',
    'material-field-registry-v1.json', 'operator-registry-v2.json',
    'metric-evaluator-registry-v1.json', 'phase-composition-profile-v1.json',
    'provenance-graph.schema.json', 'claim-contract.schema.json',
    'evaluator-contracts/refund_amount.json'
].map(name => prefix + name).concat([
    'src/next/provenance/selectionBindings.js', 'src/next/provenance/graphCompiler.js',
    'src/next/provenance/proofOperators.js', 'src/next/provenance/instrumentedAccess.js',
    'src/next/provenance/proofAcceptance.js', 'src/next/provenance/pathMutationInventory.js',
    'src/next/provenance/metricEffects.js', 'src/next/provenance/materialFieldTypes.js',
    'src/next/kernel/canonicalValue.js'
]);
function identities(names) {
    return names.map(name => {
        const value = bytes(name);
        return { path: name, bytes: value.length, sha256: hash(value),
            git_blob_sha1: crypto.createHash('sha1').update('blob ' + value.length + '\0').update(value).digest('hex') };
    });
}
function civil(value) {
    assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
    const [y, m, d] = value.split('-').map(Number);
    assert(y >= 1 && m >= 1 && m <= 12);
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    assert(d >= 1 && d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]);
    return value;
}
function profilePlan(graph, claim, snapshots, registry, phaseProfile, after) {
    const targetId = 'p0055_selected_period';
    const target = graph.predicates.find(row => row.id === targetId);
    assert.equal(target.op, 'date_in_period');
    assert.equal(target.atom, 'period'); assert.equal(target.obligation, 'period');
    assert.deepEqual(target.args, [{ field: { node: 'evt_refund_b', segments: ['date'] } },
        { claim: { segments: ['period'] } }]);
    assert.deepEqual(claim.period, { kind: 'date', value: civil(claim.period.value) });
    assert.equal(graph.selections.length, 1);
    const selection = graph.selections[0], a = target.args[0].field.node;
    assert.deepEqual(graph.sets[selection.candidate_set], [a]);
    assert.deepEqual(graph.sets[selection.selected_set], [a]);
    assert.deepEqual(selection.excluded, []);
    assert.deepEqual(selection.selected_predicates, [targetId, 'p0056_selected_state']);
    const guard = graph.predicates.find(row => row.id === 'p0056_selected_state');
    assert.deepEqual(guard, { id: 'p0056_selected_state', obligation: 'evidence_state',
        atom: 'evidence_state', op: 'state_is', args: [{ field: { node: a, segments: ['state'] } },
            { literal: { type: 'enum', value: 'confirmed' } }] });
    assert.deepEqual(Object.keys(graph.windows), []);
    assert(Object.values(graph.nodes).every(node => node.binding === 'snapshot'));
    function payload(alias) {
        const node = graph.nodes[alias];
        assert.equal(node.kind, 'event');
        const matches = snapshots.filter(row => row.ref_id === node.ref_id && row.version === node.version);
        assert.equal(matches.length, 1); return matches[0].payload;
    }
    assert.deepEqual(after.segments, ['date']); assert.notEqual(after.node, a);
    assert.equal(registry.kinds.event.fields.date.type, 'date');
    const links = graph.edges.filter(edge => edge.source === a && edge.target === after.node
        && edge.relation === 'material_ref');
    assert.equal(links.length, 1);
    assert.equal(registry.kinds.event.fields[links[0].field].type, 'ref');
    assert.equal(payload(a)[links[0].field], graph.nodes[after.node].ref_id);
    const phase = phaseProfile.entries.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id
        && row.evaluator_version === claim.evaluator_ref.evaluator_version && row.metric === claim.metric);
    assert.equal(phase.derivation_mode, 'formula_only');
    const originalDate = civil(payload(a).date), changedDate = civil(payload(after.node).date);
    assert.equal(payload(a).state, 'confirmed');
    assert.equal(originalDate === claim.period.value, true);
    assert.equal(changedDate === claim.period.value, false);
    const role = 'proof/set/' + selection.candidate_set;
    const operand = 'operand/' + role;
    function tuples(variant) {
        const mutant = variant === 'M', alias = mutant ? after.node : a;
        const date = mutant ? changedDate : originalDate, aliases = mutant ? [] : [a];
        const view = 'view_' + hash(canon({ role, aliases }));
        return [
            { site: 'selection/0/candidate/0/guard/' + targetId, operand: 0,
                tuple: ['I', 'get', alias, mutant ? 'proof/snapshot' : role, ['date'], 'data', ['scalar', date]] },
            { site: 'selection/0/member/0', operand: null,
                tuple: ['I', 'select_member', operand, role, [0], 'operand_set', ['decision', a, !mutant]] },
            { site: 'selection/0/return', operand: null,
                tuple: ['I', 'select_return', operand, role, [], 'operand_set', ['selected', view, ...aliases]] },
            { site: 'assertion/' + targetId, operand: 0,
                tuple: ['I', 'get', alias, 'proof/snapshot', ['date'], 'data', ['scalar', date]] }
        ];
    }
    // This list comes only from explicit authored operand references, not executable closures.
    const consumers = [];
    function visit(value, at) {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            if ((key === 'set' || key === 'projection') && (child === selection.selected_set
                || child?.set === selection.selected_set)) consumers.push(at.concat(key));
            visit(child, at.concat(key));
        }
    }
    graph.predicates.forEach(row => visit(row.args, [row.id, 'args']));
    assert.deepEqual(consumers, []);
    return { selector: { fact_key: graph.fact_key, predicate_id: targetId },
        claim_period: claim.period, original_date: originalDate, alternate_date: changedDate,
        selection: clone(selection), candidate_alias: a, incidence: clone(links[0]),
        unchanged_guard: clone(guard), derivation_mode: phase.derivation_mode,
        explicit_authored_selected_set_consumers: consumers,
        executable_closure_absence_proved: false,
        truth: { C: true, M: false, S: true },
        expected_proof_selected: { C: [a], M: [], S: [a] },
        expected_derivation_selected: { C: [a], M: [a], S: [a] },
        fringe_construction: { C: tuples('C'), M: tuples('M'), S: tuples('S') },
        complete_core_plan_implemented: false, external_site_leases_implemented: false };
}
function build() {
    const graph = json(prefix + 'graphs-v2.json').graphs.find(row => row.fact_key === 'F-06#2#1');
    const claim = json(prefix + 'claims-v2.json').claims.find(row => row.fact_key === graph.fact_key);
    const manifest = json(prefix + 'snapshot-manifest-v1.json'); assert.equal(manifest.synthetic, true);
    const registry = json(prefix + 'material-field-registry-v1.json');
    const phaseProfile = json(prefix + 'phase-composition-profile-v1.json');
    const target = graph.predicates.find(row => row.id === 'p0055_selected_period');
    const requirementTarget = { fact_key: graph.fact_key, predicate_id: target.id, strategy: 'same_type_wrong_path' };
    const mutation_id = digest({ domain: 'financasbot.mutation-requirement.v2',
        family: 'predicate_path_semantic', target: requirementTarget });
    assert.equal(mutation_id, 'sha256:f494ce619e7883d1e340d3c0496f048d6c49f8bdb05abd25fa478b75211121a4');
    const before = target.args[0].field, location = ['args', 0, 'field'];
    // Documentary date/field options only; not the full native generator or admission.
    const alternatives = Object.keys(registry.kinds.event.fields).sort().filter(field =>
        registry.kinds.event.fields[field].type === 'date' && registry.kinds.event.fields[field].class !== 'non_material')
        .flatMap(field => Object.entries(graph.nodes).sort(([a], [b]) => a.localeCompare(b))
            .filter(([, node]) => node.kind === 'event' && node.binding === 'snapshot')
            .map(([node]) => ({ node, segments: [field] }))).filter(after => canon(after) !== canon(before));
    assert.equal(alternatives.length, 1);
    const after = alternatives[0];
    const candidate_id = digest({ domain: 'financasbot.path-semantic-candidate.v2', mutation_id, location, before, after });
    assert.equal(candidate_id, 'sha256:c7ccc906aa93d6126cb5fdf955616d6e592c99066e5e7d1b7017057e8b655a9d');
    const mutant = clone(graph); mutant.predicates.find(row => row.id === target.id).args[0].field = clone(after);
    const restored = clone(mutant); restored.predicates.find(row => row.id === target.id).args[0].field = clone(before);
    assert.deepEqual(restored, graph);
    const plan = profilePlan(graph, claim, manifest.snapshots, registry, phaseProfile, after);
    const reject = callback => assert.throws(callback);
    reject(() => civil('2042-02-29')); assert.equal(civil('2000-02-29'), '2000-02-29');
    const changedSet = clone(graph); changedSet.sets.selected = [];
    reject(() => profilePlan(changedSet, claim, manifest.snapshots, registry, phaseProfile, after));
    const changedGuard = clone(graph); changedGuard.predicates.find(row => row.id === 'p0056_selected_state').op = 'not_eq';
    reject(() => profilePlan(changedGuard, claim, manifest.snapshots, registry, phaseProfile, after));
    const wrongPeriod = clone(claim); wrongPeriod.period.kind = 'month';
    reject(() => profilePlan(graph, wrongPeriod, manifest.snapshots, registry, phaseProfile, after));
    const missingLink = clone(graph); missingLink.edges = missingLink.edges.filter(edge => edge.id !== plan.incidence.id);
    reject(() => profilePlan(missingLink, claim, manifest.snapshots, registry, phaseProfile, after));
    assert.notDeepEqual(plan.fringe_construction.C, plan.fringe_construction.M);
    assert.deepEqual(plan.fringe_construction.C, plan.fringe_construction.S);
    return { stage: 'documentary_selection_day_path_construction_only', profile: 'selected-event-day-path/v1',
        publication_parent: parent, normative_approval: false, runtime_tests_executed: false,
        compiler_executed: false, dp_executed: 0, matched: 0, semantic_mutation_credit: 0,
        ordinary_v2_witness_qualified: false, profile_witness_qualified: false,
        source_identities: identities(sourcePaths), documentary_identities: identities([proposal,
            'docs/audit-evidence/n02g-causal-authoring-profile/verify-selected-event-day-path-profile-witness.cjs']),
        mutation_id, candidate_id, patch: { location, before, after },
        authored_graph_hashes: { C: digest(graph), M: digest(mutant), S: digest(restored) },
        target_predicate: target, proposed_plan: plan,
        construction_self_checks: { civil_dates: 'PASS', non_singleton_rejected: true,
            changed_guard_rejected: true, non_date_period_rejected: true, missing_incidence_rejected: true,
            restoration_exact: true, runtime_conformance_tested: false },
        local_reported_evidence_not_read_or_rerun: {
            census_sha256: 'e528833a3f067514b80149498c31b273a472b55014f2c2c6437c5fe6430f6e93',
            preflight_sha256: 'ed006be1fe83522dd38bd9fca3bd3c23fed95765e799165ba427b643ae09f7df',
            normal_dp_sha256: '1bb48dcea29c2e4b420008b7704db0025cfa3480ba76e3d019d14d0bb27f04ce',
            rows: 125, first_candidates: 106, compiler_admitted: 1, compiler_refused: 105,
            no_discriminator: 19, normal_dp_counts: [1, 1, 1, 0], normal_exit: 1,
            normal_violations: ['period', 'trace'], normal_failed_components: ['read_edges', 'selection'] },
        implementation_blockers: ['normative_ratification_absent', 'independent_full_ir_conformance_not_qualified',
            'external_dispatch_leases_not_implemented', 'full_core_fringe_coverage_not_implemented',
            'external_dependency_closure_not_proved', 'measured_quarantine_identity_not_qualified',
            'profile_code_not_independently_audited', 'no_profile_runtime_invocation'],
        unchanged_scope: { compiler_transport: false, sources_modified: false, corpus_extension: false,
            normal_trace_waiver: false, historical_rows_rewritten: false, receipt: false, validated_parent: false,
            financial_response: false, global_go: false } };
}
const result = build(), serialized = JSON.stringify(result, null, 2) + '\n';
if (process.argv.slice(2).join(',') === '--write') fs.writeFileSync(output, serialized, 'utf8');
else { assert.deepEqual(process.argv.slice(2), ['--check']); assert.equal(fs.readFileSync(output, 'utf8'), serialized); }
console.log(JSON.stringify({ stage: result.stage, construction_check: 'PASS', sources: sourcePaths.length,
    mutation_id: result.mutation_id, fringe_events_per_variant: 4, runtime_tests_executed: false,
    normative_approval: false, profile_witness_qualified: false, witness_sha256: hash(serialized) }));
