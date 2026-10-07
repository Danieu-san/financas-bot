'use strict';
// Host-owned controller. Only `guest` is a future endowment; observe, measure,
// select and finish must stay in the measured TCB. This staging implementation
// does not yet certify child transport, closure, C/M/S coverage or quarantine.
const { types } = require('node:util');
const { copyData, decodeObservation, decodeMeasurement, identifier } = require('./observationContract');
const { canonicalValue, freezeDeep } = require('../kernel/canonicalValue');
const same = (a, b) => canonicalValue(a) === canonicalValue(b);
function createSelectedEventDayDispatchCore(raw) {
    const invalid = code => { throw new Error('selected_day_dispatch_' + code); };
    if (!raw || typeof raw !== 'object' || types.isProxy(raw)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) invalid('input');
    const fields = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(fields).length !== 3 || ['plan', 'scope', 'emit'].some(k =>
        !fields[k]?.enumerable || !Object.hasOwn(fields[k], 'value')) || typeof fields.emit.value !== 'function') invalid('input');
    // Privileged factory supplies the exact already-decoded packet plan.
    // This core is never imported/endowed to the proof guest.
    const plan = freezeDeep(structuredClone(copyData(fields.plan.value)));
    const scope = copyData(fields.scope.value), emit = fields.emit.value;
    if (Object.keys(scope).sort().join(',') !== 'executionId,invocationId'
        || !identifier(scope.executionId) || !identifier(scope.invocationId)) invalid('scope');
    let failed = false, finished = false, selecting = false, selected = false;
    let selectionStarted = false, index = 0, fringeIndex = 0, active = null, operand = null, totalBytes = 0;
    const rows = [], results = [];
    function fail(code) { failed = true; invalid(code); }
    function healthy() { if (failed) invalid('failed'); if (finished) invalid('finished'); }
    function callback(fn) { if (typeof fn !== 'function') fail('callback'); }
    function expectedFringe(event, site, argument) {
        const expected = plan.fringe[fringeIndex];
        if (!expected || expected.site !== site || expected.operand !== argument || !same(expected.tuple, event)) fail('fringe');
        fringeIndex++;
        return { kind: 'fringe', site, occurrence: fringeIndex - 1, operand: argument };
    }
    function record(event, owner) {
        if (rows.length >= 20000) fail('event_limit');
        const row = freezeDeep({ sequence: rows.length, execution_id: scope.executionId,
            invocation_id: scope.invocationId, phase: 'proof', event, owner });
        totalBytes += Buffer.byteLength(JSON.stringify(row), 'utf8');
        if (totalBytes > 8 * 1024 * 1024) fail('byte_limit');
        try { emit(row); } catch { fail('sink'); }
        rows.push(row);
    }
    function observe(rawEvent) {
        healthy(); let event;
        try { event = decodeObservation(rawEvent); } catch { fail('event'); }
        // Even an unused view read cannot be smuggled into the invariant core.
        if (event[5] === 'operand_selection') fail('view_consumed');
        let owner = { kind: 'core', site: active?.site ?? (selecting ? 'selection/0/scaffold' : 'proof/scaffold'),
            occurrence: active?.index ?? null, operand };
        if (['select_start', 'select_member', 'select_return'].includes(event[1])) {
            if (!selecting || active !== null || operand !== null) fail('selection_event');
            if (event[1] === 'select_start') {
                const expected = ['I', 'select_start', 'operand/proof/set/' + plan.candidate_set,
                    'proof/set/' + plan.candidate_set, [], 'operand_set', ['selection_opened']];
                if (selectionStarted || index !== 0 || !same(event, expected)) fail('selection_event');
                selectionStarted = true;
            } else {
                if (!selectionStarted || index !== plan.guard_count) fail('selection_event');
                owner = expectedFringe(event, event[1] === 'select_member' ? 'selection/0/member/0' : 'selection/0/return', null);
            }
        } else if (active?.target && event[1] === 'get' && same(event[4], ['date'])) {
            if (operand !== 0 || active.dateReads !== 0) fail('operand_event');
            owner = expectedFringe(event, active.site, 0); active.dateReads++;
        }
        record(event, owner);
    }
    function measure(rawEvent) {
        healthy(); if (active !== null || selecting || operand !== null) fail('measurement_scope');
        let event; try { event = decodeMeasurement(rawEvent); } catch { fail('measurement'); }
        record(event, { kind: 'core', site: 'proof/measurement', occurrence: null, operand: null });
    }
    function beginSite() {
        healthy();
        const site = plan.queue[index];
        if (active !== null || operand !== null || !site || site.selection_guard !== selecting
            || selecting && !selectionStarted || !selecting && !selected) fail('site');
        active = { ...site, index, dateReads: 0, operands: 0 };
    }
    function endSite(result) {
        healthy();
        if (active === null || operand !== null) fail('site');
        const site = active;
        if (typeof result !== 'boolean' || result !== site.truth) fail('site_result');
        if (site.target && (active.operands !== 2 || active.dateReads !== 1)) fail('operands');
        results.push({ site: site.site, satisfied: result }); index++; active = null; return result;
    }
    function dispatch(fn) {
        healthy(); callback(fn); beginSite();
        try {
            return endSite(fn());
        } catch (error) { failed = true; throw error; }
        finally { active = null; operand = null; }
    }
    function beginOperand() {
        healthy();
        if (!active?.target || operand !== null || active.operands >= 2) fail('operand');
        operand = active.operands++;
    }
    function endOperand() {
        healthy(); if (operand === null) fail('operand');
        if (operand === 0 && active.dateReads !== 1) fail('operand_missing'); operand = null;
    }
    function operandCall(fn) {
        healthy(); callback(fn); beginOperand();
        try { const result = fn(); endOperand(); return result;
        } catch (error) { failed = true; throw error; }
        finally { operand = null; }
    }
    function beginSelection() {
        healthy();
        if (selected || selecting || active !== null || index !== 0) fail('selection');
        selecting = true;
    }
    function endSelection() {
        healthy(); if (!selecting || active !== null || operand !== null) fail('selection');
        if (index !== plan.guard_count || fringeIndex !== 3) fail('selection_incomplete');
        selected = true; selecting = false;
    }
    function select(fn) {
        healthy(); callback(fn); beginSelection();
        try {
            const result = fn(); endSelection(); return result;
        } catch (error) { failed = true; throw error; }
        finally { selecting = false; }
    }
    function finish(result) {
        healthy();
        if (!selected || selecting || active !== null || operand !== null || index !== plan.queue.length
            || fringeIndex !== 4 || typeof result !== 'boolean' || result !== (plan.variant !== 'M')) fail('incomplete');
        finished = true;
        return freezeDeep({ stage: 'selected_day_dispatch_observations_only', raw_event_count: rows.length,
            fringe_count: fringeIndex, site_results: results, raw_rows: rows,
            measured_tcb_admission: false, executable_closure_absence_proved: false,
            profile_witness_qualified: false, financial_release_eligible: false });
    }
    return Object.freeze({ guest: Object.freeze({ dispatch, operand: operandCall,
        selectedDayOrigin: () => { healthy(); return true; }, selectedDayVariant: () => { healthy(); return plan.variant; } }),
        // Parent TCB consumes boundary messages, not guest-selected labels.
        // NEVER endow this remote lifecycle interface to the proof guest.
        remote: Object.freeze({ beginSelection, endSelection, beginSite, endSite, beginOperand, endOperand }),
        observe, measure, select, finish, revoke: () => { failed = true; } });
}
module.exports = { createSelectedEventDayDispatchCore };
