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
const STATE_FILE_MODE = 0o600;
const STATE_SNAPSHOT_FORMAT = 'financasbot-state';
const STATE_SNAPSHOT_VERSION = 1;
const STATE_SNAPSHOT_AAD = Buffer.from(`${STATE_SNAPSHOT_FORMAT}:v${STATE_SNAPSHOT_VERSION}`, 'utf8');
const DEFAULT_MAX_RETENTION_SECONDS = 24 * 60 * 60;
const ABSOLUTE_MAX_RETENTION_SECONDS = 30 * 24 * 60 * 60;

function resolveMaxRetentionSeconds() {
    const configured = process.env.STATE_STORE_MAX_RETENTION_SECONDS;
    if (configured === undefined || configured === '') return DEFAULT_MAX_RETENTION_SECONDS;
    const parsed = Number(configured);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > ABSOLUTE_MAX_RETENTION_SECONDS) {
        throw new Error('state_store_retention_invalid');
    }
    return parsed;
}

const MAX_RETENTION_SECONDS = resolveMaxRetentionSeconds();

const stateMap = new Map();
let dirty = false;
let storeMode = 'file';
let redisClient = null;
let redisReady = false;

function markDirty() {
    dirty = true;
}

function decodeEncryptionKey() {
    const raw = String(process.env.STATE_STORE_ENCRYPTION_KEY || '').trim();
    if (!raw) throw new Error('state_store_encryption_key_required');

    const candidates = [];
    if (/^[a-f0-9]{64}$/i.test(raw)) {
        candidates.push(Buffer.from(raw, 'hex'));
    }
    candidates.push(Buffer.from(raw, 'base64'));
    const key = candidates.find(candidate => candidate.length === 32);
    if (!key) throw new Error('state_store_encryption_key_invalid');
    return key;
}

function assertStateStoreConfiguration() {
    if (STATE_STORE_DRIVER === 'file') decodeEncryptionKey();
}

function encryptStateSnapshot(clearPayload) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', decodeEncryptionKey(), iv);
    cipher.setAAD(STATE_SNAPSHOT_AAD);
    const ciphertext = Buffer.concat([
        cipher.update(String(clearPayload), 'utf8'),
        cipher.final()
    ]);
    return JSON.stringify({
        format: STATE_SNAPSHOT_FORMAT,
        version: STATE_SNAPSHOT_VERSION,
        algorithm: 'aes-256-gcm',
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64')
    }, null, 2);
}

function decryptStateSnapshot(protectedPayload) {
    const envelope = JSON.parse(String(protectedPayload || ''));
    if (!envelope || Array.isArray(envelope)
        || envelope.format !== STATE_SNAPSHOT_FORMAT
        || envelope.version !== STATE_SNAPSHOT_VERSION
        || envelope.algorithm !== 'aes-256-gcm'
        || typeof envelope.iv !== 'string'
        || typeof envelope.tag !== 'string'
        || typeof envelope.ciphertext !== 'string') {
        throw new Error('state_store_envelope_invalid');
    }

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        decodeEncryptionKey(),
        Buffer.from(envelope.iv, 'base64')
    );
    decipher.setAAD(STATE_SNAPSHOT_AAD);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final()
    ]).toString('utf8');
}

function deserializeState(raw) {
    const parsed = JSON.parse(String(raw || ''));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('state_store_payload_invalid');
    }

    const now = Date.now();
    const retentionLimit = now + MAX_RETENTION_SECONDS * 1000;
    const restored = new Map();
    for (const [userId, wrapper] of Object.entries(parsed)) {
        if (!userId || !wrapper || Array.isArray(wrapper) || typeof wrapper !== 'object'
            || !Object.hasOwn(wrapper, 'data')) {
            throw new Error('state_store_entry_invalid');
        }
        const persistedExpiry = Number(wrapper.expiresAt);
        if (Number.isFinite(persistedExpiry) && persistedExpiry <= now) continue;
        restored.set(userId, {
            data: wrapper.data,
            expiresAt: Number.isFinite(persistedExpiry)
                ? Math.min(persistedExpiry, retentionLimit)
                : retentionLimit
        });
    }
    return restored;
}

function replaceStateMap(restored) {
    stateMap.clear();
    for (const [userId, wrapper] of restored.entries()) {
        stateMap.set(userId, wrapper);
    }
}

function loadStateFromDisk() {
    if (!fs.existsSync(STATE_FILE)) return;
    try {
        fs.chmodSync(STATE_FILE, STATE_FILE_MODE);
        const protectedPayload = fs.readFileSync(STATE_FILE, 'utf8');
        const restored = deserializeState(decryptStateSnapshot(protectedPayload));
        replaceStateMap(restored);
    } catch (error) {
        logger.error('[state-store] file_restore_failed code=state_store_restore_failed');
        throw new Error('state_store_restore_failed');
    }
}

function loadStateFromJsonString(raw) {
    if (!raw) return;
    replaceStateMap(deserializeState(raw));
}

function serializeState() {
    cleanupExpired();
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
        const payload = encryptStateSnapshot(serializeState());
        fs.rmSync(TEMP_FILE, { force: true });
        fs.writeFileSync(TEMP_FILE, payload, {
            encoding: 'utf8',
            mode: STATE_FILE_MODE,
            flag: 'wx'
        });
        fs.chmodSync(TEMP_FILE, STATE_FILE_MODE);
        fs.renameSync(TEMP_FILE, STATE_FILE);
        dirty = false;
    } catch (error) {
        try {
            fs.rmSync(TEMP_FILE, { force: true });
        } catch {
            // The generic error below remains the only externally visible failure.
        }
        logger.error('[state-store] file_persist_failed code=state_store_persist_failed');
        throw new Error('state_store_persist_failed');
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
    const requestedTtl = Number(ttlSeconds);
    const retentionSeconds = Number.isFinite(requestedTtl) && requestedTtl > 0
        ? Math.min(requestedTtl, MAX_RETENTION_SECONDS)
        : MAX_RETENTION_SECONDS;
    const expiresAt = Date.now() + retentionSeconds * 1000;
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
    assertStateStoreConfiguration,
    getStoreMode: () => storeMode,
    __test__: {
        cleanupExpired,
        flushStateToDisk,
        serializeState,
        replaceStateFromJsonForTests: (raw) => {
            loadStateFromJsonString(raw);
            dirty = false;
        },
        loadStateFromDiskForTests: loadStateFromDisk,
        getStateFilePaths: () => ({ stateFile: STATE_FILE, tempFile: TEMP_FILE }),
        getStateFileMode: () => STATE_FILE_MODE,
        getMaxRetentionSeconds: () => MAX_RETENTION_SECONDS,
        isDirty: () => dirty
    }
};
