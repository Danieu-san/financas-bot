const crypto = require('node:crypto');
const fs = require('node:fs');

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
    if (value.length < 32) throw new Error('open_finance_refund_proposal_secret_required');
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

function internalCanonicalRef(secret, value = {}) {
    return hmac(secret, String(value.id || ''));
}

function linkedTargetFromInternal({ accountType, internalTransaction, canonicalOriginal } = {}) {
    const type = String(accountType || '').trim().toUpperCase();
    const sourceType = String(internalTransaction?.source_type || '');
    const userId = String(internalTransaction?.user_id || '').trim();
    const category = String(canonicalOriginal?.category || internalTransaction?.category || '').trim();
    const subcategory = String(canonicalOriginal?.subcategory ||
        internalTransaction?.subcategory || '').trim();
    if (!canonicalOriginal?.resolved || !userId || !category ||
        canonicalOriginal.owner_person_id !== userId ||
        !String(canonicalOriginal.related_source_row_ref || '').trim()) {
        throw new Error('open_finance_refund_proposal_original_unavailable');
    }
    if (type === 'CREDIT') {
        const cardId = String(internalTransaction?.card_id || '').trim();
        const cardName = String(internalTransaction?.card_name || '').trim();
        if (sourceType !== 'cartao' || canonicalOriginal.source_type !==
            'sheet.lancamentos_cartao' || !cardId || !cardName) {
            throw new Error('open_finance_refund_proposal_target_invalid');
        }
        return {
            kind: 'card', user_id: userId, category, subcategory,
            card_id: cardId, card_name: cardName,
            related_event_id: canonicalOriginal.related_event_id,
            related_source_row_ref: canonicalOriginal.related_source_row_ref,
            original_amount_cents: canonicalOriginal.original_amount_cents
        };
    }
    const financialAccount = String(internalTransaction?.financial_account || '').trim();
    if (sourceType !== 'saida' || canonicalOriginal.source_type !== 'sheet.saidas' ||
        !financialAccount) {
        throw new Error('open_finance_refund_proposal_target_invalid');
    }
    return {
        kind: 'bank', user_id: userId, category, subcategory,
        financial_account: financialAccount,
        related_event_id: canonicalOriginal.related_event_id,
        related_source_row_ref: canonicalOriginal.related_source_row_ref,
        original_amount_cents: canonicalOriginal.original_amount_cents
    };
}

function buildReviewedRefundSaveProposal({
    review,
    currentSource,
    refundDecision,
    pairDecision,
    internalTransaction,
    canonicalOriginal,
    secret
} = {}) {
    const safeSecret = requireSecret(secret);
    if (!review || review.review_state !== 'decided' || review.decision !== 'confirm_pair' ||
        review.review_kind !== 'refund_link' ||
        review.review_status !== 'pair_confirmation_required' ||
        !/^[a-f0-9]{32}$/.test(String(review.review_ref || '')) ||
        !/^[a-f0-9]{32}$/.test(String(review.observation_ref || '')) ||
        !/^[a-f0-9]{32}$/.test(String(review.pair_observation_ref || '')) ||
        !review.pair_source) {
        throw new Error('open_finance_refund_proposal_review_not_approved');
    }
    if (!currentSource || currentSource.alias_ref !== review.alias_ref ||
        Number(currentSource.generation) !== Number(review.generation) ||
        String(currentSource.refund?.status || '').trim().toUpperCase() !== 'POSTED' ||
        String(currentSource.purchase?.status || '').trim().toUpperCase() !== 'POSTED' ||
        stableSerialize(sourceFingerprint(currentSource.refund)) !==
            stableSerialize(sourceFingerprint(review.source)) ||
        stableSerialize(sourceFingerprint(currentSource.purchase)) !==
            stableSerialize(sourceFingerprint(review.pair_source))) {
        throw new Error('open_finance_refund_proposal_source_changed');
    }
    if (!refundDecision || refundDecision.status !== 'new' ||
        !pairDecision || pairDecision.status !== 'matched' ||
        pairDecision.confidence_band !== 'high' ||
        !/^[a-f0-9]{32}$/.test(String(pairDecision.canonical_ref || '')) ||
        pairDecision.canonical_ref !== internalCanonicalRef(safeSecret, internalTransaction)) {
        throw new Error('open_finance_refund_proposal_pair_not_strong');
    }
    const alias = String(currentSource.alias || '').trim().toLowerCase();
    const principal = String(review.principal || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,48}$/.test(alias) || !['daniel', 'thais'].includes(principal)) {
        throw new Error('open_finance_refund_proposal_scope_invalid');
    }
    const linkedTarget = linkedTargetFromInternal({
        accountType: currentSource.account_type,
        internalTransaction,
        canonicalOriginal
    });
    const refundAmountCents = Math.abs(Number(currentSource.refund.amount_cents));
    const purchaseAmountCents = Math.abs(Number(currentSource.purchase.amount_cents));
    if (!Number.isSafeInteger(refundAmountCents) || refundAmountCents <= 0 ||
        refundAmountCents !== purchaseAmountCents ||
        refundAmountCents > Number(linkedTarget.original_amount_cents)) {
        throw new Error('open_finance_refund_proposal_amount_invalid');
    }
    const proposalRef = hmac(
        safeSecret,
        `reviewed-refund-save-proposal:${review.review_ref}:${review.observation_ref}:${review.pair_observation_ref}`
    );
    return {
        proposal_ref: proposalRef,
        alias,
        alias_ref: review.alias_ref,
        generation: Number(review.generation),
        principal,
        classification: 'refund',
        source_classification: 'refund',
        provider_state: 'POSTED',
        account_type: String(currentSource.account_type || '').trim().toUpperCase(),
        source: { ...currentSource.refund },
        paired_source: { ...currentSource.purchase },
        observation_ref: review.observation_ref,
        pair_observation_ref: review.pair_observation_ref,
        reconciliation_transaction_ref: refundDecision.transaction_ref,
        reconciliation_status: 'new',
        pair_reconciliation_ref: pairDecision.canonical_ref,
        pair_reconciliation_status: 'matched',
        semantic_review_ref: review.review_ref,
        linked_target: linkedTarget,
        operation_key: hmac(
            safeSecret,
            `open-finance-refund-write:${review.review_ref}:${review.observation_ref}:${review.pair_observation_ref}`,
            48
        ),
        expires_at: review.expires_at,
        financial_writes: 0
    };
}

async function prepareReviewedRefundSaveProposal({
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
    const { readOpenFinanceInternalSource, reconcileOpenFinanceRuntimeCandidates } =
        require('./openFinanceRuntimeReconciliation');
    const { resolveCanonicalRefundOriginal } =
        require('../ledger/canonicalLedgerReceiptProjector');
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
    if (review.review_state !== 'decided' || review.decision !== 'confirm_pair') {
        throw new Error('open_finance_refund_proposal_review_not_approved');
    }
    const mappings = JSON.parse(fs.readFileSync(env.PLUGGY_ITEM_MAP_FILE, 'utf8'));
    const matches = mappings.filter(mapping => {
        const alias = String(mapping?.alias || '').trim().toLowerCase();
        return hmac(secret, `open-finance-revocation-lineage:${alias}`) ===
            review.alias_ref && Number(mapping?.generation || 1) === Number(review.generation);
    });
    if (matches.length !== 1) {
        throw new Error('open_finance_refund_proposal_mapping_unavailable');
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
    if (!item) throw new Error('open_finance_refund_proposal_source_unavailable');
    item.generation = Number(matches[0].generation || 1);
    const refund = (item.transactions || []).find(value =>
        String(value.id || '') === String(review.source?.id || '') &&
        String(value.account_id || '') === String(review.source?.account_id || ''));
    const purchase = (item.transactions || []).find(value =>
        String(value.id || '') === String(review.pair_source?.id || '') &&
        String(value.account_id || '') === String(review.pair_source?.account_id || ''));
    const account = (item.accounts || []).find(value =>
        String(value.id || '') === String(review.source?.account_id || ''));
    if (!refund || !purchase || !account || refund.account_id !== purchase.account_id) {
        throw new Error('open_finance_refund_proposal_source_changed');
    }
    const lifecycle = classifyOpenFinanceLifecycle({
        items: [item], observedAt: new Date().toISOString(), secret
    });
    const refundLifecycle = lifecycle.decisions.find(value =>
        value.observation_ref === review.observation_ref);
    const pairLifecycle = lifecycle.decisions.find(value =>
        value.observation_ref === review.pair_observation_ref);
    if (!refundLifecycle || refundLifecycle.classification !== 'refund' ||
        refundLifecycle.provider_state !== 'POSTED' || !pairLifecycle ||
        !['purchase', 'purchase_candidate'].includes(pairLifecycle.classification) ||
        pairLifecycle.provider_state !== 'POSTED') {
        throw new Error('open_finance_refund_proposal_source_changed');
    }
    const users = await (dependencies.getActiveUsers || getActiveUsers)();
    const resolveScope = dependencies.getFinancialScopeUserIds || getFinancialScopeUserIds;
    const userIds = await Promise.resolve(resolveScope(userId));
    const internalSource = await (dependencies.readOpenFinanceInternalSource ||
        readOpenFinanceInternalSource)({
        users, userIds, aliases: [alias],
        dependencies: dependencies.internalSourceDependencies || {}
    });
    if (!internalSource.available) {
        throw new Error('open_finance_refund_proposal_internal_source_unavailable');
    }
    const reconciled = (dependencies.reconcileOpenFinanceRuntimeCandidates ||
        reconcileOpenFinanceRuntimeCandidates)({
        items: [item],
        candidates: [review.observation_ref, review.pair_observation_ref].map(observation_ref => ({
            observation_ref, correlation_state: 'new_event'
        })),
        internalTransactions: internalSource.transactions,
        scopeCoverage: internalSource.scope_coverage,
        secret,
        previewDatabasePath: null
    });
    const refundDecision = reconciled.decisions.find(value =>
        value.observation_ref === review.observation_ref);
    const pairDecision = reconciled.decisions.find(value =>
        value.observation_ref === review.pair_observation_ref);
    const internalMatches = (internalSource.transactions || []).filter(value =>
        internalCanonicalRef(secret, value) === pairDecision?.canonical_ref);
    if (internalMatches.length !== 1) {
        throw new Error('open_finance_refund_proposal_pair_not_strong');
    }
    const canonicalOriginal = (dependencies.resolveCanonicalRefundOriginal ||
        resolveCanonicalRefundOriginal)({
        env,
        original: internalMatches[0]
    });
    const proposal = buildReviewedRefundSaveProposal({
        review,
        currentSource: {
            alias, alias_ref: review.alias_ref, generation: item.generation,
            account_type: account.type, refund, purchase
        },
        refundDecision,
        pairDecision,
        internalTransaction: internalMatches[0],
        canonicalOriginal,
        secret
    });
    const Journal = dependencies.OpenFinanceRevocationJournal || OpenFinanceRevocationJournal;
    const Preview = dependencies.OpenFinanceShadowPreviewStore || OpenFinanceShadowPreviewStore;
    const journal = new Journal({
        databasePath: env.OPEN_FINANCE_REVOCATION_JOURNAL_DB,
        secret
    });
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
            proposal.proposal_ref,
            { actorWhatsappId }
        );
        if (confirmation.state !== 'ready') {
            throw new Error('open_finance_refund_proposal_confirmation_not_ready');
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
            'Estorno vinculado \u00e0 compra original. Nenhum lan\u00e7amento foi salvo ainda.',
            `Valor: ${(Math.abs(Number(proposal.source.amount_cents)) / 100).toLocaleString('pt-BR', {
                style: 'currency', currency: 'BRL'
            })}`,
            `Descri\u00e7\u00e3o: ${String(proposal.source.description || '').slice(0, 120)}`,
            '',
            'Quer continuar para conferir o salvamento?',
            'Responda *sim*, *n\u00e3o* ou *cancelar*.'
        ].join('\n'),
        financial_writes: 0
    };
}

module.exports = {
    buildReviewedRefundSaveProposal,
    prepareReviewedRefundSaveProposal,
    linkedTargetFromInternal,
    __test__: { sourceFingerprint, internalCanonicalRef, linkedTargetFromInternal }
};
