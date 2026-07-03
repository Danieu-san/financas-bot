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

const SUPPORTED_SHEETS = new Set(['Saídas', 'Entradas', 'Transferências']);

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
        'Transferências': 'sheet.transferencias'
    };
    const sourceType = sourceTypeBySheet[sheetName];
    if (!sourceType) return;
    const keptEvents = projected.events.filter(event => event.source_type === sourceType);
    const keptEventIds = new Set(keptEvents.map(event => event.event_id));
    projected.events = keptEvents;
    projected.lines = projected.lines.filter(line => keptEventIds.has(line.event_id));
    projected.schedules = [];
    projected.reconciliationLinks = projected.reconciliationLinks.filter(link =>
        keptEventIds.has(link.event_id) && keptEventIds.has(link.related_event_id)
    );
    projected.warnings = projected.warnings.filter(warning => keptEventIds.has(warning.event_id));
}
function decorateReceiptProjection(projected, { sheetName, row }) {
    const event = projected.events[0];
    if (!event) return;

    if (sheetName === 'Transferências' && String(row[7] || '').toLowerCase().includes('pendent')) {
        event.status = 'pending';
    }

    if (sheetName === 'Saídas') {
        Object.assign(
            projected.lines.find(line => line.line_type === 'cash') || {},
            accountIdentity(event.owner_person_id, row[6])
        );
    } else if (sheetName === 'Entradas') {
        Object.assign(
            projected.lines.find(line => line.line_type === 'cash') || {},
            accountIdentity(event.owner_person_id, row[5])
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
    const base = {
        householdId: 'household_shadow',
        projectionContext: {
            competenceMonth: null
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
    if (!SUPPORTED_SHEETS.has(sheetName)) return null;
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
    decorateReceiptProjection(projected, { sheetName, row });
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
    personByUserId = {}
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
