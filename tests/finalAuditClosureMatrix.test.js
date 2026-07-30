const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    REQUIRED_GATE_IDS,
    loadManifest,
    normalizeVerdict,
    validateClosureManifest
} = require('../scripts/runFinalAuditClosureMatrix');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH =
    'docs/audit/final-consolidated-closure-manifest.json';

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

test('AUDIT-FINAL-01 validates every required closure against the current Git history', () => {
    const manifest = loadManifest(REPO_ROOT, MANIFEST_PATH);
    const report = validateClosureManifest({
        repoRoot: REPO_ROOT,
        manifest
    });
    assert.equal(report.closures, REQUIRED_GATE_IDS.length);
    assert.equal(report.closures, 29);
    assert.equal(report.documented_hashes, 27);
    assert.deepEqual(report.legacy_hash_bindings, [
        'AUTH-01',
        'C-02_WGL-01'
    ]);
    assert.equal(report.all_ancestors, true);
    assert.equal(report.all_go_signals, true);
});

test('AUDIT-FINAL-01 fails closed when a required gate disappears', () => {
    const manifest = clone(loadManifest(REPO_ROOT, MANIFEST_PATH));
    manifest.closures.pop();
    assert.throws(
        () => validateClosureManifest({
            repoRoot: REPO_ROOT,
            manifest
        }),
        /final_audit_required_gate_set_mismatch/
    );
});

test('AUDIT-FINAL-01 rejects non-immutable hashes before invoking Git', () => {
    const manifest = clone(loadManifest(REPO_ROOT, MANIFEST_PATH));
    manifest.closures[0].candidate_hash = 'HEAD';
    assert.throws(
        () => validateClosureManifest({
            repoRoot: REPO_ROOT,
            manifest,
            git: () => 'a'.repeat(40)
        }),
        /final_audit_hash_invalid:AUTH-01/
    );
});

test('AUDIT-FINAL-01 recognizes normalized independent GO signals', () => {
    assert.equal(
        normalizeVerdict('GO TÉCNICO LOCAL').includes('GO TECNICO LOCAL'),
        true
    );
    assert.equal(
        normalizeVerdict('GO local formal').includes('GO LOCAL FORMAL'),
        true
    );
});
