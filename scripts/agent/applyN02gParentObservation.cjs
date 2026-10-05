'use strict';

// Mechanical application of the independently reviewed normative proposal.
// No trace, evaluator output or oracle is an input. Applying it produces a
// code candidate; it does not approve the runtime or issue acceptance receipts.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { propose, loadImmutableDocuments, BASE } = require('../../docs/audit-evidence/n02g-parent-observation/prepare-parent-observation.cjs');
const root = path.resolve(__dirname, '../..');
const graphPath = path.join(root, 'docs/contracts/next/provenance-v2/graphs-v2.json');
const proposalPath = path.join(root, 'docs/audit-evidence/n02g-parent-observation/parent-observation-proposal.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function checkedCandidate() {
    const { documents, sources } = loadImmutableDocuments();
    const { proposal, candidate } = propose(documents);
    assert.deepEqual(JSON.parse(fs.readFileSync(proposalPath, 'utf8')), { ...proposal, sources });
    assert.equal(proposal.proposed_semantic_sha256,
        '27697ef6b65d1abbb45e7da253d01b07e121955386a3346f6f7a7806b75eef27');
    return { documents, candidate, proposal };
}

function verifyApplied(actual) {
    const { candidate } = checkedCandidate();
    assert.deepEqual(actual, candidate);
    return true;
}

if (require.main === module) {
    const mode = process.argv[2];
    assert.ok(['--apply', '--check'].includes(mode) && process.argv.length === 3);
    const { documents, candidate, proposal } = checkedCandidate();
    const current = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    if (mode === '--apply') {
        // Refuse partial application, another branch's corpus or a dirty
        // semantic edit. Byte formatting is mechanical; identity is explicit.
        assert.deepEqual(current, documents['graphs-v2.json']);
        fs.writeFileSync(graphPath, JSON.stringify(candidate) + '\n', 'utf8');
    }
    verifyApplied(JSON.parse(fs.readFileSync(graphPath, 'utf8')));
    console.log(JSON.stringify({ valid: true, base: BASE, mode, graphs: 76,
        semantic_sha256: hash(JSON.stringify(candidate)), counts: proposal.counts,
        code_approved: false, global_go: false }));
}

module.exports = { checkedCandidate, verifyApplied };
