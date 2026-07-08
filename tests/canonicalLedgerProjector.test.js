const test = require('node:test');
const assert = require('node:assert');
const fixture = require('./fixtures/ledger/canonical-ledger-phase1.json');

const {
    projectLegacyRowsToCanonicalLedger,
    buildCanonicalPublicProjection
} = require('../src/ledger/canonicalLedgerProjector');

function bySource(projected, sourceRowId) {
    return projected.events.find(event => event.source_row_ref === sourceRowId);
}

function lineTypesFor(projected, eventId) {
    return projected.lines
        .filter(line => line.event_id === eventId)
        .map(line => line.line_type)
        .sort();
}

test('canonical ledger projector is deterministic and preserves one stable event per source row', () => {
    const first = projectLegacyRowsToCanonicalLedger(fixture);
    const second = projectLegacyRowsToCanonicalLedger(fixture);

    assert.deepStrictEqual(first, second);

    const sourceRefs = first.events
        .map(event => event.source_row_ref)
        .filter(Boolean);
    assert.strictEqual(new Set(sourceRefs).size, sourceRefs.length);
    assert.ok(sourceRefs.includes('saidas-001'));
    assert.ok(sourceRefs.includes('cartao-001'));

    const ids = first.events.map(event => event.event_id);
    assert.strictEqual(new Set(ids).size, ids.length);
    assert.ok(ids.every(id => /^evt_[a-f0-9]{16}$/.test(id)));
});

test('canonical ledger links a paid recurring bill to its expected bill without making it free budget spend', () => {
    const projected = projectLegacyRowsToCanonicalLedger(fixture);

    const expectedBill = bySource(projected, 'contas-001');
    const payment = bySource(projected, 'saidas-002');

    assert.strictEqual(expectedBill.kind, 'bill_expected');
    assert.strictEqual(expectedBill.status, 'pending');
    assert.strictEqual(expectedBill.due_on, '2026-06-10');

    assert.strictEqual(payment.kind, 'bill_payment');
    assert.strictEqual(payment.status, 'settled');
    assert.strictEqual(payment.amount_cents, 12000);
    assert.strictEqual(payment.due_on, '2026-06-10');
    assert.strictEqual(payment.competence_month, '2026-06');
    assert.strictEqual(payment.free_budget_eligible, false);

    assert.ok(projected.reconciliationLinks.some(link =>
        link.link_type === 'payment' &&
        link.event_id === payment.event_id &&
        link.related_event_id === expectedBill.event_id
    ));
});

test('canonical ledger materializes monthly recurring bill occurrences without precreating ledger spend', () => {
    const recurringFixture = structuredClone(fixture);
    recurringFixture.projectionContext = {
        competenceMonth: '2026-02',
        materializeCompetenceMonths: ['2026-02', '2026-03']
    };
    recurringFixture.legacyRows.contas[0] = {
        ...recurringFixture.legacyRows.contas[0],
        source_row_id: 'contas-dia-31',
        nome: 'Condominio',
        nome_amigavel: 'Condominio',
        dia_vencimento: '31',
        valor_esperado: '456,78'
    };
    recurringFixture.legacyRows.saidas = [];

    const projected = projectLegacyRowsToCanonicalLedger(recurringFixture);

    assert.strictEqual(projected.recurrenceRules.length, 1);
    assert.match(projected.recurrenceRules[0].recurrence_rule_id, /^rr_[a-f0-9]{16}$/);
    assert.strictEqual(projected.recurrenceRules[0].source_row_ref, 'contas-dia-31');
    assert.strictEqual(projected.recurrenceRules[0].frequency, 'monthly');
    assert.strictEqual(projected.recurrenceRules[0].due_day, 31);
    assert.strictEqual(projected.recurrenceRules[0].amount_cents, 45678);

    assert.deepStrictEqual(projected.recurrenceOccurrences.map(occurrence => ({
        competence_month: occurrence.competence_month,
        due_on: occurrence.due_on,
        status: occurrence.status,
        amount_cents: occurrence.amount_cents
    })), [
        {
            competence_month: '2026-02',
            due_on: '2026-02-28',
            status: 'pending',
            amount_cents: 45678
        },
        {
            competence_month: '2026-03',
            due_on: '2026-03-31',
            status: 'pending',
            amount_cents: 45678
        }
    ]);

    const expectedBill = bySource(projected, 'contas-dia-31');
    assert.strictEqual(expectedBill.kind, 'bill_expected');
    assert.strictEqual(expectedBill.due_on, '2026-02-28');
    assert.strictEqual(expectedBill.free_budget_eligible, false);
    assert.strictEqual(expectedBill.net_income_expense_impact, 0);
    assert.strictEqual(projected.events.filter(event => event.kind === 'bill_expected').length, 1);
    assert.strictEqual(projected.events.some(event => event.kind === 'expense'), false);
});

test('canonical ledger materializes recurring bill occurrences across year turn idempotently', () => {
    const recurringFixture = structuredClone(fixture);
    recurringFixture.projectionContext = {
        competenceMonth: '2026-12',
        materializeCompetenceMonths: ['2026-12', '2027-01', '2026-12']
    };
    recurringFixture.legacyRows.contas[0] = {
        ...recurringFixture.legacyRows.contas[0],
        source_row_id: 'contas-virada-ano',
        nome: 'Internet',
        nome_amigavel: 'Internet',
        dia_vencimento: '30',
        valor_esperado: '99,90'
    };
    recurringFixture.legacyRows.saidas = [];

    const projected = projectLegacyRowsToCanonicalLedger(recurringFixture);

    assert.deepStrictEqual(projected.recurrenceOccurrences.map(occurrence => ({
        competence_month: occurrence.competence_month,
        due_on: occurrence.due_on,
        amount_cents: occurrence.amount_cents
    })), [
        {
            competence_month: '2026-12',
            due_on: '2026-12-30',
            amount_cents: 9990
        },
        {
            competence_month: '2027-01',
            due_on: '2027-01-30',
            amount_cents: 9990
        }
    ]);
    assert.strictEqual(projected.recurrenceOccurrences.length, 2);
});

test('canonical ledger does not materialize inactive recurring bill rules', () => {
    const recurringFixture = structuredClone(fixture);
    recurringFixture.projectionContext = {
        competenceMonth: '2026-07',
        materializeCompetenceMonths: ['2026-07']
    };
    recurringFixture.legacyRows.contas[0] = {
        ...recurringFixture.legacyRows.contas[0],
        source_row_id: 'contas-inativa',
        nome: 'Conta inativa',
        nome_amigavel: 'Conta inativa',
        regra_ativa: 'nao'
    };
    recurringFixture.legacyRows.saidas = [];

    const projected = projectLegacyRowsToCanonicalLedger(recurringFixture);

    assert.strictEqual(projected.recurrenceRules.length, 0);
    assert.strictEqual(projected.recurrenceOccurrences.length, 0);
    assert.strictEqual(projected.events.some(event => event.source_row_ref === 'contas-inativa'), false);
});

test('canonical ledger links recurring bill payments to the materialized occurrence', () => {
    const projected = projectLegacyRowsToCanonicalLedger(fixture);
    const payment = bySource(projected, 'saidas-002');
    const occurrence = projected.recurrenceOccurrences.find(item => item.source_row_ref === 'contas-001');

    assert.ok(occurrence);
    assert.strictEqual(occurrence.status, 'settled');
    assert.strictEqual(occurrence.settled_event_id, payment.event_id);
    assert.ok(projected.reconciliationLinks.some(link =>
        link.link_type === 'recurrence_occurrence_payment' &&
        link.event_id === payment.event_id &&
        link.related_event_id === occurrence.occurrence_event_id
    ));
});
test('canonical ledger separates card purchase competence from invoice payment cash movement', () => {
    const projected = projectLegacyRowsToCanonicalLedger(fixture);

    const cardPurchase = bySource(projected, 'cartao-001');
    const invoicePayment = bySource(projected, 'transferencias-002');

    assert.strictEqual(cardPurchase.kind, 'card_purchase');
    assert.strictEqual(cardPurchase.occurred_on, '2026-05-20');
    assert.strictEqual(cardPurchase.effective_on, '2026-06-01');
    assert.strictEqual(cardPurchase.competence_month, '2026-06');
    assert.strictEqual(cardPurchase.amount_cents, 100000);
    const installmentSchedule = projected.schedules.find(schedule => schedule.purchase_event_id === cardPurchase.event_id);
    assert.strictEqual(installmentSchedule.status, 'uncertain');
    assert.strictEqual(installmentSchedule.total_purchase_cents, 100000);
    assert.strictEqual(installmentSchedule.observed_installment_total_cents, 50000);
    assert.deepStrictEqual(installmentSchedule.missing_installments, [2]);
    assert.strictEqual(projected.invoices.find(invoice => invoice.competence_month === '2026-06').observed_item_total_cents, 50000);
    assert.deepStrictEqual(lineTypesFor(projected, cardPurchase.event_id), ['card_liability', 'category']);

    assert.strictEqual(invoicePayment.kind, 'invoice_payment');
    assert.strictEqual(invoicePayment.amount_cents, 50000);
    assert.strictEqual(invoicePayment.free_budget_eligible, false);
    assert.deepStrictEqual(lineTypesFor(projected, invoicePayment.event_id), ['card_liability', 'cash']);
});

test('canonical ledger models one installment purchase event with a schedule linked to monthly invoices', () => {
    const installmentFixture = structuredClone(fixture);
    installmentFixture.legacyRows.transferencias = [];
    installmentFixture.legacyRows.lancamentosCartao = [
        {
            source_row_id: 'notebook-1-2',
            user_id: 'person-daniel',
            card_id: 'nubank-daniel',
            cartao: 'Cartao Nubank Daniel',
            data: '20/05/2026',
            descricao: 'Notebook',
            categoria: 'Eletronicos',
            subcategoria: 'Computador',
            valor_parcela: '500,00',
            parcela: '1/2',
            mes_cobranca: '2026-06'
        },
        {
            source_row_id: 'notebook-2-2',
            user_id: 'person-daniel',
            card_id: 'nubank-daniel',
            cartao: 'Cartao Nubank Daniel',
            data: '20/05/2026',
            descricao: 'Notebook',
            categoria: 'Eletronicos',
            subcategoria: 'Computador',
            valor_parcela: '500,00',
            parcela: '2/2',
            mes_cobranca: '2026-07'
        }
    ];

    const projected = projectLegacyRowsToCanonicalLedger(installmentFixture);
    const purchases = projected.events.filter(event => event.kind === 'card_purchase');
    const schedules = projected.schedules.filter(schedule => schedule.schedule_type === 'card_installment');

    assert.strictEqual(purchases.length, 1);
    assert.strictEqual(purchases[0].amount_cents, 100000);
    assert.strictEqual(purchases[0].net_income_expense_impact, 100000);
    assert.strictEqual(schedules.length, 1);
    assert.strictEqual(schedules[0].purchase_event_id, purchases[0].event_id);
    assert.strictEqual(schedules[0].total_purchase_cents, 100000);
    assert.deepStrictEqual(
        schedules[0].installments.map(item => [item.index, item.competence_month, item.amount_cents, item.invoice_id]),
        [
            [1, '2026-06', 50000, projected.invoices.find(invoice => invoice.competence_month === '2026-06').invoice_id],
            [2, '2026-07', 50000, projected.invoices.find(invoice => invoice.competence_month === '2026-07').invoice_id]
        ]
    );
    assert.deepStrictEqual(projected.invoices.map(invoice => [invoice.competence_month, invoice.observed_item_total_cents]), [
        ['2026-06', 50000],
        ['2026-07', 50000]
    ]);
    assert.strictEqual(projected.invoiceItems.reduce((sum, item) => sum + item.amount_cents, 0), 100000);
});

test('canonical ledger links card items and payoff to one stable invoice aggregate', () => {
    const first = projectLegacyRowsToCanonicalLedger(fixture);
    const second = projectLegacyRowsToCanonicalLedger(fixture);
    const cardPurchase = bySource(first, 'cartao-001');
    const invoicePayment = bySource(first, 'transferencias-002');

    assert.strictEqual(first.invoices.length, 1);
    assert.deepStrictEqual(first.invoices, second.invoices);
    assert.deepStrictEqual(first.invoiceItems, second.invoiceItems);
    assert.deepStrictEqual(first.invoicePayments, second.invoicePayments);

    const invoice = first.invoices[0];
    assert.match(invoice.invoice_id, /^inv_[a-f0-9]{16}$/);
    assert.strictEqual(invoice.card_key, 'nubank daniel');
    assert.strictEqual(invoice.competence_month, '2026-06');
    assert.strictEqual(invoice.observed_item_total_cents, 50000);
    assert.strictEqual(invoice.observed_payment_total_cents, 50000);
    assert.strictEqual(invoice.status, 'paid');

    assert.deepStrictEqual(first.invoiceItems.map(item => [item.invoice_id, item.event_id, item.amount_cents]), [
        [invoice.invoice_id, cardPurchase.event_id, 50000]
    ]);
    assert.deepStrictEqual(first.invoicePayments.map(payment => [payment.invoice_id, payment.event_id, payment.amount_cents]), [
        [invoice.invoice_id, invoicePayment.event_id, 50000]
    ]);
});

test('canonical ledger keeps one family invoice when both partners use the same card', () => {
    const familyFixture = structuredClone(fixture);
    familyFixture.legacyRows.lancamentosCartao.push({
        source_row_id: 'cartao-002',
        user_id: 'person-thais',
        card_id: 'nubank-daniel',
        cartao: 'Cartao Nubank Daniel',
        data: '21/05/2026',
        descricao: 'Mercado',
        categoria: 'Alimentacao',
        subcategoria: 'Supermercado',
        valor_parcela: '100,00',
        parcela: '1/1',
        mes_cobranca: '2026-06'
    });

    const projected = projectLegacyRowsToCanonicalLedger(familyFixture);

    assert.strictEqual(projected.invoices.length, 1);
    assert.strictEqual(projected.invoiceItems.length, 2);
    assert.strictEqual(projected.invoices[0].observed_item_total_cents, 60000);
    assert.strictEqual(projected.invoices[0].observed_payment_total_cents, 50000);
    assert.strictEqual(projected.invoices[0].status, 'partially_paid');
});

test('canonical ledger matches invoice payoff by canonical card name when card id is opaque', () => {
    const opaqueIdFixture = structuredClone(fixture);
    opaqueIdFixture.legacyRows.lancamentosCartao[0].card_id = 'card-uuid-1234';

    const projected = projectLegacyRowsToCanonicalLedger(opaqueIdFixture);

    assert.strictEqual(projected.invoices.length, 1);
    assert.strictEqual(projected.invoices[0].card_key, 'nubank daniel');
    assert.strictEqual(projected.invoices[0].status, 'paid');
});

test('canonical ledger ignores a repeated invoice link inside the same projection run', () => {
    const repeatedFixture = structuredClone(fixture);
    repeatedFixture.legacyRows.lancamentosCartao.push(
        structuredClone(repeatedFixture.legacyRows.lancamentosCartao[0])
    );

    const projected = projectLegacyRowsToCanonicalLedger(repeatedFixture);
    const invoice = projected.invoices[0];

    assert.strictEqual(projected.invoiceItems.length, 1);
    assert.strictEqual(invoice.observed_item_total_cents, 50000);
    assert.strictEqual(invoice.status, 'paid');
});

test('canonical ledger keeps transfers and reserves neutral for income and expense', () => {
    const projected = projectLegacyRowsToCanonicalLedger(fixture);

    const reserve = bySource(projected, 'transferencias-001');
    const familyTransfer = bySource(projected, 'transferencias-003');

    assert.strictEqual(reserve.kind, 'goal_contribution');
    assert.strictEqual(reserve.net_income_expense_impact, 0);
    assert.strictEqual(reserve.free_budget_eligible, false);
    assert.deepStrictEqual(lineTypesFor(projected, reserve.event_id), ['cash', 'goal']);

    assert.strictEqual(familyTransfer.kind, 'transfer');
    assert.strictEqual(familyTransfer.net_income_expense_impact, 0);
    assert.strictEqual(familyTransfer.free_budget_eligible, false);
    assert.deepStrictEqual(lineTypesFor(projected, familyTransfer.event_id), ['cash', 'clearing']);
});

test('canonical ledger marks unresolved categories explicitly instead of hiding uncertainty', () => {
    const projected = projectLegacyRowsToCanonicalLedger(fixture);
    const unknown = bySource(projected, 'saidas-003');

    assert.strictEqual(unknown.kind, 'expense');
    assert.strictEqual(unknown.category_status, 'unresolved');
    assert.strictEqual(unknown.status, 'uncertain');
    assert.ok(projected.warnings.some(warning =>
        warning.code === 'category_unresolved' &&
        warning.event_id === unknown.event_id
    ));
});

test('canonical public projection is scoped and excludes internal identifiers', () => {
    const projected = projectLegacyRowsToCanonicalLedger(fixture);
    const publicRows = buildCanonicalPublicProjection(projected, fixture);
    const serialized = JSON.stringify(publicRows);

    assert.ok(publicRows.length > 0);
    assert.doesNotMatch(serialized, /user_id|person-daniel|person-thais|source_row_hash|source_id_hash|idempotency_key|sheet_id|token|prompt|rawRows|raw_rows/i);
    assert.ok(publicRows.some(row =>
        row.kind === 'bill_payment' &&
        row.responsible === 'Daniel' &&
        row.amount_cents === 12000
    ));
});

test('canonical ledger models debt opening and principal payment without turning principal into expense', () => {
    const projected = projectLegacyRowsToCanonicalLedger(fixture);

    const debt = bySource(projected, 'dividas-001');
    const payment = bySource(projected, 'pagdiv-001');

    assert.strictEqual(debt.kind, 'debt_opening');
    assert.strictEqual(debt.status, 'pending');
    assert.strictEqual(debt.amount_cents, 200000);
    assert.strictEqual(debt.due_on, '2026-06-25');
    assert.strictEqual(debt.net_income_expense_impact, 0);
    assert.deepStrictEqual(lineTypesFor(projected, debt.event_id), ['debt', 'clearing'].sort());

    assert.strictEqual(payment.kind, 'debt_payment');
    assert.strictEqual(payment.amount_cents, 32000);
    assert.strictEqual(payment.net_income_expense_impact, 2000);
    assert.strictEqual(payment.free_budget_eligible, false);
    assert.deepStrictEqual(lineTypesFor(projected, payment.event_id), ['cash', 'category', 'debt'].sort());
    assert.ok(projected.reconciliationLinks.some(link =>
        link.link_type === 'payment' &&
        link.event_id === payment.event_id &&
        link.related_event_id === debt.event_id
    ));
});

test('canonical ledger maps goal withdrawals as neutral availability movements', () => {
    const projected = projectLegacyRowsToCanonicalLedger(fixture);

    const goal = bySource(projected, 'metas-001');
    const withdrawal = bySource(projected, 'movmeta-001');

    assert.strictEqual(goal.kind, 'goal_opening');
    assert.strictEqual(goal.amount_cents, 250000);
    assert.strictEqual(goal.net_income_expense_impact, 0);
    assert.deepStrictEqual(lineTypesFor(projected, goal.event_id), ['goal', 'clearing'].sort());

    assert.strictEqual(withdrawal.kind, 'goal_withdrawal');
    assert.strictEqual(withdrawal.amount_cents, 20000);
    assert.strictEqual(withdrawal.net_income_expense_impact, 0);
    assert.strictEqual(withdrawal.free_budget_eligible, false);
    assert.deepStrictEqual(lineTypesFor(projected, withdrawal.event_id), ['cash', 'goal'].sort());
    assert.ok(projected.reconciliationLinks.some(link =>
        link.link_type === 'goal_movement' &&
        link.event_id === withdrawal.event_id &&
        link.related_event_id === goal.event_id
    ));
});

test('canonical ledger links reimbursements to the original expense and reduces expense impact', () => {
    const projected = projectLegacyRowsToCanonicalLedger(fixture);

    const expense = bySource(projected, 'saidas-001');
    const reimbursement = bySource(projected, 'entradas-002');

    assert.strictEqual(reimbursement.kind, 'reimbursement');
    assert.strictEqual(reimbursement.amount_cents, 5000);
    assert.strictEqual(reimbursement.net_income_expense_impact, -5000);
    assert.strictEqual(reimbursement.free_budget_eligible, false);
    assert.deepStrictEqual(lineTypesFor(projected, reimbursement.event_id), ['cash', 'category'].sort());
    assert.ok(projected.reconciliationLinks.some(link =>
        link.link_type === 'refund_pair' &&
        link.event_id === reimbursement.event_id &&
        link.related_event_id === expense.event_id
    ));
});

test('canonical ledger keeps linked reimbursements from reducing spend below the original expense', () => {
    const localFixture = structuredClone(fixture);
    localFixture.legacyRows.entradas = [
        {
            source_row_id: 'entradas-reembolso-total',
            user_id: 'person-daniel',
            data: '18/06/2026',
            descricao: 'Reembolso total Mercado Extra',
            categoria: 'Reembolso',
            valor: '150,75',
            recebimento: 'PIX',
            recorrente: 'Nao',
            related_source_row_id: 'saidas-001'
        },
        {
            source_row_id: 'entradas-reembolso-maior',
            user_id: 'person-daniel',
            data: '19/06/2026',
            descricao: 'Reembolso superior Mercado Extra',
            categoria: 'Reembolso',
            valor: '200,00',
            recebimento: 'PIX',
            recorrente: 'Nao',
            related_source_row_id: 'saidas-001'
        }
    ];

    const projected = projectLegacyRowsToCanonicalLedger(localFixture);
    const total = bySource(projected, 'entradas-reembolso-total');
    const excessive = bySource(projected, 'entradas-reembolso-maior');

    assert.strictEqual(total.kind, 'reimbursement');
    assert.strictEqual(total.status, 'settled');
    assert.strictEqual(total.amount_cents, 15075);
    assert.strictEqual(total.net_income_expense_impact, -15075);

    assert.strictEqual(excessive.kind, 'reimbursement');
    assert.strictEqual(excessive.status, 'uncertain');
    assert.strictEqual(excessive.amount_cents, 20000);
    assert.strictEqual(excessive.net_income_expense_impact, -15075);
    assert.ok(projected.warnings.some(warning =>
        warning.code === 'compensation_exceeds_original' &&
        warning.source_row_ref === 'entradas-reembolso-maior'
    ));
});

test('canonical ledger marks reimbursements without an original event as uncertain neutral compensations', () => {
    const localFixture = structuredClone(fixture);
    localFixture.legacyRows.entradas = [
        {
            source_row_id: 'entradas-reembolso-sem-original',
            user_id: 'person-daniel',
            data: '20/06/2026',
            descricao: 'Reembolso sem compra vinculada',
            categoria: 'Reembolso',
            valor: '70,00',
            recebimento: 'PIX',
            recorrente: 'Nao'
        }
    ];

    const projected = projectLegacyRowsToCanonicalLedger(localFixture);
    const reimbursement = bySource(projected, 'entradas-reembolso-sem-original');

    assert.strictEqual(reimbursement.kind, 'reimbursement');
    assert.strictEqual(reimbursement.status, 'uncertain');
    assert.strictEqual(reimbursement.amount_cents, 7000);
    assert.strictEqual(reimbursement.net_income_expense_impact, 0);
    assert.ok(projected.warnings.some(warning =>
        warning.code === 'compensation_original_unresolved' &&
        warning.source_row_ref === 'entradas-reembolso-sem-original'
    ));
});

test('canonical ledger projects linked card chargebacks without creating installment schedules', () => {
    const localFixture = structuredClone(fixture);
    localFixture.legacyRows.lancamentosCartao.push({
        source_row_id: 'cartao-estorno-001',
        user_id: 'person-daniel',
        card_id: 'nubank-daniel',
        cartao: 'Cartao Nubank Daniel',
        data: '25/06/2026',
        descricao: 'Estorno parcial Notebook',
        categoria: 'Estorno',
        subcategoria: 'Estorno',
        valor_parcela: '-40,00',
        parcela: '1/1',
        mes_cobranca: '2026-06',
        related_source_row_id: 'cartao-001'
    });

    const projected = projectLegacyRowsToCanonicalLedger(localFixture);
    const original = bySource(projected, 'cartao-001');
    const chargeback = bySource(projected, 'cartao-estorno-001');

    assert.strictEqual(chargeback.kind, 'chargeback');
    assert.strictEqual(chargeback.status, 'settled');
    assert.strictEqual(chargeback.amount_cents, 4000);
    assert.strictEqual(chargeback.net_income_expense_impact, -4000);
    assert.deepStrictEqual(lineTypesFor(projected, chargeback.event_id), ['card_liability', 'category'].sort());
    assert.ok(projected.reconciliationLinks.some(link =>
        link.link_type === 'refund_pair' &&
        link.event_id === chargeback.event_id &&
        link.related_event_id === original.event_id
    ));
    assert.strictEqual(projected.schedules.some(schedule =>
        Array.isArray(schedule.installments) &&
        schedule.installments.some(installment => installment.source_row_ref === 'cartao-estorno-001')
    ), false);
});

test('canonical ledger reconciles imported items to manual launches without duplicating spend', () => {
    const projected = projectLegacyRowsToCanonicalLedger(fixture);

    const expense = bySource(projected, 'saidas-001');
    const imported = bySource(projected, 'import-001');

    assert.strictEqual(imported.kind, 'adjustment');
    assert.strictEqual(imported.status, 'settled');
    assert.strictEqual(imported.amount_cents, 15075);
    assert.strictEqual(imported.net_income_expense_impact, 0);
    assert.strictEqual(imported.free_budget_eligible, false);
    assert.deepStrictEqual(lineTypesFor(projected, imported.event_id), ['clearing']);
    assert.ok(projected.reconciliationLinks.some(link =>
        link.link_type === 'import_match' &&
        link.event_id === imported.event_id &&
        link.related_event_id === expense.event_id
    ));
});
