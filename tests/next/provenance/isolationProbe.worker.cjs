'use strict';

const { parentPort, workerData } = require('node:worker_threads');
require('ses');

// env={} and execArgv=[] are supplied by the fixed development probe. No
// application modules, credentials, fixtures or evaluator artifacts are loaded.
lockdown({ errorTaming: 'safe', stackFiltering: 'concise', overrideTaming: 'severe',
    domainTaming: 'safe', evalTaming: 'safe-eval', errorTrapping: 'none',
    unhandledRejectionTrapping: 'none', reporting: 'none' });
let reads = 0;
const read = harden(() => { reads++; return 7; });
function compartment() {
    const c = new Compartment({ globals: { read }, __options__: true });
    // Endow no loader, clock, observer writer, object payload or native API.
    // SES tames constructors; removing direct codegen entry points additionally
    // keeps this experiment on host-supplied source only.
    for (const name of ['eval', 'Function', 'Compartment', 'Date', 'Promise', 'console', 'Intl']) {
        Object.defineProperty(c.globalThis, name, { value: undefined, writable: false, configurable: false });
    }
    Object.freeze(c.globalThis);
    return c;
}
const c = compartment();
parentPort.postMessage({ kind: 'ready' });
if (workerData.scenario === 'termination') {
    c.evaluate('for (;;) {}');
    throw new Error('unreachable');
}
let value;
if (workerData.scenario === 'authority') {
    const checks = c.evaluate(`(() => {
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
    try { c.evaluate('eval("1")'); checks.evalDenied = false; }
    catch { checks.evalDenied = true; }
    // SES rejects import syntax before resolution; no network/Node module is
    // contacted. This probes a separate host-supplied source invocation.
    try { c.evaluate('import("node:fs")'); checks.dynamicImportDenied = false; }
    catch { checks.dynamicImportDenied = true; }
    value = { checks, reads: 0, functionalResult: c.evaluate('read()') };
    value.reads = reads;
} else if (workerData.scenario === 'fresh') {
    let mutationDenied = false;
    try { c.evaluate('globalThis.leaked = 99'); } catch { mutationDenied = true; }
    const second = compartment();
    value = { globalsFrozen: Object.isFrozen(c.globalThis) && Object.isFrozen(second.globalThis),
        independent: mutationDenied && c.globalThis !== second.globalThis
            && second.evaluate('typeof leaked') === 'undefined', reads };
} else throw new Error('unknown_probe');
parentPort.postMessage({ kind: 'result', value });
parentPort.close();
