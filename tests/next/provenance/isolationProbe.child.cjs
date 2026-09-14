'use strict';

const { EXECUTION_PROFILE } = require('../../../src/next/provenance/executionProfile');
const { createInstrumentedAccess, createNodeSetAccess } = require('../../../src/next/provenance/instrumentedAccess');
require('ses');

// env={} and fixed execArgv are supplied by the development probe. No
// financial modules, credentials, fixtures or evaluator artifacts are loaded.
// Only the development profile and observation primitives are used below.
if (process.versions.node !== EXECUTION_PROFILE.node_version) throw new Error('probe_runtime_mismatch');
const scenario = process.argv[2];
if (!['authority', 'fresh', 'termination', 'bad_exit', 'duplicate', 'hang_after_result', 'handles'].includes(scenario)) {
    throw new Error('unknown_probe');
}
lockdown(EXECUTION_PROFILE.lockdown);
let reads = 0;
const read = harden(() => { reads++; return 7; });
function compartment(operands) {
    const globals = operands === undefined ? { read } : { operands };
    const c = new Compartment({ globals, __options__: true });
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
} else if (scenario === 'handles') {
    const access = createInstrumentedAccess({ emit: event => process.send({ kind: 'observation', event }),
        bindings: [{ alias: 'node_a', role: 'source', value: { amount: 7, tags: ['a', 'b'], label: 'not exposed' },
            shape: { type: 'record', fields: { amount: { type: 'scalar' },
                tags: { type: 'sequence', item: { type: 'scalar' } }, label: { type: 'non_material' } } } }] });
    const guest = compartment(harden(access.handle('node_a')));
    const checks = guest.evaluate(`({
        scalar: operands.get('amount') === 7,
        noRawObject: operands.amount === undefined && Object.getPrototypeOf(operands) === null
            && operands.observe === undefined && operands.revoke === undefined && typeof read === 'undefined',
        keys: [...operands.keys()].join(',') === 'amount,tags',
        earlyTermination: (() => { for (const item of operands.get('tags')) return item === 'a'; return false; })(),
        noConstructor: operands.get.constructor === undefined
    })`, EXECUTION_PROFILE.evaluate);
    access.revoke(); access.assertHealthy();
    try { guest.evaluate('operands.get("amount")', EXECUTION_PROFILE.evaluate); checks.revoked = false; }
    catch { checks.revoked = true; }
    try { access.assertHealthy(); checks.failureLatched = false; }
    catch { checks.failureLatched = true; }
    const nodes = createNodeSetAccess({ role: 'events', emit: event => process.send({ kind: 'observation', event }),
        bindings: [{ alias: 'node_b', role: 'events', value: { amount: 9 },
            shape: { type: 'record', fields: { amount: { type: 'scalar' } } } }] });
    const setGuest = compartment(harden(nodes.handle));
    checks.setStructure = setGuest.evaluate(`operands.length() === 1 && operands.at.constructor === undefined
        && !Array.isArray(operands) && (() => { for (const node of operands) return node.get('amount') === 9; return false; })()`, EXECUTION_PROFILE.evaluate);
    checks.setSelection = setGuest.evaluate(`operands.select(node => node.get('amount') >= 9).length() === 1`, EXECUTION_PROFILE.evaluate);
    const retainedGuest = compartment(harden(nodes.handle.at(0)));
    nodes.revoke(); nodes.assertHealthy();
    try { retainedGuest.evaluate('operands.get("amount")', EXECUTION_PROFILE.evaluate); checks.setRetainedRevoked = false; }
    catch { checks.setRetainedRevoked = true; }
    try { setGuest.evaluate('operands.length()', EXECUTION_PROFILE.evaluate); checks.setRevoked = false; }
    catch { checks.setRevoked = true; }
    try { nodes.assertHealthy(); checks.setFailureLatched = false; }
    catch { checks.setFailureLatched = true; }
    const relation = createInstrumentedAccess({ emit: event => process.send({ kind: 'observation', event }), bindings: [
        { alias: 'origin', role: 'source', value: { id: 'origin-id', ref: 'target-id' },
            shape: { type: 'record', fields: { id: { type: 'scalar' }, ref: { type: 'scalar' } } } },
        { alias: 'target', role: 'source', value: { id: 'target-id', amount: 11 },
            shape: { type: 'record', fields: { id: { type: 'scalar' }, amount: { type: 'scalar' } } } }
    ], links: [{ id: 'link', source: 'origin', field: 'ref', target: 'target', type: 'ref' }] });
    const relationGuest = compartment(harden(relation.handle('origin')));
    checks.traversal = relationGuest.evaluate(`operands.traverse('link').get('amount') === 11
        && operands.traverse.constructor === undefined`, EXECUTION_PROFILE.evaluate);
    relation.revoke(); relation.assertHealthy();
    value = { checks }; // Probe booleans, not a functional-result/trace envelope.
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
