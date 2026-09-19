'use strict';
// Inert extraction/preservation evidence. Does not execute or approve a graph.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const base = 'be520f4f0cf64812c80f0f4b9b8eefb2a5445189';
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const claimPath = 'docs/contracts/next/provenance-v2/claims-v2.json';
const changed = ['S-16#1#1', 'M-04#1#1', 'M-04#1#2', 'M-05#1#2', 'M-05#1#3', 'M-05#1#4'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonHash = value => sha(JSON.stringify(value));
function bytesAt(ref, file) {
    if (ref === 'worktree') return Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n'));
    assert.match(ref, /^[a-f0-9]{40}$/);
    return execFileSync('git', ['show', `${ref}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
}
function unique(rows) {
    assert.equal(new Set(rows.map(r => r.fact_key)).size, rows.length, 'duplicate_fact_key');
}
function derive(oldBytes, newBytes, claimBytes, oldClaimBytes) {
    assert.deepEqual(claimBytes, oldClaimBytes, 'claims_changed');
    const before = JSON.parse(oldBytes), after = JSON.parse(newBytes), claims = JSON.parse(claimBytes).claims;
    unique(before.graphs); unique(after.graphs); unique(claims);
    assert.equal(before.graphs.length, 76); assert.equal(after.graphs.length, 76);
    const permitted = structuredClone(before);
    for (const key of changed) {
        const graph = permitted.graphs.find(g => g.fact_key === key);
        assert.ok(graph, 'missing_graph');
        graph.trace_contract.derivation.required_selections = [];
        graph.trace_contract.derivation.selected_nodes = [];
    }
    // Full object equality: no other field of any of the 76 graphs can change.
    assert.deepEqual(after, permitted, 'unexpected_graph_delta');
    const records = changed.map(key => {
        const old = before.graphs.find(g => g.fact_key === key), graph = after.graphs.find(g => g.fact_key === key);
        const claim = claims.find(c => c.fact_key === key); assert.ok(claim, 'missing_claim');
        assert.equal(claim.claim_id, graph.claim_id);
        for (const s of graph.selections) {
            const bindings = Object.values(claim.operand_bindings);
            assert.equal(bindings.filter(b => b.kind === 'node_set'
                && JSON.stringify(b.aliases) === JSON.stringify(graph.sets[s.candidate_set])).length, 0);
            assert.ok(graph.sets[s.selected_set].length > 0);
            assert.ok(graph.sets[s.selected_set].every(alias => bindings.some(b => b.kind === 'node' && b.alias === alias)));
        }
        const selectionFields = phase => ({ required_selections: phase.required_selections, selected_nodes: phase.selected_nodes });
        return { fact_key: key, evaluator_ref: claim.evaluator_ref, operand_bindings: claim.operand_bindings,
            selections_sha256: jsonHash(graph.selections), sets: Object.fromEntries(graph.selections.flatMap(s =>
                [[s.candidate_set, graph.sets[s.candidate_set]], [s.selected_set, graph.sets[s.selected_set]]])),
            derivation_before: selectionFields(old.trace_contract.derivation),
            derivation_after: selectionFields(graph.trace_contract.derivation),
            preserved_derivation_nodes: graph.trace_contract.derivation.required_nodes,
            preserved_derivation_reads: graph.trace_contract.derivation.required_reads,
            proof_sha256: jsonHash(graph.trace_contract.proof), proof_preserved: true };
    });
    return { schema: 'n02g-selection-phase-evidence-v1', base,
        normalization: 'worktree CRLF to LF only; immutable git bytes unchanged',
        subobject_digest_encoding: 'UTF-8 JSON.stringify(parsed subobject), preserving property order',
        graphs_before_sha256: sha(oldBytes), graphs_after_sha256: sha(newBytes), claims_sha256: sha(claimBytes),
        graph_count: 76, changed_graphs: 6, untouched_graphs: 70, proof_preserved: 76, records };
}
function build(ref = 'worktree') {
    return derive(bytesAt(base, graphPath), bytesAt(ref, graphPath), bytesAt(ref, claimPath), bytesAt(base, claimPath));
}
function verify(expected, ref = 'worktree') {
    assert.deepEqual(build(ref), expected, 'extraction_mismatch');
    return { valid: true, graph_count: 76, changed_graphs: 6, untouched_graphs: 70,
        proof_preserved: 76, scope: 'extraction_and_preservation_only' };
}
if (require.main === module) {
    const ref = process.argv[2] || 'worktree';
    const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'focal-records.json'), 'utf8'));
    console.log(JSON.stringify(verify(expected, ref)));
}
module.exports = { build, derive, verify };
