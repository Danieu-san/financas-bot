'use strict';
// Authorship-derived whole-IR expectation. No graphCompiler, authoringIR,
// lowerer, emitted source/site map, guest or actual IR is imported here.
// Native nominal-type contracts are reused, NOT a compiler admission verdict.
const { compilePredicateTypes } = require('./predicateTypes');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const prefix = 'docs/contracts/next/provenance-v2/';
const fail = code => { throw new Error('selected_day_ir_' + code); };
function deriveSelectedEventDayIr(documents) {
    const map = new Map(documents.map(d => [d.path, d.value]));
    const corpus = map.get(prefix + 'graphs-v2.json');
    const claims = new Map(map.get(corpus.claim_contract.path).claims.map(c => [c.fact_key, c]));
    const graphMap = new Map(corpus.graphs.map(g => [g.fact_key, g]));
    const registry = map.get(corpus.metric_evaluator_registry.path);
    const evaluators = new Map(registry.entries.map(e => [canonicalValue([e.evaluator_id, e.evaluator_version]), e]));
    const templates = new Map(map.get(prefix + 'predicate-templates-v1.json').templates.map(t => [canonicalValue([t.id, t.version]), t]));
    const typed = compilePredicateTypes({ graphs: corpus.graphs, claims: [...claims.values()],
        snapshots: map.get(corpus.snapshot_manifest.path).snapshots,
        materialRegistry: map.get(corpus.material_registry.path), operatorRegistry: map.get(corpus.operator_registry.path),
        claimSchema: map.get(prefix + 'claim-contract.schema.json') });
    const types = new Map(typed.typedGraphs.map(g => [g.fact_key, g.predicates]));
    function expression(arg) {
        if (arg.template) {
            const template = templates.get(canonicalValue([arg.template.id, arg.template.version]));
            if (!template) fail('template');
            const bindings = Object.fromEntries(Object.entries(arg.bindings).map(([key, value]) => [key, expression(value)]));
            const body = template.body.map(p => ({ op: p.op, operands: p.args.map(a => {
                if (a.current_member_field_parameter) {
                    const selector = bindings[a.current_member_field_parameter];
                    if (selector?.kind !== 'field_selector') fail('template_member');
                    return { kind: 'member_field', slot: 'current_member', node_kind: selector.node_kind, segments: selector.segments };
                }
                if (!Object.hasOwn(bindings, a.parameter)) fail('template_parameter');
                return bindings[a.parameter];
            }) }));
            return { kind: 'predicate_template', template_ref: arg.template, combinator: 'all',
                member_slot: 'current_member', bindings, body };
        }
        const keys = Object.keys(arg); if (keys.length !== 1) fail('expression');
        const v = arg[keys[0]];
        const direct = {
            node: () => ({ kind: 'node_ref', alias: v }), field: () => ({ kind: 'field_ref', alias: v.node, segments: v.segments }),
            claim: () => ({ kind: 'claim_ref', segments: v.segments }), literal: () => ({ kind: 'literal', value_type: v.type, value: v.value }),
            set: () => ({ kind: 'set_ref', name: v }), edge: () => ({ kind: 'edge_ref', id: v }),
            selector: () => ({ kind: 'field_selector', node_kind: v.kind, segments: v.segments }),
            presence: () => ({ kind: 'field_presence', field: expression({ field: v }) }),
            ref_set: () => ({ kind: 'reference_set', field: expression({ field: v.field }) }),
            period_ref: () => ({ kind: 'window_ref', name: v }),
            period_bound: () => ({ kind: 'window_bound', name: v.period, bound: v.bound }),
            period_literal: () => ({ kind: 'period_literal', period: v }),
            projection: () => ({ kind: 'projection', set: expression({ set: v.set }), selector: expression({ selector: v.selector }), as: v.as }),
            sort: () => ({ kind: 'sort', tie_break: v.tie_break, keys: v.keys.map(k => ({ ...k, selector: expression({ selector: k.selector }) })) })
        };
        if (!Object.hasOwn(direct, keys[0])) fail('expression_pending'); return direct[keys[0]]();
    }
    const rows = new Map();
    for (const [fact_key, graph] of graphMap) {
        const claim = claims.get(fact_key);
        const evaluator = evaluators.get(canonicalValue([claim.evaluator_ref.evaluator_id, claim.evaluator_ref.evaluator_version]));
        if (!evaluator) fail('evaluator');
        const parents = [];
        const operands = evaluator.roles.map(role => {
            const binding = claim.operand_bindings[role.role_id];
            const value = { role_ref: { evaluator_id: evaluator.evaluator_id, evaluator_version: evaluator.evaluator_version,
                role_id: role.role_id }, kind: binding.kind };
            if (binding.kind === 'claim_context') value.claim_id = claim.claim_id;
            else if (binding.kind === 'node') value.alias = binding.alias;
            else if (binding.kind === 'node_set') value.aliases = binding.aliases;
            else if (binding.kind === 'parent_claim') {
                const edges = graph.edges.filter(e => e.relation === 'derived_from' && e.source === 'claim' && e.field === role.role_id);
                if (edges.length !== 1 || graph.nodes[edges[0].target]?.fact_key !== binding.fact_key) fail('parent');
                value.alias = edges[0].target; value.fact_key = binding.fact_key;
                parents.push({ role: role.role_id, fact_key: binding.fact_key, alias: value.alias });
            } else fail('binding');
            return value;
        });
        const descriptor = Object.fromEntries(['claim_id', 'fact_key', 'metric', 'unit', 'subject', 'period', 'time_basis',
            'coverage', 'evidence_state', 'filters', 'evaluator_ref'].filter(k => Object.hasOwn(claim, k)).map(k => [k, claim[k]]));
        const stateChecks = [];
        const material = map.get(corpus.material_registry.path);
        for (const selection of graph.selections) for (const alias of graph.sets[selection.selected_set]) {
            const fields = material.kinds[graph.nodes[alias].kind].fields;
            const field = ['evidence_state', 'state'].find(name => fields[name]?.type === 'enum'
                && fields[name].values.includes('confirmed'));
            if (field) stateChecks.push({ node: alias, field, expected: selection.input_evidence_state ?? claim.evidence_state });
        }
        rows.set(fact_key, { fact_key, claim_id: graph.claim_id,
            evaluator_ref: { evaluator_id: evaluator.evaluator_id, evaluator_version: evaluator.evaluator_version },
            claim: descriptor, parents, operands, nodes: graph.nodes, sets: graph.sets,
            windows: Object.fromEntries(Object.entries(graph.windows).map(([name, w]) => {
                if (w.kind === 'month') return [name, { kind: 'month', value: expression(w.value) }];
                if (w.kind === 'range') return [name, { kind: 'range', start: expression(w.start), end: expression(w.end),
                    start_inclusive: w.start_inclusive, end_inclusive: w.end_inclusive }];
                fail('window');
            })), edges: graph.edges,
            predicates: graph.predicates.map((p, i) => ({ id: p.id, op: p.op, obligation: p.obligation, atom: p.atom,
                operands: p.args.map((a, j) => ({ type: types.get(fact_key)[i].operands[j].type, expression: expression(a) })) })),
            obligations: graph.obligations, selections: graph.selections, expected_trace: graph.trace_contract,
            required_state_checks: stateChecks });
    }
    const order = [], done = new Set(), active = new Set();
    function visit(key) {
        if (active.has(key) || !rows.has(key)) fail('dependency'); if (done.has(key)) return;
        active.add(key); rows.get(key).parents.forEach(p => visit(p.fact_key)); active.delete(key);
        done.add(key); order.push(key);
    }
    [...rows.keys()].sort().forEach(visit);
    return freezeDeep(structuredClone({ format: 'financasbot.provenance.authoring-ir', version: 1,
        stage: 'typed_authoring_ir_only', executable: false,
        authority_refs: documents.map(({ path, sha256 }) => ({ path, sha256 })), order,
        graphs: order.map(key => rows.get(key)) }));
}
module.exports = { deriveSelectedEventDayIr };
