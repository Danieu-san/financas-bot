const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { normalizeRecurringBillRow } = require('../utils/recurringBillMatcher');
const { parseAmountLocal, normalizeText } = require('../utils/helpers');

const {
    projectLegacyRowsToCanonicalLedger,
    buildCanonicalPublicProjection
} = require('./canonicalLedgerProjector');
const {
    CanonicalLedgerShadowStore,
    DEFAULT_DB_PATH
} = require('./canonicalLedgerShadowStore');
const {
    buildCanonicalLedgerRolloutPolicy
} = require('./canonicalLedgerRolloutPolicy');
const {
    buildCanonicalForecast
} = require('./canonicalLedgerForecast');

const SUPPORTED_SHEETS = new Set(['Saídas', 'Entradas', 'Transferências', 'Lançamentos Cartão']);

function isCreditCardSheet(sheetName) {
    const normalized = String(sheetName || '').trim();
    return normalized === 'Lançamentos Cartão' || normalized.startsWith('Cartão ');
}

function isSupportedSheet(sheetName) {
    return SUPPORTED_SHEETS.has(sheetName) || isCreditCardSheet(sheetName);
}

function cardIdFromSheetName(sheetName) {
    return normalizeText(String(sheetName || ''))
        .replace(/^cartao\s+/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'cartao';
}

function hash(value, length = 24) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function ledgerBillRowsFromAccountRows(accountRows = []) {
    if (!Array.isArray(accountRows) || accountRows.length < 2) return [];
    const headers = accountRows[0] || [];
    return accountRows
        .slice(1)
        .map((row, index) => {
            const bill = normalizeRecurringBillRow(row, headers);
            return {
                source_row_id: `contas-receipt-${index + 1}-${hash(row, 8)}`,
                nome: bill.accountName,
                nome_amigavel: bill.description,
                categoria: bill.category,
                subcategoria: bill.subcategory,
                valor_esperado: bill.expectedValue,
                dia_vencimento: bill.dueDay,
                regra_ativa: bill.ruleActive || 'SIM',
                user_id: bill.userId
            };
        })
        .filter(bill => bill.nome || bill.nome_amigavel || bill.categoria || bill.subcategoria);
}

function findHeaderIndex(headers = [], candidates = [], fallback = -1) {
    const normalizedCandidates = candidates.map(candidate => normalizeText(candidate));
    const index = headers.findIndex(header => normalizedCandidates.includes(normalizeText(header)));
    return index >= 0 ? index : fallback;
}

function parseExplicitMoneyCents(value) {
    const raw = String(value ?? '').trim();
    if (!raw || !/\d/.test(raw)) return null;
    const parsed = parseAmountLocal(raw);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed * 100);
}

function normalizeAccountType(value) {
    const normalized = normalizeText(value || '').replace(/[^a-z0-9_\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (['cash', 'dinheiro', 'carteira'].includes(normalized)) return 'cash';
    if (['wallet', 'carteira digital'].includes(normalized)) return 'wallet';
    if (['reserve', 'reserva', 'caixinha', 'investimento'].includes(normalized)) return 'reserve';
    if (['credit_liability', 'cartao', 'cartao de credito', 'cartão', 'cartão de crédito'].includes(normalized)) return 'credit_liability';
    if (['debt', 'divida', 'dívida'].includes(normalized)) return 'debt';
    if (['goal', 'meta'].includes(normalized)) return 'goal';
    if (['adjustment', 'ajuste'].includes(normalized)) return 'adjustment';
    return 'bank';
}

function normalizeAccountStatus(value) {
    const normalized = normalizeText(value || '').trim();
    if (['inativo', 'inativa', 'closed', 'fechada', 'fechado', 'nao', 'não', 'false', '0'].includes(normalized)) return 'inactive';
    return 'active';
}

function normalizeOpenedOn(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
        return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return '1970-01-01';
}

function competenceMonthFromReceiptDate(value) {
    const raw = String(value || '').trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-\d{2}$/);
    if (iso) return `${iso[1]}-${iso[2]}`;
    const pt = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (pt) return `${pt[3]}-${String(pt[2]).padStart(2, '0')}`;
    return null;
}
function ledgerAccountsFromFinancialAccountRows(financialAccountRows = []) {
    if (!Array.isArray(financialAccountRows) || financialAccountRows.length < 2) return [];
    const headers = financialAccountRows[0] || [];
    const idx = {
        name: findHeaderIndex(headers, ['Nome da Conta', 'Conta', 'Nome'], 0),
        type: findHeaderIndex(headers, ['Tipo', 'Tipo da Conta', 'account_type', 'type'], 1),
        opening: findHeaderIndex(headers, ['Saldo Inicial', 'Saldo de Abertura', 'opening_balance'], 2),
        openedOn: findHeaderIndex(headers, ['Data de Abertura', 'Aberta em', 'opened_on'], 3),
        status: findHeaderIndex(headers, ['Status', 'Ativa', 'Ativo'], 4),
        currency: findHeaderIndex(headers, ['Moeda', 'currency'], 5),
        userId: findHeaderIndex(headers, ['user_id', 'user id'], 7)
    };

    const accountsById = new Map();
    for (const row of financialAccountRows.slice(1)) {
        const name = String(row[idx.name] || '').trim();
        const ownerPersonId = String(row[idx.userId] || '').trim();
        const openingBalanceCents = parseExplicitMoneyCents(row[idx.opening]);
        if (!name || !ownerPersonId || !Number.isInteger(openingBalanceCents)) continue;
        const identity = accountIdentity(ownerPersonId, name);
        accountsById.set(identity.account_id, {
            account_id: identity.account_id,
            household_id: 'household_shadow',
            owner_person_id: ownerPersonId,
            account_type: normalizeAccountType(row[idx.type]),
            name: identity.account_name,
            currency: String(row[idx.currency] || 'BRL').trim().toUpperCase() || 'BRL',
            opening_balance_cents: openingBalanceCents,
            opened_on: normalizeOpenedOn(row[idx.openedOn]),
            status: normalizeAccountStatus(row[idx.status])
        });
    }
    return [...accountsById.values()].sort((left, right) => left.name.localeCompare(right.name));
}
function accountIdentity(ownerPersonId, name) {
    const accountName = String(name || '').trim() || 'Conta não informada';
    return {
        account_id: `acct_${hash(`${ownerPersonId || 'person'}:${accountName}`, 20)}`,
        account_name: accountName
    };
}

function keepOnlyReceiptSourceEvents(projected, sheetName) {
    const sourceTypeBySheet = {
        'Saídas': 'sheet.saidas',
        'Entradas': 'sheet.entradas',
        'Transferências': 'sheet.transferencias',
        'Lançamentos Cartão': 'sheet.lancamentos_cartao'
    };
    const sourceType = isCreditCardSheet(sheetName)
        ? sourceTypeBySheet['Lançamentos Cartão']
        : sourceTypeBySheet[sheetName];
    if (!sourceType) return;

    const keptEvents = projected.events.filter(event => event.source_type === sourceType);
    const keptEventIds = new Set(keptEvents.map(event => event.event_id));
    const keptOccurrences = (projected.recurrenceOccurrences || [])
        .filter(occurrence => occurrence.settled_event_id && keptEventIds.has(occurrence.settled_event_id))
        .map(occurrence => ({
            ...occurrence,
            occurrence_event_id: keptEventIds.has(occurrence.occurrence_event_id) ? occurrence.occurrence_event_id : null
        }));
    const occurrenceBySettledEventId = new Map(keptOccurrences.map(occurrence => [occurrence.settled_event_id, occurrence]));
    for (const event of keptEvents) {
        const occurrence = occurrenceBySettledEventId.get(event.event_id);
        if (!occurrence) continue;
        event.recurrence_rule_id = occurrence.recurrence_rule_id;
        event.recurrence_occurrence_id = occurrence.recurrence_occurrence_id;
    }

    projected.events = keptEvents;
    projected.lines = projected.lines.filter(line => keptEventIds.has(line.event_id));
    projected.invoiceItems = (projected.invoiceItems || []).filter(item => keptEventIds.has(item.event_id));
    projected.invoicePayments = (projected.invoicePayments || []).filter(payment => keptEventIds.has(payment.event_id));
    const keptInvoiceIds = new Set([
        ...projected.invoiceItems.map(item => item.invoice_id),
        ...projected.invoicePayments.map(payment => payment.invoice_id)
    ]);
    projected.invoices = (projected.invoices || []).filter(invoice => keptInvoiceIds.has(invoice.invoice_id));
    projected.schedules = [];
    const keptRuleIds = new Set(keptOccurrences.map(occurrence => occurrence.recurrence_rule_id));
    projected.recurrenceOccurrences = keptOccurrences;
    projected.recurrenceRules = (projected.recurrenceRules || []).filter(rule => keptRuleIds.has(rule.recurrence_rule_id));
    projected.reconciliationLinks = projected.reconciliationLinks.filter(link => {
        if (!keptEventIds.has(link.event_id)) return false;
        if (keptEventIds.has(link.related_event_id)) return true;
        return link.link_type === 'recurrence_occurrence_payment' && occurrenceBySettledEventId.has(link.event_id);
    });
    projected.warnings = projected.warnings.filter(warning => keptEventIds.has(warning.event_id));
}
function resolveRegisteredAccountName(financialAccountRows, ownerPersonId, candidates = []) {
    const accounts = ledgerAccountsFromFinancialAccountRows(financialAccountRows)
        .filter(account => account.owner_person_id === ownerPersonId);
    for (const candidate of candidates) {
        const normalizedCandidate = normalizeText(candidate || '').trim();
        if (!normalizedCandidate) continue;
        const matched = accounts.find(account => normalizeText(account.name).trim() === normalizedCandidate);
        if (matched) return matched.name;
    }
    return '';
}

function assignRegisteredAccount(line, ownerPersonId, accountName) {
    if (!line) return;
    if (!accountName) {
        delete line.account_id;
        delete line.account_name;
        return;
    }
    Object.assign(line, accountIdentity(ownerPersonId, accountName));
}

function decorateReceiptProjection(projected, { sheetName, row, financialAccountRows = [] }) {
    const event = projected.events[0];
    if (!event) return;

    if (sheetName === 'Transferências' && String(row[7] || '').toLowerCase().includes('pendent')) {
        event.status = 'pending';
    }

    if (sheetName === 'Saídas') {
        assignRegisteredAccount(
            projected.lines.find(line => line.line_type === 'cash'),
            event.owner_person_id,
            resolveRegisteredAccountName(financialAccountRows, event.owner_person_id, [row[10], row[6]])
        );
    } else if (sheetName === 'Entradas') {
        assignRegisteredAccount(
            projected.lines.find(line => line.line_type === 'cash'),
            event.owner_person_id,
            resolveRegisteredAccountName(financialAccountRows, event.owner_person_id, [row[9], row[5]])
        );
    } else if (sheetName === 'Transferências') {
        Object.assign(
            projected.lines.find(line => line.line_type === 'cash') || {},
            accountIdentity(event.owner_person_id, row[3])
        );
        Object.assign(
            projected.lines.find(line => line.line_type === 'clearing') || {},
            accountIdentity(event.owner_person_id, row[4])
        );
    }
}

function legacyInputFromAppend({ sheetName, row, operationKey, receipt, accountRows = [] }) {
    const sourceRowId = String(receipt?.updatedRange || operationKey);
    const competenceMonth = competenceMonthFromReceiptDate(row?.[0]);
    const base = {
        householdId: 'household_shadow',
        includeInstallmentSchedules: false,
        projectionContext: {
            competenceMonth,
            materializeCompetenceMonths: competenceMonth ? [competenceMonth] : []
        },
        legacyRows: {
            contas: ledgerBillRowsFromAccountRows(accountRows),
            saidas: [],
            entradas: [],
            transferencias: [],
            lancamentosCartao: [],
            dividas: [],
            pagamentosDividas: [],
            metas: [],
            movimentacoesMetas: [],
            importedTransactions: []
        },
        people: []
    };

    if (sheetName === 'Saídas') {
        base.legacyRows.saidas.push({
            source_row_id: sourceRowId,
            data: row[0],
            descricao: row[1],
            categoria: row[2],
            subcategoria: row[3],
            valor: row[4],
            responsavel: row[5],
            pagamento: row[6],
            recorrente: row[7],
            observacoes: row[8],
            user_id: row[9]
        });
    } else if (sheetName === 'Entradas') {
        base.legacyRows.entradas.push({
            source_row_id: sourceRowId,
            data: row[0],
            descricao: row[1],
            categoria: row[2],
            valor: row[3],
            responsavel: row[4],
            recebimento: row[5],
            recorrente: row[6],
            observacoes: row[7],
            user_id: row[8]
        });
    } else if (sheetName === 'Transferências') {
        base.legacyRows.transferencias.push({
            source_row_id: sourceRowId,
            data: row[0],
            descricao: row[1],
            valor: row[2],
            origem: row[3],
            destino: row[4],
            metodo: row[5],
            observacoes: row[6],
            status: row[7],
            user_id: row[8]
        });
    } else if (isCreditCardSheet(sheetName)) {
        const unifiedRow = row.length >= 10;
        base.legacyRows.lancamentosCartao.push({
            source_row_id: sourceRowId,
            data: row[0],
            descricao: row[1],
            categoria: row[2],
            valor_parcela: row[3],
            parcela: row[4],
            mes_cobranca: row[5],
            card_id: unifiedRow ? row[6] : cardIdFromSheetName(sheetName),
            cartao: unifiedRow ? row[7] : sheetName,
            observacoes: unifiedRow ? row[8] : '',
            user_id: unifiedRow ? row[9] : row[6]
        });
    }

    return base;
}

function buildCanonicalLedgerAccountsSourceProjection({
    financialAccountRows = [],
    runId = `accounts_source_${hash(JSON.stringify(financialAccountRows), 24)}`
} = {}) {
    const accounts = ledgerAccountsFromFinancialAccountRows(financialAccountRows);
    return {
        runId,
        projected: {
            accounts,
            events: [],
            lines: [],
            schedules: [],
            reconciliationLinks: []
        },
        publicProjection: [],
        report: {
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: false,
            source_sheet: 'Contas Financeiras',
            source: 'financial_accounts_source',
            account_count: accounts.length,
            unexplained_differences: []
        }
    };
}

function buildCanonicalLedgerReceiptProjection({
    sheetName,
    row,
    operationKey,
    status = 'committed',
    source = '',
    receipt = {},
    accountRows = [],
    financialAccountRows = [],
    committedAt = '',
    now = () => new Date()
} = {}) {
    if (!isSupportedSheet(sheetName)) return null;
    if (!Array.isArray(row) || !String(operationKey || '').trim()) return null;
    if (status !== 'committed') return null;
    if (source === 'statement_import') return null;

    const input = legacyInputFromAppend({
        sheetName,
        row,
        operationKey,
        receipt,
        accountRows
    });
    const projected = projectLegacyRowsToCanonicalLedger(input);
    keepOnlyReceiptSourceEvents(projected, sheetName);
    const timestampValue = committedAt || now();
    const timestampDate = timestampValue instanceof Date
        ? timestampValue
        : new Date(timestampValue);
    const projectedAt = Number.isFinite(timestampDate.getTime())
        ? timestampDate.toISOString()
        : new Date().toISOString();
    for (const event of projected.events) {
        event.idempotency_key = operationKey;
        event.source_id_hash = hash(operationKey, 32);
        event.created_at = projectedAt;
        event.updated_at = projectedAt;
    }
    decorateReceiptProjection(projected, { sheetName, row, financialAccountRows });
    projected.accounts = ledgerAccountsFromFinancialAccountRows(financialAccountRows);
    const publicProjection = buildCanonicalPublicProjection(projected, input);
    const runId = `receipt_${hash(operationKey)}`;

    return {
        runId,
        projected,
        publicProjection,
        report: {
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: false,
            operation_key_hash: hash(operationKey, 16),
            source_sheet: sheetName,
            event_count: projected.events.length,
            unexplained_differences: []
        }
    };
}

function projectCommittedAppendToCanonicalShadow({
    env = process.env,
    dbPath = env.CANONICAL_LEDGER_SHADOW_DB_PATH || DEFAULT_DB_PATH,
    ...input
} = {}) {
    const policy = buildCanonicalLedgerRolloutPolicy(env);
    if (!policy.shadowWritesAllowed) {
        return {
            projected: false,
            reason: 'shadow_writes_disabled'
        };
    }

    const projection = buildCanonicalLedgerReceiptProjection(input);
    if (!projection) {
        return {
            projected: false,
            reason: 'receipt_not_eligible'
        };
    }

    const store = new CanonicalLedgerShadowStore({
        dbPath,
        writesEnabled: true
    });
    try {
        const receipt = store.persistProjection(projection);
        return {
            projected: true,
            runId: projection.runId,
            receipt
        };
    } finally {
        store.close();
    }
}

function safelyProjectCommittedAppendToCanonicalShadow({
    projector = projectCommittedAppendToCanonicalShadow,
    onWarning = () => {},
    ...input
} = {}) {
    try {
        return projector(input);
    } catch (error) {
        onWarning({
            code: 'canonical_ledger_shadow_projection_failed',
            sheetName: input.sheetName || '',
            error: error.message
        });
        return {
            projected: false,
            reason: 'projection_failed'
        };
    }
}

function ownerFilter(ownerPersonIds, column = 'e.owner_person_id') {
    const ids = [...new Set((ownerPersonIds || []).map(String).filter(Boolean))];
    return {
        ids,
        clause: ids.length > 0
            ? ` AND ${column} IN (${ids.map(() => '?').join(', ')})`
            : ''
    };
}

function tableExists(db, tableName) {
    return Boolean(db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
    `).get(tableName));
}

function readReceiptAccountRows(db, ownerPersonIds = [], personByUserId = {}) {
    if (!tableExists(db, 'canonical_ledger_accounts')) return [];

    const filter = ownerFilter(ownerPersonIds, 'a.owner_person_id');
    const accountRows = db.prepare(`
        SELECT a.account_id, a.account_type, a.name, a.currency,
            a.opening_balance_cents, a.opened_on, a.status, a.owner_person_id
        FROM canonical_ledger_accounts a
        JOIN canonical_ledger_projection_runs r ON r.run_id = a.run_id
        WHERE r.report_type = ?
        ${filter.clause}
        ORDER BY r.created_at DESC, a.name ASC
    `).all('canonical_ledger_receipt_shadow', ...filter.ids);

    const latestByAccountId = new Map();
    for (const row of accountRows) {
        if (!latestByAccountId.has(row.account_id)) latestByAccountId.set(row.account_id, row);
    }
    const accounts = Array.from(latestByAccountId.values());
    if (accounts.length === 0) return [];
    if (accounts.some(account => !Number.isInteger(account.opening_balance_cents))) {
        return [];
    }

    const accountIds = accounts.map(account => account.account_id);
    const placeholders = accountIds.map(() => '?').join(', ');
    const lineFilter = ownerFilter(ownerPersonIds, 'e.owner_person_id');
    const lineRows = db.prepare(`
        SELECT l.account_id, l.direction, l.amount_cents
        FROM canonical_ledger_event_lines l
        JOIN canonical_ledger_events e ON e.run_id = l.run_id AND e.event_id = l.event_id
        JOIN canonical_ledger_projection_runs r ON r.run_id = l.run_id
        WHERE r.report_type = ?
        AND e.status = 'settled'
        AND l.account_id IN (${placeholders})
        ${lineFilter.clause}
    `).all('canonical_ledger_receipt_shadow', ...accountIds, ...lineFilter.ids);
    const movementByAccountId = new Map(accountIds.map(accountId => [accountId, 0]));
    for (const line of lineRows) {
        const signedAmount = line.direction === 'inflow'
            ? Number(line.amount_cents || 0)
            : line.direction === 'outflow'
                ? -Number(line.amount_cents || 0)
                : 0;
        movementByAccountId.set(line.account_id, (movementByAccountId.get(line.account_id) || 0) + signedAmount);
    }

    return accounts.map(account => {
        const opening = Number(account.opening_balance_cents || 0);
        return {
            name: String(account.name || ''),
            account_type: String(account.account_type || ''),
            status: String(account.status || ''),
            currency: String(account.currency || 'BRL'),
            opened_on: String(account.opened_on || ''),
            responsible: personByUserId[account.owner_person_id] || 'Pessoa',
            opening_balance_cents: opening,
            balance_cents: opening + (movementByAccountId.get(account.account_id) || 0)
        };
    });
}
function parseJsonRows(rows = [], column) {
    return rows.map(row => {
        try {
            return JSON.parse(row[column]);
        } catch (_) {
            return null;
        }
    }).filter(Boolean);
}

function readReceiptEventRows(db, ownerPersonIds = []) {
    const filter = ownerFilter(ownerPersonIds);
    return parseJsonRows(db.prepare(`
        SELECT e.event_json
        FROM canonical_ledger_events e
        JOIN canonical_ledger_projection_runs r ON r.run_id = e.run_id
        WHERE r.report_type = ?
        ${filter.clause}
        ORDER BY r.created_at, e.event_id
    `).all('canonical_ledger_receipt_shadow', ...filter.ids), 'event_json');
}

function readReceiptLineRows(db, ownerPersonIds = []) {
    const filter = ownerFilter(ownerPersonIds, 'e.owner_person_id');
    return parseJsonRows(db.prepare(`
        SELECT l.line_json
        FROM canonical_ledger_event_lines l
        JOIN canonical_ledger_events e ON e.run_id = l.run_id AND e.event_id = l.event_id
        JOIN canonical_ledger_projection_runs r ON r.run_id = l.run_id
        WHERE r.report_type = ?
        ${filter.clause}
        ORDER BY r.created_at, l.line_id
    `).all('canonical_ledger_receipt_shadow', ...filter.ids), 'line_json');
}

function readReceiptScheduleRows(db, ownerPersonIds = []) {
    if (!tableExists(db, 'canonical_ledger_schedules')) return [];
    const filter = ownerFilter(ownerPersonIds, 's.owner_person_id');
    return parseJsonRows(db.prepare(`
        SELECT s.schedule_json
        FROM canonical_ledger_schedules s
        JOIN canonical_ledger_projection_runs r ON r.run_id = s.run_id
        WHERE r.report_type = ?
        ${filter.clause}
        ORDER BY r.created_at, s.schedule_id
    `).all('canonical_ledger_receipt_shadow', ...filter.ids), 'schedule_json');
}

function readReceiptRecurrenceOccurrenceRows(db, ownerPersonIds = []) {
    if (!tableExists(db, 'canonical_ledger_recurrence_occurrences')) return [];
    const filter = ownerFilter(ownerPersonIds, 'rr.owner_person_id');
    return parseJsonRows(db.prepare(`
        SELECT o.occurrence_json
        FROM canonical_ledger_recurrence_occurrences o
        JOIN canonical_ledger_recurrence_rules rr
            ON rr.run_id = o.run_id AND rr.recurrence_rule_id = o.recurrence_rule_id
        JOIN canonical_ledger_projection_runs r ON r.run_id = o.run_id
        WHERE r.report_type = ?
        ${filter.clause}
        ORDER BY r.created_at, o.due_on, o.recurrence_occurrence_id
    `).all('canonical_ledger_receipt_shadow', ...filter.ids), 'occurrence_json');
}

function readReceiptInvoiceRows(db, ownerPersonIds = []) {
    if (!tableExists(db, 'canonical_ledger_invoices')) return [];
    const filter = ownerFilter(ownerPersonIds, 'i.owner_person_id');
    return db.prepare(`
        WITH ranked_invoices AS (
            SELECT i.*,
                ROW_NUMBER() OVER (
                    PARTITION BY i.invoice_id
                    ORDER BY r.created_at DESC, i.run_id DESC
                ) AS row_rank
            FROM canonical_ledger_invoices i
            JOIN canonical_ledger_projection_runs r ON r.run_id = i.run_id
            WHERE r.report_type = ?
            ${filter.clause}
        ),
        ranked_items AS (
            SELECT i.*,
                ROW_NUMBER() OVER (
                    PARTITION BY i.invoice_item_id
                    ORDER BY r.created_at DESC, i.run_id DESC
                ) AS row_rank
            FROM canonical_ledger_invoice_items i
            JOIN canonical_ledger_projection_runs r ON r.run_id = i.run_id
            WHERE r.report_type = ?
        ),
        ranked_payments AS (
            SELECT p.*,
                ROW_NUMBER() OVER (
                    PARTITION BY p.invoice_payment_id
                    ORDER BY r.created_at DESC, p.run_id DESC
                ) AS row_rank
            FROM canonical_ledger_invoice_payments p
            JOIN canonical_ledger_projection_runs r ON r.run_id = p.run_id
            WHERE r.report_type = ?
        ),
        item_totals AS (
            SELECT invoice_id, SUM(amount_cents) AS total_cents
            FROM ranked_items
            WHERE row_rank = 1
            GROUP BY invoice_id
        ),
        payment_totals AS (
            SELECT invoice_id, SUM(amount_cents) AS total_cents
            FROM ranked_payments
            WHERE row_rank = 1
            GROUP BY invoice_id
        )
        SELECT i.invoice_id, i.household_id, i.owner_person_id, i.card_key,
            i.card_name, i.competence_month, i.due_on, i.currency,
            COALESCE(items.total_cents, 0) AS observed_item_total_cents,
            COALESCE(payments.total_cents, 0) AS observed_payment_total_cents,
            CASE
                WHEN COALESCE(items.total_cents, 0) > 0
                    AND COALESCE(payments.total_cents, 0) >= items.total_cents THEN 'paid'
                WHEN COALESCE(items.total_cents, 0) > 0
                    AND COALESCE(payments.total_cents, 0) > 0 THEN 'partially_paid'
                WHEN COALESCE(items.total_cents, 0) > 0 THEN 'open'
                WHEN COALESCE(payments.total_cents, 0) > 0 THEN 'payment_observed'
                ELSE 'empty'
            END AS status
        FROM ranked_invoices i
        LEFT JOIN item_totals items ON items.invoice_id = i.invoice_id
        LEFT JOIN payment_totals payments ON payments.invoice_id = i.invoice_id
        WHERE i.row_rank = 1
        ORDER BY i.competence_month, i.card_key, i.invoice_id
    `).all('canonical_ledger_receipt_shadow', ...filter.ids, 'canonical_ledger_receipt_shadow', 'canonical_ledger_receipt_shadow');
}

function readReceiptForecastRows(db, ownerPersonIds = [], forecastWindow = {}) {
    if (!tableExists(db, 'canonical_ledger_events')) return null;
    const projected = {
        events: readReceiptEventRows(db, ownerPersonIds),
        lines: readReceiptLineRows(db, ownerPersonIds),
        schedules: readReceiptScheduleRows(db, ownerPersonIds),
        recurrenceOccurrences: readReceiptRecurrenceOccurrenceRows(db, ownerPersonIds),
        invoices: readReceiptInvoiceRows(db, ownerPersonIds)
    };
    return buildCanonicalForecast(projected, forecastWindow);
}
function readReceiptPublicRows(db, ownerPersonIds = [], personByUserId = {}) {
    const filter = ownerFilter(ownerPersonIds);
    return db.prepare(`
        SELECT e.event_json
        FROM canonical_ledger_events e
        JOIN canonical_ledger_projection_runs r ON r.run_id = e.run_id
        WHERE r.report_type = ?
        ${filter.clause}
        ORDER BY r.created_at, e.event_id
    `).all('canonical_ledger_receipt_shadow', ...filter.ids).map(row => {
        const event = JSON.parse(row.event_json);
        return {
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
            responsible: personByUserId[event.owner_person_id] || 'Pessoa',
            source: String(event.source_type || '').replace(/^sheet\./, ''),
            free_budget_eligible: event.free_budget_eligible
        };
    });
}

function readCanonicalLedgerCanaryDomain({
    env = process.env,
    dbPath = env.CANONICAL_LEDGER_SHADOW_DB_PATH || DEFAULT_DB_PATH,
    domain,
    ownerPersonIds = [],
    personByUserId = {},
    forecastWindow = {}
} = {}) {
    const policy = buildCanonicalLedgerRolloutPolicy(env);
    if (!policy.canReadDomain(domain)) {
        return {
            enabled: false,
            reason: 'canary_domain_disabled',
            rows: []
        };
    }

    const db = new Database(dbPath, { readonly: true });
    try {
        if (String(domain || '').trim().toLowerCase() === 'accounts') {
            const accountRows = readReceiptAccountRows(db, ownerPersonIds, personByUserId);
            if (accountRows.length === 0) {
                return {
                    enabled: false,
                    reason: 'canonical_accounts_opening_balances_unavailable',
                    rows: []
                };
            }
            return {
                enabled: true,
                domain: 'accounts',
                rows: accountRows
            };
        }

        if (String(domain || '').trim().toLowerCase() === 'forecast') {
            const forecast = readReceiptForecastRows(db, ownerPersonIds, forecastWindow);
            if (!forecast) {
                return {
                    enabled: false,
                    reason: 'canonical_forecast_unavailable',
                    rows: []
                };
            }
            return {
                enabled: true,
                domain: 'forecast',
                criteria: forecast.criteria,
                totals: forecast.totals,
                rows: forecast.items
            };
        }

        const publicRows = readReceiptPublicRows(db, ownerPersonIds, personByUserId);
        const rows = domain === 'transfers'
            ? publicRows.filter(row => ['transfer', 'goal_contribution', 'goal_withdrawal', 'invoice_payment'].includes(row.kind))
            : publicRows;
        return {
            enabled: true,
            domain,
            rows
        };
    } finally {
        db.close();
    }
}

module.exports = {
    SUPPORTED_SHEETS,
    buildCanonicalLedgerAccountsSourceProjection,
    buildCanonicalLedgerReceiptProjection,
    projectCommittedAppendToCanonicalShadow,
    safelyProjectCommittedAppendToCanonicalShadow,
    readCanonicalLedgerCanaryDomain
};
