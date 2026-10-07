// BUILD-side external analysis of the actual complete guest bytes. This is a
// restrictive effect proof, not execution, expected-value derivation or TCB
// approval. It is used ONLY in conjunction with opaque whole-program conformance.
import { parse } from 'acorn';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { canonicalValue, freezeDeep } from '../../src/next/kernel/canonicalValue.js';
const fail = code => { throw new Error('selected_day_executable_' + code); };
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
function walk(node, fn, parent = null, ancestors = []) {
    fn(node, parent, ancestors);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) for (const child of value) {
            if (child && typeof child.type === 'string') walk(child, fn, node, [...ancestors, node]);
        }
        else if (value && typeof value.type === 'string') walk(value, fn, node, [...ancestors, node]);
    }
}
const id = (node, name) => node?.type === 'Identifier' && node.name === name;
const literal = (node, value) => node?.type === 'Literal' && node.value === value;
const member = (node, object, property) => node?.type === 'MemberExpression' && !node.computed && !node.optional
    && id(node.object, object) && id(node.property, property);
function binds(pattern, name) {
    if (!pattern) return false;
    if (id(pattern, name)) return true;
    if (pattern.type === 'RestElement') return binds(pattern.argument, name);
    if (pattern.type === 'AssignmentPattern') return binds(pattern.left, name);
    if (pattern.type === 'ArrayPattern') return pattern.elements.some(p => binds(p, name));
    if (pattern.type === 'ObjectPattern') return pattern.properties.some(p => binds(p.value ?? p.argument, name));
    return false;
}
function localBinding(ancestors, factory, name) {
    for (const scope of [...ancestors].reverse()) {
        if (/Function/.test(scope.type) && scope.params.some(p => binds(p, name))) return true;
        if (scope.type === 'BlockStatement' && scope.body.some(statement => statement.type === 'VariableDeclaration'
            && statement.declarations.some(d => binds(d.id, name)))) return true;
        if (scope.type === 'CatchClause' && binds(scope.param, name)) return true;
        if (scope === factory) break;
    }
    return false;
}

function inspectRun(run, selectedSet) {
    if (run.params.length !== 1 || !id(run.params[0], 'operands')) fail('entry');
    let discarded = 0, dispatches = 0;
    walk(run.body, (node, parent, ancestors) => {
        if (node.type === 'Identifier' && ['operands', 'rootOperands'].includes(node.name)) {
            const receiver = parent?.type === 'MemberExpression' && parent.object === node;
            const rootBinding = parent?.type === 'VariableDeclarator' && id(parent.id, 'rootOperands') && id(parent.init, 'operands');
            const localBinding = parent?.type === 'VariableDeclarator' && parent.id === node && id(node, 'operands')
                && parent.init?.type === 'CallExpression' && member(parent.init.callee, 'Object', 'freeze');
            if (!receiver && !rootBinding && !localBinding) fail('capability_escape');
        }
        if (node.type === 'MemberExpression' && ['operands', 'rootOperands'].some(name => id(node.object, name))) {
            if (node.computed || node.optional || parent?.type !== 'CallExpression' || parent.callee !== node || parent.optional) fail('capability_alias');
            const method = node.property.name, call = parent, callParent = ancestors.at(-2);
            if (!['node', 'claim', 'edge', 'resolveReference', 'memberEdge', 'set', 'select',
                'dispatch', 'operand', 'selectedDayOrigin'].includes(method)) fail('capability_method');
            if (method === 'select') {
                if (!id(node.object, 'operands') || call.arguments.length !== 3
                    || call.arguments[0].type !== 'Literal' || !literal(call.arguments[1], selectedSet)
                    || call.arguments[2].type !== 'ArrowFunctionExpression'
                    || callParent?.type !== 'ExpressionStatement' || callParent.expression !== call) fail('selection_consumption');
                discarded++;
            }
            if (method === 'set') {
                // The sole forwarding property is dormant: no call of operands.set
                // is accepted anywhere in this entry. It cannot export its closure.
                const arrow = callParent, property = ancestors.at(-3), object = ancestors.at(-4);
                if (!id(node.object, 'rootOperands') || call.arguments.length !== 1 || !id(call.arguments[0], 'name')
                    || arrow?.type !== 'ArrowFunctionExpression' || arrow.body !== call
                    || arrow.params.length !== 1 || !id(arrow.params[0], 'name')
                    || property?.type !== 'Property' || property.computed || !id(property.key, 'set')
                    || property.value !== arrow || object?.type !== 'ObjectExpression') fail('selected_set_consumption');
            }
            if (method === 'dispatch') {
                const test = callParent, branch = ancestors.at(-3);
                if (!id(node.object, 'rootOperands') || call.arguments.length !== 1
                    || call.arguments[0].type !== 'ArrowFunctionExpression' || call.arguments[0].params.length
                    || test?.type !== 'UnaryExpression' || test.operator !== '!'
                    || branch?.type !== 'IfStatement' || branch.test !== test || branch.alternate
                    || branch.consequent.type !== 'ExpressionStatement'
                    || branch.consequent.expression.type !== 'AssignmentExpression'
                    || !id(branch.consequent.expression.left, 'all') || !literal(branch.consequent.expression.right, false)) fail('boolean_sink');
                dispatches++;
            }
        }
        if (literal(node, selectedSet) && !(parent?.type === 'CallExpression'
            && member(parent.callee, 'operands', 'select') && parent.arguments[1] === node)) fail('selected_name_escape');
        // No predicate result can become a condition, argument, property,
        // closure capture or alias consumed by another predicate/dispatcher.
        if (id(node, 'all')) {
            const binding = parent?.type === 'VariableDeclarator' && parent.id === node && literal(parent.init, true);
            const sink = parent?.type === 'AssignmentExpression' && parent.operator === '=' && parent.left === node && literal(parent.right, false);
            const result = parent?.type === 'ReturnStatement' && parent.argument === node;
            if (!binding && !sink && !result) fail('boolean_escape');
            if (result) {
                const owner = [...ancestors].reverse().find(n => /Function/.test(n.type)) ?? run;
                let owns = false;
                walk(owner.body, (child, _p, above) => {
                    if (child.type === 'VariableDeclarator' && id(child.id, 'all') && literal(child.init, true)
                        && !above.some(n => /Function/.test(n.type))) owns = true;
                });
                if (!owns) fail('boolean_capture');
            }
        }
    });
    return { discarded, dispatches };
}

export function analyzeSelectedEventDayExecutableClosure(raw) {
    if (!raw || types.isProxy(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const descriptors = Object.getOwnPropertyDescriptors(raw), names = ['source', 'selectedSet'];
    if (Reflect.ownKeys(descriptors).length !== names.length || names.some(k => !descriptors[k]?.enumerable
        || !Object.hasOwn(descriptors[k], 'value'))) fail('input');
    const { source, selectedSet } = Object.fromEntries(names.map(k => [k, descriptors[k].value]));
    if (typeof source !== 'string' || Buffer.byteLength(source) > 8 * 1024 * 1024
        || typeof selectedSet !== 'string' || !/^[a-z][a-z0-9_]*$/.test(selectedSet)) fail('input');
    let ast; try { ast = parse(source, { ecmaVersion: 2022 }); } catch { fail('syntax'); }
    let bundles = 0, discarded = 0, dispatches = 0, sources = 0, imports = 0;
    walk(ast, (node, parent, ancestors) => {
        if (node.type === 'ImportExpression' || node.type === 'ImportDeclaration') fail('loader');
        if (node.type === 'Identifier' && ['eval', 'Function', 'AsyncFunction', 'GeneratorFunction', 'globalThis'].includes(node.name)) fail('dynamic_code');
        if (node.type !== 'VariableDeclarator' || !id(node.id, 'factories')) return;
        const body = [...ancestors].reverse().find(n => n.type === 'BlockStatement'), factories = node.init;
        if (!body || factories?.type !== 'ArrayExpression' || !factories.elements.length) fail('bundle');
        const edgeNode = body.body.flatMap(n => n.type === 'VariableDeclaration' ? n.declarations : []).find(n => id(n.id, 'edges'));
        let edges; try { edges = JSON.parse(source.slice(edgeNode.init.start, edgeNode.init.end)); } catch { fail('edges'); }
        if (!Array.isArray(edges) || edges.length !== factories.elements.length) fail('edges');
        let entries = 0;
        factories.elements.forEach((factory, index) => {
            if (factory?.type !== 'FunctionExpression' || factory.params.map(p => p.name).join(',') !== 'require,module,exports') fail('factory');
            const runs = factory.body.body.filter(n => n.type === 'FunctionDeclaration' && id(n.id, 'run'));
            if (runs.length > 1) fail('entry');
            if (runs.length) { entries++; const checked = inspectRun(runs[0], selectedSet);
                discarded += checked.discarded; dispatches += checked.dispatches; }
            const calls = new Set();
            walk(factory.body, (child, holder, above) => {
                if (child.type === 'Identifier' && ['operands', 'rootOperands'].includes(child.name)) {
                    const key = holder?.type === 'Property' && !holder.computed && holder.key === child && !holder.shorthand;
                    const property = holder?.type === 'MemberExpression' && !holder.computed && holder.property === child;
                    if (!key && !property && !localBinding([...above, ...(holder ? [holder] : [])], factory, child.name)) fail('helper_capability_capture');
                }
                if (!id(child, 'require')) return;
                if (holder?.type !== 'CallExpression' || holder.callee !== child || holder.optional
                    || holder.arguments.length !== 1 || typeof holder.arguments[0].value !== 'string') fail('loader');
                calls.add(holder.arguments[0].value);
            });
            const seen = new Set();
            for (const edge of edges[index]) {
                if (!Array.isArray(edge) || edge.length !== 2 || !calls.has(edge[0]) || seen.has(edge[0])
                    || !Number.isSafeInteger(edge[1]) || edge[1] < 0 || edge[1] >= factories.elements.length) fail('edges');
                seen.add(edge[0]); imports++;
            }
            if (seen.size !== calls.size) fail('edges');
            sources++;
        });
        if (entries !== 1) fail('entry');
        bundles++;
    });
    if (bundles !== 4 || discarded !== 3 || !dispatches) fail('class');
    return freezeDeep({ schema_version: 1, analysis: 'closed_guest_selection_effects/v1',
        scope: 'common_C_M_S_guest_and_finite_helpers_conjoined_with_whole_program_conformance',
        program_sha256: sha(source), selected_set: selectedSet, analysis_contract_sha256: sha(ANALYSIS_CONTRACT),
        closed_guest_bundles: bundles, closed_factory_sources: sources, closed_import_edges: imports,
        discarded_selection_calls: discarded, local_boolean_dispatches: dispatches,
        selected_view_consumers: 0, boolean_result_external_consumers: 0,
        executable_closure_absence_proved: true, profile_witness_qualified: false,
        semantic_mutation_credit: 0, financial_release_eligible: false });
}
// This is a versioned statement of the checked property, not a hash of this
// implementation. Actual analyzer bytes are bound by the BUILD source recipe.
const ANALYSIS_CONTRACT = canonicalValue({ version: 1, consumers: 0, selection_result: 'discarded',
    predicate_result: 'local_monotone_boolean_sink', loader: 'finite_static_guest_map', conformance_required: true });
