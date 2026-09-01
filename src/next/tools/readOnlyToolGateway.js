const {
    callerArgIsIdentity,
    containsForbiddenModelKey,
    modelFieldIsForbidden
} = require('../contracts/modelDataBoundary');
const TOOL_NAME = /^[a-z][a-z0-9_.-]{0,95}$/;

function normalizeCatalog(catalog = []) {
    if (!Array.isArray(catalog)) throw new Error('invalid_tool_catalog');
    const normalized = new Map();
    for (const entry of catalog) {
        const name = String(entry?.name || '').trim();
        if (!TOOL_NAME.test(name) || normalized.has(name)) throw new Error('invalid_tool_catalog');
        if (entry?.mode !== 'read_only') throw new Error('write_capability_forbidden');
        const allowedArgs = Array.isArray(entry.allowedArgs) ? [...entry.allowedArgs] : [];
        if (allowedArgs.some(callerArgIsIdentity)) {
            throw new Error('caller_identity_arg_forbidden');
        }
        if (allowedArgs.some(modelFieldIsForbidden)) {
            throw new Error('model_boundary_arg_forbidden');
        }
        const allowedResultFields = Array.isArray(entry.allowedResultFields)
            ? [...entry.allowedResultFields]
            : [];
        if (allowedResultFields.length === 0) throw new Error('missing_result_field_allowlist');
        normalized.set(name, Object.freeze({
            name,
            mode: 'read_only',
            allowedArgs: Object.freeze(allowedArgs),
            allowedResultFields: Object.freeze(allowedResultFields)
        }));
    }
    return normalized;
}

function selectArgs(args, allowedArgs) {
    const source = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    return Object.fromEntries(
        allowedArgs
            .filter(key => Object.hasOwn(source, key))
            .map(key => [key, source[key]])
    );
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
        const args = selectArgs(request.args, definition.allowedArgs);
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
