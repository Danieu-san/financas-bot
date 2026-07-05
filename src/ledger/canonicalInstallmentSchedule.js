const crypto = require('node:crypto');

function hash(value, length = 20) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(value))
        .digest('hex')
        .slice(0, length);
}

function normalizedText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeIsoDate(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function normalizeCompetenceMonth(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}$/.test(raw) ? raw : null;
}

function parseInstallment(value) {
    const match = String(value || '').trim().match(/^(\d{1,3})\s*\/\s*(\d{1,3})$/);
    if (!match) return null;
    const index = Number.parseInt(match[1], 10);
    const total = Number.parseInt(match[2], 10);
    if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 1 || index > total) {
        return null;
    }
    return { index, total };
}

function normalizeStatus(value) {
    const status = normalizedText(value || 'scheduled');
    if (status === 'cancelled' || status === 'canceled' || status === 'cancelado' || status === 'cancelada') {
        return 'cancelled';
    }
    if (status === 'uncertain' || status === 'incerto' || status === 'incerta') return 'uncertain';
    if (status === 'settled' || status === 'paid' || status === 'pago' || status === 'paga') return 'settled';
    return 'scheduled';
}

function normalizeRow(row = {}, ordinal = 0) {
    const installment = parseInstallment(row.installment || row.parcela);
    const amountCents = Number(row.amount_cents);
    if (!installment || installment.total <= 1 || !Number.isInteger(amountCents) || amountCents < 0) return null;
    return {
        ordinal,
        source_row_ref: String(row.source_row_ref || '').trim(),
        event_id: String(row.event_id || '').trim(),
        invoice_id: String(row.invoice_id || '').trim(),
        invoice_item_id: String(row.invoice_item_id || '').trim(),
        owner_person_id: String(row.owner_person_id || '').trim(),
        card_id: String(row.card_id || '').trim(),
        card_name: String(row.card_name || '').trim(),
        purchase_on: normalizeIsoDate(row.purchase_on || row.occurred_on),
        description: String(row.description || '').trim(),
        category: String(row.category || '').trim(),
        subcategory: String(row.subcategory || '').trim(),
        installment_index: installment.index,
        installment_total: installment.total,
        competence_month: normalizeCompetenceMonth(row.competence_month),
        amount_cents: amountCents,
        currency: String(row.currency || 'BRL').trim().toUpperCase() || 'BRL',
        status: normalizeStatus(row.status)
    };
}

function purchaseGroupingKey(row) {
    return JSON.stringify([
        normalizedText(row.owner_person_id),
        normalizedText(row.card_id || row.card_name),
        row.purchase_on || '',
        normalizedText(row.description),
        normalizedText(row.category),
        normalizedText(row.subcategory),
        row.amount_cents,
        row.installment_total,
        row.currency
    ]);
}

function createGroup(row, groupingKey) {
    return {
        groupingKey,
        rows: [row]
    };
}

function appendToBestGroup(groups, row, groupingKey) {
    const candidates = groups.filter(group =>
        group.groupingKey === groupingKey &&
        !group.rows.some(item => item.installment_index === row.installment_index)
    );
    const sequential = candidates.find(group => {
        const lastIndex = Math.max(...group.rows.map(item => item.installment_index));
        return lastIndex === row.installment_index - 1;
    });
    const fallback = candidates.at(-1);
    const target = sequential || fallback;
    if (!target) {
        groups.push(createGroup(row, groupingKey));
        return;
    }
    target.rows.push(row);
}

function buildSchedule(group) {
    const rows = group.rows.slice().sort((left, right) =>
        left.installment_index - right.installment_index || left.ordinal - right.ordinal
    );
    const first = rows[0];
    const expectedIndexes = Array.from({ length: first.installment_total }, (_, index) => index + 1);
    const observedIndexes = new Set(rows.map(row => row.installment_index));
    const missingInstallments = expectedIndexes.filter(index => !observedIndexes.has(index));
    const statuses = new Set(rows.map(row => row.status));
    const allCancelled = statuses.size === 1 && statuses.has('cancelled');
    const hasUncertainty = missingInstallments.length > 0 || statuses.has('uncertain') || (statuses.has('cancelled') && !allCancelled);
    const competenceMonths = rows.map(row => row.competence_month).filter(Boolean).sort();
    const observedInstallmentTotalCents = rows.reduce((sum, row) => sum + row.amount_cents, 0);
    const totalPurchaseCents = missingInstallments.length > 0
        ? first.amount_cents * first.installment_total
        : observedInstallmentTotalCents;
    const scheduleSeed = {
        groupingKey: group.groupingKey,
        firstSourceRowRef: first.source_row_ref
    };

    return {
        schedule_id: `sch_installment_${hash(scheduleSeed)}`,
        schedule_type: 'card_installment',
        status: allCancelled ? 'cancelled' : (hasUncertainty ? 'uncertain' : 'scheduled'),
        household_id: null,
        owner_person_id: first.owner_person_id || null,
        purchase_event_id: first.event_id || null,
        purchase_on: first.purchase_on,
        description: first.description,
        category: first.category || null,
        subcategory: first.subcategory || null,
        card_id: first.card_id || null,
        card_name: first.card_name || null,
        installment_total: first.installment_total,
        observed_installments: rows.length,
        missing_installments: missingInstallments,
        installment_value_cents: first.amount_cents,
        total_purchase_cents: totalPurchaseCents,
        observed_installment_total_cents: observedInstallmentTotalCents,
        currency: first.currency,
        first_competence_month: competenceMonths[0] || null,
        last_competence_month: competenceMonths.at(-1) || null,
        start_on: competenceMonths[0] ? `${competenceMonths[0]}-01` : first.purchase_on,
        end_on: competenceMonths.at(-1) ? `${competenceMonths.at(-1)}-01` : first.purchase_on,
        frequency: 'monthly',
        amount_cents: first.amount_cents,
        next_due_on: competenceMonths[0] ? `${competenceMonths[0]}-01` : null,
        source_id_hash: hash(scheduleSeed, 32),
        installments: rows.map(row => ({
            index: row.installment_index,
            total: row.installment_total,
            competence_month: row.competence_month,
            amount_cents: row.amount_cents,
            currency: row.currency,
            status: row.status,
            invoice_id: row.invoice_id || null,
            invoice_item_id: row.invoice_item_id || null,
            event_id: row.event_id || null,
            source_row_ref: row.source_row_ref || null
        }))
    };
}

function buildCanonicalInstallmentSchedules(inputRows = []) {
    const groups = [];
    const rows = inputRows
        .map((inputRow, ordinal) => normalizeRow(inputRow, ordinal))
        .filter(Boolean)
        .map(row => ({ row, groupingKey: purchaseGroupingKey(row) }))
        .sort((left, right) =>
            left.groupingKey.localeCompare(right.groupingKey) ||
            left.row.installment_index - right.row.installment_index ||
            left.row.ordinal - right.row.ordinal
        );

    rows.forEach(({ row, groupingKey }) => {
        if (row.installment_index === 1) {
            groups.push(createGroup(row, groupingKey));
            return;
        }
        appendToBestGroup(groups, row, groupingKey);
    });
    return groups
        .map(buildSchedule)
        .sort((left, right) => left.schedule_id.localeCompare(right.schedule_id));
}

module.exports = {
    buildCanonicalInstallmentSchedules,
    parseInstallment
};
