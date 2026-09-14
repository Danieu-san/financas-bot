'use strict';

const { EXECUTION_PROFILE } = require('../../../src/next/provenance/executionProfile');
require('ses');

// env={} and fixed execArgv are supplied by the development probe. No
// application modules, credentials, fixtures or evaluator artifacts are loaded.
if (process.versions.node !== EXECUTION_PROFILE.node_version) throw new Error('probe_runtime_mismatch');
const scenario = process.argv[2];
if (!['authority', 'fresh', 'termination', 'bad_exit', 'duplicate', 'hang_after_result'].includes(scenario)) {
    throw new Error('unknown_probe');
}
lockdown(EXECUTION_PROFILE.lockdown);
let reads = 0;
const read = harden(() => { reads++; return 7; });
function compartment() {
    const c = new Compartment({ globals: { read }, __options__: true });
    // Endow no loader, clock, observer writer, object payload or native API.
    // SES tames constructors; removing direct codegen entry points additionally
    // keeps this experiment on host-supplied source only.
    for (const name of EXECUTION_PROFILE.denied_globals) {
        Object.defineProperty(c.globalThis, name, { value: undefined, writable: false, configurable: false });
    }
    Object.freeze(c.globalThis);
    return c;
}
const c = compartment();
const evaluate = source => c.evaluate(source, EXECUTION_PROFILE.evaluate);
process.send({ kind: 'ready' });
if (scenario === 'termination') {
    evaluate('for (;;) {}');
    throw new Error('unreachable');
}
let value;
if (['authority', 'bad_exit', 'duplicate', 'hang_after_result'].includes(scenario)) {
    const checks = evaluate(`(() => {
        const denied = fn => { try { fn(); return false; } catch { return true; } };
        return {
            nodeAbsent: typeof process === 'undefined' && typeof require === 'undefined'
                && typeof module === 'undefined' && typeof Buffer === 'undefined',
            networkAbsent: typeof fetch === 'undefined' && typeof WebSocket === 'undefined'
                && typeof XMLHttpRequest === 'undefined',
            timersAbsent: typeof setTimeout === 'undefined' && typeof setInterval === 'undefined'
                && typeof performance === 'undefined',
            clockAbsent: typeof Date === 'undefined' && typeof Intl === 'undefined',
            randomDenied: denied(() => Math.random()),
            codegenDenied: typeof Compartment === 'undefined' && denied(() => Function('return 1')()),
            constructorDenied: denied(() => ({}).constructor.constructor('return process')())
                && denied(() => (function(){}).constructor('return process')()),
            asyncConstructorDenied: denied(() => Object.getPrototypeOf(async function(){}).constructor('return process'))
                && denied(() => Object.getPrototypeOf(function*(){}).constructor('return process')),
            capabilityConstructorDenied: denied(() => read.constructor('return process')()),
            intrinsicsFrozen: Object.isFrozen(Object.prototype) && Object.isFrozen(Array.prototype)
                && Object.isFrozen(Function === undefined ? Object.getPrototypeOf(read) : Function.prototype)
        };
    })()`);
    try { evaluate('eval("1")'); checks.evalDenied = false; }
    catch { checks.evalDenied = true; }
    // SES rejects import syntax before resolution; no network/Node module is
    // contacted. This probes a separate host-supplied source invocation.
    try { evaluate('import("node:fs")'); checks.dynamicImportDenied = false; }
    catch { checks.dynamicImportDenied = true; }
    checks.profileGlobalsDenied = EXECUTION_PROFILE.denied_globals.every(name => {
        const descriptor = Object.getOwnPropertyDescriptor(c.globalThis, name);
        return descriptor?.value === undefined && descriptor.writable === false && descriptor.configurable === false;
    });
    value = { checks, reads: 0, functionalResult: evaluate('read()') };
    value.reads = reads;
} else if (scenario === 'fresh') {
    let mutationDenied = false;
    try { evaluate('globalThis.leaked = 99'); } catch { mutationDenied = true; }
    const second = compartment();
    value = { globalsFrozen: Object.isFrozen(c.globalThis) && Object.isFrozen(second.globalThis),
        independent: mutationDenied && c.globalThis !== second.globalThis
            && second.evaluate('typeof leaked', EXECUTION_PROFILE.evaluate) === 'undefined', reads };
} else throw new Error('unknown_probe');
process.send({ kind: 'result', value }, error => {
    if (error) process.exitCode = 1;
    if (scenario === 'bad_exit') process.exitCode = 1;
    if (scenario === 'hang_after_result') evaluate('for (;;) {}');
    if (scenario === 'duplicate') {
        process.send({ kind: 'result', value }, secondError => {
            if (secondError) process.exitCode = 1;
            process.disconnect();
        });
        return;
    }
    process.disconnect();
});
