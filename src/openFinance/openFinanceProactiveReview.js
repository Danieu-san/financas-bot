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
    const eligible = sources.filter(source =>
        ['income_candidate', 'refund'].includes(source.lifecycle?.classification) &&
        source.lifecycle?.provider_state === 'POSTED' &&
        source.reconciliation?.status === 'new'
    );

    for (const source of eligible) {
        if (source.lifecycle.classification === 'income_candidate') {
            if (isReserveSemantic(source.transaction)) {
                annotations.push({
                    observation_ref: source.observation_ref,
                    status: 'reserve_semantics_deferred',
                    financial_writes: 0
                });
                continue;
            }
            const sourceDay = day(source.transaction.date);
            const oppositeBankLeg = sources.find(candidate =>
                candidate.observation_ref !== source.observation_ref &&
                source.account?.type === 'BANK' && candidate.account?.type === 'BANK' &&
                candidate.transaction.account_id !== source.transaction.account_id &&
                Number(candidate.transaction.amount_cents) < 0 &&
                Math.abs(Number(candidate.transaction.amount_cents)) ===
                    Math.abs(Number(source.transaction.amount_cents)) &&
                sourceDay !== null && day(candidate.transaction.date) !== null &&
                Math.abs(sourceDay - day(candidate.transaction.date)) <= 2
            );
            if (oppositeBankLeg) {
                annotations.push({
                    observation_ref: source.observation_ref,
                    status: 'possible_internal_transfer_deferred',
                    counterpart_observation_ref: oppositeBankLeg.observation_ref,
                    financial_writes: 0
                });
                continue;
            }
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
            deferred: annotations.filter(annotation =>
                annotation.status.endsWith('_deferred')).length
        },
        financial_writes: 0
    };
}

module.exports = {
    analyzeOpenFinanceProactiveReviews,
    __test__: { merchantCompatible, isReserveSemantic }
};
