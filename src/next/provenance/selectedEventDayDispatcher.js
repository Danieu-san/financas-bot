'use strict';
// DEVELOPMENT/BUILD wrapper; the captured runtime core has no import edge to
// this module or to authorship enumerators/compiler/precommit WeakMaps.
const { types } = require('node:util');
const { resolveSelectedEventDayLeaseExpectation } = require('./selectedEventDayProfile');
const { createSelectedEventDayDispatchCore } = require('./selectedEventDayDispatchCore');
function createSelectedEventDayDispatcher(raw) {
    const fail = () => { throw new Error('selected_day_dispatch_input'); };
    if (!raw || typeof raw !== 'object' || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) fail();
    const fields = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(fields).length !== 3 || ['leaseExpectation', 'scope', 'emit'].some(k =>
        !fields[k]?.enumerable || !Object.hasOwn(fields[k], 'value'))) fail();
    return createSelectedEventDayDispatchCore({ plan: resolveSelectedEventDayLeaseExpectation(fields.leaseExpectation.value),
        scope: fields.scope.value, emit: fields.emit.value });
}
module.exports = { createSelectedEventDayDispatcher };
