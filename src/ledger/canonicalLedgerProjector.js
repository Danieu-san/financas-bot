const crypto = require('node:crypto');
const { normalizeText, parseValue } = require('../utils/helpers');
const { recurringBillPaymentScore } = require('../utils/recurringBillMatcher');

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function hash(value, length = 16) {
    return crypto
        .createHash('sha256')
        .update(stableStringify(value))
        .digest('hex')
        .slice(0, length);
}

function normalizeDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return raw;
    const pt = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!pt) return null;
    return `${pt[3]}-${pt[2].padStart(2, '0')}-${pt[1].padStart(2, '0')}`;
}

function competenceFromDate(isoDate) {
    return isoDate ? isoDate.slice(0, 7) : null;
}

function normalizeCompetenceMonth(value, fallbackDate) {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}$/.test(raw)) return raw;
    const pt = raw.match(/^(\d{1,2})\/(\d{4})$/);
    if (pt) return `${pt[2]}-${pt[1].padStart(2, '0')}`;
    return competenceFromDate(fallbackDate);
}

const INVOICE_MONTHS = {
    janeiro: 1,
    fevereiro: 2,
    marco: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12
};

function normalizeInvoiceCardKey(value) {
    return normalizeText(String(value || ''))
        .replace(/\bcartao\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function invoiceCompetenceFromRow(row = {}, fallbackDate = null) {
    const direct = normalizeCompetenceMonth(row.mes_cobranca || row.mesCobranca, fallbackDate);
    if (row.mes_cobranca || row.mesCobranca) return direct;

    const description = normalizeText(row.descricao || '');
    const numeric = description.match(/\b(0?[1-9]|1[0-2])\/(\d{4})\b/);
    if (numeric) return `${numeric[2]}-${numeric[1].padStart(2, '0')}`;

    const written = description.match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})\b/);
    if (written) return `${written[2]}-${String(INVOICE_MONTHS[written[1]]).padStart(2, '0')}`;

    return direct;
}

function invoiceStatus(itemTotalCents, paymentTotalCents) {
    if (itemTotalCents > 0 && paymentTotalCents >= itemTotalCents) return 'paid';
    if (itemTotalCents > 0 && paymentTotalCents > 0) return 'partially_paid';
    if (itemTotalCents > 0) return 'open';
    return paymentTotalCents > 0 ? 'payment_observed' : 'empty';
}

function registerInvoiceObservation(collection, event, {
    cardId = '',
    cardName = '',
    competenceMonth = '',
    type
} = {}) {
    const cardKey = normalizeInvoiceCardKey(cardId || cardName);
    if (!cardKey || !competenceMonth || !event?.event_id) return;

    const invoiceId = `inv_${hash({
        householdId: event.household_id || '',
        cardKey,
        competenceMonth
    })}`;
    let invoice = collection.invoices.find(item => item.invoice_id === invoiceId);
    if (!invoice) {
        invoice = {
            invoice_id: invoiceId,
            household_id: event.household_id || null,
            owner_person_id: null,
            card_key: cardKey,
            card_name: String(cardName || cardId || '').trim(),
            competence_month: competenceMonth,
            due_on: null,
            currency: event.currency || 'BRL',
            observed_item_total_cents: 0,
            observed_payment_total_cents: 0,
            status: 'empty'
        };
        collection.invoices.push(invoice);
    }

    if (type === 'item') {
        collection.invoiceItems.push({
            invoice_item_id: `invitem_${hash({ invoiceId, eventId: event.event_id })}`,
            invoice_id: invoiceId,
            event_id: event.event_id,
            amount_cents: event.amount_cents,
            currency: event.currency || 'BRL'
        });
        invoice.observed_item_total_cents += event.amount_cents;
    } else if (type === 'payment') {
        collection.invoicePayments.push({
            invoice_payment_id: `invpay_${hash({ invoiceId, eventId: event.event_id })}`,
            invoice_id: invoiceId,
            event_id: event.event_id,
            amount_cents: event.amount_cents,
            currency: event.currency || 'BRL'
        });
        invoice.observed_payment_total_cents += event.amount_cents;
    }

    invoice.status = invoiceStatus(
        invoice.observed_item_total_cents,
        invoice.observed_payment_total_cents
    );
}
function cents(value) {
    const amount = typeof value === 'number' ? value : parseValue(value);
    if (!Number.isFinite(amount)) return 0;
    return Math.round(amount * 100);
}

function sourceRef(row, fallback) {
    return String(row.source_row_id || row.id || fallback);
}

function eventId(sourceType, sourceRowRef, row) {
    return `evt_${hash({ sourceType, sourceRowRef, row })}`;
}

function sourceHashes(sourceType, sourceRowRef, row) {
    return {
        source_id_hash: hash({ sourceType, sourceRowRef }, 32),
        source_row_hash: hash(row, 32),
        idempotency_key: hash({ canonical: 'ledger-v1', sourceType, sourceRowRef, row }, 32)
    };
}

function makeEvent(sourceType, sourceRowRef, row, overrides) {
    const occurredOn = normalizeDate(overrides.occurred_on || row.data);
    const competenceMonth = normalizeCompetenceMonth(
        overrides.competence_month || row.mes_cobranca || row.mesCobranca,
        occurredOn
    );
    return {
        event_id: eventId(sourceType, sourceRowRef, row),
        household_id: overrides.household_id,
        owner_person_id: row.user_id || overrides.owner_person_id || null,
        actor_person_id: row.user_id || overrides.actor_person_id || null,
        kind: overrides.kind,
        status: overrides.status || 'settled',
        description: String(overrides.description || row.descricao || row.nome_amigavel || row.nome || '').trim(),
        amount_cents: cents(overrides.amount !== undefined ? overrides.amount : row.valor),
        currency: 'BRL',
        occurred_on: occurredOn,
        effective_on: normalizeDate(overrides.effective_on) || occurredOn,
        competence_month: competenceMonth,
        due_on: overrides.due_on || null,
        category: overrides.category !== undefined ? overrides.category : row.categoria || null,
        subcategory: overrides.subcategory !== undefined ? overrides.subcategory : row.subcategoria || null,
        category_status: overrides.category_status || 'resolved',
        free_budget_eligible: overrides.free_budget_eligible !== undefined ? overrides.free_budget_eligible : true,
        net_income_expense_impact: overrides.net_income_expense_impact !== undefined
            ? overrides.net_income_expense_impact
            : cents(overrides.amount !== undefined ? overrides.amount : row.valor),
        source_type: sourceType,
        source_row_ref: sourceRowRef,
        ...sourceHashes(sourceType, sourceRowRef, row),
        created_at: '1970-01-01T00:00:00.000Z',
        updated_at: '1970-01-01T00:00:00.000Z'
    };
}

function makeLine(event, lineType, overrides = {}) {
    return {
        line_id: `line_${hash({ event_id: event.event_id, lineType, overrides })}`,
        event_id: event.event_id,
        line_type: lineType,
        account_id: overrides.account_id || null,
        category_id: overrides.category_id || null,
        related_event_id: overrides.related_event_id || null,
        direction: overrides.direction || 'neutral',
        amount_cents: overrides.amount_cents !== undefined ? overrides.amount_cents : event.amount_cents,
        currency: event.currency,
        metadata_hash: hash(overrides.metadata || {}, 32)
    };
}

function makeLink(event, linkType, relatedEventId, externalHashSeed = {}) {
    return {
        link_id: `link_${hash({ event_id: event.event_id, linkType, relatedEventId, externalHashSeed })}`,
        event_id: event.event_id,
        link_type: linkType,
        related_event_id: relatedEventId || null,
        external_hash: hash(externalHashSeed, 32),
        confidence: 'verified',
        status: 'active',
        created_at: '1970-01-01T00:00:00.000Z'
    };
}

function billDueDate(competenceMonth, dueDay) {
    const day = String(Number(dueDay || 1)).padStart(2, '0');
    return `${competenceMonth}-${day}`;
}

function normalizeBill(row) {
    return {
        sourceRowRef: sourceRef(row, `contas-${hash(row, 8)}`),
        ownerPersonId: row.user_id || null,
        name: row.nome_amigavel || row.nome || '',
        category: row.categoria || '',
        subcategory: row.subcategoria || '',
        dueDay: row.dia_vencimento || row.due_day || 1,
        expectedAmountCents: cents(row.valor_esperado || row.valor)
    };
}

function findMatchingBill(row, bills) {
    return bills.find(bill => recurringBillPaymentScore({
        description: bill.description || bill.name,
        accountName: bill.accountName || bill.name,
        category: bill.category,
        subcategory: bill.subcategory,
        expectedValue: bill.expectedValue,
        userId: bill.userId || bill.ownerPersonId
    }, {
        description: row.descricao,
        category: row.categoria,
        subcategory: row.subcategoria,
        value: parseValue(row.valor),
        userId: row.user_id
    }) >= 4) || null;
}

function isMarkedRecurringExpense(row = {}) {
    const recurring = normalizeText(row.recorrente || row.recorrencia || row.recurring || '');
    return ['sim', 's', 'true', '1'].includes(recurring);
}

function isUnknownCategory(row) {
    const category = normalizeText(row.categoria || '');
    return !category || category === 'outros' || category === 'outro' || category === 'sem categoria';
}

function addEvent(collection, event, lines) {
    collection.events.push(event);
    collection.lines.push(...lines);
}

function projectBills(input, collection) {
    const rows = input.legacyRows?.contas || [];
    const competenceMonth = input.projectionContext?.competenceMonth;
    const bills = rows
        .filter(row => normalizeText(row.regra_ativa || 'SIM') !== 'nao')
        .map(normalizeBill);

    for (const bill of bills) {
        const row = rows.find(item => sourceRef(item, '') === bill.sourceRowRef) || {};
        const dueOn = billDueDate(competenceMonth, bill.dueDay);
        const event = makeEvent('sheet.contas', bill.sourceRowRef, row, {
            household_id: input.householdId,
            owner_person_id: bill.ownerPersonId,
            actor_person_id: bill.ownerPersonId,
            kind: 'bill_expected',
            status: 'pending',
            amount: bill.expectedAmountCents / 100,
            occurred_on: dueOn,
            effective_on: dueOn,
            competence_month: competenceMonth,
            due_on: dueOn,
            category: bill.category,
            subcategory: bill.subcategory,
            free_budget_eligible: false,
            net_income_expense_impact: 0
        });
        collection.schedules.push({
            schedule_id: `sch_${hash({ bill, competenceMonth })}`,
            household_id: input.householdId,
            owner_person_id: bill.ownerPersonId,
            schedule_type: 'bill',
            status: 'active',
            start_on: dueOn,
            end_on: null,
            frequency: 'monthly',
            amount_cents: bill.expectedAmountCents,
            currency: 'BRL',
            next_due_on: dueOn,
            source_id_hash: event.source_id_hash
        });
        addEvent(collection, event, [
            makeLine(event, 'category', { direction: 'outflow' }),
            makeLine(event, 'clearing', { direction: 'neutral' })
        ]);
    }

    return bills;
}

function projectExpenses(input, collection, bills) {
    for (const row of input.legacyRows?.saidas || []) {
        const ref = sourceRef(row, `saidas-${hash(row, 8)}`);
        const matchingBill = isMarkedRecurringExpense(row) ? findMatchingBill(row, bills) : null;
        const expectedEvent = matchingBill ? collection.events.find(event => event.source_row_ref === matchingBill.sourceRowRef) : null;
        const unknownCategory = isUnknownCategory(row);
        const dueOn = matchingBill ? billDueDate(input.projectionContext?.competenceMonth, matchingBill.dueDay) : null;
        const kind = matchingBill ? 'bill_payment' : 'expense';
        const event = makeEvent('sheet.saidas', ref, row, {
            household_id: input.householdId,
            kind,
            status: unknownCategory ? 'uncertain' : 'settled',
            due_on: dueOn,
            category_status: unknownCategory ? 'unresolved' : 'resolved',
            free_budget_eligible: !matchingBill,
            net_income_expense_impact: matchingBill ? 0 : cents(row.valor)
        });
        addEvent(collection, event, [
            makeLine(event, 'cash', { direction: 'outflow' }),
            makeLine(event, 'category', { direction: 'outflow' })
        ]);
        if (expectedEvent) {
            collection.reconciliationLinks.push(makeLink(event, 'payment', expectedEvent.event_id, { ref, matchingBill }));
        }
        if (unknownCategory) {
            collection.warnings.push({
                code: 'category_unresolved',
                event_id: event.event_id,
                source_row_ref: ref
            });
        }
    }
}

function projectIncome(input, collection) {
    for (const row of input.legacyRows?.entradas || []) {
        const ref = sourceRef(row, `entradas-${hash(row, 8)}`);
        const relatedEvent = row.related_source_row_id
            ? collection.events.find(event => event.source_row_ref === row.related_source_row_id)
            : null;
        const isReimbursement = relatedEvent || normalizeText(row.categoria || '').includes('reembolso');
        if (isReimbursement) {
            const event = makeEvent('sheet.entradas', ref, row, {
                household_id: input.householdId,
                kind: 'reimbursement',
                amount: row.valor,
                free_budget_eligible: false,
                net_income_expense_impact: -cents(row.valor)
            });
            addEvent(collection, event, [
                makeLine(event, 'cash', { direction: 'inflow' }),
                makeLine(event, 'category', { direction: 'inflow' })
            ]);
            if (relatedEvent) {
                collection.reconciliationLinks.push(makeLink(event, 'refund_pair', relatedEvent.event_id, { ref, related: row.related_source_row_id }));
            }
            continue;
        }
        const event = makeEvent('sheet.entradas', ref, row, {
            household_id: input.householdId,
            kind: 'income',
            amount: row.valor,
            net_income_expense_impact: cents(row.valor)
        });
        addEvent(collection, event, [
            makeLine(event, 'cash', { direction: 'inflow' }),
            makeLine(event, 'category', { direction: 'inflow' })
        ]);
    }
}

function projectDebts(input, collection) {
    for (const row of input.legacyRows?.dividas || []) {
        const ref = sourceRef(row, `dividas-${hash(row, 8)}`);
        const dueOn = normalizeDate(row.vencimento);
        const event = makeEvent('sheet.dividas', ref, row, {
            household_id: input.householdId,
            kind: 'debt_opening',
            status: normalizeText(row.status || '').includes('quit') ? 'settled' : 'pending',
            description: row.nome || row.descricao,
            amount: row.valor_original,
            occurred_on: dueOn,
            effective_on: dueOn,
            due_on: dueOn,
            category: row.tipo || 'Divida',
            subcategory: row.credor || null,
            free_budget_eligible: false,
            net_income_expense_impact: 0
        });
        collection.schedules.push({
            schedule_id: `sch_${hash({ type: 'debt', ref, row })}`,
            household_id: input.householdId,
            owner_person_id: row.user_id || null,
            schedule_type: 'debt',
            status: event.status === 'pending' ? 'active' : 'closed',
            start_on: dueOn,
            end_on: null,
            frequency: 'monthly',
            amount_cents: cents(row.parcela || row.valor_original),
            currency: 'BRL',
            next_due_on: dueOn,
            source_id_hash: event.source_id_hash
        });
        addEvent(collection, event, [
            makeLine(event, 'debt', { direction: 'outflow' }),
            makeLine(event, 'clearing', { direction: 'neutral' })
        ]);
    }
}

function projectDebtPayments(input, collection) {
    for (const row of input.legacyRows?.pagamentosDividas || []) {
        const ref = sourceRef(row, `pagamentos-dividas-${hash(row, 8)}`);
        const relatedEvent = row.related_source_row_id
            ? collection.events.find(event => event.source_row_ref === row.related_source_row_id)
            : null;
        const interestCents = cents(row.juros || 0);
        const principalCents = cents(row.principal || 0);
        const event = makeEvent('sheet.pagamentos_dividas', ref, row, {
            household_id: input.householdId,
            kind: 'debt_payment',
            description: row.descricao || row.divida_nome,
            amount: row.valor_total,
            category: interestCents > 0 ? 'Juros' : null,
            subcategory: row.divida_nome || null,
            free_budget_eligible: false,
            net_income_expense_impact: interestCents
        });
        addEvent(collection, event, [
            makeLine(event, 'cash', { direction: 'outflow' }),
            makeLine(event, 'debt', { direction: 'inflow', amount_cents: principalCents || event.amount_cents }),
            makeLine(event, 'category', { direction: 'outflow', amount_cents: interestCents })
        ]);
        if (relatedEvent) {
            collection.reconciliationLinks.push(makeLink(event, 'payment', relatedEvent.event_id, { ref, related: row.related_source_row_id }));
        }
    }
}

function transferKind(row) {
    const status = normalizeText(row.status || '');
    const destination = normalizeText(row.destino || '');
    const origin = normalizeText(row.origem || '');
    if (status.includes('fatura')) return 'invoice_payment';
    if (status.includes('reserva') || status.includes('investimento') || destination.includes('caixinha') || destination.includes('reserva')) {
        return destination.includes('conta corrente') || origin.includes('caixinha') || origin.includes('reserva')
            ? 'goal_withdrawal'
            : 'goal_contribution';
    }
    return 'transfer';
}

function projectTransfers(input, collection) {
    for (const row of input.legacyRows?.transferencias || []) {
        const ref = sourceRef(row, `transferencias-${hash(row, 8)}`);
        const kind = transferKind(row);
        const event = makeEvent('sheet.transferencias', ref, row, {
            household_id: input.householdId,
            kind,
            amount: row.valor,
            category: null,
            subcategory: null,
            free_budget_eligible: false,
            net_income_expense_impact: 0
        });
        const lines = kind === 'invoice_payment'
            ? [
                makeLine(event, 'cash', { direction: 'outflow' }),
                makeLine(event, 'card_liability', { direction: 'inflow' })
            ]
            : kind === 'goal_contribution' || kind === 'goal_withdrawal'
                ? [
                    makeLine(event, 'cash', { direction: kind === 'goal_contribution' ? 'outflow' : 'inflow' }),
                    makeLine(event, 'goal', { direction: kind === 'goal_contribution' ? 'inflow' : 'outflow' })
                ]
                : [
                    makeLine(event, 'cash', { direction: 'outflow' }),
                    makeLine(event, 'clearing', { direction: 'inflow' })
                ];
        addEvent(collection, event, lines);
        if (kind === 'invoice_payment') {
            registerInvoiceObservation(collection, event, {
                cardName: row.destino || row.cartao || '',
                competenceMonth: invoiceCompetenceFromRow(row, event.occurred_on),
                type: 'payment'
            });
        }
    }
}

function firstDayOfCompetence(competenceMonth) {
    return competenceMonth ? `${competenceMonth}-01` : null;
}

function projectCardPurchases(input, collection) {
    for (const row of input.legacyRows?.lancamentosCartao || []) {
        const ref = sourceRef(row, `cartao-${hash(row, 8)}`);
        const occurredOn = normalizeDate(row.data);
        const competenceMonth = normalizeCompetenceMonth(row.mes_cobranca, occurredOn);
        const event = makeEvent('sheet.lancamentos_cartao', ref, row, {
            household_id: input.householdId,
            kind: 'card_purchase',
            amount: row.valor_parcela,
            occurred_on: occurredOn,
            effective_on: firstDayOfCompetence(competenceMonth),
            competence_month: competenceMonth,
            free_budget_eligible: true,
            net_income_expense_impact: cents(row.valor_parcela)
        });
        addEvent(collection, event, [
            makeLine(event, 'card_liability', { direction: 'outflow', account_id: row.card_id || null }),
            makeLine(event, 'category', { direction: 'outflow' })
        ]);
        registerInvoiceObservation(collection, event, {
            cardId: row.card_id || '',
            cardName: row.cartao || row.card || row.card_id || '',
            competenceMonth,
            type: 'item'
        });
    }
}

function projectGoals(input, collection) {
    for (const row of input.legacyRows?.metas || []) {
        const ref = sourceRef(row, `metas-${hash(row, 8)}`);
        const competenceMonth = input.projectionContext?.competenceMonth;
        const openingDate = firstDayOfCompetence(competenceMonth);
        const event = makeEvent('sheet.metas', ref, row, {
            household_id: input.householdId,
            kind: 'goal_opening',
            status: normalizeText(row.status || '').includes('cancel') ? 'cancelled' : 'pending',
            description: row.nome || row.descricao,
            amount: row.valor_atual || row.valor_alvo,
            occurred_on: openingDate,
            effective_on: openingDate,
            competence_month: competenceMonth,
            category: 'Meta',
            subcategory: row.nome || null,
            free_budget_eligible: false,
            net_income_expense_impact: 0
        });
        addEvent(collection, event, [
            makeLine(event, 'goal', { direction: 'inflow' }),
            makeLine(event, 'clearing', { direction: 'neutral' })
        ]);
    }
}

function projectGoalMovements(input, collection) {
    for (const row of input.legacyRows?.movimentacoesMetas || []) {
        const ref = sourceRef(row, `movimentacoes-metas-${hash(row, 8)}`);
        const relatedEvent = row.related_source_row_id
            ? collection.events.find(event => event.source_row_ref === row.related_source_row_id)
            : null;
        const isWithdrawal = normalizeText(row.tipo || '').includes('retirada') || normalizeText(row.descricao || '').includes('resgate');
        const event = makeEvent('sheet.movimentacoes_metas', ref, row, {
            household_id: input.householdId,
            kind: isWithdrawal ? 'goal_withdrawal' : 'goal_contribution',
            description: row.descricao || row.meta_nome,
            amount: row.valor,
            category: 'Meta',
            subcategory: row.meta_nome || null,
            free_budget_eligible: false,
            net_income_expense_impact: 0
        });
        addEvent(collection, event, [
            makeLine(event, 'cash', { direction: isWithdrawal ? 'inflow' : 'outflow' }),
            makeLine(event, 'goal', { direction: isWithdrawal ? 'outflow' : 'inflow' })
        ]);
        if (relatedEvent) {
            collection.reconciliationLinks.push(makeLink(event, 'goal_movement', relatedEvent.event_id, { ref, related: row.related_source_row_id }));
        }
    }
}

function projectImportedTransactions(input, collection) {
    for (const row of input.legacyRows?.importedTransactions || []) {
        const ref = sourceRef(row, `imported-${hash(row, 8)}`);
        const relatedEvent = row.matched_source_row_id
            ? collection.events.find(event => event.source_row_ref === row.matched_source_row_id)
            : null;
        const event = makeEvent('import.statement', ref, row, {
            household_id: input.householdId,
            kind: 'adjustment',
            description: row.descricao,
            amount: Math.abs(cents(row.valor)) / 100,
            category: null,
            subcategory: null,
            free_budget_eligible: false,
            net_income_expense_impact: 0
        });
        addEvent(collection, event, [
            makeLine(event, 'clearing', { direction: 'neutral' })
        ]);
        if (relatedEvent) {
            collection.reconciliationLinks.push(makeLink(event, 'import_match', relatedEvent.event_id, {
                ref,
                matched: row.matched_source_row_id,
                source_file_hash: row.source_file_hash || ''
            }));
        } else {
            collection.warnings.push({
                code: 'import_unmatched',
                event_id: event.event_id,
                source_row_ref: ref
            });
        }
    }
}

function projectLegacyRowsToCanonicalLedger(input = {}) {
    const collection = {
        events: [],
        lines: [],
        schedules: [],
        invoices: [],
        invoiceItems: [],
        invoicePayments: [],
        reconciliationLinks: [],
        warnings: []
    };

    const bills = projectBills(input, collection);
    projectExpenses(input, collection, bills);
    projectIncome(input, collection);
    projectTransfers(input, collection);
    projectCardPurchases(input, collection);
    projectDebts(input, collection);
    projectDebtPayments(input, collection);
    projectGoals(input, collection);
    projectGoalMovements(input, collection);
    projectImportedTransactions(input, collection);

    collection.events.sort((a, b) => a.event_id.localeCompare(b.event_id));
    collection.lines.sort((a, b) => a.line_id.localeCompare(b.line_id));
    collection.schedules.sort((a, b) => a.schedule_id.localeCompare(b.schedule_id));
    collection.invoices.sort((a, b) => a.invoice_id.localeCompare(b.invoice_id));
    collection.invoiceItems.sort((a, b) => a.invoice_item_id.localeCompare(b.invoice_item_id));
    collection.invoicePayments.sort((a, b) => a.invoice_payment_id.localeCompare(b.invoice_payment_id));
    collection.reconciliationLinks.sort((a, b) => a.link_id.localeCompare(b.link_id));
    collection.warnings.sort((a, b) => `${a.code}:${a.event_id}`.localeCompare(`${b.code}:${b.event_id}`));

    return collection;
}

function buildPeopleMap(input = {}) {
    return new Map((input.people || []).map(person => [person.person_id, person.display_name]));
}

function buildCanonicalPublicProjection(projected = {}, input = {}) {
    const people = buildPeopleMap(input);
    return (projected.events || []).map(event => ({
        date: event.occurred_on,
        effective_on: event.effective_on,
        competence_month: event.competence_month,
        due_on: event.due_on,
        kind: event.kind,
        status: event.status,
        description: event.description,
        amount_cents: event.amount_cents,
        currency: event.currency,
        category: event.category,
        subcategory: event.subcategory,
        category_status: event.category_status,
        responsible: people.get(event.owner_person_id) || 'Pessoa',
        source: event.source_type.replace(/^sheet\./, ''),
        free_budget_eligible: event.free_budget_eligible
    }));
}

module.exports = {
    projectLegacyRowsToCanonicalLedger,
    buildCanonicalPublicProjection
};
