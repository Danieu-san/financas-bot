'use strict';
// Mechanical application of an independently reviewed immutable proposal.
// No evaluator, recorder, actual, oracle or observed trace is loaded.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const prefix = 'docs/contracts/next/provenance-v2/';
const graphPath = prefix + 'graphs-v2.json';
const proposalPath = 'docs/audit-evidence/n02g-causal-authoring-profile/account-installment-observation-proposal.json';
const base = '207ca56b87381d69a922224332fcdda3a629d822';
const proposalCommit = '629a6871ffbdaa581fb64bd59165589bae04c92a';
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const gitText = (commit, file) => execFileSync(process.env.EXHAUSTIVE_LOCAL_GIT_PATH || 'git',
    ['cat-file', 'blob', `${commit}:${file}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: root }
    }).replaceAll('\r\n', '\n');
function reviewedCorpus() {
    const text = gitText(proposalCommit, proposalPath);
    assert.equal(sha(text), 'sha256:2660302e20b3b6c1be337472849aa5453735b5ad9aeeaddbac83b6978e2a23a3');
    const proposal = JSON.parse(text);
    const sourceText = gitText(base, graphPath);
    assert.equal(sha(sourceText), proposal.source_corpus_sha256_lf);
    assert.equal(proposal.records.length, 11);
    const original = JSON.parse(sourceText); const expected = structuredClone(original);
    const keys = new Set();
    for (const record of proposal.records) {
        assert.equal(keys.has(record.fact_key), false); keys.add(record.fact_key);
        const matches = expected.graphs.filter(g => g.fact_key === record.fact_key);
        assert.equal(matches.length, 1);
        assert.deepEqual(matches[0].trace_contract.derivation, record.current_derivation);
        // Claim reads are an unordered inventory; the approved composer sorts it.
        assert.deepEqual(record.current_derivation.required_claim_reads.map(JSON.stringify).sort(),
            record.proposed_derivation.required_claim_reads.map(JSON.stringify).sort());
        assert.deepEqual(record.current_derivation.required_selections, record.proposed_derivation.required_selections);
        // selected_nodes is the union inventory, not the ordered selected_set.
        // The graph's sets/selections themselves remain byte-for-byte untouched.
        assert.deepEqual([...record.current_derivation.selected_nodes].sort(),
            [...record.proposed_derivation.selected_nodes].sort());
        matches[0].trace_contract.derivation = structuredClone(record.proposed_derivation);
    }
    assert.equal(original.graphs.length, 76);
    let preserved = 0;
    for (let i = 0; i < original.graphs.length; i++) {
        const before = original.graphs[i]; const after = expected.graphs[i];
        assert.deepEqual(before.trace_contract.proof, after.trace_contract.proof);
        if (!keys.has(before.fact_key)) { assert.deepEqual(before, after); preserved++; }
        else { const restored = structuredClone(after); restored.trace_contract.derivation = before.trace_contract.derivation;
            assert.deepEqual(restored, before); }
    }
    assert.equal(preserved, 65);
    return { original, expected, proposal };
}
function validateProtected(proposal) {
    for (const [file, pin] of Object.entries(proposal.documents)) {
        if (file === graphPath) continue;
        const current = fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n');
        assert.equal(sha(current), pin.sha256_lf, file);
    }
}
if (require.main === module) {
    assert.equal(process.argv.length, 3); const mode = process.argv[2];
    assert.ok(['--apply', '--check'].includes(mode));
    const { original, expected, proposal } = reviewedCorpus(); validateProtected(proposal);
    const file = path.join(root, graphPath); const current = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (mode === '--apply') {
        // Refuse dirty/stale/repeated application; nothing is written before all guards.
        assert.deepEqual(current, original);
        fs.writeFileSync(file, JSON.stringify(expected) + '\n');
    } else assert.deepEqual(current, expected);
    console.log(JSON.stringify({ stage: 'normative_application_only', graph_accepted: false,
        applied: 11, preserved_graphs: 65, preserved_proofs: 76,
        sha256_lf: sha(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')) }));
}
module.exports = { reviewedCorpus };
