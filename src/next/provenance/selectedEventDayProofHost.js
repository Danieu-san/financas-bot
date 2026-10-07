'use strict';
const { spawn } = require('node:child_process');
const { types } = require('node:util');
const { createHash } = require('node:crypto');
const { copyData, identifier } = require('./observationContract');
const { freezeDeep } = require('../kernel/canonicalValue');
const { decodeSelectedEventDayPacket } = require('./selectedEventDayPacket');
const { createSelectedEventDayDispatchCore } = require('./selectedEventDayDispatchCore');
const { createCausalRecorder } = require('./causalRecorder');
const { applySelectedEventDayProofBoundary } = require('./selectedEventDayProofProtocol');
const { decodeObservation, decodeMeasurement } = require('./observationContract');
const { copyTypedFunctionalResult } = require('./claimBinding');
const recipe = require('./selectedDayCapturedProofRecipe');
const fail = code => new Error('selected_day_native_host_' + code);
// Captured factory accepts no source, packet, expected, artifact root, timeout
// override or callback. Variant/scope come only from the private BUILD binding.
function run(raw) {
    if (!raw || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) throw fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== 3 || ['variant', 'scope', 'mode'].some(k => !d[k]?.enumerable || !Object.hasOwn(d[k], 'value'))) throw fail('input');
    const { variant, scope, mode } = copyData({ variant: d.variant.value, scope: d.scope.value, mode: d.mode.value });
    if (!['proof', 'graph'].includes(mode) || !['C', 'M', 'S'].includes(variant) || Object.keys(scope).sort().join(',') !== 'executionId,invocationId'
        || !identifier(scope.executionId) || !identifier(scope.invocationId)) throw fail('scope');
    const packet = decodeSelectedEventDayPacket(recipe.packetSource);
    const rows = [], recorder = createCausalRecorder({ executionId: scope.executionId, maxEvents: 20000 });
    let recording, phase, derivationResult, derivationComplete = false, dMeasured = 0;
    const dMeasurements = [['M', 'evaluator_artifact_root', recipe.derivation.expectedRoot],
        ['M', 'proof_engine_artifact_root', recipe.proof.expectedRoot], ['M', 'evaluator_contract_hash', recipe.derivation.contractHash]];
    const controller = createSelectedEventDayDispatchCore({ plan: packet.variants[variant].plan, scope,
        emit: row => { (row.event[0] === 'I' ? recording.observe : recording.measure)(row.event);
            rows.push({ ...row, sequence: rows.length, phase: 'proof' }); } });
    const runtimeSha = 'sha256:' + createHash('sha256').update(recipe.childSource).digest('hex');
    if (runtimeSha !== recipe.childSourceSha256) throw fail('child_identity');
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--max-old-space-size=64', '-', mode === 'graph'
            ? '--run-selected-day-negative-graph' : '--run-selected-day-negative-proof'],
            { env: {}, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
        let ready = false, measured = false, complete = false, result, evidence, error;
        const startup = setTimeout(() => stop('startup_timeout'), 15000);
        let deadline;
        function stop(code) { if (!error) { error = fail(code); controller.revoke(); child.kill(); } }
        child.on('error', () => stop('process_error')); child.stdin.on('error', () => stop('send_failed'));
        for (const stream of [child.stdout, child.stderr]) stream.on('data', () => stop('output_forbidden'));
        child.stdin.end(recipe.childSource, 'utf8');
        child.on('message', message => {
            if (error) return;
            try {
                if (!message || typeof message !== 'object' || Array.isArray(message)) throw fail('protocol');
                const keys = Object.keys(message).sort().join(',');
                if (!ready && message.kind === 'ready' && keys === 'kind') {
                    ready = true; clearTimeout(startup); deadline = setTimeout(() => stop('timeout'), 5000);
                    child.send({ kind: mode === 'graph' ? 'run_selected_day_negative_graph' : 'run_selected_day_negative_proof',
                        variant, scope, ...recipe.proof, packetSource: recipe.packetSource, config: recipe.configs[variant],
                        ...(mode === 'graph' ? { derivation: {
                            manifest: recipe.derivation.manifest, source: recipe.derivation.source,
                            expectedRoot: recipe.derivation.expectedRoot, contractHash: recipe.derivation.contractHash,
                            config: recipe.derivation.configs[variant] } } : {}) }, e => { if (e) stop('send_failed'); }); return;
                }
                if (!ready || complete) throw fail('protocol');
                if (message.kind === 'failure' && keys === 'kind,stage'
                    && ['admission', 'operands', 'compartment', 'evaluation', 'result'].includes(message.stage)) { stop('child_' + message.stage); return; }
                if (message.kind === 'phase_start' && keys === 'kind,phase') {
                    const expected = mode === 'graph' && !derivationComplete ? 'derivation' : 'proof';
                    if (phase !== undefined || message.phase !== expected) throw fail('phase');
                    phase = message.phase; recording = recorder.open({ invocationId: scope.invocationId, phase }); return;
                }
                if (phase === 'derivation') {
                    const expected = dMeasurements[dMeasured];
                    if (message.kind === 'measurement' && keys === 'event,kind' && expected
                        && JSON.stringify(message.event) === JSON.stringify(expected)) {
                        const event = decodeMeasurement(message.event); recording.measure(event); dMeasured++;
                        rows.push({ sequence: rows.length, execution_id: scope.executionId, invocation_id: scope.invocationId,
                            phase, event, owner: { kind: 'core', site: 'derivation/measurement', occurrence: null, operand: null } }); return;
                    }
                    if (message.kind === 'observation' && keys === 'event,kind' && dMeasured === dMeasurements.length) {
                        const event = decodeObservation(message.event); recording.observe(event);
                        rows.push({ sequence: rows.length, execution_id: scope.executionId, invocation_id: scope.invocationId,
                            phase, event, owner: { kind: 'core', site: 'derivation/native', occurrence: null, operand: null } }); return;
                    }
                    if (message.kind === 'phase_result' && keys === 'kind,phase,satisfied,value' && message.phase === phase
                        && message.satisfied === true && dMeasured === dMeasurements.length) {
                        derivationResult = copyTypedFunctionalResult(message.value); recording.seal();
                        phase = undefined; derivationComplete = true; return;
                    }
                    throw fail('derivation_protocol');
                }
                if (phase !== 'proof') throw fail('phase');
                if (!measured && message.kind === 'measurement' && keys === 'event,kind'
                    && JSON.stringify(message.event) === JSON.stringify(['M', 'proof_engine_artifact_root', recipe.proof.expectedRoot])) {
                    controller.measure(message.event); measured = true; return;
                }
                if (!measured) throw fail('protocol');
                if (message.kind === 'observation' && keys === 'event,kind') { controller.observe(message.event); return; }
                if (message.kind === 'boundary' && ['event,kind', 'event,kind,value'].includes(keys)) {
                    applySelectedEventDayProofBoundary(controller, message); return;
                }
                if (message.kind === 'result' && keys === 'kind,value') {
                    evidence = controller.finish(message.value); result = message.value; recording.seal(); complete = true; return;
                }
                throw fail('protocol');
            } catch { stop('protocol_or_lease'); }
        });
        child.on('close', code => {
            clearTimeout(startup); clearTimeout(deadline);
            if (error) { reject(error); return; }
            if (code !== 0 || !complete || mode === 'graph' && !derivationComplete) { reject(fail('incomplete_exit')); return; }
            try { resolve(freezeDeep({ stage: 'selected_day_isolated_proof_observations_only', proof_satisfied: result,
                ...evidence, raw_rows: rows, raw_event_count: rows.length,
                ...(mode === 'graph' ? { derivation_satisfied: true, result: derivationResult } : {}),
                trace: recorder.finish(), negative_qualification: true,
                observed_child_capsule_root: recipe.childRoot, receipt_created: false,
                executable_ticket_complete: false, validation_tcb_complete: false, semantic_mutation_credit: 0,
                profile_witness_qualified: false, financial_release_eligible: false })); }
            catch { reject(fail('recorder')); }
        });
    });
}
module.exports = { run };
