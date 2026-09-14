import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createCausalRecorder } from '../../src/next/provenance/causalRecorder.js';
import { canonicalValue } from '../../src/next/kernel/canonicalValue.js';
import { buildCommonJsGuestBundle } from './buildNextProvenanceArtifacts.mjs';

// Local development experiment only. No CLI code, files, URLs or evaluator
// inputs are accepted. The fixed child contains exclusively synthetic probes.
const entry = fileURLToPath(new URL('../../tests/next/provenance/isolationProbe.child.cjs', import.meta.url));
function consumptionArtifact() {
    const sources = ['metricSelection', 'civilCalendar', 'literalTypes'].map(name => ({ path: `${name}.js`,
        source: fs.readFileSync(new URL(`../../src/next/provenance/${name}.js`, import.meta.url), 'utf8') }));
    const source = buildCommonJsGuestBundle({ sources, entry: 'metricSelection.js', exportName: 'evaluateConsumption', constants: ['total'] }).source;
    const sha256 = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const manifest = canonicalValue({ format: 'financasbot.provenance.artifact', version: 1,
        kind: 'metric', entry: 'bundle.js', files: [{ path: 'bundle.js', media_type: 'text/javascript', sha256: sha256(source) }] });
    // Self-sealed synthetic build evidence only; not a reviewed runtime registry.
    return { source, manifest, expectedRoot: sha256(manifest) };
}
function probe(scenario) {
    const artifact = scenario === 'consumption' ? consumptionArtifact() : null;
    return new Promise((resolve, reject) => {
        const recorder = ['handles', 'consumption'].includes(scenario) ? createCausalRecorder({ executionId: 'probe-execution', maxEvents: scenario === 'handles' ? 32 : 1000 }) : null;
        const scope = recorder?.open({ invocationId: 'probe-handles', phase: 'derivation' });
        const child = fork(entry, [scenario], { env: {}, execArgv: ['--max-old-space-size=64'],
            windowsHide: true, silent: true });
        let ready = false;
        let stopping = false;
        let failure;
        let result;
        let terminated = false;
        let diagnosticBytes = 0;
        let deadline;
        const startup = setTimeout(() => stop(new Error('probe_startup_timeout')), 15000);
        function stop(error) {
            if (stopping) return;
            stopping = true;
            failure = error;
            clearTimeout(startup);
            clearTimeout(deadline);
            if (!child.kill()) failure ||= new Error('probe_termination_failed');
        }
        for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
            diagnosticBytes += chunk.length;
            if (diagnosticBytes > 8192) stop(new Error('probe_output_limit'));
        });
        child.on('error', () => stop(new Error('probe_process_error')));
        child.on('close', code => {
            clearTimeout(startup);
            clearTimeout(deadline);
            if (failure) reject(failure);
            else if (terminated) resolve({ terminated: true });
            else if (code === 0 && ready && result !== undefined) {
                if (!scope) { resolve(result); return; }
                try {
                    scope.seal(); const trace = recorder.finish();
                    resolve({ ...result, observedCount: trace.derivation_trace.length,
                        measurements: trace.derivation_trace.filter(e => e.measurement).map(e => e.observed),
                        selectionDecisions: trace.derivation_trace.filter(e => e.operation === 'select_member').map(e => e.outcome[2]),
                        earlyReturns: trace.derivation_trace.filter(e => e.operation === 'return').length });
                } catch { reject(new Error('probe_observation_failed')); }
            }
            else reject(new Error(`probe_incomplete_exit:${scenario}`));
        });
        child.on('message', message => {
            if (stopping) return;
            if (message?.kind === 'observation' && ready && scope && result === undefined) {
                try { scope.observe(message.event); } catch { stop(new Error('probe_observation_failed')); }
                return;
            }
            if (message?.kind === 'measurement' && ready && scope && artifact && result === undefined) {
                try { scope.measure(message.event); } catch { stop(new Error('probe_measurement_failed')); }
                return;
            }
            if (message?.kind === 'ready' && !ready && result === undefined) {
                ready = true;
                clearTimeout(startup);
                deadline = setTimeout(() => {
                    if (scenario === 'termination') { terminated = true; stop(); }
                    else stop(new Error('probe_timeout'));
                }, 1000);
                if (artifact) child.send({ kind: 'artifact', ...artifact });
                return;
            }
            if (!ready || scenario === 'termination' || message?.kind !== 'result' || result !== undefined) {
                stop(new Error('probe_protocol'));
                return;
            }
            result = message.value; // Provisional until the same process closes cleanly.
        });
    });
}

const authority = await probe('authority');
for (const [name, value] of Object.entries(authority.checks)) assert.equal(value, true, `authority:${name}`);
assert.equal(Object.keys(authority.checks).length, 13);
assert.equal(authority.reads, 1);
assert.equal(authority.functionalResult, 7);
const fresh = await probe('fresh');
assert.equal(fresh.globalsFrozen, true);
assert.equal(fresh.independent, true);
assert.equal(fresh.reads, 0);
const timeout = await probe('termination');
assert.equal(timeout.terminated, true);
await assert.rejects(probe('bad_exit'), /probe_incomplete_exit/);
await assert.rejects(probe('duplicate'), /probe_protocol/);
await assert.rejects(probe('hang_after_result'), /probe_timeout/);
const handles = await probe('handles');
for (const [name, value] of Object.entries(handles.checks)) assert.equal(value, true, `handle:${name}`);
assert.equal(Object.keys(handles.checks).length, 14);
assert.equal(handles.observedCount, 31);
assert.equal(handles.earlyReturns, 2);
const consumption = await probe('consumption');
assert.equal(consumption.functionalResult, 125);
assert.equal(consumption.revoked, true);
assert.deepEqual(consumption.selectionDecisions, [true, false]);
assert.deepEqual(consumption.measurements, [consumptionArtifact().expectedRoot]);
console.log(JSON.stringify({ stage: 'isolation_feasibility_probe_only', authority_checks: 13,
    synthetic_read_calls: 1, fresh_compartments: true, infinite_loop_terminated: true,
    isolation: 'disposable_child_process', clean_exit_required: true,
    failed_exit_duplicate_and_post_result_loop_rejected: 3,
    handle_checks: 14, external_observations: handles.observedCount,
    ses_version: '2.3.0', executable_closure_proved: false, trace_boundary_proved: false,
    synthetic_consumption_bundle_executed: 1, synthetic_consumption_result: consumption.functionalResult,
    synthetic_consumption_observations: consumption.observedCount,
    reviewed_financial_evaluators_executed: 0, production: false }));
