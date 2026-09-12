'use strict';

const { freezeDeep } = require('../kernel/canonicalValue');
const fail = code => { throw new Error(`authoring_ir_${code}`); };
const clone = value => structuredClone(value);

// Internal lowering after ALL compiler passes. This does not validate an
// arbitrary package, execute a predicate, or promote authoring to runtime.
function lowerAuthoringIR({ documents, graphs, claims, index, operandBindings, predicateTypes,
    selectionBindings, templates }) {
    const byFact = rows => new Map(rows.map(row => [row.fact_key, row]));
    const graphMap = byFact(graphs);
    const claimMap = byFact(claims);
    const bindings = byFact(operandBindings.graphs);
    const types = byFact(predicateTypes.typedGraphs);
    const templateMap = new Map(templates.templates.map(t => [JSON.stringify([t.id, t.version]), t]));
    const parents = byFact(index.graphs);
    for (const map of [graphMap, claimMap, bindings, types, parents]) {
        if (map.size !== index.order.length || index.order.some(key => !map.has(key))) fail('inventory');
    }
    if (operandBindings.stage !== 'operand_bindings_indexed_only'
        || predicateTypes.stage !== 'predicate_types_checked_only' || predicateTypes.unresolved !== 0
        || selectionBindings.stage !== 'selection_bindings_checked_only') fail('pass');

    function lower(arg, allowTemplate = true) {
        if (!arg || typeof arg !== 'object' || Array.isArray(arg)) fail('operand');
        const keys = Object.keys(arg);
        if (Object.hasOwn(arg, 'template')) {
            if (!allowTemplate || keys.length !== 2 || !Object.hasOwn(arg, 'bindings')) fail('template');
            const template = templateMap.get(JSON.stringify([arg.template.id, arg.template.version]));
            if (!template) fail('template');
            const bindings = Object.fromEntries(Object.entries(arg.bindings).map(([name, value]) => [name, lower(value, false)]));
            // Keep the quantifier's current member lexical. Expansion neither
            // substitutes a selected alias nor evaluates a field from payloads.
            const body = template.body.map(predicate => ({ op: predicate.op, operands: predicate.args.map(value => {
                if (Object.hasOwn(value, 'current_member_field_parameter')) {
                    const selector = bindings[value.current_member_field_parameter];
                    if (selector?.kind !== 'field_selector') fail('member');
                    return { kind: 'member_field', slot: 'current_member', node_kind: selector.node_kind,
                        segments: clone(selector.segments) };
                }
                if (!Object.hasOwn(value, 'parameter') || !Object.hasOwn(bindings, value.parameter)) fail('parameter');
                return clone(bindings[value.parameter]);
            }) }));
            return { kind: 'predicate_template', template_ref: clone(arg.template),
                combinator: 'all', member_slot: 'current_member', bindings, body };
        }
        if (keys.length !== 1) fail('operand');
        const key = keys[0];
        const value = arg[key];
        switch (key) {
        case 'node': return { kind: 'node_ref', alias: value };
        case 'field': return { kind: 'field_ref', alias: value.node, segments: clone(value.segments) };
        case 'claim': return { kind: 'claim_ref', segments: clone(value.segments) };
        case 'literal': return { kind: 'literal', value_type: value.type, value: clone(value.value) };
        case 'set': return { kind: 'set_ref', name: value };
        case 'edge': return { kind: 'edge_ref', id: value };
        case 'selector': return { kind: 'field_selector', node_kind: value.kind, segments: clone(value.segments) };
        case 'presence': return { kind: 'field_presence', field: lower({ field: value }) };
        case 'ref_set': return { kind: 'reference_set', field: lower({ field: value.field }) };
        case 'period_ref': return { kind: 'window_ref', name: value };
        case 'period_bound': return { kind: 'window_bound', name: value.period, bound: value.bound };
        case 'period_literal': return { kind: 'period_literal', period: clone(value) };
        case 'projection': return { kind: 'projection', set: lower({ set: value.set }),
            selector: lower({ selector: value.selector }), as: value.as };
        case 'sort': return { kind: 'sort', tie_break: value.tie_break, keys: value.keys.map(key => ({ ...clone(key),
            selector: lower({ selector: key.selector }) })) };
        default: fail('operand_unresolved');
        }
    }
    function lowerWindow(window) {
        if (window.kind === 'month') return { kind: 'month', value: lower(window.value) };
        if (window.kind === 'range') return { kind: 'range', start: lower(window.start), end: lower(window.end),
            start_inclusive: window.start_inclusive, end_inclusive: window.end_inclusive };
        fail('window');
    }
    const rows = index.order.map(fact_key => {
        const graph = graphMap.get(fact_key);
        const claim = claimMap.get(fact_key);
        const typed = types.get(fact_key);
        if (typed.claim_id !== graph.claim_id || typed.predicates.length !== graph.predicates.length
            || typed.predicates.some((p, i) => p.id !== graph.predicates[i].id)) fail('predicates');
        // Explicit projection: no payload, oracle, functional result or metric
        // contract body is reachable through the authoring IR.
        const descriptor = {};
        for (const key of ['claim_id', 'fact_key', 'metric', 'unit', 'subject', 'period', 'time_basis',
            'coverage', 'evidence_state', 'filters', 'evaluator_ref']) {
            if (Object.hasOwn(claim, key)) descriptor[key] = clone(claim[key]);
        }
        return { fact_key, claim_id: graph.claim_id, evaluator_ref: clone(parents.get(fact_key).evaluator_ref),
            claim: descriptor, parents: clone(parents.get(fact_key).parents),
            operands: clone(bindings.get(fact_key).operands), nodes: clone(graph.nodes), sets: clone(graph.sets),
            windows: Object.fromEntries(Object.entries(graph.windows || {}).map(([name, window]) => [name, lowerWindow(window)])),
            edges: clone(graph.edges), predicates: typed.predicates.map(p => ({ id: p.id, op: p.op,
                obligation: p.obligation, atom: p.atom,
                operands: p.operands.map(arg => ({ type: clone(arg.type), expression: lower(arg.source) })) })),
            obligations: clone(graph.obligations), selections: clone(graph.selections),
            // This is an expectation owned by validation, never recorder input
            // and never evidence that any operation was actually observed.
            expected_trace: clone(graph.trace_contract), required_state_checks: selectionBindings.stateChecks
                .filter(check => check.fact_key === fact_key).map(({ node, field, expected }) => ({ node, field, expected })) };
    });
    return freezeDeep({ format: 'financasbot.provenance.authoring-ir', version: 1,
        stage: 'typed_authoring_ir_only', executable: false,
        authority_refs: documents.map(({ path, sha256 }) => ({ path, sha256 })),
        order: [...index.order], graphs: rows });
}

module.exports = { lowerAuthoringIR };
