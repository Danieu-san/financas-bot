const crypto = require('node:crypto');

const SAFE_EXECUTE_OPERATIONS = new Set([
    'expense.create',
    'income.create',
    'transfer.create'
]);

const ALLOWLISTED_OPERATIONS = new Set([
    ...SAFE_EXECUTE_OPERATIONS,
    'batch.create',
    'import.confirm',
    'delete.confirm',
    'correction.update',
    'goal.create',
    'goal.deposit',
    'goal.withdraw',
    'debt.create',
    'debt.payment',
    'debt.pay',
    'bill.create',
    'bill.pay',
    'invoice.pay',
    'reminder.create'
]);

const SENSITIVE_CONFIRM_OPERATIONS = new Set([
    'batch.create',
    'import.confirm',
    'delete.confirm',
    'correction.update',
    'goal.create',
    'goal.deposit',
    'goal.withdraw',
    'debt.create',
    'debt.payment',
    'debt.pay',
    'bill.create',
    'bill.pay',
    'invoice.pay',
    'reminder.create'
]);

const CRITICAL_FIELDS_BY_OPERATION = {
    'expense.create': ['amount', 'scope', 'movementType', 'payment'],
    'income.create': ['amount', 'scope', 'movementType', 'receipt'],
    'transfer.create': ['amount', 'scope', 'movementType', 'transferType'],
    'batch.create': ['scope', 'movementType'],
    'import.confirm': ['scope', 'movementType'],
    'delete.confirm': ['scope', 'target'],
    'correction.update': ['scope', 'target'],
    'goal.create': ['amount', 'scope', 'target'],
    'goal.deposit': ['amount', 'scope', 'target'],
    'goal.withdraw': ['amount', 'scope', 'target'],
    'debt.create': ['amount', 'scope', 'target'],
    'debt.payment': ['amount', 'scope', 'target'],
    'debt.pay': ['amount', 'scope', 'target'],
    'bill.create': ['amount', 'scope', 'target'],
    'bill.pay': ['amount', 'scope', 'target', 'payment'],
    'invoice.pay': ['amount', 'scope', 'target', 'payment', 'movementType'],
    'reminder.create': ['scope', 'target']
};

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function hashValue(value) {
    return crypto
        .createHash('sha256')
        .update(String(value || ''))
        .digest('hex')
        .slice(0, 16);
}

function sanitizeTelemetryLabel(value, fallback = '') {
    const normalized = normalizeText(value)
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_:-]/g, '')
        .slice(0, 120);
    return normalized || fallback;
}

function normalizePaymentReply(value) {
    const text = normalizeText(value);
    if (!text) return null;
    if (/^(p|px|pix|pics)$/.test(text) || /\b(pix|px|pics)\b/.test(text)) return 'PIX';
    if (/^(c|cred)$/.test(text) || /\b(credito|credit|cartao de credito|cartao credito)\b/.test(text)) return 'Crédito';
    if (/^(d|deb)$/.test(text) || /\b(debito|debit|cartao de debito|cartao debito)\b/.test(text)) return 'Débito';
    if (/^(din)$/.test(text) || /\b(dinheiro|cash|especie|vivo)\b/.test(text)) return 'Dinheiro';
    if (/\b(conta corrente|corrente|cc)\b/.test(text)) return 'Conta Corrente';
    if (/\b(poupanca|poupança)\b/.test(text)) return 'Poupança';
    return null;
}

function normalizeTransferType(value, { familyMemberAliases = [] } = {}) {
    const text = normalizeText(value);
    if (!text) return null;
    const canonical = text.replace(/\s+/g, '_');
    if (['reserve_applied', 'reserve_redeemed', 'invoice_payment', 'own_transfer', 'family_transfer'].includes(canonical)) {
        return canonical;
    }
    const hasAuthorizedMemberAlias = familyMemberAliases
        .map(normalizeText)
        .filter(Boolean)
        .some(alias => text.includes(alias));
    if (/\b(resgate|resgatei|retirei|tirei|saquei)\b/.test(text)) return 'reserve_redeemed';
    if (/\b(guardei|apliquei|aplicacao|investi|reservei|caixinha|reserva)\b/.test(text)) return 'reserve_applied';
    if (hasAuthorizedMemberAlias) return 'family_transfer';
    if (/\b(fatura|cartao)\b/.test(text)) return 'invoice_payment';
    if (/\b(propria|mesma titularidade|minha conta)\b/.test(text)) return 'own_transfer';
    if (/\b(familia|membro)\b/.test(text)) return 'family_transfer';
    return null;
}

function formatCurrencyBR(value) {
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function wrapField(field = {}) {
    if (field && typeof field === 'object' && Object.prototype.hasOwnProperty.call(field, 'value')) {
        return {
            value: field.value,
            source: field.source || 'inferred',
            assurance: field.assurance || 'missing',
            evidence: field.evidence || ''
        };
    }
    return {
        value: field,
        source: 'inferred',
        assurance: field === undefined || field === null || field === '' ? 'missing' : 'supported',
        evidence: ''
    };
}

function buildInterpretationCandidate(input = {}) {
    const fields = {};
    for (const [key, value] of Object.entries(input.fields || {})) {
        fields[key] = wrapField(value);
    }
    return {
        operation: input.operation || '',
        fields,
        conflicts: Array.isArray(input.conflicts) ? input.conflicts.slice() : [],
        missingFields: Array.isArray(input.missingFields) ? input.missingFields.slice() : [],
        itemCount: Number(input.itemCount || 1)
    };
}

function canonicalizeInterpretation(candidate = {}) {
    const next = buildInterpretationCandidate(candidate);
    for (const [key, field] of Object.entries(next.fields)) {
        if (['payment', 'receipt'].includes(key)) {
            field.value = normalizePaymentReply(field.value);
            field.assurance = field.value ? field.assurance : 'missing';
        }
        if (key === 'transferType') {
            field.value = normalizeTransferType(field.value);
            field.assurance = field.value ? field.assurance : 'missing';
        }
        if (key === 'scope') {
            const scope = normalizeText(field.value);
            field.value = ['personal', 'family', 'member', 'all_users'].includes(scope) ? scope : field.value;
        }
        if (key === 'movementType') {
            const type = normalizeText(field.value);
            if (/\b(gasto|saida|expense)\b/.test(type)) field.value = 'expense';
            if (/\b(entrada|income|receita)\b/.test(type)) field.value = 'income';
            if (/\b(transfer|reserva|caixinha|fatura)\b/.test(type)) field.value = 'transfer';
        }
    }

    const criticalFields = requiredCriticalFields(next);
    next.missingFields = Array.from(new Set([
        ...next.missingFields,
        ...criticalFields.filter((fieldName) => {
            const field = next.fields[fieldName];
            return !field || field.value === undefined || field.value === null || field.value === '' || field.assurance === 'missing';
        })
    ]));

    return next;
}

function requiredCriticalFields(candidate = {}) {
    const fields = new Set(CRITICAL_FIELDS_BY_OPERATION[candidate.operation] || ['scope']);
    const payment = candidate.fields?.payment?.value;
    if (candidate.operation === 'expense.create' && payment === 'Crédito') {
        fields.add('card');
        fields.add('installments');
    }
    return Array.from(fields);
}

function isDeterministicCriticalField(field = {}) {
    return ['deterministic', 'user_state'].includes(field.source) && field.assurance === 'verified';
}

function decideInterpretationRisk(rawCandidate = {}) {
    const candidate = canonicalizeInterpretation(rawCandidate);
    const reasons = [];
    const clarificationFields = new Set(candidate.missingFields || []);

    if (!ALLOWLISTED_OPERATIONS.has(candidate.operation)) {
        reasons.push('operation_not_allowlisted');
    }

    const scope = candidate.fields?.scope?.value;
    if (scope === 'all_users' || scope === 'admin' || scope === 'unknown') {
        reasons.push('unauthorized_scope');
    }

    if (reasons.length) {
        return buildDecision('block', reasons, [], candidate);
    }

    if (candidate.conflicts?.length) {
        reasons.push('field_conflict');
        for (const conflict of candidate.conflicts) {
            if (conflict?.field) clarificationFields.add(conflict.field);
        }
    }

    if (candidate.missingFields?.length) {
        reasons.push('missing_critical_field');
    }

    if (reasons.length) {
        return buildDecision('clarify', reasons, Array.from(clarificationFields), candidate);
    }

    const criticalFields = requiredCriticalFields(candidate);
    const hasLlMCritical = criticalFields.some((fieldName) => {
        const field = candidate.fields?.[fieldName];
        return field && !isDeterministicCriticalField(field);
    });

    if (hasLlMCritical) {
        return buildDecision('confirm', ['critical_field_not_deterministic'], [], candidate);
    }

    if (candidate.itemCount > 1 || SENSITIVE_CONFIRM_OPERATIONS.has(candidate.operation)) {
        return buildDecision('confirm', ['sensitive_or_multi_item_operation'], [], candidate);
    }

    if (!SAFE_EXECUTE_OPERATIONS.has(candidate.operation)) {
        return buildDecision('confirm', ['operation_requires_confirmation'], [], candidate);
    }

    return buildDecision('execute', [], [], candidate);
}

function buildDecision(action, reasons, clarificationFields, candidate) {
    return {
        action,
        reasons,
        clarificationFields,
        preview: buildPreview(candidate)
    };
}

function buildPreview(candidate = {}) {
    const amount = candidate.fields?.amount?.value;
    const payment = candidate.fields?.payment?.value || candidate.fields?.receipt?.value || '';
    const target = candidate.fields?.target?.value || '';
    const parts = [
        candidate.operation || 'operacao',
        amount ? formatCurrencyBR(amount) : '',
        payment,
        target
    ].filter(Boolean);
    return parts.join(' - ');
}

function sanitizeReliabilityTelemetry(input = {}) {
    const candidate = input.candidate || {};
    const evaluationLatencyMs = Number(input.evaluationLatencyMs);
    const additionalGeminiCalls = Number(input.additionalGeminiCalls);
    return {
        ts: new Date().toISOString(),
        userHash: hashValue(input.userId || input.senderId || ''),
        senderHash: hashValue(input.senderId || ''),
        messageHash: hashValue(input.message || ''),
        operation: candidate.operation || '',
        action: input.decision?.action || '',
        reasons: Array.isArray(input.decision?.reasons) ? input.decision.reasons.slice(0, 8) : [],
        currentFlowOutcome: sanitizeTelemetryLabel(input.currentFlowOutcome || ''),
        divergenceSeverity: sanitizeTelemetryLabel(input.divergenceSeverity || input.divergence?.severity || 'none', 'none'),
        divergenceReason: sanitizeTelemetryLabel(input.divergenceReason || input.divergence?.reason || ''),
        evaluationLatencyMs: Number.isFinite(evaluationLatencyMs)
            ? Math.max(0, Math.min(60000, Math.round(evaluationLatencyMs)))
            : null,
        additionalGeminiCalls: Number.isInteger(additionalGeminiCalls)
            ? Math.max(0, Math.min(100, additionalGeminiCalls))
            : null,
        itemCount: Number(candidate.itemCount || 1),
        fields: Object.fromEntries(Object.entries(candidate.fields || {}).map(([key, field]) => [
            key,
            {
                source: field?.source || '',
                assurance: field?.assurance || '',
                valueHash: field?.value === undefined || field?.value === null ? '' : hashValue(`${key}:${field.value}`)
            }
        ]))
    };
}

module.exports = {
    ALLOWLISTED_OPERATIONS,
    SAFE_EXECUTE_OPERATIONS,
    buildInterpretationCandidate,
    canonicalizeInterpretation,
    decideInterpretationRisk,
    normalizePaymentReply,
    normalizeTransferType,
    sanitizeReliabilityTelemetry,
    __test__: {
        hashValue,
        requiredCriticalFields,
        sanitizeTelemetryLabel
    }
};
