'use strict';
// Offline documentary composition. No evaluator, actual, recorder or oracle.
const fs = require('node:fs'); const path = require('node:path');
const assert = require('node:assert/strict'); const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const base = 'f51b32f4f6a57364ddac1cb7e0282af7017a5d4a';
const prefix = 'docs/contracts/next/provenance-v2/';
const output = path.join(__dirname, 'direct-event-proposal-v2.json');
const sha = x => `sha256:${createHash('sha256').update(x).digest('hex')}`;
const documents = new Map();
function read(file) {
    const text = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
    const original = execFileSync('git', ['show', `${base}:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).replaceAll('\r\n', '\n');
    assert.equal(text, original, `source_changed:${file}`);
    documents.set(file, { path: file, lf_sha256: sha(text), bytes: Buffer.byteLength(text),
        blob: execFileSync('git', ['rev-parse', `${base}:${file}`], { cwd: root, encoding: 'utf8' }).trim() });
    return text;
}
// Verify the only repo-code dependency before loading it.
read('src/next/kernel/canonicalValue.js');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const digest = x => sha(canonicalValue(x));
const sorted = xs => [...xs].sort((a, b) => canonicalValue(a).localeCompare(canonicalValue(b), 'en'));
const corpus = JSON.parse(read(prefix + 'graphs-v2.json'));
const claims = JSON.parse(read(prefix + 'claims-v2.json')).claims;
const registry = JSON.parse(read(prefix + 'metric-evaluator-registry-v1.json'));
const schema = JSON.parse(read(prefix + 'evidence-snapshot.schema.json'));
read(prefix + 'material-field-registry-v1.json'); read(prefix + 'graph-binding-contract-v1.md');
const manifest = read(corpus.snapshot_manifest.path); assert.equal(sha(manifest), corpus.snapshot_manifest.hash);
const snapshots = JSON.parse(manifest).snapshots;
const profiles = {
    balance_delta: { subject: 'account', references: { account_id: 'account' }, scalar: ['amount_minor'], card: false, keys: false },
    invoice_payment_amount: { subject: 'event', references: { category_id: 'category', account_id: 'account', settles_card_id: 'card' }, nominal_references: { category_id: 'neutral.invoice_payment' }, scalar: ['amount_minor'], card: false, keys: false },
    invoice_payment_target_card: { subject: 'event', references: { settles_card_id: 'card' }, scalar: [], card: true, keys: false },
    statement_payment_correspondence: { subject: 'event', references: {}, scalar: [], card: false, keys: true }
};
const metrics = Object.keys(profiles);
const contracts = metrics.map(metric => {
    const entries = registry.entries.filter(e => e.evaluator_id === metric && e.evaluator_version === 1);
    assert.equal(entries.length, 1); const e = entries[0]; const text = read(e.contract_path);
    assert.equal(sha(text), e.evaluator_contract_hash);
    return { evaluator_id: metric, evaluator_version: 1, roles: e.roles, contract: JSON.parse(text) };
});
const eventSchema = schema.definitions.payload_event;
assert.equal(eventSchema.additionalProperties, false);
const forbiddenStatementFields = ['statement_id', 'settles_statement_id', 'settles_statement_period'];
for (const field of forbiddenStatementFields) assert.equal(Object.hasOwn(eventSchema.properties, field), false);
assert.equal(corpus.graphs.length, 76); assert.equal(new Set(corpus.graphs.map(g => g.fact_key)).size, 76);
assert.equal(new Set(claims.map(c => c.fact_key)).size, claims.length);
function snapshot(graph, alias, kind, pool = snapshots) {
    const node = graph.nodes[alias]; assert.ok(node); assert.equal(node.binding, 'snapshot');
    assert.equal(node.kind, kind);
    const found = pool.filter(s => s.kind === kind && s.ref_id === node.ref_id && s.version === node.version);
    assert.equal(found.length, 1); const s = found[0]; assert.equal(s.payload.id, node.ref_id);
    assert.equal(s.semantic_fingerprint, node.semantic_fingerprint); return s;
}
function relation(graph, alias, field, kind, pool = snapshots) {
    const source = snapshot(graph, alias, graph.nodes[alias].kind, pool);
    const links = graph.edges.filter(e => e.source === alias && e.field === field && e.relation === 'material_ref');
    assert.equal(links.length, 1, 'relation_cardinality'); const edge = links[0];
    const target = snapshot(graph, edge.target, kind, pool); assert.equal(source.payload[field], target.payload.id, 'relation_value');
    return edge;
}
const dimensions = ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural'];
function normalize(d) { return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, dimensions.includes(k) ? sorted(v) : v])); }
function compose(claim, graph, pool = snapshots) {
    assert.ok(Object.hasOwn(profiles, claim.metric), 'unknown_metric');
    assert.equal(claim.evaluator_ref.evaluator_id, claim.metric); assert.equal(claim.evaluator_ref.evaluator_version, 1);
    const profile = profiles[claim.metric]; const bindings = claim.operand_bindings;
    const contract = contracts.find(c => c.evaluator_id === claim.metric);
    assert.deepEqual(Object.keys(bindings).sort(), contract.roles.map(r => r.role_id).sort(), 'role_inventory');
    for (const r of contract.roles) assert.equal(bindings[r.role_id].kind, r.input_kind === 'claim_context' ? 'claim_context' : 'node');
    assert.deepEqual(bindings.context, { kind: 'claim_context' });
    assert.equal(bindings.event.kind, 'node'); const eventAlias = bindings.event.alias;
    const event = snapshot(graph, eventAlias, 'event', pool);
    assert.equal(claim.subject.kind, profile.subject); assert.equal(claim.time_basis, 'event_date');
    assert.equal(claim.period.kind, 'date');
    const d = { required_nodes: [eventAlias], required_reads: [], required_claim_reads: [], required_edges: [], required_structural: [],
        selected_nodes: [], evidence_set_mode: 'exact', required_selections: [] };
    const reasons = [];
    function readScalar(node, field, reason) {
        d.required_reads.push({ node, segments: [field] }); reasons.push({ dimension: 'read', node, field, reason });
    }
    for (const field of ['id', 'date', 'state']) readScalar(eventAlias, field, 'queried_event_identity_date_confirmed_guard');
    for (const segments of [['subject', 'kind'], ['subject', 'ref_id'], ['period', 'kind'], ['period', 'value'], ['time_basis']])
        d.required_claim_reads.push({ segments });
    for (const [field, kind] of Object.entries(profile.references)) {
        const edge = relation(graph, eventAlias, field, kind, pool);
        if (Object.hasOwn(profile.nominal_references || {}, field))
            assert.equal(event.payload[field], profile.nominal_references[field], `nominal_reference_mismatch:${field}`);
        readScalar(eventAlias, field, `${claim.metric}:contract_reference`); d.required_edges.push(edge.id);
        reasons.push({ dimension: 'edge', id: edge.id, reason: `${claim.metric}:resolved_${field}` });
    }
    for (const field of profile.scalar) readScalar(eventAlias, field, `${claim.metric}:functional_amount`);
    if (profile.card) {
        assert.equal(bindings.card.kind, 'node'); const alias = bindings.card.alias;
        const card = snapshot(graph, alias, 'card', pool); const edge = relation(graph, eventAlias, 'settles_card_id', 'card', pool);
        assert.equal(graph.nodes[edge.target].ref_id, card.ref_id); assert.equal(graph.nodes[edge.target].version, card.version);
        assert.equal(edge.target, alias, 'card_role_alias'); d.required_nodes.push(alias);
        readScalar(alias, 'id', 'returned_card_identity_bound_to_card_role');
    }
    if (profile.keys) {
        for (const field of Object.keys(event.payload))
            assert.ok(Object.hasOwn(eventSchema.properties, field), `event_schema_extra_key:${field}`);
        d.required_structural.push({ node: eventAlias, operation: 'keys', segments: [] });
        reasons.push({ dimension: 'structural', node: eventAlias, operation: 'keys', reason: 'schema_and_observed_absence_of_statement_link' });
    }
    return { derivation: normalize(d), reasons };
}
function delta(a, b) {
    return Object.fromEntries(dimensions.map(key => [key, {
        added: b[key].filter(x => !a[key].some(y => digest(x) === digest(y))),
        removed: a[key].filter(x => !b[key].some(y => digest(x) === digest(y)))
    }]));
}
const before = digest(corpus); const records = [];
for (const claim of claims.filter(c => metrics.includes(c.evaluator_ref.evaluator_id))) {
    const found = corpus.graphs.filter(g => g.fact_key === claim.fact_key); assert.equal(found.length, 1);
    const graph = found[0]; assert.equal(graph.claim_id, claim.claim_id);
    const current = graph.trace_contract.derivation;
    assert.deepEqual(current.required_selections, []); assert.deepEqual(current.selected_nodes, []); assert.equal(current.evidence_set_mode, 'exact');
    const proposed = compose(claim, graph);
    const sources = [claim.operand_bindings.event.alias, ...(claim.operand_bindings.card ? [claim.operand_bindings.card.alias] : [])];
    const links = graph.edges.filter(e => sources.includes(e.source) && e.relation === 'material_ref').map(edge => ({ edge,
        source_binding: graph.nodes[edge.source], target_binding: graph.nodes[edge.target],
        proof_required: graph.trace_contract.proof.required_edges.includes(edge.id),
        target_proof_reads: graph.trace_contract.proof.required_reads.filter(r => r.node === edge.target) }));
    const ids = new Set(links.flatMap(l => l.edge.proof_predicates));
    const predicates = graph.predicates.filter(p => ids.has(p.id)); assert.equal(predicates.length, ids.size);
    records.push({ fact_key: claim.fact_key, evaluator_ref: claim.evaluator_ref, operand_bindings: claim.operand_bindings,
        current_derivation: current, proposed_derivation: proposed.derivation, reasons: proposed.reasons,
        delta: delta(current, proposed.derivation), links, proof_predicates: predicates,
        source_graph_sha256: digest(graph), proof_preserved_sha256: digest(graph.trace_contract.proof) });
}
assert.equal(records.length, 5);
const simulated = structuredClone(corpus);
for (const r of records) simulated.graphs.find(g => g.fact_key === r.fact_key).trace_contract.derivation = r.proposed_derivation;
for (let i = 0; i < simulated.graphs.length; i++) {
    assert.deepEqual(simulated.graphs[i].trace_contract.proof, corpus.graphs[i].trace_contract.proof);
    const copy = structuredClone(simulated.graphs[i]); copy.trace_contract.derivation = corpus.graphs[i].trace_contract.derivation;
    assert.deepEqual(copy, corpus.graphs[i]);
}
assert.equal(simulated.graphs.filter((g, i) => digest(g) !== digest(corpus.graphs[i])).length, 5);
// Test the entire profile output, not only the keys delta.
let renamedCases = 0; let oldTraceMutations = 0; let reorderedCases = 0;
for (const record of records) {
    const claim = claims.find(c => c.fact_key === record.fact_key); const graph = corpus.graphs.find(g => g.fact_key === record.fact_key);
    for (const suffix of ['a', 'b', 'c']) {
        const aliasMap = Object.fromEntries(Object.keys(graph.nodes).map((a, i) => [a, `node-${suffix}-${i}`]));
        const edgeMap = Object.fromEntries(graph.edges.map((e, i) => [e.id, `edge-${suffix}-${i}`]));
        const g = structuredClone(graph); const c = structuredClone(claim);
        g.nodes = Object.fromEntries(Object.entries(g.nodes).reverse().map(([a, n]) => [aliasMap[a], n]));
        g.edges = g.edges.reverse().map(e => ({ ...e, id: edgeMap[e.id], source: aliasMap[e.source], target: aliasMap[e.target] }));
        for (const b of Object.values(c.operand_bindings)) if (b.kind === 'node') b.alias = aliasMap[b.alias];
        const expected = structuredClone(record.proposed_derivation);
        expected.required_nodes = expected.required_nodes.map(n => aliasMap[n]);
        expected.required_reads = expected.required_reads.map(r => ({ ...r, node: aliasMap[r.node] }));
        expected.required_structural = expected.required_structural.map(r => ({ ...r, node: aliasMap[r.node] }));
        expected.required_edges = expected.required_edges.map(e => edgeMap[e]);
        assert.deepEqual(compose(c, g).derivation, normalize(expected)); renamedCases++;
    }
    const g = structuredClone(graph); g.trace_contract.derivation = { deliberately: 'not_an_input' };
    assert.deepEqual(compose(claim, g).derivation, record.proposed_derivation); oldTraceMutations++;
    const reversedGraph = [...corpus.graphs].reverse().find(g => g.fact_key === record.fact_key);
    const reversedClaim = [...claims].reverse().find(c => c.fact_key === record.fact_key);
    assert.deepEqual(compose(reversedClaim, reversedGraph).derivation, record.proposed_derivation); reorderedCases++;
}
const negatives = [];
function rejects(name, fn, expected) { assert.throws(fn, expected); negatives.push(name); }
const amountClaim = claims.find(c => c.metric === 'invoice_payment_amount');
const amountGraph = corpus.graphs.find(g => g.fact_key === amountClaim.fact_key);
rejects('unknown_metric', () => compose({ ...amountClaim, metric: 'unknown' }, amountGraph));
rejects('invalid_event_role', () => compose({ ...amountClaim, operand_bindings: { ...amountClaim.operand_bindings, event: { kind: 'node_set', aliases: [] } } }, amountGraph));
rejects('extra_role', () => compose({ ...amountClaim, operand_bindings: { ...amountClaim.operand_bindings, extra: { kind: 'node', alias: 'x' } } }, amountGraph));
const accountEdge = amountGraph.edges.find(e => e.source === amountClaim.operand_bindings.event.alias && e.field === 'account_id');
rejects('missing_account_relation', () => compose(amountClaim, { ...amountGraph, edges: amountGraph.edges.filter(e => e.id !== accountEdge.id) }));
rejects('duplicate_account_relation', () => compose(amountClaim, { ...amountGraph, edges: [...amountGraph.edges, { ...accountEdge, id: 'duplicate' }] }));
const personAlias = Object.keys(amountGraph.nodes).find(a => amountGraph.nodes[a].kind === 'person');
rejects('wrong_account_target_kind', () => compose(amountClaim, { ...amountGraph, edges: amountGraph.edges.map(e => e.id === accountEdge.id ? { ...e, target: personAlias } : e) }));
const otherAccount = snapshots.find(s => s.kind === 'account' && s.ref_id !== amountGraph.nodes[accountEdge.target].ref_id);
assert.ok(otherAccount);
const mismatchedGraph = structuredClone(amountGraph);
mismatchedGraph.nodes.foreign_account = { ...mismatchedGraph.nodes[accountEdge.target], ref_id: otherAccount.ref_id,
    version: otherAccount.version, semantic_fingerprint: otherAccount.semantic_fingerprint };
mismatchedGraph.edges = mismatchedGraph.edges.map(e => e.id === accountEdge.id ? { ...e, target: 'foreign_account' } : e);
rejects('same_kind_account_value_mismatch', () => compose(amountClaim, mismatchedGraph));
const targetClaim = claims.find(c => c.metric === 'invoice_payment_target_card');
const targetGraph = corpus.graphs.find(g => g.fact_key === targetClaim.fact_key);
rejects('wrong_card_role', () => compose({ ...targetClaim, operand_bindings: { ...targetClaim.operand_bindings, card: { kind: 'node', alias: targetClaim.operand_bindings.event.alias } } }, targetGraph));
// Synthetic composition inputs, not admitted production snapshots. Change a
// copied pool only; exact error assertions prove the intended semantic guard,
// not file pinning, a broken reference or a different nominal kind, rejects it.
const originalPoolDigest = digest(snapshots);
const categoryEdge = amountGraph.edges.find(e => e.source === amountClaim.operand_bindings.event.alias && e.field === 'category_id');
const otherCategories = snapshots.filter(s => s.kind === 'category' && s.ref_id !== 'neutral.invoice_payment');
assert.ok(otherCategories.length > 1);
for (const alternative of otherCategories) {
    const pool = structuredClone(snapshots); const graph = structuredClone(amountGraph);
    const source = snapshot(graph, amountClaim.operand_bindings.event.alias, 'event', pool);
    source.payload.category_id = alternative.ref_id;
    graph.nodes.alternative_category = { ...graph.nodes[categoryEdge.target], ref_id: alternative.ref_id,
        version: alternative.version, semantic_fingerprint: alternative.semantic_fingerprint };
    graph.edges = graph.edges.map(e => e.id === categoryEdge.id ? { ...e, target: 'alternative_category' } : e);
    // Control: a structurally coherent same-kind relation really exists.
    assert.equal(relation(graph, amountClaim.operand_bindings.event.alias, 'category_id', 'category', pool).target, 'alternative_category');
    rejects(`wrong_nominal_category:${alternative.ref_id}`, () => compose(amountClaim, graph, pool), /nominal_reference_mismatch/);
}
const correspondenceClaim = claims.find(c => c.metric === 'statement_payment_correspondence');
const correspondenceGraph = corpus.graphs.find(g => g.fact_key === correspondenceClaim.fact_key);
for (const field of [...Array.from({ length: 32 }, (_, i) => `extension_${i}`), ...forbiddenStatementFields, 'unreviewed_link', 'future_metadata', 'Statement_Id']) {
    assert.equal(Object.hasOwn(eventSchema.properties, field), false);
    const pool = structuredClone(snapshots);
    snapshot(correspondenceGraph, correspondenceClaim.operand_bindings.event.alias, 'event', pool).payload[field] = 'synthetic';
    rejects(`event_schema_extra_key:${field}`, () => compose(correspondenceClaim, correspondenceGraph, pool), /event_schema_extra_key/);
}
assert.equal(digest(snapshots), originalPoolDigest);
assert.equal(digest(corpus), before);
const totals = Object.fromEntries(dimensions.map(k => [k, { added: records.reduce((n, r) => n + r.delta[k].added.length, 0), removed: records.reduce((n, r) => n + r.delta[k].removed.length, 0) }]));
const record = { schema: 'n02g-direct-event-proposal-v2', base, status: 'documentary_proposal_not_applied',
    graph_accepted: false, normative_application_allowed: false, runtime_approval: false,
    source_corpus_sha256: before, documents: [...documents.values()], profiles, contracts, records,
    proposed_totals: { changed_graphs: 5, unchanged_graphs: 71, dimensions: totals },
    checks: { full_profile_renamed_cases: renamedCases, corpus_reordered_cases: reorderedCases,
        prior_trace_contract_ignored_cases: oldTraceMutations, negative_cases: negatives,
        all_proof_structurally_preserved: true, non_derivation_fields_preserved: true, original_corpus_unchanged: true },
    limits: 'Identity and proposal mechanics only; no evaluator, trace, oracle, semantic fingerprint recomputation, proof sufficiency or financial execution. No runtime/global/production approval.' };
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), record);
console.log(JSON.stringify({ valid: true, mode, base, documents: documents.size, proposed_totals: record.proposed_totals, checks: record.checks }));
