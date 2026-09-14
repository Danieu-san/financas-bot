'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { projectClaimContext } = require('../../../src/next/provenance/claimContext');
const { createInstrumentedAccess } = require('../../../src/next/provenance/instrumentedAccess');
const schema = require('../../../docs/contracts/next/provenance-v2/claim-contract.schema.json');
const graphDoc = require('../../../docs/contracts/next/provenance-v2/graphs-v2.json');
const claims = require('../../../' + graphDoc.claim_contract.path).claims;

test('N02G:CONTEXT-001 all admitted claim descriptors have finite schema-driven handle shapes', () => {
    for (const claim of claims) {
        const projected = projectClaimContext(claim, schema); const events = [];
        const access = createInstrumentedAccess({ emit: e => events.push(e), bindings: [{ alias: 'claim', role: 'context', ...projected }] });
        const handle = access.handle('claim');
        assert.equal(handle.get('period').get('kind'), claim.period.kind);
        assert.equal(handle.get('subject').get('kind'), claim.subject.kind);
        assert.equal(handle.get('coverage'), claim.coverage);
        assert.equal(handle.has('filters'), Object.hasOwn(claim, 'filters'));
        assert.ok(events.length >= 5);
        assert.equal(Object.hasOwn(projected.value, 'operand_bindings'), false);
        access.revoke();
    }
    assert.equal(claims.length, 76);
});
test('N02G:CONTEXT-002 functional output and binding tables are not accessible from context', () => {
    const projected = projectClaimContext({ ...claims[0], result: 1200, trace: { reads: [] } }, schema);
    assert.equal(Object.hasOwn(projected.value, 'result'), false);
    assert.equal(Object.hasOwn(projected.value, 'trace'), false);
    for (const field of ['result', 'trace', 'operand_bindings']) {
        const access = createInstrumentedAccess({ emit() {}, bindings: [{ alias: 'claim', role: 'context', ...projected }] });
        assert.throws(() => access.handle('claim').get(field), /access_/);
    }
});
test('N02G:CONTEXT-003 invalid union, unknown schema forms and accessors fail closed', () => {
    assert.throws(() => projectClaimContext({ ...claims[0], period: { kind: 'unknown' } }, schema), /claim_context_/);
    const changed = structuredClone(schema); changed.definitions.claim.properties.metric = { anyOf: [{ type: 'string' }] };
    assert.throws(() => projectClaimContext(claims[0], changed), /claim_context_/);
    let reads = 0; const bad = { ...claims[0] };
    Object.defineProperty(bad, 'period', { enumerable: true, get() { reads++; return claims[0].period; } });
    assert.throws(() => projectClaimContext(bad, schema)); assert.equal(reads, 0);
});
