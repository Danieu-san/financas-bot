const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
    LEGACY_HASH_BINDING_EXCEPTIONS,
    REQUIRED_GATE_IDS,
    hasPositiveGoSignal,
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

test('AUDIT-FINAL-01 recognizes only positive independent GO signals', () => {
    assert.equal(hasPositiveGoSignal('GO TÉCNICO LOCAL'), true);
    assert.equal(hasPositiveGoSignal('GO local formal'), true);
    assert.equal(hasPositiveGoSignal('NO-GO TÉCNICO LOCAL'), false);
    assert.equal(hasPositiveGoSignal('NO GO local formal'), false);
    assert.equal(
        hasPositiveGoSignal(
            'Candidato anterior: NO-GO TÉCNICO LOCAL.\n' +
            'Veredito independente: GO TÉCNICO LOCAL.'
        ),
        true
    );
    assert.equal(
        normalizeVerdict('GO TÉCNICO LOCAL'),
        'GO TECNICO LOCAL'
    );
});

test('AUDIT-FINAL-01 fixes the two legacy hash exceptions by identity', () => {
    assert.deepEqual(
        Object.keys(LEGACY_HASH_BINDING_EXCEPTIONS),
        ['AUTH-01', 'C-02_WGL-01']
    );

    const extraException = clone(loadManifest(REPO_ROOT, MANIFEST_PATH));
    extraException.closures.find(closure =>
        closure.id === 'OPS-03').hash_documented = false;
    assert.throws(
        () => validateClosureManifest({
            repoRoot: REPO_ROOT,
            manifest: extraException,
            git: () => ''
        }),
        /final_audit_legacy_hash_binding_set_mismatch:OPS-03/
    );

    const removedException = clone(loadManifest(REPO_ROOT, MANIFEST_PATH));
    removedException.closures.find(closure =>
        closure.id === 'AUTH-01').hash_documented = true;
    assert.throws(
        () => validateClosureManifest({
            repoRoot: REPO_ROOT,
            manifest: removedException,
            git: () => ''
        }),
        /final_audit_legacy_hash_binding_set_mismatch:AUTH-01/
    );

    const changedIdentity = clone(loadManifest(REPO_ROOT, MANIFEST_PATH));
    changedIdentity.closures.find(closure =>
        closure.id === 'C-02_WGL-01').candidate_hash = 'a'.repeat(40);
    assert.throws(
        () => validateClosureManifest({
            repoRoot: REPO_ROOT,
            manifest: changedIdentity,
            git: () => ''
        }),
        /final_audit_legacy_hash_binding_identity_mismatch:C-02_WGL-01/
    );
});
