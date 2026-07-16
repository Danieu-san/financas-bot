const crypto = require('node:crypto');

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_lifecycle_secret_required');
    return value;
}

function normalized(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function day(value) {
    const timestamp = Date.parse(String(value || ''));
    return Number.isFinite(timestamp) ? Math.floor(timestamp / 86400000) : null;
}

function includesAny(text, words) { return words.some(word => text.includes(word)); }

function initialClassification(transaction, account, observedAt) {
    const description = normalized(transaction.description);
    const amount = Number(transaction.amount_cents);
    const pending = transaction.status === 'PENDING';
    const futureInstallment = pending && transaction.installment_number && transaction.bill_forecast_month &&
        String(transaction.bill_forecast_month).slice(0, 7) > String(observedAt).slice(0, 7);
    if (futureInstallment) return { classification: 'future_installment', provider_state: 'PENDING', rule: 'future_bill_installment' };
    if (includesAny(description, ['tarifa', 'juros', 'encargo', 'multa', 'iof'])) {
        return { classification: 'fee_interest', provider_state: transaction.status, rule: 'fee_interest_keyword' };
    }
    if (account.type === 'CREDIT') {
        if (amount > 0) return { classification: 'purchase', provider_state: transaction.status, rule: 'credit_positive_charge' };
        if (includesAny(description, ['estorno', 'reembolso', 'credito', 'cancelamento'])) {
            return { classification: 'refund', provider_state: transaction.status, rule: 'credit_negative_refund' };
        }
        return { classification: 'bill_payment', provider_state: transaction.status, rule: 'credit_negative_payment_or_credit' };
    }
    const transfer = includesAny(description, ['pix', 'ted', 'doc', 'transferencia', 'transfer']);
    const billPayment = includesAny(description, ['fatura', 'cartao', 'pagamento de cartao']);
    const refund = includesAny(description, ['estorno', 'reembolso', 'devolucao']);
    if (billPayment && amount < 0) return { classification: 'bill_payment', provider_state: transaction.status, rule: 'bank_bill_payment_keyword' };
    if (transfer) return { classification: 'transfer', provider_state: transaction.status, rule: 'bank_transfer_keyword' };
    if (refund && amount > 0) return { classification: 'refund', provider_state: transaction.status, rule: 'bank_refund_keyword' };
    if (amount < 0) return { classification: 'purchase_candidate', provider_state: transaction.status, rule: 'bank_debit_candidate' };
    if (amount > 0) return { classification: 'income_candidate', provider_state: transaction.status, rule: 'bank_credit_candidate' };
    return { classification: 'uncertain', provider_state: transaction.status, rule: 'zero_or_invalid_amount' };
}

function classifyOpenFinanceLifecycle({ items = [], observedAt = new Date().toISOString(), secret } = {}) {
    const hmacSecret = requireSecret(secret);
    const ref = (kind, value) => crypto.createHmac('sha256', hmacSecret).update(`${kind}:${String(value || '')}`).digest('hex').slice(0, 32);
    const decisions = [];
    for (const item of items) {
        const accounts = new Map((item.accounts || []).map(account => [account.id, account]));
        for (const transaction of item.transactions || []) {
            const account = accounts.get(transaction.account_id);
            if (!account) throw new Error('lifecycle_account_unavailable');
            const classified = initialClassification(transaction, account, observedAt);
            decisions.push({
                observation_ref: ref('observation', `${item.id}:${transaction.account_id}:${transaction.id}`),
                alias_ref: ref('alias', item.alias_code),
                account_ref: ref('account', transaction.account_id),
                account_type: account.type,
                ...classified,
                lifecycle_milestone: transaction.status === 'PENDING' ? 'first_pending' : 'first_posted',
                pair_ref: null,
                alert_eligible: false,
                write_eligible: false
            });
        }
    }

    const privateRows = [];
    for (const item of items) {
        const accounts = new Map((item.accounts || []).map(account => [account.id, account]));
        for (const transaction of item.transactions || []) {
            privateRows.push({
                observation_ref: ref('observation', `${item.id}:${transaction.account_id}:${transaction.id}`),
                transaction,
                account: accounts.get(transaction.account_id)
            });
        }
    }
    const decisionByRef = new Map(decisions.map(decision => [decision.observation_ref, decision]));
    const used = new Set();
    for (let i = 0; i < privateRows.length; i += 1) {
        if (used.has(i)) continue;
        const left = privateRows[i];
        const leftDecision = decisionByRef.get(left.observation_ref);
        if (!['transfer', 'bill_payment'].includes(leftDecision.classification)) continue;
        for (let j = i + 1; j < privateRows.length; j += 1) {
            if (used.has(j)) continue;
            const right = privateRows[j];
            const rightDecision = decisionByRef.get(right.observation_ref);
            const potentialBillPair = left.account.type !== right.account.type &&
                leftDecision.classification === 'bill_payment' && rightDecision.classification === 'bill_payment';
            const potentialTransferPair = left.account.type === 'BANK' && right.account.type === 'BANK' &&
                leftDecision.classification === 'transfer' && rightDecision.classification === 'transfer';
            if (!potentialBillPair && !potentialTransferPair) continue;
            if (Math.abs(Number(left.transaction.amount_cents)) !== Math.abs(Number(right.transaction.amount_cents))) continue;
            if (potentialTransferPair && Math.sign(Number(left.transaction.amount_cents)) === Math.sign(Number(right.transaction.amount_cents))) continue;
            const leftDay = day(left.transaction.date);
            const rightDay = day(right.transaction.date);
            if (leftDay === null || rightDay === null || Math.abs(leftDay - rightDay) > 2) continue;
            const pairType = potentialBillPair ? 'bill_payment' : 'transfer';
            const pairRef = ref('pair', [left.observation_ref, right.observation_ref].sort().join(':'));
            for (const decision of [leftDecision, rightDecision]) {
                decision.classification = pairType;
                decision.rule = pairType === 'bill_payment' ? 'paired_bank_and_credit_legs' : 'paired_internal_transfer_legs';
                decision.pair_ref = pairRef;
            }
            used.add(i); used.add(j); break;
        }
    }

    const summary = decisions.reduce((acc, decision) => {
        acc[decision.classification] = (acc[decision.classification] || 0) + 1;
        return acc;
    }, {});
    return { decisions, summary, investments_excluded: items.reduce((sum, item) => sum + (item.investments || []).length, 0), alert_candidates: 0, financial_writes: 0 };
}

module.exports = { classifyOpenFinanceLifecycle, __test__: { initialClassification, normalized } };
