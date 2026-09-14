'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { canonicalValue } = require('../../../src/next/kernel/canonicalValue');
const { admitArtifact, artifactContents } = require('../../../src/next/provenance/artifactLoader');

const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function fixture() {
    const entries = [
        { path: 'bundle.js', bytes: Buffer.from('(function run() { return 7; })\n') },
        { path: 'profile.json', bytes: Buffer.from('{"mode":"synthetic"}\n') }
    ];
    const manifest = { format: 'financasbot.provenance.artifact', version: 1,
        kind: 'metric', entry: 'bundle.js', files: entries.map(({ path, bytes }) => ({
            path, media_type: path.endsWith('.js') ? 'text/javascript' : 'application/json', sha256: hash(bytes)
        })) };
    return seal({ entries, manifest });
}
// Test-only build authority. Admission must never derive its expected root this way.
function seal(f) {
    f.manifestBytes = Buffer.from(canonicalValue(f.manifest));
    f.expectedRoot = hash(f.manifestBytes);
    return f;
}
const admit = f => admitArtifact({ manifestBytes: f.manifestBytes, entries: f.entries, expectedRoot: f.expectedRoot });

test('N02G:ARTIFACT-001 admits exact captured bytes, not an executable authority', () => {
    const f = fixture(); const result = admit(f); const contents = artifactContents(result);
    assert.equal(result.stage, 'admitted_artifact_bytes_only');
    assert.equal(result.executable, false);
    assert.equal(result.observed_root, f.expectedRoot);
    assert.equal(contents.entry, 'bundle.js');
    assert.equal(contents.files[0].source, f.entries[0].bytes.toString('utf8'));
    assert.equal(contents.files.length, 2);
    assert.ok(Object.isFrozen(contents.files[0]));
    assert.ok(Object.isFrozen(result.measurements));
    assert.equal(Object.hasOwn(result, 'execute'), false);
    assert.equal(Object.hasOwn(result, 'expectedRoot'), false);
});

test('N02G:ARTIFACT-002 every bundle/profile byte is bound, including line endings', () => {
    for (let i = 0; i < 2; i++) {
        for (const change of [s => s + ' ', s => s.replace(/\n/g, '\r\n'), s => s.replace(/7|synthetic/, '8')]) {
            const f = fixture(); f.entries[i].bytes = Buffer.from(change(f.entries[i].bytes.toString()));
            assert.throws(() => admit(f), /artifact_digest_mismatch/);
        }
    }
});

test('N02G:ARTIFACT-003 repairing a leaf digest cannot bypass the frozen root', () => {
    const f = fixture(); f.entries[0].bytes = Buffer.from('changed');
    f.manifest.files[0].sha256 = hash(f.entries[0].bytes);
    f.manifestBytes = Buffer.from(canonicalValue(f.manifest));
    assert.throws(() => admit(f), /artifact_root_mismatch/);
    const g = fixture(); g.expectedRoot = 'sha256:' + '0'.repeat(64);
    assert.throws(() => admit(g), /artifact_root_mismatch/);
});

test('N02G:ARTIFACT-004 inventory is exact and independent of input entry order', () => {
    for (const mutate of [f => f.entries.pop(), f => f.entries.push({ path: 'extra.node', bytes: Buffer.from('x') }),
        f => { f.entries[1] = f.entries[0]; }, f => { f.entries[1].path = 'absent.json'; }]) {
        const f = fixture(); mutate(f); assert.throws(() => admit(f), /artifact_inventory_/);
    }
    const f = fixture(); f.entries.reverse();
    assert.deepEqual(artifactContents(admit(f)).files.map(x => x.path), ['bundle.js', 'profile.json']);
});

test('N02G:ARTIFACT-005 manifest is canonical with closed fields and a known format', () => {
    for (const mutate of [f => { f.manifest.extra = true; }, f => { f.manifest.version = 2; },
        f => { f.manifest.format = 'authoring'; }, f => { f.manifest.kind = 'unknown'; },
        f => { f.manifest.files[0].url = 'unused'; }, f => { f.manifest.files.reverse(); }]) {
        const f = fixture(); mutate(f); seal(f); assert.throws(() => admit(f), /artifact_/);
    }
    const f = fixture(); f.manifestBytes = Buffer.from(JSON.stringify(f.manifest, null, 2));
    f.expectedRoot = hash(f.manifestBytes);
    assert.throws(() => admit(f), /artifact_manifest_noncanonical/);
});

test('N02G:ARTIFACT-006 paths, case aliases and entry point fail closed', () => {
    for (const path of ['../x.js', '/x.js', 'C:/x.js', 'a\\b.js', 'a//b.js', 'a/./b.js', 'a/%2e.js',
        'a/x.', 'CON.js', 'a/Lpt1.json']) {
        const f = fixture(); f.entries[0].path = path; f.manifest.files[0].path = path; f.manifest.entry = path;
        seal(f); assert.throws(() => admit(f), /artifact_path_invalid/);
    }
    for (const entry of ['missing.js', 'profile.json']) {
        const f = fixture(); f.manifest.entry = entry; seal(f);
        assert.throws(() => admit(f), /artifact_entry_invalid/);
    }
    const f = fixture(); f.manifest.files[1].path = 'BUNDLE.js'; seal(f);
    assert.throws(() => admit(f), /artifact_inventory_duplicate/);
});

test('N02G:ARTIFACT-007 matching roots do not admit malformed UTF8 or unsupported files', () => {
    for (const bytes of [Buffer.from([0xff]), Buffer.from([0xc0, 0xaf])]) {
        const f = fixture(); f.entries[0].bytes = bytes; f.manifest.files[0].sha256 = hash(bytes); seal(f);
        assert.throws(() => admit(f), /artifact_utf8_invalid/);
    }
    const f = fixture(); f.manifest.files[0].media_type = 'application/octet-stream'; seal(f);
    assert.throws(() => admit(f), /artifact_media_type_invalid/);
    const g = fixture(); g.manifestBytes = Buffer.from('{'); g.expectedRoot = hash(g.manifestBytes);
    assert.throws(() => admit(g), /artifact_manifest_invalid/);
});

test('N02G:ARTIFACT-008 caller mutation cannot change captured source or measurements', () => {
    const f = fixture(); const original = f.entries[0].bytes.toString(); const result = admit(f);
    f.entries[0].bytes.fill(0); f.manifestBytes.fill(0); f.entries.length = 0;
    assert.equal(artifactContents(result).files[0].source, original);
    assert.throws(() => { artifactContents(result).files[0].source = 'changed'; }, TypeError);
    assert.throws(() => artifactContents(structuredClone(result)), /artifact_not_admitted/);
    assert.throws(() => artifactContents({ stage: result.stage }), /artifact_not_admitted/);
});

test('N02G:ARTIFACT-009 admission never runs candidate source', () => {
    const f = fixture(); f.entries[0].bytes = Buffer.from('throw new Error("must_not_execute");');
    f.manifest.files[0].sha256 = hash(f.entries[0].bytes); seal(f);
    assert.equal(admit(f).executable, false);
});

test('N02G:ARTIFACT-010 object accessors/proxies and sparse inventories are rejected without callbacks', () => {
    let calls = 0;
    const f = fixture(); Object.defineProperty(f.entries[0], 'bytes', { enumerable: true, get() { calls++; return Buffer.from('x'); } });
    assert.throws(() => admit(f), /artifact_shape_invalid/);
    const g = fixture(); g.entries = new Proxy(g.entries, { get() { calls++; throw Error('trap'); } });
    assert.throws(() => admit(g), /artifact_shape_invalid/);
    const h = fixture(); delete h.entries[0]; assert.throws(() => admit(h), /artifact_shape_invalid/);
    assert.equal(calls, 0);
});

test('N02G:ARTIFACT-011 entry, profile and manifest resource bounds are finite', () => {
    for (const mutate of [f => { f.expectedRoot = 'placeholder'; },
        f => { f.manifestBytes = Buffer.alloc(256 * 1024 + 1); },
        f => { f.entries[0].bytes = Buffer.alloc(8 * 1024 * 1024 + 1); },
        f => { f.entries[0].bytes = 'not bytes'; }]) {
        const f = fixture(); mutate(f); assert.throws(() => admit(f), /artifact_(digest_invalid|bytes_invalid|size_limit)/);
    }
});

test('N02G:ARTIFACT-012 Buffer shadow properties cannot execute during capture', () => {
    const f = fixture(); let calls = 0;
    for (const bytes of [f.manifestBytes, ...f.entries.map(item => item.bytes)]) {
        for (const key of ['length', 'byteLength', 'byteOffset', 'buffer', 'copy', 'valueOf', Symbol.iterator]) {
            Object.defineProperty(bytes, key, { get() { calls++; throw Error('buffer_callback'); } });
        }
    }
    assert.equal(admit(f).stage, 'admitted_artifact_bytes_only');
    assert.equal(calls, 0);
});

test('N02G:ARTIFACT-013 raw manifest byte identity also binds its kind and entry', () => {
    for (const mutate of [f => { f.manifest.kind = 'proof'; }, f => { f.manifest.entry = 'other.js'; }]) {
        const f = fixture(); mutate(f); f.manifestBytes = Buffer.from(canonicalValue(f.manifest));
        assert.throws(() => admit(f), /artifact_root_mismatch/);
    }
});
