import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';

// Local development experiment only. No CLI code, files, URLs or evaluator
// inputs are accepted. The fixed worker contains exclusively synthetic probes.
const entry = new URL('../../tests/next/provenance/isolationProbe.worker.cjs', import.meta.url);
function probe(scenario) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(entry, { workerData: { scenario }, env: {}, execArgv: [],
            resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 4 } });
        let complete = false;
        let ready = false;
        let deadline;
        const startup = setTimeout(() => finish(new Error('probe_startup_timeout')), 15000);
        function finish(error, value) {
            if (complete) return;
            complete = true;
            clearTimeout(startup);
            clearTimeout(deadline);
            worker.terminate().then(() => error ? reject(error) : resolve(value), reject);
        }
        worker.on('error', error => finish(error));
        worker.on('exit', code => { if (!complete) finish(new Error(`probe_early_exit:${code}`)); });
        worker.on('message', message => {
            if (message?.kind === 'ready' && !ready) {
                ready = true;
                clearTimeout(startup);
                deadline = setTimeout(() => scenario === 'termination'
                    ? finish(null, { terminated: true }) : finish(new Error('probe_timeout')), 1000);
                return;
            }
            if (!ready || scenario === 'termination' || message?.kind !== 'result') {
                finish(new Error('probe_protocol'));
                return;
            }
            finish(null, message.value);
        });
    });
}

const authority = await probe('authority');
for (const [name, value] of Object.entries(authority.checks)) assert.equal(value, true, `authority:${name}`);
assert.equal(Object.keys(authority.checks).length, 12);
assert.equal(authority.reads, 1);
assert.equal(authority.functionalResult, 7);
const fresh = await probe('fresh');
assert.equal(fresh.globalsFrozen, true);
assert.equal(fresh.independent, true);
assert.equal(fresh.reads, 0);
const timeout = await probe('termination');
assert.equal(timeout.terminated, true);
console.log(JSON.stringify({ stage: 'isolation_feasibility_probe_only', authority_checks: 12,
    synthetic_read_calls: 1, fresh_compartments: true, infinite_loop_terminated: true,
    ses_version: '2.3.0', executable_closure_proved: false, trace_boundary_proved: false,
    financial_evaluators_executed: 0, production: false }));
