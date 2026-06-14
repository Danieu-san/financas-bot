const { normalizeText, parseAmountLocal } = require('../utils/helpers');
const {
    buildInterpretationCandidate,
    canonicalizeInterpretation,
    normalizePaymentReply,
    normalizeTransferType
} = require('./interpretationReliability');

const TARGET_OPERATIONS = new Set([
    'delete.confirm',
    'correction.update',
    'goal.create',
    'goal.deposit',
    'goal.withdraw',
    'debt.create',
    'debt.payment',
    'bill.create',
    'reminder.create'
]);

function field(value, source = 'deterministic', assurance = 'verified', evidence = '') {
    return { value, source, assurance, evidence };
}

function countAmounts(text) {
    return (String(text || '').match(/\b\d+(?:[.,]\d+)?\b/g) || []).length;
}

function extractFirstAmount(text) {
    const raw = String(text || '');
    const numeric = raw.match(/\b\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?\b|\b\d+(?:[.,]\d+)?\b/);
    if (numeric) return parseAmountLocal(numeric[0]);
    return parseAmountLocal(raw);
}

function hasMultipleFinancialItems(text) {
    const normalized = normalizeText(text);
    const verbs = normalized.match(/\b(?:gastei|comprei|paguei|recebi|ganhei|guardei|resgatei|transferi|mandei|enviei)\b/g) || [];
    return countAmounts(normalized) >= 2 && (verbs.length >= 2 || /\be\b/.test(normalized));
}

function detectDeterministicOperation(text) {
    const normalized = normalizeText(text);
    if (!normalized) return '';

    if (/\b(?:importar|importacao|extrato|arquivo csv|arquivo ofx|csv|ofx)\b/.test(normalized)) return 'import.confirm';
    if (/\b(?:apagar|excluir|remover)\b/.test(normalized)) return 'delete.confirm';
    if (/\b(?:corrigir|alterar|mudar|trocar|ajustar)\b/.test(normalized)) return 'correction.update';
    if (/\b(?:me lembre|lembrete|agendar|agenda|compromisso)\b/.test(normalized)) return 'reminder.create';

    if (/\bmeta\b/.test(normalized)) {
        if (/\b(?:retirei|retirar|saquei|subtrair)\b/.test(normalized)) return 'goal.withdraw';
        if (/\b(?:guardei|guardar|aportei|aportar|depositar)\b/.test(normalized)) return 'goal.deposit';
        if (/\b(?:criar|cadastrar|nova)\b/.test(normalized)) return 'goal.create';
    }

    if (/\bdivida\b/.test(normalized)) {
        if (/\b(?:paguei|pagar|quitar|pagamento)\b/.test(normalized)) return 'debt.payment';
        if (/\b(?:criar|cadastrar|nova)\b/.test(normalized)) return 'debt.create';
    }

    if (/\b(?:conta|vencimento)\b/.test(normalized) && /\b(?:cadastrar|adicionar|criar)\b/.test(normalized)) {
        return 'bill.create';
    }

    if (hasMultipleFinancialItems(normalized)) return 'batch.create';

    if (
        /\b(?:transferi|mandei|enviei|guardei|resgatei|apliquei|reservei)\b/.test(normalized)
        || /\b(?:caixinha|reserva|pagamento de fatura|paguei fatura)\b/.test(normalized)
    ) {
        return 'transfer.create';
    }

    if (/\b(?:recebi|ganhei|caiu)\b/.test(normalized)) return 'income.create';
    if (/\b(?:gastei|comprei|paguei)\b/.test(normalized)) return 'expense.create';
    return '';
}

function movementTypeForOperation(operation) {
    if (operation === 'expense.create') return 'expense';
    if (operation === 'income.create') return 'income';
    if (operation === 'transfer.create') return 'transfer';
    if (operation === 'batch.create') return 'batch';
    if (operation === 'import.confirm') return 'import';
    return '';
}

function isHedged(text) {
    return /\b(?:acho|talvez|provavelmente|inferid[ao]|identificad[ao].{0,20}\bia)\b/.test(normalizeText(text));
}

function extractDeterministicInterpretation(message, { defaultScope = 'personal', familyMemberAliases = [] } = {}) {
    const normalized = normalizeText(message);
    const operation = detectDeterministicOperation(normalized);
    const fields = {
        scope: field(defaultScope, 'user_state', 'verified', 'active_user_scope')
    };
    const amount = extractFirstAmount(normalized);
    const movementType = movementTypeForOperation(operation);
    const hedged = isHedged(normalized);

    if (Number.isFinite(amount) && amount > 0) {
        fields.amount = field(amount, 'deterministic', 'verified', 'amount_pattern');
    }
    if (movementType) {
        fields.movementType = field(movementType, 'deterministic', 'verified', 'operation_pattern');
    }

    if (operation === 'expense.create') {
        const payment = normalizePaymentReply(normalized);
        if (payment) {
            fields.payment = field(
                payment,
                hedged ? 'inferred' : 'deterministic',
                hedged ? 'supported' : 'verified',
                'payment_alias'
            );
        }
    }

    if (operation === 'income.create') {
        const receipt = normalizePaymentReply(normalized);
        if (receipt) {
            fields.receipt = field(
                receipt,
                hedged ? 'inferred' : 'deterministic',
                hedged ? 'supported' : 'verified',
                'receipt_alias'
            );
        }
    }

    if (operation === 'transfer.create') {
        const transferType = normalizeTransferType(normalized, { familyMemberAliases });
        if (transferType) {
            fields.transferType = field(
                transferType,
                hedged ? 'inferred' : 'deterministic',
                hedged ? 'supported' : 'verified',
                'transfer_pattern'
            );
        }
    }

    if (TARGET_OPERATIONS.has(operation) && normalized) {
        fields.target = field(normalized, 'deterministic', 'verified', 'explicit_target_text');
    }

    return canonicalizeInterpretation(buildInterpretationCandidate({
        operation,
        fields,
        itemCount: operation === 'batch.create' ? 2 : 1
    }));
}

module.exports = {
    detectDeterministicOperation,
    extractDeterministicInterpretation,
    __test__: {
        extractFirstAmount,
        hasMultipleFinancialItems,
        isHedged
    }
};
