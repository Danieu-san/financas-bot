'use strict';
// Negative child TCB only. This opens the normal instrumented primary proof
// handles; it neither reads BUILD packages nor manufactures expected traces.
const { copyData } = require('./observationContract');
const { createInstrumentedAccess, createNodeSetAccess } = require('./instrumentedAccess');
const { bindObservedContext } = require('./proofContextBinding');
function openSelectedEventDayProofOperands(raw, controller, emit) {
    const config = copyData(raw);
    const fail = () => { throw new Error('selected_day_child_proof_inputs'); };
    if (Object.keys(config).sort().join(',') !== 'bindings,directLinks,proofParentEdges,proofParentMaterials,proofSelections,proofSets'
        || ![config.bindings, config.directLinks, config.proofSets, config.proofSelections,
            config.proofParentEdges, config.proofParentMaterials].every(Array.isArray)
        || config.proofParentEdges.length || config.proofParentMaterials.length
        || config.bindings.length > 512 || config.directLinks.length > 8192
        || config.proofSets.length > 512 || config.proofSelections.length !== 1
        || config.bindings.some(b => b.role !== (b.alias === 'claim/context' ? 'proof/context' : 'proof/snapshot'))) fail();
    const controls = [];
    let failed = false, busy = false;
    const invalid = () => { failed = true; fail(); };
    const access = createInstrumentedAccess({ bindings: config.bindings, links: config.directLinks, emit });
    controls.push(access);
    const context = config.bindings.find(b => b.alias === 'claim/context');
    if (!context) invalid();
    bindObservedContext(context.value, access.handle('claim/context'));
    const materials = config.bindings.filter(b => b.alias !== 'claim/context');
    const sets = new Map(), selected = new Map(), selections = new Map();
    for (const set of config.proofSets) {
        if (Object.keys(set).sort().join(',') !== 'name,roster' || !/^[a-z][a-z0-9_]*$/.test(set.name)
            || sets.has(set.name) || !Array.isArray(set.roster)
            || set.roster.some(a => !materials.some(b => b.alias === a && b.identity))) invalid();
        const role = 'proof/set/' + set.name;
        const control = createNodeSetAccess({ role, roster: set.roster,
            bindings: materials.map(b => ({ ...b, role })), links: config.directLinks, emit });
        controls.push(control); sets.set(set.name, control.handle);
    }
    for (const s of config.proofSelections) {
        if (Object.keys(s).sort().join(',') !== 'candidate_set,selected_set' || !sets.has(s.candidate_set)
            || !/^[a-z][a-z0-9_]*$/.test(s.selected_set) || sets.has(s.selected_set) || selections.has(s.selected_set)) invalid();
        selections.set(s.selected_set, s.candidate_set);
    }
    function resolveReference(alias, field, ref) {
        if (![alias, field, ref].every(v => typeof v === 'string')) invalid();
        const links = config.directLinks.filter(l => l.source === alias && l.field === field
            && materials.some(b => b.alias === l.target && b.identity?.ref_id === ref));
        if (links.length !== 1) invalid(); return access.handle(alias).traverse(links[0].id);
    }
    const operands = Object.freeze({ phase: 'proof', ...controller.guest,
        node: alias => access.handle(alias), claim: () => access.handle('claim/context'),
        set: name => { if (selected.has(name)) return selected.get(name);
            if (typeof name !== 'string' || !sets.has(name)) invalid(); return sets.get(name); },
        select: (candidate, target, predicate) => controller.select(() => {
            if (busy || typeof predicate !== 'function' || selected.has(target)
                || selections.get(target) !== candidate || !sets.has(candidate)) invalid();
            busy = true;
            try { const view = sets.get(candidate).select(predicate); healthy(); selected.set(target, view); return view; }
            finally { busy = false; }
        }), resolveReference,
        memberEdge: (member, field) => {
            if (typeof field !== 'string') invalid();
            const owners = controls.filter(c => typeof c.rootAliasIfOwned === 'function')
                .map(c => c.rootAliasIfOwned(member)).filter(a => a !== undefined);
            if (owners.length !== 1) invalid();
            const tuple = ['kind', 'ref_id', 'version'].map(k => member.identity(k));
            const matches = materials.filter(b => JSON.stringify(['kind', 'ref_id', 'version'].map(k => b.identity[k])) === JSON.stringify(tuple));
            if (matches.length !== 1 || matches[0].alias !== owners[0]) invalid();
            return resolveReference(owners[0], field, member.get(field));
        }, edge: id => { const links = config.directLinks.filter(l => l.id === id);
            if (links.length !== 1) invalid(); return access.handle(links[0].source).traverse(id); }
    });
    function healthy() { if (failed) invalid(); for (const c of controls) c.assertHealthy(); }
    return Object.freeze({ operands, healthy, revoke: () => { for (const c of controls) c.revoke(); } });
}
module.exports = { openSelectedEventDayProofOperands };
