'use strict';
const { copyData } = require('./observationContract');
// Parent TCB only. Boundary messages carry no site/operand labels. The
// independent queue allocates them; a malformed boundary poisons the ledger.
function applySelectedEventDayProofBoundary(controller, raw) {
    try {
        const message = copyData(raw);
        const routes = { selection_begin: 'beginSelection', selection_end: 'endSelection',
            site_begin: 'beginSite', site_end: 'endSite', operand_begin: 'beginOperand', operand_end: 'endOperand' };
        if (!message || Array.isArray(message) || message.kind !== 'boundary'
            || !Object.hasOwn(routes, message.event)
            || Object.keys(message).sort().join(',') !== (message.event === 'site_end' ? 'event,kind,value' : 'event,kind'))
            throw new Error('selected_day_native_boundary');
        controller.remote[routes[message.event]](...(message.event === 'site_end' ? [message.value] : []));
    } catch (error) { controller.revoke(); throw error; }
}
module.exports = { applySelectedEventDayProofBoundary };
