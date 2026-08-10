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
    if (value.length < 32) throw new Error('open_finance_transfer_proposal_secret_required');
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

function observationRef(secret, item, transaction) {
    return hmac(secret, `observation:${item.id}:${transaction.account_id}:${transaction.id}`);
}

function normalizePrincipal(value) {
    const principal = String(value || '').trim().toLowerCase();
    if (!['daniel', 'thais'].includes(principal)) {
        throw new Error('open_finance_transfer_proposal_scope_invalid');
    }
    return principal;
}

function normalizeLeg(leg, secret) {
    const alias = String(leg?.alias || '').trim().toLowerCase();
    const generation = Number(leg?.generation);
    const accountType = String(leg?.account_type || '').trim().toUpperCase();
    const transaction = leg?.transaction;
    if (!/^[a-z0-9_-]{2,48}$/.test(alias) || !Number.isInteger(generation) ||
        generation < 1 || !['BANK', 'CHECKING', 'SAVINGS'].includes(accountType) ||
        !transaction || String(transaction.status || '').trim().toUpperCase() !== 'POSTED') {
        throw new Error('open_finance_transfer_proposal_source_changed');
    }
    return {
        alias,
        alias_ref: hmac(secret, `open-finance-revocation-lineage:${alias}`),
        generation,
        principal: normalizePrincipal(leg.principal),
        account_type: accountType,
        observation_ref: String(leg.observation_ref || ''),
        transaction: { ...transaction }
    };
}

function buildReviewedTransferSaveProposal({
    review,
    currentSource,
    currentPair,
    sourceDecision,
    pairDecision,
    strongPairReview,
    secret
} = {}) {
    const safeSecret = requireSecret(secret);
    if (!review || review.review_state !== 'decided' ||
        review.decision !== 'confirm_transfer_pair' ||
        review.review_kind !== 'transfer' ||
        review.review_status !== 'strong_pair_confirmation_required' ||
        review.pair_basis !== 'shared_provider_reference' ||
        !/^[a-f0-9]{32}$/.test(String(review.review_ref || '')) ||
        !/^[a-f0-9]{32}$/.test(String(review.observation_ref || '')) ||
        !/^[a-f0-9]{32}$/.test(String(review.pair_observation_ref || '')) ||
        !review.pair_source) {
        throw new Error('open_finance_transfer_proposal_review_not_approved');
    }
    const source = normalizeLeg(currentSource, safeSecret);
    const pair = normalizeLeg(currentPair, safeSecret);
    if (source.observation_ref !== review.observation_ref ||
        pair.observation_ref !== review.pair_observation_ref ||
        source.alias_ref !== review.alias_ref ||
        Number(source.generation) !== Number(review.generation) ||
        source.principal !== normalizePrincipal(review.principal) ||
        stableSerialize(sourceFingerprint(source.transaction)) !==
            stableSerialize(sourceFingerprint(review.source)) ||
        stableSerialize(sourceFingerprint(pair.transaction)) !==
            stableSerialize(sourceFingerprint(review.pair_source)) ||
        source.transaction.account_id === pair.transaction.account_id ||
        Math.sign(Number(source.transaction.amount_cents)) ===
            Math.sign(Number(pair.transaction.amount_cents)) ||
        Math.abs(Number(source.transaction.amount_cents)) !==
            Math.abs(Number(pair.transaction.amount_cents))) {
        throw new Error('open_finance_transfer_proposal_source_changed');
    }
    if (!sourceDecision || sourceDecision.status !== 'new' ||
        !pairDecision || pairDecision.status !== 'new' ||
        !/^[a-f0-9]{32}$/.test(String(sourceDecision.transaction_ref || '')) ||
        !/^[a-f0-9]{32}$/.test(String(pairDecision.transaction_ref || ''))) {
        throw new Error('open_finance_transfer_proposal_not_new');
    }
    if (!strongPairReview || strongPairReview.review_kind !== 'transfer' ||
        strongPairReview.review_status !== 'strong_pair_confirmation_required' ||
        strongPairReview.pair_basis !== 'shared_provider_reference' ||
        strongPairReview.observation_ref !== review.observation_ref ||
        strongPairReview.pair_observation_ref !== review.pair_observation_ref) {
        throw new Error('open_finance_transfer_proposal_pair_not_strong');
    }
    const origin = Number(source.transaction.amount_cents) < 0 ? source : pair;
    const destination = origin === source ? pair : source;
    const proposalRef = hmac(
        safeSecret,
        `reviewed-transfer-save-proposal:${review.review_ref}:${review.observation_ref}:${review.pair_observation_ref}`
    );
    return {
        proposal_ref: proposalRef,
        alias: source.alias,
        alias_ref: source.alias_ref,
        generation: source.generation,
        principal: source.principal,
        pair_alias: pair.alias,
        pair_alias_ref: pair.alias_ref,
        pair_generation: pair.generation,
        pair_principal: pair.principal,
        classification: 'transfer',
        source_classification: 'transfer',
        provider_state: 'POSTED',
        account_type: source.account_type,
        pair_account_type: pair.account_type,
        source: { ...source.transaction },
        paired_source: { ...pair.transaction },
        observation_ref: review.observation_ref,
        pair_observation_ref: review.pair_observation_ref,
        reconciliation_transaction_ref: sourceDecision.transaction_ref,
        pair_reconciliation_transaction_ref: pairDecision.transaction_ref,
        reconciliation_status: 'new',
        pair_reconciliation_status: 'new',
        semantic_review_ref: review.review_ref,
        transfer_origin: {
            alias: origin.alias,
            principal: origin.principal,
            account_id: origin.transaction.account_id,
            observation_ref: origin.observation_ref
        },
        transfer_destination: {
            alias: destination.alias,
            principal: destination.principal,
            account_id: destination.transaction.account_id,
            observation_ref: destination.observation_ref
        },
        operation_key: hmac(
            safeSecret,
            `open-finance-transfer-write:${review.review_ref}:${review.observation_ref}:${review.pair_observation_ref}`,
            48
        ),
        expires_at: review.expires_at,
        financial_writes: 0
    };
}

async function prepareReviewedTransferSaveProposal({
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
    if (review.review_state !== 'decided' || review.decision !== 'confirm_transfer_pair') {
        throw new Error('open_finance_transfer_proposal_review_not_approved');
    }
    const mappings = JSON.parse(fs.readFileSync(env.PLUGGY_ITEM_MAP_FILE, 'utf8'));
    const Vault = dependencies.OpenFinanceLiveStagingVault || OpenFinanceLiveStagingVault;
    const vault = new Vault({ databasePath: env.OPEN_FINANCE_LIVE_STAGING_DB, secret });
    const items = [];
    try {
        for (const mapping of mappings) {
            const alias = String(mapping?.alias || '').trim().toLowerCase();
            if (!alias) continue;
            const item = vault.readItemByAlias(alias);
            if (!item) continue;
            item.alias_code = alias;
            item.generation = Number(mapping.generation || 1);
            item.owner_scope = normalizePrincipal(mapping.ownerScope);
            items.push(item);
        }
    } finally {
        vault.close();
    }
    const legByObservation = new Map();
    for (const item of items) {
        const accounts = new Map((item.accounts || []).map(account => [account.id, account]));
        for (const transaction of item.transactions || []) {
            const ref = observationRef(secret, item, transaction);
            if (![review.observation_ref, review.pair_observation_ref].includes(ref)) continue;
            if (legByObservation.has(ref)) {
                throw new Error('open_finance_transfer_proposal_source_ambiguous');
            }
            const account = accounts.get(transaction.account_id);
            legByObservation.set(ref, {
                alias: item.alias_code,
                generation: item.generation,
                principal: item.owner_scope,
                account_type: account?.type,
                observation_ref: ref,
                transaction
            });
        }
    }
    const currentSource = legByObservation.get(review.observation_ref);
    const currentPair = legByObservation.get(review.pair_observation_ref);
    if (!currentSource || !currentPair) {
        throw new Error('open_finance_transfer_proposal_source_unavailable');
    }
    const involvedAliases = [...new Set([currentSource.alias, currentPair.alias])];
    const involvedItems = items.filter(item => involvedAliases.includes(item.alias_code));
    const lifecycle = classifyOpenFinanceLifecycle({
        items: involvedItems,
        observedAt: new Date().toISOString(),
        secret
    });
    const users = await (dependencies.getActiveUsers || getActiveUsers)();
    const resolveScope = dependencies.getFinancialScopeUserIds || getFinancialScopeUserIds;
    const userIds = await Promise.resolve(resolveScope(userId));
    const internalSource = await (dependencies.readOpenFinanceInternalSource ||
        readOpenFinanceInternalSource)({
        users,
        userIds,
        aliases: involvedAliases,
        dependencies: dependencies.internalSourceDependencies || {}
    });
    if (!internalSource.available) {
        throw new Error('open_finance_transfer_proposal_internal_source_unavailable');
    }
    const reconciled = (dependencies.reconcileOpenFinanceRuntimeCandidates ||
        reconcileOpenFinanceRuntimeCandidates)({
        items: involvedItems,
        candidates: [review.observation_ref, review.pair_observation_ref].map(
            observation_ref => ({ observation_ref, correlation_state: 'new_event' })
        ),
        internalTransactions: internalSource.transactions,
        scopeCoverage: internalSource.scope_coverage,
        secret,
        previewDatabasePath: null
    });
    const pairAnalysis = (dependencies.analyzeOpenFinanceProactiveReviews ||
        analyzeOpenFinanceProactiveReviews)({
        items: involvedItems,
        lifecycleDecisions: lifecycle.decisions,
        reconciliationDecisions: reconciled.decisions,
        secret
    });
    const strongPairReview = pairAnalysis.reviews.find(candidate =>
        candidate.observation_ref === review.observation_ref &&
        candidate.pair_observation_ref === review.pair_observation_ref);
    const proposal = buildReviewedTransferSaveProposal({
        review,
        currentSource,
        currentPair,
        sourceDecision: reconciled.decisions.find(value =>
            value.observation_ref === review.observation_ref),
        pairDecision: reconciled.decisions.find(value =>
            value.observation_ref === review.pair_observation_ref),
        strongPairReview,
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
            throw new Error('open_finance_transfer_proposal_confirmation_not_ready');
        }
    } finally {
        preview.close();
        journal.close();
    }
    const amount = Math.abs(Number(proposal.source.amount_cents)) / 100;
    return {
        handled: true,
        keep_pending: true,
        proposal_ref: proposal.proposal_ref,
        recipient_principal: review.principal,
        reply: [
            'Transfer\u00eancia interna vinculada nas duas pontas. Nenhum lan\u00e7amento foi salvo ainda.',
            `Valor: ${amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
            `Origem: ${proposal.transfer_origin.principal}`,
            `Destino: ${proposal.transfer_destination.principal}`,
            '',
            'Quer continuar para escolher as contas e conferir o salvamento?',
            'Responda *sim*, *n\u00e3o* ou *cancelar*.'
        ].join('\n'),
        financial_writes: 0
    };
}

module.exports = {
    buildReviewedTransferSaveProposal,
    prepareReviewedTransferSaveProposal,
    __test__: { sourceFingerprint, observationRef }
};
