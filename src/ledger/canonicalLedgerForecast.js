function normalizeDate(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function inDateWindow(date, from, to) {
    if (!date) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
}

function sortForecastItems(a, b) {
    return [a.date, a.type, a.domain, a.description].join(':')
        .localeCompare([b.date, b.type, b.domain, b.description].join(':'));
}

function normalizeStatus(status) {
    const value = String(status || 'pending').toLowerCase();
    if (value === 'settled' || value === 'paid') return 'settled';
    if (value === 'cancelled' || value === 'canceled') return 'cancelled';
    if (value === 'uncertain') return 'uncertain';
    return 'pending';
}

function publicOrigin(kind, source = {}) {
    return Object.fromEntries(Object.entries({
        kind,
        source_type: source.source_type || source.sourceType || null
    }).filter(([, value]) => value));
}

function makeItem({ type, domain, date, amount_cents, status = 'pending', description, currency = 'BRL', origin }) {
    return {
        type,
        domain,
        date,
        amount_cents: Number(amount_cents || 0),
        currency,
        status: normalizeStatus(status) === 'settled' ? 'settled' : normalizeStatus(status),
        description: String(description || '').trim(),
        origin,
        expected_cash_direction: type === 'receivable' ? 'inflow' : 'outflow',
        affects_current_cash: false
    };
}

function buildBillItems(projected, { from, to, includeSettled }) {
    return (projected.recurrenceOccurrences || [])
        .filter(occurrence => includeSettled || normalizeStatus(occurrence.status) !== 'settled')
        .filter(occurrence => normalizeStatus(occurrence.status) !== 'cancelled')
        .filter(occurrence => inDateWindow(normalizeDate(occurrence.due_on), from, to))
        .map(occurrence => makeItem({
            type: 'payable',
            domain: 'bill',
            date: occurrence.due_on,
            amount_cents: occurrence.amount_cents,
            currency: occurrence.currency,
            status: occurrence.status,
            description: occurrence.description,
            origin: publicOrigin('recurrence_occurrence', occurrence)
        }));
}

function remainingInvoiceAmount(invoice) {
    const total = Number(invoice.observed_item_total_cents || 0);
    const paid = Number(invoice.observed_payment_total_cents || 0);
    return Math.max(0, total - paid);
}

function buildInvoiceItems(projected, { from, to, includeSettled }) {
    return (projected.invoices || [])
        .map(invoice => ({ invoice, amount: remainingInvoiceAmount(invoice) }))
        .filter(({ invoice, amount }) => amount > 0 || includeSettled)
        .filter(({ invoice, amount }) => includeSettled || amount > 0)
        .filter(({ invoice }) => normalizeStatus(invoice.status) !== 'cancelled')
        .filter(({ invoice }) => inDateWindow(normalizeDate(invoice.due_on), from, to))
        .map(({ invoice, amount }) => makeItem({
            type: 'payable',
            domain: 'invoice',
            date: invoice.due_on,
            amount_cents: amount,
            currency: invoice.currency,
            status: amount > 0 ? 'pending' : 'settled',
            description: invoice.card_name || invoice.card_key || 'Fatura',
            origin: publicOrigin('invoice', { source_row_ref: invoice.invoice_id })
        }));
}

function scheduleForEvent(projected, event) {
    return (projected.schedules || []).find(schedule =>
        schedule.source_id_hash && event.source_id_hash && schedule.source_id_hash === event.source_id_hash
    ) || null;
}

function cashDirectionForEvent(projected, event) {
    const cashLine = (projected.lines || []).find(line =>
        line.event_id === event.event_id && line.line_type === 'cash'
    );
    return cashLine?.direction || null;
}

function eventForecastDomain(event) {
    if (event.kind === 'debt_opening') return 'debt';
    if (event.kind === 'income') return 'income';
    if (event.kind === 'transfer') return 'transfer';
    return null;
}

function eventForecastType(projected, event) {
    if (event.kind === 'income') return 'receivable';
    if (event.kind === 'transfer') {
        return cashDirectionForEvent(projected, event) === 'inflow' ? 'receivable' : 'payable';
    }
    return 'payable';
}

function eventForecastDate(event) {
    return normalizeDate(event.due_on) || normalizeDate(event.effective_on) || normalizeDate(event.occurred_on);
}

function eventForecastAmount(projected, event) {
    const schedule = scheduleForEvent(projected, event);
    return Number(schedule?.amount_cents || event.amount_cents || 0);
}

function buildEventItems(projected, { from, to, includeSettled }) {
    return (projected.events || [])
        .filter(event => eventForecastDomain(event))
        .filter(event => includeSettled || normalizeStatus(event.status) !== 'settled')
        .filter(event => normalizeStatus(event.status) !== 'cancelled')
        .filter(event => inDateWindow(eventForecastDate(event), from, to))
        .map(event => makeItem({
            type: eventForecastType(projected, event),
            domain: eventForecastDomain(event),
            date: eventForecastDate(event),
            amount_cents: eventForecastAmount(projected, event),
            currency: event.currency,
            status: event.status,
            description: event.description,
            origin: publicOrigin('event', event)
        }));
}

function summarize(items) {
    const totals = {
        payable_cents: 0,
        receivable_cents: 0,
        net_expected_cash_cents: 0,
        current_cash_impact_cents: 0,
        byStatus: {}
    };

    for (const item of items) {
        if (item.type === 'receivable') totals.receivable_cents += item.amount_cents;
        else totals.payable_cents += item.amount_cents;
        totals.byStatus[item.status] = (totals.byStatus[item.status] || 0) + item.amount_cents;
    }
    totals.net_expected_cash_cents = totals.receivable_cents - totals.payable_cents;
    return totals;
}

function buildCanonicalForecast(projected = {}, options = {}) {
    const from = normalizeDate(options.from);
    const to = normalizeDate(options.to);
    const includeSettled = options.includeSettled === true;
    const items = [
        ...buildBillItems(projected, { from, to, includeSettled }),
        ...buildInvoiceItems(projected, { from, to, includeSettled }),
        ...buildEventItems(projected, { from, to, includeSettled })
    ].sort(sortForecastItems);

    return {
        criteria: {
            from,
            to,
            dateBasis: 'due_on_or_effective_on',
            settledIncluded: includeSettled
        },
        totals: summarize(items),
        items
    };
}

module.exports = {
    buildCanonicalForecast
};
