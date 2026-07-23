// src/state/userStateManager.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

const STATE_FILE = path.resolve(process.cwd(), 'state_store.json');
const TEMP_FILE = path.resolve(process.cwd(), 'state_store.tmp');
const FLUSH_INTERVAL_MS = 60 * 1000;
const STATE_STORE_DRIVER = String(process.env.STATE_STORE_DRIVER || 'file').toLowerCase();
const REDIS_STATE_KEY = process.env.REDIS_STATE_KEY || 'financasbot:user_state';

const stateMap = new Map();
let dirty = false;
let storeMode = 'file';
let redisClient = null;
let redisReady = false;

function markDirty() {
    dirty = true;
}

function loadStateFromDisk() {
    try {
        if (!fs.existsSync(STATE_FILE)) return;
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        if (!raw) return;

        const parsed = JSON.parse(raw);
        for (const [userId, value] of Object.entries(parsed)) {
            stateMap.set(userId, value);
        }
        cleanupExpired();
    } catch (error) {
        logger.warn(`[state-store] file_load_failed ${logger.safeError(error)}`);
    }
}

function loadStateFromJsonString(raw) {
    if (!raw) return;
    const parsed = JSON.parse(raw);
    for (const [userId, value] of Object.entries(parsed)) {
        stateMap.set(userId, value);
    }
    cleanupExpired();
}

function serializeState() {
    const obj = {};
    for (const [key, value] of stateMap.entries()) {
        obj[key] = sanitizeStateForPersistence(value);
    }
    return JSON.stringify(obj, null, 2);
}

const REDACT_STATE_KEYS = new Set([
    'originalmessage',
    'messagebody',
    'rawmessage',
    'body',
    'text',
    'transcribedtext',
    'audiotranscript',
    'descricao',
    'description',
    'observacoes',
    'observations',
    'note',
    'notes',
    'titulo',
    'title'
]);

function hashStateContent(value) {
    return crypto
        .createHash('sha256')
        .update(String(value || ''))
        .digest('hex')
        .slice(0, 16);
}

function sanitizeStateForPersistence(value) {
    if (Array.isArray(value)) {
        return value.map(item => sanitizeStateForPersistence(item));
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const sanitized = {};
    for (const [key, item] of Object.entries(value)) {
        const normalizedKey = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (REDACT_STATE_KEYS.has(normalizedKey) && typeof item === 'string' && item.trim()) {
            sanitized[key] = `[REDACTED_CONTENT:${hashStateContent(item)}]`;
            continue;
        }
        sanitized[key] = sanitizeStateForPersistence(item);
    }
    return sanitized;
}

function flushStateToDisk() {
    if (!dirty) return;
    try {
        const payload = serializeState();
        fs.writeFileSync(TEMP_FILE, payload, 'utf8');
        fs.renameSync(TEMP_FILE, STATE_FILE);
        dirty = false;
    } catch (error) {
        logger.error(`[state-store] file_persist_failed ${logger.safeError(error)}`);
    }
}

async function tryInitRedis() {
    if (STATE_STORE_DRIVER !== 'redis') {
        return;
    }

    try {
        // Dependencia opcional: bot continua funcionando sem Redis instalado.
        // eslint-disable-next-line global-require
        const { createClient } = require('redis');
        redisClient = createClient({
            url: process.env.REDIS_URL
        });

        redisClient.on('error', (error) => {
            logger.error(`[state-store] redis_error ${logger.safeError(error)}`);
            redisReady = false;
            storeMode = 'file';
        });

        await redisClient.connect();
        const payload = await redisClient.get(REDIS_STATE_KEY);
        if (payload) {
            loadStateFromJsonString(payload);
            logger.info('State store carregado do Redis com sucesso.');
        } else {
            logger.info('State store Redis sem snapshot previo. Iniciando vazio.');
        }
        redisReady = true;
        storeMode = 'redis';
    } catch (error) {
        logger.warn(`[state-store] redis_unavailable_file_fallback ${logger.safeError(error)}`);
        redisReady = false;
        storeMode = 'file';
        loadStateFromDisk();
    }
}

async function flushStateToRedis() {
    if (!dirty || !redisReady || !redisClient) return;
    try {
        const payload = serializeState();
        await redisClient.set(REDIS_STATE_KEY, payload);
        dirty = false;
    } catch (error) {
        logger.error(`[state-store] redis_persist_failed ${logger.safeError(error)}`);
    }
}

function cleanupExpired() {
    const now = Date.now();
    let removed = 0;
    for (const [userId, wrapper] of stateMap.entries()) {
        if (wrapper?.expiresAt && wrapper.expiresAt <= now) {
            stateMap.delete(userId);
            removed += 1;
        }
    }
    if (removed > 0) markDirty();
}

function getState(userId) {
    const wrapper = stateMap.get(userId);
    if (!wrapper) return undefined;
    if (wrapper.expiresAt && wrapper.expiresAt <= Date.now()) {
        stateMap.delete(userId);
        markDirty();
        return undefined;
    }
    return wrapper.data;
}

function setState(userId, state, ttlSeconds = null) {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    stateMap.set(userId, { data: state, expiresAt });
    markDirty();
}

function deleteState(userId) {
    if (stateMap.delete(userId)) {
        markDirty();
    }
}

function findStateEntry(predicate) {
    cleanupExpired();
    for (const [key, wrapper] of stateMap.entries()) {
        const data = wrapper?.data;
        if (predicate(key, data)) {
            return { key, data };
        }
    }
    return null;
}

function closeStateStore() {
    cleanupExpired();
    if (storeMode === 'redis' && redisReady) {
        void flushStateToRedis().finally(async () => {
            try {
                if (redisClient) {
                    await redisClient.quit();
                }
            } catch (error) {
                logger.error(`[state-store] redis_close_failed ${logger.safeError(error)}`);
            }
        });
        return;
    }
    flushStateToDisk();
}

void tryInitRedis();
if (storeMode === 'file' && stateMap.size === 0) {
    loadStateFromDisk();
}

const interval = setInterval(async () => {
    cleanupExpired();
    if (storeMode === 'redis' && redisReady) {
        await flushStateToRedis();
        return;
    }
    flushStateToDisk();
}, FLUSH_INTERVAL_MS);
interval.unref();

process.on('SIGINT', closeStateStore);
process.on('SIGTERM', closeStateStore);

module.exports = {
    getState,
    setState,
    deleteState,
    clearState: deleteState,
    findStateEntry,
    closeStateStore,
    getStoreMode: () => storeMode,
    __test__: {
        cleanupExpired,
        flushStateToDisk,
        serializeState,
        replaceStateFromJsonForTests: (raw) => {
            stateMap.clear();
            dirty = false;
            loadStateFromJsonString(raw);
        },
        getStateFilePaths: () => ({ stateFile: STATE_FILE, tempFile: TEMP_FILE }),
        isDirty: () => dirty
    }
};
