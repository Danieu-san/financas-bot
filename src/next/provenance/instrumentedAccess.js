'use strict';
const { types } = require('node:util');
const { copyData, identifier, field, scalar } = require('./observationContract');
const { digest } = require('../kernel/canonicalValue');
const failSetup = () => { throw new Error('access_shape_invalid'); };

// Shape is supplied by trusted schema/registry admission, not by guest. This
// finite transport projection is not a replacement for nominal financial types.
function checkShape(shape) {
    if (!shape || typeof shape !== 'object' || Array.isArray(shape)) failSetup();
    const keys = Object.keys(shape).sort().join(',');
    if (['scalar', 'non_material'].includes(shape.type)) { if (keys !== 'type') failSetup(); return; }
    if (shape.type === 'sequence') {
        if (keys !== 'item,type') failSetup(); checkShape(shape.item);
        if (shape.item.type === 'non_material') failSetup(); return;
    }
    if (shape.type !== 'record' || keys !== 'fields,type' || !shape.fields
        || typeof shape.fields !== 'object' || Array.isArray(shape.fields)) failSetup();
    for (const [key, child] of Object.entries(shape.fields)) { if (!field(key)) failSetup(); checkShape(child); }
}
function checkValue(value, shape) {
    if (shape.type === 'non_material') return;
    if (shape.type === 'scalar') { if (!scalar(value)) failSetup(); return; }
    if (shape.type === 'sequence') {
        if (!Array.isArray(value)) failSetup(); for (const child of value) checkValue(child, shape.item); return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) failSetup();
    for (const [key, child] of Object.entries(value)) {
        if (!Object.hasOwn(shape.fields, key)) failSetup(); checkValue(child, shape.fields[key]);
    }
}
function frozenInterface(methods) {
    const object = Object.create(null);
    for (const key of Reflect.ownKeys(methods)) {
        const fn = methods[key]; Object.setPrototypeOf(fn, null); Object.freeze(fn);
        Object.defineProperty(object, key, { value: fn, enumerable: typeof key === 'string' });
    }
    return Object.freeze(object);
}

function createInstrumentedAccess(options) {
    // Accessors/Proxy on the control object must not run before data admission.
    if (!options || typeof options !== 'object' || types.isProxy(options)) failSetup();
    const d = Object.getOwnPropertyDescriptors(options);
    if (![2, 3].includes(Reflect.ownKeys(d).length) || Reflect.ownKeys(d).some(k => !['bindings', 'emit', 'links'].includes(k)) || !d.bindings || !d.emit
        || !Object.hasOwn(d.bindings, 'value') || !Object.hasOwn(d.emit, 'value')
        || d.links && !Object.hasOwn(d.links, 'value')
        || typeof d.emit.value !== 'function') failSetup();
    const bindings = copyData(d.bindings.value); const emit = d.emit.value;
    const links = copyData(d.links ? d.links.value : []);
    if (!Array.isArray(bindings) || !bindings.length || bindings.length > 512) failSetup();
    const roots = new Map();
    for (const b of bindings) {
        if (!b || typeof b !== 'object' || Array.isArray(b)
            || !['alias,role,shape,value', 'alias,identity,role,shape,value'].includes(Object.keys(b).sort().join(',')) || !identifier(b.alias) || !identifier(b.role)
            || roots.has(b.alias) || !['record', 'sequence'].includes(b.shape?.type)) failSetup();
        if (Object.hasOwn(b, 'identity')) {
            const id = b.identity;
            if (!id || Object.keys(id).sort().join(',') !== 'kind,ref_id,version'
                || typeof id.kind !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id.kind)
                || typeof id.ref_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,159}$/.test(id.ref_id)
                || typeof id.version !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(id.version)
                || b.shape.type !== 'record' || b.shape.fields.id?.type !== 'scalar' || b.value.id !== id.ref_id) failSetup();
        }
        checkShape(b.shape); checkValue(b.value, b.shape); roots.set(b.alias, b);
    }
    if (!Array.isArray(links) || links.length > 8192) failSetup();
    const relations = new Map();
    for (const link of links) {
        if (!link || typeof link !== 'object' || Array.isArray(link)
            || Object.keys(link).sort().join(',') !== 'field,id,source,target,type'
            || !identifier(link.id) || !identifier(link.source) || !identifier(link.target) || !field(link.field)
            || !['ref', 'ref_list', 'role_ref_list'].includes(link.type) || relations.has(link.id)) failSetup();
        const source = roots.get(link.source); const target = roots.get(link.target);
        const shape = source?.shape.fields?.[link.field];
        if (!source || !target || source.role !== target.role || target.shape.fields?.id?.type !== 'scalar'
            || (link.type === 'ref' ? shape?.type !== 'scalar'
                : shape?.type !== 'sequence' || (link.type === 'ref_list' ? shape.item.type !== 'scalar'
                    : shape.item.type !== 'record' || shape.item.fields.parent_ref?.type !== 'scalar'))) failSetup();
        relations.set(link.id, link);
    }
    let revoked = false; let failed = false;
    function fail(code) { failed = true; throw new Error(`access_${code}`); }
    function check() { if (failed) fail('failed'); if (revoked) fail('revoked'); }
    function event(op, b, path, projection, outcome) {
        check();
        let tuple;
        try { tuple = copyData(['I', op, b.alias, b.role, path, projection, outcome]); }
        catch { fail('event_invalid'); }
        try { emit(tuple); } catch { fail('sink_failed'); }
        check(); // The trusted transport may revoke this scope while accepting I.
    }
    function outcome(value, shape) {
        return shape.type === 'scalar' ? ['scalar', value] : ['container', shape.type];
    }
    function exposed(value, shape, b, path, projection) {
        return shape.type === 'scalar' ? value : handle(value, shape, b, path, projection);
    }
    function handle(value, shape, b, path, projection) {
        function recordField(key) {
            check(); if (shape.type !== 'record' || !field(key) || !Object.hasOwn(shape.fields, key)
                || shape.fields[key].type === 'non_material') fail('field_forbidden');
            return shape.fields[key];
        }
        function sequence() { check(); if (shape.type !== 'sequence') fail('operation_invalid'); }
        function at(index, op = 'at') {
            sequence(); if (!Number.isSafeInteger(index) || index < 0 || Object.is(index, -0)) fail('index_invalid');
            const childPath = [...path, index];
            if (index >= value.length) { event(op, b, childPath, projection, [op === 'next' ? 'done' : 'absent']); return undefined; }
            event(op, b, childPath, projection, outcome(value[index], shape.item));
            return exposed(value[index], shape.item, b, childPath, projection);
        }
        function iterator() {
            sequence(); event('iterate', b, path, projection, ['opened']);
            let index = 0; let closed = false; let result;
            const packet = (done, item) => Object.freeze(Object.assign(Object.create(null), { done, value: item }));
            result = frozenInterface({
                next: () => {
                    check();
                    if (closed || index >= value.length) {
                        event('next', b, [...path, index], projection, ['done']); closed = true; return packet(true, undefined);
                    }
                    const item = at(index, 'next'); index++; return packet(false, item);
                },
                return: () => { check(); event('return', b, path, projection, ['closed', index]); closed = true; return packet(true, undefined); },
                [Symbol.iterator]: () => {
                    event('reuse_iterator', b, path, projection, ['cursor', index, closed]); return result;
                }
            });
            return result;
        }
        return frozenInterface({
            identity: key => {
                check();
                if (path.length || projection !== 'data' || !b.identity || !['kind', 'ref_id', 'version'].includes(key)) fail('identity_forbidden');
                const value = b.identity[key]; event('identity', b, [key], 'node_identity', ['scalar', value]); return value;
            },
            traverse: edgeId => {
                check();
                const link = typeof edgeId === 'string' ? relations.get(edgeId) : undefined;
                if (path.length || projection !== 'data' || !link || link.source !== b.alias) fail('traversal_forbidden');
                // Re-enter observed field APIs; the compiled graph alone is
                // never evidence that a runtime reference actually matches.
                const source = handle(value, shape, b, [], 'data');
                const references = source.get(link.field);
                const targetBinding = roots.get(link.target);
                const target = handle(targetBinding.value, targetBinding.shape, targetBinding, [], 'data');
                const targetId = target.get('id');
                if (typeof targetId !== 'string' || references === undefined) fail('traversal_identity');
                let matches = false;
                if (link.type === 'ref') matches = references === targetId;
                else for (const item of references) {
                    const ref = link.type === 'ref_list' ? item : item.get('parent_ref');
                    if (ref === targetId) matches = true;
                }
                if (!matches) fail('traversal_mismatch');
                event('traverse', b, [link.field], 'data', ['edge', link.id, link.target]);
                return target;
            },
            get: key => {
                const child = recordField(key); const childPath = [...path, key];
                if (!Object.hasOwn(value, key)) { event('get', b, childPath, projection, ['absent']); return undefined; }
                event('get', b, childPath, projection, outcome(value[key], child));
                return exposed(value[key], child, b, childPath, projection);
            },
            has: key => { recordField(key); const present = Object.hasOwn(value, key);
                event('has', b, [...path, key], projection, ['boolean', present]); return present; },
            keys: () => {
                check(); if (projection !== 'data') fail('projection_invalid');
                const keys = Object.keys(value).filter(key => shape.type === 'sequence' || shape.fields[key].type !== 'non_material');
                event('keys', b, path, projection, ['keys', ...keys]);
                return handle(Object.freeze(keys), { type: 'sequence', item: { type: 'scalar' } }, b, path, 'keys');
            },
            length: () => { sequence(); event('length', b, path, projection, ['count', value.length]); return value.length; },
            at: index => at(index),
            includes: needle => {
                sequence(); if (shape.item.type !== 'scalar' || !scalar(needle)) fail('membership_invalid');
                const present = value.includes(needle); event('includes', b, path, projection, ['membership', needle, present]); return present;
            },
            [Symbol.iterator]: iterator
        });
    }
    return Object.freeze({
        handle: alias => { check(); if (typeof alias !== 'string' || !roots.has(alias)) fail('binding_invalid');
            const b = roots.get(alias); return handle(b.value, b.shape, b, [], 'data'); },
        revoke: () => { revoked = true; },
        assertHealthy: () => { if (failed) fail('failed'); }
    });
}

// TCB construction of an ordered operand roster. Members may have different
// admitted snapshot shapes; neither their raw objects nor the roster cross to
// guest code. Structural events describe this role, not a snapshot payload.
function createNodeSetAccess(options) {
    if (!options || typeof options !== 'object' || types.isProxy(options)) failSetup();
    const d = Object.getOwnPropertyDescriptors(options);
    const withLinks = Object.hasOwn(d, 'links') || Object.hasOwn(d, 'roster');
    const expected = withLinks ? ['role', 'bindings', 'emit', 'links', 'roster'] : ['role', 'bindings', 'emit'];
    if (Reflect.ownKeys(d).length !== expected.length || expected.some(k => !d[k] || !Object.hasOwn(d[k], 'value'))
        || typeof d.emit.value !== 'function') failSetup();
    const role = d.role.value; const bindings = copyData(d.bindings.value); const emit = d.emit.value;
    if (!identifier(role) || !identifier(`operand/${role}`) || !Array.isArray(bindings) || bindings.length > 512
        || bindings.some(b => b?.role !== role)) failSetup();
    const links = withLinks ? copyData(d.links.value) : [];
    const aliases = withLinks ? copyData(d.roster.value) : bindings.map(b => b.alias);
    if (!Array.isArray(links) || !Array.isArray(aliases) || new Set(aliases).size !== aliases.length
        || aliases.some(alias => !identifier(alias) || !bindings.some(b => b.alias === alias))
        || !bindings.length && links.length) failSetup();
    const members = bindings.length ? createInstrumentedAccess({ bindings, emit, links }) : null;
    const b = { alias: `operand/${role}`, role };
    let revoked = false; let failed = false; let selectionBusy = false; let selectionCount = 0;
    function fail(code) { failed = true; members?.revoke(); throw new Error(`access_set_${code}`); }
    function check() {
        if (failed) fail('failed'); if (revoked) fail('revoked');
        try { members?.assertHealthy(); } catch { fail('member_failed'); }
    }
    function event(op, path, outcome, projection) {
        check();
        try { emit(copyData(['I', op, b.alias, b.role, path, projection, outcome])); }
        catch { fail('sink'); }
        check();
    }
    function view(roster, viewId) {
        const prefix = viewId ? [viewId] : [];
        const projection = viewId ? 'operand_selection' : 'operand_set';
        const observe = (op, path, outcome) => event(op, [...prefix, ...path], outcome, projection);
        function at(index, op = 'at') {
            check(); if (!Number.isSafeInteger(index) || index < 0 || Object.is(index, -0)) fail('index');
            if (index >= roster.length) { observe(op, [index], [op === 'next' ? 'done' : 'absent']); return undefined; }
            const alias = roster[index]; observe(op, [index], ['node', alias]);
            return members.handle(alias);
        }
        function iterator() {
            observe('iterate', [], ['opened']); let index = 0; let closed = false; let result;
            const packet = (done, value) => Object.freeze(Object.assign(Object.create(null), { done, value }));
            result = frozenInterface({
                next: () => {
                    check();
                    if (closed || index >= roster.length) {
                        observe('next', [index], ['done']); closed = true; return packet(true, undefined);
                    }
                    const value = at(index, 'next'); index++; return packet(false, value);
                },
                return: () => { observe('return', [], ['closed', index]); closed = true; return packet(true, undefined); },
                [Symbol.iterator]: () => { observe('reuse_iterator', [], ['cursor', index, closed]); return result; }
            });
            return result;
        }
        return frozenInterface({
            length: () => { observe('length', [], ['count', roster.length]); return roster.length; },
            at: index => at(index),
            includes: alias => {
                check(); if (!identifier(alias)) fail('membership');
                const present = roster.includes(alias); observe('includes', [], ['membership', alias, present]); return present;
            },
            select: predicate => {
                check(); if (typeof predicate !== 'function') fail('predicate');
                if (selectionBusy) fail('selection_reentry');
                if (selectionCount >= 512) fail('selection_limit');
                selectionCount++; selectionBusy = true;
                try {
                    observe('select_start', [], ['selection_opened']);
                    const selected = [];
                    for (let index = 0; index < roster.length; index++) {
                        let decision;
                        try { decision = predicate(at(index), index); } catch { fail('predicate_threw'); }
                        check(); // Caught forbidden reads/revocation still invalidate this operation.
                        if (typeof decision !== 'boolean') fail('predicate_result');
                        observe('select_member', [index], ['decision', roster[index], decision]);
                        if (decision) selected.push(roster[index]);
                    }
                    // Content identity of the ordered roster only, not proof of
                    // snapshot/value identity. Repeated executions remain in I.
                    const id = `view_${digest({ role, aliases: selected })}`;
                    observe('select_return', [], ['selected', id, ...selected]);
                    return view(Object.freeze(selected), id);
                } finally { selectionBusy = false; }
            },
            [Symbol.iterator]: iterator
        });
    }
    return Object.freeze({ handle: view(aliases),
    revoke: () => { revoked = true; members?.revoke(); },
    assertHealthy: () => { if (failed) fail('failed'); members?.assertHealthy(); }
    });
}

module.exports = { createInstrumentedAccess, createNodeSetAccess };
