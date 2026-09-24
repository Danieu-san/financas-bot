'use strict';

// Read-only source verification; --write-new only exports synthetic review artifacts.
// Does not execute product code, tests, or authenticate saved execution summaries.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const graphPath = 'docs/contracts/next/provenance-v2/graphs-v2.json';
const candidate = '98de8ef46ab2e0c3ee58a326a073322367cedbdf';
const parent = 'e7b78e3e94f540ed685d4d35d82aac9b6de8246a';
const targets = ['S-08#1#1', 'M-04#1#3', 'N-07#1#1'];
const sourcePins = {
    before: { commit: parent, blob: '6e3a07aaff8590ad83fc91dce98be1bf3e381fbf',
        sha256: '9a515d6b11dc9251f4cd01eeec0c108f6266b174c3789993ec67add7d6cc4cbb' },
    after: { commit: candidate, blob: '8661d1c6bf4b11a8d727d304346f7a815d9e9fff',
        sha256: '6ca2c7de51c3a48109ffb6b6096f31981e3058fdae16ed8078ad47aa3a59501c' }
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const blobId = bytes => createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
function recordBytes(value) {
    const format = (item, depth = 0) => {
        const compact = JSON.stringify(item);
        if (compact.length <= 180) return compact;
        const indent = '  '.repeat(depth); const child = indent + '  ';
        if (Array.isArray(item)) return '[\n' + item.map(v => child + format(v, depth + 1)).join(',\n') + '\n' + indent + ']';
        if (item && typeof item === 'object') return '{\n' + Object.entries(item).map(([k, v]) => child + JSON.stringify(k) + ': ' + format(v, depth + 1)).join(',\n') + '\n' + indent + '}';
        return compact;
    };
    return Buffer.from(format(value) + '\n');
}
const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

function build() {
    assert.equal(git(['show', '-s', '--format=%P', candidate]).toString().trim(), parent, 'candidate_parent');
    const sources = {}; const files = {}; const records = [];
    for (const [side, pin] of Object.entries(sourcePins)) {
        const bytes = git(['show', `${pin.commit}:${graphPath}`]);
        assert.equal(blobId(bytes), pin.blob, `${side}_blob`);
        assert.equal(sha256(bytes), pin.sha256, `${side}_source_digest`);
        const text = bytes.toString('utf8'); const corpus = JSON.parse(text);
        assert.equal(corpus.graphs.length, 76);
        assert.equal(new Set(corpus.graphs.map(g => g.fact_key)).size, 76, 'duplicate_fact_key');
        sources[side] = { corpus, bytes };
        for (const factKey of targets) {
            const graph = corpus.graphs.find(g => g.fact_key === factKey);
            assert.ok(graph, `${side}_missing_${factKey}`);
            const lines = text.split('\n').map((line, index) => ({ line, number: index + 1 })).filter(item => {
                try { return JSON.parse(item.line.trim().replace(/,$/, '')).fact_key === factKey; } catch { return false; }
            });
            assert.equal(lines.length, 1, 'original_record_line_not_unique');
            assert.deepEqual(JSON.parse(lines[0].line.trim().replace(/,$/, '')), graph);
            const name = `${factKey.replaceAll('#', '-')}.${side}.json`;
            files[name] = recordBytes(graph);
            records.push({ fact_key: factKey, side, source_commit: pin.commit, file: name,
                bytes: files[name].length, sha256: sha256(files[name]),
                original_record_line: lines[0].number,
                original_line_sha256: sha256(Buffer.from(lines[0].line)),
                original_line_bytes: Buffer.byteLength(lines[0].line) });
        }
    }
    // Fixed reviewed delta; never derived from runtime, actual trace, or saved verdict.
    const expected = structuredClone(sources.before.corpus);
    for (const factKey of targets) {
        const graph = expected.graphs.find(g => g.fact_key === factKey);
        for (const node of ['evt_transfer_out', 'evt_transfer_in']) {
            const phase = graph.trace_contract.derivation;
            assert.ok(!phase.required_reads.some(r => r.node === node && JSON.stringify(r.segments) === '["transfer_pair"]'));
            assert.ok(!phase.required_structural.some(r => r.node === node && r.operation === 'has' && JSON.stringify(r.segments) === '["transfer_pair"]'));
            phase.required_reads.push({ node, segments: ['transfer_pair'] });
            phase.required_structural.push({ node, operation: 'has', segments: ['transfer_pair'] });
        }
    }
    assert.deepEqual(sources.after.corpus, expected, 'delta_not_exact');
    const wideEvidence = JSON.parse(git(['show', `${candidate}:docs/audit-evidence/n02g-causal-authoring-profile/transfer-scope-validation.json`]));
    const tested = [graphPath, 'tests/next/provenance/authoringIndex.cases.js', 'tests/next/provenance/metricEffects.cases.js'];
    assert.deepEqual(wideEvidence.wide.candidate_files.map(f => f.path).sort(), tested.slice().sort());
    const testedFiles = wideEvidence.wide.candidate_files.map(file => {
        const bytes = git(['show', `${candidate}:${file.path}`]);
        const digest = sha256(bytes.toString('utf8').replaceAll('\r\n', '\n'));
        assert.equal(`sha256:${digest}`, file.lf_sha256, 'tested_candidate_bytes_mismatch');
        return { path: file.path, candidate_blob: blobId(bytes), lf_sha256: digest };
    });
    files['manifest.json'] = jsonBytes({ schema: 'n02g-transfer-scope-source-access-v1', candidate, parent,
        source_path: graphPath, source_pins: sourcePins, records, tested_files: testedFiles,
        scope: { complete_before_after_records: 6, changed_graphs: 3, unchanged_graphs: 73,
            added_reads: 6, added_has: 6, entire_corpus_deep_equality_except_exact_delta: true },
        limits: 'Readable complete synthetic records, tied to original immutable Git blobs. No execution authenticity claim, suite rerun, product change, or approval.' });
    return files;
}

function verify(files) {
    const expected = build();
    assert.deepEqual(Object.keys(files).sort(), Object.keys(expected).sort(), 'bundle_inventory');
    for (const name of Object.keys(expected)) assert.deepEqual(files[name], expected[name], `bundle_mismatch:${name}`);
    return { valid: true, candidate, parent, full_records: 6, changed_graphs: 3, unchanged_graphs: 73,
        added_reads: 6, added_has: 6, tested_file_hash_matches: 3, execution_authentication: false };
}

if (require.main === module) {
    const mode = process.argv[2]; assert.ok(['--write-new', '--check', '--self-test'].includes(mode) && process.argv.length === 3);
    const expected = build();
    if (mode === '--write-new') {
        for (const name of Object.keys(expected)) assert.ok(!fs.existsSync(path.join(__dirname, name)), 'existing_output');
        for (const [name, bytes] of Object.entries(expected)) fs.writeFileSync(path.join(__dirname, name), bytes, { flag: 'wx' });
    }
    const actual = Object.fromEntries(Object.keys(expected).map(name => [name, fs.readFileSync(path.join(__dirname, name))]));
    const result = verify(actual);
    if (mode === '--self-test') {
        const mutations = [
            bundle => { const g = JSON.parse(bundle['S-08-1-1.after.json']); g.trace_contract.derivation.required_reads.pop(); bundle['S-08-1-1.after.json'] = jsonBytes(g); },
            bundle => { bundle['M-04-1-3.after.json'] = bundle['M-04-1-3.before.json']; },
            bundle => { const m = JSON.parse(bundle['manifest.json']); m.candidate = parent; bundle['manifest.json'] = jsonBytes(m); },
            bundle => { delete bundle['N-07-1-1.before.json']; }
        ];
        for (const mutate of mutations) { const copy = { ...actual }; mutate(copy); assert.throws(() => verify(copy)); }
        result.negative_bundle_checks = mutations.length;
    }
    console.log(JSON.stringify(result));
}

module.exports = { build, verify };
