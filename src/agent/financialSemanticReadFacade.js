const {
    listRecentTransactions,
    runSafeReadonlySqlTool,
    queryFinancialPlanTool,
    getDashboardSnapshotTool,
    explainMetricTool
} = require('./financialAgentTools');

const BLOCKED_EVIDENCE_KEYS = new Set([
    'userid', 'userids', 'user_id', 'owneruserid', 'owner_user_id',
    'personbyuserid', 'person_by_user_id', 'sheetid', 'sheet_id',
    'spreadsheetid', 'spreadsheet_id', 'ownerhash', 'owner_hash',
    'sourceid', 'source_id', 'sourceidhash', 'source_id_hash',
    'sourcerowref', 'source_row_ref', 'sourcerowhash', 'source_row_hash',
    'idempotencykey', 'idempotency_key', 'canonicalledgerdbpath', 'dbpath',
    'token', 'oauth', 'rawrows', 'raw_rows'
]);

const CAPABILITIES = Object.freeze({
    query_financial_plan: Object.freeze({
        capability: 'financial_query',
        allowedArgs: Object.freeze(['plan']),
        defaultSource: 'sqlite_read_model'
    }),
    list_recent_transactions: Object.freeze({
        capability: 'recent_transactions',
        allowedArgs: Object.freeze(['eventTypes', 'limit', 'card']),
        defaultSource: 'scoped_public_read_model'
    }),
    run_safe_readonly_sql: Object.freeze({
        capability: 'readonly_aggregate',
        allowedArgs: Object.freeze(['sql', 'limit']),
        defaultSource: 'scoped_public_read_model'
    }),
    get_dashboard_snapshot: Object.freeze({
        capability: 'dashboard_snapshot',
        allowedArgs: Object.freeze(['month', 'year']),
        defaultSource: 'dashboard_read_model'
    }),
    explain_metric: Object.freeze({
        capability: 'metric_explanation',
        allowedArgs: Object.freeze(['metric', 'month', 'year']),
        defaultSource: 'dashboard_read_model'
    })
});

const DEFAULT_ADAPTERS = Object.freeze({
    query_financial_plan: queryFinancialPlanTool,
    list_recent_transactions: listRecentTransactions,
    run_safe_readonly_sql: runSafeReadonlySqlTool,
    get_dashboard_snapshot: getDashboardSnapshotTool,
    explain_metric: explainMetricTool
});

function normalizeTrustedUserIds(userIds = []) {
    return Array.from(new Set(
        (Array.isArray(userIds) ? userIds : [])
            .map(value => String(value || '').trim())
            .filter(Boolean)
    ));
}

function sanitizeEvidenceValue(value, depth = 0) {
    if (depth > 10 || value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(item => sanitizeEvidenceValue(item, depth + 1));
    if (typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !BLOCKED_EVIDENCE_KEYS.has(String(key || '').toLowerCase()))
            .map(([key, child]) => [key, sanitizeEvidenceValue(child, depth + 1)])
    );
}

function selectModelArgs(args = {}, allowedArgs = []) {
    const safeArgs = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    return Object.fromEntries(
        allowedArgs
            .filter(key => Object.prototype.hasOwnProperty.call(safeArgs, key))
            .map(key => [key, safeArgs[key]])
    );
}

function buildTrustedAdapterInput({ trustedContext = {}, args = {}, allowedArgs = [] } = {}) {
    const userIds = normalizeTrustedUserIds(trustedContext.userIds);
    const ownerCandidate = String(trustedContext.ownerUserId || '').trim();
    const ownerUserId = userIds.includes(ownerCandidate)
        ? ownerCandidate
        : userIds.length === 1
            ? userIds[0]
            : '';
    const trustedPersonMap = trustedContext.personByUserId && typeof trustedContext.personByUserId === 'object'
        ? trustedContext.personByUserId
        : {};
    const personByUserId = Object.fromEntries(
        userIds.map(userId => [userId, String(trustedPersonMap[userId] || 'Usuario')])
    );
    return {
        ...selectModelArgs(args, allowedArgs),
        userIds,
        ownerUserId,
        personByUserId,
        currentDate: String(trustedContext.currentDate || ''),
        canonicalLedgerDbPath: trustedContext.canonicalLedgerDbPath,
        env: trustedContext.env || process.env,
        excludePublicTestMarkers: trustedContext.excludePublicTestMarkers === true
    };
}

function inferItemCount(result = {}, capability = '') {
    if (capability === 'recent_transactions' || capability === 'readonly_aggregate') {
        if (Array.isArray(result.rows)) return result.rows.length;
        if (Number.isFinite(Number(result.rowCount))) return Number(result.rowCount);
        return null;
    }
    if (capability === 'financial_query') {
        if (Array.isArray(result.result?.value)) return result.result.value.length;
        if (Array.isArray(result.result?.value?.items)) return result.result.value.items.length;
        if (Array.isArray(result.result?.details)) return result.result.details.length;
        if (Array.isArray(result.result?.details?.items)) return result.result.details.items.length;
        return null;
    }
    if (capability === 'metric_explanation' && Array.isArray(result.components)) {
        return result.components.length;
    }
    return null;
}

function inferCoverageStatus(result = {}, itemCount = null) {
    if (result.ok !== true) return 'unavailable';
    if (itemCount === 0) return 'empty';
    return 'available';
}

function evidencePayload(result = {}) {
    const { ok, tool, source, fallbackReason, evidence, ...payload } = result || {};
    return sanitizeEvidenceValue(payload);
}

function buildEvidenceEnvelope({ definition, result, scope } = {}) {
    const itemCount = inferItemCount(result, definition.capability);
    const source = String(result?.source || definition.defaultSource);
    const fallbackReason = String(result?.fallbackReason || '').trim();
    const envelope = {
        schemaVersion: 1,
        capability: definition.capability,
        mode: 'read_only',
        provenance: {
            authority: 'server',
            source,
            scope,
            fallback: { used: Boolean(fallbackReason), reason: fallbackReason || null }
        },
        coverage: { status: inferCoverageStatus(result, itemCount), itemCount },
        criteria: sanitizeEvidenceValue(result?.criteria || {}),
        payload: evidencePayload(result)
    };
    if (result?.ok !== true) {
        envelope.failure = {
            reason: String(result?.reason || 'tool_execution_failed'),
            errors: sanitizeEvidenceValue(Array.isArray(result?.errors) ? result.errors : [])
        };
    }
    return envelope;
}

function blockedResult(tool = '', definition = null, reason = 'tool_not_allowed') {
    const safeDefinition = definition || { capability: 'unknown', defaultSource: 'none' };
    const result = { ok: false, tool: String(tool || ''), reason };
    return {
        ...result,
        evidence: buildEvidenceEnvelope({ definition: safeDefinition, result, scope: 'none' })
    };
}

async function executeFinancialSemanticRead({ request = {}, trustedContext = {}, adapters = DEFAULT_ADAPTERS } = {}) {
    const tool = String(request?.tool || '').trim();
    const definition = CAPABILITIES[tool];
    if (!definition) return blockedResult(tool);

    const userIds = normalizeTrustedUserIds(trustedContext.userIds);
    if (userIds.length === 0) return blockedResult(tool, definition, 'missing_authorized_scope');

    const adapter = adapters?.[tool];
    if (typeof adapter !== 'function') return blockedResult(tool, definition, 'tool_adapter_unavailable');

    const input = buildTrustedAdapterInput({
        trustedContext: { ...trustedContext, userIds },
        args: request.args,
        allowedArgs: definition.allowedArgs
    });
    let result;
    try {
        result = await adapter(input);
    } catch (_) {
        result = { ok: false, tool, reason: 'tool_execution_failed' };
    }
    const normalizedResult = result && typeof result === 'object'
        ? { ...result, tool }
        : { ok: false, tool, reason: 'invalid_tool_result' };
    const scope = userIds.length > 1 ? 'family' : 'personal';
    return {
        ...normalizedResult,
        evidence: buildEvidenceEnvelope({ definition, result: normalizedResult, scope })
    };
}

function listFinancialSemanticCapabilities() {
    return Object.entries(CAPABILITIES).map(([tool, definition]) => ({
        tool,
        capability: definition.capability,
        mode: 'read_only',
        acceptsIdentityFromModel: false
    }));
}

module.exports = {
    executeFinancialSemanticRead,
    listFinancialSemanticCapabilities,
    sanitizeFinancialEvidenceValue: sanitizeEvidenceValue,
    __test__: {
        buildTrustedAdapterInput,
        buildEvidenceEnvelope,
        sanitizeEvidenceValue,
        selectModelArgs,
        inferItemCount,
        inferCoverageStatus
    }
};
