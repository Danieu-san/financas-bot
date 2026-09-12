'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { digest } = require('../../../src/next/kernel/canonicalValue');
const { validateTemplateReferences } = require('../../../src/next/provenance/templateReferences');
const root = path.resolve(__dirname, '../../..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'docs/contracts/next/provenance-v2', name)));
function fixture() {
    const document = read('graphs-v2.json');
    return { graphs: document.graphs, templates: read('predicate-templates-v1.json'),
        materialRegistry: JSON.parse(fs.readFileSync(path.join(root, document.material_registry.path))),
        claims: JSON.parse(fs.readFileSync(path.join(root, document.claim_contract.path))).claims,
        operators: JSON.parse(fs.readFileSync(path.join(root, document.operator_registry.path))).operators };
}
function firstRef(input) {
    for (const graph of input.graphs) for (const predicate of graph.predicates) for (const arg of predicate.args) {
        if (arg.template) return arg;
    }
    throw new Error('test_fixture_missing_template');
}

test('N02G:TEMPLATE-001 actual references resolve the canonical entry hash, not the whole file', () => {
    const input = fixture();
    const result = validateTemplateReferences(input);
    assert.equal(result.templates, 3);
    assert.equal(result.references, 28);
    assert.equal(result.stage, 'template_references_checked_only');
    const ref = firstRef(input).template;
    assert.equal(ref.hash, `sha256:${digest(input.templates.templates.find(t => t.id === ref.id))}`);
});

test('N02G:TEMPLATE-004 actual bindings must match field types, member kinds and window limits', () => {
    for (const [mutate, pattern] of [
        [i => { firstRef(i).bindings.field.selector.segments = ['amount_minor']; }, /operator_types_type/],
        [i => { firstRef(i).bindings.field.selector.kind = 'bill'; firstRef(i).bindings.field.selector.segments = ['due_date']; }, /member_kind/],
        [i => { firstRef(i).bindings.field.selector.segments = ['unknown']; }, /binding_field/],
        [i => { firstRef(i).bindings.period.period_ref = 'missing'; }, /binding_period/],
        [i => {
            const graph = i.graphs.find(g => g.predicates.some(p => p.args.some(a => a.template)));
            graph.windows.selection_window.start = { literal: { type: 'integer', value: 1 } };
        }, /binding_period_type/],
        [i => {
            const graph = i.graphs.find(g => g.predicates.some(p => p.args.some(a => a.template)));
            graph.windows.selection_window.start = { literal: { type: 'date', value: 1 } };
        }, /literal_type_value/],
    ]) {
        const input = fixture();
        mutate(input);
        assert.throws(() => validateTemplateReferences(input), pattern);
    }
});

test('N02G:TEMPLATE-002 identity, hash and exact parameter bindings cannot drift', () => {
    for (const [mutate, pattern] of [
        [i => { firstRef(i).template.id = 'missing'; }, /missing/],
        [i => { firstRef(i).template.version++; }, /missing/],
        [i => { firstRef(i).template.hash = 'sha256:' + '0'.repeat(64); }, /hash/],
        [i => { delete firstRef(i).bindings.field; }, /bindings/],
        [i => { firstRef(i).bindings.extra = { literal: { type: 'boolean', value: true } }; }, /bindings/],
        [i => { i.templates.templates.push(structuredClone(i.templates.templates[0])); }, /duplicate/],
        [i => { i.templates.templates[0].body[0].op = 'eq'; }, /hash/],
    ]) {
        const input = fixture();
        mutate(input);
        assert.throws(() => validateTemplateReferences(input), pattern);
    }
});

test('N02G:TEMPLATE-003 repaired hashes cannot legitimize code, dangling parameters or unknown operators', () => {
    for (const [mutate, pattern] of [
        [t => { t.body[0].op = 'eval'; }, /operator/],
        [t => { t.body[0].args[0] = { parameter: 'missing' }; }, /parameter/],
        [t => { t.body[0].args[0] = { expression: 'return true' }; }, /argument/],
        [t => { t.body[0].when = true; }, /shape/],
        [t => { t.parameters.unused = 'boolean'; }, /unused_parameter/],
        [t => { t.body = []; }, /body/],
        [t => { t.parameters.field = 'field_selector:K:unknown'; }, /signature/],
        [t => { t.parameters.field = 'date'; }, /member_selector/],
    ]) {
        const input = fixture();
        const template = input.templates.templates[0];
        mutate(template);
        for (const g of input.graphs) for (const p of g.predicates) for (const arg of p.args) {
            if (arg.template?.id === template.id) arg.template.hash = `sha256:${digest(template)}`;
        }
        assert.throws(() => validateTemplateReferences(input), pattern);
    }
});
