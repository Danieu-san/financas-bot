'use strict';
// A separate negative-only entry. No accepting/financial/parent code exists
// in this captured closure. All data arrives from the closed private host.
const { EXECUTION_PROFILE } = require('./executionProfile');
const { admitArtifact, artifactContents } = require('./artifactLoader');
const { decodeSelectedEventDayPacket } = require('./selectedEventDayPacket');
const { createSelectedEventDayDispatchCore } = require('./selectedEventDayDispatchCore');
const { openSelectedEventDayProofOperands } = require('./selectedEventDayProofOperands');
const { openSelectedEventDayDerivationOperands } = require('./selectedEventDayDerivationOperands');
const { copyTypedFunctionalResult } = require('./claimBinding');
const { types } = require('node:util');
const { identifier } = require('./observationContract');
const { createHash } = require('node:crypto');
require('ses');
const sha = s => 'sha256:' + createHash('sha256').update(s, 'utf8').digest('hex');
const timezone = EXECUTION_PROFILE.native_timezone;
const graph = process.argv[2] === '--run-selected-day-negative-graph';
if (!['--run-selected-day-negative-proof', '--run-selected-day-negative-graph'].includes(process.argv[2]) || typeof process.send !== 'function'
    || process.versions.node !== EXECUTION_PROFILE.node_version
    || ['icu', 'tz', 'cldr', 'unicode'].some(k => process.versions[k] !== timezone[k])) throw new Error('selected_day_child_runtime');
lockdown(EXECUTION_PROFILE.lockdown);
let stage = 'admission';
function compartment(operands) {
    const guest = new Compartment({ globals: { operands: harden(operands) }, __options__: true });
    for (const name of EXECUTION_PROFILE.denied_globals) Object.defineProperty(guest.globalThis, name,
        { value: undefined, writable: false, configurable: false });
    Object.freeze(guest.globalThis); return guest;
}
// Same descriptor/prototype discipline as the native host, before IPC. No
// guest getter, toJSON or prototype is evaluated to serialize a result.
function functionalResult(raw, guest) {
    const fail = () => { throw new Error('selected_day_child_result'); };
    if (!raw || typeof raw !== 'object' || types.isProxy(raw)
        || ![null, guest.evaluate('Object.prototype')].includes(Object.getPrototypeOf(raw))) fail();
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== 3 || ['kind', 'unit', 'value'].some(k => !d[k]?.enumerable || !Object.hasOwn(d[k], 'value'))) fail();
    let value = d.value.value;
    if (Array.isArray(value)) {
        if (types.isProxy(value) || Object.getPrototypeOf(value) !== guest.evaluate('Array.prototype')) fail();
        const entries = Object.getOwnPropertyDescriptors(value), length = entries.length?.value;
        if (!Number.isSafeInteger(length) || length < 0 || length > 512 || Reflect.ownKeys(entries).length !== length + 1) fail();
        value = Array.from({ length }, (_, i) => {
            const e = entries[String(i)]; if (!e?.enumerable || !Object.hasOwn(e, 'value') || typeof e.value !== 'string') fail();
            return e.value;
        });
    }
    return copyTypedFunctionalResult({ kind: d.kind.value, unit: d.unit.value, value });
}
process.once('message', message => {
    let opened, controller;
    try {
        if (!message || Object.keys(message).sort().join(',') !== (graph
            ? 'config,derivation,expectedRoot,kind,manifest,packetSource,profileSource,scope,source,variant'
            : 'config,expectedRoot,kind,manifest,packetSource,profileSource,scope,source,variant')
            || message.kind !== (graph ? 'run_selected_day_negative_graph' : 'run_selected_day_negative_proof') || !['C', 'M', 'S'].includes(message.variant)
            || Object.keys(message.scope ?? {}).sort().join(',') !== 'executionId,invocationId'
            || !identifier(message.scope.executionId) || !identifier(message.scope.invocationId)
            || typeof message.source !== 'string' || Buffer.byteLength(message.source) > 8 * 1024 * 1024) throw new Error('selected_day_child_protocol');
        const packet = decodeSelectedEventDayPacket(message.packetSource);
        const manifest = JSON.parse(message.manifest);
        if (manifest.files.length !== 2 || manifest.files[1].sha256 !== packet.phase_sha256
            || sha(message.source) !== packet.program_sha256) throw new Error('selected_day_child_identity');
        const receipt = admitArtifact({ manifestBytes: Buffer.from(message.manifest), expectedRoot: message.expectedRoot,
            entries: [{ path: 'bundle.js', bytes: Buffer.from(message.source) },
                { path: manifest.files[1].path, bytes: Buffer.from(message.profileSource) }] });
        const artifact = artifactContents(receipt);
        if (artifact.kind !== 'proof' || artifact.entry !== 'bundle.js'
            || artifact.files[1].path !== 'docs/contracts/next/provenance-v2/phase-composition-profile-v1.json') throw new Error('selected_day_child_identity');
        // Bind identity and the externally sealed variant plan BEFORE handles.
        controller = createSelectedEventDayDispatchCore({ plan: packet.variants[message.variant].plan,
            scope: message.scope, emit: () => {} });
        if (graph) {
            const d = message.derivation;
            if (!d || Object.keys(d).sort().join(',') !== 'config,contractHash,expectedRoot,manifest,source'
                || !/^sha256:[a-f0-9]{64}$/.test(d.contractHash)) throw new Error('selected_day_child_derivation');
            const metric = artifactContents(admitArtifact({ manifestBytes: Buffer.from(d.manifest), expectedRoot: d.expectedRoot,
                entries: [{ path: 'bundle.js', bytes: Buffer.from(d.source) }] }));
            if (metric.kind !== 'metric' || metric.entry !== 'bundle.js' || metric.files.length !== 1) throw new Error('selected_day_child_derivation');
            process.send({ kind: 'phase_start', phase: 'derivation' });
            for (const event of [['M', 'evaluator_artifact_root', d.expectedRoot],
                ['M', 'proof_engine_artifact_root', receipt.observed_root], ['M', 'evaluator_contract_hash', d.contractHash]])
                process.send({ kind: 'measurement', event });
            stage = 'operands';
            opened = openSelectedEventDayDerivationOperands(d.config, event => process.send({ kind: 'observation', event }));
            stage = 'compartment';
            const metricGuest = compartment(opened.operands);
            const evaluateMetric = metricGuest.evaluate(metric.files[0].source, EXECUTION_PROFILE.evaluate);
            if (typeof evaluateMetric !== 'function') throw new Error('selected_day_child_derivation');
            stage = 'evaluation';
            const result = functionalResult(evaluateMetric(opened.operands), metricGuest);
            // formula_only D has no P-target dispatch or proof-view consumer.
            // Execute the independently-conformed common D program as well.
            const guardOperands = harden({ phase: 'derivation' }), guardGuest = compartment(guardOperands);
            const guard = guardGuest.evaluate(artifact.files[0].source, EXECUTION_PROFILE.evaluate);
            if (typeof guard !== 'function' || guard(guardOperands) !== true) throw new Error('selected_day_child_derivation');
            opened.healthy(); opened.revoke(); opened.healthy(); opened = undefined;
            process.send({ kind: 'phase_result', phase: 'derivation', satisfied: true, value: result });
        }
        process.send({ kind: 'phase_start', phase: 'proof' });
        process.send({ kind: 'measurement', event: ['M', 'proof_engine_artifact_root', receipt.observed_root] });
        const boundary = (event, value) => process.send({ kind: 'boundary', event, ...(value === undefined ? {} : { value }) });
        const guest = controller.guest;
        const bridge = Object.freeze({
            guest: Object.freeze({ ...guest,
                dispatch: fn => { boundary('site_begin'); const value = guest.dispatch(fn); boundary('site_end', value); return value; },
                operand: fn => { boundary('operand_begin'); const value = guest.operand(fn); boundary('operand_end'); return value; } }),
            select: fn => { boundary('selection_begin'); const value = controller.select(fn); boundary('selection_end'); return value; }
        });
        stage = 'operands';
        opened = openSelectedEventDayProofOperands(message.config, bridge, event => {
            controller.observe(event); process.send({ kind: 'observation', event });
        });
        stage = 'compartment';
        const operands = harden(opened.operands), guestCompartment = compartment(operands);
        const evaluate = guestCompartment.evaluate(artifact.files[0].source, EXECUTION_PROFILE.evaluate);
        if (typeof evaluate !== 'function') throw new Error('selected_day_child_entry');
        stage = 'evaluation'; const value = evaluate(operands);
        opened.healthy(); controller.finish(value); opened.revoke(); opened.healthy();
        stage = 'result';
        process.send({ kind: 'result', value }, error => { if (error) process.exitCode = 1; process.disconnect(); });
    } catch {
        if (opened) opened.revoke(); if (controller) controller.revoke();
        process.exitCode = 1; process.send({ kind: 'failure', stage }, () => process.disconnect());
    }
});
process.send({ kind: 'ready' });
