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
const { admitPhaseCompositionProfile, PROFILE_PATH } = require('../../../src/next/provenance/phaseCompositionProfile');
function reviewedPhaseProfile() {
    return admitPhaseCompositionProfile({ source: fs.readFileSync(path.join(root, PROFILE_PATH), 'utf8'),
        registry: JSON.parse(fs.readFileSync(path.join(root, prefix + 'metric-evaluator-registry-v1.json'), 'utf8')) });
}

// Historical delta tests retain their exact pre-parent authorities. First prove
// that today's WHOLE corpus follows the ratified parent + source_state chain;
// never remove arbitrary observations to make a historical assertion pass.
// Runtime fixtures below still admit the current corpus and current expected.
let historicalReader;
function readPreParentAuthorship(file) {
    if (!historicalReader) {
        const { createHistoricalAuthoringReader } = require('../../../scripts/agent/historicalAuthoringChain.cjs');
        historicalReader = createHistoricalAuthoringReader(name =>
            fs.readFileSync(path.join(root, name), 'utf8').replaceAll('\r\n', '\n'));
    }
    return historicalReader(file);
}
function preParentDerivation(graph) {
    const corpus = JSON.parse(readPreParentAuthorship(graphPath));
    return corpus.graphs.find(row => row.fact_key === graph.fact_key).trace_contract.derivation;
}

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

// Closed documentary rule: only roles/material nodes/relations/snapshots are
// inputs. No existing reads, selection, oracle, trace or financial result.
function budgetClassRequirements({ roles, nodes, edges, snapshots }) {
    assert.equal(roles.events.kind, 'node_set'); assert.equal(roles.categories.kind, 'node_set');
    const snapshot = (alias, kind) => {
        const node = nodes[alias]; assert.equal(node.kind, kind);
        const found = snapshots.filter(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
        assert.equal(found.length, 1); return found[0].payload;
    };
    const follow = (alias, field, kind) => {
        const found = edges.filter(e => e.source === alias && e.field === field && e.relation === 'material_ref');
        assert.equal(found.length, 1); const target = found[0].target;
        snapshot(target, kind); assert.equal(snapshot(alias, nodes[alias].kind)[field], nodes[target].ref_id);
        return target;
    };
    const category = event => {
        const alias = follow(event, 'category_id', 'category'); assert.ok(roles.categories.aliases.includes(alias));
        return { alias, kind: snapshot(alias, 'category').kind };
    };
    const effective = new Set();
    for (const event of roles.events.aliases) {
        snapshot(event, 'event'); const own = category(event);
        assert.ok(['expense', 'compensation', 'income', 'neutral'].includes(own.kind));
        if (own.kind === 'expense') effective.add(own.alias);
        if (own.kind === 'compensation') {
            const original = category(follow(event, 'compensates', 'event'));
            assert.equal(original.kind, 'expense'); effective.add(original.alias);
        }
    }
    return [...effective].sort().map(node => ({ node, segments: ['budget_class'] }));
}

// Declarative optional-field composition for this reviewed profile only.
function transferScopeRequirements(claim, nodes, snapshots) {
    assert.deepEqual(claim.evaluator_ref, { evaluator_id: 'consumption_effect', evaluator_version: 1 });
    assert.equal(claim.subject.kind, 'transfer_pair');
    const profile = { role: 'events', kind: 'event', field: 'transfer_pair', operation: 'has_then_get' };
    const role = claim.operand_bindings[profile.role]; assert.equal(role.kind, 'node_set');
    assert.equal(new Set(role.aliases).size, role.aliases.length);
    const reads = []; const structural = []; const ids = new Set();
    for (const alias of role.aliases) {
        const n = nodes[alias]; assert.equal(n.binding, 'snapshot'); assert.equal(n.kind, profile.kind);
        assert.ok(!ids.has(n.ref_id)); ids.add(n.ref_id);
        const found = snapshots.filter(s => s.kind === n.kind && s.ref_id === n.ref_id && s.version === n.version);
        assert.equal(found.length, 1); const s = found[0]; assert.equal(s.payload.id, n.ref_id);
        assert.equal(s.semantic_fingerprint, n.semantic_fingerprint);
        structural.push({ node: alias, operation: 'has', segments: [profile.field] });
        if (Object.hasOwn(s.payload, profile.field)) {
            require('../../../src/next/provenance/literalTypes').validateLiteral({ type: 'id', value: s.payload[profile.field] });
            reads.push({ node: alias, segments: [profile.field] });
        }
    }
    return { reads, structural };
}
function reviewedTransferScopeProposal() {
    const text = fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/transfer-scope-proposal.json'), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(hash(text), 'sha256:bac176de329bbb6fc009165f92830efcdc12716f61211bf8e02d1c4c669993d3');
    return JSON.parse(text);
}
function reviewedSimilarEventProposal() {
    const text = fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/similar-event-proposal.json'), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(hash(text), 'sha256:ee420d19e436280b7ab84a91429f81ae3c64c5cb4b058153ecbe64ae2ade3efa');
    return JSON.parse(text);
}
function undoReviewedSimilarEvent(corpus) {
    undoReviewedAccountInstallment(corpus);
    const proposal = reviewedSimilarEventProposal(); assert.equal(proposal.records.length, 1);
    for (const r of proposal.records) {
        const matches = corpus.graphs.filter(g => g.fact_key === r.fact_key); assert.equal(matches.length, 1);
        assert.deepEqual(matches[0].trace_contract.derivation, r.proposed_derivation);
        matches[0].trace_contract.derivation = structuredClone(r.current_derivation);
    }
}
function undoReviewedAccountInstallment(corpus) {
    const { reviewedCorpus } = require('../../../docs/audit-evidence/n02g-causal-authoring-profile/prepare-account-installment-application.cjs');
    const { proposal } = reviewedCorpus();
    for (const record of proposal.records) {
        const graph = corpus.graphs.find(row => row.fact_key === record.fact_key);
        assert.ok(graph); assert.deepEqual(graph.trace_contract.derivation, record.proposed_derivation);
        graph.trace_contract.derivation = structuredClone(record.current_derivation);
    }
}

test('N02G:PARENT-COMPILER-001 six admitted parent roles bind private transport identity and full material reads', async () => {
    const { createSameExecutionParentLedger } = require('../../../src/next/provenance/claimBinding');
    const { admitExecutionRegistry, resolveExecutionEvaluator, admitExecutionContract } = require('../../../src/next/provenance/executionRegistry');
    const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
    const { runAdmittedGraph, runAdmittedProof } = require('../../../src/next/provenance/executionHost');
    const { measureMaterialFingerprint } = require('../../../src/next/provenance/proofOperators');
    const { digest } = require('../../../src/next/kernel/canonicalValue');
    const { buildExecutionRegistryCandidate, buildAvailableMetricArtifacts, buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const admitBuilt = (source, kind, entry) => {
        const bytes = Buffer.from(source);
        const manifestBytes = Buffer.from(require('../../../src/next/kernel/canonicalValue').canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
            kind, entry, files: [{ path: entry, media_type: 'text/javascript', sha256: hash(bytes) }] }));
        return admitArtifact({ manifestBytes, entries: [{ path: entry, bytes }], expectedRoot: hash(manifestBytes) });
    };
    const proofChild = admitBuilt(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const built = buildExecutionRegistryCandidate();
    const metricArtifacts = buildAvailableMetricArtifacts().built;
    const registryReceipt = admitExecutionRegistry({ bytes: Buffer.from(built.bytes), expectedHash: built.registry_hash });
    const { plan, graphs, claims, snapshots, registry } = await snapshotAccessFixture();
    const current = JSON.parse(fs.readFileSync(path.join(root, graphPath), 'utf8'));
    const graphHash = hash(fs.readFileSync(path.join(root, graphPath), 'utf8').replaceAll('\r\n', '\n'));
    const descriptor = { registry_version: registry.registry_version, kind: 'derived_claim',
        fields: registry.kinds.derived_claim.fields };
    const ledger = createSameExecutionParentLedger({ executionId: 'compiler-parent-transport' });
    const receipts = new Map();
    const children = graphs.filter(graph => Object.values(graph.nodes).some(node => node.binding === 'validated_parent'));
    const parentKeys = [...new Set(children.flatMap(graph => Object.values(graph.nodes)
        .filter(node => node.binding === 'validated_parent').map(node => node.fact_key)))];
    assert.equal(parentKeys.length, 4);
    for (const fact_key of parentKeys) {
        const claim = claims.find(row => row.fact_key === fact_key);
        const graph = graphs.find(row => row.fact_key === fact_key);
        const entry = resolveExecutionEvaluator(registryReceipt, claim.evaluator_ref);
        const primary_inputs = Object.entries(graph.nodes).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
            .map(([alias, node]) => {
                const snapshot = snapshots.find(row => row.kind === node.kind && row.ref_id === node.ref_id && row.version === node.version);
                assert.ok(snapshot);
                return { alias, kind: node.kind, ref_id: node.ref_id, version: node.version,
                    semantic_fingerprint: 'sha256:' + digest({ registry_version: registry.registry_version,
                        kind: node.kind, ref_id: node.ref_id, version: node.version, payload: snapshot.payload }) };
            });
        const scope = ledger.openInvocation({ invocationId: 'fixture-' + fact_key });
        // Only a TCB transport fixture: these amounts are not a financial
        // acceptance or a substitute for the future host's proof/freeze gate.
        receipts.set(fact_key, scope.acceptPrimary({ descriptor, preimage: {
            claim_contract_hash: current.claim_contract.hash, graph_contract_hash: graphHash,
            metric_registry_hash: registryReceipt.observed_hash, claim_id: claim.claim_id, fact_key,
            evaluator_ref: claim.evaluator_ref, result: { unit: 'BRL_minor', kind: 'money_minor', value: 100 },
            operand_bindings: claim.operand_bindings, primary_inputs, parents: [], registry_roles: entry.roles } }));
        scope.seal();
    }
    let checked = 0;
    for (const graph of children) {
        const claim = claims.find(row => row.fact_key === graph.fact_key);
        const scope = ledger.openInvocation({ invocationId: 'child-' + graph.fact_key });
        for (const [role_id, operand] of Object.entries(claim.operand_bindings).filter(([, binding]) => binding.kind === 'parent_claim')) {
            const receipt = receipts.get(operand.fact_key);
            const alias = Object.entries(graph.nodes).find(([, node]) => node.binding === 'validated_parent' && node.fact_key === operand.fact_key)[0];
            const edge = graph.edges.find(row => row.relation === 'derived_from' && row.field === role_id && row.target === alias);
            for (const phase of ['derivation', 'proof']) {
                const recorder = createCausalRecorder({ executionId: 'compiler-parent-transport', maxEvents: 1000 });
                const observation = recorder.open({ invocationId: graph.fact_key, phase });
                const opened = plan.openDerivedRole({ fact_key: graph.fact_key, role_id, phase }, scope, receipt, registryReceipt, observation.observe);
                const handle = opened.control.traverse(edge.id);
                if (phase === 'derivation') {
                    assert.equal(handle.get('fact_key'), operand.fact_key);
                    assert.equal(handle.get('evaluator_version'), 1);
                    assert.equal(handle.get('result_hash'), opened.resultHash);
                    assert.equal(handle.get('result').get('value'), 100);
                } else assert.equal(measureMaterialFingerprint(handle, descriptor), opened.expectedFingerprint);
                opened.control.assertHealthy(); opened.control.revoke(); observation.seal();
                const authored = graph.trace_contract[phase];
                const expected = { required_nodes: [alias], required_reads: authored.required_reads.filter(row => row.node === alias),
                    required_edges: [edge.id], required_claim_reads: [], required_structural: authored.required_structural.filter(row => row.node === alias),
                    required_selections: [], selected_nodes: [] };
                const trace = recorder.finish();
                const args = { executionId: 'compiler-parent-transport', invocationId: graph.fact_key, phase,
                    expected, trace, sets: {}, bindings: [], operandSets: [], accessBindings: [opened.accessBinding] };
                const coverage = comparePhaseCoverage(args);
                assert.equal(coverage.matched, true, `${graph.fact_key}/${role_id}/${phase}: ${JSON.stringify(coverage.components)}`);
                assert.equal(coverage.graph_accepted, false);
                const events = trace[phase + '_trace'];
                const record = events.find(row => row.operation === 'get' && row.path.join('.') === 'result');
                assert.ok(record);
                assert.equal(coverage.event_coverage.find(row => row.sequence === record.sequence).component, 'access_metadata');
                const missing = { ...trace, [phase + '_trace']: events.filter(row => row.sequence !== record.sequence)
                    .map((row, sequence) => ({ ...row, sequence })) };
                assert.equal(comparePhaseCoverage({ ...args, trace: missing }).matched, false);
                assert.throws(() => handle.get('result'));
            }
            for (const invalidReceipt of [Object.freeze({}), structuredClone(receipt), receipts.get(parentKeys.find(key => key !== operand.fact_key))]) {
                let observations = 0;
                assert.throws(() => plan.openDerivedRole({ fact_key: graph.fact_key, role_id, phase: 'derivation' },
                    scope, invalidReceipt, registryReceipt, () => observations++));
                assert.equal(observations, 0);
            }
            assert.throws(() => plan.openDerivedRole({ fact_key: graph.fact_key, role_id, phase: 'derivation' },
                { resolveParent: () => ({}) }, receipt, registryReceipt, () => {}));
            checked++;
        }
        const parentContext = { receiptScope: scope, registryReceipt, receipts: Object.fromEntries(
            Object.entries(claim.operand_bindings).filter(([, binding]) => binding.kind === 'parent_claim')
                .map(([role, binding]) => [role, receipts.get(binding.fact_key)])) };
        const transport = plan.projectMetricTransport({ fact_key: graph.fact_key }, parentContext);
        assert.equal(transport.parentGroups.length, 2);
        assert.equal(transport.graph_accepted, false);
        // Independent in-process control locates formula/transport errors;
        // only the separate measured child below is execution evidence.
        const { createInstrumentedAccess, createNodeSetAccess, createDerivedParentAccess } = require('../../../src/next/provenance/instrumentedAccess');
        const controls = []; const operands = {};
        for (const group of transport.directGroups) {
            const control = createInstrumentedAccess({ bindings: group.bindings, links: group.links, emit: () => {} });
            controls.push(control); operands[group.role] = control.handle(group.alias);
        }
        for (const group of transport.nodeSets) {
            const control = createNodeSetAccess({ ...group, emit: () => {} });
            controls.push(control); operands[group.role] = control.handle;
        }
        for (const group of transport.parentGroups) {
            const control = createDerivedParentAccess({ phase: 'derivation', bindings: group.bindings, edges: group.edges, emit: () => {} });
            controls.push(control); operands[group.role] = control.traverse(group.edgeId);
        }
        const controlValue = require('../../../src/next/provenance/metricParents').evaluateParentMetric(operands, claim.metric);
        for (const control of controls) { control.revoke(); control.assertHealthy(); }
        assert.throws(() => plan.projectMetricTransport({ fact_key: graph.fact_key }));
        let getterCalls = 0;
        assert.throws(() => plan.projectMetricTransport({ fact_key: graph.fact_key }, {
            receiptScope: scope, registryReceipt, get receipts() { getterCalls++; return parentContext.receipts; } }));
        assert.equal(getterCalls, 0);
        const metric = metricArtifacts.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id);
        const artifactReceipt = admitArtifact({ manifestBytes: Buffer.from(metric.manifest), expectedRoot: metric.artifact_root,
            entries: [{ path: 'bundle.js', bytes: Buffer.from(metric.source) }] });
        const entry = resolveExecutionEvaluator(registryReceipt, claim.evaluator_ref);
        const contractReceipt = admitExecutionContract({ registryReceipt, evaluatorRef: claim.evaluator_ref,
            bytes: Buffer.from(fs.readFileSync(path.join(root, entry.contract_path), 'utf8').replaceAll('\r\n', '\n')) });
        assert.equal(artifactReceipt.observed_root, entry.evaluator_artifact_root);
        assert.equal(contractReceipt.stage, 'admitted_evaluator_contract_bytes_only');
        const proofArtifact = admitBuilt(buildScalarProofProgram(plan.projectProofProgram({ fact_key: graph.fact_key }).input).source, 'proof', 'bundle.js');
        const proofTransport = plan.projectProofTransport({ fact_key: graph.fact_key }, parentContext);
        const executed = await runAdmittedGraph({ childCapsuleReceipt: proofChild,
            executionId: 'compiler-parent-transport', invocationId: graph.fact_key, timeoutMs: 4000,
            derivation: { artifactReceipt, bindings: [], directGroups: transport.directGroups,
                nodeSets: transport.nodeSets, parentGroups: transport.parentGroups },
            proof: { ...proofTransport.config, artifactReceipt: proofArtifact } });
        assert.equal(executed.graph_accepted, false);
        const expectedValue = claim.metric === 'ranking_winner'
            ? claim.operand_bindings.people.aliases.map(alias => graph.nodes[alias].ref_id).sort()[0] : 0;
        assert.equal(executed.functional_result.value, expectedValue);
        assert.equal(executed.functional_result.value, controlValue);
        const events = executed.trace.derivation_trace;
        assert.equal(events.filter(row => row.operation === 'traverse' && row.alias === 'claim').length, 2);
        assert.equal(events.filter(row => row.operation === 'get' && row.path.join('.') === 'result.value').length, 2);
        assert.ok(events.every(row => !Object.hasOwn(row, 'functional_result')));
        const { evidence_set_mode, ...expected } = graph.trace_contract.derivation;
        const wholePhase = comparePhaseCoverage({ executionId: 'compiler-parent-transport', invocationId: graph.fact_key,
            phase: 'derivation', trace: executed.trace, expected, sets: graph.sets, bindings: [],
            operandSets: Object.entries(claim.operand_bindings).filter(([, binding]) => binding.kind === 'node_set')
                .map(([role, binding]) => ({ role, aliases: binding.aliases })),
            accessBindings: plan.observationMetadata({ fact_key: graph.fact_key, phase: 'derivation' }, parentContext),
            measurements: [{ measurement: 'evaluator_artifact_root', observed: entry.evaluator_artifact_root }] });
        assert.equal(wholePhase.matched, true, `${graph.fact_key}: ${JSON.stringify(wholePhase.components)}`);
        assert.equal(wholePhase.graph_accepted, false);
        assert.equal(wholePhase.event_coverage.length, events.length);
        const proofRecorder = createCausalRecorder({ executionId: 'compiler-parent-transport', maxEvents: 5000 });
        const proofObservation = proofRecorder.open({ invocationId: graph.fact_key, phase: 'proof' });
        const proof = plan.openProof({ fact_key: graph.fact_key }, proofObservation.observe, parentContext);
        const parentAliases = new Set(transport.parentGroups.map(group => group.alias));
        for (const group of transport.parentGroups) {
            const opened = plan.openDerivedRole({ fact_key: graph.fact_key, role_id: group.role, phase: 'proof' },
                scope, parentContext.receipts[group.role], registryReceipt, () => {});
            assert.equal(measureMaterialFingerprint(proof.node(group.alias), proof.material(group.alias)), opened.expectedFingerprint);
            assert.equal(proof.edge(group.edgeId).get('fact_key'), group.bindings[0].value.fact_key);
            opened.control.revoke();
        }
        proof.assertHealthy(); proof.revoke(); proof.assertHealthy(); proofObservation.seal();
        const authoredProof = graph.trace_contract.proof;
        const proofExpected = { required_nodes: [...parentAliases],
            required_reads: authoredProof.required_reads.filter(row => parentAliases.has(row.node)),
            required_edges: transport.parentGroups.map(group => group.edgeId), required_claim_reads: [],
            required_structural: authoredProof.required_structural.filter(row => parentAliases.has(row.node)),
            required_selections: [], selected_nodes: [] };
        const proofCoverage = comparePhaseCoverage({ executionId: 'compiler-parent-transport', invocationId: graph.fact_key,
            phase: 'proof', trace: proofRecorder.finish(), expected: proofExpected, sets: {}, bindings: [], operandSets: [],
            accessBindings: plan.observationMetadata({ fact_key: graph.fact_key, phase: 'proof' }, parentContext)
                .filter(binding => parentAliases.has(binding.alias) && binding.role === 'proof/snapshot') });
        assert.equal(proofCoverage.matched, true, `${graph.fact_key}: ${JSON.stringify(proofCoverage.components)}`);
        assert.equal(proofCoverage.graph_accepted, false);
        const completeProofEvents = [];
        const completeRecorder = createCausalRecorder({ executionId: 'compiler-parent-transport', maxEvents: 10000 });
        const completeScope = completeRecorder.open({ invocationId: graph.fact_key, phase: 'proof' });
        const program = plan.runProofPredicates({ fact_key: graph.fact_key },
            event => { completeProofEvents.push(event); completeScope.observe(event); }, parentContext);
        completeScope.seal();
        assert.equal(program.graph_accepted, false);
        assert.equal(program.predicates, graph.predicates.length);
        assert.equal(program.selections, 0);
        for (const group of transport.parentGroups) {
            assert.ok(completeProofEvents.some(event => event[1] === 'traverse' && event[6][1] === group.edgeId));
            assert.ok(completeProofEvents.some(event => event[1] === 'get' && event[2] === group.alias
                && event[4].join('.') === 'result.value'));
        }
        const { evidence_set_mode: proofSetMode, ...wholeProofExpected } = graph.trace_contract.proof;
        const fullProof = comparePhaseCoverage({ executionId: 'compiler-parent-transport', invocationId: graph.fact_key,
            phase: 'proof', trace: completeRecorder.finish(), expected: wholeProofExpected, sets: graph.sets, bindings: [],
            operandSets: Object.entries(graph.sets).map(([name, aliases]) => ({ role: `proof/set/${name}`, aliases })),
            accessBindings: plan.observationMetadata({ fact_key: graph.fact_key, phase: 'proof' }, parentContext) });
        assert.equal(fullProof.matched, true, `${graph.fact_key}: ${JSON.stringify(Object.fromEntries(
            Object.entries(fullProof.components).map(([name, component]) => [name, {
                matched: component.matched, errors: component.errors?.slice(0, 2), mismatches: component.mismatches }])))}; unsupported=${JSON.stringify(fullProof.event_coverage.filter(event => event.status !== 'covered').slice(0, 3))}`);
        assert.equal(fullProof.graph_accepted, false);
        const isolatedProof = executed;
        assert.equal(isolatedProof.proof_satisfied, true); assert.equal(isolatedProof.graph_accepted, false);
        const isolatedCoverage = comparePhaseCoverage({ executionId: 'compiler-parent-transport', invocationId: graph.fact_key,
            phase: 'proof', trace: isolatedProof.trace, expected: wholeProofExpected, sets: graph.sets, bindings: [],
            operandSets: Object.entries(graph.sets).map(([name, aliases]) => ({ role: `proof/set/${name}`, aliases })),
            accessBindings: plan.observationMetadata({ fact_key: graph.fact_key, phase: 'proof' }, parentContext),
            measurements: [{ measurement: 'proof_engine_artifact_root', observed: proofArtifact.observed_root }] });
        assert.equal(isolatedCoverage.matched, true, `${graph.fact_key}: ${JSON.stringify(Object.fromEntries(Object.entries(isolatedCoverage.components)
            .filter(([, component]) => !component.matched).map(([name, component]) => [name, { errors: component.errors?.slice(0, 2), mismatches: component.mismatches?.slice(0, 2) }])))}; unclassified=${JSON.stringify(isolatedCoverage.event_coverage.filter(event => event.status !== 'covered').slice(0, 2))}`);
        assert.equal(isolatedCoverage.graph_accepted, false);
        const isolatedConfig = { ...proofTransport.config, artifactReceipt: proofArtifact, childCapsuleReceipt: proofChild,
            executionId: 'compiler-parent-transport', invocationId: graph.fact_key, timeoutMs: 4000 };
        await assert.rejects(runAdmittedProof({ ...isolatedConfig, proofParentMaterials: [] }), /host_config_invalid/);
        const wrongFingerprint = structuredClone(proofTransport.config.proofParentMaterials);
        wrongFingerprint[0].expected_fingerprint = `sha256:${'0'.repeat(64)}`;
        await assert.rejects(runAdmittedProof({ ...isolatedConfig, proofParentMaterials: wrongFingerprint }), /host_child_operands/);
        const wrongEvidence = structuredClone(proofTransport.config.bindings);
        wrongEvidence.find(binding => binding.identity?.kind === 'derived_claim').value.result.value++;
        await assert.rejects(runAdmittedProof({ ...isolatedConfig, bindings: wrongEvidence }), /host_child_operands/);
        scope.seal();
    }
    assert.equal(checked, 6); ledger.finish();
});

test('N02G:ACCOUNT-INSTALLMENT-001 exactly eleven frozen derivations preserve all other corpus content', () => {
    const { reviewedCorpus } = require('../../../docs/audit-evidence/n02g-causal-authoring-profile/prepare-account-installment-application.cjs');
    const { original, expected } = reviewedCorpus();
    const actual = JSON.parse(readPreParentAuthorship(graphPath));
    assert.deepEqual(actual, expected);
    undoReviewedAccountInstallment(actual); assert.deepEqual(actual, original);
});

test('N02G:ACCOUNT-INSTALLMENT-002 functional selection plus real authored predicates covers eleven frozen profiles', async () => {
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
    const { evaluateInstallments } = require('../../../src/next/provenance/metricInstallments');
    const { reviewedCorpus } = require('../../../docs/audit-evidence/n02g-causal-authoring-profile/prepare-account-installment-application.cjs');
    const { proposal } = reviewedCorpus();
    const { plan, claims, graphs } = await snapshotAccessFixture();
    // Freeze the authored expectation before opening handles or executing any formula.
    const cases = freezeDeep(proposal.records.map(record => {
        const claim = claims.find(row => row.fact_key === record.fact_key);
        const graph = graphs.find(row => row.fact_key === record.fact_key);
        assert.deepEqual(preParentDerivation(graph), record.proposed_derivation);
        const { evidence_set_mode, ...expected } = graph.trace_contract.derivation;
        return { claim, graph, expected: structuredClone(expected), historical: record.current_derivation };
    }));
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    for (const { claim, graph, expected, historical } of cases) {
        const executionId = 'account-installment-frozen';
        const input = selectionInput(claim, graph, executionId);
        const recorder = createCausalRecorder({ executionId, maxEvents: 20000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
        const invocation = plan.openMetricInvocation({ fact_key: claim.fact_key }, phase.observe);
        try {
            const evaluate = ['account_balance', 'movement_ids'].includes(claim.metric) ? evaluateDirectMetric : evaluateInstallments;
            const result = evaluate(invocation.operands, claim.metric);
            assert.equal(invocation.observeSelectionPredicates().graph_accepted, false);
            invocation.assertHealthy(); phase.seal(); const trace = recorder.finish();
            const args = { ...input, expected, trace,
                accessBindings: plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' }),
                operandSets: Object.entries(claim.operand_bindings).filter(([, binding]) => binding.kind === 'node_set')
                    .map(([role, binding]) => ({ role, aliases: binding.aliases })) };
            const coverage = comparePhaseCoverage(args);
            assert.equal(coverage.matched, true, `${claim.fact_key}: ${JSON.stringify(coverage.components)}`);
            assert.equal(coverage.graph_accepted, false);
            const { evidence_set_mode, ...oldExpected } = historical;
            assert.equal(comparePhaseCoverage({ ...args, expected: oldExpected }).matched, false, claim.fact_key);
            // Actual observations cannot rewrite expected. Remove one causal ID read.
            const idRead = trace.derivation_trace.find(row => row.operation === 'get' && row.path[0] === 'id');
            assert.ok(idRead);
            const trimmed = { ...trace, derivation_trace: trace.derivation_trace.filter(row =>
                !(row.operation === 'get' && row.alias === idRead.alias && row.path[0] === 'id'))
                .map((row, sequence) => ({ ...row, sequence })) };
            const negative = comparePhaseCoverage({ ...args, trace: trimmed });
            assert.equal(negative.matched, false, claim.fact_key);
            assert.ok(negative.components.read_edges.mismatches.some(row => row.missing.length), claim.fact_key);
            // Exclusion observations must also survive removal independently of R.
            const excluded = new Set(graph.selections.flatMap(selection => selection.excluded.map(row => row.node)));
            const exclusion = trace.derivation_trace.find(row => excluded.has(row.alias)
                && (row.operation === 'has' || row.operation === 'get' && row.path[0] === 'state'));
            assert.ok(exclusion, claim.fact_key);
            const exclusionTrimmed = { ...trace, derivation_trace: trace.derivation_trace.filter(row =>
                !(row.alias === exclusion.alias && row.operation === exclusion.operation
                    && JSON.stringify(row.path) === JSON.stringify(exclusion.path)))
                .map((row, sequence) => ({ ...row, sequence })) };
            const missingExclusion = comparePhaseCoverage({ ...args, trace: exclusionTrimmed });
            assert.equal(missingExclusion.matched, false, claim.fact_key);
            assert.ok(missingExclusion.components.read_edges.mismatches.some(row => row.missing.length), claim.fact_key);
            const split = claim.fact_key.lastIndexOf('#');
            const functional = oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1];
            assert.deepEqual(result, functional.value, claim.fact_key);
        } finally { invocation.revoke(); }
    }
});

test('N02G:ACCOUNT-INSTALLMENT-003 selection observation requires real computation and cannot be replayed after failure', async () => {
    const { plan } = await snapshotAccessFixture();
    const invocation = plan.openMetricInvocation({ fact_key: 'S-11#1#2' }, () => {});
    try {
        assert.throws(() => invocation.observeSelectionPredicates(), /metric_selection_pending/);
        assert.throws(() => invocation.assertHealthy(), /metric_closed/);
    } finally { invocation.revoke(); }
    assert.throws(() => plan.openMetricInvocation({ fact_key: 'S-11#1#2', expected: {} }, () => {}), /metric_selector/);
});

test('N02G:ACCOUNT-INSTALLMENT-004 computed views cannot be replayed or survive controller revocation', async () => {
    const { evaluateInstallments } = require('../../../src/next/provenance/metricInstallments');
    const { plan } = await snapshotAccessFixture();
    const invocation = plan.openMetricInvocation({ fact_key: 'S-11#1#2' }, () => {});
    try {
        evaluateInstallments(invocation.operands, 'installments_projected');
        assert.equal(invocation.observeSelectionPredicates().stage, 'observed_derivation_selection_only');
        assert.throws(() => invocation.operands.events.select(() => true), /metric_selection_replay/);
        assert.throws(() => invocation.assertHealthy(), /metric_closed/);
    } finally { invocation.revoke(); }
    assert.throws(() => invocation.operands.events.length(), /access_/);
});

test('N02G:ACCOUNT-INSTALLMENT-006 predicate observation cannot authorize fabricated selected views', async () => {
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const { plan, graphs, claims } = await snapshotAccessFixture();
    const graph = graphs.find(row => row.fact_key === 'S-11#1#2');
    const claim = claims.find(row => row.fact_key === graph.fact_key);
    const executionId = 'fabricated-view';
    const input = freezeDeep(selectionInput(claim, graph, executionId));
    for (const choose of [() => true, () => false]) {
        const recorder = createCausalRecorder({ executionId, maxEvents: 20000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
        const invocation = plan.openMetricInvocation({ fact_key: claim.fact_key }, phase.observe);
        try {
            invocation.operands.events.select(choose);
            // These predicates name admitted nodes: their truth does not prove
            // the caller computed the correct view. The coverage boundary does.
            assert.equal(invocation.observeSelectionPredicates().graph_accepted, false);
            phase.seal();
            const coverage = compareSelectionCoverage({ ...input, trace: recorder.finish() });
            assert.equal(coverage.matched, false);
            assert.equal(coverage.graph_accepted, false);
        } finally { invocation.revoke(); }
    }
});

test('N02G:ACCOUNT-INSTALLMENT-005 nominal selection primitive validates identity types and rejects shape substitution', () => {
    const { evaluateObservedSelectionOperator } = require('../../../src/next/provenance/proofOperators');
    const operator = { id: 'edge_target_in_set', args: ['edge_ref:K', 'set:node:K'], semantics: 'resolved_target_member' };
    const operands = [
        { type: { form: 'edge', target: 'person' }, expression: { kind: 'edge_ref', id: 'member-edge' } },
        { type: { form: 'set', item: { form: 'node', kind: 'person' } }, expression: { kind: 'set_ref', name: 'members' } }
    ];
    let calls = 0;
    const scope = { edgeTargetInSet(edge, set) { assert.equal(edge, 'member-edge'); assert.equal(set, 'members'); calls++; return true; } };
    assert.equal(evaluateObservedSelectionOperator(operator, operands, scope), true);
    for (const mutate of [args => { args[1].type.item.kind = 'account'; },
        args => { args[0].expression.alias = 'caller-alias'; }, args => { args[1].expression.kind = 'literal'; }]) {
        const bad = structuredClone(operands); mutate(bad);
        assert.throws(() => evaluateObservedSelectionOperator(operator, bad, scope), /operator_|proof_expression_/);
    }
    const hostile = {};
    Object.defineProperty(hostile, 'id', { enumerable: true, get() { calls++; return operator.id; } });
    assert.throws(() => evaluateObservedSelectionOperator(hostile, operands, scope));
    assert.equal(calls, 1);
});
function reviewedDirectEventProposal() {
    const text = fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/direct-event-proposal-v2.json'), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(hash(text), 'sha256:6d315f09056d13e0f0f68873c158c9e48567b7c28dac6a90036e31085083d490');
    return JSON.parse(text);
}
function assertHistoricalSource(document) {
    // Historical proposals stay immutable. This independently pinned successor
    // is the DIRECT-EVENT code delta, whose behavior is tested separately.
    let expected = document.lf_sha256;
    if (document.path === 'src/next/provenance/metricDirectReads.js') {
        assert.equal(expected, 'sha256:2526b6eb373fc5265bf61798c85bf976011d3d77430858df75776306067ae3e8');
        expected = 'sha256:5c894c224bb7432819fa1feb335902c8f4cf9a531c155b50beb0ae9b53ddefad';
    }
    assert.equal(hash(readHistoricalAuthority(document.path)), expected);
}
function readHistoricalAuthority(file) {
    // One verified chain for every pinned historical authority, including
    // source_state's runtime successor. No per-test current-source repairs.
    return readPreParentAuthorship(file);
}
function undoReviewedDirectEvent(corpus) {
    undoReviewedSimilarEvent(corpus);
    const proposal = reviewedDirectEventProposal(); assert.equal(proposal.records.length, 5);
    for (const r of proposal.records) {
        const matches = corpus.graphs.filter(g => g.fact_key === r.fact_key); assert.equal(matches.length, 1);
        assert.deepEqual(matches[0].trace_contract.derivation, r.proposed_derivation);
        matches[0].trace_contract.derivation = structuredClone(r.current_derivation);
    }
}
function undoReviewedTransferScope(corpus) {
    undoReviewedDirectEvent(corpus);
    const counts = { required_reads: 0, required_structural: 0 };
    for (const r of reviewedTransferScopeProposal().records) {
        const d = corpus.graphs.find(g => g.fact_key === r.fact_key).trace_contract.derivation;
        for (const [field, delta] of [['required_reads', 'added_reads'], ['required_structural', 'added_structural']]) {
            for (const item of r.proposed_delta[delta]) {
                const indexes = d[field].flatMap((v, i) => JSON.stringify(v) === JSON.stringify(item) ? [i] : []);
                assert.equal(indexes.length, 1); d[field].splice(indexes[0], 1); counts[field]++;
            }
        }
    }
    assert.deepEqual(counts, { required_reads: 6, required_structural: 6 });
}
test('N02G:TRANSFER-SCOPE-001 optional scope delta preserves the complete remaining corpus', () => {
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const corpus = JSON.parse(readPreParentAuthorship(graphPath));
    const claims = JSON.parse(fs.readFileSync(path.join(root, prefix + 'claims-v2.json'), 'utf8')).claims;
    const snapshots = JSON.parse(fs.readFileSync(path.join(root, corpus.snapshot_manifest.path), 'utf8')).snapshots;
    const proposal = reviewedTransferScopeProposal(); let checked = 0;
    // A later runtime-only candidate must not rewrite the historical proposal.
    // Explicit predecessor/successor pins retain content identity on both sides;
    // the PAYMENT-REFERENCE properties prove behavior, not this hash alone.
    const sourceSuccessors = {
        'src/next/provenance/metricEffects.js': {
            predecessor: 'sha256:7f0a08bbfbdecb4cbdea00c5f1c3c65e65d96ec4bf50e0096f01fe77a424e2ed',
            successor: 'sha256:7cb9fe24b2d8aefd3560d8089544bfe5431f124256c35023ff6b8e126283f5fb'
        }
    };
    for (const doc of proposal.documents.filter(d => d.path !== graphPath)) {
        const transition = sourceSuccessors[doc.path];
        if (transition) assert.equal(doc.lf_sha256, transition.predecessor);
        assert.equal(hash(readHistoricalAuthority(doc.path)), transition?.successor || doc.lf_sha256);
    }
    for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === 'consumption_effect' && c.evaluator_ref.evaluator_version === 1 && c.subject.kind === 'transfer_pair')) {
        const graph = corpus.graphs.find(g => g.fact_key === claim.fact_key);
        const expected = transferScopeRequirements(claim, graph.nodes, snapshots);
        for (const [field, values] of [['required_reads', expected.reads], ['required_structural', expected.structural]]) {
            for (const item of values) assert.ok(graph.trace_contract.derivation[field].some(r => canonicalValue(r) === canonicalValue(item)), `${claim.fact_key}/${field}`);
        }
        const source = proposal.records.find(r => r.fact_key === claim.fact_key);
        assert.equal(hash(canonicalValue(graph.trace_contract.proof)), source.proof_preserved_sha256); checked++;
    }
    assert.equal(checked, 3); assert.equal(corpus.graphs.length, 76);
    undoReviewedTransferScope(corpus); assert.equal(hash(canonicalValue(corpus)), proposal.source_corpus_sha256);
});
test('N02G:TRANSFER-SCOPE-002 has-then-get composes across presence, identity, order and exclusion models', () => {
    // Synthetic authoring models, not admitted graph mutations.
    let models = 0;
    for (let seed = 0; seed < 6; seed++) for (const size of [0, 1, 4]) for (const mode of ['absent', 'same', 'different', 'mixed']) {
        const version = hash(`scope-version-${seed}`); const nodes = {}; const snapshots = []; const aliases = []; const present = [];
        for (let i = 0; i < size; i++) {
            const alias = `alias-${seed}-${i}`; const ref_id = `event-id-${seed}-${i}`;
            const exists = mode !== 'absent' && (mode !== 'mixed' || i % 2 === 0);
            const payload = { id: ref_id, state: i % 2 ? 'projected' : 'confirmed', date: i % 2 ? '2041-01-01' : '2042-06-12', amount_minor: 13 + i };
            if (exists) { payload.transfer_pair = mode === 'same' ? `pair-${seed}` : `other-${seed}-${i}`; present.push(alias); }
            const n = { binding: 'snapshot', kind: 'event', ref_id, version, semantic_fingerprint: hash(JSON.stringify(payload)) };
            nodes[alias] = n; snapshots.push({ ...n, payload }); aliases.push(alias);
        }
        const claim = { evaluator_ref: { evaluator_id: 'consumption_effect', evaluator_version: 1 }, subject: { kind: 'transfer_pair', ref_id: `pair-${seed}` },
            operand_bindings: { events: { kind: 'node_set', aliases } } };
        const expected = { reads: present.map(node => ({ node, segments: ['transfer_pair'] })),
            structural: aliases.map(node => ({ node, operation: 'has', segments: ['transfer_pair'] })) };
        const run = (c = claim, n = nodes, s = snapshots) => transferScopeRequirements(c, n, s);
        assert.deepEqual(run(), expected); assert.deepEqual(run(claim, nodes, snapshots.toReversed()), expected);
        assert.deepEqual(run({ ...claim, fact_key: 'irrelevant', subject: { kind: 'transfer_pair', ref_id: 'unrelated' }, selected_nodes: [] }), expected);
        const reversed = structuredClone(claim); reversed.operand_bindings.events.aliases.reverse();
        assert.deepEqual(run(reversed), { reads: expected.reads.toReversed(), structural: expected.structural.toReversed() });
        for (const evaluator_ref of [{ evaluator_id: 'consumption_effect', evaluator_version: 2 }, { evaluator_id: 'net_consumption', evaluator_version: 1 }]) assert.throws(() => run({ ...claim, evaluator_ref }));
        assert.throws(() => run({ ...claim, subject: { kind: 'event', ref_id: 'x' } }));
        assert.throws(() => run({ ...claim, operand_bindings: { events: { kind: 'node', aliases } } }));
        if (size) {
            const first = snapshots[0]; const otherVersion = { ...first, version: hash('other-version') };
            assert.deepEqual(run(claim, nodes, [otherVersion, ...snapshots]), expected);
            assert.throws(() => run(claim, nodes, snapshots.slice(1)));
            assert.throws(() => run(claim, nodes, [...snapshots, first]));
            assert.throws(() => run(claim, nodes, [otherVersion, ...snapshots.slice(1)]));
            for (const patch of [{ kind: 'bill' }, { payload: { id: 'wrong' } }, { semantic_fingerprint: hash('wrong') }]) assert.throws(() => run(claim, nodes, [{ ...first, ...patch }, ...snapshots.slice(1)]));
            assert.throws(() => run({ ...claim, operand_bindings: { events: { kind: 'node_set', aliases: [...aliases, aliases[0]] } } }));
            for (const transfer_pair of [undefined, null, '', 7]) assert.throws(() => run(claim, nodes, [{ ...first, payload: { ...first.payload, transfer_pair } }, ...snapshots.slice(1)]));
        }
        models++;
    }
    assert.equal(models, 72);
});
test('N02G:TRANSFER-SCOPE-003 admitted scopes reject historical expected and missing presence or value traces', async () => {
    const { evaluateEffects } = require('../../../src/next/provenance/metricEffects');
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0; let rejected = 0;
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === 'consumption_effect' && c.evaluator_ref.evaluator_version === 1 && c.subject.kind === 'transfer_pair')) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key); const scope = selectionInput(claim, graph, `transfer-scope-${checked}`);
        const fields = ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural', 'required_selections', 'selected_nodes'];
        const expected = freezeDeep(structuredClone(Object.fromEntries(fields.map(k => [k, graph.trace_contract.derivation[k]]))));
        const expectedBefore = JSON.stringify(expected); const original = reviewedTransferScopeProposal().records.find(r => r.fact_key === claim.fact_key);
        const historicalExpected = freezeDeep(structuredClone(Object.fromEntries(fields.map(k => [k, original.current_derivation[k]]))));
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const operandSets = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set').map(([role, b]) => ({ role, aliases: b.aliases }));
        const recorder = createCausalRecorder({ executionId: scope.executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' }); const controls = []; const operands = {}; let value;
        try {
            for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
                const selector = { fact_key: claim.fact_key, role_id };
                const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe) : plan.openSet(selector, phase.observe);
                controls.push(access); operands[role_id] = access.handle;
            }
            value = evaluateEffects(Object.freeze(operands), claim.evaluator_ref.evaluator_id);
            for (const access of controls) access.assertHealthy();
        } finally { for (const access of controls) access.revoke(); }
        phase.seal(); const trace = recorder.finish(); const input = { ...scope, expected, trace, operandSets, accessBindings };
        const coverage = comparePhaseCoverage(input); assert.equal(coverage.components.selection.matched, true);
        assert.equal(coverage.matched, true, claim.fact_key); assert.equal(coverage.graph_accepted, false);
        const split = claim.fact_key.lastIndexOf('#');
        assert.deepEqual(value, oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1].value);
        assert.equal(comparePhaseCoverage({ ...input, expected: historicalExpected }).matched, false);
        for (const alias of claim.operand_bindings.events.aliases) for (const operation of ['get', 'has']) {
            const kept = trace.derivation_trace.filter(e => !(e.operation === operation && e.alias === alias && e.path.join('.') === 'transfer_pair'));
            assert.ok(kept.length < trace.derivation_trace.length);
            assert.equal(comparePhaseCoverage({ ...input, trace: { ...trace, derivation_trace: kept.map((e, sequence) => ({ ...e, sequence })) } }).matched, false); rejected++;
        }
        assert.equal(JSON.stringify(expected), expectedBefore); checked++;
    }
    assert.equal(checked, 3); assert.equal(rejected, 12);
});

function ownedCardOwnerRequirements(evaluator, roles, nodes, edges, snapshots) {
    assert.equal(evaluator.evaluator_id, 'owned_cards'); assert.equal(evaluator.evaluator_version, 1);
    assert.equal(roles.cards.kind, 'node_set'); const aliases = roles.cards.aliases;
    assert.equal(new Set(aliases).size, aliases.length);
    function resolve(alias, kind) {
        const node = nodes[alias]; assert.equal(node.binding, 'snapshot'); assert.equal(node.kind, kind);
        const found = snapshots.filter(s => s.kind === kind && s.ref_id === node.ref_id && s.version === node.version);
        assert.equal(found.length, 1); assert.equal(found[0].payload.id, node.ref_id);
        assert.equal(found[0].semantic_fingerprint, node.semantic_fingerprint); return found[0];
    }
    const owners = [];
    for (const alias of aliases) {
        const card = resolve(alias, 'card');
        const refs = edges.filter(e => e.source === alias && e.field === 'owner_id' && e.relation === 'material_ref');
        assert.equal(refs.length, 1); const owner = resolve(refs[0].target, 'person');
        assert.equal(card.payload.owner_id, owner.payload.id);
        if (!owners.includes(refs[0].target)) owners.push(refs[0].target);
    }
    return { nodes: owners, reads: owners.map(node => ({ node, segments: ['id'] })) };
}
function reviewedOwnedCardsProposal() {
    const text = fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/owned-cards-proposal.json'), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(hash(text), 'sha256:4041c60f5dce971cc5d60989644f88d54c3aabaab0daa3f9b307b53aeca8d08a');
    return JSON.parse(text);
}
function undoReviewedOwnedCards(corpus) {
    undoReviewedTransferScope(corpus);
    let removedNodes = 0; let removedReads = 0;
    for (const r of reviewedOwnedCardsProposal().records) {
        const d = corpus.graphs.find(g => g.fact_key === r.fact_key).trace_contract.derivation;
        for (const node of r.proposed_delta.added_nodes) {
            assert.equal(d.required_nodes.filter(n => n === node).length, 1);
            d.required_nodes.splice(d.required_nodes.indexOf(node), 1); removedNodes++;
        }
        for (const read of r.proposed_delta.added_reads) {
            const indexes = d.required_reads.flatMap((v, i) => JSON.stringify(v) === JSON.stringify(read) ? [i] : []);
            assert.equal(indexes.length, 1); d.required_reads.splice(indexes[0], 1); removedReads++;
        }
    }
    assert.equal(removedNodes, 1); assert.equal(removedReads, 1);
}

test('N02G:OWNED-CARDS-001 owner identity delta preserves every other corpus field', () => {
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const corpus = JSON.parse(readPreParentAuthorship(graphPath));
    const claims = JSON.parse(fs.readFileSync(path.join(root, prefix + 'claims-v2.json'), 'utf8')).claims;
    const snapshots = JSON.parse(fs.readFileSync(path.join(root, corpus.snapshot_manifest.path), 'utf8')).snapshots;
    const proposal = reviewedOwnedCardsProposal(); let checked = 0;
    for (const doc of proposal.documents.filter(d => d.path !== graphPath)) {
        assertHistoricalSource(doc);
    }
    for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === 'owned_cards' && c.evaluator_ref.evaluator_version === 1)) {
        const graph = corpus.graphs.find(g => g.fact_key === claim.fact_key);
        const requirements = ownedCardOwnerRequirements(claim.evaluator_ref, claim.operand_bindings, graph.nodes, graph.edges, snapshots);
        for (const node of requirements.nodes) assert.ok(graph.trace_contract.derivation.required_nodes.includes(node));
        for (const read of requirements.reads) assert.ok(graph.trace_contract.derivation.required_reads.some(r => canonicalValue(r) === canonicalValue(read)));
        const source = proposal.records.find(r => r.fact_key === claim.fact_key);
        assert.equal(hash(canonicalValue(graph.trace_contract.proof)), source.proof_preserved_sha256);
        checked++;
    }
    assert.equal(checked, 1); assert.equal(corpus.graphs.length, 76);
    undoReviewedOwnedCards(corpus); assert.equal(hash(canonicalValue(corpus)), proposal.source_corpus_sha256);
});

test('N02G:OWNED-CARDS-002 authoring resolves versioned relations independently of aliases and population', () => {
    // Synthetic authoring models only; not admitted graph mutations.
    const evaluator = { evaluator_id: 'owned_cards', evaluator_version: 1 };
    for (let seed = 0; seed < 6; seed++) for (const size of [0, 1, 3]) for (const shared of [false, true]) {
        const nodes = {}; const snapshots = []; const edges = []; const aliases = [];
        const ownerAliases = []; const version = hash(`version-${seed}`);
        function add(alias, kind, ref_id, payload) {
            const binding = { binding: 'snapshot', kind, ref_id, version, semantic_fingerprint: hash(JSON.stringify(payload)) };
            nodes[alias] = binding; snapshots.push({ ...binding, payload });
        }
        for (let i = 0; i < size; i++) {
            const alias = `card-alias-${seed}-${i}`; const owner = `owner-alias-${seed}-${shared ? 0 : i}`;
            const ownerId = `person-id-${seed}-${shared ? 0 : i}`;
            if (!nodes[owner]) { add(owner, 'person', ownerId, { id: ownerId }); ownerAliases.push(owner); }
            add(alias, 'card', `card-id-${seed}-${i}`, { id: `card-id-${seed}-${i}`, owner_id: ownerId }); aliases.push(alias);
            edges.push({ id: `edge-${i}`, source: alias, field: 'owner_id', target: owner, relation: 'material_ref' });
        }
        const roles = { cards: { kind: 'node_set', aliases } };
        const expected = { nodes: ownerAliases, reads: ownerAliases.map(node => ({ node, segments: ['id'] })) };
        const run = (e = evaluator, r = roles, n = nodes, x = edges, s = snapshots) => ownedCardOwnerRequirements(e, r, n, x, s);
        assert.deepEqual(run(), expected);
        assert.deepEqual(run(evaluator, roles, nodes, edges.toReversed(), snapshots.toReversed()), expected);
        const reversed = ownerAliases.toReversed();
        assert.deepEqual(run(evaluator, { cards: { kind: 'node_set', aliases: aliases.toReversed() } }),
            { nodes: reversed, reads: reversed.map(node => ({ node, segments: ['id'] })) });
        assert.throws(() => run({ ...evaluator, evaluator_version: 2 }));
        assert.throws(() => run({ ...evaluator, evaluator_id: 'merchant_rule_ids' }));
        assert.throws(() => run(evaluator, { cards: { kind: 'node', aliases } }));
        if (size) {
            const owner = ownerAliases[0]; const actual = snapshots.find(s => s.ref_id === nodes[owner].ref_id);
            assert.throws(() => run(evaluator, roles, nodes, edges, snapshots.filter(s => s !== actual)));
            assert.throws(() => run(evaluator, roles, nodes, edges, [...snapshots, structuredClone(actual)]));
            // Another version is not ambiguous and must not replace the exact one.
            const other = { ...structuredClone(actual), version: hash('other-version') };
            assert.deepEqual(run(evaluator, roles, nodes, edges, [other, ...snapshots]), expected);
            assert.throws(() => run(evaluator, roles, nodes, edges, snapshots.map(s => s === actual ? other : s)));
            for (const patch of [{ kind: 'account' }, { payload: { id: 'wrong-id' } }, { semantic_fingerprint: hash('wrong') }]) {
                assert.throws(() => run(evaluator, roles, nodes, edges, snapshots.map(s => s === actual ? { ...s, ...patch } : s)));
            }
            assert.throws(() => run(evaluator, roles, nodes, edges.slice(1)));
            assert.throws(() => run(evaluator, roles, nodes, [...edges, edges[0]]));
            assert.throws(() => run(evaluator, { cards: { kind: 'node_set', aliases: [...aliases, aliases[0]] } }));
            const source = snapshots.find(s => s.ref_id === nodes[aliases[0]].ref_id);
            assert.throws(() => run(evaluator, roles, nodes, edges, snapshots.map(s => s === source ?
                { ...s, payload: { ...s.payload, owner_id: 'different-owner' } } : s)));
        }
    }
});

test('N02G:OWNED-CARDS-003 admitted exclusion requires the foreign owner ID, with expected frozen first', async () => {
    const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === 'owned_cards' && c.evaluator_ref.evaluator_version === 1)) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key); const scope = selectionInput(claim, graph, `owned-cards-${checked}`);
        const fields = ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural', 'required_selections', 'selected_nodes'];
        const expected = freezeDeep(structuredClone(Object.fromEntries(fields.map(k => [k, graph.trace_contract.derivation[k]]))));
        const expectedBefore = JSON.stringify(expected); const original = reviewedOwnedCardsProposal().records.find(r => r.fact_key === claim.fact_key);
        const historicalExpected = freezeDeep(structuredClone(Object.fromEntries(fields.map(k => [k, original.current_derivation[k]]))));
        const missingAlias = original.proposed_delta.added_nodes[0];
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const operandSets = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set').map(([role, b]) => ({ role, aliases: b.aliases }));
        const recorder = createCausalRecorder({ executionId: scope.executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' }); const controls = []; const operands = {};
        let value;
        try {
            for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
                const selector = { fact_key: claim.fact_key, role_id };
                const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
                    : binding.kind === 'node_set' ? plan.openSet(selector, phase.observe) : plan.open({ ...selector, alias: binding.alias }, phase.observe);
                controls.push(access); operands[role_id] = access.handle;
            }
            value = evaluateDirectMetric(Object.freeze(operands), claim.evaluator_ref.evaluator_id);
            for (const access of controls) access.assertHealthy();
        } finally { for (const access of controls) access.revoke(); }
        phase.seal(); const trace = recorder.finish(); const input = { ...scope, expected, trace, operandSets, accessBindings };
        const coverage = comparePhaseCoverage(input);
        assert.equal(coverage.components.selection.matched, true); assert.equal(coverage.matched, true, claim.fact_key);
        assert.equal(coverage.graph_accepted, false);
        const split = claim.fact_key.lastIndexOf('#');
        assert.deepEqual(value, oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1].value);
        assert.equal(comparePhaseCoverage({ ...input, expected: historicalExpected }).matched, false);
        const kept = trace.derivation_trace.filter(e => !(e.operation === 'get' && e.alias === missingAlias && e.path.join('.') === 'id'));
        assert.ok(kept.length < trace.derivation_trace.length);
        assert.equal(comparePhaseCoverage({ ...input, trace: { ...trace, derivation_trace: kept.map((e, sequence) => ({ ...e, sequence })) } }).matched, false);
        assert.equal(trace.derivation_trace.some(e => e.operation === 'get' && e.alias === missingAlias && e.path.join('.') === 'family_id'), false);
        assert.equal(expected.selected_nodes.includes(missingAlias), false);
        assert.equal(JSON.stringify(expected), expectedBefore); checked++;
    }
    assert.equal(checked, 1);
});

function dueBillNonDerivationalAmounts(evaluator, roles, nodes, snapshots) {
    assert.equal(evaluator.evaluator_id, 'due_bill_ids'); assert.equal(evaluator.evaluator_version, 1);
    assert.equal(roles.bills.kind, 'node_set'); assert.equal(new Set(roles.bills.aliases).size, roles.bills.aliases.length);
    return roles.bills.aliases.map(alias => {
        const node = nodes[alias]; assert.equal(node.kind, 'bill');
        const found = snapshots.filter(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
        assert.equal(found.length, 1); assert.equal(found[0].payload.id, node.ref_id);
        assert.equal(found[0].semantic_fingerprint, node.semantic_fingerprint);
        return { node: alias, segments: ['amount_minor'] };
    });
}
function reviewedDueBillIdsProposal() {
    const text = fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/due-bill-ids-proposal.json'), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(hash(text), 'sha256:37ef33b8e5fa3aa7ee466cc52c74180e4f8b4bc5f6cdd8b46daac364ae88a544');
    return JSON.parse(text);
}
function restoreReviewedDueBillAmount(corpus) {
    undoReviewedOwnedCards(corpus);
    let restored = 0;
    for (const r of reviewedDueBillIdsProposal().records) {
        const reads = corpus.graphs.find(g => g.fact_key === r.fact_key).trace_contract.derivation.required_reads;
        for (const item of r.proposed_delta.removed) {
            assert.equal(reads.filter(v => JSON.stringify(v) === JSON.stringify(item)).length, 0);
            const index = r.current_derivation.required_reads.findIndex(v => JSON.stringify(v) === JSON.stringify(item));
            assert.ok(index >= 0); reads.splice(index, 0, structuredClone(item)); restored++;
        }
    }
    assert.equal(restored, 1);
}

test('N02G:DUE-BILL-IDS-001 only one noncausal derivation read is removed; proof and total preserved', () => {
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const corpus = JSON.parse(readPreParentAuthorship(graphPath));
    const claims = JSON.parse(fs.readFileSync(path.join(root, prefix + 'claims-v2.json'), 'utf8')).claims;
    const snapshots = JSON.parse(fs.readFileSync(path.join(root, corpus.snapshot_manifest.path), 'utf8')).snapshots;
    const proposal = reviewedDueBillIdsProposal(); let checked = 0;
    for (const d of proposal.documents.filter(d => d.path !== graphPath)) {
        assertHistoricalSource(d);
    }
    for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === 'due_bill_ids' && c.evaluator_ref.evaluator_version === 1)) {
        const graph = corpus.graphs.find(g => g.fact_key === claim.fact_key);
        for (const item of dueBillNonDerivationalAmounts(claim.evaluator_ref, claim.operand_bindings, graph.nodes, snapshots)) {
            assert.equal(graph.trace_contract.derivation.required_reads.some(v => canonicalValue(v) === canonicalValue(item)), false);
            assert.equal(graph.trace_contract.proof.required_reads.some(v => canonicalValue(v) === canonicalValue(item)), true);
        }
        checked++;
    }
    assert.equal(checked, 1); assert.equal(corpus.graphs.length, 76);
    for (const control of proposal.controls) assert.equal(hash(canonicalValue(corpus.graphs.find(g => g.fact_key === control.fact_key))), control.source_graph_sha256);
    restoreReviewedDueBillAmount(corpus);
    assert.equal(hash(canonicalValue(corpus)), proposal.source_corpus_sha256);
});

test('N02G:DUE-BILL-IDS-002 authoring is independent of names, amounts and roster size', () => {
    // Synthetic authoring models, not admitted execution graphs.
    for (let seed = 0; seed < 12; seed++) for (const size of [0, 1, 3]) for (const amount_minor of [0, 999]) {
        const evaluator = { evaluator_id: 'due_bill_ids', evaluator_version: 1 };
        const nodes = {}; const snapshots = []; const aliases = [];
        for (let i = 0; i < size; i++) {
            const alias = `alias-${seed}-${i}`; aliases.push(alias);
            const payload = { id: `ref-${seed}-${i}`, amount_minor };
            const identity = { kind: 'bill', ref_id: payload.id, version: hash(JSON.stringify(payload)), semantic_fingerprint: hash(`semantic-${seed}-${i}-${amount_minor}`) };
            nodes[alias] = identity; snapshots.push({ ...identity, payload }, { ...identity, version: hash('other-version'), payload });
        }
        const roles = { bills: { kind: 'node_set', aliases } };
        const expected = aliases.map(node => ({ node, segments: ['amount_minor'] }));
        assert.deepEqual(dueBillNonDerivationalAmounts(evaluator, roles, nodes, snapshots), expected);
        assert.deepEqual(dueBillNonDerivationalAmounts(evaluator, roles, nodes, snapshots.reverse()), expected);
        assert.throws(() => dueBillNonDerivationalAmounts({ ...evaluator, evaluator_version: 2 }, roles, nodes, snapshots));
        assert.throws(() => dueBillNonDerivationalAmounts({ ...evaluator, evaluator_id: 'due_bills_total' }, roles, nodes, snapshots));
        if (size) {
            const node = nodes[aliases[0]]; const actual = snapshots.find(s => s.ref_id === node.ref_id && s.version === node.version);
            assert.throws(() => dueBillNonDerivationalAmounts(evaluator, roles, nodes, snapshots.filter(s => s !== actual)));
            assert.throws(() => dueBillNonDerivationalAmounts(evaluator, roles, nodes, [...snapshots, structuredClone(actual)]));
        }
        roles.bills.aliases.reverse();
        assert.deepEqual(dueBillNonDerivationalAmounts(evaluator, roles, nodes, snapshots), expected.toReversed());
    }
});

const collectionCountMetrics = ['reminder_count', 'calendar_event_count', 'side_effect_count'];
function collectionKindRequirement(evaluator, roles, nodes, snapshots) {
    assert.ok(collectionCountMetrics.includes(evaluator.evaluator_id));
    assert.equal(evaluator.evaluator_version, 1);
    assert.equal(roles.collection.kind, 'node'); const alias = roles.collection.alias; const node = nodes[alias];
    assert.equal(node.kind, 'collection');
    const matches = snapshots.filter(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
    assert.equal(matches.length, 1); assert.equal(matches[0].payload.id, node.ref_id);
    assert.equal(matches[0].semantic_fingerprint, node.semantic_fingerprint);
    return { node: alias, segments: ['collection_name'] };
}

function reviewedCollectionKindProposal() {
    const text = fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/collection-kind-proposal.json'), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(hash(text), 'sha256:455cbdb55deca684b5f19b2be7957d725980b7ad5e23441f8b0a7ceda3db02f4');
    return JSON.parse(text);
}

function undoReviewedCollectionKind(corpus) {
    // Compose the later reviewed IDs-only removal before historical pins.
    restoreReviewedDueBillAmount(corpus);
    let removed = 0;
    for (const record of reviewedCollectionKindProposal().records) {
        const graph = corpus.graphs.find(g => g.fact_key === record.fact_key);
        for (const addition of record.proposed_delta.added) {
            const list = graph.trace_contract.derivation.required_reads;
            const indices = list.flatMap((r, i) => JSON.stringify(r) === JSON.stringify(addition) ? [i] : []);
            assert.equal(indices.length, 1); list.splice(indices[0], 1); removed++;
        }
    }
    assert.equal(removed, 3);
}

test('N02G:COLLECTION-KIND-001 three domain reads preserve all other graph fields', () => {
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const corpus = JSON.parse(readPreParentAuthorship(graphPath));
    const claims = JSON.parse(fs.readFileSync(path.join(root, prefix + 'claims-v2.json'), 'utf8')).claims;
    const snapshots = JSON.parse(fs.readFileSync(path.join(root, corpus.snapshot_manifest.path), 'utf8')).snapshots;
    const proposal = reviewedCollectionKindProposal(); let checked = 0;
    for (const document of proposal.documents.filter(d => d.path !== graphPath)) {
        assertHistoricalSource(document);
    }
    for (const claim of claims.filter(c => collectionCountMetrics.includes(c.evaluator_ref.evaluator_id) && c.evaluator_ref.evaluator_version === 1)) {
        const graph = corpus.graphs.find(g => g.fact_key === claim.fact_key);
        const requirement = collectionKindRequirement(claim.evaluator_ref, claim.operand_bindings, graph.nodes, snapshots);
        assert.equal(graph.trace_contract.derivation.required_reads.filter(r => JSON.stringify(r) === JSON.stringify(requirement)).length, 1);
        checked++;
    }
    assert.equal(checked, 3); assert.equal(corpus.graphs.length, 76);
    undoReviewedCollectionKind(corpus);
    assert.equal(hash(canonicalValue(corpus)), proposal.source_corpus_sha256);
});

test('N02G:COLLECTION-KIND-002 authoring binds metric version and role independently of aliases and population', () => {
    // Synthetic authoring inputs only; these are not admitted mutated graphs.
    for (const evaluator_id of collectionCountMetrics) for (let seed = 0; seed < 12; seed++) for (const size of [0, 2]) {
        const evaluator = { evaluator_id, evaluator_version: 1 };
        const alias = `domain-alias-${seed}`; const ref = `collection-ref-${seed}`;
        const payload = { id: ref, collection_name: `domain-${seed}`, members: Array.from({ length: size }, (_, i) => `entry-${seed}-${i}`) };
        const version = hash(JSON.stringify(payload));
        const identity = { kind: 'collection', ref_id: ref, version, semantic_fingerprint: hash(`semantic-${seed}-${size}`) };
        const roles = { collection: { kind: 'node', alias } }; const nodes = { [alias]: identity };
        const snapshots = [{ ...identity, version: hash('another-version'), payload: { ...payload, members: [] } }, { ...identity, payload }];
        const expected = { node: alias, segments: ['collection_name'] };
        assert.deepEqual(collectionKindRequirement(evaluator, roles, nodes, snapshots), expected);
        assert.deepEqual(collectionKindRequirement(evaluator, roles, nodes, snapshots.reverse()), expected);
        assert.throws(() => collectionKindRequirement(evaluator, roles, nodes, snapshots.filter(s => s.version !== version)));
        assert.throws(() => collectionKindRequirement(evaluator, roles, nodes, [...snapshots, { ...identity, payload }]));
        assert.throws(() => collectionKindRequirement({ ...evaluator, evaluator_version: 2 }, roles, nodes, snapshots));
        assert.throws(() => collectionKindRequirement({ ...evaluator, evaluator_id: 'unreviewed_count' }, roles, nodes, snapshots));
    }
});

test('N02G:COLLECTION-KIND-003 admitted count integrations reject trace without domain read', async () => {
    const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    for (const claim of claims.filter(c => collectionCountMetrics.includes(c.evaluator_ref.evaluator_id) && c.evaluator_ref.evaluator_version === 1)) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const scope = selectionInput(claim, graph, `collection-kind-${checked}`);
        const expected = freezeDeep(structuredClone(Object.fromEntries(['required_nodes', 'required_reads', 'required_claim_reads',
            'required_edges', 'required_structural', 'required_selections', 'selected_nodes'].map(k => [k, graph.trace_contract.derivation[k]]))));
        const expectedBefore = JSON.stringify(expected);
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const operandSets = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set').map(([role, b]) => ({ role, aliases: b.aliases }));
        const recorder = createCausalRecorder({ executionId: scope.executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' }); const controls = []; const operands = {};
        let value;
        try {
            for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
                const selector = { fact_key: claim.fact_key, role_id };
                const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
                    : binding.kind === 'node_set' ? plan.openSet(selector, phase.observe) : plan.open({ ...selector, alias: binding.alias }, phase.observe);
                controls.push(access); operands[role_id] = access.handle;
            }
            value = evaluateDirectMetric(Object.freeze(operands), claim.evaluator_ref.evaluator_id);
            for (const access of controls) access.assertHealthy();
        } finally { for (const access of controls) access.revoke(); }
        phase.seal(); const trace = recorder.finish();
        const input = { ...scope, expected, trace, operandSets, accessBindings }; const coverage = comparePhaseCoverage(input);
        assert.equal(coverage.components.selection.matched, true); assert.equal(coverage.matched, true, claim.fact_key);
        assert.equal(coverage.graph_accepted, false);
        const split = claim.fact_key.lastIndexOf('#');
        assert.equal(value, oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1].value);
        const alias = claim.operand_bindings.collection.alias;
        const kept = trace.derivation_trace.filter(e => !(e.operation === 'get' && e.alias === alias && e.path.join('.') === 'collection_name'));
        assert.equal(trace.derivation_trace.length - kept.length, 1);
        const altered = { ...trace, derivation_trace: kept.map((e, sequence) => ({ ...e, sequence })) };
        assert.equal(comparePhaseCoverage({ ...input, trace: altered }).matched, false);
        assert.equal(JSON.stringify(expected), expectedBefore); checked++;
    }
    assert.equal(checked, 3);
});

test('N02G:DUE-BILL-IDS-003 admitted IDs integration rejects a monetary read obligation', async () => {
    const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === 'due_bill_ids' && c.evaluator_ref.evaluator_version === 1)) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const scope = selectionInput(claim, graph, `due-bill-ids-${checked}`);
        const expected = freezeDeep(structuredClone(Object.fromEntries(['required_nodes', 'required_reads', 'required_claim_reads',
            'required_edges', 'required_structural', 'required_selections', 'selected_nodes'].map(k => [k, graph.trace_contract.derivation[k]]))));
        const expectedBefore = JSON.stringify(expected);
        const original = reviewedDueBillIdsProposal().records.find(r => r.fact_key === claim.fact_key);
        const historicalExpected = freezeDeep({ ...structuredClone(expected), required_reads: structuredClone(original.current_derivation.required_reads) });
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const operandSets = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set').map(([role, b]) => ({ role, aliases: b.aliases }));
        const recorder = createCausalRecorder({ executionId: scope.executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' }); const controls = []; const operands = {};
        let value;
        try {
            for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
                const selector = { fact_key: claim.fact_key, role_id };
                const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
                    : binding.kind === 'node_set' ? plan.openSet(selector, phase.observe) : plan.open({ ...selector, alias: binding.alias }, phase.observe);
                controls.push(access); operands[role_id] = access.handle;
            }
            value = evaluateDirectMetric(Object.freeze(operands), claim.evaluator_ref.evaluator_id);
            for (const access of controls) access.assertHealthy();
        } finally { for (const access of controls) access.revoke(); }
        phase.seal(); const trace = recorder.finish();
        const input = { ...scope, expected, trace, operandSets, accessBindings }; const coverage = comparePhaseCoverage(input);
        assert.equal(coverage.components.selection.matched, true); assert.equal(coverage.matched, true, claim.fact_key);
        assert.equal(coverage.graph_accepted, false);
        const split = claim.fact_key.lastIndexOf('#');
        assert.deepEqual(value, oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1].value);
        assert.equal(trace.derivation_trace.some(e => e.operation === 'get' && e.path.join('.') === 'amount_minor'), false);
        assert.equal(comparePhaseCoverage({ ...input, expected: historicalExpected }).matched, false);
        // Removing a required ID read still fails; the normative correction is not a coverage bypass.
        const alias = claim.operand_bindings.bills.aliases[0];
        const kept = trace.derivation_trace.filter(e => !(e.operation === 'get' && e.alias === alias && e.path.join('.') === 'id'));
        assert.ok(kept.length < trace.derivation_trace.length);
        const altered = { ...trace, derivation_trace: kept.map((e, sequence) => ({ ...e, sequence })) };
        assert.equal(comparePhaseCoverage({ ...input, trace: altered }).matched, false);
        assert.equal(JSON.stringify(expected), expectedBefore); checked++;
    }
    assert.equal(checked, 1);
});

function sourcePresenceRequirement(roles, nodes, snapshots) {
    assert.equal(roles.source.kind, 'node'); const alias = roles.source.alias; const node = nodes[alias];
    assert.equal(node.kind, 'source_state');
    const matches = snapshots.filter(s => s.kind === node.kind && s.ref_id === node.ref_id && s.version === node.version);
    assert.equal(matches.length, 1); assert.equal(matches[0].payload.id, node.ref_id);
    return { node: alias, operation: 'has', segments: ['entity_id'] };
}

function reviewedSourcePresenceProposal() {
    const text = fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/source-entity-presence-proposal.json'), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(hash(text), 'sha256:7571b472d390ae5c723579f0b941f4cdd1a5f8f98aa25ae1390a96e0447ee5a6');
    return JSON.parse(text);
}

function undoReviewedSourcePresence(corpus) {
    // Compose the later independently reviewed collection read additions.
    undoReviewedCollectionKind(corpus);
    let removed = 0;
    for (const record of reviewedSourcePresenceProposal().records) {
        const graph = corpus.graphs.find(g => g.fact_key === record.fact_key);
        for (const addition of record.proposed_delta.added) {
            const list = graph.trace_contract.derivation.required_structural;
            const indices = list.flatMap((r, i) => JSON.stringify(r) === JSON.stringify(addition) ? [i] : []);
            assert.equal(indices.length, 1); list.splice(indices[0], 1); removed++;
        }
    }
    assert.equal(removed, 3);
}

test('N02G:SOURCE-PRESENCE-001 three authored presence observations preserve every other graph field', () => {
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const corpus = JSON.parse(readPreParentAuthorship(graphPath));
    const claims = JSON.parse(fs.readFileSync(path.join(root, prefix + 'claims-v2.json'), 'utf8')).claims;
    const snapshots = JSON.parse(fs.readFileSync(path.join(root, corpus.snapshot_manifest.path), 'utf8')).snapshots;
    const proposal = reviewedSourcePresenceProposal(); let checked = 0;
    for (const document of proposal.documents.filter(d => d.path !== graphPath)) {
        assertHistoricalSource(document);
    }
    for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === 'eligible_event_count' && c.evaluator_ref.evaluator_version === 1)) {
        const graph = corpus.graphs.find(g => g.fact_key === claim.fact_key);
        const requirement = sourcePresenceRequirement(claim.operand_bindings, graph.nodes, snapshots);
        assert.equal(graph.trace_contract.derivation.required_structural.filter(r => JSON.stringify(r) === JSON.stringify(requirement)).length, 1);
        checked++;
    }
    assert.equal(checked, 3); assert.equal(corpus.graphs.length, 76);
    undoReviewedSourcePresence(corpus);
    assert.equal(hash(canonicalValue(corpus)), proposal.source_corpus_sha256);
});

test('N02G:SOURCE-PRESENCE-002 authoring presence is independent of aliases and present-field value', () => {
    // Synthetic authoring inputs, not admitted execution graphs.
    for (let seed = 0; seed < 12; seed++) for (const entity of [undefined, 'family-a', 'family-b']) {
        const alias = `renamed-${seed}`; const ref = `source-${seed}`;
        const payload = { id: ref, ...(entity === undefined ? {} : { entity_id: entity }) };
        const version = hash(JSON.stringify(payload)); const identity = { kind: 'source_state', ref_id: ref, version };
        const roles = { source: { kind: 'node', alias } }; const nodes = { [alias]: identity };
        const snapshots = [{ ...identity, version: hash('other-version'), payload: { id: ref } }, { ...identity, payload }];
        const expected = { node: alias, operation: 'has', segments: ['entity_id'] };
        assert.deepEqual(sourcePresenceRequirement(roles, nodes, snapshots), expected);
        assert.deepEqual(sourcePresenceRequirement(roles, nodes, snapshots.reverse()), expected);
        assert.throws(() => sourcePresenceRequirement(roles, nodes, snapshots.filter(s => s.version !== version)));
        assert.throws(() => sourcePresenceRequirement(roles, nodes, [...snapshots, { ...identity, payload }]));
    }
});

test('N02G:SOURCE-PRESENCE-003 admitted absent-source integrations reject a trace without presence', async () => {
    const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === 'eligible_event_count' && c.evaluator_ref.evaluator_version === 1)) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const scope = selectionInput(claim, graph, `source-presence-${checked}`);
        const expected = freezeDeep(structuredClone(Object.fromEntries(['required_nodes', 'required_reads', 'required_claim_reads',
            'required_edges', 'required_structural', 'required_selections', 'selected_nodes'].map(k => [k, graph.trace_contract.derivation[k]]))));
        const expectedBefore = JSON.stringify(expected);
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const operandSets = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set').map(([role, b]) => ({ role, aliases: b.aliases }));
        const recorder = createCausalRecorder({ executionId: scope.executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' }); const controls = []; const operands = {};
        let value;
        try {
            for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
                const selector = { fact_key: claim.fact_key, role_id };
                const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
                    : binding.kind === 'node_set' ? plan.openSet(selector, phase.observe) : plan.open({ ...selector, alias: binding.alias }, phase.observe);
                controls.push(access); operands[role_id] = access.handle;
            }
            value = evaluateDirectMetric(Object.freeze(operands), 'eligible_event_count');
            for (const access of controls) access.assertHealthy();
        } finally { for (const access of controls) access.revoke(); }
        phase.seal(); const trace = recorder.finish();
        const input = { ...scope, expected, trace, operandSets, accessBindings }; const coverage = comparePhaseCoverage(input);
        assert.equal(coverage.components.selection.matched, true); assert.equal(coverage.matched, true, claim.fact_key);
        assert.equal(coverage.graph_accepted, false);
        const split = claim.fact_key.lastIndexOf('#');
        assert.equal(value, oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1].value);
        const alias = claim.operand_bindings.source.alias;
        const kept = trace.derivation_trace.filter(e => !(e.operation === 'has' && e.alias === alias && e.path.join('.') === 'entity_id'));
        assert.equal(trace.derivation_trace.length - kept.length, 1);
        const altered = { ...trace, derivation_trace: kept.map((e, sequence) => ({ ...e, sequence })) };
        assert.equal(comparePhaseCoverage({ ...input, trace: altered }).matched, false);
        assert.equal(trace.derivation_trace.some(e => e.operation === 'get' && e.alias === alias && e.path.join('.') === 'entity_id'), false);
        assert.equal(JSON.stringify(expected), expectedBefore); checked++;
    }
    assert.equal(checked, 3);
});

function reviewedBudgetClassProposal() {
    const text = fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/budget-class-population-proposal.json'), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(hash(text), 'sha256:3a7fe567cb35866d230ffe6b7706c5e53a552fbaa4303ed1902ccbdd63bd1583');
    return JSON.parse(text);
}

function restoreReviewedBudgetClassReads(corpus) {
    // Compose the later three presence additions before this historical delta.
    undoReviewedSourcePresence(corpus);
    // Historical comparison only. Restore exactly the reviewed removals at
    // their original position after the last preserved read of that node.
    const proposal = reviewedBudgetClassProposal(); let restored = 0;
    for (const record of proposal.records) {
        const reads = corpus.graphs.find(g => g.fact_key === record.fact_key).trace_contract.derivation.required_reads;
        for (const removal of record.proposed_delta.removed) {
            assert.equal(reads.filter(r => JSON.stringify(r) === JSON.stringify(removal)).length, 0);
            const anchor = record.preserved_removed_node_reads.at(-1);
            const index = reads.findIndex(r => JSON.stringify(r) === JSON.stringify(anchor)); assert.ok(index >= 0);
            reads.splice(index + 1, 0, structuredClone(removal)); restored++;
        }
    }
    assert.equal(restored, 2);
}

test('N02G:BUDGET-CLASS-001 exact effective-category reads preserve all other graph fields', () => {
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const corpus = JSON.parse(readPreParentAuthorship(graphPath));
    const claims = JSON.parse(fs.readFileSync(path.join(root, prefix + 'claims-v2.json'), 'utf8')).claims;
    const snapshots = JSON.parse(fs.readFileSync(path.join(root, corpus.snapshot_manifest.path), 'utf8')).snapshots;
    const proposal = reviewedBudgetClassProposal();
    for (const document of proposal.documents.filter(d => d.path !== graphPath)) {
        assert.equal(hash(readHistoricalAuthority(document.path)), document.lf_sha256);
    }
    let checked = 0;
    for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === 'budget_class_consumption' && c.evaluator_ref.evaluator_version === 1)) {
        const graph = corpus.graphs.find(g => g.fact_key === claim.fact_key);
        const expected = budgetClassRequirements({ roles: claim.operand_bindings, nodes: graph.nodes, edges: graph.edges, snapshots });
        const reads = graph.trace_contract.derivation.required_reads.filter(r => r.segments.length === 1 && r.segments[0] === 'budget_class');
        assert.deepEqual(reads, expected, claim.fact_key); checked++;
    }
    assert.equal(checked, 2); assert.equal(corpus.graphs.length, 76);
    restoreReviewedBudgetClassReads(corpus);
    assert.equal(hash(canonicalValue(corpus)), proposal.source_corpus_sha256);
});

test('N02G:BUDGET-CLASS-002 generated authoring populations ignore names, order and financial exclusion', () => {
    // Synthetic authoring models, NOT admitted execution graphs. Each seed
    // rebuilds material identities after changes; there is no evaluator here.
    for (let seed = 0; seed < 12; seed++) for (const direct of [false, true]) for (const compensation of [false, true]) {
        const names = Object.fromEntries(['a', 'b', 'unused', 'refund', 'income', 'neutral', 'event', 'reversal', 'source', 'salary', 'transfer']
            .map((name, index) => [name, `alias_${seed}_${11 - index}`]));
        const nodes = {}; const snapshots = []; const edges = [];
        const ref = name => `ref_${seed}_${name}`;
        const add = (name, kind, payload) => {
            const value = { id: ref(name), ...payload }; const version = hash(JSON.stringify(value));
            nodes[names[name]] = { kind, ref_id: ref(name), version };
            snapshots.push({ kind, ref_id: ref(name), version, payload: value });
        };
        for (const name of ['a', 'b', 'unused', 'refund', 'income', 'neutral']) add(name, 'category',
            { kind: name === 'refund' ? 'compensation' : ['income', 'neutral'].includes(name) ? name : 'expense',
                budget_class: seed % 2 ? 'essential' : 'flexible' });
        const event = (name, category, extra = {}) => {
            add(name, 'event', { category_id: ref(category), state: seed % 2 ? 'projected' : 'confirmed',
                date: `${2040 + seed}-01-01`, person_id: `outside_${seed}`, amount_minor: seed, ...extra });
            edges.push({ source: names[name], field: 'category_id', target: names[category], relation: 'material_ref' });
        };
        event('event', direct ? 'unused' : 'a'); event('source', compensation ? 'unused' : 'b');
        event('reversal', 'refund', { compensates: ref('source') }); event('salary', 'income'); event('transfer', 'neutral');
        edges.push({ source: names.reversal, field: 'compensates', target: names.source, relation: 'material_ref' });
        const roles = { events: { kind: 'node_set', aliases: ['event', 'reversal', 'salary', 'transfer'].map(n => names[n]) },
            categories: { kind: 'node_set', aliases: ['a', 'b', 'unused', 'refund', 'income', 'neutral'].map(n => names[n]) } };
        const input = { roles, nodes, edges, snapshots };
        const expected = [...new Set([names[direct ? 'unused' : 'a'], names[compensation ? 'unused' : 'b']])]
            .sort().map(node => ({ node, segments: ['budget_class'] }));
        assert.deepEqual(budgetClassRequirements(input), expected);
        roles.events.aliases.reverse(); roles.categories.aliases.reverse(); edges.reverse(); snapshots.reverse();
        assert.deepEqual(budgetClassRequirements(input), expected);
        const wrongVersion = structuredClone(input); wrongVersion.nodes[names.source].version = hash('different-version');
        assert.throws(() => budgetClassRequirements(wrongVersion));
        const wrongClass = structuredClone(input);
        const sourceCategory = names[compensation ? 'unused' : 'b'];
        const badSnapshot = wrongClass.snapshots.find(s => s.ref_id === wrongClass.nodes[sourceCategory].ref_id);
        badSnapshot.payload.kind = 'income'; badSnapshot.version = hash(JSON.stringify(badSnapshot.payload));
        wrongClass.nodes[sourceCategory].version = badSnapshot.version;
        assert.throws(() => budgetClassRequirements(wrongClass));
    }
});

test('N02G:BUDGET-CLASS-003 frozen normative coverage requires every effective classification read', async () => {
    const { evaluateEconomicMetric } = require('../../../src/next/provenance/metricSelection');
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    for (const claim of claims.filter(c => c.evaluator_ref.evaluator_id === 'budget_class_consumption' && c.evaluator_ref.evaluator_version === 1)) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const scope = selectionInput(claim, graph, `budget-class-${checked}`);
        const expected = freezeDeep(structuredClone(Object.fromEntries(['required_nodes', 'required_reads', 'required_claim_reads',
            'required_edges', 'required_structural', 'required_selections', 'selected_nodes'].map(k => [k, graph.trace_contract.derivation[k]]))));
        const expectedBefore = JSON.stringify(expected);
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const operandSets = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set').map(([role, b]) => ({ role, aliases: b.aliases }));
        const recorder = createCausalRecorder({ executionId: scope.executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' }); const controls = []; const operands = {};
        let value;
        try {
            for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
                const selector = { fact_key: claim.fact_key, role_id };
                const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
                    : binding.kind === 'node_set' ? plan.openSet(selector, phase.observe) : plan.open({ ...selector, alias: binding.alias }, phase.observe);
                controls.push(access); operands[role_id] = access.handle;
            }
            value = evaluateEconomicMetric(Object.freeze(operands), 'budget_class');
            for (const access of controls) access.assertHealthy();
        } finally { for (const access of controls) access.revoke(); }
        phase.seal(); const trace = recorder.finish();
        const input = { ...scope, expected, trace, operandSets, accessBindings }; const coverage = comparePhaseCoverage(input);
        assert.equal(coverage.components.selection.matched, true); assert.equal(coverage.matched, true, claim.fact_key);
        assert.equal(coverage.graph_accepted, false);
        const split = claim.fact_key.lastIndexOf('#');
        assert.equal(value, oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1].value);
        for (const read of expected.required_reads.filter(r => r.segments.length === 1 && r.segments[0] === 'budget_class')) {
            const kept = trace.derivation_trace.filter(e => !(e.operation === 'get' && e.alias === read.node && e.path.join('.') === 'budget_class'));
            assert.ok(kept.length < trace.derivation_trace.length);
            const altered = { ...trace, derivation_trace: kept.map((entry, sequence) => ({ ...entry, sequence })) };
            assert.equal(comparePhaseCoverage({ ...input, trace: altered }).matched, false);
        }
        assert.equal(JSON.stringify(expected), expectedBefore); checked++;
    }
    assert.equal(checked, 2);
});

function safePaceStateRequirements(claim) {
    if (claim.evaluator_ref.evaluator_id !== 'safe_daily_pace' || claim.evaluator_ref.evaluator_version !== 1) return [];
    assert.equal(claim.metric, 'safe_daily_pace');
    assert.deepEqual(claim.operand_bindings.context, { kind: 'claim_context' });
    return [{ segments: ['evidence_state'] }];
}

test('N02G:EVIDENCE-STATE-001 only two reviewed claim reads extend the immutable corpus', () => {
    const { digest } = require('../../../src/next/kernel/canonicalValue');
    const corpus = JSON.parse(readPreParentAuthorship(graphPath));
    const claims = JSON.parse(fs.readFileSync(path.join(root, prefix + 'claims-v2.json'), 'utf8'));
    const registry = JSON.parse(fs.readFileSync(path.join(root, prefix + 'metric-evaluator-registry-v1.json'), 'utf8'));
    assert.equal(digest(claims), 'f6c148b2cdbd9a4c875e8641264979c4797f25a93cac382c290044ad49ee80d4');
    const entry = registry.entries.find(e => e.evaluator_id === 'safe_daily_pace' && e.evaluator_version === 1);
    assert.equal(entry.evaluator_contract_hash, 'sha256:195e3968cc2f7f7dd2e46fdcb2619c19892b5c56a27d0e3c62f76fe08ba9a14d');
    assert.equal(hash(fs.readFileSync(path.join(root, entry.contract_path), 'utf8').replaceAll('\r\n', '\n')), entry.evaluator_contract_hash);
    let checked = 0;
    for (const claim of claims.claims) for (const requirement of safePaceStateRequirements(claim)) {
        const graph = corpus.graphs.find(g => g.fact_key === claim.fact_key);
        const reads = graph.trace_contract.derivation.required_claim_reads;
        assert.equal(reads.filter(r => JSON.stringify(r) === JSON.stringify(requirement)).length, 1, claim.fact_key);
        graph.trace_contract.derivation.required_claim_reads = reads.filter(r => JSON.stringify(r) !== JSON.stringify(requirement));
        checked++;
    }
    assert.equal(checked, 2); assert.equal(corpus.graphs.length, 76);
    // Compose the later budget-class removals explicitly before restoring the
    // historical evidence-state baseline; neither equality is relaxed.
    restoreReviewedBudgetClassReads(corpus);
    // Removing the two state additions and undoing the reviewed class delta
    // must recover every field of the pinned pre-change corpus.
    assert.equal(digest(corpus), '8745fad432413bbc9d435528e313271c81ebc403de4dca58f0d42b07556904f9');
});

test('N02G:EVIDENCE-STATE-002 kernel state guards follow contracts, not the claim label or budget singleton', async () => {
    const { evaluateEconomicMetric } = require('../../../src/next/provenance/metricSelection');
    const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
    const { createInstrumentedAccess } = require('../../../src/next/provenance/instrumentedAccess');
    const { projectClaimContext } = require('../../../src/next/provenance/claimContext');
    const { plan, claims, graphs } = await snapshotAccessFixture(); const validation = await validators();
    const schema = JSON.parse(fs.readFileSync(path.join(root, prefix + 'claim-contract.schema.json'), 'utf8'));
    const claimDocument = JSON.parse(fs.readFileSync(path.join(root, prefix + 'claims-v2.json'), 'utf8'));
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    const modes = { consumption_total: 'total', category_consumption: 'category', category_spent: 'spent', income_realized: 'income',
        budget_class_consumption: 'budget_class', category_budget_remaining: 'budget_remaining', safe_daily_pace: 'safe_pace',
        consumption_by_instrument: 'instrument', statement_total: 'statement', eligible_event_count: 'count' };
    let checked = 0;
    for (const claim of claims.filter(c => Object.hasOwn(modes, c.metric))) for (const state of ['confirmed', 'estimated', 'projected']) {
        const mode = modes[claim.metric]; const observed = []; const controls = []; const operands = {};
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const expectedSelection = structuredClone(graph.trace_contract.derivation.required_selections
            .map(s => graph.sets[s.selected_set]));
        const alteredClaim = { ...claim, evidence_state: state };
        assert.equal(validation.claims({ ...claimDocument, claims: claimDocument.claims.map(c => c.fact_key === claim.fact_key ? alteredClaim : c) }), true);
        // Kernel-only alternate context, schema-checked and instrumented. NOT an
        // admitted whole graph: its unchanged proof may reject the new label.
        const projected = projectClaimContext(alteredClaim, schema);
        const context = createInstrumentedAccess({ emit: e => observed.push(e), bindings: [{ alias: 'context', role: 'context',
            value: projected.value, shape: projected.shape }] });
        controls.push(context); operands.context = context.handle('context');
        for (const [role_id, binding] of Object.entries(claim.operand_bindings).filter(([role]) => role !== 'context')) {
            const selector = { fact_key: claim.fact_key, role_id };
            const access = binding.kind === 'node_set' ? plan.openSet(selector, e => observed.push(e))
                : plan.open({ ...selector, alias: binding.alias }, e => observed.push(e));
            controls.push(access); operands[role_id] = access.handle;
        }
        const guarded = ['safe_pace', 'instrument', 'statement'].includes(mode);
        const requiredState = mode === 'safe_pace' ? 'estimated' : 'confirmed';
        try {
            const execute = () => mode === 'count' ? evaluateDirectMetric(operands, 'eligible_event_count') : evaluateEconomicMetric(operands, mode);
            if (guarded && state !== requiredState) assert.throws(execute, /^Error: metric_selection_context$/);
            else {
                const value = execute(); const split = claim.fact_key.lastIndexOf('#');
                assert.deepEqual(observed.filter(e => e[1] === 'select_return').map(e => e[6].slice(2)), expectedSelection);
                assert.equal(value, oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1].value);
                if (claim.operand_bindings.budget) {
                    const alias = claim.operand_bindings.budget.alias;
                    assert.equal(observed.some(e => e[1] === 'get' && e[2] === alias && e[4].join('.') === 'evidence_state'), false);
                    assert.ok(observed.some(e => e[1] === 'get' && e[2] === alias && e[4].join('.') === 'limit_minor'));
                }
            }
            assert.equal(observed.some(e => e[1] === 'get' && e[2] === 'context' && e[4].join('.') === 'evidence_state'), guarded);
            for (const access of controls) access.assertHealthy();
        } finally { for (const access of controls) access.revoke(); }
        checked++;
    }
    assert.equal(checked, 34 * 3);
});

test('N02G:EVIDENCE-STATE-003 invalid budget state is refused before snapshot handles exist', async () => {
    const validation = await validators();
    for (const state of ['projected', 'estimated', undefined]) {
        const f = fixture(); const graphEntry = f.entries.find(e => e.path === graphPath);
        const graphs = JSON.parse(graphEntry.bytes); const manifestEntry = f.entries.find(e => e.path === graphs.snapshot_manifest.path);
        const manifest = JSON.parse(manifestEntry.bytes); const budget = manifest.snapshots.find(s => s.kind === 'budget');
        if (state === undefined) delete budget.payload.evidence_state; else budget.payload.evidence_state = state;
        assert.equal(validation.snapshot({ ref_id: budget.ref_id, kind: budget.kind, version: budget.version, payload: budget.payload }), false);
        manifestEntry.bytes = Buffer.from(JSON.stringify(manifest));
        graphs.snapshot_manifest.hash = hash(manifestEntry.bytes); graphEntry.bytes = Buffer.from(JSON.stringify(graphs));
        for (const entry of [manifestEntry, graphEntry]) f.authority.find(a => a.path === entry.path).sha256 = hash(entry.bytes);
        const admitted = admitPackage(f); // Byte admission is not payload admission.
        assert.throws(() => compileSnapshotAccess(admitted, validation), /^Error: graph_index_schema_snapshot$/);
    }
});

test('N02G:EVIDENCE-STATE-004 safe pace requires its authored state observation with frozen expectations', async () => {
    const { evaluateEconomicMetric } = require('../../../src/next/provenance/metricSelection');
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0;
    for (const claim of claims.filter(c => safePaceStateRequirements(c).length)) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const scope = selectionInput(claim, graph, `evidence-state-${checked}`);
        const expected = freezeDeep(structuredClone(Object.fromEntries(['required_nodes', 'required_reads', 'required_claim_reads',
            'required_edges', 'required_structural', 'required_selections', 'selected_nodes']
            .map(key => [key, graph.trace_contract.derivation[key]]))));
        const expectedBefore = JSON.stringify(expected);
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const operandSets = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set')
            .map(([role, b]) => ({ role, aliases: b.aliases }));
        const recorder = createCausalRecorder({ executionId: scope.executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' });
        const controls = []; const operands = {};
        try {
            for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
                const selector = { fact_key: claim.fact_key, role_id };
                const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
                    : binding.kind === 'node_set' ? plan.openSet(selector, phase.observe)
                        : plan.open({ ...selector, alias: binding.alias }, phase.observe);
                controls.push(access); operands[role_id] = access.handle;
            }
            evaluateEconomicMetric(Object.freeze(operands), 'safe_pace');
            for (const access of controls) access.assertHealthy();
        } finally { for (const access of controls) access.revoke(); }
        phase.seal(); const trace = recorder.finish();
        const input = { ...scope, expected, trace, operandSets, accessBindings };
        const coverage = comparePhaseCoverage(input);
        assert.equal(coverage.components.selection.matched, true);
        assert.equal(coverage.matched, true, claim.fact_key);
        assert.equal(coverage.graph_accepted, false);
        const stateReads = trace.derivation_trace.filter(e => e.operation === 'get' && e.path.join('.') === 'evidence_state');
        assert.equal(stateReads.length, 1);
        const altered = { ...trace, derivation_trace: trace.derivation_trace.filter(e => e !== stateReads[0])
            .map((entry, sequence) => ({ ...entry, sequence })) };
        const rejected = comparePhaseCoverage({ ...input, trace: altered });
        assert.equal(rejected.matched, false);
        assert.equal(rejected.graph_accepted, false);
        assert.equal(JSON.stringify(expected), expectedBefore);
        checked++;
    }
    assert.equal(checked, 2);
});

test('N02G:FAMILY-PHASE-001 transitive population authored delta preserves every other graph field', () => {
    const document = JSON.parse(readPreParentAuthorship(graphPath));
    const source = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit-evidence/n02g-transitive-family/graphs-extract.json'), 'utf8'));
    for (const claim of source.claims) {
        const graph = document.graphs.find(g => g.fact_key === claim.fact_key);
        const before = source.graphs.find(g => g.fact_key === claim.fact_key);
        const expected = structuredClone(before);
        for (const [key, values] of Object.entries(transitiveFamilyRequirements(before, claim))) {
            const list = expected.trace_contract.derivation[key];
            for (const value of values) if (!list.some(v => JSON.stringify(v) === JSON.stringify(value))) list.push(value);
        }
        // Compose the separately reviewed safe_daily_pace state requirement.
        expected.trace_contract.derivation.required_claim_reads.push(...safePaceStateRequirements(claim));
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
    const document = JSON.parse(readPreParentAuthorship(graphPath));
    // Undo only the independently reviewed later structural additions.
    undoReviewedSourcePresence(document);
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
    for (const binding of metadata) assert.deepEqual(Object.keys(binding).sort(),
        ['alias', ...(binding.alias === 'claim/context' ? ['claim_structure'] : []), 'identity', 'records', 'role']);
    assert.deepEqual(Object.keys(context.claim_structure).sort(), ['records', 'sequences']);
    assert.ok(context.claim_structure.records.every(record => Object.keys(record).sort().join(',') === 'keys,path'));
    assert.ok(context.claim_structure.sequences.every(sequence => Object.keys(sequence).sort().join(',') === 'item_hashes,path'));
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
    const report = buildCandidateReport(readPreParentAuthorship);
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
    const read = readPreParentAuthorship;
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
    // Undo the two separately reviewed safe_pace reads before comparing against
    // this historical corpus. EVIDENCE-STATE-001 pins their exact current delta.
    const claims = JSON.parse(read(prefix + 'claims-v2.json')).claims;
    let stateReads = 0;
    for (const claim of claims) for (const requirement of safePaceStateRequirements(claim)) {
        const derivation = reconstructed.graphs.find(g => g.fact_key === claim.fact_key).trace_contract.derivation;
        assert.equal(derivation.required_claim_reads.filter(r => JSON.stringify(r) === JSON.stringify(requirement)).length, 1);
        derivation.required_claim_reads = derivation.required_claim_reads.filter(r => JSON.stringify(r) !== JSON.stringify(requirement));
        stateReads++;
    }
    assert.equal(stateReads, 2);
    restoreReviewedBudgetClassReads(reconstructed);
    // Restoring the reviewed instrument/state/class deltas recovers every field.
    assert.equal(digest(reconstructed), reviewed.source_corpus_sha256);
    assert.ok(Object.values(generated.totals).every(d => d.added === 0 && d.removed === 0));
    assert.equal(generated.graph_accepted, false); assert.equal(generated.normative_application_allowed, false);
});

test('N02G:AUTHOR-RECONCILE-001 six independently authored normative derivations cover observations without accepting graphs', async () => {
    const { buildCandidateReport } = require('../../../scripts/agent/reportNextCausalAuthoring.cjs');
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const report = freezeDeep(buildCandidateReport(readPreParentAuthorship));
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
        const historical = Object.fromEntries(Object.keys(record.candidate.obligations)
            .map(key => [key, preParentDerivation(graph)[key]]));
        assert.equal(hash(JSON.stringify(historical)), hash(JSON.stringify(record.candidate.obligations)), `${claim.fact_key}: normative authoring mismatch`);
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

test('N02G:SIMILAR-EVENT-001 frozen proposal changes only focal inventories; all other corpus content is preserved', () => {
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const corpus = JSON.parse(readPreParentAuthorship(graphPath)); const p = reviewedSimilarEventProposal();
    assert.equal(p.records.length, 1); const r = p.records[0];
    const g = corpus.graphs.find(g => g.fact_key === r.fact_key);
    assert.deepEqual(g.trace_contract.derivation, r.proposed_derivation);
    assert.equal(hash(canonicalValue(g.trace_contract.proof)), r.proof_preserved_sha256);
    undoReviewedSimilarEvent(corpus);
    assert.equal(corpus.graphs.length, 76); assert.equal(hash(canonicalValue(corpus)), p.source_corpus_sha256);
    for (const d of p.documents.filter(d => ![graphPath, 'tests/next/provenance/metricDirectReads.cases.js'].includes(d.path))) {
        assert.equal(hash(readHistoricalAuthority(d.path)), d.lf_sha256, d.path);
    }
});

test('N02G:SIMILAR-EVENT-002 admitted trace matches pre-frozen profile and rejects old requirements and missing operations', async () => {
    const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const { plan, claims, graphs } = await snapshotAccessFixture(); const r = reviewedSimilarEventProposal().records[0];
    const claim = claims.find(c => c.fact_key === r.fact_key); const graph = graphs.find(g => g.fact_key === r.fact_key);
    const before = JSON.stringify(graph); const scope = selectionInput(claim, graph, 'similar-event-admitted');
    const fields = ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural', 'required_selections', 'selected_nodes'];
    const expected = freezeDeep(structuredClone(Object.fromEntries(fields.map(k => [k, graph.trace_contract.derivation[k]]))));
    const historicalExpected = freezeDeep(structuredClone(Object.fromEntries(fields.map(k => [k, r.current_derivation[k]]))));
    const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
    const operandSets = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set').map(([role, b]) => ({ role, aliases: b.aliases }));
    const recorder = createCausalRecorder({ executionId: scope.executionId, maxEvents: 10000 });
    const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' }); const controls = []; const operands = {}; let result;
    try {
        for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
            const selector = { fact_key: claim.fact_key, role_id };
            const a = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
                : binding.kind === 'node_set' ? plan.openSet(selector, phase.observe)
                : plan.open({ ...selector, alias: binding.alias }, phase.observe);
            controls.push(a); operands[role_id] = a.handle;
        }
        result = evaluateDirectMetric(Object.freeze(operands), claim.metric);
        for (const a of controls) a.assertHealthy();
    } finally { for (const a of controls) a.revoke(); }
    phase.seal(); const trace = recorder.finish(); const input = { ...scope, expected, trace, operandSets, accessBindings };
    const coverage = comparePhaseCoverage(input); assert.equal(coverage.matched, true); assert.equal(coverage.graph_accepted, false);
    assert.deepEqual(preParentDerivation(graph), r.proposed_derivation);
    assert.equal(comparePhaseCoverage({ ...input, expected: historicalExpected }).matched, false);
    const groups = new Set(trace.derivation_trace.filter(e => ['get', 'has', 'traverse'].includes(e.operation))
        .map(e => JSON.stringify([e.operation, e.alias, e.path])));
    assert.ok(groups.size >= 67);
    for (const key of groups) {
        const kept = trace.derivation_trace.filter(e => JSON.stringify([e.operation, e.alias, e.path]) !== key);
        assert.equal(comparePhaseCoverage({ ...input, trace: { ...trace, derivation_trace: kept.map((e, sequence) => ({ ...e, sequence })) } }).matched, false, key);
    }
    // Oracle is consulted only after the frozen expectations and observed execution.
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    const split = claim.fact_key.lastIndexOf('#');
    assert.deepEqual(result, oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1].value);
    assert.equal(JSON.stringify(graph), before);
});

test('N02G:DIRECT-EVENT-004 exact frozen proposal changes only five derivations and preserves complete source corpus', () => {
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const corpus = JSON.parse(readPreParentAuthorship(graphPath)); const proposal = reviewedDirectEventProposal();
    for (const r of proposal.records) {
        const graph = corpus.graphs.find(g => g.fact_key === r.fact_key);
        assert.deepEqual(preParentDerivation(graph), r.proposed_derivation);
        assert.equal(hash(canonicalValue(graph.trace_contract.proof)), r.proof_preserved_sha256);
    }
    assert.equal(corpus.graphs.length, 76); undoReviewedDirectEvent(corpus);
    assert.equal(hash(canonicalValue(corpus)), proposal.source_corpus_sha256);
});

test('N02G:DIRECT-EVENT-005 five admitted executions match pre-frozen derivations; missing or extra observations fail', async () => {
    const { evaluateDirectMetric } = require('../../../src/next/provenance/metricDirectReads');
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const { plan, claims, graphs } = await snapshotAccessFixture(); const proposal = reviewedDirectEventProposal();
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    let checked = 0; let negatives = 0;
    for (const record of proposal.records) {
        const claim = claims.find(c => c.fact_key === record.fact_key); const graph = graphs.find(g => g.fact_key === claim.fact_key);
        const before = JSON.stringify(graph); const scope = selectionInput(claim, graph, `direct-event-${checked}`);
        assert.deepEqual(preParentDerivation(graph), record.proposed_derivation);
        const fields = ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural', 'required_selections', 'selected_nodes'];
        const expected = freezeDeep(structuredClone(Object.fromEntries(fields.map(k => [k, graph.trace_contract.derivation[k]]))));
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const recorder = createCausalRecorder({ executionId: scope.executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' }); const controls = []; const operands = {}; let value;
        try {
            for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
                const selector = { fact_key: claim.fact_key, role_id };
                const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe)
                    : plan.open({ ...selector, alias: binding.alias }, phase.observe);
                controls.push(access); operands[role_id] = access.handle;
            }
            value = evaluateDirectMetric(Object.freeze(operands), claim.metric);
            for (const access of controls) access.assertHealthy();
        } finally { for (const access of controls) access.revoke(); }
        phase.seal(); const trace = recorder.finish(); const input = { ...scope, expected, trace, operandSets: [], accessBindings };
        const coverage = comparePhaseCoverage(input);
        assert.equal(coverage.matched, true, `${claim.fact_key}: ${JSON.stringify(coverage)}`);
        assert.equal(coverage.graph_accepted, false); assert.deepEqual(expected.required_selections, []); assert.deepEqual(expected.selected_nodes, []);
        const split = claim.fact_key.lastIndexOf('#');
        assert.deepEqual(value, oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1].value);
        // Remove an entire observed dimension, including repeated reads; a
        // duplicate read cannot accidentally retain the obligation under test.
        const dimensions = new Map();
        for (const e of trace.derivation_trace.filter(e => ['get', 'traverse', 'keys'].includes(e.operation))) {
            const key = JSON.stringify([e.operation, e.alias, e.path]); dimensions.set(key, e);
        }
        for (const key of dimensions.keys()) {
            const kept = trace.derivation_trace.filter(e => JSON.stringify([e.operation, e.alias, e.path]) !== key);
            assert.equal(comparePhaseCoverage({ ...input, trace: { ...trace, derivation_trace: kept.map((e, sequence) => ({ ...e, sequence })) } }).matched, false, `${claim.fact_key}/${key}`);
            negatives++;
        }
        const read = trace.derivation_trace.find(e => e.operation === 'get' && e.alias === claim.operand_bindings.event.alias);
        const extra = [...trace.derivation_trace, { ...read, path: ['person_id'], sequence: trace.derivation_trace.length }];
        assert.equal(comparePhaseCoverage({ ...input, trace: { ...trace, derivation_trace: extra } }).matched, false);
        assert.equal(JSON.stringify(graph), before); checked++;
    }
    assert.equal(checked, 5); assert.ok(negatives >= 30);
});

test('N02G:PAYMENT-REFERENCE-003 neutral payment derivations match frozen authored contracts without target payload', async () => {
    const { evaluateEffects } = require('../../../src/next/provenance/metricEffects');
    const { freezeDeep } = require('../../../src/next/kernel/canonicalValue');
    const { plan, claims, graphs } = await snapshotAccessFixture(); let checked = 0; let rejected = 0;
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    for (const claim of claims.filter(c => c.subject.kind === 'event' && ['consumption_effect', 'invoice_payment_consumption_effect'].includes(c.metric))) {
        const graph = graphs.find(g => g.fact_key === claim.fact_key); const before = JSON.stringify(graph);
        const scope = selectionInput(claim, graph, `payment-reference-${checked}`);
        const fields = ['required_nodes', 'required_reads', 'required_claim_reads', 'required_edges', 'required_structural', 'required_selections', 'selected_nodes'];
        const expected = freezeDeep(structuredClone(Object.fromEntries(fields.map(k => [k, graph.trace_contract.derivation[k]]))));
        const accessBindings = plan.observationMetadata({ fact_key: claim.fact_key, phase: 'derivation' });
        const operandSets = Object.entries(claim.operand_bindings).filter(([, b]) => b.kind === 'node_set').map(([role, b]) => ({ role, aliases: b.aliases }));
        const recorder = createCausalRecorder({ executionId: scope.executionId, maxEvents: 10000 });
        const phase = recorder.open({ invocationId: claim.fact_key, phase: 'derivation' }); const controls = []; const operands = {}; let value;
        try {
            for (const [role_id, binding] of Object.entries(claim.operand_bindings)) {
                const selector = { fact_key: claim.fact_key, role_id };
                const access = binding.kind === 'claim_context' ? plan.openContext(selector, phase.observe) : plan.openSet(selector, phase.observe);
                controls.push(access); operands[role_id] = access.handle;
            }
            value = evaluateEffects(Object.freeze(operands), claim.metric);
            for (const access of controls) access.assertHealthy();
        } finally { for (const access of controls) access.revoke(); }
        phase.seal(); const trace = recorder.finish(); const input = { ...scope, expected, trace, operandSets, accessBindings };
        const coverage = comparePhaseCoverage(input);
        assert.equal(coverage.matched, true, claim.fact_key); assert.equal(coverage.graph_accepted, false);
        const split = claim.fact_key.lastIndexOf('#');
        assert.deepEqual(value, oracle.turns[claim.fact_key.slice(0, split)].facts[Number(claim.fact_key.slice(split + 1)) - 1].value);
        // Proof still has separate account/card relations. Derivation success
        // neither executes these obligations nor accepts the economic claim.
        for (const field of ['account_id', 'settles_card_id']) {
            const edge = graph.edges.find(e => e.field === field && claim.operand_bindings.events.aliases.includes(e.source));
            assert.ok(edge); assert.ok(graph.trace_contract.proof.required_edges.includes(edge.id));
            assert.equal(trace.derivation_trace.some(e => e.alias === edge.target && ['get', 'identity'].includes(e.operation)), false);
        }
        if (claim.metric === 'invoice_payment_consumption_effect') {
            for (const operation of ['get', 'traverse']) {
                const kept = trace.derivation_trace.filter(e => !(e.operation === operation && e.path?.join('.') === 'settles_card_id'));
                assert.ok(kept.length < trace.derivation_trace.length);
                assert.equal(comparePhaseCoverage({ ...input, trace: { ...trace, derivation_trace: kept.map((e, sequence) => ({ ...e, sequence })) } }).matched, false); rejected++;
            }
        }
        assert.equal(JSON.stringify(graph), before); checked++;
    }
    assert.equal(checked, 3); assert.equal(rejected, 4);
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
    const document = JSON.parse(readPreParentAuthorship(graphPath));
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
    const { plan } = await snapshotAccessFixture();
    const graphs = JSON.parse(readPreParentAuthorship(graphPath)).graphs;
    // Keep the historical traversal/owned-card comparison on its exact corpus.
    // DIRECT-EVENT-004/005 separately prove the successor's five derivations.
    const beforeDirectEvent = { graphs: structuredClone(graphs) }; undoReviewedDirectEvent(beforeDirectEvent);
    const report = inspectTraversalCoverage(beforeDirectEvent.graphs);
    const beforeAccountInstallment = { graphs: structuredClone(graphs) }; undoReviewedAccountInstallment(beforeAccountInstallment);
    const currentReport = inspectTraversalCoverage(beforeAccountInstallment.graphs); assert.equal(currentReport.compatible, true);
    const appliedReport = inspectTraversalCoverage(graphs);
    const profileKeys = new Set(require('../../../docs/audit-evidence/n02g-causal-authoring-profile/prepare-account-installment-application.cjs')
        .reviewedCorpus().proposal.records.map(row => row.fact_key));
    assert.equal(appliedReport.compatible, true);
    assert.deepEqual(appliedReport.edge_only.filter(row => !profileKeys.has(row.fact_key)),
        currentReport.edge_only.filter(row => !profileKeys.has(row.fact_key)));
    // The reviewed closure removes irrelevant obligations or supplies missing
    // endpoints; it must not invent a new edge-only diagnostic in these profiles.
    const priorDiagnostics = new Set(currentReport.edge_only.map(row => JSON.stringify(row)));
    assert.ok(appliedReport.edge_only.every(row => priorDiagnostics.has(JSON.stringify(row))));
    // Reconcile SIMILAR-EVENT separately, without weakening the historical pin:
    // exactly the reviewed 32 noncausal derivation edges disappear.
    const beforeSimilar = { graphs: structuredClone(graphs) }; undoReviewedSimilarEvent(beforeSimilar);
    const beforeSimilarReport = inspectTraversalCoverage(beforeSimilar.graphs);
    const similarRecord = reviewedSimilarEventProposal().records[0];
    const removedSimilar = new Set(similarRecord.delta.required_edges.removed);
    assert.equal(removedSimilar.size, 32);
    const isRemovedSimilar = e => e.fact_key === similarRecord.fact_key && e.phase === 'derivation' && removedSimilar.has(e.edge_id);
    assert.deepEqual(beforeSimilarReport.edge_only.filter(isRemovedSimilar).map(e => e.edge_id).sort(), [...removedSimilar].sort());
    assert.deepEqual(currentReport.edge_only, beforeSimilarReport.edge_only.filter(e => !isRemovedSimilar(e)));
    const directKeys = new Set(reviewedDirectEventProposal().records.map(r => r.fact_key));
    assert.deepEqual(beforeSimilarReport.edge_only.filter(e => !directKeys.has(e.fact_key)), report.edge_only.filter(e => !directKeys.has(e.fact_key)));
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
    // Reconstruct the previously reviewed state before comparing its historical
    // instrument closure; owned_cards is composed as its own exact delta below.
    const ownerBaseline = { graphs: structuredClone(graphs) }; undoReviewedOwnedCards(ownerBaseline);
    const afterInstrument = inspectTraversalCoverage(ownerBaseline.graphs);
    const before = inspectTraversalCoverage(ownerBaseline.graphs.map(g => originals.get(g.fact_key) || g));
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
    assert.deepEqual(afterInstrument.edge_only, before.edge_only.filter(g => !originals.has(g.fact_key)));
    assert.equal(afterInstrument.edge_only_graphs, before.edge_only_graphs - originals.size);
    assert.equal(afterInstrument.edge_only_count, before.edge_only_count - affected.length);
    const ownedRecords = reviewedOwnedCardsProposal().records;
    const nowCovered = afterInstrument.edge_only.filter(e => ownedRecords.some(r => r.fact_key === e.fact_key
        && e.phase === 'derivation' && r.requirements.relations.some(link => link.edge.id === e.edge_id
            && r.proposed_delta.added_nodes.includes(link.owner))));
    assert.deepEqual(nowCovered.map(e => [e.fact_key, e.phase, e.edge_id]), [['S-07#1#1', 'derivation', 'e0002']]);
    assert.deepEqual(report.edge_only, afterInstrument.edge_only.filter(e => !nowCovered.includes(e)));
    assert.equal(report.edge_only_graphs, afterInstrument.edge_only_graphs - 1);
    assert.equal(report.edge_only_count, afterInstrument.edge_only_count - 1);
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
    assert.deepEqual(Object.keys(plan).sort(), ['executable', 'inspectProofPredicates', 'observationMetadata', 'open', 'openContext', 'openDerivedRole', 'openMetricInvocation', 'openProof', 'openSet', 'projectDerivationBindings', 'projectDerivationProgram', 'projectMetricTransport', 'projectProofProgram', 'projectProofTransport', 'runProofPredicates', 'snapshot_count', 'stage']);
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
            assert.throws(() => plan.openProof({ fact_key: graph.fact_key }, () => {}), /parent_transport/);
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

test('N02G:PROOF-PROGRAM-001 compiled proof executes all primary predicates and causal selection guards', async t => {
    const { plan, ir } = await snapshotAccessFixture();
    let graphs = 0; let predicates = 0; let selections = 0;
    for (const graph of ir.graphs) {
        if (Object.values(graph.nodes).some(node => node.binding !== 'snapshot')) continue;
        const events = [];
        const executionId = 'proof-program-' + graph.fact_key;
        const recorder = createCausalRecorder({ executionId, maxEvents: 100000 });
        const scope = recorder.open({ invocationId: graph.fact_key, phase: 'proof' });
        const observed = plan.runProofPredicates({ fact_key: graph.fact_key }, event => { events.push(event); scope.observe(event); });
        scope.seal();
        const selectedSets = new Set(graph.selections.map(selection => selection.selected_set));
        const { evidence_set_mode, ...expected } = graph.expected_trace.proof;
        const coverage = comparePhaseCoverage({ executionId, invocationId: graph.fact_key, phase: 'proof',
            trace: recorder.finish(), expected, sets: graph.sets,
            bindings: graph.selections.map(selection => ({ role: `proof/set/${selection.candidate_set}`,
                candidate_set: selection.candidate_set, selected_set: selection.selected_set })),
            operandSets: Object.keys(graph.sets).filter(name => !selectedSets.has(name))
                .map(name => ({ role: `proof/set/${name}`, aliases: graph.sets[name] })),
            accessBindings: plan.observationMetadata({ fact_key: graph.fact_key, phase: 'proof' }) });
        const diagnosis = Object.fromEntries(Object.entries(coverage.components).map(([key, value]) =>
            [key, { matched: value.matched, errors: value.errors?.slice(0, 3),
                mismatches: value.mismatches?.slice(0, 3).map(row => ({ dimension: row.dimension,
                    missing: row.missing?.slice(0, 3), extra: row.extra?.slice(0, 3),
                    missing_count: row.missing?.length, extra_count: row.extra?.length })),
                unclassified: value.unclassified_sequences?.slice(0, 3) }]));
        assert.equal(coverage.matched, true, `${graph.fact_key}: ${JSON.stringify(diagnosis)}; unsupported=${JSON.stringify(coverage.event_coverage.filter(event => event.status !== 'covered').slice(0, 3))}`);
        assert.equal(coverage.graph_accepted, false);
        assert.equal(observed.stage, 'observed_proof_predicates_only');
        assert.equal(observed.graph_accepted, false);
        assert.equal(observed.predicates, graph.predicates.length);
        assert.equal(observed.selections, graph.selections.length);
        assert.ok(events.length > graph.predicates.length);
        for (const selection of graph.selections) {
            const decisions = events.filter(event => event[1] === 'select_member'
                && event[3] === `proof/set/${selection.candidate_set}`);
            assert.equal(decisions.length, graph.sets[selection.candidate_set].length);
            assert.deepEqual(decisions.filter(event => event[6][2]).map(event => event[6][1]),
                graph.sets[selection.selected_set]); // Independent harness comparison only.
        }
        graphs++; predicates += observed.predicates; selections += observed.selections;
    }
    assert.equal(graphs, 73);
    assert.equal(selections, 73);
    t.diagnostic(`observed_proof_graphs=${graphs}; predicates=${predicates}; selections=${selections}; graph_accepted=false`);
});

test('N02G:PROOF-PROGRAM-002 false inclusion and exclusion guards change real decisions and cannot pass', async () => {
    const schema = await validators();
    for (const mode of ['inclusion', 'exclusion']) {
        const input = fixture();
        const entry = input.entries.find(entry => entry.path === graphPath);
        const corpus = JSON.parse(entry.bytes);
        const graph = corpus.graphs.find(graph => graph.fact_key === 'M-01#1#1');
        const selection = graph.selections[0];
        let node; let id;
        if (mode === 'inclusion') {
            node = 'evt_market_a';
            id = selection.selected_predicates.find(id => {
                const predicate = graph.predicates.find(predicate => predicate.id === id);
                return predicate.op === 'eq' && predicate.args.some(arg => arg.field?.node === node);
            });
            graph.predicates.find(predicate => predicate.id === id).args[1].literal.value = 'person-b';
        } else {
            const excluded = selection.excluded.find(row => row.node === 'evt_salary_a');
            node = excluded.node; id = excluded.predicates[0];
            graph.predicates.find(predicate => predicate.id === id).args[1].literal.value = 'income';
        }
        assert.ok(id);
        entry.bytes = Buffer.from(JSON.stringify(corpus));
        input.authority.find(row => row.path === graphPath).sha256 = hash(entry.bytes);
        const plan = compileSnapshotAccess(admitPackage(input), schema);
        const events = [];
        assert.throws(() => plan.runProofPredicates({ fact_key: graph.fact_key }, event => events.push(event)),
            /proof_program_unsatisfied/);
        const decision = events.find(event => event[1] === 'select_member' && event[6][1] === node);
        assert.ok(decision);
        assert.equal(decision[6][2], mode === 'exclusion');
    }
});

test('N02G:PROOF-DIAGNOSTIC-001 real predicate results identify the single false guard without short-circuit', async () => {
    const schema = await validators();
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
    const { runAdmittedProof } = require('../../../src/next/provenance/executionHost');
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const admit = (source, kind, name) => {
        const bytes = Buffer.from(source);
        const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
            kind, entry: name, files: [{ path: name, media_type: 'text/javascript', sha256: hash(bytes) }] }));
        return admitArtifact({ manifestBytes, expectedRoot: hash(manifestBytes), entries: [{ path: name, bytes }] });
    };
    const child = admit(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    for (const mode of ['inclusion', 'exclusion', 'edge']) {
        const input = fixture();
        const original = compileSnapshotAccess(admitPackage(input), schema);
        const entry = input.entries.find(row => row.path === graphPath);
        const corpus = JSON.parse(entry.bytes);
        const graph = corpus.graphs.find(row => row.fact_key === 'M-01#1#1');
        const selector = { fact_key: graph.fact_key };
        const baseline = original.inspectProofPredicates(selector, () => {});
        assert.equal(baseline.stage, 'proof_predicate_diagnostics_only');
        assert.equal(baseline.graph_accepted, false);
        assert.equal(baseline.satisfied, true);
        assert.equal(baseline.results.length, graph.predicates.length);
        assert.ok(baseline.results.every(row => row.satisfied === true));
        const selection = graph.selections[0];
        const id = mode === 'inclusion'
            ? selection.selected_predicates.find(id => {
                const p = graph.predicates.find(row => row.id === id);
                return p.op === 'eq' && p.args.some(arg => arg.field?.node === 'evt_market_a');
            })
            : mode === 'exclusion' ? selection.excluded.find(row => row.node === 'evt_salary_a').predicates[0]
                : graph.predicates.find(row => row.atom === 'edge' && row.op === 'not_eq'
                    && row.args.every(arg => arg.field)).id;
        const predicate = graph.predicates.find(row => row.id === id);
        if (mode === 'edge') predicate.op = 'eq';
        else predicate.args[1].literal.value = mode === 'inclusion' ? 'person-b' : 'income';
        entry.bytes = Buffer.from(JSON.stringify(corpus));
        input.authority.find(row => row.path === graphPath).sha256 = hash(entry.bytes);
        const changed = compileSnapshotAccess(admitPackage(input), schema);
        const events = [];
        const actual = changed.inspectProofPredicates(selector, event => events.push(event));
        assert.equal(actual.satisfied, false);
        assert.equal(actual.graph_accepted, false);
        assert.equal(actual.results.length, baseline.results.length);
        assert.deepEqual(actual.results.filter(row => !row.satisfied), [{
            id, obligation: predicate.obligation, atom: predicate.atom, satisfied: false
        }]);
        assert.deepEqual(actual.results.filter(row => row.id !== id), baseline.results.filter(row => row.id !== id));
        assert.ok(Object.isFrozen(actual) && Object.isFrozen(actual.results)
            && actual.results.every(Object.isFrozen));
        if (mode !== 'edge') {
            const node = mode === 'inclusion' ? 'evt_market_a' : 'evt_salary_a';
            assert.equal(events.find(event => event[1] === 'select_member' && event[6][1] === node)[6][2], mode === 'exclusion');
        }
        assert.throws(() => changed.runProofPredicates(selector, () => {}), /proof_program_unsatisfied/);

        // Same lowered program semantics in the captured child. This is a
        // contract-guard mutation, not a repaired semantic-payload witness.
        // It does not supply a production freeze or financial acceptance.
        const captured = [];
        for (const current of [original, changed]) {
            const artifact = admit(buildScalarProofProgram(current.projectProofProgram(selector).input).source, 'proof', 'bundle.js');
            const config = current.projectProofTransport(selector).config;
            const executionId = `diagnostic-${mode}`;
            const observed = await runAdmittedProof({ ...config, artifactReceipt: artifact, childCapsuleReceipt: child,
                executionId, invocationId: graph.fact_key, timeoutMs: 4000 });
            const selectedSets = new Set(graph.selections.map(row => row.selected_set));
            const { evidence_set_mode, ...expected } = graph.trace_contract.proof;
            const coverage = comparePhaseCoverage({ executionId, invocationId: graph.fact_key, phase: 'proof',
                trace: observed.trace, expected, sets: graph.sets,
                bindings: config.proofSelections.map(row => ({ role: `proof/set/${row.candidate_set}`,
                    candidate_set: row.candidate_set, selected_set: row.selected_set })),
                operandSets: config.proofSets.filter(row => !selectedSets.has(row.name))
                    .map(row => ({ role: `proof/set/${row.name}`, aliases: row.roster })),
                accessBindings: current.observationMetadata({ fact_key: graph.fact_key, phase: 'proof' }),
                measurements: [{ measurement: 'proof_engine_artifact_root', observed: artifact.observed_root }] });
            assert.equal(observed.graph_accepted, false);
            assert.equal(observed.observed_artifact_root, artifact.observed_root);
            captured.push({ observed, coverage, config });
        }
        assert.deepEqual(captured[0].config, captured[1].config, 'guard drift must not change operands');
        assert.equal(captured[0].observed.proof_satisfied, true);
        assert.equal(captured[0].coverage.matched, true);
        assert.equal(captured[1].observed.proof_satisfied, false);
        const materialEvents = result => result.observed.trace.proof_trace
            .filter(row => row.operation && !row.operation.startsWith('select'))
            .map(({ sequence, ...row }) => row);
        for (const result of captured) {
            assert.deepEqual(result.coverage.components.read_edges.mismatches, []);
            for (const name of ['operand_sets', 'access_metadata', 'civil_dates', 'measurements']) {
                assert.equal(result.coverage.components[name].matched, true, name);
            }
            assert.ok(result.coverage.event_coverage.every(row => row.status === 'covered'));
        }
        assert.deepEqual(materialEvents(captured[0]), materialEvents(captured[1]));
        if (mode === 'edge') {
            // This predicate is outside selection. Its false boolean is the
            // only semantic drift; every trace obligation remains covered.
            assert.equal(captured[1].coverage.matched, true);
            assert.equal(captured[1].coverage.components.selection.matched, true);
        } else {
            // A single false predicate does NOT imply an isolated witness.
            // Both controls also change selection; all real reads remain
            // covered. Retain that collateral effect rather than G11 credit.
            assert.equal(captured[1].coverage.matched, false);
            assert.equal(captured[1].coverage.components.selection.matched, false);
            assert.deepEqual(captured[1].coverage.components.selection.errors, []);
            assert.ok(captured[1].coverage.components.selection.mismatches.length > 0);
        }
    }
});

test('N02G:MUTATION-ISOLATION-001 repaired semantic sign and magnitude variants isolate edge in captured D/P', async t => {
    const schema = await validators();
    const data = await snapshotAccessFixture();
    const targets = data.ir.graphs.find(row => row.fact_key === 'M-01#1#1').predicates
        .filter(row => ['opposite_sign', 'abs_eq'].includes(row.op));
    const oracle = JSON.parse(fs.readFileSync(path.join(root,
        'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8')).turns['M-01#1'].facts[0].value;
    let executed = 0; let omittedReads = 0; let omittedEdges = 0; let omittedClaimReads = 0; let omittedKeys = 0;
    let omittedStructuralLifecycles = 0; let omittedHas = 0;
    async function exercise(predicateId, operandIndex) {
    const input = fixture();
    const original = compileSnapshotAccess(admitPackage(input), schema);
    const entries = new Map(input.entries.map(row => [row.path, row]));
    const corpus = JSON.parse(entries.get(graphPath).bytes);
    const graph = corpus.graphs.find(row => row.fact_key === 'M-01#1#1');
    const predicate = graph.predicates.find(row => row.id === predicateId);
    const claim = JSON.parse(entries.get(corpus.claim_contract.path).bytes).claims.find(row => row.fact_key === graph.fact_key);
    const { materializeSignedRelationMutation } = require('../../../src/next/provenance/mutationWitnesses');
    const generated = materializeSignedRelationMutation({ packageReceipt: admitPackage(input), fact_key: graph.fact_key,
        predicate_id: predicate.id, operand_index: operandIndex });
    assert.equal(generated.stage, 'generated_semantic_mutation_only');
    assert.equal(generated.mutation_acceptance, false);
    assert.deepEqual(generated.expected_violations, ['edge']);
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    for (const row of generated.changes) {
        entries.get(row.path).bytes = Buffer.from(row.source);
        assert.equal(hash(entries.get(row.path).bytes), row.sha256);
        input.authority.find(ref => ref.path === row.path).sha256 = row.sha256;
    }
    const changed = compileSnapshotAccess(admitPackage(input), schema);
    const selector = { fact_key: graph.fact_key };
    const baseline = original.inspectProofPredicates(selector, () => {});
    const actual = changed.inspectProofPredicates(selector, () => {});
    const expectedViolations = ['edge']; // fixed before any mutant execution
    assert.equal(baseline.satisfied, true);
    assert.deepEqual(actual.results.filter(row => !row.satisfied), [{ id: predicate.id,
        obligation: predicate.obligation, atom: predicate.atom, satisfied: false }]);
    assert.deepEqual([...new Set(actual.results.filter(row => !row.satisfied).map(row => row.atom))], expectedViolations);
    assert.deepEqual(actual.results.filter(row => row.id !== predicate.id), baseline.results.filter(row => row.id !== predicate.id));
    const { buildPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule, buildAvailableMetricArtifacts } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
    const { runAdmittedGraph } = require('../../../src/next/provenance/executionHost');
    const profile = reviewedPhaseProfile();
    const admit = (source, kind, entry, extra) => {
        const files = [{ path: entry, bytes: Buffer.from(source) }];
        if (extra) files.push({ path: extra.path, bytes: Buffer.from(extra.source) });
        const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
            kind, entry, files: files.map(row => ({ path: row.path, sha256: hash(row.bytes),
                media_type: row.path.endsWith('.json') ? 'application/json' : 'text/javascript' })) }));
        return admitArtifact({ manifestBytes, expectedRoot: hash(manifestBytes), entries: files });
    };
    const child = admit(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const metric = admit(buildAvailableMetricArtifacts().built.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id).source,
        'metric', 'bundle.js');
    const runs = [];
    for (const plan of [original, changed]) {
        const built = buildPhaseProofProgram({ proof: plan.projectProofProgram(selector).input,
            derivation: plan.projectDerivationProgram(selector, profile).input }, profile);
        const proof = admit(built.source, 'proof', 'bundle.js', built.profileInput);
        const proofConfig = plan.projectProofTransport(selector).config;
        const transport = plan.projectMetricTransport(selector);
        const executionId = 'semantic-transfer-sign';
        const observed = await runAdmittedGraph({ childCapsuleReceipt: child, executionId,
            invocationId: graph.fact_key, timeoutMs: 5000,
            derivation: { artifactReceipt: metric, bindings: [], directGroups: transport.directGroups,
                nodeSets: transport.nodeSets,
                derivationBindings: plan.projectDerivationBindings(selector) },
            proof: { ...proofConfig, artifactReceipt: proof } });
        for (const phase of ['derivation', 'proof']) {
            const { evidence_set_mode, ...expected } = graph.trace_contract[phase];
            const isProof = phase === 'proof';
            const coverageInput = { executionId, invocationId: graph.fact_key, phase,
                trace: observed.trace, expected, sets: graph.sets,
                bindings: isProof ? proofConfig.proofSelections.map(row => ({ role: `proof/set/${row.candidate_set}`,
                    candidate_set: row.candidate_set, selected_set: row.selected_set })) : selectionInput(claim, graph, executionId).bindings,
                operandSets: isProof ? proofConfig.proofSets.map(row => ({ role: `proof/set/${row.name}`, aliases: row.roster }))
                    : Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set')
                        .map(([role, row]) => ({ role, aliases: row.aliases })),
                accessBindings: plan.observationMetadata({ fact_key: graph.fact_key, phase }),
                measurements: isProof ? [{ measurement: 'proof_engine_artifact_root', observed: proof.observed_root }]
                    : [{ measurement: 'evaluator_artifact_root', observed: metric.observed_root },
                        { measurement: 'proof_engine_artifact_root', observed: proof.observed_root }] };
            const coverage = comparePhaseCoverage(coverageInput);
            assert.equal(coverage.matched, true, `${phase}: ${JSON.stringify(coverage.components)}`);
            assert.equal(coverage.graph_accepted, false);
            if (plan === original && executed === 0) {
                const { materializeTraceReadOmission, materializeTraceEdgeOmission,
                    materializeTraceClaimReadOmission, materializeTraceStructuralOmission } = require('../../../src/next/provenance/mutationWitnesses');
                for (const read of expected.required_reads) {
                    const fault = materializeTraceReadOmission({ trace: observed.trace, fact_key: graph.fact_key,
                        phase, node: read.node, segments: read.segments });
                    assert.equal(fault.stage, 'generated_trace_fault_only');
                    assert.equal(fault.mutation_acceptance, false);
                    assert.deepEqual(fault.expected_violations, ['trace']);
                    assert.ok(fault.removed_sequences.length > 0);
                    const failed = compareReadEdgeCoverage({ executionId, invocationId: graph.fact_key, phase,
                        trace: fault.trace, expected: Object.fromEntries(['required_nodes', 'required_reads',
                            'required_claim_reads', 'required_edges', 'required_structural'].map(key => [key, expected[key]])) });
                    const reads = failed.mismatches.find(row => row.dimension === 'reads');
                    assert.ok(reads);
                    assert.deepEqual(reads.missing, expected.required_reads.filter(row => row.node === read.node
                        && read.segments.length <= row.segments.length && read.segments.every((part, index) => row.segments[index] === part))
                        .map(row => [row.node, row.segments]).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0));
                    assert.deepEqual(reads.extra, []);
                    // This is recorder-output fault injection only. Original
                    // R, predicate truth and measured artifacts are untouched;
                    // the corrupted trace cannot become a financial receipt.
                    assert.equal(failed.graph_accepted, false);
                    omittedReads++;
                }
                for (const edge of expected.required_edges) {
                    const fault = materializeTraceEdgeOmission({ trace: observed.trace, fact_key: graph.fact_key, phase, edge });
                    assert.deepEqual(fault.expected_violations, ['trace']);
                    assert.ok(fault.removed_sequences.length > 0);
                    const failed = compareReadEdgeCoverage({ executionId, invocationId: graph.fact_key, phase,
                        trace: fault.trace, expected: Object.fromEntries(['required_nodes', 'required_reads',
                            'required_claim_reads', 'required_edges', 'required_structural'].map(key => [key, expected[key]])) });
                    assert.deepEqual(failed.mismatches.map(row => ({ dimension: row.dimension,
                        missing: row.missing, extra: row.extra })), [{ dimension: 'edges', missing: [edge], extra: [] }]);
                    assert.equal(failed.graph_accepted, false);
                    const retained = row => row.operation !== 'traverse' || row.outcome[1] !== edge;
                    const content = rows => rows.map(({ sequence, ...row }) => row);
                    assert.deepEqual(content(fault.trace[`${phase}_trace`]), content(observed.trace[`${phase}_trace`].filter(retained)));
                    assert.deepEqual(content(fault.trace[`${phase === 'proof' ? 'derivation' : 'proof'}_trace`]),
                        content(observed.trace[`${phase === 'proof' ? 'derivation' : 'proof'}_trace`]));
                    omittedEdges++;
                }
                for (const read of expected.required_claim_reads) {
                    const fault = materializeTraceClaimReadOmission({ trace: observed.trace, fact_key: graph.fact_key,
                        phase, segments: read.segments });
                    assert.deepEqual(fault.expected_violations, ['trace']);
                    assert.ok(fault.removed_sequences.length > 0);
                    const failed = compareReadEdgeCoverage({ executionId, invocationId: graph.fact_key, phase,
                        trace: fault.trace, expected: Object.fromEntries(['required_nodes', 'required_reads',
                            'required_claim_reads', 'required_edges', 'required_structural'].map(key => [key, expected[key]])) });
                    const reads = failed.mismatches.find(row => row.dimension === 'claim_reads');
                    assert.ok(reads); assert.deepEqual(reads.missing, expected.required_claim_reads.filter(row =>
                        read.segments.length <= row.segments.length && read.segments.every((part, index) => row.segments[index] === part))
                        .map(row => row.segments).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)); assert.deepEqual(reads.extra, []);
                    assert.ok(failed.mismatches.every(row => row.dimension === 'claim_reads'));
                    assert.equal(failed.graph_accepted, false);
                    omittedClaimReads++;
                }
                for (const required of expected.required_structural.filter(row => ['keys', 'has'].includes(row.operation))) {
                    const fault = materializeTraceStructuralOmission({ trace: observed.trace, fact_key: graph.fact_key,
                        phase, node: required.node, operation: required.operation, segments: required.segments });
                    assert.deepEqual(fault.expected_violations, ['trace']);
                    const failed = compareReadEdgeCoverage({ executionId, invocationId: graph.fact_key, phase,
                        trace: fault.trace, expected: Object.fromEntries(['required_nodes', 'required_reads',
                            'required_claim_reads', 'required_edges', 'required_structural'].map(key => [key, expected[key]])) });
                    const structural = failed.mismatches.find(row => row.dimension === 'structural');
                    assert.ok(structural);
                    assert.deepEqual(structural.missing, [[required.node, required.operation, required.segments]]);
                    assert.deepEqual(structural.extra, []);
                    assert.ok(failed.mismatches.every(row => row.dimension === 'structural'));
                    assert.equal(failed.graph_accepted, false);
                    const content = rows => rows.map(({ sequence, ...row }) => row);
                    const composed = comparePhaseCoverage({ ...coverageInput, trace: fault.trace });
                    assert.equal(composed.matched, false); assert.equal(composed.graph_accepted, false);
                    assert.ok(composed.event_coverage.every(row => row.status === 'covered'));
                    for (const component of ['selection', 'operand_sets', 'access_metadata', 'civil_dates', 'measurements']) {
                        assert.equal(composed.components[component].matched, true, component);
                    }
                    const retained = row => {
                        if (row.alias !== required.node) return true;
                        const keyView = required.operation === 'keys' && row.projection === 'keys';
                        const base = keyView && ['next', 'at'].includes(row.operation) ? row.path.slice(0, -1) : row.path;
                        return JSON.stringify(base) !== JSON.stringify(required.segments)
                            || !keyView && (row.projection !== 'data' || row.operation !== required.operation);
                    };
                    assert.deepEqual(content(fault.trace[`${phase}_trace`]), content(observed.trace[`${phase}_trace`].filter(retained)));
                    assert.deepEqual(content(fault.trace[`${phase}_trace`].filter(row => row.operation === 'get')),
                        content(observed.trace[`${phase}_trace`].filter(row => row.operation === 'get')));
                    assert.deepEqual(content(fault.trace[`${phase === 'proof' ? 'derivation' : 'proof'}_trace`]),
                        content(observed.trace[`${phase === 'proof' ? 'derivation' : 'proof'}_trace`]));
                    if (required.operation === 'keys') omittedKeys++;
                    else omittedHas++;
                }
                for (const required of expected.required_structural.filter(row => ['iterator', 'order', 'cardinality'].includes(row.operation))) {
                    const fault = materializeTraceStructuralOmission({ trace: observed.trace, fact_key: graph.fact_key,
                        phase, node: required.node, operation: required.operation, segments: required.segments });
                    const failed = compareReadEdgeCoverage({ executionId, invocationId: graph.fact_key, phase,
                        trace: fault.trace, expected: Object.fromEntries(['required_nodes', 'required_reads',
                            'required_claim_reads', 'required_edges', 'required_structural'].map(key => [key, expected[key]])) });
                    assert.equal(failed.matched, false); assert.equal(failed.graph_accepted, false);
                    const composed = comparePhaseCoverage({ ...coverageInput, trace: fault.trace });
                    assert.equal(composed.matched, false); assert.equal(composed.graph_accepted, false);
                    assert.ok(composed.event_coverage.every(row => row.status === 'covered'));
                    for (const component of ['selection', 'operand_sets', 'access_metadata', 'civil_dates', 'measurements']) {
                        assert.equal(composed.components[component].matched, true, component);
                    }
                    assert.ok(failed.mismatches.every(row => row.dimension === 'structural'));
                    assert.ok(failed.mismatches.find(row => row.dimension === 'structural').missing.some(row =>
                        row[0] === required.node && row[1] === required.operation
                        && JSON.stringify(row[2]) === JSON.stringify(required.segments)));
                    const content = rows => rows.map(({ sequence, ...row }) => row);
                    assert.deepEqual(content(fault.trace[`${phase}_trace`].filter(row => row.operation === 'get')),
                        content(observed.trace[`${phase}_trace`].filter(row => row.operation === 'get')));
                    assert.deepEqual(fault.expected_violations, ['trace']);
                    omittedStructuralLifecycles++;
                }
            }
        }
        runs.push(observed);
    }
    assert.equal(runs[0].proof_satisfied, true);
    assert.equal(runs[1].proof_satisfied, false);
    assert.deepEqual(runs[0].functional_result, runs[1].functional_result);
    assert.deepEqual(runs[0].functional_result.value, oracle);
    assert.ok(runs.every(row => row.graph_accepted === false));
    executed++;
    }
    for (const predicate of targets) for (const index of [0, 1]) await exercise(predicate.id, index);
    assert.equal(executed, targets.length * 2);
    assert.ok(omittedReads > 0); assert.ok(omittedEdges > 0);
    assert.ok(omittedClaimReads > 0);
    assert.ok(omittedKeys > 0);
    assert.ok(omittedStructuralLifecycles > 0);
    t.diagnostic(`captured_structural_lifecycle_faults=${omittedStructuralLifecycles}; scalar_reads_preserved=true; only_atom=trace; G11_complete=false`);
    t.diagnostic(`recorder_faults: omitted_reads=${omittedReads}; omitted_edges=${omittedEdges}; omitted_claim_reads=${omittedClaimReads}; omitted_keys=${omittedKeys}; omitted_has=${omittedHas}; only_atom=trace; G11_complete=false`);
    t.diagnostic(`semantic_sign_variants=${executed}; captured_phases=${executed * 4}; only_atom=edge; G11_complete=false`);
});

test('N02G:MUTATION-ISOLATION-CONTROL-001 native period diagnostics do not qualify a budget-month witness by themselves', async t => {
    const schema = await validators();
    const input = fixture();
    const originalReceipt = admitPackage(input);
    const original = compileSnapshotAccess(originalReceipt, schema);
    const corpus = JSON.parse(input.entries.find(row => row.path === graphPath).bytes);
    const graph = corpus.graphs.find(row => row.fact_key === 'M-13#1#3');
    const predicate = graph.predicates.find(row => row.op === 'month_bounds_match');
    assert.ok(predicate);
    const { materializeMonthRelationMutation } = require('../../../src/next/provenance/mutationWitnesses');
    const generated = materializeMonthRelationMutation({ packageReceipt: originalReceipt,
        fact_key: graph.fact_key, predicate_id: predicate.id });
    assert.equal(generated.mutation_acceptance, false);
    assert.deepEqual(generated.expected_violations, ['period']);
    assert.equal(generated.changes.length, 3);
    const changes = new Map(generated.changes.map(row => [row.path, row]));
    const entries = input.entries.map(row => ({ path: row.path,
        bytes: changes.has(row.path) ? Buffer.from(changes.get(row.path).source) : Buffer.from(row.bytes) }));
    for (const row of generated.changes) assert.equal(hash(row.source), row.sha256);
    const changed = compileSnapshotAccess(admitPackage({ entries,
        authority: entries.map(row => ({ path: row.path, sha256: hash(row.bytes) })) }), schema);
    const selector = { fact_key: graph.fact_key };
    const baseline = original.inspectProofPredicates(selector, () => {});
    const actual = changed.inspectProofPredicates(selector, () => {});
    assert.equal(baseline.satisfied, true);
    const violations = actual.results.filter(row => !row.satisfied);
    assert.ok(violations.length > 0);
    assert.ok(violations.some(row => row.id === predicate.id));
    assert.deepEqual([...new Set(violations.map(row => row.atom))], ['period']);
    assert.deepEqual(actual.results.filter(row => row.atom !== 'period'), baseline.results.filter(row => row.atom !== 'period'));
    assert.deepEqual(actual.selections, baseline.selections);
    assert.equal(actual.graph_accepted, false);
    t.diagnostic(`period_predicates_false=${violations.length}; native_only=true; metric_consumes_budget_period=true; witness_not_qualified=true; G11_complete=false`);
});

test('N02G:MUTATION-ISOLATION-002 source-state period and coverage mismatches preserve captured derivation and other atoms', async t => {
    const schema = await validators();
    const input = fixture(); const receipt = admitPackage(input);
    const original = compileSnapshotAccess(receipt, schema);
    const corpus = JSON.parse(input.entries.find(row => row.path === graphPath).bytes);
    const graph = corpus.graphs.find(row => row.fact_key === 'M-01#1#1');
    for (const atom of ['period', 'coverage']) {
    const predicate = graph.predicates.find(row => row.atom === atom && row.op === 'eq'
        && graph.nodes[row.args[0]?.field?.node]?.kind === 'source_state');
    assert.ok(predicate);
    const field = predicate.args[0].field;
    assert.ok(!graph.trace_contract.derivation.required_reads.some(row => row.node === field.node
        && JSON.stringify(row.segments) === JSON.stringify(field.segments)));
    const factories = require('../../../src/next/provenance/mutationWitnesses');
    const factory = atom === 'period' ? factories.materializeMonthRelationMutation : factories.materializeEnumEqualityMutation;
    const generated = factory({ packageReceipt: receipt,
        fact_key: graph.fact_key, predicate_id: predicate.id });
    assert.equal(generated.mutation_acceptance, false); assert.deepEqual(generated.expected_violations, [atom]);
    const changes = new Map(generated.changes.map(row => [row.path, row]));
    const entries = input.entries.map(row => ({ path: row.path,
        bytes: changes.has(row.path) ? Buffer.from(changes.get(row.path).source) : Buffer.from(row.bytes) }));
    const changed = compileSnapshotAccess(admitPackage({ entries,
        authority: entries.map(row => ({ path: row.path, sha256: hash(row.bytes) })) }), schema);
    const selector = { fact_key: graph.fact_key };
    const baseline = original.inspectProofPredicates(selector, () => {});
    const actual = changed.inspectProofPredicates(selector, () => {});
    assert.equal(baseline.satisfied, true);
    const violations = actual.results.filter(row => !row.satisfied);
    assert.deepEqual(violations, [{ id: predicate.id, obligation: predicate.obligation, atom, satisfied: false }]);
    assert.deepEqual([...new Set(violations.map(row => row.atom))], [atom]);
    assert.deepEqual(actual.results.filter(row => row.atom !== atom), baseline.results.filter(row => row.atom !== atom));
    assert.deepEqual(actual.selections, baseline.selections);
    assert.equal(actual.graph_accepted, false);
    const claim = JSON.parse(input.entries.find(row => row.path === corpus.claim_contract.path).bytes)
        .claims.find(row => row.fact_key === graph.fact_key);
    const oracle = JSON.parse(fs.readFileSync(path.join(root,
        'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8')).turns['M-01#1'].facts[0].value;
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const { buildPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule, buildAvailableMetricArtifacts } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
    const { runAdmittedGraph } = require('../../../src/next/provenance/executionHost');
    const profile = reviewedPhaseProfile();
    const admit = (source, kind, entry, extra) => {
        const files = [{ path: entry, bytes: Buffer.from(source) }];
        if (extra) files.push({ path: extra.path, bytes: Buffer.from(extra.source) });
        const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
            kind, entry, files: files.map(row => ({ path: row.path, sha256: hash(row.bytes),
                media_type: row.path.endsWith('.json') ? 'application/json' : 'text/javascript' })) }));
        return admitArtifact({ manifestBytes, expectedRoot: hash(manifestBytes), entries: files });
    };
    const child = admit(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const metric = admit(buildAvailableMetricArtifacts().built.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id).source,
        'metric', 'bundle.js');
    const runs = [];
    for (const plan of [original, changed]) {
        const built = buildPhaseProofProgram({ proof: plan.projectProofProgram(selector).input,
            derivation: plan.projectDerivationProgram(selector, profile).input }, profile);
        const proof = admit(built.source, 'proof', 'bundle.js', built.profileInput);
        const proofConfig = plan.projectProofTransport(selector).config;
        const transport = plan.projectMetricTransport(selector);
        const executionId = `semantic-source-${atom}`;
        const observed = await runAdmittedGraph({ childCapsuleReceipt: child, executionId,
            invocationId: graph.fact_key, timeoutMs: 5000,
            derivation: { artifactReceipt: metric, bindings: [], directGroups: transport.directGroups,
                nodeSets: transport.nodeSets, derivationBindings: plan.projectDerivationBindings(selector) },
            proof: { ...proofConfig, artifactReceipt: proof } });
        for (const phase of ['derivation', 'proof']) {
            const { evidence_set_mode, ...expected } = graph.trace_contract[phase];
            const isProof = phase === 'proof';
            const coverageInput = { executionId, invocationId: graph.fact_key, phase,
                trace: observed.trace, expected, sets: graph.sets,
                bindings: isProof ? proofConfig.proofSelections.map(row => ({ role: `proof/set/${row.candidate_set}`,
                    candidate_set: row.candidate_set, selected_set: row.selected_set })) : selectionInput(claim, graph, executionId).bindings,
                operandSets: isProof ? proofConfig.proofSets.map(row => ({ role: `proof/set/${row.name}`, aliases: row.roster }))
                    : Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set')
                        .map(([role, row]) => ({ role, aliases: row.aliases })),
                accessBindings: plan.observationMetadata({ fact_key: graph.fact_key, phase }),
                measurements: isProof ? [{ measurement: 'proof_engine_artifact_root', observed: proof.observed_root }]
                    : [{ measurement: 'evaluator_artifact_root', observed: metric.observed_root },
                        { measurement: 'proof_engine_artifact_root', observed: proof.observed_root }] };
            const coverage = comparePhaseCoverage(coverageInput);
            assert.equal(coverage.matched, true, `${phase}: ${JSON.stringify(coverage.components)}`);
            assert.equal(coverage.graph_accepted, false);
            if (atom === 'period' && plan === original && phase === 'proof') {
                const read = expected.required_reads.find(row => row.segments.join('.') === 'synthetic');
                assert.ok(read);
                const fault = factories.materializeTraceReadSubstitution({ packageReceipt: receipt,
                    trace: observed.trace, fact_key: graph.fact_key, phase, node: read.node, segments: read.segments });
                const failed = comparePhaseCoverage({ ...coverageInput, trace: fault.trace });
                assert.equal(failed.matched, false); assert.equal(failed.graph_accepted, false);
                assert.deepEqual(failed.components.read_edges.mismatches.map(row => ({ dimension: row.dimension,
                    missing: row.missing, extra: row.extra })), [{ dimension: 'reads', missing: [[read.node, read.segments]], extra: [] }]);
                for (const name of ['selection', 'operand_sets', 'access_metadata', 'civil_dates', 'measurements']) {
                    assert.equal(failed.components[name].matched, true, name);
                }
                assert.ok(failed.event_coverage.every(row => row.status === 'covered'));
                assert.equal(fault.trace.proof_trace.length, observed.trace.proof_trace.length);
                for (const event of observed.trace.proof_trace) {
                    const changedEvent = fault.trace.proof_trace.find(row => row.sequence === event.sequence);
                    if (fault.replaced_sequences.includes(event.sequence)) assert.deepEqual(changedEvent, { ...event, path: fault.patch.after });
                    else assert.deepEqual(changedEvent, event);
                }
                assert.deepEqual(fault.trace.derivation_trace, observed.trace.derivation_trace);
                t.diagnostic(`trace_path_substitutions=${fault.replaced_sequences.length}; same_type=true; values_unchanged=true; event_count_unchanged=true; only_atom=trace; recorder_fault_only=true; G11_complete=false`);
            }
        }
        runs.push(observed);
    }
    assert.equal(runs[0].proof_satisfied, true); assert.equal(runs[1].proof_satisfied, false);
    assert.deepEqual(runs[0].functional_result, runs[1].functional_result);
    assert.deepEqual(runs[0].functional_result.value, oracle);
    assert.ok(runs.every(row => row.graph_accepted === false));
    t.diagnostic(`predicates_false=${violations.length}; other_atoms_unchanged=true; selection_unchanged=true; captured_phases=4; R_unchanged=true; only_atom=${atom}; G11_complete=false`);
    }
});

test('N02G:MUTATION-ISOLATION-003 captured account has omissions preserve every non-trace component', async t => {
    const { plan, graphs, claims } = await snapshotAccessFixture();
    const graph = graphs.find(row => row.fact_key === 'S-04#1#1');
    const claim = claims.find(row => row.fact_key === graph.fact_key);
    const selector = { fact_key: graph.fact_key };
    const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
    const { buildPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule, buildAvailableMetricArtifacts } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
    const { runAdmittedGraph } = require('../../../src/next/provenance/executionHost');
    const { materializeTraceStructuralOmission } = require('../../../src/next/provenance/mutationWitnesses');
    const profile = reviewedPhaseProfile();
    const admit = (source, kind, entry, extra) => {
        const files = [{ path: entry, bytes: Buffer.from(source) }];
        if (extra) files.push({ path: extra.path, bytes: Buffer.from(extra.source) });
        const manifestBytes = Buffer.from(canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
            kind, entry, files: files.map(row => ({ path: row.path, sha256: hash(row.bytes),
                media_type: row.path.endsWith('.json') ? 'application/json' : 'text/javascript' })) }));
        return admitArtifact({ manifestBytes, expectedRoot: hash(manifestBytes), entries: files });
    };
    const child = admit(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const metric = admit(buildAvailableMetricArtifacts().built.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id).source,
        'metric', 'bundle.js');
    const built = buildPhaseProofProgram({ proof: plan.projectProofProgram(selector).input,
        derivation: plan.projectDerivationProgram(selector, profile).input }, profile);
    const proof = admit(built.source, 'proof', 'bundle.js', built.profileInput);
    const proofConfig = plan.projectProofTransport(selector).config;
    const transport = plan.projectMetricTransport(selector);
    const executionId = 'captured-account-has';
    const observed = await runAdmittedGraph({ childCapsuleReceipt: child, executionId,
        invocationId: graph.fact_key, timeoutMs: 5000,
        derivation: { artifactReceipt: metric, bindings: [], directGroups: transport.directGroups,
            nodeSets: transport.nodeSets, derivationBindings: plan.projectDerivationBindings(selector) },
        proof: { ...proofConfig, artifactReceipt: proof } });
    assert.equal(observed.proof_satisfied, true); assert.equal(observed.graph_accepted, false);
    const oracle = JSON.parse(fs.readFileSync(path.join(root,
        'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8')).turns['S-04#1'].facts[0];
    assert.deepEqual(observed.functional_result.value, oracle.value);
    let faults = 0;
    for (const phase of ['derivation', 'proof']) {
        const { evidence_set_mode, ...expected } = graph.trace_contract[phase];
        const isProof = phase === 'proof';
        const args = { executionId, invocationId: graph.fact_key, phase, trace: observed.trace, expected, sets: graph.sets,
            bindings: isProof ? proofConfig.proofSelections.map(row => ({ role: `proof/set/${row.candidate_set}`,
                candidate_set: row.candidate_set, selected_set: row.selected_set })) : selectionInput(claim, graph, executionId).bindings,
            operandSets: isProof ? proofConfig.proofSets.map(row => ({ role: `proof/set/${row.name}`, aliases: row.roster }))
                : Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set')
                    .map(([role, row]) => ({ role, aliases: row.aliases })),
            accessBindings: plan.observationMetadata({ fact_key: graph.fact_key, phase }),
            measurements: isProof ? [{ measurement: 'proof_engine_artifact_root', observed: proof.observed_root }]
                : [{ measurement: 'evaluator_artifact_root', observed: metric.observed_root },
                    { measurement: 'proof_engine_artifact_root', observed: proof.observed_root }] };
        assert.equal(comparePhaseCoverage(args).matched, true);
        const required = expected.required_structural.filter(row => row.operation === 'has');
        assert.ok(required.length > 0, 'use a graph with genuine has obligations in both phases');
        for (const row of required) {
            const fault = materializeTraceStructuralOmission({ trace: observed.trace, fact_key: graph.fact_key,
                phase, node: row.node, operation: row.operation, segments: row.segments });
            const actual = comparePhaseCoverage({ ...args, trace: fault.trace });
            assert.equal(actual.matched, false); assert.equal(actual.graph_accepted, false);
            assert.deepEqual(actual.components.read_edges.mismatches.map(item => ({ dimension: item.dimension,
                missing: item.missing, extra: item.extra })),
                [{ dimension: 'structural', missing: [[row.node, 'has', row.segments]], extra: [] }]);
            assert.ok(actual.event_coverage.every(item => item.status === 'covered'));
            for (const name of ['selection', 'operand_sets', 'access_metadata', 'civil_dates', 'measurements']) {
                assert.equal(actual.components[name].matched, true, name);
            }
            const content = rows => rows.map(({ sequence, ...item }) => item);
            assert.deepEqual(content(fault.trace[`${phase}_trace`].filter(item => item.operation === 'get')),
                content(observed.trace[`${phase}_trace`].filter(item => item.operation === 'get')));
            assert.deepEqual(content(fault.trace[`${isProof ? 'derivation' : 'proof'}_trace`]),
                content(observed.trace[`${isProof ? 'derivation' : 'proof'}_trace`]));
            assert.deepEqual(fault.expected_violations, ['trace']); faults++;
        }
    }
    assert.equal(faults, 22);
    t.diagnostic(`captured_has_faults=${faults}; all_other_components_match=true; R_and_predicates_unchanged=true; only_atom=trace; G11_complete=false`);
});

test('N02G:PROOF-DIAGNOSTIC-002 malformed selectors and execution errors cannot fabricate boolean violations', async () => {
    const { plan, graphs } = await snapshotAccessFixture();
    const graph = graphs.find(row => Object.values(row.nodes).every(node => node.binding === 'snapshot'));
    let calls = 0;
    assert.throws(() => plan.inspectProofPredicates({ fact_key: graph.fact_key, results: [] }, () => calls++));
    assert.equal(calls, 0);
    assert.throws(() => plan.inspectProofPredicates({ fact_key: graph.fact_key }, () => { throw new Error('sink_diagnostic_red'); }));
    const after = plan.inspectProofPredicates({ fact_key: graph.fact_key }, () => {});
    assert.equal(after.satisfied, true);
    assert.equal(after.graph_accepted, false);
});

test('N02G:PROOF-PROGRAM-003 callers cannot supply expectations or swallow a sink failure', async () => {
    const { plan, graphs } = await snapshotAccessFixture();
    const graph = graphs.find(graph => Object.values(graph.nodes).every(node => node.binding === 'snapshot'));
    let events = 0;
    for (const extra of [{ expected_trace: graph.trace_contract.proof }, { selected_nodes: [] }, { result: 0 }]) {
        assert.throws(() => plan.runProofPredicates({ fact_key: graph.fact_key, ...extra }, () => events++));
    }
    assert.equal(events, 0);
    assert.throws(() => plan.runProofPredicates({ fact_key: graph.fact_key }, () => { throw new Error('sink_red'); }));
    assert.equal(plan.executable, false);
});

test('N02G:PROOF-BUILD-PROJECTION-001 build inputs contain admitted instructions and descriptors, not acceptance expectations', async () => {
    const { plan, graphs } = await snapshotAccessFixture();
    const { buildScalarProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    for (const graph of graphs) {
        const projected = plan.projectProofProgram({ fact_key: graph.fact_key });
        assert.equal(projected.stage, 'proof_build_input_only');
        assert.equal(projected.graph_accepted, false);
        assert.deepEqual(Object.keys(projected.input).sort(), ['materials', 'operators', 'predicates', 'selections', 'windows']);
        assert.equal(projected.input.predicates.length, graph.predicates.length);
        assert.deepEqual(Object.keys(projected.input.materials).sort(), Object.keys(graph.nodes).sort());
        for (const predicate of projected.input.predicates) {
            assert.deepEqual(Object.keys(predicate).sort(), ['id', 'operands', 'operator']);
            assert.deepEqual(Object.keys(predicate.operator).sort(), ['args', 'id', 'semantics']);
        }
        for (const descriptor of Object.values(projected.input.materials)) {
            assert.deepEqual(Object.keys(descriptor).sort(), ['fields', 'kind', 'registry_version']);
        }
        assert.equal(projected.input.selections.length, graph.selections.length);
        for (const selection of projected.input.selections) {
            assert.deepEqual(Object.keys(selection).sort(), ['candidate_set', 'cases', 'selected_set']);
            assert.deepEqual(selection.cases.map(item => item.node), graph.sets[selection.candidate_set]);
            for (const item of selection.cases) assert.deepEqual(Object.keys(item).sort(), ['identity', 'mode', 'node', 'predicates']);
        }
        const program = buildScalarProofProgram(projected.input);
        assert.equal(program.executable, false); assert.equal(program.predicateCount, graph.predicates.length);
        assert.throws(() => { projected.input.predicates.length = 0; }, TypeError);
    }
    assert.throws(() => plan.projectProofProgram({ fact_key: graphs[0].fact_key, expected_trace: [] }), /proof_build_selector/);
    assert.throws(() => plan.projectProofProgram({ fact_key: 'S-99#1#1' }), /proof_build_graph/);
});

test('N02G:PROOF-TRANSPORT-001 all primary graphs execute both isolated phases with exact coverage and no expected rosters', async t => {
    const { plan, graphs, claims } = await snapshotAccessFixture();
    const phaseProfile = reviewedPhaseProfile();
    const { buildPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    const { buildMetricChildCapsule, buildAvailableMetricArtifacts } = await import('../../../scripts/agent/buildNextMetricArtifacts.mjs');
    const { admitArtifact } = require('../../../src/next/provenance/artifactLoader');
    const { runAdmittedGraph } = require('../../../src/next/provenance/executionHost');
    const admit = (source, kind, entry, profileInput) => {
        const entries = [{ path: entry, bytes: Buffer.from(source) }];
        if (profileInput) entries.push({ path: profileInput.path, bytes: Buffer.from(profileInput.source) });
        const manifestBytes = Buffer.from(canonicalManifest(kind, entry, entries));
        return admitArtifact({ manifestBytes, expectedRoot: hash(manifestBytes), entries });
    };
    function canonicalManifest(kind, entry, entries) {
        return require('../../../src/next/kernel/canonicalValue').canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
            kind, entry, files: entries.map(row => ({ path: row.path,
                media_type: row.path.endsWith('.json') ? 'application/json' : 'text/javascript', sha256: hash(row.bytes) })) });
    }
    const child = admit(buildMetricChildCapsule().source, 'tcb', 'bootstrap.js');
    const metrics = new Map(buildAvailableMetricArtifacts().built.map(row => [row.evaluator_id, admit(row.source, 'metric', 'bundle.js')]));
    const oracle = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/financasbot-next/golden-claim-oracles-v1.json'), 'utf8'));
    let executed = 0; let predicates = 0; let selections = 0;
    for (const graph of graphs.filter(graph => Object.values(graph.nodes).every(node => node.binding === 'snapshot'))) {
        const transport = plan.projectProofTransport({ fact_key: graph.fact_key });
        assert.equal(transport.stage, 'isolated_proof_transport_only'); assert.equal(transport.graph_accepted, false);
        const targets = new Set(graph.selections.map(selection => selection.selected_set));
        assert.equal(transport.config.proofSets.some(set => targets.has(set.name)), false);
        assert.deepEqual(transport.config.proofSelections.map(({ candidate_set, selected_set }) => [candidate_set, selected_set]),
            graph.selections.map(({ candidate_set, selected_set }) => [candidate_set, selected_set]));
        assert.deepEqual(Object.keys(transport.config).sort(), ['bindings', 'directLinks', 'proofParentEdges', 'proofParentMaterials', 'proofSelections', 'proofSets']);
        const built = buildPhaseProofProgram({ proof: plan.projectProofProgram({ fact_key: graph.fact_key }).input,
            derivation: plan.projectDerivationProgram({ fact_key: graph.fact_key }, phaseProfile).input }, phaseProfile);
        assert.equal(new Set(built.sourceHashes.map(row => row.path)).size, built.sourceHashes.length);
        assert.equal(built.sourceHashes.find(row => row.path === PROFILE_PATH).sha256, built.profileInput.sha256);
        const artifactReceipt = admit(built.source, 'proof', 'bundle.js', built.profileInput);
        assert.equal(artifactReceipt.observed_root, built.artifact_root);
        const claim = claims.find(row => row.fact_key === graph.fact_key);
        const metric = plan.projectMetricTransport({ fact_key: graph.fact_key });
        const result = await runAdmittedGraph({ childCapsuleReceipt: child, executionId: 'compiler-isolated-proof',
            invocationId: graph.fact_key, timeoutMs: 4000,
            derivation: { artifactReceipt: metrics.get(claim.evaluator_ref.evaluator_id), bindings: [],
                directGroups: metric.directGroups, nodeSets: metric.nodeSets, parentGroups: metric.parentGroups,
                derivationBindings: plan.projectDerivationBindings({ fact_key: graph.fact_key }) },
            proof: { ...transport.config, artifactReceipt } }).catch(error => { throw new Error(`${graph.fact_key}: ${error.message}`); });
        const { evidence_set_mode: derivationMode, ...expectedDerivation } = graph.trace_contract.derivation;
        const derivationCoverage = comparePhaseCoverage({ ...selectionInput(claim, graph, 'compiler-isolated-proof'),
            expected: expectedDerivation, trace: result.trace,
            operandSets: Object.entries(claim.operand_bindings).filter(([, row]) => row.kind === 'node_set')
                .map(([role, row]) => ({ role, aliases: row.aliases })),
            accessBindings: plan.observationMetadata({ fact_key: graph.fact_key, phase: 'derivation' }),
            measurements: [{ measurement: 'evaluator_artifact_root', observed: metrics.get(claim.evaluator_ref.evaluator_id).observed_root },
                { measurement: 'proof_engine_artifact_root', observed: artifactReceipt.observed_root }] });
        assert.equal(derivationCoverage.matched, true, `${graph.fact_key}/derivation: ${JSON.stringify(Object.fromEntries(
            Object.entries(derivationCoverage.components).filter(([, row]) => !row.matched).map(([name, row]) => [name, {
                errors: row.errors?.slice(0, 2), mismatches: row.mismatches?.slice(0, 2), unclassified: row.unclassified_sequences?.slice(0, 2) }])))}; unclassified=${JSON.stringify(derivationCoverage.event_coverage.filter(row => row.status !== 'covered').slice(0, 2))}`);
        assert.equal(derivationCoverage.graph_accepted, false);
        const split = graph.fact_key.lastIndexOf('#');
        assert.deepEqual(result.functional_result.value, oracle.turns[graph.fact_key.slice(0, split)].facts[Number(graph.fact_key.slice(split + 1)) - 1].value, graph.fact_key);
        assert.equal(result.proof_satisfied, true, graph.fact_key); assert.equal(result.graph_accepted, false);
        assert.ok(result.trace.proof_trace.some(event => event.operation === 'get'));
        const { evidence_set_mode, ...expected } = graph.trace_contract.proof;
        const coverage = comparePhaseCoverage({ executionId: 'compiler-isolated-proof', invocationId: graph.fact_key, phase: 'proof',
            trace: result.trace, expected, sets: graph.sets,
            bindings: transport.config.proofSelections.map(selection => ({ role: `proof/set/${selection.candidate_set}`,
                candidate_set: selection.candidate_set, selected_set: selection.selected_set })),
            operandSets: transport.config.proofSets.map(set => ({ role: `proof/set/${set.name}`, aliases: set.roster })),
            accessBindings: plan.observationMetadata({ fact_key: graph.fact_key, phase: 'proof' }),
            measurements: [{ measurement: 'proof_engine_artifact_root', observed: artifactReceipt.observed_root }] });
        assert.equal(coverage.matched, true, `${graph.fact_key}: ${JSON.stringify(Object.fromEntries(Object.entries(coverage.components)
            .filter(([, component]) => !component.matched).map(([name, component]) => [name, { errors: component.errors?.slice(0, 2),
                mismatches: component.mismatches?.slice(0, 2), unclassified: component.unclassified_sequences?.slice(0, 2) }])))}; unclassified=${JSON.stringify(coverage.event_coverage.filter(event => event.status !== 'covered').slice(0, 2))}`);
        assert.equal(coverage.graph_accepted, false);
        executed++; predicates += graph.predicates.length; selections += graph.selections.length;
    }
    assert.equal(executed, 73); assert.equal(selections, 73);
    t.diagnostic(`isolated_primary_graphs=${executed}; phases=${executed * 2}; predicates=${predicates}; selections=${selections}; exact_phase_coverage=true; graph_accepted=false`);
    assert.throws(() => plan.projectProofTransport({ fact_key: graphs[0].fact_key, expected_trace: [] }), /proof_transport_selector/);
    assert.throws(() => plan.projectProofTransport({ fact_key: 'S-99#1#1' }), /proof_transport_graph/);
});

test('N02G:PHASE-COMPOSITION-002 derivation composition does not reduce proof or infer mode from fact keys', async () => {
    const { plan, graphs, claims } = await snapshotAccessFixture(); const receipt = reviewedPhaseProfile();
    const profile = JSON.parse(fs.readFileSync(path.join(root, PROFILE_PATH), 'utf8'));
    let guarded = 0;
    for (const graph of graphs) {
        const selector = { fact_key: graph.fact_key }; const proof = plan.projectProofProgram(selector);
        const before = JSON.stringify(proof); const derived = plan.projectDerivationProgram(selector, receipt);
        const claim = claims.find(row => row.fact_key === graph.fact_key);
        const mode = profile.entries.find(row => row.evaluator_id === claim.evaluator_ref.evaluator_id
            && row.evaluator_version === claim.evaluator_ref.evaluator_version).derivation_mode;
        const bindings = plan.projectDerivationBindings(selector);
        const ids = new Set((mode === 'formula_plus_selection_guards' ? graph.selections : [])
            .filter(s => bindings.selections.some(b => b.candidate_set === s.candidate_set && b.selected_set === s.selected_set))
            .flatMap(s => [...s.selected_predicates, ...s.excluded.flatMap(row => row.predicates)]));
        assert.deepEqual(derived.input.predicates.map(row => row.id), proof.input.predicates.filter(row => ids.has(row.id)).map(row => row.id));
        assert.equal(derived.input.selections.length, 0); assert.equal(derived.graph_accepted, false);
        assert.equal(JSON.stringify(plan.projectProofProgram(selector)), before); assert.equal(proof.input.predicates.length, graph.predicates.length);
        if (mode === 'formula_plus_selection_guards') { guarded++; assert.ok(ids.size); }
    }
    assert.equal(guarded, 11);
    assert.throws(() => plan.projectDerivationProgram({ fact_key: graphs[0].fact_key }), /phase_profile_receipt/);
    assert.throws(() => plan.projectDerivationProgram({ fact_key: graphs[0].fact_key }, {}), /phase_profile_receipt/);
});

test('N02G:PHASE-COMPOSITION-003 generated namespaces and roster order preserve signature-based composition', async () => {
    const validation = await validators(); const receipt = reviewedPhaseProfile();
    const { buildPhaseProofProgram } = await import('../../../scripts/agent/lowerNextProofProgram.mjs');
    for (const factKey of ['S-11#1#1', 'M-03#1#1']) for (const variation of ['namespace', 'order']) {
        const f = fixture(); const graphEntry = f.entries.find(row => row.path === graphPath);
        const corpus = JSON.parse(graphEntry.bytes); const graph = corpus.graphs.find(row => row.fact_key === factKey);
        const claimEntry = f.entries.find(row => row.path === corpus.claim_contract.path);
        const claims = JSON.parse(claimEntry.bytes); const claim = claims.claims.find(row => row.fact_key === factKey);
        if (variation === 'namespace') {
            const names = [...Object.keys(graph.nodes), ...graph.edges.map(edge => edge.id), ...Object.keys(graph.sets)];
            const rename = new Map(names.map((name, i) => [name, `renamed_${i}`]));
            // Rename local references, not material kinds, registry roles,
            // payload literals or field paths that happen to share a name.
            const semantic = new Set(['kind', 'ref_id', 'version', 'roles', 'role_id', 'semantic_role',
                'value', 'value_type', 'segments', 'metric', 'evaluator_id', 'type']);
            const rewrite = (value, key = '') => typeof value === 'string'
                ? semantic.has(key) || key === 'field' ? value : rename.get(value) || value
                : Array.isArray(value) ? value.map(child => rewrite(child, key)) : value && typeof value === 'object'
                    ? Object.fromEntries(Object.entries(value).map(([field, child]) => [field, rewrite(child, field)])) : value;
            const rewritten = rewrite(graph);
            for (const dictionary of ['nodes', 'sets']) rewritten[dictionary] = Object.fromEntries(
                Object.entries(rewritten[dictionary]).map(([name, row]) => [rename.get(name), row]));
            for (const [name, node] of Object.entries(graph.nodes)) assert.equal(rewritten.nodes[rename.get(name)].kind, node.kind);
            corpus.graphs[corpus.graphs.indexOf(graph)] = rewritten;
            claims.claims[claims.claims.indexOf(claim)] = rewrite(claim);
        } else {
            for (const selection of graph.selections) {
                const before = JSON.stringify(graph.sets[selection.candidate_set]);
                for (const binding of Object.values(claim.operand_bindings)) {
                    if (binding.kind === 'node_set' && JSON.stringify(binding.aliases) === before) binding.aliases.reverse();
                }
                graph.sets[selection.candidate_set].reverse(); graph.sets[selection.selected_set].reverse();
            }
            graph.edges.reverse();
        }
        claimEntry.bytes = Buffer.from(JSON.stringify(claims)); corpus.claim_contract.hash = hash(claimEntry.bytes);
        graphEntry.bytes = Buffer.from(JSON.stringify(corpus));
        for (const entry of [claimEntry, graphEntry]) f.authority.find(row => row.path === entry.path).sha256 = hash(entry.bytes);
        const plan = compileSnapshotAccess(admitPackage(f), validation); const selector = { fact_key: factKey };
        const derivation = plan.projectDerivationProgram(selector, receipt).input;
        const proof = plan.projectProofProgram(selector).input;
        assert.equal(proof.predicates.length, graph.predicates.length);
        assert.equal(plan.projectDerivationBindings(selector).selections.length, graph.selections.length);
        assert.equal(derivation.predicates.length > 0, factKey === 'S-11#1#1');
        const built = buildPhaseProofProgram({ derivation, proof }, receipt);
        assert.equal(built.derivationPredicateCount, derivation.predicates.length);
        assert.equal(built.predicateCount, proof.predicates.length);
        assert.equal(built.profileInput.sha256, require('../../../src/next/provenance/phaseCompositionProfile').REVIEWED_PROFILE_SHA256);
        assert.equal(built.executable, false);
    }
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
