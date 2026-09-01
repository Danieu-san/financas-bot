const { containsForbiddenModelKey } = require('../contracts/modelDataBoundary');

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

const ALLOWED_STATE_FIELDS = new Set([
    'subject', 'period', 'timeBasis', 'filters', 'entities', 'evidenceRefs',
    'queryContext'
]);
const ALLOWED_QUERY_CONTEXT_FIELDS = new Set(['domain', 'operation', 'filters', 'timeBasis']);

function plainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function queryContextIsValid(value) {
    return plainObject(value) &&
        Object.keys(value).every(key => ALLOWED_QUERY_CONTEXT_FIELDS.has(key)) &&
        typeof value.domain === 'string' && Boolean(value.domain) &&
        typeof value.operation === 'string' && Boolean(value.operation) &&
        typeof value.timeBasis === 'string' && Boolean(value.timeBasis) &&
        plainObject(value.filters) &&
        !containsForbiddenModelKey(value.filters);
}

function stateFieldsAreAllowed(value) {
    if (!Object.keys(value).every(key => ALLOWED_STATE_FIELDS.has(key))) return false;
    return Object.entries(value).every(([key, item]) => {
        if (['subject', 'period', 'timeBasis'].includes(key)) return typeof item === 'string';
        if (key === 'filters') return plainObject(item) && !containsForbiddenModelKey(item);
        if (key === 'entities') return Array.isArray(item) && !containsForbiddenModelKey(item);
        if (key === 'evidenceRefs') {
            return Array.isArray(item) && item.every(ref => typeof ref === 'string' && Boolean(ref));
        }
        if (key === 'queryContext') return queryContextIsValid(item);
        return false;
    });
}

function createMemorySessionStore({ now = () => new Date().toISOString() } = {}) {
    const sessions = new Map();

    function create({ sessionId, familyId, actorId, ...initial } = {}) {
        const id = String(sessionId || '').trim();
        const family = String(familyId || '').trim();
        const actor = String(actorId || '').trim();
        if (!id || !family || !actor) throw new Error('invalid_session_identity');
        if (sessions.has(id)) throw new Error('session_already_exists');
        if (!stateFieldsAreAllowed(initial)) throw new Error('invalid_session_state_field');
        const timestamp = String(now());
        const session = {
            ...clone(initial),
            sessionId: id,
            familyId: family,
            actorId: actor,
            sessionVersion: 1,
            createdAt: timestamp,
            updatedAt: timestamp
        };
        sessions.set(id, session);
        return clone(session);
    }

    function read(sessionId) {
        return clone(sessions.get(String(sessionId || '').trim()) || null);
    }

    function compareAndSwap({ sessionId, expectedVersion, patch = {} } = {}) {
        const id = String(sessionId || '').trim();
        const current = sessions.get(id);
        if (!current || current.sessionVersion !== expectedVersion) {
            return { ok: false, reason: 'session_version_conflict' };
        }
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
            return { ok: false, reason: 'invalid_session_patch' };
        }
        const protectedFields = ['sessionId', 'sessionVersion', 'familyId', 'actorId', 'createdAt'];
        if (protectedFields.some(field => Object.hasOwn(patch, field))) {
            return { ok: false, reason: 'protected_session_field' };
        }
        if (!stateFieldsAreAllowed(patch)) {
            return { ok: false, reason: 'invalid_session_patch_field' };
        }
        const next = {
            ...current,
            ...clone(patch),
            sessionVersion: current.sessionVersion + 1,
            updatedAt: String(now())
        };
        sessions.set(id, next);
        return { ok: true, session: clone(next) };
    }

    return Object.freeze({ create, read, compareAndSwap });
}

module.exports = {
    createMemorySessionStore
};
