'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { digest } = require('../../../src/next/kernel/canonicalValue');
const { calculateDerivedResultHash, projectPrimaryDerivedClaimSnapshot,
    createSameExecutionParentLedger, resolveLedgerParent } = require('../../../src/next/provenance/claimBinding');
const { createInstrumentedAccess } = require('../../../src/next/provenance/instrumentedAccess');
const { measureMaterialFingerprint } = require('../../../src/next/provenance/proofOperators');
const registry = require('../../../docs/contracts/next/provenance-v2/material-field-registry-v1.json');
const sha = n => 'sha256:' + n.repeat(64);
const descriptor = () => ({ registry_version: registry.registry_version, kind: 'derived_claim',
    fields: structuredClone(registry.kinds.derived_claim.fields) });
const role = (role_id, input_kind, semantic_role) => ({ role_id, input_kind, semantic_role,
    cardinality: input_kind === 'node_set' ? 'many' : 'one', ordered: input_kind === 'node_set' });
const fixture = () => ({ claim_contract_hash: sha('a'), graph_contract_hash: sha('b'), metric_registry_hash: sha('c'),
    claim_id: 'claim-one', fact_key: 'M-01#1#1', evaluator_ref: { evaluator_id: 'consumption_sum', evaluator_version: 1 },
    result: { unit: 'BRL_minor', kind: 'money_minor', value: 10 }, operand_bindings: {
        context: { kind: 'claim_context' }, events: { kind: 'node_set', aliases: ['a', 'b'] } },
    primary_inputs: [{ alias: 'a', kind: 'event', ref_id: 'event-a', version: sha('d'), semantic_fingerprint: sha('e') },
        { alias: 'b', kind: 'event', ref_id: 'event-b', version: sha('f'), semantic_fingerprint: sha('0') }],
    parents: [], registry_roles: [role('context', 'claim_context', 'scope'),
        role('events', 'node_set', 'population')] });

test('N02G:PARENT-HASH-001 exact closed preimage changes for every material dimension, not registry role decoration', () => {
    const input = fixture(); const before = JSON.stringify(input); const original = calculateDerivedResultHash(input);
    const { registry_roles, ...fields } = input;
    assert.equal(original, 'sha256:' + digest({ domain: 'financasbot.validated-derived-result.v1', ...fields }));
    for (const mutate of [p => { p.claim_contract_hash = sha('1'); }, p => { p.graph_contract_hash = sha('1'); },
        p => { p.metric_registry_hash = sha('1'); }, p => { p.claim_id = 'other'; }, p => { p.fact_key = 'M-01#1#2'; },
        p => { p.evaluator_ref.evaluator_version = 2; }, p => { p.result.value = 11; },
        p => { p.operand_bindings.events.aliases.reverse(); }, p => { p.primary_inputs[0].semantic_fingerprint = sha('1'); },
        p => { p.primary_inputs[0].version = sha('1'); }, p => { p.primary_inputs[0].ref_id = 'other'; }]) {
        const altered = fixture(); mutate(altered); assert.notEqual(calculateDerivedResultHash(altered), original);
    }
    for (const mutate of [p => { p.primary_inputs.reverse(); }, p => { p.extra = 'unexpected'; },
        p => { p.result.extra = 1; }, p => { p.registry_roles.push(p.registry_roles[0]); }]) {
        const altered = fixture(); mutate(altered); assert.throws(() => calculateDerivedResultHash(altered), /derived_result_hash_invalid/);
    }
    assert.equal(JSON.stringify(input), before);
});

test('N02G:PARENT-HASH-002 parent roles stay in registry order and equal amounts do not identify a parent', () => {
    const input = fixture();
    input.registry_roles.push(role('left', 'parent_claim', 'left'), role('right', 'parent_claim', 'right'));
    Object.assign(input.operand_bindings, { left: { kind: 'parent_claim', fact_key: 'M-01#1#1' },
        right: { kind: 'parent_claim', fact_key: 'M-01#1#2' } });
    input.parents = ['left', 'right'].map((role_id, i) => ({ role_id,
        fact_key: input.operand_bindings[role_id].fact_key, evaluator_version: 1, result_hash: sha(String(i)) }));
    const original = calculateDerivedResultHash(input);
    const sameAmountOtherParent = structuredClone(input);
    sameAmountOtherParent.parents[0].result_hash = sha('2');
    assert.notEqual(calculateDerivedResultHash(sameAmountOtherParent), original);
    input.parents.reverse(); assert.throws(() => calculateDerivedResultHash(input));
    assert.throws(() => projectPrimaryDerivedClaimSnapshot(sameAmountOtherParent, descriptor()));
});

test('N02G:PARENT-RECEIPT-001 TCB transport tokens are private, earlier-invocation and same-execution only', () => {
    // These ledger tests establish transport properties, not graph acceptance.
    // Host code must never expose the ledger or its issuance method to guest.
    const ledger = createSameExecutionParentLedger({ executionId: 'execution-a' });
    const first = ledger.openInvocation({ invocationId: 'first' }); const preimage = fixture();
    const receipt = first.acceptPrimary({ preimage, descriptor: descriptor() });
    const selector = { receipt, fact_key: preimage.fact_key, claim_id: preimage.claim_id, evaluator_version: 1,
        claim_contract_hash: preimage.claim_contract_hash, graph_contract_hash: preimage.graph_contract_hash,
        metric_registry_hash: preimage.metric_registry_hash };
    assert.throws(() => resolveLedgerParent(first, selector));
    first.seal(); const second = ledger.openInvocation({ invocationId: 'second' });
    const projected = resolveLedgerParent(second, selector);
    assert.equal(projected.snapshot.payload.result.value, 10);
    for (const patch of [{ receipt: {} }, { receipt: structuredClone(receipt) }, { fact_key: 'M-01#1#2' },
        { claim_id: 'other' }, { evaluator_version: 2 }, { claim_contract_hash: sha('1') },
        { graph_contract_hash: sha('1') }, { metric_registry_hash: sha('1') }])
        assert.throws(() => resolveLedgerParent(second, { ...selector, ...patch }));
    assert.throws(() => resolveLedgerParent({ resolveParent: () => projected }, selector));
    const other = createSameExecutionParentLedger({ executionId: 'execution-a' }).openInvocation({ invocationId: 'other' });
    assert.throws(() => resolveLedgerParent(other, selector));
    preimage.result.value = 99; assert.equal(resolveLedgerParent(second, selector).snapshot.payload.result.value, 10);
    second.seal(); ledger.finish(); assert.throws(() => resolveLedgerParent(second, selector));
});

test('N02G:PARENT-FINGERPRINT-001 full material measurement is live, includes structure and stays separate from result hash', () => {
    const input = fixture(); const d = descriptor(); const projected = projectPrimaryDerivedClaimSnapshot(input, d);
    const scalar = { type: 'scalar' }; const shape = { type: 'record', fields: {
        id: scalar, fact_key: scalar, evaluator_version: scalar, result_hash: scalar,
        result: { type: 'record', fields: { unit: scalar, kind: scalar, value: scalar } },
        parents: { type: 'sequence', item: { type: 'record', fields: { role_id: scalar, parent_ref: scalar } } } } };
    const events = []; const access = createInstrumentedAccess({ bindings: [{ alias: 'parent', role: 'proof/snapshot',
        value: projected.snapshot.payload, shape, identity: { kind: 'derived_claim', ref_id: input.claim_id, version: projected.result_hash } }],
        emit: e => events.push(e) });
    assert.equal(measureMaterialFingerprint(access.handle('parent'), d), projected.semantic_fingerprint);
    assert.ok(events.some(e => e[1] === 'get' && e[4].join('.') === 'result.value'));
    assert.ok(events.some(e => e[1] === 'keys' && e[4].join('.') === 'result'));
    assert.ok(events.some(e => e[1] === 'length' && e[4].join('.') === 'parents' && e[6][1] === 0));
    assert.equal(events.filter(e => e[1] === 'has' && e[4].length === 1).length, 6);
    access.revoke(); assert.throws(() => measureMaterialFingerprint(access.handle('parent'), d));
    const missing = descriptor(); delete missing.fields.parents;
    assert.throws(() => projectPrimaryDerivedClaimSnapshot(input, missing));
    const mutated = fixture(); mutated.result.value++;
    assert.notEqual(projectPrimaryDerivedClaimSnapshot(mutated, d).semantic_fingerprint, projected.semantic_fingerprint);
});
