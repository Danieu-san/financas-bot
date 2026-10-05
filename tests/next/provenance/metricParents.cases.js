'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createInstrumentedAccess, createNodeSetAccess, createDerivedParentAccess } =
    require('../../../src/next/provenance/instrumentedAccess');
const { evaluateParentMetric } = require('../../../src/next/provenance/metricParents');

const scalar = { type: 'scalar' };
const hash = `sha256:${'a'.repeat(64)}`;
function fixture(metric, leftValue, rightValue, direction = 'desc') {
    const events = []; const emit = event => events.push(event);
    const context = createInstrumentedAccess({ emit, bindings: [{
        alias: 'claim/context', role: 'context',
        value: { time_basis: metric === 'income_minus_open_bills' ? 'mixed_declared' : 'event_date',
            period: { kind: 'month', value: '2042-06' },
            subject: metric === 'consumption_difference'
                ? { kind: 'person_comparison', person_ids: ['person-a', 'person-b'] }
                : { kind: 'family', ref_id: 'family-example' } },
        shape: { type: 'record', fields: { time_basis: scalar,
            period: { type: 'record', fields: { kind: scalar, value: scalar } },
            subject: { type: 'record', fields: metric === 'consumption_difference'
                ? { kind: scalar, person_ids: { type: 'sequence', item: scalar } }
                : { kind: scalar, ref_id: scalar } } } }
    }] });
    const parentBindings = [leftValue, rightValue].map((value, i) => {
        const role = i ? 'right' : 'left'; const alias = `parent_${role}`;
        return { alias, role, identity: { kind: 'derived_claim', ref_id: `claim-${role}`, version: hash },
            value: { id: `claim-${role}`, fact_key: `M-01#1#${i + 1}`,
                evaluator_version: 1, result_hash: hash,
                result: { unit: 'BRL_minor', kind: 'money_minor', value }, parents: [] },
            shape: { type: 'record', fields: { id: scalar, fact_key: scalar,
                evaluator_version: scalar, result_hash: scalar,
                result: { type: 'record', fields: { unit: scalar, kind: scalar, value: scalar } },
                parents: { type: 'sequence', item: { type: 'scalar' } } } } };
    });
    const parents = createDerivedParentAccess({ phase: 'derivation', emit, bindings: parentBindings,
        edges: ['left', 'right'].map(role => ({ id: `derived_${role}`, source: 'claim',
            relation: 'derived_from', field: role, target: `parent_${role}` })) });
    const operands = { context: context.handle('claim/context'),
        left: parents.traverse('derived_left'), right: parents.traverse('derived_right') };
    const policy = [];
    const people = createNodeSetAccess({ role: 'people', emit,
        bindings: ['person-a', 'person-b'].map((id, i) => ({ alias: `person_${i}`, role: 'people',
            value: { id }, shape: { type: 'record', fields: { id: scalar } } })),
        roster: ['person_0', 'person_1'], links: [] });
    operands.people = people.handle;
    for (const role of ['sort_key', 'sort_direction']) {
        const control = createInstrumentedAccess({ emit, bindings: [{
            alias: 'policy', role,
            value: { ranking_key: 'validated_consumption_minor', ranking_direction: direction,
                ranking_tie_break: 'lexical_internal_id' },
            shape: { type: 'record', fields: { ranking_key: scalar,
                ranking_direction: scalar, ranking_tie_break: scalar } }
        }] });
        policy.push(control); operands[role] = control.handle('policy');
    }
    return { operands, events, revoke() {
        for (const control of [context, parents, people, ...policy]) control.revoke();
    } };
}

test('N02G:PARENT-METRIC-001 subtraction preserves signed role order and observes both parent values', () => {
    for (const metric of ['consumption_difference', 'income_minus_open_bills']) {
        const f = fixture(metric, 3, 5);
        assert.equal(evaluateParentMetric(f.operands, metric), -2);
        assert.deepEqual(f.events.filter(e => e[1] === 'get' && e[4].join('.') === 'result.value')
            .map(e => e[3]), ['left', 'right']);
        assert.equal(f.events.filter(e => e[1] === 'traverse').length, 2);
        f.revoke();
        const reversed = fixture(metric, 5, 3);
        assert.equal(evaluateParentMetric(reversed.operands, metric), 2);
        reversed.revoke();
    }
});

test('N02G:PARENT-METRIC-002 ranking consumes declared policy and roster; tie breaks by internal ID', () => {
    for (const [left, right, direction, expected] of [
        [3, 5, 'desc', 'person-b'], [3, 5, 'asc', 'person-a'],
        [5, 5, 'desc', 'person-a']
    ]) {
        const f = fixture('ranking_winner', left, right, direction);
        assert.equal(evaluateParentMetric(f.operands, 'ranking_winner'), expected);
        assert.deepEqual(f.events.filter(e => e[1] === 'get' && e[4].join('.') === 'id')
            .map(e => e[2]), ['person_0', 'person_1']);
        assert.ok(f.events.some(e => e[1] === 'length' && e[3] === 'people'));
        f.revoke();
    }
});

test('N02G:PARENT-METRIC-003 invalid policy and revoked parent handle fail without claiming graph acceptance', () => {
    const bad = fixture('ranking_winner', 3, 5, 'sideways');
    assert.throws(() => evaluateParentMetric(bad.operands, 'ranking_winner'), /parent_metric_ranking_policy/);
    bad.revoke();
    const revoked = fixture('consumption_difference', 3, 5);
    revoked.revoke();
    assert.throws(() => evaluateParentMetric(revoked.operands, 'consumption_difference'), /access_/);
});
