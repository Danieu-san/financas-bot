'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { propose, loadImmutableDocuments, claimAncestors } = require('../../../docs/audit-evidence/n02g-parent-observation/prepare-parent-observation.cjs');
const fixture = () => loadImmutableDocuments().documents;

test('N02G:PARENT-AUTHORING-001 reconstructs only declared read closures without runtime input', () => {
    const documents = fixture(); const before = JSON.stringify(documents);
    const { proposal, candidate } = propose(documents);
    assert.equal(JSON.stringify(documents), before);
    assert.equal(proposal.graph_count, 76);
    assert.equal(proposal.counts.parent_derivation_reads, 6);
    assert.equal(proposal.counts.parent_proof_reads, 30);
    assert.equal(proposal.counts.parent_proof_structural, 54);
    assert.ok(proposal.counts.claim_record_derivation > 0);
    assert.ok(proposal.counts.claim_record_proof > 0);
    const reversed = structuredClone(candidate);
    for (const delta of proposal.changes) {
        const graph = reversed.graphs.find(item => item.fact_key === delta.fact_key);
        for (const phase of ['derivation', 'proof']) {
            const trace = graph.trace_contract[phase];
            const allowed = delta[phase];
            if (allowed.added_claim_reads) assert.deepEqual(
                trace.required_claim_reads.splice(0, allowed.added_claim_reads.length), allowed.added_claim_reads);
            if (allowed.added_reads) assert.deepEqual(trace.required_reads.splice(-allowed.added_reads.length), allowed.added_reads);
            if (allowed.added_structural) assert.deepEqual(trace.required_structural.splice(-allowed.added_structural.length), allowed.added_structural);
        }
    }
    assert.deepEqual(reversed, documents['graphs-v2.json']);
});

test('N02G:PARENT-AUTHORING-002 duplicate graph and unmodeled parent roster fail closed', () => {
    const duplicates = fixture();
    duplicates['graphs-v2.json'].graphs[1] = duplicates['graphs-v2.json'].graphs[0];
    assert.throws(() => propose(duplicates), /graphs_duplicate/);
    const documents = fixture();
    const parent = documents['graphs-v2.json'].graphs.find(graph => graph.fact_key === 'M-01#1#1');
    parent.nodes.unapproved_parent = { binding: 'validated_parent', kind: 'derived_claim', fact_key: 'M-14#1#1' };
    assert.throws(() => propose(documents));
    const hidden = fixture();
    hidden['claims-v2.json'].claims.find(claim => claim.fact_key === 'M-14#1#1').operand_bindings.hidden =
        { kind: 'parent_claim', fact_key: 'M-01#1#1' };
    assert.throws(() => propose(hidden), /parent_not_primary/);
});

test('N02G:PARENT-AUTHORING-003 ancestors come from schema and authored paths, with no scalar or array escape', () => {
    const documents = fixture(); const schema = documents['claim-contract.schema.json'];
    const claim = documents['claims-v2.json'].claims[0];
    const reads = [{ segments: ['period', 'kind'] }];
    assert.deepEqual(claimAncestors(reads, claim, schema), [{ segments: ['period'] }]);
    assert.deepEqual(claimAncestors([{ segments: ['period'] }, ...reads], claim, schema), []);
    assert.throws(() => claimAncestors([...reads, ...reads], claim, schema), /duplicate/);
    assert.throws(() => claimAncestors([{ segments: ['period', 'unknown'] }], claim, schema), /claim_path/);
    assert.throws(() => claimAncestors([{ segments: ['metric', 'constructor'] }], claim, schema), /scalar_traversal/);
    const comparison = documents['claims-v2.json'].claims.find(item => item.subject.kind === 'person_comparison');
    assert.throws(() => claimAncestors([{ segments: ['subject', 'person_ids', '0'] }], comparison, schema), /scalar_traversal/);
});

test('N02G:PARENT-AUTHORING-004 omitted material field or altered parental baseline cannot pass', () => {
    const missing = fixture();
    delete missing['material-field-registry-v1.json'].kinds.derived_claim.fields.parents;
    assert.throws(() => propose(missing));
    const drift = fixture();
    const graph = drift['graphs-v2.json'].graphs.find(item => item.fact_key === 'M-01#1#3');
    graph.trace_contract.proof.required_reads.push({ node: 'unexpected', segments: ['result', 'value'] });
    // A generic unrelated authored read remains an obligation; it is never erased.
    const { candidate } = propose(drift);
    assert.ok(candidate.graphs.find(item => item.fact_key === graph.fact_key)
        .trace_contract.proof.required_reads.some(read => read.node === 'unexpected'));
    const parentAlias = Object.entries(graph.nodes).find(([, node]) => node.binding === 'validated_parent')[0];
    graph.trace_contract.derivation.required_reads.push({ node: parentAlias, segments: ['result', 'value'] });
    assert.throws(() => propose(drift));
});
