'use strict';
const { parseDate, parseMonth } = require('./civilCalendar');
const { validateLiteral } = require('./literalTypes');
const { createCategoryReader } = require('./metricSelection');
const fail = code => { throw new Error(`effect_metric_${code}`); };
const id = value => { validateLiteral({ type: 'id', value }); return value; };
const money = value => { if (!Number.isSafeInteger(value) || Object.is(value, -0)) fail('amount'); return value; };
function identity(node, kind) {
    if (node.identity('kind') !== kind) fail('identity');
    const ref = id(node.get('id')); validateLiteral({ type: 'digest', value: node.identity('version') }); return ref;
}
function evaluateEffects(operands, metric) {
    if (!['consumption_effect', 'net_consumption', 'invoice_payment_consumption_effect', 'gross_consumption', 'refund_amount'].includes(metric)) fail('metric');
    const context = operands.context; if (context.get('time_basis') !== 'event_date') fail('basis');
    const period = context.get('period'); const periodKind = period.get('kind'); const periodValue = period.get('value');
    if (periodKind === 'month') parseMonth(periodValue);
    else if (periodKind === 'date') parseDate(periodValue); else fail('period');
    const subject = context.get('subject'); const kind = subject.get('kind');
    if (!['event', 'person_category', 'transfer_pair'].includes(kind)) fail('scope');
    if (kind === 'transfer_pair' && metric !== 'consumption_effect') fail('scope');
    if (kind === 'person_category' && !['net_consumption', 'gross_consumption'].includes(metric)) fail('scope');
    const reference = kind === 'person_category' ? null : id(subject.get('ref_id'));
    const person = kind === 'person_category' ? id(subject.get('person_id')) : null;
    const category = kind === 'person_category' ? id(subject.get('category_id')) : null;
    const reader = metric === 'refund_amount' ? null : createCategoryReader(operands.categories);
    const seen = new Set(); const linkedPurchases = new Set(); const economicKinds = new Map();
    const selected = operands.events.select(event => {
        const ref = identity(event, 'event'); if (seen.has(ref)) fail('duplicate'); seen.add(ref);
        const date = event.get('date'); parseDate(date);
        const state = event.get('state'); if (!['confirmed', 'projected'].includes(state)) fail('state');
        const owner = id(event.get('person_id'));
        let own;
        if (reader) own = reader.read(event);
        else {
            const cat = event.follow('category_id'); identity(cat, 'category');
            own = { key: id(cat.get('id')), economicKind: cat.get('kind') };
            if (own.economicKind !== 'compensation') fail('compensation');
        }
        economicKinds.set(ref, own.economicKind);
        let effective = own; let purchase;
        if (own.economicKind === 'compensation') {
            const target = event.follow('compensates'); purchase = identity(target, 'event');
            if (purchase === ref || target.get('state') !== 'confirmed' || id(target.get('person_id')) !== owner) fail('compensation');
            if (reader) effective = reader.read(target);
            else { const cat = target.follow('category_id'); identity(cat, 'category'); effective = { key: id(cat.get('id')), economicKind: cat.get('kind') }; }
            if (effective.economicKind !== 'expense') fail('compensation');
            if (metric === 'net_consumption') linkedPurchases.add(purchase);
        }
        let scope;
        if (kind === 'person_category') scope = owner === person && effective.key === category;
        else if (kind === 'transfer_pair') scope = event.has('transfer_pair') && id(event.get('transfer_pair')) === reference;
        else scope = ref === reference || metric === 'net_consumption' && purchase === reference;
        if (metric === 'net_consumption' && purchase && !scope) fail('compensation');
        if (metric === 'invoice_payment_consumption_effect' || metric === 'consumption_effect' && kind === 'event') {
            if (own.key !== 'neutral.invoice_payment' || own.economicKind !== 'neutral') fail('payment');
            identity(event.follow('settles_card_id'), 'card'); identity(event.follow('account_id'), 'account');
        }
        return state === 'confirmed' && scope && (periodKind === 'month' ? date.slice(0, 7) === periodValue : date === periodValue);
    });
    if (kind === 'event' && !seen.has(reference)) fail('scope');
    for (const purchase of linkedPurchases) if (!seen.has(purchase)) fail('compensation');
    let result = 0;
    for (const event of selected) {
        const amount = money(event.get('amount_minor')); const ownKind = economicKinds.get(id(event.get('id')));
        const contribution = ['expense', 'compensation'].includes(ownKind) ? 0 - amount : 0;
        result = money(result + (metric === 'refund_amount' ? Math.max(0, amount)
            : metric === 'gross_consumption' ? Math.max(0, contribution) : contribution));
    }
    return result;
}
module.exports = { evaluateEffects };
