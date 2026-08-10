const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const {
    buildReviewedInvestmentIncomeSaveProposal
} = require('../src/openFinance/openFinanceReviewedInvestmentIncomeSaveProposal');
const {
    revalidateOpenFinanceSaveProposal,
    writeOpenFinanceSaveProposal
} = require('../src/openFinance/openFinanceSaveProposalFinalization');
const googleService = require('../src/services/google');
const oauthTokenStore = require('../src/services/oauthTokenStore');
const {
    FinancialWriteLedger
} = require('../src/reliability/financialWriteLedger');
const {
    buildCanonicalLedgerReceiptProjection
} = require('../src/ledger/canonicalLedgerReceiptProjector');
const {
    OpenFinanceShadowPreviewStore
} = require('../src/openFinance/openFinanceShadowPreviewStore');
const {
    OpenFinanceSaveProposalReviewStore
} = require('../src/openFinance/openFinanceSaveProposalReviewStore');

const secret = 'investment-income-proposal-secret-1234567890';

function hmac(label) {
    return crypto.createHmac('sha256', secret).update(label).digest('hex').slice(0, 32);
}

function source(overrides = {}) {
    return {
        id: 'investment-income-1',
        account_id: 'daniel-bank',
        amount_cents: 325,
        description: 'Rendimento Caixinha',
        date: '2026-08-10T12:00:00.000Z',
        status: 'POSTED',
        operation_type: 'RENDIMENTO_APLIC_FINANCEIRA',
        ...overrides
    };
}

function decidedReview(overrides = {}) {
    return {
        review_ref: 'a'.repeat(32),
        observation_ref: hmac('observation:item-daniel:daniel-bank:investment-income-1'),
        alias_ref: hmac('open-finance-revocation-lineage:daniel_nubank'),
        generation: 3,
        principal: 'daniel',
        classification: 'reserve_candidate',
        review_kind: 'reserve',
        review_status: 'provider_semantic_confirmation_required',
        review_state: 'decided',
        decision: 'investment_income',
        provider_operation_type: 'RENDIMENTO_APLIC_FINANCEIRA',
        source: source(),
        expires_at: '2099-08-11T12:00:00.000Z',
        ...overrides
    };
}

function proposal(overrides = {}) {
    const review = decidedReview(overrides.review);
    return buildReviewedInvestmentIncomeSaveProposal({
        review,
        currentSource: {
            alias: 'daniel_nubank',
            alias_ref: review.alias_ref,
            generation: 3,
            account_type: 'BANK',
            transaction: source(overrides.source)
        },
        reconciliationDecision: {
            status: 'new',
            transaction_ref: 'b'.repeat(32),
            ...overrides.reconciliation
        },
        secret
    });
}

test('38.6 builds only unchanged positive investment income, never reserve principal', () => {
    const built = proposal();
    assert.equal(built.classification, 'investment_income');
    assert.equal(built.source_classification, 'reserve_candidate');
    assert.equal(built.provider_state, 'POSTED');
    assert.equal(built.investment_semantic, 'income_only');
    assert.equal(built.financial_writes, 0);
    assert.match(built.operation_key, /^[a-f0-9]{48}$/);

    assert.throws(() => proposal({ review: { decision: 'reserve_redemption' } }),
        /review_not_approved/);
    assert.throws(() => proposal({ source: { amount_cents: -325 } }), /source_changed/);
    assert.throws(() => proposal({ source: {
        operation_type: 'RESGATE_APLIC_FINANCEIRA'
    } }), /source_changed/);
    assert.throws(() => proposal({ reconciliation: { status: 'matched' } }), /not_new/);
});

test('38.6 stores one durable proposal and restricts review to owner investment gain', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'of-investment-income-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const actorWhatsappId = '5511999999999@c.us';
    const preview = new OpenFinanceShadowPreviewStore({
        databasePath, secret, authorizedWhatsAppIds: [actorWhatsappId]
    });
    const reviewStore = new OpenFinanceSaveProposalReviewStore({
        databasePath, secret, authorizedWhatsAppIds: [actorWhatsappId]
    });
    try {
        const built = proposal();
        const first = preview.ingestReviewedSemanticSaveProposal({ proposal: built });
        const replay = preview.ingestReviewedSemanticSaveProposal({ proposal: built });
        assert.equal(first.inserted, 1);
        assert.equal(replay.replayed, 1);
        const prepared = reviewStore.prepareReview({
            proposalRef: built.proposal_ref,
            proposal: built,
            actorWhatsappId,
            catalog: {
                people: [
                    { id: 'user-daniel', label: 'Daniel' },
                    { id: 'user-thais', label: 'Thais' }
                ],
                incomeCategories: [
                    { id: 'income:investimentos', label: 'Investimentos',
                        category: 'Investimentos', subcategory: '' },
                    { id: 'income:salario', label: 'Salario',
                        category: 'Salario', subcategory: '' }
                ],
                receiptMethods: [
                    { id: 'receipt:checking', label: 'Conta Corrente',
                        value: 'Conta Corrente' }
                ],
                financialAccounts: [
                    { id: 'account:daniel', label: 'Nubank Daniel',
                        accountName: 'Nubank Daniel', ownerUserId: 'user-daniel',
                        accountType: 'bank' },
                    { id: 'account:thais', label: 'Nubank Thais',
                        accountName: 'Nubank Thais', ownerUserId: 'user-thais',
                        accountType: 'bank' }
                ],
                categories: [], paymentMethods: [], cards: []
            }
        });
        assert.equal(prepared.payload.catalog.people.length, 1);
        assert.equal(prepared.payload.catalog.people[0].id, 'user-daniel');
        assert.equal(prepared.payload.catalog.categories.length, 1);
        assert.equal(prepared.payload.catalog.categories[0].category, 'Investimentos');
        assert.equal(prepared.payload.catalog.financialAccounts.length, 1);
        assert.equal(prepared.payload.catalog.financialAccounts[0].ownerUserId,
            'user-daniel');
    } finally {
        reviewStore.close();
        preview.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('38.6 revalidates one investment gain into Entradas and canonical income', () => {
    const built = proposal();
    const draft = {
        person: { id: 'user-daniel', label: 'Daniel' },
        category: {
            id: 'income-category:investimentos', label: 'Investimentos',
            category: 'Investimentos', subcategory: ''
        },
        paymentMethod: {
            id: 'receipt:checking', label: 'Conta Corrente', value: 'Conta Corrente'
        },
        financialAccount: {
            id: 'account:user-daniel:nubank', label: 'Nubank Daniel',
            accountName: 'Nubank Daniel', ownerUserId: 'user-daniel', accountType: 'bank'
        },
        card: null
    };
    const catalog = {
        people: [draft.person], incomeCategories: [draft.category],
        receiptMethods: [draft.paymentMethod], financialAccounts: [draft.financialAccount],
        categories: [], paymentMethods: [], cards: []
    };
    const result = revalidateOpenFinanceSaveProposal({
        proposal: built,
        review: { proposal_ref: built.proposal_ref, state: 'ready', payload: {
            classification: 'investment_income', draft
        } },
        item: {
            id: 'item-daniel',
            alias_code: built.alias, generation: built.generation,
            accounts: [{ id: 'daniel-bank', type: 'BANK' }],
            transactions: [source()], bills: [], investments: []
        },
        internalSource: { available: true, transactions: [], scope_coverage: {} },
        catalog,
        semanticReview: decidedReview(),
        secret
    });
    assert.equal(result.writePlan.operation, 'income.create');
    assert.equal(result.writePlan.sheetName, 'Entradas');
    assert.equal(result.writePlan.row[2], 'Investimentos');
    assert.equal(result.writePlan.canonicalRelation.type, 'investment_income');

    const baseArgs = {
        proposal: built,
        review: { proposal_ref: built.proposal_ref, state: 'ready', payload: {
            classification: 'investment_income', draft
        } },
        internalSource: { available: true, transactions: [], scope_coverage: {} },
        catalog,
        secret
    };
    assert.throws(() => revalidateOpenFinanceSaveProposal({
        ...baseArgs,
        item: {
            id: 'item-daniel', alias_code: built.alias, generation: built.generation,
            accounts: [{ id: 'daniel-bank', type: 'BANK' }],
            transactions: [source({ operation_type: 'RESGATE_APLIC_FINANCEIRA' })],
            bills: [], investments: []
        },
        semanticReview: decidedReview()
    }), /source_changed/);
    assert.throws(() => revalidateOpenFinanceSaveProposal({
        ...baseArgs,
        item: {
            id: 'item-daniel', alias_code: built.alias, generation: built.generation,
            accounts: [{ id: 'daniel-bank', type: 'BANK' }],
            transactions: [source()], bills: [], investments: []
        },
        semanticReview: decidedReview({ decision: 'reserve_redemption' })
    }), /investment_income_review_changed/);
    assert.throws(() => revalidateOpenFinanceSaveProposal({
        ...baseArgs,
        review: { proposal_ref: built.proposal_ref, state: 'ready', payload: {
            classification: 'investment_income',
            draft: {
                ...draft,
                category: {
                    id: 'new-category:juros', label: 'Juros', category: 'Juros',
                    subcategory: '', origin: 'user_created'
                }
            }
        } },
        item: {
            id: 'item-daniel', alias_code: built.alias, generation: built.generation,
            accounts: [{ id: 'daniel-bank', type: 'BANK' }],
            transactions: [source()], bills: [], investments: []
        },
        semanticReview: decidedReview()
    }), /investment_income_category_forbidden/);

    const projected = buildCanonicalLedgerReceiptProjection({
        operationKey: result.operationKey,
        sheetName: result.writePlan.sheetName,
        row: result.writePlan.row,
        userId: result.writePlan.userId,
        financialAccountRows: [[
            'Nome', 'Tipo', 'Saldo', 'Moeda', 'Status', 'Obs', 'Titular', 'user_id'
        ], ['Nubank Daniel', 'Conta Corrente', 0, 'BRL', 'Ativo', '',
            'Daniel', 'user-daniel']],
        canonicalRelation: result.writePlan.canonicalRelation
    });
    assert.equal(projected.projected.events[0].kind, 'income');
    assert.equal(projected.projected.events[0].free_budget_eligible, true);
});

test('38.6 product writer appends once and invokes the real canonical projector', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'of-investment-writer-'));
    const previous = Object.fromEntries([
        'OAUTH_TOKEN_DB_PATH', 'OAUTH_TOKEN_ENCRYPTION_KEY',
        'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'NODE_ENV',
        'CANONICAL_LEDGER_PROJECTION_MODE', 'CANONICAL_LEDGER_SHADOW_WRITE_ENABLED',
        'CANONICAL_LEDGER_SHADOW_DB_PATH'
    ].map(name => [name, process.env[name]]));
    const shadowDb = path.join(directory, 'canonical.sqlite');
    const writeLedger = new FinancialWriteLedger({
        dbPath: path.join(directory, 'writes.sqlite')
    });
    const appendCalls = [];
    Object.assign(process.env, {
        OAUTH_TOKEN_DB_PATH: path.join(directory, 'oauth.sqlite'),
        OAUTH_TOKEN_ENCRYPTION_KEY: '8'.repeat(64),
        GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret',
        NODE_ENV: 'test',
        CANONICAL_LEDGER_PROJECTION_MODE: 'shadow',
        CANONICAL_LEDGER_SHADOW_WRITE_ENABLED: 'true',
        CANONICAL_LEDGER_SHADOW_DB_PATH: shadowDb
    });
    oauthTokenStore.__test__.closeDatabaseForTests();
    const fakeUserSheets = {
        spreadsheets: {
            values: {
                append: async ({ spreadsheetId, range, resource }) => {
                    appendCalls.push({ spreadsheetId, range, row: resource.values[0] });
                    return { data: { updates: { updatedRange: 'Entradas!A2:J2' } } };
                },
                get: async ({ range }) => ({ data: { values:
                    range.includes('Contas Financeiras') ? [[
                        'Nome', 'Tipo', 'Saldo', 'Abertura', 'Status', 'Moeda',
                        'Titular', 'user_id', 'Obs'
                    ], [
                        'Nubank Daniel', 'bank', 0, '2025-01-01', 'ATIVA', 'BRL',
                        'Daniel', 'user-daniel', ''
                    ]] : [] } })
            },
            batchUpdate: async () => ({})
        }
    };
    try {
        oauthTokenStore.saveOAuthConnection('user-daniel', {
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            tokens: { access_token: 'test-access', refresh_token: 'test-refresh' },
            spreadsheetId: 'personal-family-sheet'
        });
        googleService.__test__.setUserSheetsClientFactoryForTest(() => fakeUserSheets);
        const validated = revalidateOpenFinanceSaveProposal({
            proposal: proposal(),
            review: { proposal_ref: proposal().proposal_ref, state: 'ready', payload: {
                classification: 'investment_income',
                draft: {
                    person: { id: 'user-daniel', label: 'Daniel' },
                    category: { id: 'income:investimentos', label: 'Investimentos',
                        category: 'Investimentos', subcategory: '' },
                    paymentMethod: { id: 'receipt:checking', label: 'Conta Corrente',
                        value: 'Conta Corrente' },
                    financialAccount: { id: 'account:daniel', label: 'Nubank Daniel',
                        accountName: 'Nubank Daniel', ownerUserId: 'user-daniel',
                        accountType: 'bank' },
                    card: null
                }
            } },
            item: {
                id: 'item-daniel', alias_code: 'daniel_nubank', generation: 3,
                accounts: [{ id: 'daniel-bank', type: 'BANK' }],
                transactions: [source()], bills: [], investments: []
            },
            internalSource: { available: true, transactions: [], scope_coverage: {} },
            catalog: {
                people: [{ id: 'user-daniel', label: 'Daniel' }],
                incomeCategories: [{ id: 'income:investimentos', label: 'Investimentos',
                    category: 'Investimentos', subcategory: '' }],
                receiptMethods: [{ id: 'receipt:checking', label: 'Conta Corrente',
                    value: 'Conta Corrente' }],
                financialAccounts: [{ id: 'account:daniel', label: 'Nubank Daniel',
                    accountName: 'Nubank Daniel', ownerUserId: 'user-daniel',
                    accountType: 'bank' }],
                categories: [], paymentMethods: [], cards: []
            },
            semanticReview: decidedReview(),
            secret
        });
        const receipt = await googleService.runWithUserSheetContext({
            userId: 'user-daniel', writeLedger
        }, () => writeOpenFinanceSaveProposal(validated.writePlan, {
            operationKey: validated.operationKey,
            proposalRef: validated.proposal_ref
        }));
        assert.equal(receipt.status, 'committed');
        assert.equal(appendCalls.length, 1);
        assert.equal(appendCalls[0].range, 'Entradas!A:A');
        assert.equal(appendCalls[0].row[2], 'Investimentos');
        const db = new Database(shadowDb, { readonly: true });
        try {
            const events = db.prepare('SELECT event_json FROM canonical_ledger_events').all()
                .map(row => JSON.parse(row.event_json));
            assert.equal(events.length, 1);
            assert.equal(events[0].kind, 'income');
            assert.equal(events[0].amount_cents, 325);
            assert.equal(events[0].free_budget_eligible, true);
        } finally {
            db.close();
        }
    } finally {
        googleService.__test__.setUserSheetsClientFactoryForTest(null);
        googleService.__test__.clearSheetsReadCache();
        writeLedger.close();
        oauthTokenStore.__test__.closeDatabaseForTests();
        for (const [name, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
