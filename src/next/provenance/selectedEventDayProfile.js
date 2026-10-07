'use strict';
// Independent pre-execution construction ONLY. No compiler, guest, trace,
// oracle or observed IR can supply expected. This capability is NOT a completed
// execution ticket: measured conformance/closure/leases/quarantine remain gates.
const { types } = require('node:util');
const { copyData } = require('./observationContract');
const { admittedDocuments } = require('./packageContract');
const { canonicalValue, digest, freezeDeep } = require('../kernel/canonicalValue');
const { referenceCivilDateContained, sealPathSemanticReference } = require('./pathSemanticReference');
const { enumeratePathSemanticCandidates } = require('./pathMutationInventory');
const { REVIEWED_PROFILE_SHA256 } = require('./phaseCompositionProfile');
const PROFILE = 'selected-event-day-path/v1';
const NORMATIVE_COMMIT = 'f1a8cd4629b245009b9dd8fbb8dce83da77ba3d4';
const prefix = 'docs/contracts/next/provenance-v2/';
const precommits = new WeakMap();
const irExpectations = new WeakMap();
const leaseExpectations = new WeakMap();
const fail = code => { throw new Error('selected_day_' + code); };
const clone = value => structuredClone(copyData(value));
const same = (a, b) => canonicalValue(a) === canonicalValue(b);
const hash = value => 'sha256:' + digest(value);
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name => !d[name]?.enumerable
        || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function contains(value, needle) {
    return value === needle || value && typeof value === 'object'
        && Object.values(value).some(child => contains(child, needle));
}
function passiveRows(raw) {
    if (!Array.isArray(raw) || types.isProxy(raw) || Object.getPrototypeOf(raw) !== Array.prototype) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw), length = d.length.value;
    if (length > 16384 || Reflect.ownKeys(d).length !== length + 1) fail('input');
    return Array.from({ length }, (_, index) => {
        const row = d[index];
        if (!row?.enumerable || !Object.hasOwn(row, 'value')) fail('input');
        // Each authored graph/claim retains the original transport budget.
        return clone(row.value);
    });
}
function at(value, segments) {
    if (!Array.isArray(segments) || !segments.length) fail('operand');
    for (const key of segments) {
        if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) fail('operand');
        value = value[key];
    }
    return value;
}
function buildSelectedEventDayPlan(raw) {
    let input;
    try { input = clone(fields(raw, ['graph', 'claim', 'snapshots', 'materialRegistry',
        'phaseProfile', 'predicate_id', 'after'])); } catch { fail('input'); }
    const { graph, claim, snapshots, materialRegistry, phaseProfile, predicate_id, after } = input;
    if (!graph || graph.fact_key !== claim?.fact_key || !Array.isArray(graph.predicates)
        || !Array.isArray(graph.selections) || graph.selections.length !== 1
        || !Array.isArray(snapshots) || !graph.nodes || !graph.sets || !graph.windows
        || Object.keys(graph.windows).length || Object.values(graph.nodes).some(n => n.binding !== 'snapshot')) fail('class');
    const targets = graph.predicates.filter(p => p.id === predicate_id);
    if (targets.length !== 1 || new Set(graph.predicates.map(p => p.id)).size !== graph.predicates.length) fail('target');
    const target = targets[0]; const before = target.args?.[0]?.field;
    if (target.op !== 'date_in_period' || target.atom !== 'period' || target.obligation !== 'period'
        || target.args.length !== 2 || !before || !same(target.args[0], { field: before })
        || !same(target.args[1], { claim: { segments: ['period'] } })
        || !same(before.segments, ['date']) || !same(Object.keys(after).sort(), ['node', 'segments'])
        || !same(after.segments, ['date']) || after.node === before.node
        || claim.period?.kind !== 'date' || !same(Object.keys(claim.period).sort(), ['kind', 'value'])
        || referenceCivilDateContained(claim.period.value, claim.period) !== true) fail('class');
    const selection = graph.selections[0]; const alias = before.node;
    if (graph.nodes[alias]?.kind !== 'event' || graph.nodes[after.node]?.kind !== 'event'
        || materialRegistry.kinds?.event?.fields?.date?.type !== 'date'
        || materialRegistry.kinds.event.fields.date.class === 'non_material'
        || !same(graph.sets[selection.candidate_set], [alias])
        || !same(graph.sets[selection.selected_set], [alias])
        || selection.candidate_set === selection.selected_set || !same(selection.excluded, [])
        || !Array.isArray(selection.selected_predicates) || selection.selected_predicates.filter(id => id === predicate_id).length !== 1
        || new Set(selection.selected_predicates).size !== selection.selected_predicates.length) fail('selection');
    const snapshotMap = new Map();
    for (const snapshot of snapshots) {
        const key = canonicalValue([snapshot.kind, snapshot.ref_id, snapshot.version]);
        if (snapshotMap.has(key)) fail('snapshot'); snapshotMap.set(key, snapshot.payload);
    }
    function payload(nodeAlias) {
        const node = graph.nodes[nodeAlias];
        if (!node || node.binding !== 'snapshot') fail('snapshot');
        const value = snapshotMap.get(canonicalValue([node.kind, node.ref_id, node.version]));
        if (!value) fail('snapshot'); return value;
    }
    const links = graph.edges.filter(e => e.source === alias && e.target === after.node && e.relation === 'material_ref');
    if (links.length !== 1 || materialRegistry.kinds.event.fields[links[0].field]?.type !== 'ref'
        || payload(alias)[links[0].field] !== graph.nodes[after.node].ref_id) fail('incidence');
    const phases = phaseProfile.entries.filter(p => p.evaluator_id === claim.evaluator_ref.evaluator_id
        && p.evaluator_version === claim.evaluator_ref.evaluator_version && p.metric === claim.metric);
    if (phases.length !== 1 || phases[0].derivation_mode !== 'formula_only') fail('derivation');
    // Static authorship check is only one necessary layer. Executable closure
    // is deliberately NOT certified by this search or by an empty result.
    for (const predicate of graph.predicates) {
        if (contains(predicate.args, selection.selected_set)
            || predicate.id !== predicate_id && contains(predicate.args, predicate_id)) fail('consumer');
    }
    function operand(arg) {
        const keys = Object.keys(arg ?? {});
        if (keys.length !== 1) fail('guard_reference_pending');
        if (arg.field) return at(payload(arg.field.node), arg.field.segments);
        if (arg.claim) return at(claim, arg.claim.segments);
        if (arg.literal) return arg.literal.value;
        fail('guard_reference_pending');
    }
    const guards = selection.selected_predicates.filter(id => id !== predicate_id).map(id => {
        const matches = graph.predicates.filter(p => p.id === id);
        if (matches.length !== 1) fail('guard');
        const guard = matches[0]; const args = guard.args?.map(operand);
        // Closed, independently implemented guard relations. An unsupported
        // relation remains pending; never execute the guest as a fallback.
        let truth = null;
        if (['state_is', 'eq', 'field_eq'].includes(guard.op) && args?.length === 2) truth = same(args[0], args[1]);
        if (guard.op === 'date_in_period' && args?.length === 2) truth = referenceCivilDateContained(...args);
        if (truth !== true) fail('guard_reference_pending');
        return { id, truth, authored_hash: hash(guard), operands_hash: hash(args) };
    });
    const originalDate = payload(alias).date, alternateDate = payload(after.node).date;
    if (referenceCivilDateContained(originalDate, claim.period) !== true
        || referenceCivilDateContained(alternateDate, claim.period) !== false) fail('discriminator');
    const role = 'proof/set/' + selection.candidate_set, operandAlias = 'operand/' + role;
    function fringe(variant) {
        const mutant = variant === 'M', node = mutant ? after.node : alias;
        const value = mutant ? alternateDate : originalDate, aliases = mutant ? [] : [alias];
        const view = 'view_' + digest({ role, aliases });
        return [
            { site: 'selection/0/candidate/0/guard/' + predicate_id, operand: 0,
                tuple: ['I', 'get', node, mutant ? 'proof/snapshot' : role, ['date'], 'data', ['scalar', value]] },
            { site: 'selection/0/member/0', operand: null,
                tuple: ['I', 'select_member', operandAlias, role, [0], 'operand_set', ['decision', alias, !mutant]] },
            { site: 'selection/0/return', operand: null,
                tuple: ['I', 'select_return', operandAlias, role, [], 'operand_set', ['selected', view, ...aliases]] },
            { site: 'assertion/' + predicate_id, operand: 0,
                tuple: ['I', 'get', node, 'proof/snapshot', ['date'], 'data', ['scalar', value]] }
        ];
    }
    return freezeDeep({ stage: 'selected_event_day_plan_constructed_only', profile: PROFILE,
        fact_key: graph.fact_key, predicate_id, before, after, guards,
        truth: { C: true, M: false, S: true }, proof_selected: { C: [alias], M: [], S: [alias] },
        derivation_selected: { C: [alias], M: [alias], S: [alias] },
        fringe: { C: fringe('C'), M: fringe('M'), S: fringe('S') },
        executable_closure_absence_proved: false, complete_core_plan_implemented: false,
        external_site_leases_implemented: false, profile_witness_qualified: false,
        financial_release_eligible: false });
}
function prepareSelectedEventDayPrecommit(raw) {
    const { packageReceipt, inventoryCandidate, mutation_id } = fields(raw, ['packageReceipt', 'inventoryCandidate', 'mutation_id']);
    const docs = admittedDocuments(packageReceipt);
    const documents = new Map(docs.map(row => [row.path, row]));
    const alternatives = enumeratePathSemanticCandidates({ inventoryCandidate, mutation_id });
    // Seal ALL references before selecting any candidate and before M compile.
    const references = alternatives.candidates.map(candidate => sealPathSemanticReference({ packageReceipt, candidate }));
    const index = references.findIndex(r => r.available && r.baseline_satisfied === true && r.mutant_satisfied === false);
    if (index === -1) fail('no_discriminator');
    const candidate = alternatives.candidates[index];
    if (!same(candidate.patch.location, ['args', 0, 'field'])) fail('class');
    const corpus = documents.get(prefix + 'graphs-v2.json').value;
    const graph = corpus.graphs.find(g => g.fact_key === candidate.target.fact_key);
    const claims = documents.get(corpus.claim_contract.path).value.claims;
    const claim = claims.find(c => c.fact_key === graph.fact_key);
    const phase = documents.get(prefix + 'phase-composition-profile-v1.json');
    if (!phase || phase.sha256 !== REVIEWED_PROFILE_SHA256) fail('phase_authority');
    const plan = buildSelectedEventDayPlan({ graph, claim, snapshots: documents.get(corpus.snapshot_manifest.path).value.snapshots,
        materialRegistry: documents.get(corpus.material_registry.path).value, phaseProfile: phase.value,
        predicate_id: candidate.target.predicate_id, after: candidate.patch.after });
    const mutant = structuredClone(corpus.graphs);
    mutant.find(g => g.fact_key === graph.fact_key).predicates.find(p => p.id === plan.predicate_id)
        .args[0].field = structuredClone(candidate.patch.after);
    if (!same(mutant.find(g => g.fact_key === graph.fact_key), candidate.graph)) fail('mutation');
    const receipt = freezeDeep({ stage: 'selected_event_day_precommit_only', profile: PROFILE,
        normative_commit: NORMATIVE_COMMIT, mutation_id, candidate_id: candidate.candidate_id,
        candidate_order_hash: alternatives.candidates_sha256, references_hash: hash(references),
        selected_candidate_index: index, plan_hash: hash(plan), world_hash: references[index].world_sha256,
        authored_hashes: { C: hash(corpus.graphs), M: hash(mutant), S: hash(corpus.graphs) },
        claims_hash: hash(claims), quarantine_origin: 'negative_qualification',
        dp_execution: false, semantic_mutation_credit: 0, profile_witness_qualified: false,
        financial_release_eligible: false });
    precommits.set(receipt, { plan, graphs: corpus.graphs, mutant, claims, docs });
    return receipt;
}
function assertSelectedEventDayPrecommit(raw) {
    const { precommit, variant, graphs, claims } = fields(raw, ['precommit', 'variant', 'graphs', 'claims']);
    if (!precommits.has(precommit)) fail('authority');
    if (!['C', 'M', 'S'].includes(variant)) fail('variant');
    if (hash(passiveRows(graphs)) !== precommit.authored_hashes[variant] || hash(passiveRows(claims)) !== precommit.claims_hash) fail('world');
    return freezeDeep({ stage: 'selected_event_day_authorship_bound_only', profile: PROFILE,
        plan_hash: precommit.plan_hash, variant, financial_release_eligible: false,
        profile_witness_qualified: false, full_ir_conformance: false });
}
function sealSelectedEventDayIrExpectation(raw) {
    const { precommit, variant, packageReceipt } = fields(raw, ['precommit', 'variant', 'packageReceipt']);
    const authority = precommits.get(precommit); if (!authority) fail('authority');
    if (!['C', 'M', 'S'].includes(variant)) fail('variant');
    const docs = admittedDocuments(packageReceipt);
    const original = new Map(authority.docs.map(d => [d.path, d]));
    if (docs.length !== original.size || docs.some(d => !original.has(d.path)
        || d.path !== prefix + 'graphs-v2.json' && d.sha256 !== original.get(d.path).sha256)) fail('package');
    const corpus = docs.find(d => d.path === prefix + 'graphs-v2.json').value;
    const wanted = variant === 'M' ? authority.mutant : authority.graphs;
    if (!same(corpus.graphs, wanted)) fail('world');
    const envelope = { ...corpus }; delete envelope.graphs;
    const originalEnvelope = { ...original.get(prefix + 'graphs-v2.json').value }; delete originalEnvelope.graphs;
    if (!same(envelope, originalEnvelope)) fail('package');
    const { deriveSelectedEventDayIr } = require('./selectedEventDayIrContract');
    const expected = deriveSelectedEventDayIr(docs);
    const receipt = freezeDeep({ stage: 'selected_event_day_ir_expectation_sealed_only',
        variant, precommit_hash: hash(precommit), expected_ir_hash: hash(expected),
        profile_witness_qualified: false, compiler_admitted: false });
    irExpectations.set(receipt, { expected, authority, docs, packageReceipt, precommit }); return receipt;
}
function compareSelectedEventDayIr(raw) {
    const { expectation, ir } = fields(raw, ['expectation', 'ir']);
    const sealed = irExpectations.get(expectation); if (!sealed) fail('authority');
    const expected = sealed.expected;
    const input = fields(ir, ['format', 'version', 'stage', 'executable', 'authority_refs', 'order', 'graphs']);
    const data = { ...input, graphs: passiveRows(input.graphs) };
    for (const key of ['format', 'version', 'stage', 'executable', 'authority_refs', 'order']) data[key] = clone(input[key]);
    if (!same(expected, data)) fail('ir_conformance');
    return freezeDeep({ stage: 'selected_event_day_whole_ir_checked_only', authorship_ir_conformance: true,
        profile_witness_qualified: false, executable_program_conformance: false,
        financial_release_eligible: false });
}
// BUILD-only projection of the independently sealed authored contract. It is
// not compiler input admission, and a copied expectation cannot supply it.
function selectedEventDayProgramInputs(expectation) {
    const row = irExpectations.get(expectation); if (!row) fail('authority');
    const docs = new Map(row.docs.map(d => [d.path, d]));
    const corpus = docs.get(prefix + 'graphs-v2.json').value;
    const graph = row.expected.graphs.find(g => g.fact_key === row.authority.plan.fact_key);
    const material = docs.get(corpus.material_registry.path).value;
    const registry = docs.get(corpus.operator_registry.path).value;
    const operators = new Map(registry.operators.map(op => [op.id, op]));
    const predicates = graph.predicates.map(p => ({ id: p.id, operator: operators.get(p.op), operands: p.operands }));
    const materials = Object.fromEntries(Object.entries(graph.nodes).map(([alias, n]) => [alias,
        { registry_version: material.registry_version, kind: n.kind, fields: material.kinds[n.kind].fields }]));
    const selections = graph.selections.map(s => ({ candidate_set: s.candidate_set, selected_set: s.selected_set,
        cases: graph.sets[s.selected_set].map(alias => ({ node: alias, identity: {
            kind: graph.nodes[alias].kind, ref_id: graph.nodes[alias].ref_id, version: graph.nodes[alias].version },
            mode: 'include_if_all', predicates: s.selected_predicates })) }));
    const proof = { predicates, windows: graph.windows, materials, operators: registry.operators, selections };
    // buildSelectedEventDayPlan already required the ratified formula_only
    // composition. D has no P guards, even when M's P selection is empty.
    return freezeDeep(structuredClone({ proof, derivation: { ...proof, predicates: [], selections: [] },
        phase: { sha256: docs.get(prefix + 'phase-composition-profile-v1.json').sha256,
            registry_sha256: hash(docs.get(corpus.metric_evaluator_registry.path).value) },
        target_predicate_id: row.authority.plan.predicate_id,
        variant: expectation.variant, precommit_hash: expectation.precommit_hash,
        expected_ir_hash: expectation.expected_ir_hash }));
}
// Sealed authorship projection, prepared for ALL worlds before M compilation.
// The profile changes only P's selected roster; D's authored contract is intact.
// No trace, compiler actual, baseline R or caller expectation supplies it.
function coverageInputs(expectation, profile) {
    const row = irExpectations.get(expectation); if (!row) fail('authority');
    const graph = row.authority.graphs.find(g => g.fact_key === row.authority.plan.fact_key);
    const docs = new Map(row.docs.map(d => [d.path, d.value]));
    const corpus = docs.get(prefix + 'graphs-v2.json');
    const claim = docs.get(corpus.claim_contract.path).claims.find(c => c.fact_key === graph.fact_key);
    const phases = {};
    for (const phase of ['derivation', 'proof']) {
        const { evidence_set_mode, ...expected } = clone(graph.trace_contract[phase]);
        if (evidence_set_mode !== 'exact') fail('coverage_mode');
        const sets = clone(graph.sets);
        if (phase === 'proof' && profile) {
            const selection = graph.selections[0];
            sets[selection.selected_set] = clone(row.authority.plan.proof_selected[expectation.variant]);
            expected.selected_nodes = clone(sets[selection.selected_set]);
            const changed = expectation.variant === 'M' ? row.authority.plan.after : row.authority.plan.before;
            if (!expected.required_nodes.includes(changed.node)) expected.required_nodes.push(changed.node);
            if (!expected.required_reads.some(r => same(r, { node: changed.node, segments: changed.segments })))
                expected.required_reads.push({ node: changed.node, segments: clone(changed.segments) });
        }
        const bindings = expected.required_selections.map(selection => {
            if (phase === 'proof') return { role: 'proof/set/' + selection.candidate_set, ...selection };
            const roles = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set'
                && same(b.aliases, graph.sets[selection.candidate_set]));
            if (roles.length !== 1) fail('coverage_binding');
            return { role: roles[0][0], ...selection };
        });
        // Selected views are never an operand roster. They remain outputs of
        // the native lifecycle checker, not inputs inferred from select_return.
        const selectedSets = new Set(graph.selections.map(s => s.selected_set));
        const operandSets = phase === 'proof'
            ? Object.entries(graph.sets).filter(([name]) => !selectedSets.has(name))
                .map(([name, aliases]) => ({ role: 'proof/set/' + name, aliases }))
            : Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set')
                .map(([role, b]) => ({ role, aliases: b.aliases }));
        phases[phase] = { expected, sets, bindings, operandSets };
    }
    return freezeDeep(clone(phases));
}
function selectedEventDayCoverageInputs(expectation) { return coverageInputs(expectation, true); }
// Separate, unmodified authored expectations. A profile success must never
// turn the ordinary mutant trace into a normal-v2 success.
function selectedEventDayNormalCoverageInputs(expectation) { return coverageInputs(expectation, false); }
// CoreClaim is projected from original admitted authorship, never a compiler
// context, trace or functional R. The native nominal projection is reused and
// declared, not advertised as independent schema checking.
function selectedEventDayClaimInputs(expectation) {
    const row = irExpectations.get(expectation); if (!row) fail('authority');
    const docs = new Map(row.authority.docs.map(d => [d.path, d]));
    const corpus = docs.get(prefix + 'graphs-v2.json').value;
    const claimDocument = docs.get(corpus.claim_contract.path);
    const claim = claimDocument.value.claims.find(c => c.fact_key === row.authority.plan.fact_key);
    const schema = docs.get(prefix + 'claim-contract.schema.json');
    const registry = docs.get(corpus.metric_evaluator_registry.path);
    const entries = registry.value.entries.filter(e => e.metric === claim.metric
        && same({ evaluator_id: e.evaluator_id, evaluator_version: e.evaluator_version }, claim.evaluator_ref));
    if (entries.length !== 1) fail('oracle_registry');
    const contract = docs.get(entries[0].contract_path);
    if (!contract || contract.sha256 !== entries[0].evaluator_contract_hash
        || contract.value.metric !== claim.metric || contract.value.unit !== claim.unit) fail('oracle_contract');
    const { projectClaimContext } = require('./claimContext');
    // One compositional boundary for the entire nominal transport: bounded,
    // passive data admission -> plain JSON -> hash. Never special-case fields
    // or relax canonicalValue to accept arbitrary foreign prototypes.
    const projected = clone(projectClaimContext(claim, schema.value));
    return freezeDeep(clone({ claim, core_claim: projected.value, core_claim_shape: projected.shape,
        core_claim_hash: hash(projected.value), claim_document_sha256: claimDocument.sha256,
        claim_schema_sha256: schema.sha256, registry_sha256: registry.sha256,
        evaluator_contract_sha256: contract.sha256, operand_bindings_hash: hash(claim.operand_bindings),
        result_signature: { unit: contract.value.unit, ...contract.value.signature.output } }));
}
function selectedEventDayProgramFamily(raw) {
    const entries = fields(raw, ['C', 'M', 'S']);
    const rows = ['C', 'M', 'S'].map(variant => {
        const row = irExpectations.get(entries[variant]);
        if (!row || entries[variant].variant !== variant) fail('authority');
        return row;
    });
    if (rows.some(row => row.authority !== rows[0].authority)) fail('family_authority');
    const family = Object.fromEntries(['C', 'M', 'S'].map(v => [v, selectedEventDayProgramInputs(entries[v])]));
    if (!same(family.C.derivation, family.M.derivation) || !same(family.C.derivation, family.S.derivation)
        || !same(family.C.phase, family.M.phase) || !same(family.C.phase, family.S.phase)) fail('family_derivation');
    return freezeDeep(family);
}
// Pre-execution BUILD authority only. No trace or compiler output supplies a
// site, operand, fringe tuple or dispatch order. Transport into a measured
// child and admission against complete program/closure remain separate gates.
function sealSelectedEventDayLeaseExpectation(raw) {
    const { expectation } = fields(raw, ['expectation']);
    const row = irExpectations.get(expectation); if (!row) fail('authority');
    const inputs = selectedEventDayProgramInputs(expectation);
    const plan = row.authority.plan, selection = inputs.proof.selections[0];
    if (inputs.proof.selections.length !== 1 || selection.cases.length !== 1) fail('lease_class');
    const queue = [
        ...selection.cases[0].predicates.map(id => ({ site: 'selection/0/candidate/0/guard/' + id,
            predicate_id: id, selection_guard: true })),
        ...inputs.proof.predicates.map(p => ({ site: 'assertion/' + p.id,
            predicate_id: p.id, selection_guard: false }))
    ].map(site => ({ ...site, target: site.predicate_id === plan.predicate_id,
        truth: site.predicate_id === plan.predicate_id ? plan.truth[expectation.variant] : true }));
    const data = freezeDeep({ profile: PROFILE, variant: expectation.variant,
        precommit_hash: expectation.precommit_hash, expected_ir_hash: expectation.expected_ir_hash,
        queue, fringe: plan.fringe[expectation.variant], guard_count: selection.cases[0].predicates.length,
        candidate_set: selection.candidate_set, selected_set: selection.selected_set });
    const receipt = freezeDeep({ stage: 'selected_day_lease_expectation_sealed_only', plan_hash: hash(data),
        variant: expectation.variant, precommit_hash: expectation.precommit_hash,
        measured_tcb_admission: false, profile_witness_qualified: false });
    leaseExpectations.set(receipt, data); return receipt;
}
function resolveSelectedEventDayLeaseExpectation(receipt) {
    const plan = leaseExpectations.get(receipt); if (!plan) fail('authority'); return plan;
}
// Privileged BUILD projection for the normal compiler, not an expected/result
// callback supplied by the caller. Only the pre-M opaque expectation resolves.
function resolveSelectedEventDayCompilationInput(expectation) {
    const row = irExpectations.get(expectation); if (!row) fail('authority');
    return Object.freeze({ packageReceipt: row.packageReceipt, fact_key: row.authority.plan.fact_key,
        phase_sha256: row.docs.find(d => d.path === prefix + 'phase-composition-profile-v1.json').sha256 });
}
// Privileged BUILD commitments from the genuine pre-M family, never caller
// expected data or compiler/trace outputs. Entire package inventories include
// contracts, corpus, primary snapshots and schemas, with original byte hashes.
function selectedEventDayTicketInputs(expectations) {
    selectedEventDayProgramFamily(expectations);
    const rows = ['C', 'M', 'S'].map(variant => irExpectations.get(expectations[variant]));
    const first = rows[0];
    if (rows.some(row => row.precommit !== first.precommit) || !precommits.has(first.precommit)) fail('family_authority');
    return freezeDeep({ precommit: clone(first.precommit), plan: clone(first.authority.plan),
        patch: { location: ['args', 0, 'field'], before: clone(first.authority.plan.before), after: clone(first.authority.plan.after) },
        worlds: rows.map((row, index) => ({ variant: ['C', 'M', 'S'][index],
            expected_ir_hash: expectations[['C', 'M', 'S'][index]].expected_ir_hash,
            authority: row.docs.map(({ path, sha256 }) => ({ path, sha256 })) })) });
}
module.exports = { buildSelectedEventDayPlan, prepareSelectedEventDayPrecommit, assertSelectedEventDayPrecommit,
    sealSelectedEventDayIrExpectation, compareSelectedEventDayIr, selectedEventDayProgramInputs, selectedEventDayProgramFamily,
    sealSelectedEventDayLeaseExpectation, resolveSelectedEventDayLeaseExpectation,
    resolveSelectedEventDayCompilationInput, selectedEventDayCoverageInputs, selectedEventDayNormalCoverageInputs, selectedEventDayClaimInputs,
    selectedEventDayTicketInputs, PROFILE, NORMATIVE_COMMIT };
