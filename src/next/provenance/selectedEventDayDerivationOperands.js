'use strict';
const { copyData, identifier } = require('./observationContract');
const { createInstrumentedAccess, createNodeSetAccess } = require('./instrumentedAccess');
// Normal role projection, not expected/required-reads or P selection replay.
// This profile has no parent roles and its D is formula_only. Native metric
// handles execute their own functional select and consume their resulting view.
function openSelectedEventDayDerivationOperands(raw, emit) {
    const config = copyData(raw);
    const fail = () => { throw new Error('selected_day_child_derivation_inputs'); };
    if (Object.keys(config).sort().join(',') !== 'directGroups,nodeSets,parentGroups'
        || ![config.directGroups, config.nodeSets, config.parentGroups].every(Array.isArray)
        || config.parentGroups.length || config.directGroups.length > 512 || config.nodeSets.length > 512) fail();
    const controls = [], operands = {}, roles = new Set();
    const role = name => { if (!identifier(name) || roles.has(name)) fail(); roles.add(name); };
    for (const g of config.directGroups) {
        if (Object.keys(g).sort().join(',') !== 'alias,bindings,links,role' || !Array.isArray(g.bindings)
            || g.bindings.length > 512 || !Array.isArray(g.links) || g.links.length > 8192) fail();
        role(g.role);
        const control = createInstrumentedAccess({ bindings: g.bindings, links: g.links, emit });
        controls.push(control); operands[g.role] = control.handle(g.alias);
    }
    for (const s of config.nodeSets) {
        if (Object.keys(s).sort().join(',') !== 'bindings,links,role,roster' || !Array.isArray(s.bindings)
            || s.bindings.length > 512 || !Array.isArray(s.links) || s.links.length > 8192
            || !Array.isArray(s.roster) || s.roster.length > 512) fail();
        role(s.role);
        const control = createNodeSetAccess({ role: s.role, bindings: s.bindings, roster: s.roster, links: s.links, emit });
        controls.push(control); operands[s.role] = control.handle;
    }
    return Object.freeze({ operands: Object.freeze(operands),
        healthy: () => { for (const c of controls) c.assertHealthy(); },
        revoke: () => { for (const c of controls) c.revoke(); } });
}
module.exports = { openSelectedEventDayDerivationOperands };
