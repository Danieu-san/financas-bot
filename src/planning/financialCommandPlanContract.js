const SCHEMA_VERSION = 'financial-command-plan-v1';

const ALLOWED_OPERATIONS = new Set([
    'expense.create',
    'income.create',
    'bill.pay',
    'debt.pay',
    'invoice.pay',
    'transfer.create',
    'financial.query',
    'goal.create',
    'debt.create',
    'reminder.create',
    'delete.request',
    'help',
    'unknown'
]);

const WRITE_OPERATIONS = new Set([
    'expense.create',
    'income.create',
    'bill.pay',
    'debt.pay',
    'invoice.pay',
    'transfer.create',
    'goal.create',
    'debt.create',
    'reminder.create',
    'delete.request'
]);

const ALLOWED_CONTEXT_TOOLS = new Set([
    'match_recurring_bill',
    'match_debt',
    'match_card_invoice',
    'resolve_category',
    'list_user_accounts'
]);

const ALLOWED_ENTITY_FIELDS = new Set([
    'description',
    'amount',
    'date',
    'paymentMethod',
    'category',
    'subcategory',
    'account',
    'destinationAccount',
    'recipient',
    'creditor',
    'card',
    'installments',
    'recurrence',
    'goal',
    'reminderDate'
]);

const ALLOWED_EVIDENCE_VALUES = new Set([
    'explicit',
    'deterministic',
    'inferred',
    'missing'
]);

const DANGEROUS_KEYS = new Set([
    '__proto__',
    'constructor',
    'prototype'
]);

const FORBIDDEN_FIELD_NAMES = new Set([
    'userid',
    'owneruserid',
    'householdid',
    'familyid',
    'tenantid',
    'whatsappid',
    'phone',
    'phonenumber',
    'spreadsheetid',
    'sheetid',
    'rawrows',
    'allrows',
    'allusers',
    'admin',
    'token',
    'accesstoken',
    'refreshtoken',
    'oauth',
    'credentials',
    'secret',
    'apikey',
    'prompt',
    'systemprompt',
    'instructions'
]);

const MAX_TEXT_LENGTH = 500;
const MAX_CONTEXT_REQUESTS = 5;
const MAX_MISSING_FIELDS = 20;

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function normalizeFieldName(fieldName) {
    return String(fieldName).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function normalizeText(value) {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim();
    if (!normalized) {
        return undefined;
    }

    return normalized.slice(0, MAX_TEXT_LENGTH);
}

function findUnsafeFields(value, errors, visited = new WeakSet()) {
    if (value === null || typeof value !== 'object') {
        return;
    }

    if (visited.has(value)) {
        errors.push('cyclic_plan_not_allowed');
        return;
    }
    visited.add(value);

    if (!Array.isArray(value) && !isPlainObject(value)) {
        errors.push('unsafe_object_prototype');
        return;
    }

    for (const key of Object.keys(value)) {
        if (DANGEROUS_KEYS.has(key)) {
            errors.push(`dangerous_field:${key}`);
        }

        if (FORBIDDEN_FIELD_NAMES.has(normalizeFieldName(key))) {
            errors.push(`forbidden_field:${key}`);
        }

        findUnsafeFields(value[key], errors, visited);
    }
}

function normalizeEntities(entities) {
    if (!isPlainObject(entities)) {
        return {};
    }

    const normalized = {};
    for (const field of ALLOWED_ENTITY_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(entities, field)) {
            continue;
        }

        const value = entities[field];
        if (typeof value === 'string') {
            const text = normalizeText(value);
            if (text !== undefined) {
                normalized[field] = text;
            }
        } else if (typeof value === 'number' && Number.isFinite(value)) {
            normalized[field] = value;
        } else if (typeof value === 'boolean' || value === null) {
            normalized[field] = value;
        }
    }

    return normalized;
}

function normalizeFieldEvidence(fieldEvidence) {
    if (!isPlainObject(fieldEvidence)) {
        return {};
    }

    const normalized = {};
    for (const field of ALLOWED_ENTITY_FIELDS) {
        const evidence = normalizeText(fieldEvidence[field]);
        if (evidence && ALLOWED_EVIDENCE_VALUES.has(evidence)) {
            normalized[field] = evidence;
        }
    }

    return normalized;
}

function normalizeContextRequests(contextRequests) {
    if (!Array.isArray(contextRequests)) {
        return [];
    }

    return contextRequests.slice(0, MAX_CONTEXT_REQUESTS).flatMap(request => {
        if (!isPlainObject(request)) {
            return [];
        }

        const tool = normalizeText(request.tool);
        const query = normalizeText(request.query);
        if (!tool || !query) {
            return [];
        }

        return [{ tool, query }];
    });
}

function normalizeMissingFields(missingFields) {
    if (!Array.isArray(missingFields)) {
        return [];
    }

    return missingFields.slice(0, MAX_MISSING_FIELDS).flatMap(field => {
        const normalized = normalizeText(field);
        return normalized && ALLOWED_ENTITY_FIELDS.has(normalized)
            ? [normalized]
            : [];
    });
}

function normalizeFinancialCommandPlan(rawPlan) {
    const source = isPlainObject(rawPlan) ? rawPlan : {};
    const normalized = {
        schemaVersion: normalizeText(source.schemaVersion),
        operation: normalizeText(source.operation),
        entities: normalizeEntities(source.entities),
        contextRequests: normalizeContextRequests(source.contextRequests),
        missingFields: normalizeMissingFields(source.missingFields),
        requiresConfirmation: source.requiresConfirmation
    };

    const fieldEvidence = normalizeFieldEvidence(source.fieldEvidence);
    if (Object.keys(fieldEvidence).length > 0) {
        normalized.fieldEvidence = fieldEvidence;
    }

    const ordered = {
        schemaVersion: normalized.schemaVersion,
        operation: normalized.operation,
        entities: normalized.entities
    };
    if (normalized.fieldEvidence) {
        ordered.fieldEvidence = normalized.fieldEvidence;
    }
    ordered.contextRequests = normalized.contextRequests;
    ordered.missingFields = normalized.missingFields;
    ordered.requiresConfirmation = normalized.requiresConfirmation;

    return ordered;
}

function validateContextRequests(contextRequests, errors) {
    if (contextRequests === undefined) {
        return;
    }
    if (!Array.isArray(contextRequests)) {
        errors.push('context_requests_must_be_array');
        return;
    }
    if (contextRequests.length > MAX_CONTEXT_REQUESTS) {
        errors.push('context_request_limit_exceeded');
    }

    contextRequests.forEach(request => {
        if (!isPlainObject(request)) {
            errors.push('context_request_invalid');
            return;
        }

        for (const field of Object.keys(request)) {
            if (field !== 'tool' && field !== 'query') {
                errors.push(`context_request_field_not_allowed:${field}`);
            }
        }

        const tool = normalizeText(request.tool);
        if (!tool || !ALLOWED_CONTEXT_TOOLS.has(tool)) {
            errors.push(`context_tool_not_allowed:${tool || 'missing'}`);
        }
        if (!normalizeText(request.query)) {
            errors.push('context_query_required');
        }
    });
}

function validateFinancialCommandPlan(rawPlan) {
    const errors = [];

    if (!isPlainObject(rawPlan)) {
        return {
            ok: false,
            errors: ['plan_must_be_object'],
            normalizedPlan: normalizeFinancialCommandPlan({})
        };
    }

    findUnsafeFields(rawPlan, errors);
    const normalizedPlan = normalizeFinancialCommandPlan(rawPlan);

    if (normalizedPlan.schemaVersion !== SCHEMA_VERSION) {
        errors.push('schema_version_not_supported');
    }
    if (!ALLOWED_OPERATIONS.has(normalizedPlan.operation)) {
        errors.push('operation_not_allowed');
    }
    if (!isPlainObject(rawPlan.entities)) {
        errors.push('entities_must_be_object');
    }

    validateContextRequests(rawPlan.contextRequests, errors);

    if (WRITE_OPERATIONS.has(normalizedPlan.operation)
        && normalizedPlan.requiresConfirmation !== true) {
        errors.push('write_confirmation_required');
    }
    if (typeof normalizedPlan.requiresConfirmation !== 'boolean') {
        errors.push('requires_confirmation_must_be_boolean');
    }

    return {
        ok: errors.length === 0,
        errors: [...new Set(errors)],
        normalizedPlan
    };
}

module.exports = {
    SCHEMA_VERSION,
    ALLOWED_OPERATIONS,
    WRITE_OPERATIONS,
    ALLOWED_CONTEXT_TOOLS,
    normalizeFinancialCommandPlan,
    validateFinancialCommandPlan
};
