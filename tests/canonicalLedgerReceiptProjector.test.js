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
    assert.strictEqual(expense.projected.lines.find(line => line.line_type === 'cash').account_name, undefined);
    assert.strictEqual(income.projected.events[0].kind, 'income');
    assert.strictEqual(income.projected.events[0].amount_cents, 500000);
    assert.strictEqual(income.projected.lines.find(line => line.line_type === 'cash').account_name, undefined);
    assert.strictEqual(transfer.projected.events[0].kind, 'transfer');
    assert.strictEqual(transfer.projected.events[0].net_income_expense_impact, 0);
    assert.strictEqual(transfer.projected.events[0].free_budget_eligible, false);
    assert.deepStrictEqual(
        transfer.projected.lines.map(line => [line.account_name, line.direction]),
        [['Conta A', 'outflow'], ['Conta B', 'inflow']]
    );
});

test('canonical receipt projector links card purchase and payoff across idempotent receipt runs', () => {
    const dbPath = tempDbPath();
    const cardPurchase = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Lançamentos Cartão',
        row: ['04/07/2026', 'Mercado', 'Alimentação', 737.12, '1/1', 'Julho de 2026', 'nubank-thais', 'Nubank - Thais', '', 'user-a'],
        operationKey: 'invoice-item-op',
        receipt: { updatedRange: 'Lançamentos Cartão!A10:J10' }
    });
    const invoicePayment = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Transferências',
        row: ['04/07/2026', 'Pagamento de fatura Nubank - Thais - Julho de 2026', 737.12, 'Daniel - Nubank', 'Nubank - Thais', 'PIX', '', 'Pagamento de fatura', 'user-a'],
        operationKey: 'invoice-payment-op',
        receipt: { updatedRange: 'Transferências!A10:I10' }
    });

    assert.strictEqual(cardPurchase.projected.events[0].kind, 'card_purchase');
    assert.strictEqual(cardPurchase.projected.invoiceItems.length, 1);
    assert.strictEqual(invoicePayment.projected.events[0].kind, 'invoice_payment');
    assert.strictEqual(invoicePayment.projected.invoicePayments.length, 1);
    assert.strictEqual(
        cardPurchase.projected.invoices[0].invoice_id,
        invoicePayment.projected.invoices[0].invoice_id
    );

    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    store.persistProjection(cardPurchase);
    store.persistProjection(cardPurchase);
    store.persistProjection(invoicePayment);

    const invoices = store.listInvoiceAggregates({ reportType: 'canonical_ledger_receipt_shadow' });
    assert.deepStrictEqual(
        invoices.map(invoice => [
            invoice.card_key,
            invoice.competence_month,
            invoice.item_total_cents,
            invoice.payment_total_cents,
            invoice.status,
            invoice.item_count,
            invoice.payment_count
        ]),
        [['nubank thais', '2026-07', 73712, 73712, 'paid', 1, 1]]
    );
    store.close();
});
test('canonical receipt projector normalizes legacy card sheet names into stable card ids', () => {
    const projection = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Cartão Nubank - Thais',
        row: ['04/07/2026', 'Mercado', 'Alimentação', 10, '1/1', 'Julho de 2026', 'user-a'],
        operationKey: 'legacy-card-sheet-op',
        receipt: { updatedRange: 'Cartão Nubank - Thais!A10:G10' }
    });

    assert.strictEqual(projection.projected.events[0].kind, 'card_purchase');
    assert.strictEqual(
        projection.projected.lines.find(line => line.line_type === 'card_liability').account_id,
        'nubank-thais'
    );
    assert.strictEqual(projection.projected.invoices[0].card_key, 'nubank thais');
});
test('canonical receipt projector links explicit financial account columns without treating payment methods as accounts', () => {
    const financialAccountRows = [
        ['Nome da Conta', 'Tipo', 'Saldo Inicial', 'Data de Abertura', 'Status', 'Moeda', 'Responsável', 'user_id', 'Observações'],
        ['Daniel - Nubank', 'bank', '1000,00', '03/07/2026', 'active', 'BRL', 'Daniel', 'user-a', 'Principal'],
        ['Daniel - Carteira', 'cash', '50,00', '03/07/2026', 'active', 'BRL', 'Daniel', 'user-a', 'Dinheiro']
    ];
    const expense = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Saídas',
        row: ['04/07/2026', 'Mercado', 'Alimentação', 'Supermercado', 20, 'Daniel', 'PIX', 'Não', '', 'user-a', 'Daniel - Nubank'],
        operationKey: 'explicit-expense-account',
        receipt: { updatedRange: 'Saídas!A10:K10' },
        financialAccountRows
    });
    const income = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Entradas',
        row: ['05/07/2026', 'Reembolso', 'Outros', 30, 'Daniel', 'PIX', 'Não', '', 'user-a', 'Daniel - Carteira'],
        operationKey: 'explicit-income-account',
        receipt: { updatedRange: 'Entradas!A8:J8' },
        financialAccountRows
    });

    assert.strictEqual(
        expense.projected.lines.find(line => line.line_type === 'cash').account_name,
        'Daniel - Nubank'
    );
    assert.strictEqual(
        income.projected.lines.find(line => line.line_type === 'cash').account_name,
        'Daniel - Carteira'
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

test('canonical canary accounts read computes balances only with explicit opening balances', () => {
    const dbPath = tempDbPath();
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    const projected = {
        accounts: [
            {
                account_id: 'acct-a',
                household_id: 'household-test',
                owner_person_id: 'user-a',
                account_type: 'bank',
                name: 'Conta A',
                currency: 'BRL',
                opening_balance_cents: 100000,
                opened_on: '2026-01-01',
                status: 'active'
            },
            {
                account_id: 'acct-b',
                household_id: 'household-test',
                owner_person_id: 'user-a',
                account_type: 'wallet',
                name: 'Conta B',
                currency: 'BRL',
                opening_balance_cents: 0,
                opened_on: '2026-01-01',
                status: 'active'
            }
        ],
        events: [{
            event_id: 'transfer-event-1',
            household_id: 'household-test',
            owner_person_id: 'user-a',
            actor_person_id: 'user-a',
            kind: 'transfer',
            status: 'settled',
            description: 'Transferencia entre contas',
            amount_cents: 25000,
            currency: 'BRL',
            occurred_on: '2026-07-02',
            effective_on: '2026-07-02',
            source_type: 'sheet.transferencias',
            source_id_hash: 'source-hash',
            source_row_hash: 'row-hash',
            idempotency_key: 'transfer-op',
            free_budget_eligible: false,
            net_income_expense_impact: 0,
            created_at: '2026-07-02T12:00:00.000Z',
            updated_at: '2026-07-02T12:00:00.000Z'
        }],
        lines: [
            {
                line_id: 'line-a',
                event_id: 'transfer-event-1',
                line_type: 'cash',
                account_id: 'acct-a',
                direction: 'outflow',
                amount_cents: 25000,
                currency: 'BRL',
                metadata_hash: 'meta-a'
            },
            {
                line_id: 'line-b',
                event_id: 'transfer-event-1',
                line_type: 'clearing',
                account_id: 'acct-b',
                direction: 'inflow',
                amount_cents: 25000,
                currency: 'BRL',
                metadata_hash: 'meta-b'
            }
        ],
        schedules: [],
        reconciliationLinks: []
    };
    store.persistProjection({
        runId: 'ACCOUNTS_CANARY_BALANCE_TEST',
        projected,
        publicProjection: [],
        report: {
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: false
        }
    });
    store.close();

    const readEnv = {
        NODE_ENV: 'test',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
        CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'accounts'
    };
    const accounts = readCanonicalLedgerCanaryDomain({
        env: readEnv,
        dbPath,
        domain: 'accounts',
        ownerPersonIds: ['user-a'],
        personByUserId: { 'user-a': 'Daniel' }
    });

    assert.strictEqual(accounts.enabled, true);
    assert.strictEqual(accounts.domain, 'accounts');
    assert.deepStrictEqual(
        accounts.rows.map(row => [row.name, row.opening_balance_cents, row.balance_cents]),
        [['Conta A', 100000, 75000], ['Conta B', 0, 25000]]
    );
    assert.doesNotMatch(JSON.stringify(accounts), /user-a|acct-a|acct-b|source_row_hash|idempotency_key/i);
});


test('canonical receipt projector builds accounts from explicit financial account rows', () => {
    const projection = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Transferências',
        row: ['02/07/2026', 'Entre contas', 250, 'Conta Corrente', 'Carteira', 'PIX', '', 'Conferida', 'user-a'],
        operationKey: 'financial-account-source-op',
        receipt: { updatedRange: 'Transferências!A9:I9' },
        financialAccountRows: [
            ['Nome da Conta', 'Tipo', 'Saldo Inicial', 'Data de Abertura', 'Status', 'Moeda', 'Responsável', 'user_id', 'Observações'],
            ['Conta Corrente', 'bank', '1.000,00', '01/01/2026', 'active', 'BRL', 'Daniel', 'user-a', 'Conta principal'],
            ['Carteira', 'cash', '50,00', '01/01/2026', 'active', 'BRL', 'Daniel', 'user-a', 'Dinheiro'],
            ['Conta sem saldo', 'bank', '', '01/01/2026', 'active', 'BRL', 'Daniel', 'user-a', 'Ignorar sem saldo explícito']
        ]
    });

    assert.deepStrictEqual(
        projection.projected.accounts.map(account => [
            account.name,
            account.account_type,
            account.opening_balance_cents,
            account.owner_person_id
        ]),
        [
            ['Carteira', 'cash', 5000, 'user-a'],
            ['Conta Corrente', 'bank', 100000, 'user-a']
        ]
    );
    assert.deepStrictEqual(
        projection.projected.lines.map(line => [line.account_name, line.account_id, line.direction]),
        [
            ['Conta Corrente', projection.projected.accounts.find(account => account.name === 'Conta Corrente').account_id, 'outflow'],
            ['Carteira', projection.projected.accounts.find(account => account.name === 'Carteira').account_id, 'inflow']
        ]
    );

    const dbPath = tempDbPath();
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    store.persistProjection(projection);
    store.close();

    const accounts = readCanonicalLedgerCanaryDomain({
        env: {
            NODE_ENV: 'test',
            CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
            CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
            CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
            CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'accounts'
        },
        dbPath,
        domain: 'accounts',
        ownerPersonIds: ['user-a'],
        personByUserId: { 'user-a': 'Daniel' }
    });

    assert.strictEqual(accounts.enabled, true);
    assert.deepStrictEqual(
        accounts.rows.map(row => [row.name, row.opening_balance_cents, row.balance_cents]),
        [['Carteira', 5000, 30000], ['Conta Corrente', 100000, 75000]]
    );
    assert.doesNotMatch(JSON.stringify(accounts), /user-a|source_row_hash|idempotency_key/i);
});
test('canonical canary accounts read excludes pending account movements from current balance', () => {
    const dbPath = tempDbPath();
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    const projected = {
        accounts: [
            {
                account_id: 'acct-status-a',
                household_id: 'household-test',
                owner_person_id: 'user-a',
                account_type: 'bank',
                name: 'Conta Status A',
                currency: 'BRL',
                opening_balance_cents: 100000,
                opened_on: '2026-01-01',
                status: 'active'
            },
            {
                account_id: 'acct-status-b',
                household_id: 'household-test',
                owner_person_id: 'user-a',
                account_type: 'bank',
                name: 'Conta Status B',
                currency: 'BRL',
                opening_balance_cents: 50000,
                opened_on: '2026-01-01',
                status: 'active'
            }
        ],
        events: [
            {
                event_id: 'pending-transfer-event',
                household_id: 'household-test',
                owner_person_id: 'user-a',
                actor_person_id: 'user-a',
                kind: 'transfer',
                status: 'pending',
                description: 'Transferencia pendente',
                amount_cents: 20000,
                currency: 'BRL',
                occurred_on: '2026-07-03',
                effective_on: '2026-07-05',
                source_type: 'sheet.transferencias',
                source_id_hash: 'source-pending',
                source_row_hash: 'row-pending',
                idempotency_key: 'pending-op',
                free_budget_eligible: false,
                net_income_expense_impact: 0,
                created_at: '2026-07-03T12:00:00.000Z',
                updated_at: '2026-07-03T12:00:00.000Z'
            },
            {
                event_id: 'settled-expense-event',
                household_id: 'household-test',
                owner_person_id: 'user-a',
                actor_person_id: 'user-a',
                kind: 'expense',
                status: 'settled',
                description: 'Despesa concluida',
                amount_cents: 7000,
                currency: 'BRL',
                occurred_on: '2026-07-03',
                effective_on: '2026-07-03',
                source_type: 'sheet.saidas',
                source_id_hash: 'source-settled',
                source_row_hash: 'row-settled',
                idempotency_key: 'settled-op',
                free_budget_eligible: true,
                net_income_expense_impact: 7000,
                created_at: '2026-07-03T12:01:00.000Z',
                updated_at: '2026-07-03T12:01:00.000Z'
            }
        ],
        lines: [
            {
                line_id: 'pending-a-out',
                event_id: 'pending-transfer-event',
                line_type: 'cash',
                account_id: 'acct-status-a',
                direction: 'outflow',
                amount_cents: 20000,
                currency: 'BRL',
                metadata_hash: 'meta-pending-a'
            },
            {
                line_id: 'pending-b-in',
                event_id: 'pending-transfer-event',
                line_type: 'clearing',
                account_id: 'acct-status-b',
                direction: 'inflow',
                amount_cents: 20000,
                currency: 'BRL',
                metadata_hash: 'meta-pending-b'
            },
            {
                line_id: 'settled-a-out',
                event_id: 'settled-expense-event',
                line_type: 'cash',
                account_id: 'acct-status-a',
                direction: 'outflow',
                amount_cents: 7000,
                currency: 'BRL',
                metadata_hash: 'meta-settled-a'
            }
        ],
        schedules: [],
        reconciliationLinks: []
    };
    store.persistProjection({
        runId: 'ACCOUNTS_STATUS_BALANCE_TEST',
        projected,
        publicProjection: [],
        report: {
            report_type: 'canonical_ledger_receipt_shadow',
            schema_version: 'canonical-ledger-v1',
            synthetic_fixture_only: false
        }
    });
    store.close();

    const accounts = readCanonicalLedgerCanaryDomain({
        env: {
            NODE_ENV: 'test',
            CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
            CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
            CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
            CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'accounts'
        },
        dbPath,
        domain: 'accounts',
        ownerPersonIds: ['user-a'],
        personByUserId: { 'user-a': 'Daniel' }
    });

    assert.strictEqual(accounts.enabled, true);
    assert.deepStrictEqual(
        accounts.rows.map(row => [row.name, row.opening_balance_cents, row.balance_cents]),
        [['Conta Status A', 100000, 93000], ['Conta Status B', 50000, 50000]]
    );
    assert.doesNotMatch(JSON.stringify(accounts), /user-a|acct-status|source_row_hash|idempotency_key/i);
});


test('canonical canary accounts read fails closed when the account schema is unavailable', () => {
    const dbPath = tempDbPath();
    const db = require('better-sqlite3')(dbPath);
    db.exec([
        'CREATE TABLE canonical_ledger_projection_runs (',
        'run_id TEXT PRIMARY KEY,',
        'report_type TEXT NOT NULL,',
        'created_at TEXT NOT NULL',
        ');'
    ].join('\n'));
    db.close();

    const accounts = readCanonicalLedgerCanaryDomain({
        env: {
            NODE_ENV: 'test',
            CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
            CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
            CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
            CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'accounts'
        },
        dbPath,
        domain: 'accounts'
    });

    assert.deepStrictEqual(accounts, {
        enabled: false,
        reason: 'canonical_accounts_opening_balances_unavailable',
        rows: []
    });
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
