'use strict';
// Offline normative composition. Reads immutable authored inputs, never R/I/M/L/T.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../../..');
const base = '207ca56b87381d69a922224332fcdda3a629d822';
const prefix = 'docs/contracts/next/provenance-v2/';
const output = path.join(__dirname, 'account-installment-observation-proposal.json');
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const frozen = file => execFileSync('git', ['-c', `safe.directory=${root}`, 'show', `${base}:${file}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }).replaceAll('\r\n', '\n');
const documents = {};
function read(file) {
    const text = frozen(file);
    documents[file] = { sha256_lf: sha(text), bytes_lf: Buffer.byteLength(text) };
    return JSON.parse(text);
}
const corpus = read(prefix + 'graphs-v2.json');
const claims = read(prefix + 'claims-v2.json').claims;
const manifest = read(prefix + 'snapshot-manifest-v1.json');
const registry = read(prefix + 'metric-evaluator-registry-v1.json');
assert.equal(corpus.graphs.length, 76);
assert.equal(new Set(corpus.graphs.map(g => g.fact_key)).size, 76);
assert.equal(corpus.snapshot_manifest.hash, documents[prefix + 'snapshot-manifest-v1.json'].sha256_lf);
const snapshots = manifest.snapshots;
const keys = [
    'S-04#1#1', 'S-06#1#1', 'S-11#1#1', 'S-11#1#2', 'S-11#1#3',
    'S-12#1#1', 'M-07#1#2', 'F-07#1#1', 'F-07#1#2', 'F-07#2#1', 'F-07#2#2'
];
const accounts = new Set(['movement_ids', 'account_balance']);
const installments = new Set(['installments_realized', 'installments_realized_amount',
    'installments_projected', 'installments_projected_amount', 'projected_installments']);
const dimensions = ['required_nodes', 'required_reads', 'required_claim_reads',
    'required_edges', 'required_structural'];
const canonical = value => JSON.stringify(value);
const sort = values => [...values].sort((a, b) => canonical(a).localeCompare(canonical(b), 'en'));
function unique(values, label) {
    assert.equal(new Set(values.map(canonical)).size, values.length, label);
    return values;
}
function snapshot(graph, alias, kind) {
    const node = graph.nodes[alias];
    assert.ok(node && node.binding === 'snapshot', `snapshot_missing:${alias}`);
    if (kind) assert.equal(node.kind, kind);
    const matches = snapshots.filter(s => s.kind === node.kind && s.ref_id === node.ref_id &&
        s.version === node.version && s.semantic_fingerprint === node.semantic_fingerprint);
    assert.equal(matches.length, 1, `snapshot_ambiguous:${alias}`);
    assert.equal(matches[0].payload.id, node.ref_id);
    return matches[0];
}
function relation(graph, sourceAlias, field, targetKind) {
    const source = snapshot(graph, sourceAlias);
    const matches = graph.edges.filter(e => e.source === sourceAlias && e.field === field &&
        e.relation === 'material_ref');
    assert.equal(matches.length, 1, `relation_ambiguous:${sourceAlias}.${field}`);
    const edge = matches[0];
    const target = snapshot(graph, edge.target, targetKind);
    assert.ok(Object.hasOwn(source.payload, field), `reference_absent:${sourceAlias}.${field}`);
    if (Array.isArray(source.payload[field]))
        assert.ok(source.payload[field].includes(target.payload.id), 'member_not_in_payload');
    else assert.equal(source.payload[field], target.payload.id, 'reference_value_mismatch');
    return { edge, target };
}
function composer(claim, graph) {
    assert.equal(graph.fact_key, claim.fact_key);
    assert.equal(graph.claim_id, claim.claim_id);
    assert.equal(claim.evaluator_ref.evaluator_id, claim.metric);
    const entry = registry.entries.filter(e => e.evaluator_id === claim.metric &&
        e.evaluator_version === claim.evaluator_ref.evaluator_version);
    assert.equal(entry.length, 1, 'evaluator_registry_entry');
    assert.deepEqual(Object.keys(claim.operand_bindings).sort(),
        entry[0].roles.map(r => r.role_id).sort(), 'role_inventory');
    assert.deepEqual(claim.operand_bindings.context, { kind: 'claim_context' });
    const metricContract = read(entry[0].contract_path);
    assert.equal(documents[entry[0].contract_path].sha256_lf, entry[0].evaluator_contract_hash);
    assert.equal(metricContract.metric, claim.metric);
    const d = { required_nodes: [], required_reads: [], required_claim_reads: [],
        required_edges: [], required_structural: [], selected_nodes: [],
        evidence_set_mode: 'exact', required_selections: [
            { candidate_set: 'candidates', selected_set: 'selected' }
        ] };
    const add = (field, value) => {
        if (!d[field].some(item => canonical(item) === canonical(value))) d[field].push(value);
    };
    const node = alias => add('required_nodes', alias);
    const get = (alias, field) => { node(alias); add('required_reads', { node: alias, segments: [field] }); };
    const has = (alias, field) => { node(alias); add('required_structural',
        { node: alias, operation: 'has', segments: [field] }); };
    const link = (alias, field, kind) => {
        const found = relation(graph, alias, field, kind);
        get(alias, field); add('required_edges', found.edge.id);
        return found;
    };
    const claimRead = (...segments) => add('required_claim_reads', { segments });
    // Record handles are obtained without a scalar get event. Only leaf
    // observations enter required_claim_reads.
    for (const parts of [['subject', 'kind'], ['subject', 'ref_id'],
        ['period', 'kind'], ['time_basis']]) claimRead(...parts);
    const events = claim.operand_bindings.events;
    assert.equal(events.kind, 'node_set');
    unique(events.aliases, 'duplicate_event_alias');
    if (accounts.has(claim.metric)) {
        assert.equal(claim.subject.kind, 'account');
        assert.equal(claim.time_basis, 'event_date');
        const accountAlias = claim.operand_bindings.account.alias;
        assert.equal(claim.operand_bindings.account.kind, 'node');
        const account = snapshot(graph, accountAlias, 'account');
        assert.equal(claim.subject.ref_id, account.ref_id);
        get(accountAlias, 'id');
        let inTime;
        if (claim.metric === 'account_balance') {
            assert.equal(claim.period.kind, 'as_of');
            get(accountAlias, 'opening_balance_as_of');
            get(accountAlias, 'opening_balance_minor');
            assert.ok(account.payload.opening_balance_as_of <= claim.period.value);
            inTime = date => date >= account.payload.opening_balance_as_of && date <= claim.period.value;
        } else {
            assert.equal(claim.period.kind, 'month');
            inTime = date => date.slice(0, 7) === claim.period.value;
        }
        claimRead('period', 'value');
        for (const alias of events.aliases) {
            const event = snapshot(graph, alias, 'event');
            for (const field of ['id', 'date', 'state']) get(alias, field);
            has(alias, 'account_id');
            let owner = false;
            if (Object.hasOwn(event.payload, 'account_id')) {
                const target = link(alias, 'account_id', 'account').target;
                const targetAlias = graph.edges.find(e => e.source === alias && e.field === 'account_id').target;
                get(targetAlias, 'id');
                owner = target.ref_id === account.ref_id && target.version === account.version;
            }
            if (event.payload.state === 'confirmed' && inTime(event.payload.date) && owner) {
                d.selected_nodes.push(alias);
                if (claim.metric === 'account_balance') get(alias, 'amount_minor');
            }
        }
    } else {
        assert.ok(installments.has(claim.metric), `unsupported_metric:${claim.metric}`);
        assert.equal(claim.time_basis, 'installment_competence');
        const familyMode = claim.metric === 'projected_installments';
        const planAliases = familyMode ? claim.operand_bindings.plans.aliases :
            [claim.operand_bindings.plan.alias];
        assert.ok(planAliases.length >= 1);
        const plans = new Map();
        for (const planAlias of unique(planAliases, 'duplicate_plan_alias')) {
            const plan = snapshot(graph, planAlias, 'installment_plan');
            get(planAlias, 'id'); get(planAlias, 'installment_total'); get(planAlias, 'members');
            for (const operation of ['iterator', 'cardinality', 'order']) add('required_structural',
                { node: planAlias, operation, segments: ['members'] });
            unique(plan.payload.members, 'duplicate_plan_member');
            assert.equal(plan.payload.members.length, plan.payload.installment_total,
                'plan_roster_total_mismatch');
            const memberAliases = new Map();
            for (const ref of plan.payload.members) {
                const found = graph.edges.filter(e => e.source === planAlias && e.field === 'members' &&
                    graph.nodes[e.target]?.ref_id === ref && e.relation === 'material_ref');
                assert.equal(found.length, 1, 'plan_member_relation');
                const target = snapshot(graph, found[0].target, 'event');
                assert.equal(target.ref_id, ref); add('required_edges', found[0].id);
                memberAliases.set(ref, found[0].target);
            }
            assert.equal(plans.has(plan.ref_id), false, 'duplicate_plan_ref');
            plans.set(plan.ref_id, { alias: planAlias, plan, memberAliases });
        }
        let familyMembers;
        if (familyMode) {
            assert.equal(claim.subject.kind, 'family');
            const familyAlias = claim.operand_bindings.family.alias;
            const family = snapshot(graph, familyAlias, 'family');
            assert.equal(claim.subject.ref_id, family.ref_id);
            get(familyAlias, 'id'); get(familyAlias, 'members');
            for (const operation of ['iterator', 'cardinality', 'order']) add('required_structural',
                { node: familyAlias, operation, segments: ['members'] });
            unique(family.payload.members, 'duplicate_family_member');
            familyMembers = new Set(family.payload.members);
            for (const ref of familyMembers) {
                const matches = graph.edges.filter(e => e.source === familyAlias && e.field === 'members' &&
                    graph.nodes[e.target]?.ref_id === ref && e.relation === 'material_ref');
                assert.equal(matches.length, 1, 'family_member_relation');
                snapshot(graph, matches[0].target, 'person');
                add('required_edges', matches[0].id);
            }
        } else {
            assert.equal(claim.subject.kind, 'installment_plan');
            assert.equal(plans.size, 1);
            assert.equal(claim.subject.ref_id, [...plans.keys()][0]);
        }
        const realized = claim.metric.startsWith('installments_realized');
        if (realized) {
            assert.equal(claim.period.kind, 'through'); claimRead('period', 'value');
        } else {
            assert.equal(claim.period.kind, 'range');
            assert.equal(claim.period.start_inclusive, true);
            assert.equal(claim.period.end_inclusive, true);
            for (const field of ['start_inclusive', 'end_inclusive', 'start', 'end'])
                claimRead('period', field);
        }
        const seenMember = new Set();
        const ordered = new Map();
        for (const alias of events.aliases) {
            const event = snapshot(graph, alias, 'event'); get(alias, 'id');
            const owners = [...plans.values()].filter(p => p.memberAliases.has(event.ref_id));
            assert.ok(owners.length <= 1, 'member_in_multiple_plans');
            if (!owners.length) continue;
            const owner = owners[0]; seenMember.add(event.ref_id);
            assert.equal(owner.memberAliases.get(event.ref_id), alias, 'member_alias_mismatch');
            const linked = link(alias, 'installment_plan', 'installment_plan');
            assert.equal(linked.target.ref_id, owner.plan.ref_id);
            assert.equal(linked.target.version, owner.plan.version);
            for (const field of ['installment_number', 'installment_total', 'date', 'state']) get(alias, field);
            assert.equal(event.payload.installment_total, owner.plan.payload.installment_total);
            const number = event.payload.installment_number;
            assert.ok(Number.isSafeInteger(number) && number >= 1 &&
                number <= owner.plan.payload.installment_total);
            const list = ordered.get(owner.plan.ref_id) || [];
            assert.ok(!list.some(x => x.number === number), 'duplicate_installment_number');
            list.push({ number, date: event.payload.date }); ordered.set(owner.plan.ref_id, list);
            let inFamily = true;
            if (familyMode) {
                const person = link(alias, 'person_id', 'person');
                inFamily = familyMembers.has(person.target.ref_id);
            }
            const inTime = realized ? event.payload.date <= claim.period.value :
                event.payload.date >= claim.period.start && event.payload.date <= claim.period.end;
            const state = realized ? 'confirmed' : 'projected';
            if (event.payload.state === state && inTime && inFamily) {
                d.selected_nodes.push(alias);
                if (familyMode || claim.metric.endsWith('_amount')) get(alias, 'amount_minor');
            }
        }
        for (const owner of plans.values()) {
            assert.equal([...owner.memberAliases.keys()].filter(ref => seenMember.has(ref)).length,
                owner.memberAliases.size, 'member_missing_from_population');
            const list = (ordered.get(owner.plan.ref_id) || []).sort((a, b) => a.number - b.number);
            for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].date < list[i].date, 'date_order');
        }
    }
    // A node_set binding assigns the complete authored selection to derivation
    // as well as proof (graph-binding-contract-v1, selection-by-phase). Its
    // predicates are an independent normative input, not legacy trace. Cover
    // every observation they require, including exclusions. Never learn this
    // closure from the evaluator, an oracle, or an observed trace.
    assert.deepEqual(graph.trace_contract.derivation.required_selections,
        [{ candidate_set: 'candidates', selected_set: 'selected' }]);
    assert.equal(graph.selections.length, 1, 'selection_inventory');
    const selection = graph.selections[0];
    assert.equal(selection.candidate_set, 'candidates');
    assert.equal(selection.selected_set, 'selected');
    const candidateSet = graph.sets[selection.candidate_set];
    assert.deepEqual(candidateSet, events.aliases, 'selection_candidate_roster');
    const selectedSet = graph.sets[selection.selected_set];
    assert.deepEqual([...selectedSet].sort(), [...d.selected_nodes].sort(), 'selection_selected_roster');
    const excluded = selection.excluded.flatMap(item => item.predicates);
    const predicateIds = unique([...selection.selected_predicates, ...excluded],
        'duplicate_selection_predicate');
    for (const predicateId of predicateIds) {
        const matches = graph.predicates.filter(item => item.id === predicateId);
        assert.equal(matches.length, 1, `selection_predicate:${predicateId}`);
        const predicate = matches[0];
        let setRef, templateBinding;
        for (const arg of predicate.args) {
            const forms = Object.keys(arg);
            assert.ok(forms.length === 1 ||
                (forms.length === 2 && forms.includes('template') && forms.includes('bindings')),
            `selection_arg_form:${predicateId}`);
            for (const form of forms) {
            const value = arg[form];
            if (form === 'field' || form === 'presence') {
                assert.equal(value.segments.length, 1);
                if (form === 'field') get(value.node, value.segments[0]);
                else has(value.node, value.segments[0]);
            } else if (form === 'claim') {
                // The selection references the period record. Its admitted
                // leaf reads are already authored above; the record handle
                // itself is access metadata, not a new scalar read.
                assert.deepEqual(value.segments, ['period']);
            } else if (form === 'edge') {
                assert.ok(graph.edges.some(edge => edge.id === value), `selection_edge:${value}`);
                add('required_edges', value);
            } else if (form === 'set') {
                assert.ok(Array.isArray(graph.sets[value]), `selection_set:${value}`);
                setRef = value;
            } else if (form === 'bindings') {
                templateBinding = value;
            } else if (form === 'literal' || form === 'period_ref' || form === 'template') {
                // A period_ref names the already-authored window, not a read.
                if (form === 'period_ref')
                    assert.ok(graph.windows[value], `selection_window:${value}`);
            } else {
                assert.fail(`unsupported_selection_arg:${predicateId}:${form}`);
            }
            }
        }
        if (templateBinding) {
            assert.ok(['all_match', 'none_match'].includes(predicate.op));
            assert.ok(setRef, `template_without_set:${predicateId}`);
            const bindings = Object.keys(templateBinding).sort();
            assert.deepEqual(bindings, ['field', 'period']);
            const field = templateBinding.field.selector;
            assert.equal(field.kind, 'event');
            assert.equal(field.segments.length, 1);
            if (templateBinding.period.claim) {
                assert.deepEqual(templateBinding.period.claim.segments, ['period']);
                assert.ok(['through', 'range'].includes(claim.period.kind));
            } else {
                assert.equal(templateBinding.period.period_ref, 'selection_window');
                assert.ok(graph.windows.selection_window);
            }
            for (const alias of graph.sets[setRef]) get(alias, field.segments[0]);
        }
    }
    for (const field of dimensions) d[field] = sort(unique(d[field], `duplicate_${field}`));
    d.selected_nodes = [...new Set(d.selected_nodes)].sort();
    assert.deepEqual(d.selected_nodes, [...graph.trace_contract.derivation.selected_nodes].sort(),
        `selection_divergence:${claim.fact_key}`);
    assert.deepEqual(graph.trace_contract.derivation.required_selections, d.required_selections);
    return d;
}
const records = [];
for (const key of keys) {
    const c = claims.filter(x => x.fact_key === key), g = corpus.graphs.filter(x => x.fact_key === key);
    assert.equal(c.length, 1); assert.equal(g.length, 1);
    const proposed = composer(c[0], g[0]);
    const current = g[0].trace_contract.derivation;
    const delta = Object.fromEntries(dimensions.map(field => [field, {
        added: proposed[field].filter(x => !current[field].some(y => canonical(y) === canonical(x))),
        removed: current[field].filter(x => !proposed[field].some(y => canonical(y) === canonical(x)))
    }]));
    records.push({ fact_key: key, metric: c[0].metric, current_derivation: current,
        proposed_derivation: proposed, delta, proof_sha256: sha(JSON.stringify(g[0].trace_contract.proof)) });
}
assert.equal(records.length, 11);
// Red-team the generator itself. These are mutations of immutable-input
// copies, not mutations of the corpus or observations from an evaluator.
const accountClaim = claims.find(c => c.fact_key === 'S-04#1#1');
const accountGraph = corpus.graphs.find(g => g.fact_key === accountClaim.fact_key);
const planClaim = claims.find(c => c.fact_key === 'S-11#1#1');
const planGraph = corpus.graphs.find(g => g.fact_key === planClaim.fact_key);
const accountBaseline = composer(accountClaim, accountGraph);
const planBaseline = composer(planClaim, planGraph);
const adversarial = [];
function red(name, claim, graph, mutate) {
    const c = structuredClone(claim), g = structuredClone(graph);
    mutate(c, g);
    assert.throws(() => composer(c, g), undefined, name);
    adversarial.push(name);
}
red('account_relation_missing', accountClaim, accountGraph, (_, g) => {
    g.edges = g.edges.filter(e => !(e.source === 'evt_salary_a' && e.field === 'account_id'));
});
red('account_relation_duplicate', accountClaim, accountGraph, (_, g) => {
    g.edges.push(structuredClone(g.edges.find(e => e.source === 'evt_salary_a' && e.field === 'account_id')));
});
red('account_role_alias_missing', accountClaim, accountGraph, c => {
    c.operand_bindings.account.alias = 'missing_account';
});
red('account_selection_divergence', accountClaim, accountGraph, (_, g) => {
    g.trace_contract.derivation.selected_nodes = [];
});
red('plan_member_relation_missing', planClaim, planGraph, (_, g) => {
    g.edges = g.edges.filter(e => !(e.source === 'plan_01' && e.field === 'members' &&
        e.target === 'evt_installment_1'));
});
red('plan_link_relation_missing', planClaim, planGraph, (_, g) => {
    g.edges = g.edges.filter(e => !(e.source === 'evt_installment_1' &&
        e.field === 'installment_plan'));
});
red('plan_member_missing_from_population', planClaim, planGraph, c => {
    c.operand_bindings.events.aliases = c.operand_bindings.events.aliases.filter(
        alias => alias !== 'evt_installment_1');
});
red('plan_selection_predicate_missing', planClaim, planGraph, (_, g) => {
    g.predicates = g.predicates.filter(predicate => predicate.id !== 'r0001_absent_installment_plan');
});
const changedSelection = structuredClone(planGraph);
const absence = changedSelection.predicates.find(predicate =>
    predicate.id === 'r0001_absent_installment_plan');
assert.ok(absence);
absence.args[0].presence.segments = ['card_id'];
assert.notDeepEqual(composer(planClaim, changedSelection), planBaseline,
    'selection_predicate_change_must_change_derivation');
adversarial.push('selection_predicate_changes_obligation');
const staleAccount = structuredClone(accountGraph);
staleAccount.trace_contract.derivation.required_reads = [];
staleAccount.trace_contract.derivation.required_edges = [];
assert.deepEqual(composer(accountClaim, staleAccount), accountBaseline);
adversarial.push('stale_account_obligations_ignored');
const stalePlan = structuredClone(planGraph);
stalePlan.trace_contract.derivation.required_reads = [];
stalePlan.trace_contract.derivation.required_edges = [];
assert.deepEqual(composer(planClaim, stalePlan), planBaseline);
adversarial.push('stale_plan_obligations_ignored');
const simulated = structuredClone(corpus);
for (const row of records) simulated.graphs.find(g => g.fact_key === row.fact_key)
    .trace_contract.derivation = row.proposed_derivation;
for (let i = 0; i < 76; i++) {
    const original = corpus.graphs[i], next = simulated.graphs[i];
    assert.deepEqual(next.trace_contract.proof, original.trace_contract.proof);
    if (!keys.includes(original.fact_key)) assert.deepEqual(next, original);
    else {
        const reconstructed = structuredClone(next);
        reconstructed.trace_contract.derivation = original.trace_contract.derivation;
        assert.deepEqual(reconstructed, original);
    }
}
const proposal = { schema: 'n02g_account_installment_observation_proposal_v2', base,
    status: 'not_applied', graph_accepted: false, source_corpus_sha256_lf:
        documents[prefix + 'graphs-v2.json'].sha256_lf, documents, records,
    checks: { graphs: 76, changed_derivations: 11, other_graphs_preserved: 65,
        all_proofs_preserved: 76, generated_without_evaluator_or_trace: true,
        adversarial } };
const rendered = JSON.stringify(proposal, null, 2) + '\n';
if (process.argv.includes('--check')) {
    assert.equal(fs.readFileSync(output, 'utf8').replaceAll('\r\n', '\n'), rendered);
} else fs.writeFileSync(output, rendered);
console.log(JSON.stringify({ records: records.length, checks: proposal.checks,
    proposal_sha256_lf: sha(rendered) }));
