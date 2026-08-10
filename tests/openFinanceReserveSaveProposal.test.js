const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    buildReviewedReserveSaveProposal
} = require('../src/openFinance/openFinanceReviewedReserveSaveProposal');
const {
    revalidateOpenFinanceSaveProposal,
    prepareOpenFinanceSaveProposalFinalization
} = require('../src/openFinance/openFinanceSaveProposalFinalization');
const {
    OpenFinanceShadowPreviewStore
} = require('../src/openFinance/openFinanceShadowPreviewStore');
const {
    buildCanonicalLedgerReceiptProjection
} = require('../src/ledger/canonicalLedgerReceiptProjector');
const {
    __test__: catalogTest
} = require('../src/openFinance/openFinanceSaveProposalReviewCatalog');

const secret = 'reserve-save-proposal-secret-1234567890';

function hmac(label) {
    return crypto.createHmac('sha256', secret).update(label).digest('hex').slice(0, 32);
}

function source(amountCents = -2500) {
    return {
        id: 'reserve-operation-1',
        account_id: 'daniel-bank',
        amount_cents: amountCents,
        description: amountCents < 0 ? 'Aplicacao Caixinha' : 'Resgate Caixinha',
        date: '2026-08-10T12:00:00.000Z',
        status: 'POSTED',
        operation_type: amountCents < 0
            ? 'APLICACAO_FINANCEIRA'
            : 'RESGATE_APLIC_FINANCEIRA'
    };
}

function review(decision = 'reserve_application', amountCents = -2500) {
    const transaction = source(amountCents);
    return {
        review_ref: 'a'.repeat(32),
        observation_ref: hmac('observation:item-daniel:daniel-bank:reserve-operation-1'),
        alias_ref: hmac('open-finance-revocation-lineage:daniel_nubank'),
        generation: 3,
        principal: 'daniel',
        classification: 'reserve_candidate',
        review_kind: 'reserve',
        review_status: 'provider_semantic_confirmation_required',
        review_state: 'decided',
        decision,
        provider_operation_type: transaction.operation_type,
        source: transaction,
        expires_at: '2099-08-11T12:00:00.000Z'
    };
}

function proposal(decision = 'reserve_application', amountCents = -2500) {
    const approved = review(decision, amountCents);
    return buildReviewedReserveSaveProposal({
        review: approved,
        currentSource: {
            alias: 'daniel_nubank',
            alias_ref: approved.alias_ref,
            generation: 3,
            account_type: 'BANK',
            transaction: source(amountCents)
        },
        reconciliationDecision: {
            status: 'new',
            transaction_ref: 'b'.repeat(32)
        },
        secret
    });
}

test('38.5 builds only direction-compatible reserve principal proposals', () => {
    const application = proposal('reserve_application', -2500);
    assert.equal(application.classification, 'reserve_transfer');
    assert.equal(application.reserve_direction, 'application');
    assert.equal(application.source_classification, 'reserve_candidate');
    assert.equal(application.financial_writes, 0);
    assert.match(application.operation_key, /^[a-f0-9]{48}$/);

    const redemption = proposal('reserve_redemption', 2500);
    assert.equal(redemption.reserve_direction, 'redemption');
    assert.throws(() => proposal('reserve_application', 2500), /direction_changed/);
    assert.throws(() => proposal('investment_income', 2500), /review_not_approved/);
    const changedProvider = review('reserve_application', -2500);
    assert.throws(() => buildReviewedReserveSaveProposal({
        review: changedProvider,
        currentSource: {
            alias: 'daniel_nubank', alias_ref: changedProvider.alias_ref,
            generation: 3, account_type: 'BANK',
            transaction: { ...source(-2500), operation_type: 'RESGATE_APLIC_FINANCEIRA' }
        },
        reconciliationDecision: { status: 'new', transaction_ref: 'b'.repeat(32) },
        secret
    }), /source_changed/);
});

test('38.5 stores one actor-bound reserve proposal idempotently', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'of-reserve-proposal-'));
    const databasePath = path.join(directory, 'preview.sqlite');
    const actorWhatsappId = '5511999999999@c.us';
    const store = new OpenFinanceShadowPreviewStore({
        databasePath,
        secret,
        authorizedWhatsAppIds: [actorWhatsappId]
    });
    try {
        const built = proposal();
        const first = store.ingestReviewedSemanticSaveProposal({ proposal: built });
        const replay = store.ingestReviewedSemanticSaveProposal({ proposal: built });
        assert.equal(first.inserted, 1);
        assert.equal(replay.replayed, 1);
        const persisted = store.readSaveProposalPrivate(built.proposal_ref, {
            actorWhatsappId
        });
        assert.equal(persisted.classification, 'reserve_transfer');
        assert.equal(persisted.reserve_direction, 'application');
        assert.equal(first.financial_writes, 0);
    } finally {
        store.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('38.5 default finalization fails closed when the source generation was revoked', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'of-reserve-revoked-'));
    const built = proposal();
    const files = {
        secret: path.join(directory, 'secret.txt'),
        staging: path.join(directory, 'staging.sqlite'),
        preview: path.join(directory, 'preview.sqlite'),
        journal: path.join(directory, 'journal.sqlite'),
        mapping: path.join(directory, 'mapping.json')
    };
    fs.writeFileSync(files.secret, secret);
    fs.writeFileSync(files.staging, '');
    fs.writeFileSync(files.preview, '');
    fs.writeFileSync(files.journal, '');
    fs.writeFileSync(files.mapping, JSON.stringify([{
        alias: built.alias,
        generation: built.generation
    }]));
    const checks = [];
    class JournalStub {
        isGenerationRevoked(alias, generation) {
            checks.push([alias, generation]);
            return true;
        }
        close() {}
    }
    class PreviewStub {
        readSaveProposalDecisionState() {
            return { proposal_state: 'pending', confirmation_state: 'accepted' };
        }
        readReviewableSaveProposal() { return built; }
        close() {}
    }
    class ReviewStub {
        readReviewPrivate() {
            return { proposal_ref: built.proposal_ref, state: 'ready', payload: {} };
        }
        close() {}
    }
    class ProactiveReviewStub {
        readPrivate() { return { review_ref: built.semantic_review_ref }; }
        close() {}
    }
    class VaultStub {
        readItemByAlias() {
            return { id: 'item-daniel', accounts: [], transactions: [] };
        }
        close() {}
    }
    const env = {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_WRITE_MODE: 'confirm',
        OPEN_FINANCE_WRITE_APPROVED: 'true',
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: files.secret,
        OPEN_FINANCE_LIVE_STAGING_DB: files.staging,
        OPEN_FINANCE_SHADOW_PREVIEW_DB: files.preview,
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: files.journal,
        PLUGGY_ITEM_MAP_FILE: files.mapping
    };
    try {
        await assert.rejects(() => prepareOpenFinanceSaveProposalFinalization({
            proposalRef: built.proposal_ref,
            actorWhatsappId: '5511999999999@c.us',
            userId: 'user-daniel',
            env,
            dependencies: {
                secret,
                OpenFinanceRevocationJournal: JournalStub,
                OpenFinanceShadowPreviewStore: PreviewStub,
                OpenFinanceSaveProposalReviewStore: ReviewStub,
                OpenFinanceProactiveReviewStore: ProactiveReviewStub,
                OpenFinanceLiveStagingVault: VaultStub
            }
        }), /save_proposal_revoked_generation/);
        assert.deepEqual(checks, [[built.alias, built.generation]]);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('38.5 catalog exposes account type and preserves bank/reserve distinction', () => {
    const rows = [
        ['Nome da Conta', 'Tipo', 'Saldo Inicial', 'Data de Abertura', 'Status', 'Moeda', 'Responsavel', 'user_id', 'Observacoes'],
        ['Daniel Nubank', 'bank', 0, '2025-01-01', 'active', 'BRL', 'Daniel', 'user-daniel', ''],
        ['Daniel Caixinha', 'reserve', 0, '2025-01-01', 'active', 'BRL', 'Daniel', 'user-daniel', '']
    ];
    const accounts = catalogTest.accountsFromRows(rows, ['user-daniel']);
    assert.deepEqual(accounts.map(account => account.accountType), ['bank', 'reserve']);
});

function revalidationFixture(decision = 'reserve_application', amountCents = -2500) {
    const reviewed = review(decision, amountCents);
    const built = proposal(decision, amountCents);
    const item = {
        id: 'item-daniel', alias_code: 'daniel_nubank', generation: 3,
        accounts: [{ id: 'daniel-bank', type: 'BANK' }],
        transactions: [source(amountCents)]
    };
    const catalog = {
        people: [{ id: 'user-daniel', label: 'Daniel' }],
        categories: [], paymentMethods: [], cards: [],
        financialAccounts: [
            { id: 'account:user-daniel:daniel-nubank', label: 'Daniel Nubank', accountName: 'Daniel Nubank', ownerUserId: 'user-daniel', accountType: 'bank' },
            { id: 'account:user-daniel:daniel-caixinha', label: 'Daniel Caixinha', accountName: 'Daniel Caixinha', ownerUserId: 'user-daniel', accountType: 'reserve' }
        ]
    };
    const bank = catalog.financialAccounts[0];
    const reserve = catalog.financialAccounts[1];
    return {
        proposal: built,
        review: {
            proposal_ref: built.proposal_ref,
            state: 'ready',
            payload: {
                classification: 'reserve_transfer',
                reserve_direction: built.reserve_direction,
                draft: decision === 'reserve_application'
                    ? { originAccount: bank, destinationAccount: reserve, ownerUserId: 'user-daniel' }
                    : { originAccount: reserve, destinationAccount: bank, ownerUserId: 'user-daniel' }
            }
        },
        semanticReview: reviewed,
        item,
        internalSource: { available: true, scope_coverage: 'complete', transactions: [] },
        catalog
    };
}

test('38.5 finalization writes one neutral transfer in the approved direction', () => {
    const validated = revalidateOpenFinanceSaveProposal({
        ...revalidationFixture(),
        secret
    });
    assert.equal(validated.writePlan.operation, 'transfer.create');
    assert.equal(validated.writePlan.sheetName, 'Transferências');
    assert.equal(validated.writePlan.row[3], 'Daniel Nubank');
    assert.equal(validated.writePlan.row[4], 'Daniel Caixinha');
    assert.equal(validated.writePlan.canonicalRelation.type, 'reserve_application');
    assert.equal(validated.financial_writes, 0);

    const inverted = revalidationFixture();
    [inverted.review.payload.draft.originAccount,
        inverted.review.payload.draft.destinationAccount] =
        [inverted.review.payload.draft.destinationAccount,
            inverted.review.payload.draft.originAccount];
    assert.throws(() => revalidateOpenFinanceSaveProposal({ ...inverted, secret }),
        /reserve_accounts_changed/);

    const redemption = revalidateOpenFinanceSaveProposal({
        ...revalidationFixture('reserve_redemption', 2500),
        secret
    });
    assert.equal(redemption.writePlan.row[3], 'Daniel Caixinha');
    assert.equal(redemption.writePlan.row[4], 'Daniel Nubank');
    assert.equal(redemption.writePlan.canonicalRelation.type, 'reserve_redemption');
});

test('38.5 canonical receipt keeps reserve principal neutral between distinct accounts', () => {
    const validated = revalidateOpenFinanceSaveProposal({
        ...revalidationFixture(),
        secret
    });
    const projection = buildCanonicalLedgerReceiptProjection({
        sheetName: validated.writePlan.sheetName,
        row: validated.writePlan.row,
        operationKey: validated.operationKey,
        status: 'committed',
        receipt: { updatedRange: 'Transferências!A2:I2' },
        committedAt: '2026-08-10T13:00:00.000Z',
        canonicalRelation: validated.writePlan.canonicalRelation,
        financialAccountRows: [
            ['Nome da Conta', 'Tipo', 'Saldo Inicial', 'Data de Abertura',
                'Status', 'Moeda', 'Responsável', 'user_id', 'Observações'],
            ['Daniel Nubank', 'bank', 0, '2025-01-01', 'ATIVA', 'BRL',
                'Daniel', 'user-daniel', ''],
            ['Daniel Caixinha', 'reserve', 0, '2025-01-01', 'ATIVA', 'BRL',
                'Daniel', 'user-daniel', '']
        ]
    });
    const event = projection.projected.events[0];
    const cash = projection.projected.lines.find(line => line.line_type === 'cash');
    const clearing = projection.projected.lines.find(line => line.line_type === 'clearing');
    assert.equal(event.kind, 'transfer');
    assert.equal(event.free_budget_eligible, false);
    assert.equal(event.net_income_expense_impact, 0);
    assert.notEqual(cash.account_id, clearing.account_id);
    assert.equal(projection.publicProjection[0].net_income_expense_impact, 0);
});
