'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EXECUTION_PROFILE } = require('../../../src/next/provenance/executionProfile');
const { validateGuestBundle } = require('../../../scripts/agent/nextProvenanceGuestProfile');

test('N02G:PROFILE-001 configuration is immutable and pins runtime/SES without ambient defaults', () => {
    assert.equal(EXECUTION_PROFILE.ses_version, '2.3.0');
    assert.equal(EXECUTION_PROFILE.node_version, '22.17.0');
    assert.deepEqual(EXECUTION_PROFILE.native_timezone, { icu: '77.1', tz: '2025b', cldr: '47.0', unicode: '16.0' });
    assert.ok(Object.isFrozen(EXECUTION_PROFILE.native_timezone));
    assert.equal(EXECUTION_PROFILE.guest.ecma_version, 2022);
    assert.equal(EXECUTION_PROFILE.guest.parameter, 'operands');
    assert.deepEqual(EXECUTION_PROFILE.evaluate, {
        transforms: [], __evadeHtmlCommentTest__: false, __evadeImportExpressionTest__: false,
        __rejectSomeDirectEvalExpressions__: true
    });
    assert.ok(Object.isFrozen(EXECUTION_PROFILE.lockdown));
    assert.equal(EXECUTION_PROFILE.lockdown.__hardenTaming__, 'safe');
    assert.deepEqual(Object.keys(EXECUTION_PROFILE.lockdown).sort(), [
        '__hardenTaming__', 'consoleTaming', 'domainTaming', 'errorTaming', 'errorTrapping',
        'evalTaming', 'legacyRegeneratorRuntimeTaming', 'localeTaming', 'overrideDebug',
        'overrideTaming', 'regExpTaming', 'reporting', 'stackFiltering', 'unhandledRejectionTrapping'
    ].sort());
    assert.ok(Object.isFrozen(EXECUTION_PROFILE.evaluate.transforms));
    assert.throws(() => { EXECUTION_PROFILE.guest.parameter = 'raw'; }, TypeError);
});

test('N02G:PROFILE-002 pure synchronous single-function bundles pass without execution', () => {
    for (const source of [
        '(function evaluate(operands) { return operands.read(); })',
        '(function (operands) { function twice(n) { return n * 2; } return twice(7); });',
        '/* reviewed comment */ (function evaluate(operands) { let n=0; for(let i=0;i<3;i++) n+=i; return n; })',
        '(function evaluate(operands) { throw new Error("must_not_execute"); })'
    ]) {
        const result = validateGuestBundle(source);
        assert.equal(result.stage, 'guest_grammar_only');
        assert.equal(result.executable, false);
        assert.equal(result.source, source);
        assert.ok(Object.isFrozen(result));
    }
});

test('N02G:PROFILE-003 top-level effects, alternate entry shapes and parameter channels are rejected', () => {
    for (const source of [
        'const x = 7; (function evaluate(operands) { return x; })',
        '(function evaluate(operands) { return 7; })()',
        'operands => 7', 'function evaluate(operands) { return 7; }',
        '(function evaluate(raw) { return 7; })',
        '(function evaluate(operands, trace) { return 7; })',
        '(function evaluate(...operands) { return 7; })',
        '(function evaluate(operands = {}) { return 7; })',
        '(function evaluate({ read }) { return read(); })'
    ]) assert.throws(() => validateGuestBundle(source), /guest_profile_entry_invalid/);
});

test('N02G:PROFILE-004 asynchronous and module syntax fails throughout the function tree', () => {
    for (const source of [
        '(async function evaluate(operands) { return 7; })',
        '(function* evaluate(operands) { yield 7; })',
        '(function evaluate(operands) { return (async () => 7)(); })',
        '(function evaluate(operands) { return { async run() { return 7; } }; })',
        '(function evaluate(operands) { class X { async run() { return 7; } } return X; })',
        '(function evaluate(operands) { return function* () { yield 7; }; })',
        '(function evaluate(operands) { return import("node:fs"); })',
        'import x from "node:fs";'
    ]) assert.throws(() => validateGuestBundle(source), /guest_profile_(syntax|entry|async|module)_invalid/);
});

test('N02G:PROFILE-005 grammar validation is not claimed to detect arbitrary authority acquisition', () => {
    const source = '(function evaluate(operands) { return ({})["constructor"]["constructor"]("return process")(); })';
    const result = validateGuestBundle(source);
    assert.equal(result.stage, 'guest_grammar_only');
    assert.equal(result.executable, false);
    // SES + reviewed artifact admission, NOT this AST pass, must stop this execution.
});

test('N02G:PROFILE-006 denied globals include async, native, timing and code-generation surfaces', () => {
    for (const name of ['process', 'require', 'module', 'Buffer', 'fetch', 'WebSocket', 'console',
        'Date', 'Intl', 'Promise', 'setTimeout', 'performance', 'queueMicrotask', 'Compartment',
        'Function', 'eval', 'WeakRef', 'FinalizationRegistry', 'SharedArrayBuffer', 'Atomics', 'WebAssembly']) {
        assert.ok(EXECUTION_PROFILE.denied_globals.includes(name), name);
    }
    assert.equal(new Set(EXECUTION_PROFILE.denied_globals).size, EXECUTION_PROFILE.denied_globals.length);
    assert.ok(Object.isFrozen(EXECUTION_PROFILE.denied_globals));
    assert.throws(() => validateGuestBundle(null), /guest_profile_source_invalid/);
    assert.throws(() => validateGuestBundle('x'.repeat(8 * 1024 * 1024 + 1)), /guest_profile_source_invalid/);
});
