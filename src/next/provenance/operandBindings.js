'use strict';

const { freezeDeep } = require('../kernel/canonicalValue');
const fail = code => { throw new Error(`operand_binding_${code}`); };
const evaluatorKey = ref => JSON.stringify([ref.evaluator_id, ref.evaluator_version]);
function index(items, key) {
    const result = new Map();
    for (const item of items) {
        const id = key(item);
        if (result.has(id)) fail('duplicate');
        result.set(id, item);
    }
    return result;
}
function sameSet(actual, expected, code) {
    if (actual.size !== expected.size || [...actual.keys()].some(key => !expected.has(key))) fail(code);
}

// Binding index only. role_ref points to the registry; it does not publish
// another normative copy of semantic_role, order, contract hash or artifact root.
// A resolved operand is not proof that it was read, nor a validated-parent receipt.
function compileOperandBindings({ graphs, claims, evaluators, contracts }) {
    const claimMap = index(claims, claim => claim.fact_key);
    const graphMap = index(graphs, graph => graph.fact_key);
    const registry = index(evaluators, evaluatorKey);
    const contractMap = index(contracts, contract => contract.path);
    sameSet(graphMap, claimMap, 'claim_set');
    const outputKinds = { BRL_minor: ['money_minor'], count: ['nonnegative_integer'],
        entity_ids: ['id', 'id_set'], state: ['enum'] };
    for (const evaluator of evaluators) {
        const contract = contractMap.get(evaluator.contract_path)?.value;
        if (!contract || contract.metric !== evaluator.metric || contract.unit !== evaluator.unit
            || contract.stage !== 'authoring'
            || contract.signature?.operands !== 'resolve_roles_from_metric_evaluator_registry'
            || contract.signature?.context !== 'explicit_versioned_instrumented_claim') fail('contract');
        if (!outputKinds[evaluator.unit]?.includes(contract.signature.output.kind)) fail('output');
        index(evaluator.roles, role => role.role_id);
        for (const role of evaluator.roles) {
            if (!['claim_context', 'node', 'node_set', 'parent_claim'].includes(role.input_kind)) fail('kind');
            if (role.input_kind === 'node_set') {
                if (role.cardinality !== 'many' || typeof role.ordered !== 'boolean') fail('cardinality');
            } else if (role.cardinality !== 'one' || role.ordered !== false) fail('cardinality');
        }
    }
    let bindingCount = 0;
    const rows = [];
    for (const graph of graphs) {
        const claim = claimMap.get(graph.fact_key);
        const evaluator = registry.get(evaluatorKey(claim.evaluator_ref));
        if (!evaluator || graph.claim_id !== claim.claim_id) fail('claim');
        sameSet(new Set(Object.keys(claim.operand_bindings)), new Set(evaluator.roles.map(role => role.role_id)), 'role_set');
        const usedNodes = new Set();
        function node(alias) {
            const value = Object.hasOwn(graph.nodes, alias) ? graph.nodes[alias] : undefined;
            if (value?.binding !== 'snapshot' || !value.roles.includes('value_input')) fail('node');
            usedNodes.add(alias);
        }
        const operands = [];
        for (const role of evaluator.roles) {
            const binding = claim.operand_bindings[role.role_id];
            if (binding.kind !== role.input_kind) fail('kind');
            const resolved = { role_ref: { evaluator_id: evaluator.evaluator_id,
                evaluator_version: evaluator.evaluator_version, role_id: role.role_id }, kind: binding.kind };
            if (binding.kind === 'claim_context') resolved.claim_id = claim.claim_id;
            else if (binding.kind === 'node') { node(binding.alias); resolved.alias = binding.alias; }
            else if (binding.kind === 'node_set') {
                if (!Array.isArray(binding.aliases)) fail('aliases');
                index(binding.aliases, alias => alias);
                for (const alias of binding.aliases) node(alias);
                // Preserve even when ordered=false. No implicit sort/dedup.
                resolved.aliases = [...binding.aliases];
            } else {
                const edges = graph.edges.filter(edge => edge.relation === 'derived_from'
                    && edge.source === 'claim' && edge.field === role.role_id);
                if (edges.length !== 1) fail('parent');
                const parent = graph.nodes[edges[0].target];
                if (parent?.binding !== 'validated_parent' || parent.fact_key !== binding.fact_key
                    || !parent.roles.includes('value_input') || !graphMap.has(binding.fact_key)) fail('parent');
                usedNodes.add(edges[0].target);
                resolved.alias = edges[0].target;
                resolved.fact_key = binding.fact_key;
            }
            operands.push(resolved);
            bindingCount++;
        }
        sameSet(usedNodes, new Set(Object.keys(graph.nodes).filter(alias => graph.nodes[alias].roles.includes('value_input'))), 'value_inventory');
        rows.push({ fact_key: graph.fact_key, claim_id: claim.claim_id, operands });
    }
    return freezeDeep({ stage: 'operand_bindings_indexed_only', bindingCount, graphs: rows });
}

module.exports = { compileOperandBindings };
