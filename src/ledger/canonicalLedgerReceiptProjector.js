const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { normalizeRecurringBillRow } = require('../utils/recurringBillMatcher');

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

function buildCanonicalLedgerReceiptProjection({
    sheetName,
    row,
    operationKey,
    status = 'committed',
    source = '',
    receipt = {},
    accountRows = [],
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

    if (String(domain || '').trim().toLowerCase() === 'accounts') {
        return {
            enabled: false,
            reason: 'canonical_accounts_opening_balances_unavailable',
            rows: []
        };
    }

    const db = new Database(dbPath, { readonly: true });
    try {
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
    buildCanonicalLedgerReceiptProjection,
    projectCommittedAppendToCanonicalShadow,
    safelyProjectCommittedAppendToCanonicalShadow,
    readCanonicalLedgerCanaryDomain
};
