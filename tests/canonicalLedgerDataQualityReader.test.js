const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    buildCanonicalLedgerReceiptProjection
} = require('../src/ledger/canonicalLedgerReceiptProjector');
const {
    CanonicalLedgerShadowStore
} = require('../src/ledger/canonicalLedgerShadowStore');
const {
    buildStatementReconciliationLinks
} = require('../src/ledger/statementReconciliationShadow');
const {
    readCanonicalDataQualitySource
} = require('../src/ledger/canonicalLedgerDataQualityReader');
const { queryFinancialPlanTool } = require('../src/agent/financialAgentTools');

function tempDbPath() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-quality-reader-'));
    return path.join(dir, 'canonical-ledger-shadow.sqlite');
}

const readEnv = {
    NODE_ENV: 'test',
    CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
    CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
    CANONICAL_LEDGER_CANARY_READ_ENABLED: 'true',
    CANONICAL_LEDGER_CANARY_READ_DOMAINS: 'transactions'
};

test('phase 4D canonical quality reader scopes events, lines and import decisions before query execution', async () => {
    const dbPath = tempDbPath();
    const userA = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Saídas',
        row: ['10/07/2026', 'Item A', 'Outros', '', 25, 'Pessoa A', 'PIX', 'Não', '', 'user-a'],
        operationKey: 'quality-reader-user-a',
        receipt: { updatedRange: 'Saídas!A10:K10' }
    });
    const userB = buildCanonicalLedgerReceiptProjection({
        sheetName: 'Saídas',
        row: ['10/07/2026', 'Item B', 'Alimentação', 'Mercado', 50, 'Pessoa B', 'PIX', 'Não', '', 'user-b'],
        operationKey: 'quality-reader-user-b',
        receipt: { updatedRange: 'Saídas!A11:K11' }
    });
    const links = [
        ...buildStatementReconciliationLinks({
            userId: 'user-a',
            filename: 'a.csv',
            confirmedAt: '2026-07-11T10:00:00.000Z',
            transactions: [{ type: 'Saídas', data: '10/07/2026', descricao: 'A', valor: 25, reconciliationStatus: 'uncertain' }]
        }),
        ...buildStatementReconciliationLinks({
            userId: 'user-b',
            filename: 'b.csv',
            confirmedAt: '2026-07-11T10:00:00.000Z',
            transactions: [{ type: 'Saídas', data: '10/07/2026', descricao: 'B', valor: 50, reconciliationStatus: 'matched' }]
        })
    ];
    const store = new CanonicalLedgerShadowStore({ dbPath, writesEnabled: true });
    store.persistProjection(userA);
    store.persistProjection(userB);
    store.persistStatementReconciliationLinks(links);
    store.close();

    const source = readCanonicalDataQualitySource({
        env: readEnv,
        dbPath,
        ownerPersonIds: ['user-a']
    });

    assert.strictEqual(source.enabled, true);
    assert.strictEqual(source.sourceHealth, 'partial');
    assert.strictEqual(source.events.length, 1);
    assert.strictEqual(source.events[0].owner_person_id, 'user-a');
    assert.ok(source.lines.every(item => item.event_id === source.events[0].event_id));
    assert.strictEqual(source.statementReconciliationLinks.length, 1);
    assert.strictEqual(source.statementReconciliationLinks[0].decision_status, 'uncertain');

    const toolResult = await queryFinancialPlanTool({
        plan: {
            kind: 'financial_query',
            domain: 'quality',
            operation: 'detail',
            filters: { period: { type: 'month', month: 6, year: 2026 } },
            groupBy: ['source'],
            timeBasis: 'transaction_date'
        },
        userIds: ['user-a'],
        personByUserId: { 'user-a': 'Pessoa A' },
        currentDate: '2026-07-13',
        env: readEnv,
        canonicalLedgerDbPath: dbPath
    });
    assert.strictEqual(toolResult.ok, true, JSON.stringify(toolResult));
    assert.strictEqual(toolResult.source, 'canonical');
    assert.strictEqual(toolResult.result.value.totalCount, 2);
    assert.doesNotMatch(JSON.stringify(toolResult.result), /user-a|user-b|owner_person_id|event_id|actor_hash|transaction_hash/i);

    const previousEnv = Object.fromEntries(Object.keys(readEnv).map(key => [key, process.env[key]]));
    Object.assign(process.env, readEnv);
    try {
        const runtime = await import('../src/agent/langGraphRuntime.mjs');
        const agentResult = await runtime.invokeFinancialAgentRuntime({
            message: 'Como está a qualidade dos meus dados este mês?',
            userIds: ['user-a'],
            personByUserId: { 'user-a': 'Pessoa A' },
            currentDate: '2026-07-13',
            canonicalLedgerDbPath: dbPath,
            mode: 'answer',
            financialQueryPlan: {
                kind: 'financial_query',
                domain: 'quality',
                operation: 'detail',
                filters: { period: { type: 'month', month: 6, year: 2026 } },
                groupBy: ['source'],
                timeBasis: 'transaction_date'
            }
        });
        assert.strictEqual(agentResult.action, 'answer', JSON.stringify(agentResult));
        assert.strictEqual(agentResult.verified.ok, true, JSON.stringify(agentResult));
        assert.match(agentResult.answer, /Qualidade dos dados/i);
        assert.doesNotMatch(agentResult.answer, /user-a|user-b|owner_person_id|event_id|R\$/i);
    } finally {
        for (const [key, value] of Object.entries(previousEnv)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});

test('phase 4D canonical quality reader fails closed when scope or canary authorization is absent', () => {
    const dbPath = tempDbPath();
    const noScope = readCanonicalDataQualitySource({ env: readEnv, dbPath, ownerPersonIds: [] });
    const disabled = readCanonicalDataQualitySource({ env: {}, dbPath, ownerPersonIds: ['user-a'] });

    assert.deepStrictEqual(noScope, { enabled: false, reason: 'missing_authorized_scope' });
    assert.deepStrictEqual(disabled, { enabled: false, reason: 'canonical_transactions_unavailable' });
});
