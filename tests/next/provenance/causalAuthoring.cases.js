'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { digest: semanticDigest } = require('../../../src/next/kernel/canonicalValue');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { projectAuthoringInputs, bindAuthoringProfile, pinAuthoringAuthorities, validateAuthoringInput, generateAuthoringCandidate } = require('../../../scripts/agent/nextCausalAuthoring.cjs');
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const version = digest('snapshot');
const profilePath = metric => `docs/contracts/next/provenance-v2/causal-authoring-candidates/${metric.replaceAll('_', '-')}-profile-v1.json`;
const readProfile = metric => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../..', profilePath(metric)), 'utf8'));
function fixture() {
    return {
        graph: { fact_key: 'not-a-kernel-key', nodes: {
            eventAlias: { binding: 'snapshot', kind: 'event', ref_id: 'event-id', version, roles: ['irrelevant'] },
            accountAlias: { binding: 'snapshot', kind: 'account', ref_id: 'account-id', version },
            categoryAlias: { binding: 'snapshot', kind: 'category', ref_id: 'category-id', version }
        }, edges: [{ id: 'edge', source: 'eventAlias', field: 'account_id', target: 'accountAlias', relation: 'material_ref', proof_predicates: ['not-an-input'] }],
        trace_contract: { derivation: { required_reads: ['forbidden'] }, proof: { required_nodes: ['forbidden'] } },
        predicates: ['forbidden'], selections: ['forbidden'], sets: { selected: ['forbidden'] }, result: 'forbidden' },
        claim: { fact_key: 'not-a-kernel-key', claim_id: 'not-a-kernel-key', metric: 'consumption_by_instrument', unit: 'BRL_minor',
            subject: { kind: 'account', ref_id: 'account-id' }, period: { kind: 'month', value: '2042-06' },
            time_basis: 'event_date', coverage: 'complete', evidence_state: 'confirmed',
            evaluator_ref: { evaluator_id: 'consumption_by_instrument', evaluator_version: 1 },
            operand_bindings: { context: { kind: 'claim_context' }, events: { kind: 'node_set', aliases: ['eventAlias'] },
                categories: { kind: 'node_set', aliases: ['categoryAlias'] }, instrument: { kind: 'node', alias: 'accountAlias' } } }
    };
}
const project = ({ graph, claim }) => projectAuthoringInputs(JSON.stringify(graph), JSON.stringify(claim));

test('N02G:AUTHOR-BOUNDARY-001 old expected, proof, selection and results cannot influence projected kernel bytes', () => {
    const base = fixture(); const expected = project(base);
    for (const property of ['trace_contract', 'predicates', 'selections', 'sets', 'result', 'fact_key']) {
        const mutant = structuredClone(base); mutant.graph[property] = { poisoned: property, bytes: ['actual', 'oracle'] };
        assert.equal(project(mutant), expected);
    }
    const claim = structuredClone(base); claim.claim.result = { oracle: 900 }; claim.claim.fact_key = 'other'; claim.claim.claim_id = 'other';
    assert.equal(project(claim), expected);
    const value = JSON.parse(expected);
    assert.deepEqual(Object.keys(value).sort(), ['claim', 'topology']);
    assert.deepEqual(Object.keys(value.topology).sort(), ['edges', 'nodes']);
    assert.equal(expected.includes('forbidden'), false);
    assert.equal(expected.includes('proof_predicates'), false);
    assert.equal(expected.includes('not-a-kernel-key'), false);
});

test('N02G:AUTHOR-BOUNDARY-002 input must be serialized data and topology/roles must be coherent', () => {
    const f = fixture();
    assert.throws(() => projectAuthoringInputs(f.graph, JSON.stringify(f.claim)), /causal_authoring_/);
    const mutations = [f => f.graph.edges.push({ ...f.graph.edges[0] }),
        f => { f.graph.edges[0].target = 'missing'; }, f => { f.graph.edges[0].relation = 'derived_from'; },
        f => { f.graph.nodes.eventAlias.binding = 'validated_parent'; },
        f => { f.claim.operand_bindings.events.aliases.push('eventAlias'); },
        f => { f.claim.operand_bindings.instrument.alias = 'missing'; },
        f => { f.claim.operand_bindings.events.trace = []; }, f => { f.claim.metric = 'unreviewed'; }];
    for (const change of mutations) { const mutant = fixture(); change(mutant); assert.throws(() => project(mutant), /causal_authoring_/); }
});

test('N02G:AUTHOR-BOUNDARY-003 topology order is canonical but permitted material changes remain visible', () => {
    const f = fixture(); const expected = project(f);
    f.graph.nodes = Object.fromEntries(Object.entries(f.graph.nodes).reverse());
    assert.equal(project(f), expected);
    f.graph.nodes.eventAlias.version = digest('different-version');
    assert.notEqual(project(f), expected);
    f.graph.nodes.eventAlias.version = version; f.graph.edges[0].id = 'renamed-edge';
    assert.notEqual(project(f), expected);
});

test('N02G:AUTHOR-BOUNDARY-007 reserved claim aliases and unsupported semantic filters cannot be silently projected away', () => {
    const reserved = fixture(); reserved.graph.nodes.claim = { ...reserved.graph.nodes.accountAlias, ref_id: 'other-id' };
    assert.throws(() => project(reserved), /causal_authoring_reserved_alias/);
    const filtered = fixture(); filtered.claim.filters = { budget_class: 'essential' };
    assert.throws(() => project(filtered), /causal_authoring_unsupported_claim_filters/);
});

function profileFixture() {
    const contract = JSON.stringify({ contract_id: 'contract-v1', metric: 'consumption_by_instrument', schema_version: 1 });
    const entry = { evaluator_id: 'consumption_by_instrument', evaluator_version: 1, metric: 'consumption_by_instrument',
        evaluator_contract_hash: digest(contract), contract_path: 'docs/contracts/next/provenance-v2/evaluator-contracts/consumption_by_instrument.json' };
    const profile = { ...readProfile(entry.metric), contract_hash: entry.evaluator_contract_hash };
    return { profile, entry, contract };
}
const bind = f => bindAuthoringProfile(JSON.stringify(f.profile), JSON.stringify(f.entry), f.contract);
test('N02G:AUTHOR-BOUNDARY-004 profile binds evaluator version and exact contract bytes, never metric alone', () => {
    const f = profileFixture(); const result = bind(f);
    assert.equal(result.stage, 'authoring_profile_binding_only');
    assert.equal(result.executable, false); assert.equal(result.normative_application_allowed, false);
    for (const change of [f => { f.entry.evaluator_version++; }, f => { f.profile.evaluator_id = 'other'; },
        f => { f.profile.contract_hash = digest('other'); }, f => { f.contract += '\n'; },
        f => { f.entry.metric = 'statement_total'; }]) {
        const mutant = profileFixture(); change(mutant); assert.throws(() => bind(mutant), /causal_authoring_/);
    }
});

test('N02G:AUTHOR-BOUNDARY-005 unresolved or unknown foreign-reference policy fails without a runtime default', () => {
    for (const policy of [undefined, null, '', 'unresolved', 'infer_from_trace']) {
        const f = profileFixture(); if (policy === undefined) delete f.profile.foreign_reference_policy;
        else f.profile.foreign_reference_policy = policy;
        assert.throws(() => bind(f), /causal_authoring_/);
    }
});

test('N02G:AUTHOR-BOUNDARY-006 every instrument/statement graph projects without its old expected or selection objects', () => {
    const root = path.resolve(__dirname, '../../..', 'docs/contracts/next/provenance-v2');
    const graphs = JSON.parse(fs.readFileSync(path.join(root, 'graphs-v2.json'), 'utf8')).graphs;
    const claims = JSON.parse(fs.readFileSync(path.join(root, 'claims-v2.json'), 'utf8')).claims
        .filter(c => ['consumption_by_instrument', 'statement_total'].includes(c.metric));
    assert.equal(claims.length, 6);
    for (const claim of claims) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const bytes = project({ graph, claim });
        const mutant = structuredClone(graph);
        mutant.trace_contract = { derivation: 'arbitrary', proof: 'arbitrary' };
        mutant.predicates = []; mutant.sets = {}; mutant.selections = [];
        assert.equal(project({ graph: mutant, claim }), bytes, claim.fact_key);
        const projected = JSON.parse(bytes);
        assert.deepEqual(Object.keys(projected.topology).sort(), ['edges', 'nodes']);
        assert.equal(Object.hasOwn(projected.claim, 'fact_key'), false);
        assert.equal(projected.claim.operand_bindings.events.aliases.length, 16);
        if (claim.metric === 'statement_total') {
            const wrong = structuredClone(graph);
            wrong.nodes[claim.operand_bindings.policy.alias].kind = 'policy';
            assert.throws(() => project({ graph: wrong, claim }), /causal_authoring_node_role_kind/);
        }
    }
});

function authorityFixture() {
    const slots = ['claim_schema', 'snapshot_schema', 'material_registry', 'metric_registry', 'evaluator_contract', 'profile', 'snapshot_manifest'];
    const documents = slots.map(slot => ({ path: `docs/fixture/${slot}.json`, content: JSON.stringify({ authority: slot }) }));
    documents.push({ path: 'docs/fixture/snapshot.json', content: JSON.stringify({ snapshots: [] }) });
    const reference = d => ({ path: d.path, sha256: digest(d.content) });
    const manifest = Object.fromEntries(slots.map((slot, i) => [slot, reference(documents[i])]));
    manifest.snapshot_sources = [reference(documents.at(-1))];
    return { manifest, documents };
}
const pin = f => pinAuthoringAuthorities(JSON.stringify(f.manifest), JSON.stringify({ documents: f.documents }));
test('N02G:AUTHOR-PINS-001 every independent authority is required and all returned documents are immutable', () => {
    const f = authorityFixture(); const result = pin(f);
    assert.equal(result.stage, 'authoring_document_pins_only');
    assert.equal(result.authenticated, false); assert.equal(result.normative_application_allowed, false);
    assert.equal(Object.keys(result.authorities).length, 8);
    assert.throws(() => { result.authorities.claim_schema.value.authority = 'forged'; }, TypeError);
    for (const slot of Object.keys(f.manifest)) {
        const mutant = authorityFixture(); delete mutant.manifest[slot];
        assert.throws(() => pin(mutant), /causal_authoring_/);
    }
});

test('N02G:AUTHOR-PINS-002 altered bytes, duplicate paths, absent sources and extra documents fail closed', () => {
    for (let i = 0; i < 8; i++) {
        const f = authorityFixture(); f.documents[i].content += '\n';
        assert.throws(() => pin(f), /causal_authoring_document_digest/);
    }
    for (const mutate of [f => f.documents.push(f.documents[0]), f => f.documents.pop(),
        f => f.documents.push({ path: 'docs/fixture/extra.json', content: '{}' }),
        f => { f.manifest.snapshot_sources = []; },
        f => { f.manifest.profile = f.manifest.evaluator_contract; },
        f => { f.manifest.claim_schema.path = '../outside.json'; }]) {
        const f = authorityFixture(); mutate(f); assert.throws(() => pin(f), /causal_authoring_/);
    }
});

test('N02G:AUTHOR-PINS-003 document transport order cannot change pinned authority values', () => {
    const f = authorityFixture(); const expected = pin(f);
    f.documents.reverse(); assert.deepEqual(pin(f), expected);
});

function corpusAuthorities(metric = 'consumption_by_instrument') {
    const root = path.resolve(__dirname, '../../..'); const prefix = 'docs/contracts/next/provenance-v2/';
    // Same published-LF fixture convention as the existing corpus tests. The
    // production pinning function itself performs no normalization.
    const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
    const registry = JSON.parse(read(prefix + 'metric-evaluator-registry-v1.json'));
    const entry = registry.entries.find(e => e.metric === metric);
    const snapshotManifest = JSON.parse(read(prefix + 'snapshot-manifest-v1.json'));
    const paths = { claim_schema: prefix + 'claim-contract.schema.json', snapshot_schema: prefix + 'evidence-snapshot.schema.json',
        material_registry: prefix + 'material-field-registry-v1.json', metric_registry: prefix + 'metric-evaluator-registry-v1.json',
        evaluator_contract: entry.contract_path, profile: profilePath(metric), snapshot_manifest: prefix + 'snapshot-manifest-v1.json' };
    const documents = Object.values(paths).map(file => ({ path: file, content: read(file) }));
    for (const source of snapshotManifest.sources) documents.push({ path: source.path, content: read(source.path) });
    const ref = file => ({ path: file, sha256: digest(documents.find(d => d.path === file).content) });
    const manifest = Object.fromEntries(Object.entries(paths).map(([slot, file]) => [slot, ref(file)]));
    manifest.snapshot_sources = snapshotManifest.sources.map(source => ref(source.path));
    const claims = JSON.parse(read(prefix + 'claims-v2.json')).claims.filter(c => c.metric === metric);
    const graphs = JSON.parse(read(prefix + 'graphs-v2.json')).graphs;
    return { manifest, documents, claims, graphs, paths };
}
const validate = (input, f) => validateAuthoringInput(input, JSON.stringify(f.manifest), JSON.stringify({ documents: f.documents }));
function replaceDocument(f, slot, mutate) {
    const doc = f.documents.find(d => d.path === f.manifest[slot].path);
    const value = JSON.parse(doc.content); mutate(value); doc.content = JSON.stringify(value);
    f.manifest[slot].sha256 = digest(doc.content);
}
test('N02G:AUTHOR-ADMISSION-001 both reviewed metrics bind projected inputs to schemas, registries and snapshots', () => {
    for (const metric of ['consumption_by_instrument', 'statement_total']) {
        const f = corpusAuthorities(metric);
        for (const claim of f.claims) {
            const graph = f.graphs.find(g => g.fact_key === claim.fact_key);
            const input = project({ graph, claim }); const result = validate(input, f);
            assert.equal(result.stage, 'causal_authoring_inputs_validated_only');
            assert.equal(result.normative_application_allowed, false);
            assert.equal(result.authenticated, false);
            assert.equal(Object.keys(result.snapshots).length, Object.keys(graph.nodes).length);
            const mutant = structuredClone(graph); mutant.trace_contract = {}; mutant.predicates = []; mutant.selections = []; mutant.sets = {};
            assert.deepEqual(validate(project({ graph: mutant, claim }), f), result);
        }
    }
});

test('N02G:AUTHOR-ADMISSION-002 repairing transport hashes cannot hide malformed claims, references or snapshot payloads', () => {
    const f = corpusAuthorities(); const claim = f.claims[0]; const graph = f.graphs.find(g => g.fact_key === claim.fact_key);
    const projected = JSON.parse(project({ graph, claim }));
    for (const mutate of [x => { x.claim.coverage = 'invented'; }, x => { x.topology.edges[0].target = x.topology.edges[0].source; },
        x => { x.claim.evaluator_ref.evaluator_version++; }, x => { x.trace_contract = {}; }]) {
        const bad = structuredClone(projected); mutate(bad); assert.throws(() => validate(JSON.stringify(bad), f), /causal_authoring_/);
    }
    const malformed = corpusAuthorities();
    replaceDocument(malformed, 'snapshot_manifest', m => { m.snapshots.find(s => s.kind === 'event').payload.amount_minor = 'not-money'; });
    assert.throws(() => validate(JSON.stringify(projected), malformed), /causal_authoring_snapshot_schema/);
    const wrongTarget = corpusAuthorities();
    replaceDocument(wrongTarget, 'material_registry', r => { r.kinds.event.fields.account_id.targets = ['person']; });
    assert.throws(() => validate(JSON.stringify(projected), wrongTarget), /causal_authoring_/);
});

test('N02G:AUTHOR-ADMISSION-003 schema-valid payload changes still require their semantic fingerprint', () => {
    const f = corpusAuthorities(); const claim = f.claims[0];
    const input = project({ graph: f.graphs.find(g => g.fact_key === claim.fact_key), claim });
    replaceDocument(f, 'snapshot_manifest', m => { m.snapshots.find(s => s.kind === 'event').payload.amount_minor++; });
    assert.throws(() => validate(input, f), /causal_authoring_snapshot_fingerprint/);
    const absent = corpusAuthorities();
    replaceDocument(absent, 'snapshot_manifest', m => { delete m.snapshots[0].semantic_fingerprint; });
    assert.throws(() => validate(input, absent), /causal_authoring_snapshot_fingerprint/);
});

const generate = (input, f) => JSON.parse(generateAuthoringCandidate(input, JSON.stringify(f.manifest), JSON.stringify({ documents: f.documents })));
test('N02G:AUTHOR-GENERATE-001 six bounded candidates are independent of old expectations and never contain financial results', () => {
    for (const metric of ['consumption_by_instrument', 'statement_total']) {
        const f = corpusAuthorities(metric);
        for (const claim of f.claims) {
            const graph = f.graphs.find(g => g.fact_key === claim.fact_key);
            const candidate = generate(project({ graph, claim }), f);
            assert.equal(candidate.stage, 'offline_authoring_candidate');
            assert.equal(candidate.normative_application_allowed, false);
            assert.equal(candidate.graph_accepted, false);
            assert.deepEqual(Object.keys(candidate.obligations).sort(), ['required_claim_reads', 'required_edges', 'required_nodes', 'required_reads', 'required_structural']);
            assert.ok(candidate.obligations.required_reads.length > 0);
            assert.equal(candidate.justifications.length, Object.values(candidate.obligations).reduce((n, xs) => n + xs.length, 0));
            const altered = structuredClone(graph);
            altered.trace_contract = { derivation: ['poison'], proof: ['poison'] }; altered.predicates = []; altered.sets = {}; altered.selections = [];
            altered.actual = { forged: true }; altered.result = 99999;
            assert.deepEqual(generate(project({ graph: altered, claim }), f), candidate);
        }
    }
});

test('N02G:AUTHOR-GENERATE-002 unknown operations, hidden fields, undefined branches and missing required relations abort', () => {
    const f = corpusAuthorities(); const claim = f.claims[0]; const graph = f.graphs.find(g => g.fact_key === claim.fact_key);
    const input = project({ graph, claim });
    for (const mutation of [p => { p.program[0].op = 'from_actual'; }, p => { p.program[2].rule = 'implicit'; },
        p => { p.program[4].guards = 'infer'; }, p => { p.program[3].actual = []; }, p => { p.program.reverse(); }]) {
        const bad = corpusAuthorities(); replaceDocument(bad, 'profile', mutation);
        assert.throws(() => generate(input, bad), /causal_authoring_/);
    }
    const missing = structuredClone(graph); missing.edges = [];
    assert.throws(() => generate(project({ graph: missing, claim }), f), /causal_authoring_reference/);
});

test('N02G:AUTHOR-GENERATE-003 profile fields are typed before branching, including absent optional fields', () => {
    const f = corpusAuthorities(); const claim = f.claims[0]; const input = project({ graph: f.graphs.find(g => g.fact_key === claim.fact_key), claim });
    for (const mutate of [p => { p.program[4].compensation_field = 'invented'; },
        p => { p.program[4].reference_by_kind.account = 'merchant_key'; },
        p => { p.program[4].state_field = 'id'; }, p => { p.program[3].field = 'label'; },
        p => { p.program[5].field = 'id'; }, p => { p.program[4].eligible_class = 'invented'; }]) {
        const bad = corpusAuthorities(); replaceDocument(bad, 'profile', mutate);
        assert.throws(() => generate(input, bad), /causal_authoring_program_/);
    }
});

function mutateSnapshot(f, kind, refId, change) {
    const material = JSON.parse(f.documents.find(d => d.path === f.paths.material_registry).content);
    replaceDocument(f, 'snapshot_manifest', manifest => {
        const snapshot = manifest.snapshots.find(s => s.kind === kind && s.ref_id === refId);
        assert.ok(snapshot); change(snapshot.payload);
        const payload = Object.fromEntries(Object.entries(snapshot.payload).filter(([field]) => material.kinds[kind].fields[field].class !== 'non_material'));
        snapshot.semantic_fingerprint = `sha256:${semanticDigest({ registry_version: material.registry_version,
            kind, ref_id: snapshot.ref_id, version: snapshot.version, payload })}`;
    });
}
const normalized = xs => xs.map(x => JSON.stringify(x)).sort();
test('N02G:AUTHOR-GENERATE-004 aliases, edge IDs and roster order cannot encode special cases', () => {
    const f = corpusAuthorities(); const claim = structuredClone(f.claims[0]);
    const graph = structuredClone(f.graphs.find(g => g.fact_key === claim.fact_key));
    const original = generate(project({ graph, claim }), f);
    const aliases = Object.fromEntries(Object.keys(graph.nodes).map((a, i) => [a, `renamed_${i}`]));
    const edgeIds = Object.fromEntries(graph.edges.map((e, i) => [e.id, `relation_${i}`]));
    graph.nodes = Object.fromEntries(Object.entries(graph.nodes).reverse().map(([alias, node]) => [aliases[alias], node]));
    graph.edges = graph.edges.reverse().map(e => ({ ...e, id: edgeIds[e.id], source: aliases[e.source], target: aliases[e.target] }));
    for (const role of Object.values(claim.operand_bindings)) {
        if (role.alias) role.alias = aliases[role.alias];
        if (role.aliases) role.aliases = role.aliases.reverse().map(a => aliases[a]);
    }
    const renamed = generate(project({ graph, claim }), f);
    const reverse = { ...Object.fromEntries(Object.entries(aliases).map(([a, b]) => [b, a])), ...Object.fromEntries(Object.entries(edgeIds).map(([a, b]) => [b, a])) };
    const restore = value => typeof value === 'string' ? reverse[value] || value : Array.isArray(value) ? value.map(restore)
        : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, restore(v)])) : value;
    for (const dimension of Object.keys(original.obligations)) {
        assert.deepEqual(normalized(restore(renamed.obligations[dimension])), normalized(original.obligations[dimension]), dimension);
    }
});

test('N02G:AUTHOR-GENERATE-005 financial exclusion removes only the conditional contribution, not declared prior guards', () => {
    const f = corpusAuthorities(); const claim = f.claims[0]; const graph = f.graphs.find(g => g.fact_key === claim.fact_key);
    const input = project({ graph, claim }); const original = generate(input, f);
    const contribution = original.obligations.required_reads.find(r => r.segments[0] === 'amount_minor');
    assert.ok(contribution); const ref = graph.nodes[contribution.node].ref_id;
    for (const change of [p => { p.state = 'projected'; }, p => { p.date = '2043-01-01'; }]) {
        const altered = corpusAuthorities(); mutateSnapshot(altered, 'event', ref, change);
        const result = generate(input, altered);
        assert.deepEqual(result.obligations, { ...original.obligations,
            required_reads: original.obligations.required_reads.filter(r => r.node !== contribution.node || r.segments[0] !== 'amount_minor') });
    }
});

test('N02G:AUTHOR-GENERATE-006 statement closing boundaries are civil, exact and never clamped', () => {
    const f = corpusAuthorities('statement_total'); const claim = f.claims[0]; const graph = f.graphs.find(g => g.fact_key === claim.fact_key);
    const input = project({ graph, claim }); const original = generate(input, f);
    const contribution = original.obligations.required_reads.find(r => r.segments[0] === 'amount_minor');
    const cardId = graph.nodes[claim.operand_bindings.card.alias].ref_id;
    const manifest = JSON.parse(f.documents.find(d => d.path === f.paths.snapshot_manifest).content);
    const card = manifest.snapshots.find(s => s.kind === 'card' && s.ref_id === cardId).payload;
    const [year, month] = claim.period.value.split('-').map(Number);
    const civil = (y, m, day) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    for (const [date, included] of [[civil(year, month, card.closing_day), true],
        [civil(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1, card.closing_day), false]]) {
        const changed = corpusAuthorities('statement_total');
        mutateSnapshot(changed, 'event', graph.nodes[contribution.node].ref_id, p => { p.date = date; });
        const reads = generate(input, changed).obligations.required_reads;
        assert.equal(reads.some(r => r.node === contribution.node && r.segments[0] === 'amount_minor'), included);
    }
    const impossible = corpusAuthorities('statement_total');
    mutateSnapshot(impossible, 'card', cardId, p => { p.closing_day = 31; });
    const alteredClaim = structuredClone(claim); alteredClaim.period.value = `2042-03-${String(card.due_day).padStart(2, '0')}`;
    assert.throws(() => generate(project({ graph, claim: alteredClaim }), impossible), /causal_authoring_civil_date/);
});

test('N02G:AUTHOR-GENERATE-007 contribution values cannot become a second financial oracle for read obligations', () => {
    const f = corpusAuthorities(); const claim = f.claims[0]; const graph = f.graphs.find(g => g.fact_key === claim.fact_key);
    const input = project({ graph, claim }); const original = generate(input, f);
    const contribution = original.obligations.required_reads.find(r => r.segments[0] === 'amount_minor');
    for (const amount of [0, 1, -1, 7351]) {
        const changed = corpusAuthorities();
        mutateSnapshot(changed, 'event', graph.nodes[contribution.node].ref_id, p => { p.amount_minor = amount; });
        assert.deepEqual(generate(input, changed).obligations, original.obligations);
    }
});

test('N02G:AUTHOR-GENERATE-008 foreign target identity remains required even when its contribution is excluded', () => {
    const f = corpusAuthorities(); const claim = f.claims.find(c => c.subject.kind === 'account');
    const graph = f.graphs.find(g => g.fact_key === claim.fact_key); const input = project({ graph, claim });
    const result = generate(input, f);
    const foreign = graph.edges.find(e => e.field === 'account_id' && graph.nodes[e.target].ref_id !== claim.subject.ref_id
        && claim.operand_bindings.events.aliases.includes(e.source));
    assert.ok(foreign);
    assert.ok(result.obligations.required_nodes.includes(foreign.target));
    assert.ok(result.obligations.required_reads.some(r => r.node === foreign.target && r.segments.join('/') === 'id'));
    assert.ok(result.obligations.required_edges.includes(foreign.id));
    assert.equal(result.obligations.required_reads.some(r => r.node === foreign.source && r.segments.join('/') === 'amount_minor'), false);
    const wrongVersion = structuredClone(graph); wrongVersion.nodes[foreign.target].version = digest('unbound-version');
    assert.throws(() => generate(project({ graph: wrongVersion, claim }), f), /causal_authoring_node_snapshot/);
    const wrongIdentity = corpusAuthorities();
    mutateSnapshot(wrongIdentity, graph.nodes[foreign.target].kind, graph.nodes[foreign.target].ref_id, p => { p.id = 'incoherent-id'; });
    assert.throws(() => generate(input, wrongIdentity), /causal_authoring_snapshot_identity/);
    const unsupportedPolicy = corpusAuthorities();
    replaceDocument(unsupportedPolicy, 'profile', p => { p.foreign_reference_policy = 'identity_version_only_for_matching_id'; });
    assert.throws(() => generate(input, unsupportedPolicy), /causal_authoring_reference_policy_not_implemented/);
});

test('N02G:AUTHOR-GENERATE-010 same instrument ID at another admitted version cannot contribute to the bound instrument', () => {
    for (const metric of ['consumption_by_instrument', 'statement_total']) {
        const f = corpusAuthorities(metric);
        for (const originalClaim of f.claims) {
            const changed = corpusAuthorities(metric); const claim = structuredClone(originalClaim);
            const graph = structuredClone(changed.graphs.find(g => g.fact_key === claim.fact_key));
            const original = generate(project({ graph, claim }), changed);
            const contribution = original.obligations.required_reads.find(r => r.segments[0] === 'amount_minor');
            assert.ok(contribution);
            const role = claim.operand_bindings.instrument || claim.operand_bindings.card;
            const target = graph.nodes[role.alias];
            const edge = graph.edges.find(e => e.source === contribution.node && e.field === `${target.kind}_id`);
            assert.ok(edge);
            const material = JSON.parse(changed.documents.find(d => d.path === changed.paths.material_registry).content);
            let otherVersion;
            replaceDocument(changed, 'snapshot_manifest', manifest => {
                otherVersion = manifest.sources.find(s => s.sha256 !== target.version).sha256;
                assert.ok(otherVersion);
                const copy = structuredClone(manifest.snapshots.find(s => s.kind === target.kind
                    && s.ref_id === target.ref_id && s.version === target.version));
                copy.version = otherVersion;
                const payload = Object.fromEntries(Object.entries(copy.payload)
                    .filter(([field]) => material.kinds[copy.kind].fields[field].class !== 'non_material'));
                copy.semantic_fingerprint = `sha256:${semanticDigest({ registry_version: material.registry_version,
                    kind: copy.kind, ref_id: copy.ref_id, version: copy.version, payload })}`;
                manifest.snapshots.push(copy);
            });
            graph.nodes.alternate_instrument_version = { ...target, version: otherVersion };
            edge.target = 'alternate_instrument_version';
            // Synthetic, self-admitted authority: not a claim of source authenticity.
            const result = generate(project({ graph, claim }), changed);
            assert.ok(result.obligations.required_nodes.includes(edge.target));
            assert.ok(result.obligations.required_reads.some(r => r.node === edge.target && r.segments[0] === 'id'));
            assert.ok(result.obligations.required_edges.includes(edge.id));
            assert.equal(result.obligations.required_reads.some(r => r.node === contribution.node
                && r.segments[0] === 'amount_minor'), false, `${claim.fact_key}: version participates in scope`);
        }
    }
});

test('N02G:AUTHOR-GENERATE-011 compensation source must be expense before financial exclusion', () => {
    for (const metric of ['consumption_by_instrument', 'statement_total']) {
        const original = corpusAuthorities(metric);
        for (const originalClaim of original.claims) for (const sourceClass of ['income', 'neutral']) {
            for (const state of ['confirmed', 'projected']) {
                const f = corpusAuthorities(metric); const claim = structuredClone(originalClaim);
                const graph = structuredClone(f.graphs.find(g => g.fact_key === claim.fact_key));
                const link = graph.edges.find(e => e.field === 'compensates' && claim.operand_bindings.events.aliases.includes(e.source));
                assert.ok(link);
                const sourceCategory = graph.edges.find(e => e.source === link.target && e.field === 'category_id');
                assert.ok(sourceCategory);
                const manifest = JSON.parse(f.documents.find(d => d.path === f.paths.snapshot_manifest).content);
                const categoryAlias = claim.operand_bindings.categories.aliases.find(alias => manifest.snapshots.some(s =>
                    s.kind === 'category' && s.ref_id === graph.nodes[alias].ref_id && s.payload.kind === sourceClass));
                assert.ok(categoryAlias);
                sourceCategory.target = categoryAlias;
                mutateSnapshot(f, 'event', graph.nodes[link.target].ref_id, p => { p.category_id = graph.nodes[categoryAlias].ref_id; });
                mutateSnapshot(f, 'event', graph.nodes[link.source].ref_id, p => { p.state = state; });
                const input = project({ graph, claim });
                // Valid typed material inputs, not authenticated external sources.
                assert.equal(validate(input, f).stage, 'causal_authoring_inputs_validated_only');
                assert.throws(() => generate(input, f), /causal_authoring_program_compensation_source_class/,
                    `${claim.fact_key}: ${sourceClass}/${state} source must fail before filtering`);
            }
        }
    }
});

test('N02G:AUTHOR-GENERATE-009 an absent optional instrument reference still has an obligation but no invented read or traversal', () => {
    const f = corpusAuthorities(); const claim = f.claims.find(c => c.subject.kind === 'account');
    const graph = f.graphs.find(g => g.fact_key === claim.fact_key); const input = project({ graph, claim });
    const original = generate(input, f);
    const edge = graph.edges.find(e => e.field === 'account_id' && graph.nodes[e.target].ref_id === claim.subject.ref_id
        && original.obligations.required_reads.some(r => r.node === e.source && r.segments.join('/') === 'amount_minor'));
    assert.ok(edge);
    const absent = corpusAuthorities(); mutateSnapshot(absent, 'event', graph.nodes[edge.source].ref_id, p => { delete p.account_id; });
    const withoutEdge = structuredClone(graph); withoutEdge.edges = withoutEdge.edges.filter(e => e.id !== edge.id);
    const result = generate(project({ graph: withoutEdge, claim }), absent);
    assert.ok(result.obligations.required_structural.some(s => s.node === edge.source && s.operation === 'has' && s.segments.join('/') === 'account_id'));
    assert.equal(result.obligations.required_reads.some(r => r.node === edge.source && ['account_id', 'amount_minor'].includes(r.segments.join('/'))), false);
    assert.equal(result.obligations.required_edges.includes(edge.id), false);
    assert.ok(result.obligations.required_reads.some(r => r.node === edge.source && r.segments.join('/') === 'category_id'));
});

test('N02G:AUTHOR-ISOLATION-001 a fresh generator process loads no evaluator, recorder, compiler, comparator or oracle', () => {
    const root = path.resolve(__dirname, '../../..');
    const output = execFileSync(process.execPath, ['-e', `require('./scripts/agent/nextCausalAuthoring.cjs');
        const loaded = Object.keys(require.cache).map(x => x.replaceAll('\\\\', '/'));
        const forbidden = loaded.filter(x => /src\\/next\\/provenance\\/|validateFinancasBotNextFacts|golden-oracle|diagnoseNextProvenance/.test(x));
        if (forbidden.length) throw new Error('forbidden dependency'); process.stdout.write('isolated');`], { cwd: root, encoding: 'utf8' });
    assert.equal(output, 'isolated');
});

test('N02G:AUTHOR-REPORT-001 post-generation diff preserves every graph and old-expected mutation affects only the comparison', () => {
    const { buildCandidateReport } = require('../../../scripts/agent/reportNextCausalAuthoring.cjs');
    const root = path.resolve(__dirname, '../../..');
    const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
    const original = buildCandidateReport(read);
    assert.equal(original.candidate_graphs, 6); assert.equal(original.source_graphs, 76);
    assert.equal(original.outside_profile_unchanged, 70);
    assert.equal(original.entire_input_corpus_unchanged, true); assert.equal(original.claims_unchanged, true);
    assert.equal(original.normative_application_allowed, false);
    const changed = buildCandidateReport(file => {
        const text = read(file); if (!file.endsWith('/graphs-v2.json')) return text;
        const corpus = JSON.parse(text);
        for (const graph of corpus.graphs) {
            for (const dimension of ['required_nodes', 'required_reads', 'required_edges', 'required_claim_reads', 'required_structural']) {
                graph.trace_contract.derivation[dimension] = [];
            }
            graph.trace_contract.proof = { arbitrary: true }; graph.sets = {}; graph.predicates = []; graph.selections = [];
        }
        return JSON.stringify(corpus);
    });
    assert.notEqual(changed.source_corpus_sha256, original.source_corpus_sha256);
    assert.deepEqual(changed.records.map(r => r.candidate), original.records.map(r => r.candidate));
    assert.notDeepEqual(changed.totals, original.totals);
});

test('N02G:AUTHOR-REPORT-002 CLI refuses a destination outside temporary storage and unknown arguments before generation', () => {
    const root = path.resolve(__dirname, '../../..');
    for (const args of [['--output', 'docs/forbidden.json'], ['--apply'], ['--output', '.codex-temp/../forbidden.json']]) {
        const result = spawnSync(process.execPath, ['scripts/agent/reportNextCausalAuthoring.cjs', ...args], { cwd: root, encoding: 'utf8' });
        assert.equal(result.status, 1); assert.match(result.stderr, /Usage:/);
        assert.equal(result.stdout, '');
    }
});
