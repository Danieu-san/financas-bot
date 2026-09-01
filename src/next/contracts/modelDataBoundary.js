const CALLER_IDENTITY_KEYS = new Set([
    'userid', 'userids', 'familyid', 'householdid', 'tenantid', 'actorid',
    'owneruserid', 'sheetid', 'spreadsheetid', 'scopeid'
]);
const FORBIDDEN_MODEL_KEYS = new Set([
    ...CALLER_IDENTITY_KEYS,
    'sourceid', 'sourcerowref', 'sourcerowhash', 'idempotencykey',
    'canonicalledgerdbpath', 'dbpath', 'token', 'oauth', 'credential',
    'password', 'secret', 'refreshtoken', 'accesstoken', 'clientsecret',
    'rawrows', 'rawdata', 'allusers', 'admin', 'prompt', 'systemprompt',
    'instructions'
]);

function normalizedBoundaryKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function containsForbiddenModelKey(value, seen = new Set()) {
    if (!value || typeof value !== 'object') return false;
    if (seen.has(value)) return true;
    seen.add(value);
    if (Array.isArray(value)) return value.some(child => containsForbiddenModelKey(child, seen));
    return Object.entries(value).some(([key, child]) => (
        FORBIDDEN_MODEL_KEYS.has(normalizedBoundaryKey(key)) ||
        containsForbiddenModelKey(child, seen)
    ));
}

function callerArgIsIdentity(value) {
    return CALLER_IDENTITY_KEYS.has(normalizedBoundaryKey(value));
}

function modelFieldIsForbidden(value) {
    return FORBIDDEN_MODEL_KEYS.has(normalizedBoundaryKey(value));
}

module.exports = {
    callerArgIsIdentity,
    containsForbiddenModelKey,
    modelFieldIsForbidden
};
