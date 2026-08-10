const crypto = require('node:crypto');
const fs = require('node:fs');

const INVESTMENT_REVIEW_STATUSES = new Set([
    'provider_semantic_confirmation_required',
    'provider_semantic_classification_required',
    'provider_semantic_conflict_review_required',
    'reserve_semantic_classification_required'
]);

function stableSerialize(value) {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key =>
            `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_investment_income_secret_required');
    return value;
}

function hmac(secret, label, length = 32) {
    return crypto.createHmac('sha256', secret).update(label).digest('hex').slice(0, length);
}

function sourceFingerprint(value = {}) {
    return {
        id: String(value.id || '').trim(),
        account_id: String(value.account_id || '').trim(),
        amount_cents: Number(value.amount_cents),
        description: String(value.description || '').trim(),
        date: String(value.date || '').trim(),
        status: String(value.status || '').trim().toUpperCase()
    };
}

function buildReviewedInvestmentIncomeSaveProposal({
    review,
    currentSource,
    reconciliationDecision,
    secret
} = {}) {
    const safeSecret = requireSecret(secret);
    if (!review || review.review_state !== 'decided' ||
        review.decision !== 'investment_income' || review.review_kind !== 'reserve' ||
        !INVESTMENT_REVIEW_STATUSES.has(review.review_status) ||
        !/^[a-f0-9]{32}$/.test(String(review.review_ref || '')) ||
        !/^[a-f0-9]{32}$/.test(String(review.observation_ref || ''))) {
        throw new Error('open_finance_investment_income_review_not_approved');
    }
    if (!currentSource ||
        String(currentSource.alias_ref || '') !== String(review.alias_ref || '') ||
        Number(currentSource.generation) !== Number(review.generation) ||
        !['BANK', 'CHECKING', 'SAVINGS'].includes(
            String(currentSource.account_type || '').trim().toUpperCase()) ||
        String(currentSource.transaction?.status || '').trim().toUpperCase() !== 'POSTED' ||
        Number(currentSource.transaction?.amount_cents) <= 0 ||
        stableSerialize(sourceFingerprint(currentSource.transaction)) !==
            stableSerialize(sourceFingerprint(review.source))) {
        throw new Error('open_finance_investment_income_source_changed');
    }
    const durableOperation = String(review.provider_operation_type || '').trim().toUpperCase();
    const currentOperation = String(currentSource.transaction.operation_type || '')
        .trim().toUpperCase();
    if (!durableOperation || durableOperation !== currentOperation ||
        !/^RENDIMENTO_APLIC_FINANCEIRA(?:_|$)/.test(currentOperation)) {
        throw new Error('open_finance_investment_income_source_changed');
    }
    if (!reconciliationDecision || reconciliationDecision.status !== 'new' ||
        !/^[a-f0-9]{32}$/.test(String(reconciliationDecision.transaction_ref || ''))) {
        throw new Error('open_finance_investment_income_not_new');
    }
    const alias = String(currentSource.alias || '').trim().toLowerCase();
    const principal = String(review.principal || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,48}$/.test(alias) || !['daniel', 'thais'].includes(principal)) {
        throw new Error('open_finance_investment_income_scope_invalid');
    }
    return {
        proposal_ref: hmac(safeSecret,
            `reviewed-investment-income-save-proposal:${review.review_ref}:${review.observation_ref}`),
        alias,
        alias_ref: review.alias_ref,
        generation: Number(review.generation),
        principal,
        classification: 'investment_income',
        source_classification: 'reserve_candidate',
        investment_semantic: 'income_only',
        provider_state: 'POSTED',
        account_type: String(currentSource.account_type || '').trim().toUpperCase(),
        source: { ...currentSource.transaction },
        observation_ref: review.observation_ref,
        reconciliation_transaction_ref: reconciliationDecision.transaction_ref,
        reconciliation_status: 'new',
        semantic_review_ref: review.review_ref,
        operation_key: hmac(safeSecret,
            `open-finance-investment-income-write:${review.review_ref}:${review.observation_ref}`,
            48),
        expires_at: review.expires_at,
        financial_writes: 0
    };
}

async function prepareReviewedInvestmentIncomeSaveProposal({
    reviewCode,
    actorWhatsappId,
    userId,
    env = process.env,
    dependencies = {}
} = {}) {
    const { assertPromptConfiguration } = require('./openFinanceSaveProposalConversation');
    const configuration = assertPromptConfiguration(env);
    if (!configuration.enabled) return { handled: false, financial_writes: 0 };
    const secret = dependencies.secret ||
        fs.readFileSync(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE, 'utf8').trim();
    const { OpenFinanceProactiveReviewStore } = require('./openFinanceProactiveReviewStore');
    const { OpenFinanceLiveStagingVault } = require('./openFinanceLiveStagingVault');
    const { OpenFinanceShadowPreviewStore } = require('./openFinanceShadowPreviewStore');
    const { OpenFinanceRevocationJournal } = require('./openFinanceRevocationJournal');
    const { classifyOpenFinanceLifecycle } = require('./openFinanceLifecycleClassifier');
    const { analyzeOpenFinanceProactiveReviews } = require('./openFinanceProactiveReview');
    const { readOpenFinanceInternalSource, reconcileOpenFinanceRuntimeCandidates } =
        require('./openFinanceRuntimeReconciliation');
    const { getActiveUsers } = require('../services/userService');
    const { getFinancialScopeUserIds } = require('../services/oauthTokenStore');

    const ReviewStore = dependencies.OpenFinanceProactiveReviewStore ||
        OpenFinanceProactiveReviewStore;
    const reviewStore = new ReviewStore({
        databasePath: env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
        secret
    });
    let review;
    try {
        review = reviewStore.readPrivateByCode(reviewCode, { actorWhatsappId });
    } finally {
        reviewStore.close();
    }
    if (review.review_state !== 'decided' || review.decision !== 'investment_income') {
        throw new Error('open_finance_investment_income_review_not_approved');
    }
    const mappings = JSON.parse(fs.readFileSync(env.PLUGGY_ITEM_MAP_FILE, 'utf8'));
    const matches = mappings.filter(mapping => {
        const alias = String(mapping?.alias || '').trim().toLowerCase();
        return hmac(secret, `open-finance-revocation-lineage:${alias}`) === review.alias_ref &&
            Number(mapping?.generation || 1) === Number(review.generation);
    });
    if (matches.length !== 1) {
        throw new Error('open_finance_investment_income_mapping_unavailable');
    }
    const alias = String(matches[0].alias).trim().toLowerCase();
    const Vault = dependencies.OpenFinanceLiveStagingVault || OpenFinanceLiveStagingVault;
    const vault = new Vault({ databasePath: env.OPEN_FINANCE_LIVE_STAGING_DB, secret });
    let item;
    try {
        item = vault.readItemByAlias(alias);
    } finally {
        vault.close();
    }
    if (!item) throw new Error('open_finance_investment_income_source_unavailable');
    item.alias_code = alias;
    item.generation = Number(matches[0].generation || 1);
    item.owner_scope = String(matches[0].ownerScope || '').trim().toLowerCase();
    const transaction = (item.transactions || []).find(value =>
        String(value.id || '') === String(review.source?.id || '') &&
        String(value.account_id || '') === String(review.source?.account_id || ''));
    const account = (item.accounts || []).find(value =>
        String(value.id || '') === String(review.source?.account_id || ''));
    if (!transaction || !account) {
        throw new Error('open_finance_investment_income_source_changed');
    }
    const lifecycle = classifyOpenFinanceLifecycle({
        items: [item], observedAt: new Date().toISOString(), secret
    });
    const users = await (dependencies.getActiveUsers || getActiveUsers)();
    const resolveScope = dependencies.getFinancialScopeUserIds || getFinancialScopeUserIds;
    const userIds = await Promise.resolve(resolveScope(userId));
    const internalSource = await (dependencies.readOpenFinanceInternalSource ||
        readOpenFinanceInternalSource)({
        users, userIds, aliases: [alias],
        dependencies: dependencies.internalSourceDependencies || {}
    });
    if (!internalSource.available) {
        throw new Error('open_finance_investment_income_internal_source_unavailable');
    }
    const reconciled = (dependencies.reconcileOpenFinanceRuntimeCandidates ||
        reconcileOpenFinanceRuntimeCandidates)({
        items: [item],
        candidates: [{ observation_ref: review.observation_ref, correlation_state: 'new_event' }],
        internalTransactions: internalSource.transactions,
        scopeCoverage: internalSource.scope_coverage,
        secret,
        previewDatabasePath: null
    });
    const currentReview = (dependencies.analyzeOpenFinanceProactiveReviews ||
        analyzeOpenFinanceProactiveReviews)({
        items: [item], lifecycleDecisions: lifecycle.decisions,
        reconciliationDecisions: reconciled.decisions, secret
    }).reviews.find(candidate => candidate.observation_ref === review.observation_ref &&
        candidate.review_kind === 'reserve');
    if (!currentReview || currentReview.review_status !== review.review_status) {
        throw new Error('open_finance_investment_income_source_changed');
    }
    const proposal = buildReviewedInvestmentIncomeSaveProposal({
        review,
        currentSource: {
            alias, alias_ref: review.alias_ref, generation: item.generation,
            account_type: account.type, transaction
        },
        reconciliationDecision: reconciled.decisions.find(value =>
            value.observation_ref === review.observation_ref),
        secret
    });
    const Journal = dependencies.OpenFinanceRevocationJournal || OpenFinanceRevocationJournal;
    const Preview = dependencies.OpenFinanceShadowPreviewStore || OpenFinanceShadowPreviewStore;
    const journal = new Journal({ databasePath: env.OPEN_FINANCE_REVOCATION_JOURNAL_DB, secret });
    const preview = new Preview({
        databasePath: env.OPEN_FINANCE_SHADOW_PREVIEW_DB,
        secret,
        revocationJournal: journal,
        authorizedWhatsAppIds: [actorWhatsappId],
        confirmationActors: [{ principal: review.principal, whatsappId: actorWhatsappId }],
        familyConfirmationEnabled: Boolean(configuration.familyConfirmationEnabled)
    });
    try {
        preview.ingestReviewedSemanticSaveProposal({ proposal });
        const confirmation = preview.prepareSaveProposalConfirmation(
            proposal.proposal_ref, { actorWhatsappId }
        );
        if (confirmation.state !== 'ready') {
            throw new Error('open_finance_investment_income_confirmation_not_ready');
        }
    } finally {
        preview.close();
        journal.close();
    }
    return {
        handled: true,
        keep_pending: true,
        proposal_ref: proposal.proposal_ref,
        recipient_principal: review.principal,
        reply: [
            'Rendimento de reserva confirmado. Nada foi salvo ainda.',
            `Valor: ${(Number(proposal.source.amount_cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
            `Descri\u00e7\u00e3o: ${String(proposal.source.description || '').slice(0, 120)}`,
            '',
            'Quer continuar para escolher a conta de destino e conferir o salvamento?',
            'Responda *sim*, *n\u00e3o* ou *cancelar*.'
        ].join('\n'),
        financial_writes: 0
    };
}

module.exports = {
    buildReviewedInvestmentIncomeSaveProposal,
    prepareReviewedInvestmentIncomeSaveProposal
};
