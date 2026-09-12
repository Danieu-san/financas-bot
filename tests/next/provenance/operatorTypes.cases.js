'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { unifyOperatorTypes } = require('../../../src/next/provenance/operatorTypes');
const root = path.resolve(__dirname, '../../..');
const graphs = JSON.parse(fs.readFileSync(path.join(root, 'docs/contracts/next/provenance-v2/graphs-v2.json')));
const registry = JSON.parse(fs.readFileSync(path.join(root, graphs.operator_registry.path)));
const scalar = (type, extra = {}) => ({ form: 'scalar', type, ...extra });
const node = kind => ({ form: 'node', kind });
const field = value => ({ form: 'field', value });
const collection = (form, item) => ({ form, item });
const selector = (kind, value) => ({ form: 'field_selector', kind, value });
const money = scalar('money_minor', { unit: 'BRL_minor' });
const id = kind => scalar('id', { kind });
const run = (id, args) => unifyOperatorTypes(registry.operators.find(op => op.id === id), args);
const kinds = { K: 'event', A: 'person', B: 'account', J: 'transfer_identity' };
function sample(signature) {
    if (signature === 'scalar:T' || signature === 'T') return id('person');
    if (signature === 'number:U') return money;
    if (signature.startsWith('node:')) return node(kinds[signature.slice(5)]);
    if (signature.startsWith('set:')) return collection('set', sample(signature.slice(4)));
    if (signature.startsWith('sequence:')) return collection('sequence', sample(signature.slice(9)));
    if (signature === 'field_path:T') return field(id('person'));
    if (signature.startsWith('field_selector:')) return selector(kinds[signature.split(':')[1]], id('person'));
    if (signature.startsWith('edge_selector:')) {
        const [, source, target] = signature.split(':');
        return { form: 'edge_selector', kind: kinds[source], target: kinds[target] };
    }
    if (signature === 'edge_ref:K') return { form: 'edge', target: kinds.K };
    if (signature === 'sort_key_descriptor:K') return { form: 'sort', kind: kinds.K };
    if (signature === 'state_path') return field(scalar('enum'));
    if (signature === 'state_literal') return { form: 'state_literal' };
    if (signature === 'kind_literal' || signature === 'digest_literal') return { form: signature };
    if (signature === 'period' || signature === 'range') return { form: signature };
    if (signature === 'predicate_template_ref') return { form: signature, kind: kinds.K };
    if (signature === 'partial_coverage_policy_ref') return { form: signature };
    return scalar(signature);
}

test('N02G:TYPES-001 every one of the 32 registered signatures has a typed witness', () => {
    assert.equal(registry.operators.length, 32);
    for (const operator of registry.operators) {
        const result = unifyOperatorTypes(operator, operator.args.map(sample));
        assert.equal(result.stage, 'signature_checked_only', operator.id);
    }
});

test('N02G:TYPES-002 nominal identities cannot unify merely because values look alike', () => {
    assert.throws(() => run('eq', [id('person'), id('card')]), /nominal_mismatch/);
    assert.throws(() => run('same_identity', [node('person'), node('card')]), /nominal_mismatch/);
    assert.throws(() => run('ref_targets_node', [{ form: 'edge', target: 'person' }, node('card')]), /nominal_mismatch/);
    assert.throws(() => run('field_eq', [field(id('person')), field(id('account'))]), /nominal_mismatch/);
    assert.throws(() => run('eq', [scalar('enum', { domain: 'coverage' }), scalar('enum', { domain: 'evidence_state' })]), /nominal_mismatch/);
    assert.throws(() => run('join_eq', [collection('set', node('person')), collection('set', node('account')),
        selector('card', id('person')), selector('account', id('person'))]), /nominal_mismatch/);
    assert.throws(() => run('edge_pair_complete', [collection('set', node('event')),
        { form: 'edge_selector', kind: 'event', target: 'transfer_identity' }, node('installment_plan')]), /nominal_mismatch/);
});

test('N02G:TYPES-003 units, containers and paths are not silently coerced', () => {
    assert.equal(run('eq', [scalar('positive_integer'), scalar('integer')]).stage, 'signature_checked_only');
    assert.equal(run('field_eq', [field(scalar('nonnegative_integer')), field(scalar('positive_integer'))]).stage, 'signature_checked_only');
    assert.throws(() => run('abs_eq', [money, scalar('integer')]), /nominal_mismatch/);
    assert.throws(() => run('eq', [scalar('date'), scalar('month')]), /nominal_mismatch/);
    assert.throws(() => run('eq', [node('person'), node('person')]), /shape/);
    assert.throws(() => run('set_eq', [collection('sequence', node('person')), collection('set', node('person'))]), /shape/);
    assert.throws(() => run('field_eq', [id('person'), id('person')]), /shape/);
    assert.throws(() => run('count_eq', [collection('set', node('person')), scalar('nonnegative_integer')]), /shape/);
    assert.throws(() => run('inclusive_day_count_matches', [{ form: 'period' }, scalar('positive_integer'), scalar('calendar')]), /shape/);
    assert.throws(() => run('date_in_period', [scalar('datetime'), { form: 'period' }]), /type/);
    assert.throws(() => run('none_match', [collection('set', node('event')), { form: 'predicate_template_ref', kind: 'person' }]), /nominal_mismatch/);
});

test('N02G:TYPES-004 unknown grammar, untyped identities and arity fail closed', () => {
    assert.throws(() => unifyOperatorTypes({ args: ['anything'] }, [scalar('text')]), /signature_unknown/);
    assert.throws(() => run('eq', [scalar('id'), scalar('id')]), /nominal_missing/);
    assert.throws(() => run('eq', [scalar('enum'), scalar('enum')]), /nominal_missing/);
    assert.throws(() => run('eq', [scalar('free_expression'), scalar('free_expression')]), /type/);
    assert.throws(() => run('eq', [scalar('boolean')]), /arity/);
    assert.throws(() => run('eq', [scalar('text'), scalar('text'), scalar('text')]), /arity/);
    assert.equal(run('civil_offset_matches', [scalar('date'), scalar('integer'), scalar('civil_unit'), scalar('date'), scalar('calendar')]).stage, 'signature_checked_only');
});

test('N02G:TYPES-005 template parameter signatures retain their field kind and value type', () => {
    assert.equal(unifyOperatorTypes({ args: ['field_selector:K:date', 'period'] },
        [selector('event', scalar('date')), { form: 'range' }]).stage, 'signature_checked_only');
    assert.throws(() => unifyOperatorTypes({ args: ['field_selector:K:date'] },
        [selector('event', scalar('datetime'))]), /type/);
    assert.throws(() => unifyOperatorTypes({ args: ['field_selector:K:enum'] },
        [selector('event', scalar('text'))]), /type/);
});
