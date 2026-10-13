// External, read-only census of real closed guest bytes. This finite BUILD
// grammar binds modules/imports/lexical references, NOT runtime value-flow,
// semantic equivalence, consumer absence, independent execution or reviewed TCB.
import { parse } from 'acorn';
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import path from 'node:path';
import { copyData } from '../../src/next/provenance/observationContract.js';
import { canonicalValue } from '../../src/next/kernel/canonicalValue.js';

const cache = new Map(), moduleCache = new Map();
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error('path_executable_closure_' + code); };
// Only internally constructed/parser/copied data enters this helper. Cached
// children are already recursively frozen; caller objects never enter here.
function freezeDeep(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freezeDeep(child);
        Object.freeze(value);
    }
    return value;
}
const intrinsic = new Set(['Object', 'Array', 'Number', 'String', 'Boolean', 'Math', 'JSON',
    'Map', 'Set', 'WeakMap', 'WeakSet', 'Uint8Array', 'Uint32Array', 'Int32Array',
    'RegExp', 'Error', 'TypeError', 'RangeError', 'Symbol', 'Reflect', 'undefined', 'NaN', 'Infinity']);
function fields(raw, names) {
    if (!raw || typeof raw !== 'object' || types.isProxy(raw) || Array.isArray(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail('input');
    const d = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(d).length !== names.length || names.some(name =>
        !d[name]?.enumerable || !Object.hasOwn(d[name], 'value'))) fail('input');
    return Object.fromEntries(names.map(name => [name, d[name].value]));
}
function children(node) {
    return Object.entries(node).flatMap(([key, value]) => key === 'start' || key === 'end' ? [] :
        Array.isArray(value) ? value.filter(item => item?.type).map(item => [key, item]) :
            value?.type ? [[key, value]] : []);
}
function clean(node) {
    if (Array.isArray(node)) return node.map(clean);
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(Object.entries(node).filter(([key]) => !['start', 'end', 'raw'].includes(key))
        .map(([key, value]) => [key, clean(value)]));
}
const expression = source => {
    const program = parse(source, { ecmaVersion: 2022 });
    if (program.body.length !== 1 || program.body[0].type !== 'ExpressionStatement') fail('whole_expression');
    return program.body[0].expression;
};
function remember(store, key, value, limit) {
    if (store.size >= limit) store.delete(store.keys().next().value);
    store.set(key, value); return value;
}
function moduleInventory(source, logicalPath) {
    const key = logicalPath + ':' + sha(source);
    if (moduleCache.has(key)) return moduleCache.get(key);
    const fn = expression('(function(require,module,exports){\n' + source + '\n})');
    const scopes = new WeakMap(), declared = new WeakSet(), declarationBindings = new WeakMap(),
        imports = [], importedSymbols = [], calls = [], aliases = [], references = [], callSites = [],
        origins = new Map(), writes = new Set(), memberWrites = new Set(), exportTerms = [], functions = [], effectSites = [];
    let scopeId = 0;
    const makeScope = (parent, isFunction = false) => ({ parent, isFunction, id: scopeId++, names: new Map() });
    const outer = makeScope(null, true);
    const declare = (pattern, scope, kind) => {
        if (!pattern) return;
        if (pattern.type === 'Identifier') {
            declared.add(pattern);
            if (!scope.names.has(pattern.name)) scope.names.set(pattern.name, scope.id + '/' + pattern.name);
            if (kind === 'parameter' || kind === 'factory') origins.set(scope.names.get(pattern.name),
                [{ kind: kind === 'parameter' ? 'parameter' : 'factory_parameter', name: pattern.name }]);
            if (pattern.name === 'require' && kind !== 'factory') fail('require_shadow');
        } else if (pattern.type === 'RestElement') declare(pattern.argument, scope, kind);
        else if (pattern.type === 'AssignmentPattern') declare(pattern.left, scope, kind);
        else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(item => declare(item, scope, kind));
        else if (pattern.type === 'ObjectPattern') pattern.properties.forEach(item =>
            declare(item.type === 'RestElement' ? item.argument : item.value, scope, kind));
        else fail('binding_pattern');
    };
    function prepare(node, scope, root = false) {
        if (node.type === 'FunctionDeclaration') {
            declare(node.id, scope, 'function');
            declarationBindings.set(node, scope.names.get(node.id.name));
        }
        if (['FunctionExpression', 'FunctionDeclaration', 'ArrowFunctionExpression'].includes(node.type)) {
            if (!root) functions.push(node);
            scope = root ? outer : makeScope(scope, true);
            if (node.type !== 'ArrowFunctionExpression') scope.names.set('arguments', scope.id + '/arguments');
            if (node.type === 'FunctionExpression' && node.id) declare(node.id, scope, 'function');
            node.params.forEach(item => declare(item, scope, root ? 'factory' : 'parameter'));
        } else if (['BlockStatement', 'CatchClause', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'SwitchStatement'].includes(node.type))
            scope = makeScope(scope);
        scopes.set(node, scope);
        if (node.type === 'CatchClause') declare(node.param, scope, 'catch');
        if (node.type === 'ClassDeclaration') declare(node.id, scope, 'class');
        if (node.type === 'VariableDeclaration') {
            let target = scope;
            if (node.kind === 'var') while (!target.isFunction) target = target.parent;
            node.declarations.forEach(item => declare(item.id, target, node.kind));
        }
        for (const [, child] of children(node)) prepare(child, scope);
    }
    prepare(fn, outer, true);
    const resolve = (scope, name) => {
        for (let current = scope; current; current = current.parent) if (current.names.has(name)) return current.names.get(name);
        if (intrinsic.has(name)) return 'intrinsic/' + name;
        fail('free_reference:' + logicalPath + ':' + name);
    };
    const origin = (binding, term) => {
        const rows = origins.get(binding) ?? []; rows.push(term); origins.set(binding, rows);
    };
    const propertyName = node => !node.computed && node.property?.type === 'Identifier' ? node.property.name :
        node.property?.type === 'Literal' && typeof node.property.value === 'string' ? node.property.value : null;
    const passiveArgument = node => node && (['Identifier', 'Literal', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)
        || node.type === 'ArrayExpression' && node.elements.every(passiveArgument)
        || node.type === 'ObjectExpression' && node.properties.every(property => property.type === 'Property'
            && property.kind === 'init' && !property.computed && passiveArgument(property.value)));
    // Syntax is only a prerequisite. The linker separately binds Object.freeze
    // to the unmodified intrinsic; no user function or identifier argument is run.
    const passiveFreeze = node => node?.type === 'CallExpression' && !node.optional
        && node.callee.type === 'MemberExpression' && !node.callee.computed && !node.callee.optional
        && node.callee.object.type === 'Identifier' && node.callee.object.name === 'Object'
        && node.callee.property.name === 'freeze' && node.arguments.length === 1
        && ['ObjectExpression', 'ArrayExpression'].includes(node.arguments[0].type)
        && passiveArgument(node.arguments[0]);
    function term(node) {
        if (!node) return { kind: 'uninitialized' };
        if (node.type === 'Identifier') return { kind: 'binding', binding: resolve(scopes.get(node), node.name) };
        if (['FunctionExpression', 'FunctionDeclaration', 'ArrowFunctionExpression'].includes(node.type))
            return { kind: 'local_function', module: logicalPath, function_id: 'function@' + node.start,
                body_sha256: sha(canonicalValue(clean(node))) };
        if (node.type === 'MemberExpression') return { kind: 'member', receiver: term(node.object),
            property: propertyName(node), computed: node.computed, optional: node.optional };
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require')
            return { kind: 'import_namespace', specifier: node.arguments[0]?.value };
        if (node.type === 'CallExpression' || node.type === 'NewExpression') return { kind: 'call_result', site: node.start + ':' + node.end };
        if (node.type === 'Literal') return { kind: 'literal',
            value: ['string', 'number', 'boolean'].includes(typeof node.value) || node.value === null ? node.value : null,
            passive_primitive: ['string', 'number', 'boolean'].includes(typeof node.value) || node.value === null,
            syntax_sha256: sha(canonicalValue(clean(node))) };
        if (node.type === 'ObjectExpression') return { kind: 'object', properties: node.properties.map(property =>
            property.type === 'Property' && property.kind === 'init' && !property.computed
                ? { name: property.key.type === 'Identifier' ? property.key.name
                    : ['string', 'number'].includes(typeof property.key.value) ? String(property.key.value) : null,
                    term: term(property.value) }
                : { name: null, term: { kind: 'unclassified_property' } }) };
        if (node.type === 'ArrayExpression') return { kind: 'array', elements: node.elements.map(term) };
        return { kind: 'unclassified_expression', type: node.type, site: node.start };
    }
    function bindPattern(pattern, value) {
        if (pattern.type === 'Identifier') origin(resolve(scopes.get(pattern), pattern.name), value);
        else if (pattern.type === 'ObjectPattern') for (const property of pattern.properties) {
            if (property.type === 'Property' && !property.computed) bindPattern(property.value,
                { kind: 'member', receiver: value,
                    property: property.key.type === 'Identifier' ? property.key.name : property.key.value,
                    computed: false, optional: false });
            else if (property.type === 'RestElement') bindPattern(property.argument, { kind: 'unclassified_rest' });
        } else if (pattern.type === 'AssignmentPattern') bindPattern(pattern.left, { kind: 'unclassified_default' });
        else if (pattern.type === 'ArrayPattern') for (const item of pattern.elements) if (item)
            bindPattern(item, { kind: 'unclassified_array_binding' });
        else if (pattern.type === 'RestElement') bindPattern(pattern.argument, { kind: 'unclassified_rest' });
    }
    function scan(node, parent = null, key = null, owner = null) {
        const scope = scopes.get(node);
        if (functions.includes(node)) owner = 'function@' + node.start;
        // Whole syntactic obligations, including implicit hooks/coercion. This
        // is deliberately not a purity classifier: retaining a site neither
        // executes it nor proves that a receiver, primitive or branch is safe.
        let effectKind = null;
        if (['CallExpression', 'NewExpression'].includes(node.type)) effectKind = 'call';
        else if (node.type === 'MemberExpression') effectKind = 'property_read';
        else if (['AssignmentExpression', 'UpdateExpression'].includes(node.type)
            || node.type === 'UnaryExpression' && node.operator === 'delete') effectKind = 'mutation';
        else if (['BinaryExpression', 'UnaryExpression', 'TemplateLiteral'].includes(node.type)) effectKind = 'coercion';
        else if (['ForOfStatement', 'ForInStatement', 'ArrayPattern'].includes(node.type)) effectKind = 'iteration';
        else if (node.type === 'SpreadElement' || node.type === 'RestElement') effectKind = 'spread';
        else if (node.type === 'ObjectPattern') effectKind = 'destructuring';
        else if (node.type === 'Property' && node.kind !== 'init') effectKind = 'accessor_definition';
        else if (node.type === 'Property' && node.computed) effectKind = 'computed_property';
        else if (['AwaitExpression', 'YieldExpression', 'TaggedTemplateExpression', 'ImportExpression',
            'ClassDeclaration', 'ClassExpression', 'WithStatement'].includes(node.type)) effectKind = 'unsupported_effect_form';
        else if (functions.includes(node) && (node.async || node.generator)) effectKind = 'suspending_function';
        if (effectKind) effectSites.push({ site: node.start + ':' + node.end, kind: effectKind,
            operation: node.type, operator: node.operator ?? null, enclosing_function: owner,
            syntax_sha256: sha(canonicalValue(clean(node))), runtime_effect_proved: false });
        if (node.type === 'Identifier' && !declared.has(node)
            && !(parent?.type === 'MemberExpression' && key === 'property' && !parent.computed)
            && !(parent?.type === 'Property' && key === 'key' && !parent.computed)
            && !(parent?.type === 'MethodDefinition' && key === 'key' && !parent.computed)
            && !(['LabeledStatement', 'BreakStatement', 'ContinueStatement'].includes(parent?.type) && key === 'label')) {
            const binding = resolve(scope, node.name);
            if (node.name === 'require' && !(parent?.type === 'CallExpression' && key === 'callee')) fail('require_alias');
            references.push([node.name, binding, node.start]);
        }
        if (node.type === 'CallExpression' || node.type === 'NewExpression') {
            calls.push([node.type, sha(canonicalValue(clean(node.callee))), node.start]);
            callSites.push({ site: node.start + ':' + node.end, operation: node.type, callee: term(node.callee),
                arguments: node.arguments.map(term), argument_syntax_effect_free: node.arguments.every(passiveArgument),
                passive_freeze_construction: passiveFreeze(node),
                optional: node.optional ?? false, enclosing_function: owner });
            if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
                if (node.optional || node.arguments.length !== 1 || node.arguments[0].type !== 'Literal'
                    || typeof node.arguments[0].value !== 'string') fail('dynamic_import');
                imports.push(node.arguments[0].value);
                if (parent?.type === 'VariableDeclarator' && key === 'init' && parent.id.type === 'ObjectPattern') {
                    for (const property of parent.id.properties) {
                        if (property.type !== 'Property' || property.computed || property.value.type !== 'Identifier')
                            fail('import_binding');
                        const name = property.key.type === 'Identifier' ? property.key.name : property.key.value;
                        if (typeof name !== 'string') fail('import_binding');
                        importedSymbols.push({ specifier: node.arguments[0].value, exported_name: name,
                            local_binding: resolve(scope, property.value.name) });
                    }
                }
            }
        }
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init?.type === 'Identifier')
            aliases.push([resolve(scope, node.id.name), resolve(scope, node.init.name)]);
        if (node.type === 'VariableDeclarator') bindPattern(node.id, term(node.init));
        if (node.type === 'FunctionDeclaration') origin(declarationBindings.get(node), term(node));
        if (node.type === 'FunctionExpression' && node.id) origin(resolve(scope, node.id.name), term(node));
        if (['AssignmentExpression', 'UpdateExpression'].includes(node.type)) {
            const assigned = node.type === 'AssignmentExpression' ? node.left : node.argument;
            const mark = pattern => {
                if (pattern.type === 'Identifier') writes.add(resolve(scopes.get(pattern), pattern.name));
                else if (pattern.type === 'MemberExpression') {
                    // The single top-level module.exports declaration is the
                    // export definition, not an unknown post-definition write.
                    if (pattern.object.type === 'Identifier' && pattern.object.name === 'module'
                        && !pattern.computed && pattern.property.name === 'exports') return;
                    let root = pattern.object;
                    while (root.type === 'MemberExpression') root = root.object;
                    if (root.type === 'Identifier') memberWrites.add(resolve(scopes.get(root), root.name));
                } else for (const [, child] of children(pattern)) mark(child);
            };
            mark(assigned);
        }
        if (['ForInStatement', 'ForOfStatement'].includes(node.type) && node.left.type === 'Identifier')
            writes.add(resolve(scopes.get(node.left), node.left.name));
        for (const [childKey, child] of children(node)) scan(child, node, childKey, owner);
    }
    scan(fn);
    // Full boundary census; only the tiny transparent forwarding grammar below
    // can contribute a returned definition. Branches/effects/defaults/loops are
    // retained but NOT solved. No arbitrary JS evaluation or capability seed.
    const transparentValue = node => node && (['Identifier', 'Literal', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)
        || passiveFreeze(node)
        || node.type === 'ArrayExpression' && node.elements.every(passiveArgument)
        || node.type === 'CallExpression' && !node.optional && node.arguments.every(transparentValue)
            && transparentValue(node.callee)
        || node.type === 'ObjectExpression' && node.properties.every(property => property.type === 'Property'
            && property.kind === 'init' && !property.computed && transparentValue(property.value)));
    const functionBoundaries = functions.map(node => {
        const returns = [];
        function walk(current) {
            if (current !== node && functions.includes(current)) return;
            if (current.type === 'ReturnStatement') returns.push({ site: current.start, value: term(current.argument) });
            for (const [, child] of children(current)) walk(child);
        }
        if (node.body.type === 'BlockStatement') walk(node.body);
        else returns.push({ site: node.body.start, value: term(node.body) });
        const statements = node.body.type === 'BlockStatement' ? node.body.body : null;
        const transparent = !node.async && !node.generator && node.params.every(parameter => parameter.type === 'Identifier')
            && (statements ? statements.length > 0 && statements.at(-1).type === 'ReturnStatement'
                && transparentValue(statements.at(-1).argument) && statements.slice(0, -1).every(statement =>
                    statement.type === 'FunctionDeclaration' || statement.type === 'VariableDeclaration'
                    && statement.kind === 'const' && statement.declarations.every(declaration =>
                        declaration.id.type === 'Identifier' && transparentValue(declaration.init)
                        && (declaration.init.type !== 'CallExpression' || passiveFreeze(declaration.init))))
                : transparentValue(node.body));
        return { function_id: 'function@' + node.start, body_sha256: sha(canonicalValue(clean(node))),
            passive_constructor_sites: (statements ? statements.flatMap(statement => statement.type === 'VariableDeclaration'
                ? statement.declarations.map(declaration => declaration.init) : statement.type === 'ReturnStatement'
                    ? [statement.argument] : []) : [node.body]).flatMap(expression => {
                const sites = [];
                function constructors(current) {
                    if (!current || ['FunctionExpression', 'ArrowFunctionExpression'].includes(current.type)) return;
                    if (passiveFreeze(current)) sites.push(current.start + ':' + current.end);
                    for (const [, child] of children(current)) constructors(child);
                }
                constructors(expression); return sites;
            }),
            parameters: node.params.map(parameter => ({ syntax: clean(parameter),
                binding: parameter.type === 'Identifier' ? resolve(scopes.get(node), parameter.name) : null })),
            returns, call_sites: callSites.filter(call => call.enclosing_function === 'function@' + node.start).map(call => call.site),
            transparent_return_grammar: transparent,
            boundary_scope: 'syntactic_returns_and_formals_not_branch_or_runtime_effect_proof' };
    });
    const exports = [];
    let exportAssignments = 0;
    function exported(node) {
        if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression'
            && node.left.object.type === 'Identifier' && node.left.object.name === 'module') {
            if (++exportAssignments !== 1 || !fn.body.body.some(statement =>
                statement.type === 'ExpressionStatement' && statement.expression === node)) fail('nonstatic_exports');
            if (node.left.computed || node.left.property.name !== 'exports' || node.operator !== '='
                || node.right.type !== 'ObjectExpression') fail('module_exports');
            for (const item of node.right.properties) {
                if (item.type !== 'Property' || item.computed || item.kind !== 'init') fail('module_export_key');
                const name = item.key.type === 'Identifier' ? item.key.name : item.key.value;
                if (typeof name !== 'string' || exports.includes(name)) fail('module_export_key');
                exports.push(name);
                exportTerms.push({ name, term: term(item.value) });
            }
        }
        for (const [, child] of children(node)) exported(child);
    }
    exported(fn);
    const result = freezeDeep({ path: logicalPath, source_sha256: sha(source), imports: [...new Set(imports)],
        exports, imported_symbols: importedSymbols, call_site_count: calls.length, references_sha256: sha(canonicalValue(references)),
        callable_origins: [...origins].map(([binding, definitions]) => ({ binding, definitions,
            mutable: writes.has(binding) })), callable_writes: [...writes], member_writes: [...memberWrites],
        export_terms: exportTerms, call_sites: callSites, function_boundaries: functionBoundaries,
        effect_sites: effectSites, effect_sites_sha256: sha(canonicalValue(effectSites)),
        effect_site_scope: 'whole_syntax_including_indirect_hooks_not_purity_or_reachability_proof',
        calls_sha256: sha(canonicalValue(calls)), aliases_sha256: sha(canonicalValue(aliases)),
        lexical_binding_count: scopeId, lexical_reference_count: references.length });
    return remember(moduleCache, key, result, 512);
}
function inspectBundle(fn, source, catalog) {
    if (fn.type !== 'FunctionExpression' || fn.async || fn.generator || fn.id || fn.params.length !== 1 || fn.params[0].name !== 'operands'
        || fn.body.body.length !== 6) fail('loader_shape');
    const body = fn.body.body;
    const factories = body[1]?.declarations?.[0]?.init?.elements;
    const edgeNode = body[2]?.declarations?.[0]?.init;
    const returned = body[5]?.argument;
    const entry = returned?.callee?.object?.arguments?.[0]?.value;
    const exportName = returned?.callee?.property?.value;
    if (!Array.isArray(factories) || factories.length !== catalog.length || !Number.isInteger(entry)
        || entry < 0 || entry >= factories.length || typeof exportName !== 'string'
        || returned.arguments?.[0]?.name !== 'operands' || returned.arguments.length > 17
        || returned.arguments.slice(1).some(node => node.type !== 'Literal'
            || !['string', 'number', 'boolean'].includes(typeof node.value) && node.value !== null)) fail('entry');
    const literal = node => {
        if (node?.type === 'Literal') return node.value;
        if (node?.type === 'ArrayExpression') return node.elements.map(literal);
        fail('edge_literal');
    };
    const links = literal(edgeNode);
    const skeleton = clean(fn);
    skeleton.body.body[1].declarations[0].init.elements = [];
    skeleton.body.body[2].declarations[0].init.elements = [];
    const constants = returned.arguments.slice(1).map(node => JSON.stringify(node.value));
    const expected = expression(`(function(operands){'use strict';const factories=[];const edges=[];const cache=new Map();
function load(index){if(cache.has(index))return cache.get(index);const module={exports:Object.create(null)};
const localRequire=name=>{const edge=edges[index].find(pair=>pair[0]===name);if(!edge)throw new Error('guest_bundle_unresolved');return load(edge[1]);};
factories[index](localRequire,module,module.exports);cache.set(index,module.exports);return module.exports;}
return load(${entry})[${JSON.stringify(exportName)}](operands${constants.length ? ',' + constants.join(',') : ''});})`);
    if (canonicalValue(skeleton) !== canonicalValue(clean(expected))) fail('loader_identity');
    if (!Array.isArray(links) || links.length !== catalog.length) fail('edge_count');
    const modules = factories.map((factory, index) => {
        if (factory.type !== 'FunctionExpression' || factory.async || factory.generator || factory.id
            || factory.params.map(node => node.name).join(',') !== 'require,module,exports') fail('factory');
        const text = source.slice(factory.body.start + 1, factory.body.end - 1);
        if (!text.startsWith('\n') || !text.endsWith('\n')) fail('factory_delimiter');
        const bytes = text.slice(1, -1);
        if (sha(bytes) !== catalog[index].sha256) fail('factory_source_binding');
        return moduleInventory(bytes, catalog[index].path);
    });
    const mapping = new Map(catalog.map((row, index) => [row.path, index]));
    let edgeCount = 0;
    for (let index = 0; index < modules.length; index++) {
        const actual = links[index];
        if (!Array.isArray(actual) || actual.length !== modules[index].imports.length) fail('import_count');
        for (let n = 0; n < actual.length; n++) {
            const pair = actual[n], specifier = modules[index].imports[n];
            if (!specifier.startsWith('./') && !specifier.startsWith('../')) fail('external_import');
            const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(catalog[index].path), specifier));
            const target = mapping.get(normalized.endsWith('.js') ? normalized : normalized + '.js');
            if (!Array.isArray(pair) || pair.length !== 2 || pair[0] !== specifier || pair[1] !== target || target === undefined)
                fail('import_resolution');
            edgeCount++;
            for (const symbol of modules[index].imported_symbols.filter(row => row.specifier === specifier))
                if (!modules[target].exports.includes(symbol.exported_name)) fail('import_export_binding');
        }
    }
    const visiting = new Set(), seen = new Set();
    function visit(index) {
        if (visiting.has(index)) fail('cycle');
        if (seen.has(index)) return;
        visiting.add(index); for (const pair of links[index]) visit(pair[1]);
        visiting.delete(index); seen.add(index);
    }
    visit(entry);
    if (seen.size !== modules.length || !modules[entry].exports.includes(exportName)) fail('unreachable_or_entry_export');
    const linkedModules = linkCallBindings(modules, links);
    const entryLink = linkedModules[entry].export_bindings.find(row => row.name === exportName);
    const targetModule = linkedModules.find(module => module.path === entryLink?.target?.module);
    const boundary = targetModule?.function_boundaries.find(row => row.function_id === entryLink.target.function_id);
    const argumentBindings = boundary && boundary.parameters.length === returned.arguments.length
        && boundary.parameters.every(parameter => parameter.binding !== null)
        ? boundary.parameters.map((parameter, index) => ({ parameter_binding: parameter.binding,
            source: index === 0 ? { kind: 'ordinary_bundle_operands_forwarding' }
                : { kind: 'closed_loader_literal', value: returned.arguments[index].value } })) : null;
    return { entry: catalog[entry].path, export_name: exportName, entry_function: entryLink?.target ?? null,
        entry_argument_bindings: argumentBindings,
        entry_binding_scope: 'exact_closed_loader_formals_not_child_receiver_dominance_proof',
        modules: linkedModules, edge_count: edgeCount };
}
// Finite syntactic callable links, not an interpreter. No branch execution,
// dominance or handle provenance is assumed. Transparent return-only forwarding
// composes exact formal/actual terms; unknown/effectful boundaries stay blocked.
// A complete census includes every UNRESOLVED call; it is not a complete proof.
function linkCallBindings(modules, links) {
    const origins = modules.map(module => new Map(module.callable_origins.map(row => [row.binding, row])));
    const invalidMembers = modules.map(module => new Set(module.member_writes));
    const namespaces = new Set();
    const targetModule = (index, specifier) => links[index].find(pair => pair[0] === specifier)?.[1];
    // Member writes propagate across simple lexical aliases, never across a
    // reassignment merely because two values initially happened to be equal.
    for (let index = 0; index < modules.length; index++) {
        let changed = true;
        while (changed) {
            changed = false;
            for (const row of origins[index].values()) for (const value of row.definitions) {
                if (value.kind !== 'binding') continue;
                if (invalidMembers[index].has(row.binding) || invalidMembers[index].has(value.binding)) {
                    for (const binding of [row.binding, value.binding]) if (!invalidMembers[index].has(binding)) {
                        invalidMembers[index].add(binding); changed = true;
                    }
                }
            }
        }
        for (const binding of invalidMembers[index]) {
            const values = origins[index].get(binding)?.definitions ?? [];
            for (const value of values) if (value.kind === 'import_namespace') {
                const target = targetModule(index, value.specifier); if (target !== undefined) namespaces.add(target);
            }
            if (values.some(value => value.kind === 'factory_parameter' && ['module', 'exports'].includes(value.name)))
                namespaces.add(index);
        }
    }
    function resolve(index, value, seen = new Set(), environment = new Map()) {
        if (seen.size >= 256) return { target: null, reason: 'finite_linkage_bound' };
        if (!value) return { target: null, reason: 'missing_origin' };
        if (value.kind === 'local_function') return { target: value, reason: null };
        if (value.kind === 'binding') {
            const key = index + ':' + value.binding;
            if (seen.has(key)) return { target: null, reason: 'alias_cycle' };
            const next = new Set(seen); next.add(key);
            if (value.binding.startsWith('intrinsic/')) {
                if (modules.some(module => module.callable_writes.includes(value.binding)
                    || module.member_writes.includes(value.binding))
                    || invalidMembers.some(invalid => invalid.has(value.binding)))
                    return { target: null, reason: 'intrinsic_reassigned' };
                return { target: { kind: 'intrinsic', name: value.binding.slice(10) }, reason: null };
            }
            const row = origins[index].get(value.binding);
            if (!row || row.definitions.length !== 1) return { target: null, reason: 'ambiguous_definition' };
            if (row.mutable || invalidMembers[index].has(value.binding)) return { target: null, reason: 'mutable_binding' };
            const actual = environment.get(key);
            return actual ? resolve(actual.index, actual.term, next, actual.environment)
                : resolve(index, row.definitions[0], next, environment);
        }
        if (value.kind === 'import_namespace') {
            const target = targetModule(index, value.specifier);
            if (target === undefined) return { target: null, reason: 'unresolved_import' };
            if (namespaces.has(target)) return { target: null, reason: 'module_namespace_mutated' };
            return { target: { kind: 'module_namespace', module_index: target, module: modules[target].path }, reason: null };
        }
        if (value.kind === 'member') {
            if (value.property === null || value.optional) return { target: null, reason: 'dynamic_member_dispatch' };
            const receiver = resolve(index, value.receiver, seen, environment);
            if (receiver.target?.kind === 'module_namespace') {
                const target = receiver.target.module_index;
                const exported = modules[target].export_terms.find(row => row.name === value.property);
                return exported ? resolve(target, exported.term, seen, environment) : { target: null, reason: 'missing_export' };
            }
            if (receiver.target?.kind === 'object_syntax') {
                const property = receiver.target.properties.find(row => row.name === value.property);
                return property ? resolve(receiver.target.module_index, property.term, seen, receiver.target.environment)
                    : { target: null, reason: 'unknown_object_property' };
            }
            if (receiver.target?.kind === 'intrinsic') return { target: { kind: 'intrinsic_member',
                name: receiver.target.name, property: value.property }, reason: null };
            return { target: null, reason: receiver.reason ?? 'receiver_provenance_unresolved' };
        }
        if (value.kind === 'factory_parameter' && value.name === 'require')
            return { target: { kind: 'closed_loader', module: modules[index].path }, reason: null };
        if (value.kind === 'object') {
            const names = value.properties.map(property => property.name);
            if (names.some(name => name === null || name === '__proto__') || new Set(names).size !== names.length)
                return { target: null, reason: 'non_passive_object_definition' };
            return { target: { kind: 'object_syntax', properties: value.properties, module_index: index, environment }, reason: null };
        }
        if (value.kind === 'call_result') {
            const key = index + ':call@' + value.site;
            if (seen.has(key)) return { target: null, reason: 'recursive_return_dispatch' };
            const next = new Set(seen); next.add(key);
            const call = modules[index].call_sites.find(row => row.site === value.site);
            if (!call || call.operation !== 'CallExpression' || call.optional || !call.argument_syntax_effect_free)
                return { target: null, reason: 'unsupported_return_invocation' };
            const linked = resolve(index, call.callee, next, environment);
            if (call.passive_freeze_construction && linked.target?.kind === 'intrinsic_member'
                && linked.target.name === 'Object' && linked.target.property === 'freeze')
                return resolve(index, call.arguments[0], next, environment);
            if (call.passive_freeze_construction) return { target: null, reason: 'passive_constructor_not_bound_intrinsic' };
            if (linked.target?.kind !== 'local_function') return { target: null, reason: linked.reason ?? 'unknown_return_effects' };
            const targetIndex = modules.findIndex(module => module.path === linked.target.module);
            const boundary = modules[targetIndex].function_boundaries.find(row => row.function_id === linked.target.function_id);
            if (!boundary?.transparent_return_grammar || boundary.returns.length !== 1
                || boundary.parameters.length !== call.arguments.length)
                return { target: null, reason: 'non_transparent_return_boundary' };
            const parameterEnvironment = new Map(environment);
            boundary.parameters.forEach((parameter, n) => parameterEnvironment.set(targetIndex + ':' + parameter.binding,
                { index, term: call.arguments[n], environment }));
            for (const site of boundary.passive_constructor_sites) {
                const constructor = modules[targetIndex].call_sites.find(row => row.site === site);
                const bound = resolve(targetIndex, constructor.callee, next, parameterEnvironment).target;
                if (bound?.kind !== 'intrinsic_member' || bound.name !== 'Object' || bound.property !== 'freeze')
                    return { target: null, reason: 'passive_constructor_not_bound_intrinsic' };
            }
            return resolve(targetIndex, boundary.returns[0].value, next, parameterEnvironment);
        }
        const reasons = { parameter: 'parameter_dispatch', call_result: 'returned_value_dispatch',
            factory_parameter: 'factory_parameter_dispatch', literal: 'literal_not_callable' };
        return { target: null, reason: reasons[value.kind] ?? 'expression_provenance_unresolved' };
    }
    return modules.map((module, index) => { const { call_sites, ...metadata } = module;
        return { ...metadata, invalid_member_bindings: [...invalidMembers[index]], module_namespace_mutated: namespaces.has(index),
            export_bindings: module.export_terms.map(row => {
            const resolved = resolve(index, row.term);
            return { name: row.name, target: resolved.target?.kind === 'local_function' ? resolved.target : null,
                reason: resolved.target?.kind === 'local_function' ? null : resolved.reason ?? 'non_function_export' };
        }), call_bindings: call_sites.map(call => {
        let linked = resolve(index, call.callee);
        if (call.optional) linked = { target: null, reason: 'optional_dispatch' };
        if (linked.target && !['local_function', 'intrinsic', 'intrinsic_member', 'closed_loader'].includes(linked.target.kind))
            linked = { target: null, reason: 'value_not_statically_callable' };
        // Internal substitution environments are not transported as authority.
        const target = linked.target ? Object.fromEntries(Object.entries(linked.target).filter(([key]) => key !== 'environment')) : null;
        return { ...call, ...linked, target, linkage_scope: 'finite_syntactic_forwarding_not_runtime_or_dominance_proof' };
    }) }; });
}
export function inspectPathExecutableClosure(raw) {
    const { source, sourceHashes, kind } = fields(raw, ['source', 'sourceHashes', 'kind']);
    if (typeof source !== 'string' || Buffer.byteLength(source) > 8 * 1024 * 1024
        || !['phase', 'metric'].includes(kind)) fail('source_or_kind');
    const catalog = JSON.parse(JSON.stringify(copyData(sourceHashes)));
    if (!Array.isArray(catalog) || !catalog.length || catalog.length > 128) fail('catalog');
    const paths = new Set();
    for (const rawRow of catalog) {
        const row = fields(rawRow, ['path', 'sha256']);
        if (typeof row.path !== 'string' || row.path.length > 512 || !/^[a-zA-Z0-9_./-]+$/.test(row.path)
            || row.path.startsWith('/') || row.path.split('/').some(part => !part || part === '..' || part === '.')
            || paths.has(row.path) || !/^sha256:[a-f0-9]{64}$/.test(row.sha256)) fail('catalog_row');
        paths.add(row.path);
    }
    const key = kind + sha(source) + sha(canonicalValue(catalog));
    if (cache.has(key)) return cache.get(key);
    const ast = expression(source), bundles = [];
    function walk(node) {
        if (node.type === 'FunctionExpression' && node.body.body[1]?.declarations?.[0]?.id?.name === 'factories') {
            bundles.push(node); return;
        }
        for (const [, child] of children(node)) walk(child);
    }
    walk(ast);
    if (bundles.length !== (kind === 'phase' ? 2 : 1)) fail('bundle_count');
    // Validate the complete outer composition too. A closed module inventory
    // cannot hide an extra ambient consumer alongside an otherwise good bundle.
    if (ast !== bundles[0]) {
        const wrapper = clean(ast);
        function replace(node) {
            for (const [key, value] of Object.entries(node)) {
                if (Array.isArray(value)) for (let index = 0; index < value.length; index++) {
                    const item = value[index];
                    if (item?.type === 'FunctionExpression' && item.body.body[1]?.declarations?.[0]?.id?.name === 'factories')
                        value[index] = { type: 'Identifier', name: '__closedBundle' };
                    else if (item?.type) replace(item);
                } else if (value?.type) {
                    if (value.type === 'FunctionExpression' && value.body.body[1]?.declarations?.[0]?.id?.name === 'factories')
                        node[key] = { type: 'Identifier', name: '__closedBundle' };
                    else replace(value);
                }
            }
        }
        replace(wrapper);
        let expectedWrapper;
        if (kind === 'phase') {
            expectedWrapper = expression(`(function(operands){'use strict';
if(operands.phase === 'derivation')return (__closedBundle)(operands);
if(operands.phase === 'proof')return (__closedBundle)(operands);
throw new Error('proof_program_phase');})`);
            if (catalog.filter(row => !row.path.endsWith('.js')).length !== 1
                || !catalog.some(row => row.path === 'provenance/derivation-program.js')
                || !catalog.some(row => row.path === 'provenance/proof-program.js')) fail('phase_catalog');
        } else {
            const properties = wrapper.body?.body?.[2]?.argument?.properties;
            const unit = properties?.[0]?.value?.value, resultKind = properties?.[1]?.value?.value;
            const allowed = { BRL_minor: ['money_minor'], count: ['nonnegative_integer'], entity_ids: ['id', 'id_set'], state: ['enum'] };
            if (!Object.hasOwn(allowed, unit) || !allowed[unit].includes(resultKind)) fail('typed_wrapper');
            expectedWrapper = expression(`(function(operands){'use strict';const evaluate=__closedBundle;
return {unit:${JSON.stringify(unit)},kind:${JSON.stringify(resultKind)},value:evaluate(operands)};})`);
        }
        if (canonicalValue(wrapper) !== canonicalValue(clean(expectedWrapper))) fail('outer_wrapper');
    } else if (kind !== 'metric') fail('phase_wrapper');
    const inventories = bundles.map((bundle, index) => {
        let rows = catalog;
        if (kind === 'phase') {
            const current = index === 0 ? 'derivation' : 'proof', other = index === 0 ? 'proof' : 'derivation';
            rows = catalog.filter(row => row.path.endsWith('.js') && row.path !== `provenance/${other}-program.js`)
                .map(row => ({ ...row, path: row.path === `provenance/${current}-program.js` ? 'provenance/program.js' : row.path }))
                .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
        } else if (catalog.some(row => !row.path.endsWith('.js'))) fail('metric_catalog');
        return inspectBundle(bundle, source, rows);
    });
    const resultData = { stage: 'path_v3_real_closed_module_lexical_inventory_not_value_flow_proof',
        kind, program_sha256: sha(source), source_catalog_sha256: sha(canonicalValue(catalog)),
        import_resolution_complete: true, module_sources_complete: true, lexical_reference_resolution_complete: true,
        call_binding_inventory_complete: true,
        function_boundary_inventory_complete: true,
        effect_site_inventory_complete: true,
        effect_site_count: inventories.reduce((n, row) => n + row.modules.reduce((m, module) => m + module.effect_sites.length, 0), 0),
        effect_site_scope: 'whole_syntax_obligations_no_effect_discharge_or_consumer_absence',
        function_boundary_scope: 'all_formals_returns_and_callback_terms_transparent_forwarding_only',
        guest_call_provenance_complete: false,
        call_binding_scope: 'all_factory_call_sites_not_runtime_dominance_or_effect_proof',
        unresolved_call_count: inventories.reduce((n, row) => n + row.modules.reduce((m, module) =>
            m + module.call_bindings.filter(call => call.target === null).length, 0), 0),
        import_binding_scope: 'static_module_edges_and_named_destructuring_not_value_flow',
        wrapper_grammar_conformance: true,
        non_module_data_sources: catalog.filter(row => !row.path.endsWith('.js')).length,
        closed_guest_bundles: bundles.length,
        closed_factory_sources: inventories.reduce((n, row) => n + row.modules.length, 0),
        closed_import_edges: inventories.reduce((n, row) => n + row.edge_count, 0),
        call_site_count: inventories.reduce((n, row) => n + row.modules.reduce((m, module) => m + module.call_site_count, 0), 0),
        inventories, inventory_sha256: sha(canonicalValue(inventories)),
        value_flow_proof_complete: false, executable_consumer_absence_proved: false,
        necessary_equivalence_proved: false, qualified: false, semantic_mutation_credit: 0,
        validation_tcb_complete: false, dp_execution: false };
    const { inventories: retainedInventories, ...summary } = resultData;
    const result = freezeDeep({ ...summary, inventories: retainedInventories,
        analysis_sha256: sha(canonicalValue(summary)) });
    return remember(cache, key, result, 256);
}
