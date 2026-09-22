'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { admitPackage } = require('../../../src/next/provenance/packageContract');
const { compileAuthoringIndex, compileAuthoringIR, compileSnapshotAccess } = require('../../../src/next/provenance/graphCompiler');
const { lowerAuthoringIR } = require('../../../src/next/provenance/authoringIR');
const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
const { compareSelectionCoverage, compareReadEdgeCoverage, comparePhaseCoverage } = require('../../../src/next/provenance/proofAcceptance');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const graphPath = prefix + 'graphs-v2.json';
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

function fixture() {
    const byPath = new Map();
    function add(file) {
        if (byPath.has(file)) return JSON.parse(byPath.get(file).bytes);
        // This test reconstructs the LF-published JSON fixture on Windows.
        // The admission module itself never performs line-ending normalization.
        const bytes = Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'));
        byPath.set(file, { path: file, bytes });
        return JSON.parse(bytes);
    }
    const graphs = add(graphPath);
    add(prefix + 'predicate-templates-v1.json');
    add(prefix + 'claim-contract.schema.json');
    add(prefix + 'evidence-snapshot.schema.json');
    for (const field of ['claim_contract', 'snapshot_manifest', 'material_registry', 'operator_registry', 'metric_evaluator_registry']) add(graphs[field].path);
    for (const source of add(graphs.snapshot_manifest.path).sources) add(source.path);
    for (const entry of add(graphs.metric_evaluator_registry.path).entries) add(entry.contract_path);
    for (const graph of graphs.graphs) for (const source of graph.authoring_sources) add(source.path);
    const entries = [...byPath.values()];
    return { entries, authority: entries.map(({ path, bytes }) => ({ path, sha256: hash(bytes) })) };
}
async function validators() {
    const builder = await import(pathToFileURL(path.join(root, 'scripts/agent/buildNextProvenanceArtifacts.mjs')));
    return builder.buildSchemaValidators().validators;
}

function selectionInput(claim, graph, executionId) {
    // Association is resolved from the admitted candidate roster BEFORE guest
    // execution; selected members and observed results cannot select a role.
    const bindings = graph.trace_contract.derivation.required_selections.map(selection => {
        const candidates = graph.sets[selection.candidate_set];
        const roles = Object.entries(claim.operand_bindings).filter(([, binding]) =>
            binding.kind === 'node_set' && JSON.stringify(binding.aliases) === JSON.stringify(candidates));
        assert.equal(roles.length, 1, `ambiguous selection binding: ${claim.fact_key}`);
        return { role: roles[0][0], candidate_set: selection.candidate_set, selected_set: selection.selected_set };
    });
    return { executionId, invocationId: claim.fact_key, phase: 'derivation', sets: graph.sets, bindings,
        expected: { required_selections: graph.trace_contract.derivation.required_selections,
            selected_nodes: graph.trace_contract.derivation.selected_nodes } };
}

function referencePopulationExpectation(graph, kinds = ['family']) {
    const derivation = graph.trace_contract.derivation;
    return { edges: graph.edges.filter(e => kinds.includes(graph.nodes[e.source]?.kind) && e.field === 'members'
        && derivation.required_edges.includes(e.id)).map(e => e.id),
        structural: derivation.required_structural.filter(r => kinds.includes(graph.nodes[r.node]?.kind)
            && r.segments.length === 1 && r.segments[0] === 'members') };
}
function transitiveFamilyRequirements(graph, claim) {
    const budget = claim.operand_bindings.budget;
    assert.equal(budget.kind, 'node'); assert.equal(graph.nodes[budget.alias].kind, 'budget');
    const links = graph.edges.filter(e => e.source === budget.alias && e.field === 'family_id' && e.relation === 'material_ref');
    assert.equal(links.length, 1); const family = links[0].target;
    assert.equal(graph.nodes[family].kind, 'family');
    const members = graph.edges.filter(e => e.source === family && e.field === 'members' && e.relation === 'material_ref');
    for (const member of members) assert.equal(graph.nodes[member.target].kind, 'person');
    return { required_nodes: [family], required_reads: ['id', 'members'].map(field => ({ node: family, segments: [field] })),
        required_edges: members.map(e => e.id), required_structural: ['cardinality', 'iterator', 'order']
            .map(operation => ({ node: family, operation, segments: ['members'] })) };
}

test('N02G:FAMILY-PHASE-001 transitive population authored delta preserves every other graph field', () => {
    const document = JSON.parse(fs.readFileSync(path.join(root, graphPath), 'utf8'));
    const source = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-transitive-family/graphs-extract.json'), 'utf8'));
    for (const claim of source.claims) {
        const graph = document.graphs.find(g => g.fact_key === claim.fact_key);
        const before = source.graphs.find(g => g.fact_key === claim.fact_key);
        const expected = structuredClone(before);
        for (const [key, values] of Object.entries(transitiveFamilyRequirements(before, claim))) {
            const list = expected.trace_contract.derivation[key];
            for (const value of values) if (!list.some(v => JSON.stringify(v) === JSON.stringify(value))) list.push(value);
        }
        assert.deepEqual(graph, expected, claim.fact_key);
    }
});

test('N02G:FAMILY-PHASE-002 transitive requirements are independent of fact keys, aliases and edge order', () => {
    const source = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-transitive-family/graphs-extract.json'), 'utf8'));
    for (const claim of source.claims) for (let seed = 0; seed < 6; seed++) {
        const graph = source.graphs.find(g => g.fact_key === claim.fact_key);
        const nodes = new Map(Object.keys(graph.nodes).map((name, i) => [name, `alias-${seed}-${i}`]));
        const edgeId = id => `edge-${seed}-${id}`;
        const renamed = { fact_key: `irrelevant-${seed}`, nodes: Object.fromEntries(Object.entries(graph.nodes).map(([key, value]) => [nodes.get(key), value])),
            edges: graph.edges.map(e => ({ ...e, id: edgeId(e.id), source: nodes.get(e.source), target: nodes.get(e.target) })).reverse() };
        const input = { operand_bindings: { budget: { kind: 'node', alias: nodes.get(claim.operand_bindings.budget.alias) } } };
        const expected = transitiveFamilyRequirements(graph, claim);
        expected.required_nodes = expected.required_nodes.map(n => nodes.get(n));
        expected.required_reads = expected.required_reads.map(r => ({ ...r, node: nodes.get(r.node) }));
        expected.required_edges = expected.required_edges.map(edgeId).reverse();
        expected.required_structural = expected.required_structural.map(r => ({ ...r, node: nodes.get(r.node) }));
        assert.deepEqual(transitiveFamilyRequirements(renamed, input), expected);
    }
});
function countCompensationRequirements(graph, claim) {
    assert.equal(claim.metric, 'eligible_event_count');
    const candidates = claim.operand_bindings.events;
    assert.equal(candidates.kind, 'node_set');
    assert.equal(claim.operand_bindings.categories.kind, 'node_set');
    // Category-filtered counting inherits the compensated purchase category.
    // Author from roles and material relations, never a result or trace.
    const edges = graph.edges.filter(e => candidates.aliases.includes(e.source)
        && e.field === 'compensates' && e.relation === 'material_ref');
    for (const edge of edges) {
        assert.equal(graph.nodes[edge.source].kind, 'event');
        assert.equal(graph.nodes[edge.target].kind, 'event');
        assert.ok(graph.edges.some(e => e.source === edge.target && e.field === 'category_id'
            && claim.operand_bindings.categories.aliases.includes(e.target)));
    }
    return { required_reads: edges.map(e => ({ node: e.source, segments: [e.field] })),
        required_edges: edges.map(e => e.id) };
}

test('N02G:COUNT-PHASE-001 effective-category dependency changes only the approved derivation fields', () => {
    const document = JSON.parse(fs.readFileSync(path.join(root, graphPath), 'utf8'));
    const source = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-count-compensation/graphs-extract.json'), 'utf8'));
    assert.equal(source.graphs.length, 3);
    for (const claim of source.claims) {
        const before = source.graphs.find(g => g.fact_key === claim.fact_key);
        const expected = structuredClone(before);
        for (const [key, values] of Object.entries(countCompensationRequirements(before, claim))) {
            for (const value of values) {
                assert.ok(!expected.trace_contract.derivation[key].some(v => JSON.stringify(v) === JSON.stringify(value)));
                expected.trace_contract.derivation[key].push(value);
            }
        }
        assert.deepEqual(document.graphs.find(g => g.fact_key === claim.fact_key), expected, claim.fact_key);
    }
});

test('N02G:COUNT-PHASE-002 compensation authorship ignores aliases, fact keys and roster order', () => {
    const source = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-count-compensation/graphs-extract.json'), 'utf8'));
    for (const claim of source.claims) for (let seed = 0; seed < 6; seed++) {
        const graph = source.graphs.find(g => g.fact_key === claim.fact_key);
        const names = new Map(Object.keys(graph.nodes).map((name, i) => [name, `node-${seed}-${i}`]));
        const edgeId = id => `edge-${seed}-${id}`;
        const renamed = { fact_key: `unused-${seed}`, nodes: Object.fromEntries(Object.entries(graph.nodes).map(([k, v]) => [names.get(k), v])),
            edges: graph.edges.map(e => ({ ...e, id: edgeId(e.id), source: names.get(e.source), target: names.get(e.target) })).reverse() };
        const input = structuredClone(claim); input.fact_key = 'irrelevant';
        for (const role of ['events', 'categories']) input.operand_bindings[role].aliases = input.operand_bindings[role].aliases.map(n => names.get(n)).reverse();
        const expected = countCompensationRequirements(graph, claim);
        expected.required_reads = expected.required_reads.map(r => ({ ...r, node: names.get(r.node) })).reverse();
        expected.required_edges = expected.required_edges.map(edgeId).reverse();
        assert.deepEqual(countCompensationRequirements(renamed, input), expected);
    }
});

function assertReferencePopulationObserved(trace, expected, factKey) {
    for (const edge of expected.edges) assert.ok(trace.some(e => e.operation === 'traverse' && e.outcome[1] === edge), `${factKey}: ${edge}`);
    const operation = { cardinality: 'length', iterator: 'iterate', order: 'next' };
    for (const required of expected.structural) {
        assert.ok(Object.hasOwn(operation, required.operation));
        assert.ok(trace.some(e => e.alias === required.node && e.operation === operation[required.operation]
            && (required.operation !== 'order' || e.outcome[0] === 'done')
            && JSON.stringify(required.operation === 'order' ? e.path.slice(0, -1) : e.path) === JSON.stringify(required.segments)),
        `${factKey}: ${required.operation}`);
    }
}

function composedSelection(input, graph, claim, accessBindings) {
    const selection = compareSelectionCoverage(input);
    const readKeys = ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural'];
    const readExpected = Object.fromEntries(readKeys.map(k => [k, graph.trace_contract.derivation[k]]));
    const { sets, bindings, ...scope } = input;
    const reads = compareReadEdgeCoverage({ ...scope, expected: readExpected });
    const operandSets = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set')
        .map(([role, b]) => ({ role, aliases: b.aliases }));
    const composed = comparePhaseCoverage({ ...input, operandSets, accessBindings, expected: { ...readExpected, ...input.expected } });
    // Corpus integration must preserve every standalone discrepancy, not turn
    // the existing selection/oracle test into a claim of graph acceptance.
    assert.deepEqual(composed.components.selection, selection);
    assert.deepEqual(composed.components.read_edges, reads);
    assert.equal(composed.graph_accepted, false);
    assert.deepEqual(composed.event_coverage.map(e => e.sequence), input.trace.derivation_trace.map(e => e.sequence));
    assert.equal(composed.matched, reads.mismatches.length === 0 && selection.matched && composed.components.operand_sets.matched && composed.components.access_metadata.matched
        && composed.components.civil_dates.matched
        && composed.event_coverage.every(e => e.status === 'covered'));
    for (const event of input.trace.derivation_trace.filter(e => e.measurement)) {
        assert.equal(composed.event_coverage.find(e => e.sequence === event.sequence).status, 'unsupported');
        assert.equal(composed.matched, false);
    }
    for (const event of input.trace.derivation_trace.filter(e => e.operation === 'civil_date')) {
        const coverage = composed.event_coverage.find(e => e.sequence === event.sequence);
        assert.equal(coverage.status, 'covered'); assert.equal(coverage.component, 'civil_dates');
    }
    return selection;
}

test('N02G:ACCESS-METADATA-COMPILER-001 metadata comes from admitted role reachability and schema shapes without payloads', async () => {
    const { plan, graphs } = await snapshotAccessFixture();
    const graph = graphs.find(g => g.fact_key === 'S-16#1#1');
    const selector = { fact_key: graph.fact_key, phase: 'derivation' };
    const metadata = plan.observationMetadata(selector);
    const source = metadata.find(b => b.alias === 'source_complete_june' && b.role === 'source');
    assert.deepEqual({ ...source.identity }, Object.fromEntries(['kind', 'ref_id', 'version'].map(k => [k, graph.nodes[source.alias][k]])));
    const context = metadata.find(b => b.alias === 'claim/context');
    assert.equal(context.identity, null); assert.equal(context.role, 'context');
    assert.ok(context.records.some(p => JSON.stringify(p) === '["period"]'));
    assert.ok(context.records.some(p => JSON.stringify(p) === '["subject"]'));
    assert.equal(metadata.some(b => b.alias === 'source_partial_may'), false);
    for (const binding of metadata) assert.deepEqual(Object.keys(binding).sort(), ['alias', 'identity', 'records', 'role']);
    assert.throws(() => { source.identity.kind = 'other'; }, TypeError);
    assert.throws(() => context.records.push(['forged']), TypeError);
    assert.deepEqual(plan.observationMetadata(selector), metadata);
    const proof = plan.observationMetadata({ fact_key: graph.fact_key, phase: 'proof' });
    assert.ok(proof.some(b => b.alias === 'source_partial_may' && b.role === 'proof/snapshot'));
    assert.ok(proof.some(b => b.alias === 'claim/context' && b.role === 'proof/context'));
    for (const bad of [{ ...selector, phase: 'unknown' }, { ...selector, fact_key: 'absent' }, { ...selector, bindings: [] }]) {
        assert.throws(() => plan.observationMetadata(bad), /snapshot_access_/);
    }
    let calls = 0;
    assert.throws(() => plan.observationMetadata({ phase: 'derivation', get fact_key() { calls++; return graph.fact_key; } }), /snapshot_access_/);
    assert.equal(calls, 0);
});

let accessFixture;
function snapshotAccessFixture() {
    accessFixture ||= (async () => {
        const f = fixture(); const admitted = admitPackage(f);
        const documents = new Map(admitted.documents.map(d => [d.path, d.value]));
        const graphs = documents.get(graphPath);
        const claims = documents.get(graphs.claim_contract.path).claims;
        const snapshots = documents.get(graphs.snapshot_manifest.path).snapshots;
        const registry = documents.get(graphs.material_registry.path);
        const plan = compileSnapshotAccess(admitted, await validators());
        const ir = compileAuthoringIR(admitted, await validators());
        const operators = documents.get(graphs.operator_registry.path).operators;
        // Subsequent caller mutation of input bytes cannot retarget a handle.
        for (const entry of f.entries) entry.bytes.fill(0);
        return { plan, graphs: graphs.graphs, claims, snapshots, registry, ir, operators };
    })();
    return accessFixture;
}

test('N02G:AUTHOR-INTEGRATION-001 candidate obligations are frozen before execution and cannot be regenerated from a tampered trace', async () => {
    const { buildCandidateReport } = require('../../../scripts/agent/reportNextCausalAuthoring.cjs');
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const report = buildCandidateReport(file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'));
    const record = report.records.find(r => r.metric === 'consumption_by_instrument');
    const candidate = freezeDeep(record.candidate); const before = JSON.stringify(candidate);
    // Generation is complete before the evaluator is even loaded here. No
    // oracle or observed event is supplied to that earlier call.
    const { evaluateEconomicMetric } = require('../../../src/next/provenance/metricSelection');
    const { plan, claims } = await snapshotAccessFixture();
    const claim = claims.find(c => c.fact_key === record.fact_key);
    const executionId = 'causal-authorship-before-execution';
    const recorder = createCausalRecorder({ executionId, maxEvents: 10000 });
    const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
    const controls = []; const operands = {};
    for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
        const selector = { fact_key: claim.fact_key, role_id };
        const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
            : binding.kind === 'node_set' ? plan.openSet(selector, phase.observe)
                : plan.open({ ...selector, alias: binding.alias }, phase.observe);
        controls.push(access); operands[role_id] = access.handle;
    }
    evaluateEconomicMetric(Object.freeze(operands), 'instrument');
    for (const access of controls) { access.revoke(); access.assertHealthy(); }
    phase.seal(); const trace = recorder.finish();
    assert.ok(trace.derivation_trace.length > 0);
    const args = { executionId, invocationId: claim.fact_key, phase: 'derivation', expected: candidate.obligations };
    compareReadEdgeCoverage({ ...args, trace }); // A diagnostic, NOT approval of this proposed profile.
    const tampered = compareReadEdgeCoverage({ ...args, trace: { ...trace, derivation_trace: [] } });
    assert.equal(tampered.matched, false); assert.ok(tampered.mismatches.length > 0);
    assert.equal(JSON.stringify(candidate), before);
    assert.equal(candidate.graph_accepted, false); assert.equal(candidate.normative_application_allowed, false);
});

test('N02G:AUTHOR-NORMATIVE-001 reviewed six-graph delta equals independent authoring and preserves the remaining corpus', () => {
    const { buildCandidateReport } = require('../../../scripts/agent/reportNextCausalAuthoring.cjs');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
    const reportText = read('docs/audit-evidence/n02g-causal-authoring-profile/candidate-report.json');
    const extractText = read('docs/audit-evidence/n02g-causal-authoring-profile/source-extract.json');
    assert.equal(hash(reportText), 'sha256:0140b589491ea40a1f315b744f338b84d987656707e62cb798b420d991eec012');
    assert.equal(hash(extractText), 'sha256:ab07fc9265c7412943fb814be96b71b3e6eb237f6b6e12f4ccf7b5c6e119363f');
    const reviewed = JSON.parse(reportText); const source = JSON.parse(extractText);
    const corpus = JSON.parse(read(graphPath)); const reconstructed = structuredClone(corpus);
    const generated = buildCandidateReport(read); const digest = value => hash(canonicalValue(value));
    assert.equal(corpus.graphs.length, 76); assert.equal(reviewed.records.length, 6);
    assert.deepEqual(generated.records.map(r => r.candidate), reviewed.records.map(r => r.candidate));
    for (const document of reviewed.documents.filter(d => d.path !== graphPath)) {
        assert.equal(hash(read(document.path)), document.sha256, `protected authority changed: ${document.path}`);
    }
    let changed = 0;
    for (const record of reviewed.records) {
        const original = source.records.find(r => r.fact_key === record.fact_key);
        assert.ok(original); assert.equal(digest(original.graph), record.source_graph_sha256);
        const graph = corpus.graphs.find(g => g.fact_key === record.fact_key); assert.ok(graph);
        const expected = structuredClone(original.graph);
        const dimensions = Object.keys(record.candidate.obligations).sort();
        assert.deepEqual(dimensions, ['required_claim_reads', 'required_edges', 'required_nodes', 'required_reads', 'required_structural']);
        for (const dimension of dimensions) expected.trace_contract.derivation[dimension] = record.candidate.obligations[dimension];
        assert.notEqual(digest(expected), digest(original.graph));
        assert.equal(digest(graph), digest(expected), `normative delta missing or outside scope: ${record.fact_key}`);
        changed++;
        reconstructed.graphs[reconstructed.graphs.findIndex(g => g.fact_key === record.fact_key)] = original.graph;
    }
    assert.equal(changed, 6);
    // Restoring just those six originals must recover the whole reviewed corpus:
    // this also fixes every protected graph field, top-level field and other 70 graphs.
    assert.equal(digest(reconstructed), reviewed.source_corpus_sha256);
    assert.ok(Object.values(generated.totals).every(d => d.added === 0 && d.removed === 0));
    assert.equal(generated.graph_accepted, false); assert.equal(generated.normative_application_allowed, false);
});

test('N02G:AUTHOR-RECONCILE-001 six independently authored normative derivations cover observations without accepting graphs', async () => {
    const { buildCandidateReport } = require('../../../scripts/agent/reportNextCausalAuthoring.cjs');
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const report = freezeDeep(buildCandidateReport(file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')));
    const before = JSON.stringify(report);
    const { evaluateEconomicMetric } = require('../../../src/next/provenance/metricSelection');
    const { plan, claims, graphs } = await snapshotAccessFixture();
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    const discrepancies = [];
    assert.equal(report.records.length, 6);
    for (const record of report.records) {
        const claim = claims.find(c => c.fact_key === record.fact_key);
        const graph = graphs.find(g => g.fact_key === record.fact_key);
        const executionId = `profile-reconciliation-${record.fact_key}`;
        const scope = selectionInput(claim, graph, executionId);
        const normative = Object.fromEntries(Object.keys(record.candidate.obligations).map(key => [key, graph.trace_contract.derivation[key]]));
        assert.equal(hash(JSON.stringify(normative)), hash(JSON.stringify(record.candidate.obligations)), `${claim.fact_key}: normative authoring mismatch`);
        const expected = freezeDeep({ ...normative, ...scope.expected });
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const operandSets = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set')
            .map(([role, b]) => ({ role, aliases: b.aliases }));
        const recorder = createCausalRecorder({ executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
        const controls = []; const operands = {};
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            const selector = { fact_key: claim.fact_key, role_id };
            const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
                : binding.kind === 'node_set' ? plan.openSet(selector, phase.observe)
                    : plan.open({ ...selector, alias: binding.alias }, phase.observe);
            controls.push(access); operands[role_id] = access.handle;
        }
        const value = evaluateEconomicMetric(Object.freeze(operands), claim.metric === 'statement_total' ? 'statement' : 'instrument');
        for (const access of controls) { access.revoke(); access.assertHealthy(); }
        phase.seal(); const trace = recorder.finish();
        const coverage = comparePhaseCoverage({ ...scope, expected, trace, operandSets, accessBindings });
        assert.equal(coverage.graph_accepted, false);
        const split = claim.fact_key.lastIndexOf('#');
        assert.equal(value, oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1].value);
        assert.equal(coverage.components.selection.matched, true);
        if (!coverage.matched) discrepancies.push({ fact_key: claim.fact_key,
            reads: coverage.components.read_edges.mismatches,
            invalid: coverage.event_coverage.filter(e => e.status !== 'covered') });
        const altered = { ...trace, derivation_trace: trace.derivation_trace
            .filter(e => !(e.operation === 'has' && e.path[0] === 'compensates')).map((entry, sequence) => ({ ...entry, sequence })) };
        assert.equal(comparePhaseCoverage({ ...scope, expected, trace: altered, operandSets, accessBindings }).matched, false);
    }
    assert.equal(JSON.stringify(report), before);
    assert.deepEqual(discrepancies.map(d => ({ fact_key: d.fact_key,
        dimensions: d.reads.map(r => ({ dimension: r.dimension, missing: r.missing?.length, extra: r.extra?.length })),
        unclassified_count: d.invalid.length })), []);
});

test('N02G:OBSERVED-METRIC-001 consumption roles select independently of graph expectations and oracle', async () => {
    const { evaluateEconomicMetric } = require('../../../src/next/provenance/metricSelection');
    const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    const modes = { consumption_total: 'total', category_consumption: 'category', category_spent: 'spent',
        income_realized: 'income', consumption_by_instrument: 'instrument', budget_class_consumption: 'budget_class',
        category_budget_remaining: 'budget_remaining', statement_total: 'statement', safe_daily_pace: 'safe_pace' };
    for (const claim of claims.filter(c => Object.hasOwn(modes, c.metric))) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const expectedCompensations = graph.edges.filter(e => e.field === 'compensates'
            && graph.trace_contract.derivation.required_edges.includes(e.id)).map(e => e.id).sort();
        const expectedFamily = referencePopulationExpectation(graph);
        const expectedCategoryReads = graph.trace_contract.derivation.required_reads.filter(read =>
            graph.nodes[read.node].kind === 'event' && read.segments.length === 1 && read.segments[0] === 'category_id');
        const coverageInput = selectionInput(claim, graph, `consumption-${checked}`);
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const recorder = createCausalRecorder({ executionId: `consumption-${checked}`, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
        const controls = []; const operands = {};
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            const selector = { fact_key: claim.fact_key, role_id };
            const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
                : binding.kind === 'node_set' ? plan.openSet(selector, phase.observe)
                    : plan.open({ ...selector, alias: binding.alias }, phase.observe);
            controls.push(access); operands[role_id] = access.handle;
        }
        const result = evaluateEconomicMetric(Object.freeze(operands), modes[claim.metric]);
        for (const access of controls) { access.revoke(); access.assertHealthy(); }
        phase.seal(); const observed = recorder.finish(); const trace = observed.derivation_trace;
        const coverage = composedSelection({ ...coverageInput, trace: observed }, graph, claim, accessBindings);
        assert.equal(coverage.matched, true, `${claim.fact_key}: ${JSON.stringify(coverage)}`);
        const split = claim.fact_key.lastIndexOf('#');
        const expected = oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1];
        assert.equal(expected.metric, claim.metric);
        assert.equal(result, expected.value, claim.fact_key);
        const decisions = trace.filter(e => e.operation === 'select_member');
        assert.equal(decisions.length, claim.operand_bindings.events.aliases.length);
        const selected = decisions.filter(e => e.outcome[2]).map(e => e.outcome[1]);
        assert.deepEqual(selected, graph.sets[graph.selections[0].selected_set], claim.fact_key);
        const observedCompensations = [...new Set(trace.filter(e => e.operation === 'traverse'
            && e.path[0] === 'compensates').map(e => e.outcome[1]))].sort();
        assert.deepEqual(observedCompensations, expectedCompensations, `${claim.fact_key}: compensation edges`);
        assertReferencePopulationObserved(trace, expectedFamily, claim.fact_key);
        for (const read of expectedCategoryReads) assert.ok(trace.some(e => e.operation === 'get'
            && e.alias === read.node && e.path.length === 1 && e.path[0] === 'category_id'), `${claim.fact_key}: ${read.node}/category_id`);
        assert.ok(trace.some(e => e.operation === 'traverse'));
        checked++;
    }
    assert.equal(checked, 31);
});

test('N02G:OBSERVED-METRIC-002 direct reads preserve values and identities through admitted roles', async () => {
    const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    const supported = ['balance_delta', 'invoice_payment_amount', 'invoice_payment_target_card', 'statement_payment_correspondence',
        'source_coverage', 'owned_cards', 'merchant_rule_ids', 'eligible_event_count', 'side_effect_count',
        'bills_open', 'due_bill_ids', 'due_bills_total', 'reminder_count', 'calendar_event_count', 'similar_event_ids',
        'account_balance', 'movement_ids'];
    for (const claim of claims.filter(c => supported.includes(c.metric))) {
        const referenceCandidates = new Set(['bills', 'cards', 'rules'].flatMap(role => claim.operand_bindings[role]?.aliases || []));
        const referenceFields = { bill: 'person_id', card: 'owner_id', merchant_rule: 'merchant_key' };
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const coverageInput = selectionInput(claim, graph, `direct-${checked}`);
        const expectedFamily = referencePopulationExpectation(graph);
        const expectedReferenceReads = graph.trace_contract.derivation.required_reads.filter(read =>
            referenceCandidates.has(read.node) && read.segments.length === 1
            && referenceFields[graph.nodes[read.node].kind] === read.segments[0]);
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const recorder = createCausalRecorder({ executionId: coverageInput.executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
        const controls = []; const operands = {}; const events = [];
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            const selector = { fact_key: claim.fact_key, role_id }; const observe = e => { phase.observe(e); events.push(e); };
            const access = binding.kind === 'claim_context' ? plan.openContext(selector, observe)
                : binding.kind === 'node_set' ? plan.openSet(selector, observe)
                    : plan.open({ ...selector, alias: binding.alias }, observe);
            controls.push(access); operands[role_id] = access.handle;
        }
        const result = evaluateDirectMetric(Object.freeze(operands), claim.metric);
        for (const access of controls) { access.revoke(); access.assertHealthy(); }
        phase.seal(); const trace = recorder.finish();
        const coverage = composedSelection({ ...coverageInput, trace }, graph, claim, accessBindings);
        assert.equal(coverage.matched, true, `${claim.fact_key}: ${JSON.stringify(coverage)}`);
        assertReferencePopulationObserved(trace.derivation_trace, expectedFamily, claim.fact_key);
        if (!coverageInput.bindings.length) assert.equal(trace.derivation_trace.some(e => e.operation.startsWith('select_')), false);
        const split = claim.fact_key.lastIndexOf('#');
        const expected = oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1];
        assert.equal(expected.metric, claim.metric); assert.deepEqual(result, expected.value, claim.fact_key);
        for (const read of expectedReferenceReads) {
            assert.ok(events.some(e => e[1] === 'get' && e[2] === read.node && e[4][0] === read.segments[0]),
                `${claim.fact_key}: reference read ${read.node}/${read.segments[0]}`);
            assert.ok(events.some(e => e[1] === 'traverse' && e[2] === read.node && e[4][0] === read.segments[0]),
                `${claim.fact_key}: reference traversal ${read.node}/${read.segments[0]}`);
        }
        assert.ok(events.some(e => e[1] === 'get'));
        checked++;
    }
    assert.equal(checked, 21);
});

test('N02G:OBSERVED-METRIC-003 installment selection is independently observed for each state and period', async () => {
    const { evaluateInstallments } = require('../../../src/next/provenance/metricInstallments');
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    const supported = ['installments_realized', 'installments_realized_amount', 'installments_projected', 'installments_projected_amount', 'projected_installments'];
    for (const claim of claims.filter(c => supported.includes(c.metric))) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const coverageInput = selectionInput(claim, graph, `installments-${checked}`);
        const expectedPopulation = referencePopulationExpectation(graph, ['family', 'installment_plan']);
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const recorder = createCausalRecorder({ executionId: coverageInput.executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
        const controls = []; const operands = {}; const observations = [];
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            const selector = { fact_key: claim.fact_key, role_id }; const observe = e => { phase.observe(e); observations.push(e); };
            const access = binding.kind === 'claim_context' ? plan.openContext(selector, observe)
                : binding.kind === 'node_set' ? plan.openSet(selector, observe)
                    : plan.open({ ...selector, alias: binding.alias }, observe);
            controls.push(access); operands[role_id] = access.handle;
        }
        const result = evaluateInstallments(Object.freeze(operands), claim.metric);
        for (const access of controls) { access.revoke(); access.assertHealthy(); }
        phase.seal(); const trace = recorder.finish();
        const coverage = composedSelection({ ...coverageInput, trace }, graph, claim, accessBindings);
        assertReferencePopulationObserved(trace.derivation_trace, expectedPopulation, claim.fact_key);
        assert.equal(coverage.matched, true, `${claim.fact_key}: ${JSON.stringify(coverage)}`);
        const split = claim.fact_key.lastIndexOf('#');
        const expected = oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1];
        assert.equal(expected.metric, claim.metric); assert.equal(result, expected.value, claim.fact_key);
        const decisions = observations.filter(e => e[1] === 'select_member');
        assert.equal(decisions.length, claim.operand_bindings.events.aliases.length);
        assert.deepEqual(decisions.filter(e => e[6][2]).map(e => e[6][1]), graph.sets[graph.selections[0].selected_set], claim.fact_key);
        checked++;
    }
    assert.equal(checked, 8);
});

test('N02G:OBSERVED-METRIC-004 economic effects use observed links, not signed amount coincidence', async () => {
    const { evaluateEffects } = require('../../../src/next/provenance/metricEffects');
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    const supported = ['consumption_effect', 'net_consumption', 'invoice_payment_consumption_effect', 'gross_consumption', 'refund_amount'];
    for (const claim of claims.filter(c => supported.includes(c.metric))) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const coverageInput = selectionInput(claim, graph, `effects-${checked}`);
        const expectedCategoryReads = graph.trace_contract.derivation.required_reads.filter(read =>
            graph.nodes[read.node].kind === 'event' && read.segments.length === 1 && read.segments[0] === 'category_id');
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const recorder = createCausalRecorder({ executionId: coverageInput.executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
        const controls = []; const operands = {}; const observations = [];
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            const selector = { fact_key: claim.fact_key, role_id }; const observe = e => { phase.observe(e); observations.push(e); };
            const access = binding.kind === 'claim_context' ? plan.openContext(selector, observe)
                : binding.kind === 'node_set' ? plan.openSet(selector, observe)
                    : plan.open({ ...selector, alias: binding.alias }, observe);
            controls.push(access); operands[role_id] = access.handle;
        }
        const result = evaluateEffects(Object.freeze(operands), claim.metric);
        for (const access of controls) { access.revoke(); access.assertHealthy(); }
        phase.seal(); const coverage = composedSelection({ ...coverageInput, trace: recorder.finish() }, graph, claim, accessBindings);
        assert.equal(coverage.matched, true, `${claim.fact_key}: ${JSON.stringify(coverage)}`);
        const split = claim.fact_key.lastIndexOf('#');
        const expected = oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1];
        assert.equal(expected.metric, claim.metric); assert.equal(result, expected.value, claim.fact_key);
        const decisions = observations.filter(e => e[1] === 'select_member');
        assert.equal(decisions.length, claim.operand_bindings.events.aliases.length);
        assert.deepEqual(decisions.filter(e => e[6][2]).map(e => e[6][1]), graph.sets[graph.selections[0].selected_set], claim.fact_key);
        for (const read of expectedCategoryReads) assert.ok(observations.some(e => e[1] === 'get'
            && e[2] === read.node && e[4].length === 1 && e[4][0] === 'category_id'), `${claim.fact_key}: ${read.node}/category_id`);
        checked++;
    }
    assert.equal(checked, 13);
});

// Closed semantic requirements from the reviewed proposal, resolved from
// authored roles/relations before execution. No actual trace, oracle or fact
// key participates in constructing the expected nodes/reads/edges.
function refundRequirements(graph, claim) {
    const nodes = new Set(); const reads = new Map(); const edges = new Set();
    const read = (node, ...fields) => {
        nodes.add(node);
        for (const field of fields) { const item = { node, segments: [field] }; reads.set(JSON.stringify(item), item); }
    };
    const follow = (source, field, kind) => {
        const links = graph.edges.filter(e => e.relation === 'material_ref' && e.source === source && e.field === field);
        assert.equal(links.length, 1); const edge = links[0];
        assert.equal(graph.nodes[edge.target].kind, kind);
        edges.add(edge.id); read(source, field); read(edge.target, 'id'); return edge.target;
    };
    for (const event of claim.operand_bindings.events.aliases) {
        assert.equal(graph.nodes[event].kind, 'event');
        read(event, 'id', 'date', 'state', 'person_id', 'category_id');
        follow(event, 'person_id', 'person');
        read(follow(event, 'category_id', 'category'), 'kind');
        const target = follow(event, 'compensates', 'event');
        assert.notEqual(target, event); read(target, 'state', 'person_id');
        read(follow(target, 'category_id', 'category'), 'kind');
        if (graph.trace_contract.derivation.selected_nodes.includes(event)) read(event, 'amount_minor');
    }
    return { required_nodes: [...nodes].sort(), required_reads: [...reads.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        required_edges: [...edges].sort() };
}

test('N02G:REFUND-PHASE-001 authored derivation matches the reviewed semantic closure and preserves proof', () => {
    const document = JSON.parse(fs.readFileSync(path.join(root, graphPath), 'utf8'));
    const claims = JSON.parse(fs.readFileSync(path.join(root, document.claim_contract.path), 'utf8')).claims;
    const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-refund-phase/graphs-extract.json'), 'utf8'));
    const selected = claims.filter(c => c.metric === 'refund_amount'); assert.equal(selected.length, 2);
    for (const claim of selected) {
        const graph = document.graphs.find(g => g.fact_key === claim.fact_key);
        const expected = refundRequirements(graph, claim);
        const before = baseline.graphs.find(g => g.fact_key === claim.fact_key);
        for (const [key, value] of Object.entries(expected)) {
            const actual = [...graph.trace_contract.derivation[key]].sort((a, b) => typeof a === 'string'
                ? a.localeCompare(b) : JSON.stringify(a).localeCompare(JSON.stringify(b)));
            assert.deepEqual(actual, value, `${claim.fact_key}/${key}`);
        }
        const { trace_contract, ...rest } = graph; const { trace_contract: oldTrace, ...oldRest } = before;
        assert.deepEqual(rest, oldRest);
        assert.deepEqual({ ...trace_contract, derivation: null }, { ...oldTrace, derivation: null });
        const fixed = trace => Object.fromEntries(Object.entries(trace).filter(([key]) => !Object.hasOwn(expected, key)));
        assert.deepEqual(fixed(trace_contract.derivation), fixed(oldTrace.derivation));
    }
});

test('N02G:REFUND-PHASE-002 both refund contexts have exact partial derivation coverage, never graph acceptance', async () => {
    const { evaluateEffects } = require('../../../src/next/provenance/metricEffects');
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    for (const claim of claims.filter(c => c.metric === 'refund_amount')) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const input = selectionInput(claim, graph, `refund-phase-${checked}`);
        const expected = { ...graph.trace_contract.derivation, ...refundRequirements(graph, claim) };
        delete expected.evidence_set_mode;
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const operandSets = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set')
            .map(([role, b]) => ({ role, aliases: b.aliases }));
        const recorder = createCausalRecorder({ executionId: input.executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
        const controls = []; const operands = {};
        try {
            for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
                const selector = { fact_key: claim.fact_key, role_id };
                const control = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
                    : plan.openSet(selector, phase.observe);
                controls.push(control); operands[role_id] = control.handle;
            }
            assert.equal(evaluateEffects(Object.freeze(operands), 'refund_amount'), 4500);
            for (const control of controls) control.assertHealthy();
            phase.seal();
            const coverage = comparePhaseCoverage({ ...input, trace: recorder.finish(), expected, accessBindings, operandSets });
            assert.equal(coverage.matched, true, `${claim.fact_key}: ${JSON.stringify(coverage.components.read_edges.mismatches)}`);
            assert.equal(coverage.graph_accepted, false); checked++;
        } finally { for (const control of controls) control.revoke(); }
    }
    assert.equal(checked, 2);
});

test('N02G:TRACE-COMPAT-001 required edge remains independent from derivation node and read coverage', async () => {
    const { inspectTraversalCoverage } = await import(pathToFileURL(path.join(root, 'scripts/agent/inspectNextProvenanceTraceCompatibility.mjs')));
    const { plan, graphs } = await snapshotAccessFixture();
    const report = inspectTraversalCoverage(graphs);
    assert.equal(report.compatible, true); assert.equal(report.graphs_checked, 76);
    // The reviewed refund closure supplies both endpoints and scalar reads
    // for e0002/e0004 in each of the two refund graphs: four edge-only cases
    // disappear. Their new e0005/e0008 edges already have complete coverage.
    // The reviewed family closure supplies the target of budget.family_id,
    // while its two member edges intentionally do not consume person payloads:
    // two graphs each remove one edge-only case and introduce two.
    const extractText = fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/source-extract.json'), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(hash(extractText), 'sha256:ab07fc9265c7412943fb814be96b71b3e6eb237f6b6e12f4ccf7b5c6e119363f');
    const originals = new Map(JSON.parse(extractText).records.map(r => [r.fact_key, r.graph]));
    const before = inspectTraversalCoverage(graphs.map(g => originals.get(g.fact_key) || g));
    assert.equal(before.edge_only_graphs, 66 - 2);
    assert.equal(before.edge_only_count, 1133 - 4 + 2 * (2 - 1));
    // The closed instrument/statement delta removes 148 irrelevant edges and
    // supplies endpoint/read coverage for 18 retained edges. No diagnostic
    // obligation outside those six independently reviewed graphs may change.
    const affected = before.edge_only.filter(g => originals.has(g.fact_key));
    const retained = affected.filter(entry => graphs.find(g => g.fact_key === entry.fact_key)
        .trace_contract[entry.phase].required_edges.includes(entry.edge_id));
    assert.equal(originals.size, 6); assert.equal(affected.length, 166);
    assert.equal(retained.length, 18); assert.equal(affected.length - retained.length, 148);
    assert.deepEqual(report.edge_only, before.edge_only.filter(g => !originals.has(g.fact_key)));
    assert.equal(report.edge_only_graphs, before.edge_only_graphs - originals.size);
    assert.equal(report.edge_only_count, before.edge_only_count - affected.length);
    assert.ok(report.edge_only.every(g => g.phase === 'derivation'));
    const graph = graphs.find(g => g.fact_key === 'S-01#1#1');
    const contract = graph.trace_contract.derivation;
    const edge = graph.edges.find(e => e.id === 'e0023');
    assert.ok(contract.required_edges.includes(edge.id));
    const observations = [];
    const access = plan.open({ fact_key: graph.fact_key, role_id: 'events', alias: edge.source }, e => observations.push(e));
    access.handle.traverse(edge.id); access.assertHealthy(); access.revoke();
    const actualReads = observations.filter(e => e[1] === 'get').map(e => [e[2], e[4]]);
    assert.deepEqual(actualReads, []);
    assert.equal(contract.required_nodes.includes(edge.target), false);
    assert.equal(contract.required_reads.some(r => r.node === edge.target && r.segments.join('.') === 'id'), false);
    assert.ok(observations.some(e => e[1] === 'traverse' && e[6][1] === edge.id));
    // Edge observation is a separate causal dimension. Removing its endpoints
    // from read coverage cannot manufacture or suppress runtime reads.
    const minimal = { fact_key: 'diagnostic', edges: [edge], trace_contract: Object.fromEntries(['derivation', 'proof'].map(phase => [phase, {
        required_edges: [edge.id], required_nodes: [], required_reads: []
    }])) };
    assert.equal(inspectTraversalCoverage([minimal]).compatible, true);
    const broken = structuredClone(minimal); broken.trace_contract.derivation.required_edges = ['missing'];
    assert.throws(() => inspectTraversalCoverage([broken]), /trace_compatibility_unknown_edge/);
});

test('N02G:SELECTION-BINDING-001 source coverage derives from one bound source and selects four candidates only in proof', async () => {
    const { plan, graphs, claims } = await snapshotAccessFixture();
    const graph = graphs.find(g => g.fact_key === 'S-16#1#1');
    const claim = claims.find(c => c.fact_key === graph.fact_key);
    assert.deepEqual(claim.operand_bindings, { context: { kind: 'claim_context' }, source: { kind: 'node', alias: 'source_complete_june' } });
    assert.deepEqual(graph.sets.candidates, ['source_complete_june', 'source_partial_may', 'source_offline_card', 'source_empty_health']);
    assert.deepEqual(graph.trace_contract.derivation.required_selections, []);
    assert.deepEqual(graph.trace_contract.derivation.required_nodes, ['source_complete_june']);
    assert.deepEqual(graph.trace_contract.derivation.selected_nodes, []);
    const reachable = new Set(['source_complete_june']);
    for (const alias of reachable) for (const edge of graph.edges) {
        if (edge.relation === 'material_ref' && edge.source === alias) reachable.add(edge.target);
    }
    assert.deepEqual([...reachable].sort(), ['next_golden_financial_v1', 'source_complete_june', 'synthetic_ledger']);
    const observed = [];
    const selector = { fact_key: graph.fact_key, role_id: 'source' };
    assert.throws(() => plan.openSet(selector, e => observed.push(e)), /binding_kind/);
    for (const alias of graph.sets.candidates.slice(1)) {
        assert.throws(() => plan.open({ ...selector, alias }, e => observed.push(e)), /alias/);
    }
    const source = plan.open({ ...selector, alias: 'source_complete_june' }, e => observed.push(e));
    assert.equal(source.handle.get('coverage'), 'complete');
    source.revoke(); source.assertHealthy();
    assert.equal(observed.some(e => e[1].startsWith('select_')), false);
    // Proof performs the search. Its observations cannot satisfy derivation.
    const proofEvents = [];
    const recorder = createCausalRecorder({ executionId: 'source-proof', maxEvents: 1000 });
    const phase = recorder.open({ invocationId: claim.fact_key, phase: 'proof' });
    const proof = plan.openProof({ fact_key: graph.fact_key }, e => { phase.observe(e); proofEvents.push(e); });
    const selection = proof.select('candidates', 'selected', node => node.get('id') === claim.subject.ref_id);
    assert.equal(selection.length(), 1); proof.revoke(); proof.assertHealthy();
    assert.equal(proofEvents.filter(e => e[1] === 'select_member').length, 4);
    assert.ok(proofEvents.every(e => e[3].startsWith('proof/')));
    phase.seal(); const trace = recorder.finish();
    const input = { executionId: 'source-proof', invocationId: claim.fact_key, phase: 'proof', trace, sets: graph.sets,
        bindings: [{ role: 'proof/set/candidates', candidate_set: 'candidates', selected_set: 'selected' }],
        expected: { required_selections: graph.trace_contract.proof.required_selections,
            selected_nodes: graph.trace_contract.proof.selected_nodes } };
    assert.equal(compareSelectionCoverage(input).matched, true);
    assert.equal(compareSelectionCoverage({ ...input, phase: 'derivation' }).matched, false);
    const misplaced = structuredClone(trace);
    misplaced.derivation_trace = misplaced.proof_trace.map(e => ({ ...e, phase: 'derivation' }));
    misplaced.proof_trace = [];
    const extra = compareSelectionCoverage({ ...input, trace: misplaced, phase: 'derivation', bindings: [],
        expected: { required_selections: [], selected_nodes: [] } });
    assert.equal(extra.matched, false);
    assert.ok(extra.errors.some(e => e.code === 'unbound_selection'));
});

test('N02G:SNAPSHOT-ACCESS-001 handles resolve exact admitted fact/role/alias identities', async () => {
    const { plan, graphs, claims, snapshots, registry } = await snapshotAccessFixture();
    assert.equal(plan.stage, 'snapshot_access_plan_only');
    assert.equal(plan.executable, false);
    assert.equal(plan.snapshot_count, 115);
    assert.deepEqual(Object.keys(plan).sort(), ['executable', 'observationMetadata', 'open', 'openContext', 'openProof', 'openSet', 'snapshot_count', 'stage']);
    let opened = 0;
    for (const claim of claims) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            const aliases = binding.kind === 'node' ? [binding.alias] : binding.kind === 'node_set' ? binding.aliases : [];
            for (const alias of aliases) {
                const node = graph.nodes[alias];
                const snapshot = snapshots.find(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
                const events = [];
                const access = plan.open({ fact_key: claim.fact_key, role_id, alias }, e => events.push(e));
                assert.equal(access.handle.get('id'), snapshot.payload.id);
                for (const key of ['kind', 'ref_id', 'version']) assert.equal(access.handle.identity(key), snapshot[key]);
                const material = Object.keys(snapshot.payload).filter(k => registry.kinds[node.kind].fields[k].class !== 'non_material');
                assert.deepEqual([...access.handle.keys()], material);
                for (const field of material) {
                    const actual = access.handle.get(field);
                    const expected = snapshot.payload[field];
                    if (Array.isArray(expected)) {
                        assert.equal(actual.length(), expected.length);
                        assert.deepEqual([...actual], expected);
                    } else assert.equal(actual, expected);
                }
                assert.ok(events.every(e => e[0] === 'I' && e[2] === alias && e[3] === role_id));
                access.revoke();
                assert.throws(() => access.handle.get('id'), /access_revoked/);
                assert.throws(() => access.assertHealthy(), /access_failed/);
                opened++;
            }
        }
    }
    assert.ok(opened > 100);
});

test('N02G:SNAPSHOT-ACCESS-009 proof snapshots are read independently of metric operand bindings', async () => {
    const { measureMaterialFingerprint } = require('../../../src/next/provenance/proofOperators');
    const { plan, graphs, snapshots } = await snapshotAccessFixture();
    const measured = new Set(); let traversals = 0;
    for (const graph of graphs) {
        if (Object.values(graph.nodes).some(node => node.binding !== 'snapshot')) {
            assert.throws(() => plan.openProof({ fact_key: graph.fact_key }, () => {}), /proof_parent_pending/);
            continue;
        }
        const events = []; const scope = plan.openProof({ fact_key: graph.fact_key }, e => events.push(e));
        for (const [alias, node] of Object.entries(graph.nodes)) {
            const key = JSON.stringify([node.kind, node.ref_id, node.version]);
            if (measured.has(key)) continue;
            const actual = measureMaterialFingerprint(scope.node(alias), scope.material(alias));
            const snapshot = snapshots.find(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
            assert.equal(actual, snapshot.semantic_fingerprint); measured.add(key);
        }
        for (const edge of graph.edges.filter(e => e.relation === 'material_ref')) {
            const target = scope.edge(edge.id);
            assert.equal(target.identity('ref_id'), graph.nodes[edge.target].ref_id); traversals++;
        }
        assert.ok(events.every(e => e[0] === 'I' && e[3] === 'proof/snapshot'));
        scope.assertHealthy(); const handle = scope.node(Object.keys(graph.nodes)[0]); scope.revoke();
        assert.throws(() => handle.get('id'), /access_revoked/);
        assert.throws(() => scope.assertHealthy(), /access_failed/);
    }
    const referenced = new Set(graphs.flatMap(graph => Object.values(graph.nodes)
        .filter(node => node.binding === 'snapshot').map(node => JSON.stringify([node.kind, node.ref_id, node.version]))));
    assert.deepEqual([...measured].sort(), [...referenced].sort());
    assert.equal(referenced.size, 61);
    assert.equal(snapshots.length, 115); // 54 admitted snapshots are not graph operands.
    assert.ok(traversals > 4000);
});

test('N02G:SNAPSHOT-ACCESS-010 proof scope rejects data injection, unknown aliases and edges', async () => {
    const { plan, graphs } = await snapshotAccessFixture();
    const graph = graphs.find(g => Object.values(g.nodes).every(n => n.binding === 'snapshot'));
    for (const extra of [{ phase: 'derivation' }, { expected_trace: {} }, { payload: {} }, { role_id: 'events' }]) {
        assert.throws(() => plan.openProof({ fact_key: graph.fact_key, ...extra }, () => {}), /snapshot_access_/);
    }
    const scope = plan.openProof({ fact_key: graph.fact_key }, () => {});
    assert.throws(() => scope.node('unknown'), /access_binding_invalid/);
    assert.throws(() => scope.assertHealthy(), /access_failed/);
    const second = plan.openProof({ fact_key: graph.fact_key }, () => {});
    assert.throws(() => second.edge('unknown'), /snapshot_access_proof_edge/);
    assert.throws(() => second.assertHealthy(), /snapshot_access_proof_failed/);
});

test('N02G:SNAPSHOT-ACCESS-011 metric and proof contexts are observed without output or binding tables', async () => {
    const { plan, graphs, claims } = await snapshotAccessFixture(); let count = 0;
    for (const claim of claims) {
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            if (binding.kind !== 'claim_context') continue;
            const events = []; const access = plan.openContext({ fact_key: claim.fact_key, role_id }, e => events.push(e));
            assert.equal(access.handle.get('period').get('kind'), claim.period.kind);
            assert.ok(events.every(e => e[2] === 'claim/context' && e[3] === role_id));
            access.revoke(); assert.throws(() => access.handle.get('coverage'), /access_revoked/); count++;
        }
    }
    assert.ok(count > 60);
    const graph = graphs.find(g => Object.values(g.nodes).every(n => n.binding === 'snapshot'));
    const events = []; const scope = plan.openProof({ fact_key: graph.fact_key }, e => events.push(e));
    assert.equal(scope.claim().get('period').get('kind'), claims.find(c => c.fact_key === graph.fact_key).period.kind);
    assert.ok(events.every(e => e[2] === 'claim/context' && e[3] === 'proof/context'));
    assert.throws(() => scope.claim().get('operand_bindings'), /access_/);
    assert.throws(() => scope.node(Object.keys(graph.nodes)[0]), /access_failed/);
});

test('N02G:OBSERVED-PROOF-001 compiled scalar, identity and fingerprint predicates execute from handles', async t => {
    const { evaluateObservedOperator } = require('../../../src/next/provenance/proofOperators');
    const { plan, ir, operators } = await snapshotAccessFixture();
    const implemented = new Set(['kind_is', 'fingerprint_is', 'same_identity', 'ref_targets_node', 'eq', 'not_eq',
        'field_eq', 'state_is', 'date_in_period', 'period_eq', 'same_month', 'range_contains', 'opposite_sign', 'abs_eq',
        'civil_offset_matches', 'month_bounds_match', 'day_of_month_matches', 'inclusive_day_count_matches']);
    let executed = 0; let observations = 0;
    for (const graph of ir.graphs) {
        if (Object.values(graph.nodes).some(n => n.binding !== 'snapshot')) continue;
        const access = plan.openProof({ fact_key: graph.fact_key }, () => observations++);
        const scope = { ...access, window(name) { if (!Object.hasOwn(graph.windows, name)) throw new Error('unknown_window'); return graph.windows[name]; } };
        for (const predicate of graph.predicates.filter(p => implemented.has(p.op))) {
            try {
                assert.equal(evaluateObservedOperator(operators.find(o => o.id === predicate.op), predicate.operands, scope), true);
            } catch (error) { throw new Error(`${graph.fact_key}:${predicate.id}:${error.message}`, { cause: error }); }
            executed++;
        }
        access.assertHealthy(); access.revoke();
    }
    // Development integration, NOT the 76-graph acceptance gate. Quantifiers,
    // selections, timezone and validated parents remain explicitly pending.
    assert.ok(executed > 11000); assert.ok(observations > executed);
    t.diagnostic(`compiled_predicates_executed=${executed}; instrumented_observations=${observations}; acceptance_gate=false`);
});

test('N02G:SNAPSHOT-ACCESS-012 proof selected sets exist only after observed computation', async () => {
    const { plan, graphs } = await snapshotAccessFixture();
    const graph = graphs.find(g => g.selections.length && Object.values(g.nodes).every(n => n.binding === 'snapshot'));
    const selection = graph.selections[0]; const events = [];
    const early = plan.openProof({ fact_key: graph.fact_key }, () => {});
    assert.throws(() => early.set(selection.selected_set), /proof_selection_pending/);
    assert.throws(() => early.assertHealthy(), /proof_failed/);
    const scope = plan.openProof({ fact_key: graph.fact_key }, e => events.push(e));
    const candidates = scope.set(selection.candidate_set);
    assert.equal(candidates.length(), graph.sets[selection.candidate_set].length);
    let calls = 0;
    const selected = scope.select(selection.candidate_set, selection.selected_set, member => {
        member.get('id'); calls++; return false;
    });
    assert.equal(calls, graph.sets[selection.candidate_set].length);
    assert.equal(selected.length(), 0);
    assert.ok(graph.sets[selection.selected_set].length > 0); // No copying the authored expected roster.
    assert.equal(scope.set(selection.selected_set), selected);
    assert.equal(events.filter(e => e[1] === 'select_member').length, calls);
    const member = candidates.at(0); scope.revoke();
    assert.throws(() => selected.length(), /access_set_revoked/);
    assert.throws(() => member.get('id'), /access_/);
});

test('N02G:SNAPSHOT-ACCESS-013 proof sets cannot survive a sibling failure or replace selection targets', async () => {
    const { plan, graphs } = await snapshotAccessFixture();
    const graph = graphs.find(g => g.selections.length && Object.values(g.nodes).every(n => n.binding === 'snapshot'));
    const selection = graph.selections[0];
    const scope = plan.openProof({ fact_key: graph.fact_key }, () => {});
    const candidates = scope.set(selection.candidate_set);
    assert.throws(() => scope.claim().get('result'), /access_/);
    assert.throws(() => candidates.length(), /access_/);
    const second = plan.openProof({ fact_key: graph.fact_key }, () => {});
    assert.throws(() => second.select(selection.candidate_set, 'forged_set', () => true), /proof_selection/);
    assert.throws(() => second.assertHealthy(), /proof_failed/);
});

test('N02G:OBSERVED-PROOF-002 reference sets resolve observed list members through graph traversals', async t => {
    const { evaluateObservedOperator } = require('../../../src/next/provenance/proofOperators');
    const { plan, ir, operators } = await snapshotAccessFixture(); let executed = 0; let traversals = 0;
    for (const graph of ir.graphs) {
        if (Object.values(graph.nodes).some(n => n.binding !== 'snapshot')) continue;
        const access = plan.openProof({ fact_key: graph.fact_key }, e => { if (e[1] === 'traverse') traversals++; });
        for (const predicate of graph.predicates.filter(p => ['set_eq', 'edge_target_in_set'].includes(p.op))) {
            assert.equal(evaluateObservedOperator(operators.find(o => o.id === predicate.op), predicate.operands, access), true);
            executed++;
        }
        access.assertHealthy(); access.revoke();
    }
    assert.equal(executed, 102); assert.ok(traversals > 500);
    t.diagnostic(`observed_set_predicates=${executed}; reference_traversals=${traversals}`);
});

test('N02G:OBSERVED-PROOF-003 quantified exclusions and paired edges consume all members', async t => {
    const { evaluateObservedOperator } = require('../../../src/next/provenance/proofOperators');
    const { plan, ir, operators } = await snapshotAccessFixture(); let executed = 0; let observations = 0;
    for (const graph of ir.graphs) {
        if (Object.values(graph.nodes).some(n => n.binding !== 'snapshot')) continue;
        const access = plan.openProof({ fact_key: graph.fact_key }, () => observations++);
        const scope = { ...access, window: name => graph.windows[name] };
        for (const predicate of graph.predicates.filter(p => ['none_match', 'edge_pair_complete'].includes(p.op))) {
            try { assert.equal(evaluateObservedOperator(operators.find(o => o.id === predicate.op), predicate.operands, scope), true); }
            catch (error) { throw new Error(`${graph.fact_key}:${predicate.id}:${error.message}`, { cause: error }); }
            executed++;
        }
        access.assertHealthy(); access.revoke();
    }
    assert.equal(executed, 79); assert.ok(observations > executed);
    t.diagnostic(`observed_quantified_predicates=${executed}; observations=${observations}`);
});

test('N02G:OBSERVED-PROOF-004 clock cutoff uses observed clock and policy through pinned timezone conversion', async () => {
    const { evaluateObservedOperator } = require('../../../src/next/provenance/proofOperators');
    const { plan, ir, operators } = await snapshotAccessFixture(); let executed = 0;
    for (const graph of ir.graphs) {
        for (const predicate of graph.predicates.filter(p => p.op === 'civil_date_matches')) {
            const events = []; const access = plan.openProof({ fact_key: graph.fact_key }, e => events.push(e));
            assert.equal(evaluateObservedOperator(operators.find(o => o.id === predicate.op), predicate.operands, access), true);
            for (const name of ['fixed_clock', 'daily_pace_as_of', 'timezone', 'calendar']) assert.ok(events.some(e => e[1] === 'get' && e[4][0] === name));
            executed++; access.assertHealthy(); access.revoke();
        }
    }
    assert.equal(executed, 2);
});

test('N02G:SNAPSHOT-ACCESS-002 callers cannot substitute shape, identity or operand roles', async () => {
    const { plan, claims, graphs } = await snapshotAccessFixture();
    const claim = claims.find(c => Object.values(c.operand_bindings).some(b => b.kind === 'node'));
    const [role_id, binding] = Object.entries(claim.operand_bindings).find(([, b]) => b.kind === 'node');
    const selector = { fact_key: claim.fact_key, role_id, alias: binding.alias };
    const foreignAlias = Object.keys(graphs.find(g => g.fact_key === claim.fact_key).nodes).find(a => a !== binding.alias);
    for (const changed of [{ fact_key: 'unknown' }, { role_id: 'unknown' }, { alias: foreignAlias },
        { shape: { type: 'scalar' } }, { value: {} }, { version: 'forged' }, { phase: 'proof' }]) {
        let events = 0;
        assert.throws(() => plan.open({ ...selector, ...changed }, () => events++), /snapshot_access_/);
        assert.equal(events, 0);
    }
    let getterCalls = 0;
    assert.throws(() => plan.open({ ...selector, get alias() { getterCalls++; return binding.alias; } }, () => {}), /snapshot_access_selector/);
    assert.throws(() => plan.open(new Proxy(selector, { ownKeys() { getterCalls++; return []; } }), () => {}), /snapshot_access_selector/);
    assert.equal(getterCalls, 0);
    assert.throws(() => plan.open(selector, null), /snapshot_access_selector/);
    for (const c of claims) for (const [role, b] of Object.entries(c.operand_bindings)) {
        if (b.kind === 'node' || b.kind === 'node_set') continue;
        assert.throws(() => plan.open({ fact_key: c.fact_key, role_id: role, alias: b.alias || 'claim' }, () => {}), /snapshot_access_binding_kind/);
    }
    const access = plan.open(selector, () => {});
    assert.throws(() => access.handle.get('label'), /access_/);
    assert.throws(() => access.assertHealthy(), /access_failed/);
});

test('N02G:SNAPSHOT-ACCESS-004 admitted handles feed the recorder without expected-trace input', async () => {
    const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
    const { plan, claims, graphs } = await snapshotAccessFixture();
    const claim = claims.find(c => Object.values(c.operand_bindings).some(b => b.kind === 'node'));
    const [role_id, binding] = Object.entries(claim.operand_bindings).find(([, b]) => b.kind === 'node');
    const recorder = createCausalRecorder({ executionId: 'snapshot-admission-test', maxEvents: 10 });
    const scope = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
    const access = plan.open({ fact_key: claim.fact_key, role_id, alias: binding.alias }, scope.observe);
    const value = access.handle.get('id');
    assert.equal(value, graphs.find(g => g.fact_key === claim.fact_key).nodes[binding.alias].ref_id);
    access.revoke(); access.assertHealthy(); scope.seal();
    const trace = recorder.finish();
    assert.equal(trace.derivation_trace.length, 1);
    assert.equal(trace.proof_trace.length, 0);
    assert.equal(trace.derivation_trace[0].alias, binding.alias);
    assert.equal(trace.derivation_trace[0].role, role_id);
    assert.deepEqual(trace.derivation_trace[0].path, ['id']);
    assert.deepEqual(trace.derivation_trace[0].outcome, ['scalar', value]);
    assert.equal(Object.hasOwn(trace, 'result'), false);
});

test('N02G:SNAPSHOT-ACCESS-005 node-set roster, order and emptiness come only from admitted bindings', async () => {
    const { plan, claims, graphs } = await snapshotAccessFixture();
    let sets = 0; let empty = 0;
    const { decodeObservation } = require('../../../src/next/provenance/observationContract');
    for (const claim of claims) for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
        if (binding.kind !== 'node_set') {
            assert.throws(() => plan.openSet({ fact_key: claim.fact_key, role_id }, () => {}), /snapshot_access_binding_kind/);
            continue;
        }
        const events = [];
        const selector = { fact_key: claim.fact_key, role_id };
        for (const override of [{ aliases: [] }, { alias: 'forged' }, { shape: {} }, { value: [] }]) {
            assert.throws(() => plan.openSet({ ...selector, ...override }, () => events.push('unexpected')), /snapshot_access_selector/);
        }
        assert.equal(events.length, 0);
        const access = plan.openSet(selector, e => events.push(e));
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        assert.equal(access.handle.length(), binding.aliases.length);
        assert.deepEqual([...access.handle].map(node => node.get('id')), binding.aliases.map(alias => graph.nodes[alias].ref_id));
        assert.deepEqual(events.filter(e => e[5] === 'operand_set' && e[1] === 'next' && e[6][0] === 'node').map(e => e[6][1]), binding.aliases);
        for (const event of events) assert.deepEqual(decodeObservation(event), event);
        access.revoke(); access.assertHealthy();
        sets++; if (!binding.aliases.length) empty++;
    }
    assert.ok(sets > 10); assert.ok(empty > 0);
});

test('N02G:SNAPSHOT-ACCESS-006 selection reads admitted members rather than an expected result set', async () => {
    const { createCausalRecorder } = require('../../../src/next/provenance/causalRecorder');
    const { plan, claims, graphs } = await snapshotAccessFixture();
    const claim = claims.find(c => Object.values(c.operand_bindings).some(b => b.kind === 'node_set' && b.aliases.length > 2));
    const [role_id, binding] = Object.entries(claim.operand_bindings).find(([, b]) => b.kind === 'node_set' && b.aliases.length > 2);
    const graph = graphs.find(g => g.fact_key === claim.fact_key);
    const excluded = graph.nodes[binding.aliases[1]].ref_id;
    const recorder = createCausalRecorder({ executionId: 'admitted-selection', maxEvents: 1000 });
    const scope = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
    const access = plan.openSet({ fact_key: claim.fact_key, role_id }, scope.observe);
    const selected = access.handle.select(node => node.get('id') !== excluded);
    const ids = [...selected].map(node => node.get('id'));
    assert.deepEqual(ids, binding.aliases.filter((_, i) => i !== 1).map(alias => graph.nodes[alias].ref_id));
    access.revoke(); access.assertHealthy(); scope.seal();
    const trace = recorder.finish().derivation_trace;
    assert.deepEqual(trace.filter(e => e.operation === 'select_member').map(e => e.outcome),
        binding.aliases.map((alias, i) => ['decision', alias, i !== 1]));
    assert.deepEqual(trace.find(e => e.operation === 'select_return').outcome.slice(2), binding.aliases.filter((_, i) => i !== 1));
    assert.ok(binding.aliases.every(alias => trace.some(e => e.alias === alias && e.operation === 'get' && e.path[0] === 'id')));
});

test('N02G:SNAPSHOT-ACCESS-007 traversal follows only admitted reachable material edges', async () => {
    const { plan, claims, graphs } = await snapshotAccessFixture();
    let traversals = 0; const visitedKinds = new Set();
    for (const claim of claims) {
        const first = Object.entries(claim.operand_bindings).find(([, b]) => b.kind === 'node');
        if (!first) continue;
        const [role_id, binding] = first; const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const events = []; const access = plan.open({ fact_key: claim.fact_key, role_id, alias: binding.alias }, e => events.push(e));
        const queue = [[binding.alias, access.handle]]; const seen = new Set([binding.alias]);
        for (let i = 0; i < queue.length; i++) {
            const [alias, handle] = queue[i];
            for (const edge of graph.edges.filter(e => e.relation === 'material_ref' && e.source === alias)) {
                const target = handle.traverse(edge.id);
                assert.equal(target.get('id'), graph.nodes[edge.target].ref_id);
                assert.ok(events.some(e => e[1] === 'traverse' && e[2] === alias && e[6][1] === edge.id && e[6][2] === edge.target));
                visitedKinds.add(graph.nodes[edge.target].kind); traversals++;
                if (!seen.has(edge.target)) { seen.add(edge.target); queue.push([edge.target, target]); }
            }
        }
        access.revoke(); access.assertHealthy();
    }
    assert.ok(traversals > 100); assert.ok(visitedKinds.size > 5);
});

test('N02G:SNAPSHOT-ACCESS-008 admitted node-set selections retain traversal and shared revocation', async () => {
    const { plan, claims, graphs } = await snapshotAccessFixture(); let exercised = 0;
    for (const claim of claims) for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
        if (binding.kind !== 'node_set' || !binding.aliases.length) continue;
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const edge = graph.edges.find(e => e.relation === 'material_ref' && e.source === binding.aliases[0]);
        if (!edge) continue;
        const events = []; const access = plan.openSet({ fact_key: claim.fact_key, role_id }, e => events.push(e));
        const selected = access.handle.select((node, index) => index === 0 && node.traverse(edge.id).get('id') === graph.nodes[edge.target].ref_id);
        assert.equal(selected.length(), 1); assert.equal(access.handle.length(), binding.aliases.length);
        const target = selected.at(0).traverse(edge.id);
        assert.equal(target.get('id'), graph.nodes[edge.target].ref_id);
        assert.equal(events.filter(e => e[1] === 'traverse').length, 2);
        access.revoke(); access.assertHealthy();
        assert.throws(() => target.get('id'), /access_revoked/);
        assert.throws(() => access.assertHealthy(), /access_failed/);
        exercised++;
    }
    assert.ok(exercised > 10);
});

test('N02G:SNAPSHOT-ACCESS-003 projection cannot bypass package or composite snapshot identity admission', async () => {
    const validation = await validators();
    assert.throws(() => compileSnapshotAccess({ documents: [] }, validation), /package_not_admitted/);
    const f = fixture(); const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const node = Object.values(graphs.graphs[0].nodes).find(n => n.binding === 'snapshot');
    node.version = `sha256:${'0'.repeat(64)}`;
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.equal(validation.graphs(graphs), true);
    assert.throws(() => compileSnapshotAccess(admitPackage(f), validation), /graph_index_node_snapshot_mismatch/);
});

test('N02G:AUTHORING-001 complete package resolves reviewed links and identities', async () => {
    const result = compileAuthoringIndex(admitPackage(fixture()), await validators());
    assert.equal(result.stage, 'indexed_authoring_only');
    assert.equal(result.graphs.length, 76);
    assert.equal(result.evaluatorCount, 39);
    assert.equal(Object.hasOwn(result, 'proof'), false);
});

test('N02G:AUTHORING-010 IR keeps all graphs, typed predicates, roles and proof expectations', async () => {
    const f = fixture();
    const admitted = admitPackage(f);
    const ir = compileAuthoringIR(admitted, await validators());
    const original = admitted.documents.find(d => d.path === graphPath).value;
    assert.equal(ir.stage, 'typed_authoring_ir_only');
    assert.equal(ir.executable, false);
    assert.equal(ir.graphs.length, 76);
    assert.equal(ir.graphs.reduce((n, g) => n + g.predicates.length, 0), 11456);
    assert.equal(ir.graphs.reduce((n, g) => n + g.operands.length, 0), 277);
    assert.equal(ir.graphs.reduce((n, g) => n + g.selections.length, 0), 73);
    assert.deepEqual(ir.graphs.map(g => g.fact_key), ir.order);
    assert.deepEqual(ir.authority_refs, admitted.documents.map(({ path, sha256 }) => ({ path, sha256 })));
    for (const graph of ir.graphs) {
        const source = original.graphs.find(g => g.fact_key === graph.fact_key);
        for (const key of ['nodes', 'sets', 'edges', 'obligations', 'selections']) assert.deepEqual(graph[key], source[key]);
        assert.deepEqual(graph.expected_trace, source.trace_contract);
        assert.deepEqual(graph.predicates.map(p => p.id), source.predicates.map(p => p.id));
        assert.ok(graph.predicates.every(p => p.operands.every(a => a.type && a.expression.kind)));
        for (const parent of graph.parents) assert.ok(ir.order.indexOf(parent.fact_key) < ir.order.indexOf(graph.fact_key));
        assert.equal(Object.hasOwn(graph.claim, 'operand_bindings'), false);
        assert.equal(Object.hasOwn(graph, 'result'), false);
        assert.equal(Object.hasOwn(graph, 'payload'), false);
    }
    assert.ok(ir.graphs.flatMap(g => g.required_state_checks).length > 0);
});

test('N02G:AUTHORING-011 template expansion is lexical and preserves window boundaries', async () => {
    const admitted = admitPackage(fixture());
    const ir = compileAuthoringIR(admitted, await validators());
    const original = admitted.documents.find(d => d.path === graphPath).value;
    const templates = admitted.documents.find(d => d.path === prefix + 'predicate-templates-v1.json').value.templates;
    let expansions = 0;
    for (const graph of ir.graphs) {
        const source = original.graphs.find(g => g.fact_key === graph.fact_key);
        for (const [id, window] of Object.entries(source.windows || {})) {
            assert.equal(graph.windows[id].kind, window.kind);
            if (window.kind === 'range') {
                assert.equal(graph.windows[id].start_inclusive, window.start_inclusive);
                assert.equal(graph.windows[id].end_inclusive, window.end_inclusive);
            }
        }
        for (const predicate of graph.predicates) for (const operand of predicate.operands) {
            const e = operand.expression;
            if (e.kind !== 'predicate_template') continue;
            expansions++;
            const t = templates.find(t => t.id === e.template_ref.id && t.version === e.template_ref.version);
            const p = source.predicates.find(p => p.id === predicate.id);
            const ref = p.args.find(a => a.template);
            assert.equal(e.combinator, 'all');
            assert.equal(e.member_slot, 'current_member');
            assert.equal(e.template_ref.hash, ref.template.hash);
            assert.deepEqual(e.body.map(p => p.op), t.body.map(p => p.op));
            e.body.forEach((p, i) => p.operands.forEach((arg, j) => {
                const parameter = t.body[i].args[j];
                if (parameter.current_member_field_parameter) {
                    const selector = ref.bindings[parameter.current_member_field_parameter].selector;
                    assert.deepEqual(arg, { kind: 'member_field', slot: 'current_member',
                        node_kind: selector.kind, segments: selector.segments });
                } else assert.deepEqual(arg, e.bindings[parameter.parameter]);
            }));
        }
    }
    assert.equal(expansions, 28);
});

test('N02G:AUTHORING-012 IR remains frozen and cannot bypass package or semantic admission', async () => {
    const validation = await validators();
    const f = fixture();
    const admitted = admitPackage(f);
    const ir = compileAuthoringIR(admitted, validation);
    function frozen(value) {
        if (value && typeof value === 'object') {
            assert.ok(Object.isFrozen(value));
            for (const child of Object.values(value)) frozen(child);
        }
    }
    frozen(ir);
    assert.throws(() => { ir.graphs[0].expected_trace.proof.required_nodes.pop(); }, TypeError);
    assert.throws(() => compileAuthoringIR({ ...admitted }, validation), /package_not_admitted/);
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const graph = graphs.graphs.find(g => g.selections.some(s => s.input_evidence_state));
    delete graph.selections[0].input_evidence_state;
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIR(admitPackage(f), validation), /selection_binding_input_state/);
});

test('N02G:AUTHORING-013 IR is deterministic without copying source payloads or oracle data', async () => {
    const validation = await validators();
    const f = fixture();
    const first = compileAuthoringIR(admitPackage(f), validation);
    f.entries.reverse();
    f.authority.reverse();
    const second = compileAuthoringIR(admitPackage(f), validation);
    assert.deepEqual(second, first);
    assert.deepEqual(Object.keys(first).sort(), ['authority_refs', 'executable', 'format', 'graphs', 'order', 'stage', 'version']);
    for (const graph of first.graphs) {
        assert.deepEqual(Object.keys(graph).sort(), ['claim', 'claim_id', 'edges', 'evaluator_ref', 'expected_trace',
            'fact_key', 'nodes', 'obligations', 'operands', 'parents', 'predicates', 'required_state_checks',
            'selections', 'sets', 'windows']);
        assert.equal(Object.hasOwn(graph.claim, 'value'), false);
        assert.equal(Object.hasOwn(graph.claim, 'expected'), false);
    }
});

test('N02G:AUTHORING-015 internal lowering preserves sort ties and projection multiplicity', () => {
    // Isolated lowering contract, not an admitted graph or an executable proof.
    const sources = [{ sort: { keys: [
        { selector: { kind: 'event', segments: ['date'] }, direction: 'desc' },
        { selector: { kind: 'event', segments: ['amount_minor'] }, direction: 'asc' }
    ], tie_break: 'kind_ref_version' } },
    { projection: { set: 'ordered', selector: { kind: 'event', segments: ['amount_minor'] }, as: 'sequence' } }];
    const graph = { fact_key: 'internal', claim_id: 'claim-internal', nodes: {}, sets: { ordered: ['a', 'b'] },
        predicates: [{ id: 'p' }], edges: [], obligations: [], selections: [], trace_contract: {} };
    const index = { order: ['internal'], graphs: [{ fact_key: 'internal', evaluator_ref: {}, parents: [] }] };
    const input = { documents: [], graphs: [graph], claims: [{ fact_key: 'internal', claim_id: 'claim-internal' }], index,
        operandBindings: { stage: 'operand_bindings_indexed_only', graphs: [{ fact_key: 'internal', operands: [] }] },
        predicateTypes: { stage: 'predicate_types_checked_only', unresolved: 0, typedGraphs: [{ fact_key: 'internal',
            claim_id: 'claim-internal', predicates: [{ id: 'p', op: 'internal_test', obligation: 'evidence_set', atom: 'evidence_set',
                operands: sources.map(source => ({ type: {}, source })) }] }] },
        selectionBindings: { stage: 'selection_bindings_checked_only', stateChecks: [] }, templates: { templates: [] } };
    const [sort, projection] = lowerAuthoringIR(input).graphs[0].predicates[0].operands.map(o => o.expression);
    assert.equal(sort.tie_break, 'kind_ref_version');
    assert.deepEqual(sort.keys.map(k => k.direction), ['desc', 'asc']);
    assert.deepEqual(sort.keys.map(k => k.selector.segments), [['date'], ['amount_minor']]);
    assert.equal(projection.as, 'sequence');
    assert.deepEqual(projection.set, { kind: 'set_ref', name: 'ordered' });
});

test('N02G:AUTHORING-004 schema-valid type substitution fails after package hash is repaired', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const value = JSON.parse(entry.bytes);
    const predicate = value.graphs[0].predicates.find(p => p.op === 'field_eq');
    predicate.args[1] = { field: { node: 'card_blue', segments: ['id'] } };
    assert.equal(validation.graphs(value), true);
    entry.bytes = Buffer.from(JSON.stringify(value));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /operator_types_nominal_mismatch/);
});

test('N02G:AUTHORING-005 registry/schema drift fails independently of current payload values and hashes', async () => {
    const validation = await validators();
    const f = fixture();
    const graphEntry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(graphEntry.bytes);
    const registryEntry = f.entries.find(e => e.path === graphs.material_registry.path);
    const registry = JSON.parse(registryEntry.bytes);
    // A more permissive registry limit need not invalidate any present payload.
    // Repair both hash layers: only the schema/registry projection can reject it.
    registry.kinds.card.fields.closing_day.maximum = 32;
    registryEntry.bytes = Buffer.from(JSON.stringify(registry));
    graphs.material_registry.hash = hash(registryEntry.bytes);
    graphEntry.bytes = Buffer.from(JSON.stringify(graphs));
    for (const entry of [registryEntry, graphEntry]) f.authority.find(a => a.path === entry.path).sha256 = hash(entry.bytes);
    assert.equal(validation.graphs(graphs), true);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /schema_registry_projection:payload_card/);
});

test('N02G:AUTHORING-006 type-compatible money comparison cannot discharge node identity', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const predicate = graphs.graphs[0].predicates.find(p => p.op === 'kind_is');
    predicate.op = 'eq';
    predicate.args = [{ field: { node: 'account_a', segments: ['opening_balance_minor'] } },
        { field: { node: 'account_b', segments: ['opening_balance_minor'] } }];
    assert.equal(validation.graphs(graphs), true);
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    // Same nominal unit and valid references: rejection must be the obligation
    // association, not package/schema/fingerprint or operand-type mismatch.
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /obligation_binding_semantics/);
});

test('N02G:AUTHORING-007 valid binding shape cannot change a registry role input kind', async () => {
    const validation = await validators();
    const f = fixture();
    const graphEntry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(graphEntry.bytes);
    const claimEntry = f.entries.find(e => e.path === graphs.claim_contract.path);
    const claims = JSON.parse(claimEntry.bytes);
    claims.claims[0].operand_bindings.context = { kind: 'node', alias: 'person_a' };
    assert.equal(validation.claims(claims), true);
    claimEntry.bytes = Buffer.from(JSON.stringify(claims));
    graphs.claim_contract.hash = hash(claimEntry.bytes);
    graphEntry.bytes = Buffer.from(JSON.stringify(graphs));
    for (const entry of [claimEntry, graphEntry]) f.authority.find(a => a.path === entry.path).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /operand_binding_kind/);
});

test('N02G:AUTHORING-008 removed estimated-input state fails after package hashes are repaired', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const graph = graphs.graphs.find(g => g.selections.some(s => s.input_evidence_state));
    delete graph.selections[0].input_evidence_state;
    assert.equal(validation.graphs(graphs), true);
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /selection_binding_input_state/);
});

test('N02G:AUTHORING-009 a changed claim literal reaches descriptor binding rejection', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const predicate = graphs.graphs[0].predicates.find(p => p.args.some(a =>
        JSON.stringify(a.claim?.segments) === JSON.stringify(['time_basis'])));
    predicate.args.find(a => a.literal).literal.value = 'due_date';
    assert.equal(validation.graphs(graphs), true);
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /claim_requirements_value/);
});

test('N02G:AUTHORING-014 removing collection anchor cannot be hidden by repaired schema and hashes', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const graphs = JSON.parse(entry.bytes);
    const g = graphs.graphs[0];
    const id = g.predicates.find(p => p.op === 'set_eq' && p.args.some(a => a.ref_set)).id;
    g.predicates = g.predicates.filter(p => p.id !== id);
    for (const o of g.obligations) o.predicates = o.predicates.filter(p => p !== id);
    assert.equal(validation.graphs(graphs), true);
    entry.bytes = Buffer.from(JSON.stringify(graphs));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIR(admitPackage(f), validation), /collection_requirements_membership_anchor/);
});

test('N02G:AUTHORING-002 admitted but altered authority cannot evade cross-document hashes', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === prefix + 'claims-v2.json');
    entry.bytes = Buffer.from(entry.bytes.toString() + ' ');
    f.authority.find(a => a.path === entry.path).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /graph_index_authority_hash/);
    assert.throws(() => compileAuthoringIndex({ stage: 'admitted_bytes_only', documents: [] }, validation), /package_not_admitted/);
});

test('N02G:AUTHORING-003 schema-valid duplicate graph fails after package hashes are repaired', async () => {
    const validation = await validators();
    const f = fixture();
    const entry = f.entries.find(e => e.path === graphPath);
    const value = JSON.parse(entry.bytes);
    // Keep the objects different so JSON Schema uniqueItems cannot mask the
    // identity collision this test must reach in the index pass.
    value.graphs[1].fact_key = value.graphs[0].fact_key;
    value.graphs[1].claim_id = value.graphs[0].claim_id;
    entry.bytes = Buffer.from(JSON.stringify(value));
    f.authority.find(a => a.path === graphPath).sha256 = hash(entry.bytes);
    assert.throws(() => compileAuthoringIndex(admitPackage(f), validation), /graph_index_duplicate/);
});
