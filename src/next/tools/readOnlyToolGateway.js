const {
    callerArgIsIdentity,
    containsForbiddenModelKey,
    modelFieldIsForbidden
} = require('../contracts/modelDataBoundary');
const TOOL_NAME = /^[a-z][a-z0-9_.-]{0,95}$/;
const ARG_NAME = /^[A-Za-z][A-Za-z0-9_]{0,95}$/;
const ARG_TYPES = new Set(['string', 'finite_number', 'boolean', 'string_array']);

function normalizeArgSchema(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('invalid_tool_arg_schema');
    }
    const normalized = {};
    for (const [key, type] of Object.entries(value)) {
        if (!ARG_NAME.test(key) || callerArgIsIdentity(key)) {
            throw new Error('caller_identity_arg_forbidden');
        }
        if (modelFieldIsForbidden(key)) throw new Error('model_boundary_arg_forbidden');
        if (!ARG_TYPES.has(type)) throw new Error('invalid_tool_arg_schema');
        normalized[key] = type;
    }
    return Object.freeze(normalized);
}

function normalizeCatalog(catalog = []) {
    if (!Array.isArray(catalog)) throw new Error('invalid_tool_catalog');
    const normalized = new Map();
    for (const entry of catalog) {
        const name = String(entry?.name || '').trim();
        if (!TOOL_NAME.test(name) || normalized.has(name)) throw new Error('invalid_tool_catalog');
        if (entry?.mode !== 'read_only') throw new Error('write_capability_forbidden');
        const args = normalizeArgSchema(entry.args || {});
        const allowedResultFields = Array.isArray(entry.allowedResultFields)
            ? [...entry.allowedResultFields]
            : [];
        if (allowedResultFields.length === 0) throw new Error('missing_result_field_allowlist');
        normalized.set(name, Object.freeze({
            name,
            mode: 'read_only',
            args,
            allowedResultFields: Object.freeze(allowedResultFields)
        }));
    }
    return normalized;
}

function argMatchesType(value, type) {
    if (type === 'string') return typeof value === 'string';
    if (type === 'finite_number') return typeof value === 'number' && Number.isFinite(value);
    if (type === 'boolean') return typeof value === 'boolean';
    if (type === 'string_array') {
        return Array.isArray(value) && value.every(item => typeof item === 'string');
    }
    return false;
}

function selectArgs(rawArgs, schema) {
    if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
        return { ok: false, reason: 'tool_args_schema_violation' };
    }
    if (containsForbiddenModelKey(rawArgs)) {
        return { ok: false, reason: 'tool_args_boundary_violation' };
    }
    if (Object.keys(rawArgs).some(key => !Object.hasOwn(schema, key))) {
        return { ok: false, reason: 'tool_args_schema_violation' };
    }
    for (const [key, value] of Object.entries(rawArgs)) {
        if (!argMatchesType(value, schema[key])) {
            return { ok: false, reason: 'tool_args_schema_violation' };
        }
    }
    return { ok: true, args: Object.fromEntries(Object.entries(rawArgs)) };
}

function createReadOnlyToolGateway({ catalog = [], adapters = {} } = {}) {
    const definitions = normalizeCatalog(catalog);
    const adapterMap = adapters && typeof adapters === 'object' ? { ...adapters } : {};

    async function execute({ request = {}, trustedContext = {}, budget = null } = {}) {
        const tool = String(request?.tool || '').trim();
        const definition = definitions.get(tool);
        if (!definition) return { ok: false, reason: 'tool_not_allowed', coverage: 'unavailable' };

        const familyId = String(trustedContext?.familyId || '').trim();
        const actorId = String(trustedContext?.actorId || '').trim();
        if (!familyId || !actorId) {
            return { ok: false, reason: 'missing_authorized_scope', coverage: 'unavailable' };
        }
        const adapter = adapterMap[tool];
        if (typeof adapter !== 'function') {
            return { ok: false, reason: 'tool_adapter_unavailable', coverage: 'unavailable' };
        }

        if (!budget || typeof budget.reserve !== 'function') {
            return { ok: false, reason: 'budget_missing', coverage: 'unavailable', tool };
        }
        const selected = selectArgs(request.args || {}, definition.args);
        if (!selected.ok) {
            return { ok: false, reason: selected.reason, coverage: 'unavailable', tool };
        }
        const args = selected.args;
        const reservation = budget.reserve({ tool, args });
        if (!reservation?.ok) {
            return {
                ok: false,
                reason: String(reservation?.reason || 'BUDGET_EXHAUSTED'),
                coverage: 'unavailable',
                tool
            };
        }

        try {
            const result = await adapter({
                args,
                authorizedContext: Object.freeze({ familyId, actorId })
            });
            if (!result || typeof result !== 'object') {
                return { ok: false, reason: 'invalid_tool_result', coverage: 'unavailable' };
            }
            if (
                Object.keys(result).some(key => !definition.allowedResultFields.includes(key)) ||
                containsForbiddenModelKey(result)
            ) {
                return { ok: false, reason: 'tool_result_schema_violation', coverage: 'unavailable', tool };
            }
            return { ...result, tool };
        } catch (_) {
            return { ok: false, reason: 'tool_execution_failed', coverage: 'unavailable', tool };
        }
    }

    return Object.freeze({
        execute,
        listCapabilities: () => Array.from(definitions.values()).map(entry => ({ ...entry }))
    });
}

module.exports = {
    createReadOnlyToolGateway
};
