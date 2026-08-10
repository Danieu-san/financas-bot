const crypto = require('node:crypto');
const {
    classifyHistoricalRxInvestmentOperation
} = require('./openFinanceHistoricalRx');

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_proactive_review_secret_required');
    return value;
}

function normalize(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function day(value) {
    const timestamp = Date.parse(String(value || ''));
    return Number.isFinite(timestamp) ? Math.floor(timestamp / 86400000) : null;
}

function observationRef(secret, item, transaction) {
    return crypto.createHmac('sha256', secret)
        .update(`observation:${item.id}:${transaction.account_id}:${transaction.id}`)
        .digest('hex')
        .slice(0, 32);
}

function sharedExplicitReference(left, right) {
    const leftRefs = new Set([
        left.reference_number,
        left.receiver_reference_id
    ].map(value => String(value || '').trim()).filter(Boolean));
    return [right.reference_number, right.receiver_reference_id]
        .map(value => String(value || '').trim())
        .some(value => value && leftRefs.has(value));
}

function merchantText(value) {
    return normalize(value)
        .split(' ')
        .filter(token => token && ![
            'estorno', 'reembolso', 'devolucao', 'cancelamento', 'credito',
            'compra', 'cartao'
        ].includes(token))
        .join(' ');
}

function merchantCompatible(left, right) {
    const a = merchantText(left.description);
    const b = merchantText(right.description);
    if (!a || !b) return false;
    if (a === b || a.includes(b) || b.includes(a)) return true;
    const aTokens = new Set(a.split(' ').filter(token => token.length > 2));
    const bTokens = new Set(b.split(' ').filter(token => token.length > 2));
    if (!aTokens.size || !bTokens.size) return false;
    const shared = [...aTokens].filter(token => bTokens.has(token)).length;
    return shared / Math.min(aTokens.size, bTokens.size) >= 0.5;
}

function isReserveSemantic(transaction) {
    if (classifyHistoricalRxInvestmentOperation(transaction.operation_type)) return true;
    return /\b(caixinha|reserva|aplicacao|resgate|investimento)\b/.test(
        normalize(transaction.description)
    );
}

function reserveReview(source) {
    const provider = classifyHistoricalRxInvestmentOperation(source.transaction.operation_type);
    const descriptionSignal = /\b(caixinha|reserva|aplicacao|resgate|investimento)\b/.test(
        normalize(source.transaction.description)
    );
    if (!provider && !descriptionSignal) return null;
    const amount = Number(source.transaction.amount_cents);
    const directionCompatible = provider && (
        (provider.semantic === 'reserve_application' && amount < 0) ||
        (['reserve_redemption', 'investment_income'].includes(provider.semantic) && amount > 0)
    );
    return {
        observation_ref: source.observation_ref,
        source_alias: source.alias,
        generation: source.generation,
        classification: source.lifecycle?.classification || 'uncertain',
        review_kind: 'reserve',
        review_status: provider
            ? provider.semantic === 'investment_related_unknown'
                ? 'provider_semantic_classification_required'
                : directionCompatible
                    ? 'provider_semantic_confirmation_required'
                    : 'provider_semantic_conflict_review_required'
            : 'reserve_semantic_classification_required',
        ...(directionCompatible ? { suggested_decision: provider.semantic } : {}),
        ...(provider ? { provider_operation_type: provider.operationType } : {}),
        save_eligible: false,
        financial_writes: 0
    };
}

function isPostedNewBank(source) {
    return source.account?.type === 'BANK' &&
        source.lifecycle?.provider_state === 'POSTED' &&
        source.reconciliation?.status === 'new' &&
        Number(source.transaction.amount_cents) !== 0;
}

function isAmountDateCounterpart(left, right) {
    if (left.observation_ref === right.observation_ref ||
        left.transaction.account_id === right.transaction.account_id ||
        Math.sign(Number(left.transaction.amount_cents)) ===
            Math.sign(Number(right.transaction.amount_cents)) ||
        Math.abs(Number(left.transaction.amount_cents)) !==
            Math.abs(Number(right.transaction.amount_cents))) return false;
    const leftDay = day(left.transaction.date);
    const rightDay = day(right.transaction.date);
    return leftDay !== null && rightDay !== null && Math.abs(leftDay - rightDay) <= 2;
}

function analyzeOpenFinanceProactiveReviews({
    items = [],
    lifecycleDecisions = [],
    reconciliationDecisions = [],
    pendingPurchaseObservationRefs = [],
    secret
} = {}) {
    const hmacSecret = requireSecret(secret);
    if (!Array.isArray(pendingPurchaseObservationRefs) || pendingPurchaseObservationRefs.some(value =>
        !/^[a-f0-9]{32}$/.test(String(value || '')))) {
        throw new Error('invalid_open_finance_pending_purchase_observation_refs');
    }
    const pendingPurchases = new Set(pendingPurchaseObservationRefs);
    const lifecycleByObservation = new Map(
        lifecycleDecisions.map(decision => [decision.observation_ref, decision])
    );
    const reconciliationByObservation = new Map(
        reconciliationDecisions.map(decision => [decision.observation_ref, decision])
    );
    const sources = [];
    for (const item of items) {
        const accounts = new Map((item.accounts || []).map(account => [account.id, account]));
        for (const transaction of item.transactions || []) {
            const observation = observationRef(hmacSecret, item, transaction);
            sources.push({
                observation_ref: observation,
                alias: String(item.alias_code || '').trim().toLowerCase(),
                generation: Number(item.generation) || 1,
                item,
                account: accounts.get(transaction.account_id),
                transaction,
                lifecycle: lifecycleByObservation.get(observation),
                reconciliation: reconciliationByObservation.get(observation)
            });
        }
    }

    const reviews = [];
    const annotations = [];
    const suppressed = new Set();
    const handled = new Set();
    let transferPairs = 0;
    let transferReviews = 0;
    let reserveReviews = 0;
    const bankSources = sources.filter(isPostedNewBank);

    for (const source of bankSources) {
        const review = reserveReview(source);
        if (!review) continue;
        reviews.push(review);
        handled.add(source.observation_ref);
        reserveReviews += 1;
        annotations.push({
            observation_ref: source.observation_ref,
            status: 'reserve_review_required',
            financial_writes: 0
        });
    }

    const transferCandidates = bankSources.filter(source => !handled.has(source.observation_ref));
    const strongCounterparts = new Map(transferCandidates.map(source => [
        source.observation_ref,
        transferCandidates.filter(candidate =>
            isAmountDateCounterpart(source, candidate) &&
            sharedExplicitReference(source.transaction, candidate.transaction)
        )
    ]));
    const paired = new Set();
    for (const source of [...transferCandidates]
        .sort((left, right) => left.observation_ref.localeCompare(right.observation_ref))) {
        if (paired.has(source.observation_ref)) continue;
        const matches = strongCounterparts.get(source.observation_ref) || [];
        if (matches.length !== 1) continue;
        const counterpart = matches[0];
        const reverse = strongCounterparts.get(counterpart.observation_ref) || [];
        if (reverse.length !== 1 || reverse[0].observation_ref !== source.observation_ref) continue;
        const pairSources = [source, counterpart]
            .sort((left, right) => left.observation_ref.localeCompare(right.observation_ref));
        const anchor = pairSources[0];
        const pair = pairSources[1];
        reviews.push({
            observation_ref: anchor.observation_ref,
            source_alias: anchor.alias,
            generation: anchor.generation,
            classification: 'transfer',
            review_kind: 'transfer',
            review_status: 'strong_pair_confirmation_required',
            pair_observation_ref: pair.observation_ref,
            pair_basis: 'shared_provider_reference',
            save_eligible: false,
            financial_writes: 0
        });
        for (const leg of pairSources) {
            paired.add(leg.observation_ref);
            handled.add(leg.observation_ref);
            annotations.push({
                observation_ref: leg.observation_ref,
                status: 'paired_internal_transfer_review_required',
                counterpart_observation_ref: pairSources.find(candidate =>
                    candidate.observation_ref !== leg.observation_ref).observation_ref,
                financial_writes: 0
            });
        }
        transferPairs += 1;
        transferReviews += 1;
    }

    for (const source of transferCandidates) {
        if (handled.has(source.observation_ref)) continue;
        const amountDateCandidates = transferCandidates.filter(candidate =>
            !handled.has(candidate.observation_ref) &&
            isAmountDateCounterpart(source, candidate)
        );
        const descriptionOnlyTransfer = source.lifecycle?.classification === 'transfer';
        const possibleCreditTransfer = source.lifecycle?.classification === 'income_candidate' &&
            amountDateCandidates.length > 0;
        if (!descriptionOnlyTransfer && !possibleCreditTransfer) continue;
        reviews.push({
            observation_ref: source.observation_ref,
            source_alias: source.alias,
            generation: source.generation,
            classification: 'transfer_candidate',
            review_kind: 'transfer',
            review_status: 'unpaired_classification_required',
            candidate_observation_refs: amountDateCandidates
                .map(candidate => candidate.observation_ref).sort(),
            save_eligible: false,
            financial_writes: 0
        });
        handled.add(source.observation_ref);
        transferReviews += 1;
        annotations.push({
            observation_ref: source.observation_ref,
            status: 'unpaired_transfer_review_required',
            financial_writes: 0
        });
    }

    const eligible = sources.filter(source => !handled.has(source.observation_ref) &&
        ['income_candidate', 'refund'].includes(source.lifecycle?.classification) &&
        source.lifecycle?.provider_state === 'POSTED' &&
        source.reconciliation?.status === 'new'
    );

    for (const source of eligible) {
        if (source.lifecycle.classification === 'income_candidate') {
            reviews.push({
                observation_ref: source.observation_ref,
                source_alias: source.alias,
                generation: source.generation,
                classification: 'income_candidate',
                review_kind: 'income',
                review_status: 'classification_required',
                save_eligible: false,
                financial_writes: 0
            });
            continue;
        }

        const refundDay = day(source.transaction.date);
        const candidates = sources.filter(candidate => {
            if (!['purchase', 'purchase_candidate'].includes(candidate.lifecycle?.classification)) {
                return false;
            }
            if (candidate.alias !== source.alias ||
                candidate.transaction.account_id !== source.transaction.account_id ||
                candidate.lifecycle?.provider_state !== 'POSTED' ||
                Math.sign(Number(candidate.transaction.amount_cents)) ===
                    Math.sign(Number(source.transaction.amount_cents)) ||
                Math.abs(Number(candidate.transaction.amount_cents)) !==
                    Math.abs(Number(source.transaction.amount_cents))) {
                return false;
            }
            const purchaseDay = day(candidate.transaction.date);
            if (refundDay === null || purchaseDay === null || purchaseDay > refundDay ||
                refundDay - purchaseDay > 120) return false;
            return sharedExplicitReference(source.transaction, candidate.transaction) ||
                merchantCompatible(source.transaction, candidate.transaction);
        });

        if (candidates.length === 1) {
            const purchase = candidates[0];
            if (purchase.reconciliation?.status === 'new' ||
                pendingPurchases.has(purchase.observation_ref)) {
                suppressed.add(purchase.observation_ref);
                annotations.push({
                    observation_ref: purchase.observation_ref,
                    status: 'paired_unsaved_purchase_neutralized',
                    counterpart_observation_ref: source.observation_ref,
                    financial_writes: 0
                }, {
                    observation_ref: source.observation_ref,
                    status: 'paired_refund_neutralized',
                    counterpart_observation_ref: purchase.observation_ref,
                    financial_writes: 0
                });
                continue;
            }
            reviews.push({
                observation_ref: source.observation_ref,
                source_alias: source.alias,
                generation: source.generation,
                classification: 'refund',
                review_kind: 'refund_link',
                review_status: 'pair_confirmation_required',
                pair_observation_ref: purchase.observation_ref,
                pair_basis: sharedExplicitReference(source.transaction, purchase.transaction)
                    ? 'shared_provider_reference'
                    : 'unique_amount_date_merchant',
                save_eligible: false,
                financial_writes: 0
            });
            continue;
        }

        reviews.push({
            observation_ref: source.observation_ref,
            source_alias: source.alias,
            generation: source.generation,
            classification: 'refund',
            review_kind: 'refund_link',
            review_status: 'link_required',
            candidate_observation_refs: candidates.map(candidate => candidate.observation_ref).sort(),
            save_eligible: false,
            financial_writes: 0
        });
    }

    reviews.sort((left, right) => left.observation_ref.localeCompare(right.observation_ref));
    annotations.sort((left, right) => left.observation_ref.localeCompare(right.observation_ref));
    return {
        reviews,
        annotations,
        suppressed_purchase_observation_refs: [...suppressed].sort(),
        summary: {
            reviewable: reviews.length,
            suppressed_purchases: suppressed.size,
            deferred: 0,
            transfer_pairs: transferPairs,
            transfer_reviews: transferReviews,
            reserve_reviews: reserveReviews
        },
        financial_writes: 0
    };
}

module.exports = {
    analyzeOpenFinanceProactiveReviews,
    __test__: { merchantCompatible, isReserveSemantic }
};
