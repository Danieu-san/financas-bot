'use strict';

// BUILD-TIME grammar restriction. Acorn remains dev-only. This is deliberately
// not an authority/capability analyzer and does not execute the supplied text.
const { parse } = require('acorn');
const { EXECUTION_PROFILE } = require('../../src/next/provenance/executionProfile');
const fail = code => { throw new Error(`guest_profile_${code}_invalid`); };

function validateGuestBundle(source) {
    if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > 8 * 1024 * 1024) fail('source');
    let ast;
    try {
        ast = parse(source, { ecmaVersion: EXECUTION_PROFILE.guest.ecma_version,
            sourceType: EXECUTION_PROFILE.guest.source_type });
    } catch { fail('syntax'); }
    const expression = ast.body[0]?.expression;
    if (ast.body.length !== 1 || ast.body[0].type !== 'ExpressionStatement'
        || expression?.type !== 'FunctionExpression' || expression.params.length !== 1
        || expression.params[0].type !== 'Identifier'
        || expression.params[0].name !== EXECUTION_PROFILE.guest.parameter) fail('entry');
    const pending = [expression];
    while (pending.length) {
        const node = pending.pop();
        if (node.type === 'ImportExpression' || node.type === 'ImportDeclaration'
            || node.type === 'MetaProperty' && node.meta.name === 'import') fail('module');
        if (node.async === true || node.generator === true || node.await === true
            || node.type === 'AwaitExpression' || node.type === 'YieldExpression') fail('async');
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                for (const child of value) if (child && typeof child.type === 'string') pending.push(child);
            } else if (value && typeof value === 'object' && typeof value.type === 'string') pending.push(value);
        }
    }
    return Object.freeze({ stage: 'guest_grammar_only', executable: false, source });
}

module.exports = { validateGuestBundle };
