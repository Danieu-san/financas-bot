'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { buildExecutionRegistryCandidate, buildAvailableMetricArtifacts } = (() => ({
    buildExecutionRegistryCandidate: () => import('../../../scripts/agent/buildNextMetricArtifacts.mjs')
        .then(module => module.buildExecutionRegistryCandidate()),
    buildAvailableMetricArtifacts: () => import('../../../scripts/agent/buildNextMetricArtifacts.mjs')
        .then(module => module.buildAvailableMetricArtifacts())
}))();
const { admitExecutionRegistry, resolveExecutionEvaluator,
    admitExecutionContract, resolveExecutionOutput } = require('../../../src/next/provenance/executionRegistry');
const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

test('N02G:EXEC-REG-001 exact candidate bytes admit one opaque byte receipt, not freeze or graph acceptance', async () => {
    const candidate = await buildExecutionRegistryCandidate();
    const bytes = Buffer.from(candidate.bytes);
    const receipt = admitExecutionRegistry({ bytes, expectedHash: candidate.registry_hash });
    bytes.fill(0);
    assert.equal(receipt.stage, 'admitted_execution_registry_bytes_only');
    assert.equal(receipt.observed_hash, candidate.registry_hash);
    const entry = resolveExecutionEvaluator(receipt,
        { evaluator_id: 'consumption_total', evaluator_version: 1 });
    const artifacts = await buildAvailableMetricArtifacts();
    assert.equal(entry.evaluator_artifact_root,
        artifacts.built.find(item => item.evaluator_id === 'consumption_total').artifact_root);
    assert.equal(entry.artifact_status, 'bound');
    assert.equal(entry.roles[0].role_id, 'context');
    assert.equal(Object.isFrozen(entry.roles), true);
    assert.throws(() => resolveExecutionEvaluator({ ...receipt },
        { evaluator_id: 'consumption_total', evaluator_version: 1 }), /execution_registry_/);
});

test('N02G:EXEC-REG-002 altered bytes, authoring stage and unknown evaluator fail closed', async () => {
    const candidate = await buildExecutionRegistryCandidate();
    const bytes = Buffer.from(candidate.bytes);
    const changed = Buffer.from(bytes); changed[changed.length - 2] ^= 1;
    assert.throws(() => admitExecutionRegistry({ bytes: changed, expectedHash: candidate.registry_hash }),
        /execution_registry_/);
    const authoring = JSON.stringify({ ...candidate.registry, stage: 'authoring' });
    assert.throws(() => admitExecutionRegistry({ bytes: Buffer.from(authoring), expectedHash: digest(authoring) }),
        /execution_registry_/);
    const receipt = admitExecutionRegistry({ bytes, expectedHash: candidate.registry_hash });
    assert.throws(() => resolveExecutionEvaluator(receipt,
        { evaluator_id: 'not_registered', evaluator_version: 1 }), /execution_registry_/);
    const duplicateRole = JSON.parse(candidate.bytes);
    duplicateRole.entries[0].roles.push({ ...duplicateRole.entries[0].roles[0] });
    const duplicateBytes = Buffer.from(require('../../../src/next/kernel/canonicalValue')
        .canonicalValue(duplicateRole));
    assert.throws(() => admitExecutionRegistry({ bytes: duplicateBytes,
        expectedHash: digest(duplicateBytes) }), /execution_registry_entry/);
});

test('N02G:EXEC-REG-003 exact contract bytes bind output kind to the same registry receipt', async () => {
    const candidate = await buildExecutionRegistryCandidate();
    const bytes = Buffer.from(candidate.bytes);
    const registryReceipt = admitExecutionRegistry({ bytes, expectedHash: candidate.registry_hash });
    const otherReceipt = admitExecutionRegistry({ bytes, expectedHash: candidate.registry_hash });
    const evaluatorRef = { evaluator_id: 'consumption_total', evaluator_version: 1 };
    const contractBytes = Buffer.from(fs.readFileSync(path.join(__dirname,
        '../../../docs/contracts/next/provenance-v2/evaluator-contracts/consumption_total.json'), 'utf8')
        .replaceAll('\r\n', '\n'));
    const contractReceipt = admitExecutionContract({ registryReceipt, evaluatorRef, bytes: contractBytes });
    assert.deepEqual(resolveExecutionOutput(registryReceipt, evaluatorRef, contractReceipt),
        { unit: 'BRL_minor', kind: 'money_minor', enumValues: [] });
    assert.throws(() => resolveExecutionOutput(otherReceipt, evaluatorRef, contractReceipt),
        /execution_registry_contract_not_admitted/);
    assert.throws(() => admitExecutionContract({ registryReceipt, evaluatorRef,
        bytes: Buffer.from(contractBytes.toString('utf8') + ' ') }), /execution_registry_contract_hash/);
    assert.throws(() => admitExecutionContract({ registryReceipt,
        evaluatorRef: { evaluator_id: 'income_realized', evaluator_version: 1 }, bytes: contractBytes }),
    /execution_registry_contract_hash/);
});
