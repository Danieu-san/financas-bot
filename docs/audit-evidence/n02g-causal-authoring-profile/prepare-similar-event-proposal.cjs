'use strict';
// Documentary authoring only: no evaluator, trace, oracle or normative writes.
const fs = require('node:fs'); const path = require('node:path');
const assert = require('node:assert/strict'); const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const base = 'c3db3ecb8ffe4af681ec2547df6abb13896e9c40';
const prefix = 'docs/contracts/next/provenance-v2/';
const output = path.join(__dirname, 'similar-event-proposal.json');
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
read('src/next/kernel/canonicalValue.js'); read('src/next/provenance/civilCalendar.js');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const { parseMonth, parseDate } = require('../../../src/next/provenance/civilCalendar');
const digest = x => sha(canonicalValue(x));
const sorted = xs => [...xs].sort((a, b) => canonicalValue(a).localeCompare(canonicalValue(b), 'en'));
const unique = xs => sorted([...new Map(xs.map(x => [canonicalValue(x), x])).values()]);
const dimensions = ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural'];
const profile = {
    evaluator_id: 'similar_event_ids', evaluator_version: 1,
    context: { subject_kind: 'merchant', period_kind: 'month', time_basis: 'event_date',
        reads: [['subject', 'kind'], ['subject', 'ref_id'], ['period', 'kind'], ['period', 'value'], ['time_basis']] },
    scope: { role: 'merchant', kind: 'merchant_identity', reads: ['id'] },
    population: { role: 'events', kind: 'event', reads: ['id', 'date', 'state'],
        optional_references: [{ field: 'merchant_key', target_kind: 'merchant_identity', target_reads: ['id'] }] }
};
const corpus = JSON.parse(read(prefix + 'graphs-v2.json'));
const claims = JSON.parse(read(prefix + 'claims-v2.json')).claims;
const registry = JSON.parse(read(prefix + 'metric-evaluator-registry-v1.json'));
const schema = JSON.parse(read(prefix + 'evidence-snapshot.schema.json'));
const material = JSON.parse(read(prefix + 'material-field-registry-v1.json'));
read(prefix + 'graph-binding-contract-v1.md');
read('src/next/provenance/metricDirectReads.js'); read('src/next/provenance/metricReferences.js');
read('tests/next/provenance/metricDirectReads.cases.js');
const manifestText = read(corpus.snapshot_manifest.path);
assert.equal(sha(manifestText), corpus.snapshot_manifest.hash);
const snapshots = JSON.parse(manifestText).snapshots;
const entries = registry.entries.filter(e => e.evaluator_id === profile.evaluator_id && e.evaluator_version === profile.evaluator_version);
assert.equal(entries.length, 1); const entry = entries[0]; const contractText = read(entry.contract_path);
assert.equal(sha(contractText), entry.evaluator_contract_hash);
assert.equal(material.kinds.event.fields.merchant_key.required, false);
assert.deepEqual(material.kinds.event.fields.merchant_key.targets, ['merchant_identity']);
assert.equal(schema.definitions.payload_event.required.includes('merchant_key'), false);
assert.equal(corpus.graphs.length, 76);
assert.equal(new Set(corpus.graphs.map(g => g.fact_key)).size, 76);
const sourceDigest = digest(corpus); const poolDigest = digest(snapshots);

function snapshot(graph, alias, kind, pool) {
    const node = graph.nodes[alias]; assert.ok(node, 'binding_missing');
    assert.equal(node.binding, 'snapshot', 'binding_kind'); assert.equal(node.kind, kind, 'node_kind');
    const found = pool.filter(s => s.kind === kind && s.ref_id === node.ref_id && s.version === node.version);
    assert.equal(found.length, 1, 'snapshot_identity'); const s = found[0];
    assert.equal(s.payload.id, node.ref_id, 'payload_identity');
    assert.equal(s.semantic_fingerprint, node.semantic_fingerprint, 'fingerprint_binding');
    return s;
}
// Composition consumes only profile + semantic bindings + source relations.
// It never reads graph.trace_contract, proof, selections or financial R.
function compose(claim, graph, pool) {
    assert.equal(claim.evaluator_ref.evaluator_id, profile.evaluator_id, 'evaluator_id');
    assert.equal(claim.evaluator_ref.evaluator_version, profile.evaluator_version, 'evaluator_version');
    const bindings = claim.operand_bindings;
    assert.deepEqual(Object.keys(bindings).sort(), entry.roles.map(r => r.role_id).sort(), 'role_inventory');
    for (const r of entry.roles) assert.equal(bindings[r.role_id].kind, r.input_kind, 'role_kind');
    assert.deepEqual(bindings.context, { kind: 'claim_context' }, 'context_binding');
    assert.equal(claim.subject.kind, profile.context.subject_kind, 'subject_kind');
    assert.equal(claim.period.kind, profile.context.period_kind, 'period_kind');
    assert.equal(claim.time_basis, profile.context.time_basis, 'time_basis'); parseMonth(claim.period.value);
    const scopeAlias = bindings[profile.scope.role].alias;
    const scope = snapshot(graph, scopeAlias, profile.scope.kind, pool);
    assert.equal(claim.subject.ref_id, scope.payload.id, 'subject_identity');
    const aliases = bindings[profile.population.role].aliases;
    assert.ok(Array.isArray(aliases), 'population'); assert.equal(new Set(aliases).size, aliases.length, 'duplicate_alias');
    const d = Object.fromEntries(dimensions.map(k => [k, []]));
    d.required_claim_reads = profile.context.reads.map(segments => ({ segments }));
    const consume = (alias, fields) => {
        d.required_nodes.push(alias);
        for (const field of fields) d.required_reads.push({ node: alias, segments: [field] });
    };
    consume(scopeAlias, profile.scope.reads);
    for (const alias of aliases) {
        const s = snapshot(graph, alias, profile.population.kind, pool);
        parseDate(s.payload.date); assert.ok(['confirmed', 'projected'].includes(s.payload.state), 'state');
        consume(alias, profile.population.reads);
        for (const ref of profile.population.optional_references) {
            d.required_structural.push({ node: alias, operation: 'has', segments: [ref.field] });
            // Presence is authored even when state, month or merchant excludes the event.
            if (!Object.hasOwn(s.payload, ref.field)) continue;
            const links = graph.edges.filter(e => e.source === alias && e.field === ref.field && e.relation === 'material_ref');
            assert.equal(links.length, 1, 'relation_cardinality'); const edge = links[0];
            const target = snapshot(graph, edge.target, ref.target_kind, pool);
            assert.equal(s.payload[ref.field], target.payload.id, 'relation_value');
            d.required_reads.push({ node: alias, segments: [ref.field] }); d.required_edges.push(edge.id);
            consume(edge.target, ref.target_reads);
        }
    }
    return Object.fromEntries(dimensions.map(k => [k, unique(d[k])]));
}
const relevant = claims.filter(c => c.evaluator_ref.evaluator_id === profile.evaluator_id);
assert.equal(relevant.length, 1);
const records = relevant.map(claim => {
    const found = corpus.graphs.filter(g => g.fact_key === claim.fact_key); assert.equal(found.length, 1);
    const graph = found[0]; assert.equal(graph.claim_id, claim.claim_id);
    // Both inputs below precede any execution; old expected is used only for documentary diff.
    const generated = compose(claim, graph, snapshots); const current = graph.trace_contract.derivation;
    const proposed = { ...structuredClone(current), ...generated };
    const selection = current.required_selections;
    assert.equal(selection.length, 1);
    assert.deepEqual(graph.sets[selection[0].candidate_set], claim.operand_bindings.events.aliases);
    const delta = Object.fromEntries(dimensions.map(k => [k, {
        removed: current[k].filter(x => !generated[k].some(y => canonicalValue(x) === canonicalValue(y))),
        added: generated[k].filter(x => !current[k].some(y => canonicalValue(x) === canonicalValue(y))) }]));
    return { fact_key: claim.fact_key, claim, graph_sha256: digest(graph), proof_preserved_sha256: digest(graph.trace_contract.proof),
        current_derivation: current, proposed_derivation: proposed, delta };
});
const focal = records[0];
assert.equal(focal.delta.required_reads.removed.length, 32);
assert.equal(focal.delta.required_edges.removed.length, 32);
assert.equal(focal.delta.required_structural.added.length, 16);
for (const k of dimensions) {
    if (k !== 'required_reads' && k !== 'required_edges') assert.equal(focal.delta[k].removed.length, 0);
    if (k !== 'required_structural') assert.equal(focal.delta[k].added.length, 0);
}
const simulated = structuredClone(corpus);
simulated.graphs.find(g => g.fact_key === focal.fact_key).trace_contract.derivation = focal.proposed_derivation;
assert.equal(simulated.graphs.filter((g, i) => digest(g) !== digest(corpus.graphs[i])).length, 1);
for (let i = 0; i < corpus.graphs.length; i++) {
    const copy = structuredClone(simulated.graphs[i]);
    copy.trace_contract.derivation = corpus.graphs[i].trace_contract.derivation;
    assert.deepEqual(copy, corpus.graphs[i]);
}

// Generated documentary models, NOT admitted graph mutants or evaluator tests.
let generatedCases = 0; let negativeCases = 0;
const reject = (fn, message) => { assert.throws(fn, e => e.message.includes(message)); negativeCases++; };
for (const size of [0, 1, 2, 7]) for (const reverse of [false, true]) for (const variant of [0, 1, 2]) {
    const pool = []; const graph = { nodes: {}, edges: [] };
    function bind(alias, kind, id, payload, version = 'v1') {
        const fingerprint = `synthetic-${alias}`;
        graph.nodes[alias] = { binding: 'snapshot', kind, ref_id: id, version, semantic_fingerprint: fingerprint };
        pool.push({ kind, ref_id: id, version, semantic_fingerprint: fingerprint, payload: { id, ...payload } });
    }
    bind('scope', 'merchant_identity', `query-${variant}`, {});
    bind('foreign', 'merchant_identity', variant === 2 ? `query-${variant}` : `other-${variant}`, {}, variant === 2 ? 'v2' : 'v1');
    const aliases = Array.from({ length: size }, (_, i) => `renamed-${variant}-${i}`);
    let present = 0; let foreignConsumed = false;
    for (const [i, alias] of aliases.entries()) {
        const target = i % 2 ? 'foreign' : 'scope';
        const payload = { date: i % 2 ? '2042-07-02' : '2042-06-02', state: i % 2 ? 'projected' : 'confirmed' };
        if ((i + variant) % 3 !== 0) {
            payload.merchant_key = graph.nodes[target].ref_id; present++; foreignConsumed ||= target === 'foreign';
            graph.edges.push({ id: `renamed-edge-${variant}-${i}`, source: alias, field: 'merchant_key', target, relation: 'material_ref' });
        }
        bind(alias, 'event', `event-${variant}-${i}`, payload);
    }
    const claim = { evaluator_ref: { evaluator_id: profile.evaluator_id, evaluator_version: 1 },
        subject: { kind: 'merchant', ref_id: `query-${variant}` }, period: { kind: 'month', value: '2042-06' }, time_basis: 'event_date',
        operand_bindings: { context: { kind: 'claim_context' }, merchant: { kind: 'node', alias: 'scope' },
            events: { kind: 'node_set', aliases: reverse ? [...aliases].reverse() : aliases } } };
    const result = compose(claim, graph, pool);
    assert.equal(result.required_nodes.length, size + 1 + Number(foreignConsumed));
    assert.equal(result.required_reads.length, size * 3 + present + 1 + Number(foreignConsumed));
    assert.equal(result.required_edges.length, present); assert.equal(result.required_structural.length, size);
    assert.equal(result.required_claim_reads.length, 5);
    for (const alias of aliases) assert.ok(result.required_structural.some(x => x.node === alias && x.operation === 'has'));
    graph.trace_contract = { derivation: { fabricated: true }, proof: { fabricated: true } };
    graph.selections = ['not-an-authority'];
    assert.deepEqual(compose(claim, graph, pool), result);
    const reversed = structuredClone(claim); reversed.operand_bindings.events.aliases.reverse();
    assert.deepEqual(compose(reversed, graph, pool), result);
    reject(() => compose({ ...claim, evaluator_ref: { ...claim.evaluator_ref, evaluator_version: 2 } }, graph, pool), 'evaluator_version');
    reject(() => compose({ ...claim, evaluator_ref: { ...claim.evaluator_ref, evaluator_id: 'other' } }, graph, pool), 'evaluator_id');
    reject(() => compose({ ...claim, time_basis: 'due_date' }, graph, pool), 'time_basis');
    reject(() => compose(claim, graph, [...pool, structuredClone(pool[0])]), 'snapshot_identity');
    if (present) {
        const edge = graph.edges[0];
        reject(() => compose(claim, { ...graph, edges: graph.edges.filter(e => e !== edge) }, pool), 'relation_cardinality');
        reject(() => compose(claim, { ...graph, edges: [...graph.edges, { ...edge, id: 'duplicate' }] }, pool), 'relation_cardinality');
        const changed = structuredClone(pool); changed.find(s => s.ref_id === graph.nodes[edge.source].ref_id).payload.merchant_key = 'incoherent';
        reject(() => compose(claim, graph, changed), 'relation_value');
    }
    generatedCases++;
}
assert.equal(digest(corpus), sourceDigest); assert.equal(digest(snapshots), poolDigest);
const record = { schema: 'n02g-similar-event-proposal-v1', base, status: 'documentary_proposal_not_applied',
    graph_accepted: false, normative_application_allowed: false, runtime_approval: false,
    source_corpus_sha256: sourceDigest, documents: [...documents.values()], profile, contract: JSON.parse(contractText),
    registry_entry: entry, records, checks: { generated_models: generatedCases, negative_cases: negativeCases,
        original_corpus_unchanged: true, original_pool_unchanged: true, unchanged_graphs: 75, all_proof_preserved: true },
    limits: 'Local documentary composition, not an independent verdict. No evaluator, actual, recorder, oracle, full snapshot admission/fingerprint recomputation or financial tests. No graph, host, global or production acceptance.' };
const mode = process.argv[2]; assert.ok(['--write-new', '--check'].includes(mode) && process.argv.length === 3);
if (mode === '--write-new') fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
else assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), record);
console.log(JSON.stringify({ valid: true, mode, base, documents: documents.size, checks: record.checks,
    proposed_counts: Object.fromEntries(dimensions.map(k => [k, focal.proposed_derivation[k].length])) }));
