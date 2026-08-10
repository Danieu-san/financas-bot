function normalizedStatus(value) {
    return String(value || '').trim().toUpperCase();
}

function hasUnsupportedInstallments(transaction = {}) {
    return Number(transaction.total_installments) > 1 ||
        Number(transaction.installment_number) > 1;
}

function isCreditPurchaseProviderState({
    classification,
    providerState,
    accountType,
    transaction
} = {}) {
    const state = normalizedStatus(providerState);
    return classification === 'purchase' &&
        String(accountType || '').trim().toUpperCase() === 'CREDIT' &&
        ['PENDING', 'POSTED'].includes(state) &&
        normalizedStatus(transaction?.status) === state &&
        Number(transaction?.amount_cents) > 0;
}

function isReviewableCreditPurchase(input = {}) {
    return isCreditPurchaseProviderState(input) &&
        !hasUnsupportedInstallments(input.transaction);
}

function isMonotonicPurchaseStateTransition(previousState, currentState) {
    const previous = normalizedStatus(previousState);
    const current = normalizedStatus(currentState);
    return previous === current || (previous === 'PENDING' && current === 'POSTED');
}

module.exports = {
    hasUnsupportedInstallments,
    isCreditPurchaseProviderState,
    isReviewableCreditPurchase,
    isMonotonicPurchaseStateTransition
};
