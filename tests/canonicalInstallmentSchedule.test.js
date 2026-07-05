const test = require('node:test');
const assert = require('node:assert');

const {
    buildCanonicalInstallmentSchedules
} = require('../src/ledger/canonicalInstallmentSchedule');

function installmentRow({
    sourceRowRef,
    eventId,
    invoiceId,
    invoiceItemId,
    installment,
    competenceMonth,
    amountCents = 50000,
    description = 'Notebook',
    purchaseOn = '2026-05-20',
    status = 'scheduled'
}) {
    return {
        source_row_ref: sourceRowRef,
        event_id: eventId,
        invoice_id: invoiceId,
        invoice_item_id: invoiceItemId,
        owner_person_id: 'person-daniel',
        card_id: 'nubank-daniel',
        card_name: 'Nubank - Daniel',
        purchase_on: purchaseOn,
        description,
        category: 'Eletronicos',
        subcategory: 'Computador',
        installment,
        competence_month: competenceMonth,
        amount_cents: amountCents,
        currency: 'BRL',
        status
    };
}

test('canonical installment schedules do not classify a one-time card purchase as installment plan', () => {
    const schedules = buildCanonicalInstallmentSchedules([
        installmentRow({
            sourceRowRef: 'cash-1',
            eventId: 'evt-cash-1',
            invoiceId: 'inv-2026-06',
            invoiceItemId: 'item-cash-1',
            installment: '1/1',
            competenceMonth: '2026-06'
        })
    ]);

    assert.deepStrictEqual(schedules, []);
});

test('canonical installment schedule groups a 2x purchase and links every installment to its invoice', () => {
    const schedules = buildCanonicalInstallmentSchedules([
        installmentRow({ sourceRowRef: 'row-1', eventId: 'evt-1', invoiceId: 'inv-06', invoiceItemId: 'item-1', installment: '1/2', competenceMonth: '2026-06' }),
        installmentRow({ sourceRowRef: 'row-2', eventId: 'evt-2', invoiceId: 'inv-07', invoiceItemId: 'item-2', installment: '2/2', competenceMonth: '2026-07' })
    ]);

    assert.strictEqual(schedules.length, 1);
    assert.deepStrictEqual({
        scheduleType: schedules[0].schedule_type,
        status: schedules[0].status,
        purchaseEventId: schedules[0].purchase_event_id,
        installmentTotal: schedules[0].installment_total,
        observedInstallments: schedules[0].observed_installments,
        totalPurchaseCents: schedules[0].total_purchase_cents,
        firstCompetenceMonth: schedules[0].first_competence_month,
        lastCompetenceMonth: schedules[0].last_competence_month
    }, {
        scheduleType: 'card_installment',
        status: 'scheduled',
        purchaseEventId: 'evt-1',
        installmentTotal: 2,
        observedInstallments: 2,
        totalPurchaseCents: 100000,
        firstCompetenceMonth: '2026-06',
        lastCompetenceMonth: '2026-07'
    });
    assert.deepStrictEqual(
        schedules[0].installments.map(item => [item.index, item.competence_month, item.amount_cents, item.invoice_id, item.invoice_item_id]),
        [
            [1, '2026-06', 50000, 'inv-06', 'item-1'],
            [2, '2026-07', 50000, 'inv-07', 'item-2']
        ]
    );
});

test('canonical installment schedule preserves twelve monthly competencies across a year boundary', () => {
    const rows = Array.from({ length: 12 }, (_, offset) => {
        const date = new Date(Date.UTC(2026, 10 + offset, 1));
        const competenceMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
        return installmentRow({
            sourceRowRef: `year-row-${offset + 1}`,
            eventId: `year-event-${offset + 1}`,
            invoiceId: `year-invoice-${competenceMonth}`,
            invoiceItemId: `year-item-${offset + 1}`,
            installment: `${offset + 1}/12`,
            competenceMonth,
            amountCents: 10000,
            description: 'Curso anual',
            purchaseOn: '2026-10-15'
        });
    });

    const [schedule] = buildCanonicalInstallmentSchedules(rows);

    assert.strictEqual(schedule.installment_total, 12);
    assert.strictEqual(schedule.total_purchase_cents, 120000);
    assert.strictEqual(schedule.first_competence_month, '2026-11');
    assert.strictEqual(schedule.last_competence_month, '2027-10');
    assert.deepStrictEqual(schedule.installments.map(item => item.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('canonical installment schedules keep identical purchases separate by installment sequence', () => {
    const rows = [
        installmentRow({ sourceRowRef: 'a-1', eventId: 'evt-a-1', invoiceId: 'inv-06', invoiceItemId: 'item-a-1', installment: '1/2', competenceMonth: '2026-06' }),
        installmentRow({ sourceRowRef: 'a-2', eventId: 'evt-a-2', invoiceId: 'inv-07', invoiceItemId: 'item-a-2', installment: '2/2', competenceMonth: '2026-07' }),
        installmentRow({ sourceRowRef: 'b-1', eventId: 'evt-b-1', invoiceId: 'inv-06', invoiceItemId: 'item-b-1', installment: '1/2', competenceMonth: '2026-06' }),
        installmentRow({ sourceRowRef: 'b-2', eventId: 'evt-b-2', invoiceId: 'inv-07', invoiceItemId: 'item-b-2', installment: '2/2', competenceMonth: '2026-07' })
    ];

    const schedules = buildCanonicalInstallmentSchedules(rows);

    assert.strictEqual(schedules.length, 2);
    assert.notStrictEqual(schedules[0].schedule_id, schedules[1].schedule_id);
    assert.deepStrictEqual(schedules.map(schedule => schedule.installments.map(item => item.source_row_ref)), [
        ['a-1', 'a-2'],
        ['b-1', 'b-2']
    ]);
});

test('canonical installment schedule marks missing or cancelled installment sequences explicitly', () => {
    const [uncertain] = buildCanonicalInstallmentSchedules([
        installmentRow({ sourceRowRef: 'gap-1', eventId: 'evt-gap-1', invoiceId: 'inv-06', invoiceItemId: 'item-gap-1', installment: '1/3', competenceMonth: '2026-06' }),
        installmentRow({ sourceRowRef: 'gap-3', eventId: 'evt-gap-3', invoiceId: 'inv-08', invoiceItemId: 'item-gap-3', installment: '3/3', competenceMonth: '2026-08' })
    ]);
    const [cancelled] = buildCanonicalInstallmentSchedules([
        installmentRow({ sourceRowRef: 'cancel-1', eventId: 'evt-cancel-1', invoiceId: 'inv-06', invoiceItemId: 'item-cancel-1', installment: '1/2', competenceMonth: '2026-06', status: 'cancelled' }),
        installmentRow({ sourceRowRef: 'cancel-2', eventId: 'evt-cancel-2', invoiceId: 'inv-07', invoiceItemId: 'item-cancel-2', installment: '2/2', competenceMonth: '2026-07', status: 'cancelled' })
    ]);

    assert.strictEqual(uncertain.status, 'uncertain');
    assert.deepStrictEqual(uncertain.missing_installments, [2]);
    assert.strictEqual(uncertain.total_purchase_cents, 150000);
    assert.strictEqual(uncertain.observed_installment_total_cents, 100000);
    assert.strictEqual(cancelled.status, 'cancelled');
});

test('canonical installment schedule id stays stable when unrelated rows are prepended', () => {
    const purchaseRows = [
        installmentRow({ sourceRowRef: 'stable-1', eventId: 'evt-stable-1', invoiceId: 'inv-06', invoiceItemId: 'item-stable-1', installment: '1/2', competenceMonth: '2026-06' }),
        installmentRow({ sourceRowRef: 'stable-2', eventId: 'evt-stable-2', invoiceId: 'inv-07', invoiceItemId: 'item-stable-2', installment: '2/2', competenceMonth: '2026-07' })
    ];
    const baseline = buildCanonicalInstallmentSchedules(purchaseRows);
    const withUnrelatedRow = buildCanonicalInstallmentSchedules([
        installmentRow({ sourceRowRef: 'cash-before', eventId: 'evt-cash-before', invoiceId: 'inv-05', invoiceItemId: 'item-cash-before', installment: '1/1', competenceMonth: '2026-05' }),
        ...purchaseRows
    ]);

    assert.strictEqual(withUnrelatedRow[0].schedule_id, baseline[0].schedule_id);
});

test('canonical installment schedule groups installments even when source rows arrive newest first', () => {
    const schedules = buildCanonicalInstallmentSchedules([
        installmentRow({ sourceRowRef: 'reverse-2', eventId: 'evt-reverse-2', invoiceId: 'inv-07', invoiceItemId: 'item-reverse-2', installment: '2/2', competenceMonth: '2026-07' }),
        installmentRow({ sourceRowRef: 'reverse-1', eventId: 'evt-reverse-1', invoiceId: 'inv-06', invoiceItemId: 'item-reverse-1', installment: '1/2', competenceMonth: '2026-06' })
    ]);

    assert.strictEqual(schedules.length, 1);
    assert.deepStrictEqual(schedules[0].installments.map(item => item.source_row_ref), ['reverse-1', 'reverse-2']);
});