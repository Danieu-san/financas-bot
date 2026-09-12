'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { admitPackage, admittedDocuments } = require('../../../src/next/provenance/packageContract');

const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
function fixture() {
    const entries = [
        { path: 'contracts/graph.json', bytes: Buffer.from('{"stage":"authoring","graphs":[]}\n') },
        { path: 'contracts/registry.json', bytes: Buffer.from('{"entries":[]}\n') }
    ];
    // Test authority is independent of the admission function, never computed by it.
    const authority = entries.map(({ path, bytes }) => ({ path, sha256: digest(bytes) }));
    return { entries, authority };
}

test('N02G:PACKAGE-001 exact bytes admitted without execution or caller mutation', () => {
    const f = fixture();
    const result = admitPackage(f);
    assert.equal(result.stage, 'admitted_bytes_only');
    assert.equal(result.documents.length, 2);
    assert.equal(result.documents[0].value.stage, 'authoring');
    assert.ok(Object.isFrozen(result.documents[0].value.graphs));
    f.entries[0].bytes.fill(0);
    f.authority[0].sha256 = 'changed';
    assert.equal(result.documents[0].value.stage, 'authoring');
    assert.throws(() => { result.documents[0].value.stage = 'execution'; }, TypeError);
    assert.equal(Object.hasOwn(result, 'execute'), false);
    assert.equal(admittedDocuments(result), result.documents);
    assert.throws(() => admittedDocuments(structuredClone(result)), /package_not_admitted/);
});

test('N02G:PACKAGE-002 any missing, extra or duplicate entry fails', () => {
    for (const mutate of [
        f => f.entries.pop(),
        f => f.entries.push({ path: 'extra.node', bytes: Buffer.from('x') }),
        f => f.entries.push(f.entries[0]),
        f => f.authority.push(f.authority[0]),
        f => { f.entries[1].path = 'Contracts/Graph.json'; },
        f => { f.authority = []; }
    ]) {
        const f = fixture(); mutate(f);
        assert.throws(() => admitPackage(f), /package_/);
    }
});

test('N02G:PACKAGE-003 no implicit normalization or unmeasured byte changes', () => {
    for (const change of [b => Buffer.from(`${b} `), b => Buffer.from(b.toString().replace(/\n/g, '\r\n')),
        b => Buffer.from(b.toString().replace('authoring', 'execution'))]) {
        const f = fixture(); f.entries[0].bytes = change(f.entries[0].bytes);
        assert.throws(() => admitPackage(f), /package_digest_mismatch/);
    }
    const f = fixture(); f.authority[0].sha256 = 'sha256:' + '0'.repeat(64);
    assert.throws(() => admitPackage(f), /package_digest_mismatch/);
});

test('N02G:PACKAGE-004 paths cannot trigger resolution or alias the inventory', () => {
    for (const path of ['../x.json', '/x.json', 'C:/x.json', 'a\\b.json', 'a/./b.json',
        'a//b.json', 'https://x/a.json', 'a/%2e%2e/b.json']) {
        const f = fixture(); f.entries[0].path = path; f.authority[0].path = path;
        assert.throws(() => admitPackage(f), /package_path_invalid/);
    }
});

test('N02G:PACKAGE-005 invalid UTF8 or JSON fails even with matching digest', () => {
    for (const bytes of [Buffer.from([0xff]), Buffer.from('{'), Buffer.from('null')]) {
        const f = fixture(); f.entries[0].bytes = bytes; f.authority[0].sha256 = digest(bytes);
        assert.throws(() => admitPackage(f), /package_(utf8|json)_invalid/);
    }
});

test('N02G:PACKAGE-006 authority and entry shapes are closed', () => {
    for (const mutate of [
        f => { f.entries[0].bytes = '{}'; },
        f => { f.authority[0].sha256 = 'hash-placeholder'; },
        f => { f.authority[0].expected = true; },
        f => { f.entries[0].url = 'unused'; },
        f => { f.entries = null; },
        f => { f.extra = true; }
    ]) {
        const f = fixture(); mutate(f);
        assert.throws(() => admitPackage(f), /package_/);
    }
});
