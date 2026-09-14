import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createCausalRecorder } from '../../src/next/provenance/causalRecorder.js';

// Local development experiment only. No CLI code, files, URLs or evaluator
// inputs are accepted. The fixed child contains exclusively synthetic probes.
const entry = fileURLToPath(new URL('../../tests/next/provenance/isolationProbe.child.cjs', import.meta.url));
function probe(scenario) {
    return new Promise((resolve, reject) => {
        const recorder = scenario === 'handles' ? createCausalRecorder({ executionId: 'probe-execution', maxEvents: 32 }) : null;
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
                        earlyReturns: trace.derivation_trace.filter(e => e.operation === 'return').length });
                } catch { reject(new Error('probe_observation_failed')); }
            }
            else reject(new Error('probe_incomplete_exit'));
        });
        child.on('message', message => {
            if (stopping) return;
            if (message?.kind === 'observation' && ready && scope && result === undefined) {
                try { scope.observe(message.event); } catch { stop(new Error('probe_observation_failed')); }
                return;
            }
            if (message?.kind === 'ready' && !ready && result === undefined) {
                ready = true;
                clearTimeout(startup);
                deadline = setTimeout(() => {
                    if (scenario === 'termination') { terminated = true; stop(); }
                    else stop(new Error('probe_timeout'));
                }, 1000);
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
assert.equal(Object.keys(handles.checks).length, 12);
assert.equal(handles.observedCount, 22);
assert.equal(handles.earlyReturns, 2);
console.log(JSON.stringify({ stage: 'isolation_feasibility_probe_only', authority_checks: 13,
    synthetic_read_calls: 1, fresh_compartments: true, infinite_loop_terminated: true,
    isolation: 'disposable_child_process', clean_exit_required: true,
    failed_exit_duplicate_and_post_result_loop_rejected: 3,
    handle_checks: 12, external_observations: handles.observedCount,
    ses_version: '2.3.0', executable_closure_proved: false, trace_boundary_proved: false,
    financial_evaluators_executed: 0, production: false }));
