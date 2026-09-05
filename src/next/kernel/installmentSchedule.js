'use strict';

const { canonicalValue, freezeDeep } = require('./canonicalValue');

const DIMENSIONS = ['family_id', 'person_id', 'card_id', 'category_id', 'currency'];
const PURCHASE_FIELDS = [...DIMENSIONS, 'event_id', 'amount_minor', 'installment_total'];
const PART_FIELDS = [...DIMENSIONS, 'event_id', 'purchase_ref', 'index', 'total',
    'billing_period', 'amount_minor', 'evidence_state'];

function requireThat(condition, code) {
    if (!condition) throw new Error(code);
}

function exactFields(value, fields) {
    requireThat(value && !Array.isArray(value) && typeof value === 'object' &&
        Object.keys(value).sort().join(',') === [...fields].sort().join(','), 'installment_schema');
}

function identifier(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
        value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

function positiveAmount(value) {
    return Number.isSafeInteger(value) && value > 0;
}

// Internal, synthetic projection only. Inputs are explicit economic records,
// not model arguments or inferred legacy rows. No schedule is synthesized.
function projectInstallmentSchedule(raw) {
    const input = JSON.parse(canonicalValue(raw));
    exactFields(input, ['purchase', 'installments']);
    const { purchase, installments } = input;
    exactFields(purchase, PURCHASE_FIELDS);
    requireThat([...DIMENSIONS, 'event_id'].every(key => identifier(purchase[key])) &&
        purchase.currency === 'BRL', 'installment_purchase_identity');
    requireThat(positiveAmount(purchase.amount_minor), 'installment_amount');
    // Finite resource bound for this synthetic policy; not a financial maximum.
    requireThat(Number.isInteger(purchase.installment_total) &&
        purchase.installment_total >= 2 && purchase.installment_total <= 999, 'installment_count');
    requireThat(Array.isArray(installments) && installments.length <= purchase.installment_total,
        'installment_count');
    const ids = new Set([purchase.event_id]), indexes = new Set();
    let sum = 0n;
    for (const part of installments) {
        exactFields(part, PART_FIELDS);
        requireThat(identifier(part.event_id) && !ids.has(part.event_id), 'installment_identity');
        requireThat(part.purchase_ref === purchase.event_id &&
            DIMENSIONS.every(key => part[key] === purchase[key]), 'installment_link');
        requireThat(Number.isInteger(part.index) && part.index >= 1 &&
            part.index <= purchase.installment_total && !indexes.has(part.index) &&
            part.total === purchase.installment_total, 'installment_index');
        requireThat(typeof part.billing_period === 'string' &&
            /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(part.billing_period), 'installment_period');
        requireThat(['confirmed', 'projected'].includes(part.evidence_state), 'installment_state');
        requireThat(positiveAmount(part.amount_minor), 'installment_amount');
        ids.add(part.event_id);
        indexes.add(part.index);
        sum += BigInt(part.amount_minor);
    }
    requireThat(sum <= BigInt(purchase.amount_minor), 'installment_amount_exceeds_purchase');
    const missing = Array.from({ length: purchase.installment_total }, (_, i) => i + 1)
        .filter(index => !indexes.has(index));
    // Every missing part must still fit at least one minor unit. This checks
    // feasibility only; it does not synthesize amounts for missing records.
    requireThat(sum + BigInt(missing.length) <= BigInt(purchase.amount_minor),
        'installment_amount_infeasible');
    requireThat(missing.length > 0 || sum === BigInt(purchase.amount_minor), 'installment_amount_mismatch');
    const ordered = installments.sort((a, b) => a.index - b.index).map(part => ({
        ...part,
        field_provenance: Object.fromEntries(PART_FIELDS.map(field =>
            [field, { event_id: part.event_id, field }]))
    }));
    return freezeDeep({
        purchase_ref: purchase.event_id,
        purchase_amount_minor: purchase.amount_minor,
        purchase_field_provenance: { event_id: purchase.event_id, field: 'amount_minor' },
        currency: purchase.currency,
        completeness: missing.length ? 'incomplete' : 'complete',
        missing_indexes: missing,
        observed_total_minor: Number(sum),
        installments: ordered
    });
}

module.exports = { projectInstallmentSchedule };
