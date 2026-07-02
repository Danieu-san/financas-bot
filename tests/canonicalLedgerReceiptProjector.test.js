const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    buildCanonicalLedgerReceiptProjection,
    projectCommittedAppendToCanonicalShadow,
    safelyProjectCommittedAppendToCanonicalShadow,
    readCanonicalLedgerCanaryDomain
} = require('../src/ledger/canonicalLedgerReceiptProjector');
const {
    CanonicalLedgerShadowStore
} = require('../src/ledger/canonicalLedgerShadowStore');

function tempDbPath() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-ledger-receipt-'));
    return path.join(dir, 'canonical-ledger-shadow.sqlite');
}

test('canonical receipt projector maps committed expense, income and transfer rows', () => {
    const expense = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Saídas',
        row: ['25/06/2026', 'Mercado', 'Alimentação', 'Supermercado', 123.45, 'Daniel', 'PIX', 'Não', '', 'user-a'],
        operationKey: 'expense-op',
        receipt: { updatedRange: 'Saídas!A10:J10' }
    });
    const income = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Entradas',
        row: ['25/06/2026', 'Salário', 'Salário', 5000, 'Daniel', 'Conta Corrente', 'Sim', '', 'user-a'],
        operationKey: 'income-op',
        receipt: { updatedRange: 'Entradas!A8:I8' }
    });
    const transfer = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Transferências',
        row: ['25/06/2026', 'Entre contas', 300, 'Conta A', 'Conta B', 'PIX', '', 'Conferida', 'user-a'],
        operationKey: 'transfer-op',
        receipt: { updatedRange: 'Transferências!A4:I4' }
    });

    assert.strictEqual(expense.projected.events[0].kind, 'expense');
    assert.strictEqual(expense.projected.events[0].amount_cents, 12345);
    assert.strictEqual(expense.projected.events[0].idempotency_key, 'expense-op');
    assert.strictEqual(expense.projected.lines.find(line => line.line_type === 'cash').account_name, 'PIX');
    assert.strictEqual(income.projected.events[0].kind, 'income');
    assert.strictEqual(income.projected.events[0].amount_cents, 500000);
    assert.strictEqual(income.projected.lines.find(line => line.line_type === 'cash').account_name, 'Conta Corrente');
    assert.strictEqual(transfer.projected.events[0].kind, 'transfer');
    assert.strictEqual(transfer.projected.events[0].net_income_expense_impact, 0);
    assert.strictEqual(transfer.projected.events[0].free_budget_eligible, false);
    assert.deepStrictEqual(
        transfer.projected.lines.map(line => [line.account_name, line.direction]),
        [['Conta A', 'outflow'], ['Conta B', 'inflow']]
    );
});


test('canonical receipt projector timestamps real receipts with the injected projection clock', () => {
    const timestamp = '2026-07-02T11:42:39.570Z';
    const projection = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Saídas',
        row: ['02/07/2026', 'Mercado', 'Alimentação', 'SUPERMERCADO', 12.33, 'Daniel', 'PIX', 'Não', '', 'user-a'],
        operationKey: 'timestamped-expense-op',
        receipt: { updatedRange: 'Saídas!A21:J21' },
        committedAt: timestamp,
        now: () => new Date('2026-07-03T00:00:00.000Z')
    });

    assert.strictEqual(projection.projected.events[0].created_at, timestamp);
    assert.strictEqual(projection.projected.events[0].updated_at, timestamp);
});
test('canonical receipt projector excludes registered phone bill payments from free budget', () => {
    const projection = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Saídas',
        row: ['25/06/2026', 'Claro telefone', 'Moradia', 'INTERNET / TELEFONE', 120, 'Daniel', 'PIX', 'SIM', '', 'user-a'],
        operationKey: 'phone-bill-payment-op',
        receipt: { updatedRange: 'Saídas!A12:J12' },
        accountRows: [
            ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id', 'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado', 'Regra Ativa'],
            ['CLARO', '25', '', 'user-a', 'Claro telefone', 'Moradia', 'INTERNET / TELEFONE', '120,00', 'SIM']
        ]
    });

    const event = projection.projected.events[0];
    assert.strictEqual(event.kind, 'bill_payment');
    assert.strictEqual(event.free_budget_eligible, false);
    assert.strictEqual(event.net_income_expense_impact, 0);
    assert.strictEqual(projection.publicProjection[0].free_budget_eligible, false);
});
test('canonical receipt projector keeps non-recurring expenses in free budget even when category matches a registered bill', () => {
    const projection = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Saídas',
        row: ['01/07/2026', 'mercado TESTE_APAGAR_LEDGER_CMD', 'Alimentação', 'SUPERMERCADO', 18.03, 'Daniel', 'PIX', 'Não', 'Gasto interpretado pelo command planner.', 'user-a'],
        operationKey: 'ordinary-market-expense-op',
        receipt: { updatedRange: 'Saídas!A20:J20' },
        accountRows: [
            ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id', 'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado', 'Regra Ativa'],
            ['MERCADO', '5', '', 'user-a', 'Mercado recorrente', 'Alimentação', 'SUPERMERCADO', '18,03', 'SIM']
        ]
    });

    const event = projection.projected.events[0];
    assert.strictEqual(event.kind, 'expense');
    assert.strictEqual(event.free_budget_eligible, true);
    assert.strictEqual(event.net_income_expense_impact, 1803);
    assert.strictEqual(projection.publicProjection[0].kind, 'expense');
    assert.strictEqual(projection.publicProjection[0].free_budget_eligible, true);
});
test('canonical receipt projector preserves pending transfer status', () => {
    const projection = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Transferências',
        row: ['25/06/2026', 'Entre contas', 300, 'Conta A', 'Conta B', 'PIX', '', 'Pendente', 'user-a'],
        operationKey: 'pending-transfer-op',
        receipt: { updatedRange: 'Transferências!A5:I5' }
    });

    assert.strictEqual(projection.projected.events[0].status, 'pending');
});

test('canonical receipt projector rejects unsupported, uncommitted or identity-less writes', () => {
    assert.strictEqual(buildCanonicalLedgerReceiptProjection({
        sheetName: 'Metas',
        row: [],
        operationKey: 'op',
        receipt: {}
    }), null);
    assert.strictEqual(buildCanonicalLedgerReceiptProjection({
        sheetName: 'Saídas',
        row: ['25/06/2026'],
        operationKey: '',
        receipt: {}
    }), null);
    assert.strictEqual(buildCanonicalLedgerReceiptProjection({
        sheetName: 'Saídas',
        row: ['25/06/2026'],
        operationKey: 'op',
        status: 'uncertain',
        receipt: {}
    }), null);
    assert.strictEqual(buildCanonicalLedgerReceiptProjection({
        sheetName: 'Saídas',
        row: ['25/06/2026'],
        operationKey: 'op',
        status: 'committed',
        source: 'statement_import',
        receipt: {}
    }), null);
});

test('canonical receipt shadow persistence is disabled by default', () => {
    const result = projectCommittedAppendToCanonicalShadow({
        env: {},
        sheetName: 'Saídas',
        row: ['25/06/2026', 'Mercado', 'Alimentação', '', 10, 'Daniel', 'PIX', 'Não', '', 'user-a'],
        operationKey: 'disabled-op',
        receipt: { updatedRange: 'Saídas!A2:J2' }
    });

    assert.deepStrictEqual(result, {
        projected: false,
        reason: 'shadow_writes_disabled'
    });
});

test('canonical receipt shadow persistence is idempotent by operation key', () => {
    const dbPath = tempDbPath();
    const env = {
        NODE_ENV: 'test',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true'
    };
    const input = {
        env,
        dbPath,
        sheetName: 'Saídas',
        row: ['25/06/2026', 'Mercado', 'Alimentação', '', 10, 'Daniel', 'PIX', 'Não', '', 'user-a'],
        operationKey: 'idempotent-op',
        receipt: { updatedRange: 'Saídas!A2:J2' }
    };

    const first = projectCommittedAppendToCanonicalShadow(input);
    const second = projectCommittedAppendToCanonicalShadow(input);

    assert.strictEqual(first.projected, true);
    assert.strictEqual(second.projected, true);
    assert.strictEqual(first.runId, second.runId);

    const store = new CanonicalLedgerShadowStore({ dbPath });
    store.applyMigrations();
    assert.deepStrictEqual(store.countRows(first.runId), {
        events: 1,
        lines: 2,
        schedules: 0,
        reconciliationLinks: 0,
        publicProjectionRows: 1,
        projectionRuns: 1,
        auditRows: 1
    });
    store.close();
});

test('canonical receipt shadow failures never fail the committed legacy write', () => {
    const warnings = [];
    const result = safelyProjectCommittedAppendToCanonicalShadow({
        projector() {
            throw new Error('shadow database unavailable');
        },
        onWarning(warning) {
            warnings.push(warning);
        },
        sheetName: 'Saídas',
        row: ['25/06/2026', 'Mercado', 'Alimentação', '', 10, 'Daniel', 'PIX', 'Não', '', 'user-a'],
        operationKey: 'safe-failure-op',
        status: 'committed',
        receipt: { updatedRange: 'Saídas!A2:J2' }
    });

    assert.deepStrictEqual(result, {
        projected: false,
        reason: 'projection_failed'
    });
    assert.deepStrictEqual(warnings, [{
        code: 'canonical_ledger_shadow_projection_failed',
        sheetName: 'Saídas',
        error: 'shadow database unavailable'
    }]);
});

test('canonical canary reads expose transactions and transfers only when domain is allowed', () => {
    const dbPath = tempDbPath();
    const writeEnv = {
        NODE_ENV: 'test',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true'
    };
    projectCommittedAppendToCanonicalShadow({
        env: writeEnv,
        dbPath,
        sheetName: 'Entradas',
        row: ['25/06/2026', 'Salário', 'Salário', 1000, 'Daniel', 'Conta A', 'Não', '', 'user-a'],
        operationKey: 'canary-income-op',
        receipt: { updatedRange: 'Entradas!A2:I2' }
    });
    projectCommittedAppendToCanonicalShadow({
        env: writeEnv,
        dbPath,
        sheetName: 'Transferências',
        row: ['25/06/2026', 'Entre contas', 250, 'Conta A', 'Conta B', 'PIX', '', 'Conferida', 'user-a'],
        operationKey: 'canary-transfer-op',
        receipt: { updatedRange: 'Transferências!A2:I2' }
    });

    const readEnv = {
        NODE_ENV: 'test',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transactions,accounts,transfers'
    };
    const transactions = readCanonicalLedgerCanaryDomain({ env: readEnv, dbPath, domain: 'transactions' });
    const accounts = readCanonicalLedgerCanaryDomain({ env: readEnv, dbPath, domain: 'accounts' });
    const transfers = readCanonicalLedgerCanaryDomain({ env: readEnv, dbPath, domain: 'transfers' });
    const blocked = readCanonicalLedgerCanaryDomain({
        env: { ...readEnv, CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transactions' },
        dbPath,
        domain: 'accounts'
    });

    assert.strictEqual(transactions.enabled, true);
    assert.strictEqual(transactions.rows.length, 2);
    assert.deepStrictEqual(accounts, {
        enabled: false,
        reason: 'canonical_accounts_opening_balances_unavailable',
        rows: []
    });
    assert.strictEqual(transfers.rows.length, 1);
    assert.strictEqual(transfers.rows[0].kind, 'transfer');
    assert.deepStrictEqual(blocked, {
        enabled: false,
        reason: 'canary_domain_disabled',
        rows: []
    });
    assert.doesNotMatch(JSON.stringify({ transactions, accounts, transfers }), /user-a|operationKey|source_row_hash/i);
});
