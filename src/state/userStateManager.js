// src/state/userStateManager.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

const STATE_FILE = path.resolve(process.cwd(), 'state_store.json');
const TEMP_FILE = path.resolve(process.cwd(), 'state_store.tmp');
const REPLAY_FILE = path.resolve(process.cwd(), 'state_store.replay.json');
const REPLAY_TEMP_FILE = path.resolve(process.cwd(), 'state_store.replay.tmp');
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

let initializationFailureCode = '';
let MAX_RETENTION_SECONDS = DEFAULT_MAX_RETENTION_SECONDS;
try {
    MAX_RETENTION_SECONDS = resolveMaxRetentionSeconds();
} catch {
    initializationFailureCode = 'state_store_retention_invalid';
}

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
    if (initializationFailureCode) throw new Error(initializationFailureCode);
}

function assertStateStoreReady() {
    if (initializationFailureCode) throw new Error(initializationFailureCode);
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

function decodeCanonicalBase64(value, expectedLength = null) {
    if (typeof value !== 'string' || !value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
        throw new Error('state_store_envelope_invalid');
    }
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value
        || (expectedLength !== null && decoded.length !== expectedLength)) {
        throw new Error('state_store_envelope_invalid');
    }
    return decoded;
}

function decryptStateSnapshot(protectedPayload) {
    const envelope = JSON.parse(String(protectedPayload || ''));
    const envelopeKeys = envelope && typeof envelope === 'object'
        ? Object.keys(envelope).sort()
        : [];
    const expectedKeys = ['algorithm', 'ciphertext', 'format', 'iv', 'tag', 'version'];
    if (!envelope || Array.isArray(envelope)
        || JSON.stringify(envelopeKeys) !== JSON.stringify(expectedKeys)
        || envelope.format !== STATE_SNAPSHOT_FORMAT
        || envelope.version !== STATE_SNAPSHOT_VERSION
        || envelope.algorithm !== 'aes-256-gcm'
        || typeof envelope.iv !== 'string'
        || typeof envelope.tag !== 'string'
        || typeof envelope.ciphertext !== 'string') {
        throw new Error('state_store_envelope_invalid');
    }

    const iv = decodeCanonicalBase64(envelope.iv, 12);
    const tag = decodeCanonicalBase64(envelope.tag, 16);
    const ciphertext = decodeCanonicalBase64(envelope.ciphertext);
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        decodeEncryptionKey(),
        iv,
        { authTagLength: 16 }
    );
    decipher.setAAD(STATE_SNAPSHOT_AAD);
    decipher.setAuthTag(tag);
    return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
    ]).toString('utf8');
}

function snapshotDigest(protectedPayload) {
    return crypto.createHash('sha256').update(String(protectedPayload)).digest('hex');
}

function replayJournalMac(revokedDigests) {
    return crypto
        .createHmac('sha256', decodeEncryptionKey())
        .update(JSON.stringify(revokedDigests))
        .digest('hex');
}

function readReplayJournal() {
    if (!fs.existsSync(REPLAY_FILE)) return [];
    fs.chmodSync(REPLAY_FILE, STATE_FILE_MODE);
    const parsed = JSON.parse(fs.readFileSync(REPLAY_FILE, 'utf8'));
    const journalKeys = parsed && typeof parsed === 'object'
        ? Object.keys(parsed).sort()
        : [];
    const expectedKeys = ['format', 'mac', 'revoked', 'version'];
    if (!parsed || Array.isArray(parsed)
        || JSON.stringify(journalKeys) !== JSON.stringify(expectedKeys)
        || parsed.format !== 'financasbot-state-replay'
        || parsed.version !== 1
        || !Array.isArray(parsed.revoked)
        || parsed.revoked.some(item => !/^[a-f0-9]{64}$/.test(item))
        || new Set(parsed.revoked).size !== parsed.revoked.length
        || !/^[a-f0-9]{64}$/.test(parsed.mac)
        || parsed.mac !== replayJournalMac(parsed.revoked)) {
        throw new Error('state_store_replay_journal_invalid');
    }
    return parsed.revoked;
}

function syncStateDirectory() {
    if (process.platform === 'win32') return;
    const directoryFd = fs.openSync(path.dirname(STATE_FILE), 'r');
    try {
        fs.fsyncSync(directoryFd);
    } finally {
        fs.closeSync(directoryFd);
    }
}

function writeDurablePrivateTemp(target, payload) {
    fs.rmSync(target, { force: true });
    fs.writeFileSync(target, payload, {
        encoding: 'utf8',
        mode: STATE_FILE_MODE,
        flag: 'wx'
    });
    fs.chmodSync(target, STATE_FILE_MODE);
    const fileDescriptor = fs.openSync(target, 'r+');
    try {
        fs.fsyncSync(fileDescriptor);
    } finally {
        fs.closeSync(fileDescriptor);
    }
}

function prepareReplayRevocation(protectedPayload) {
    if (!protectedPayload) return null;
    const digest = snapshotDigest(protectedPayload);
    const revoked = readReplayJournal();
    if (revoked.includes(digest)) return null;
    const next = [...revoked, digest];
    return {
        previousExists: fs.existsSync(REPLAY_FILE),
        previousPayload: fs.existsSync(REPLAY_FILE)
            ? fs.readFileSync(REPLAY_FILE, 'utf8')
            : '',
        nextPayload: JSON.stringify({
            format: 'financasbot-state-replay',
            version: 1,
            revoked: next,
            mac: replayJournalMac(next)
        }, null, 2)
    };
}

function commitReplayRevocation(change) {
    if (!change) return;
    writeDurablePrivateTemp(REPLAY_TEMP_FILE, change.nextPayload);
    fs.renameSync(REPLAY_TEMP_FILE, REPLAY_FILE);
    syncStateDirectory();
}

function rollbackReplayRevocation(change) {
    if (!change) return;
    if (!change.previousExists) {
        fs.rmSync(REPLAY_FILE, { force: true });
        syncStateDirectory();
        return;
    }
    writeDurablePrivateTemp(REPLAY_TEMP_FILE, change.previousPayload);
    fs.renameSync(REPLAY_TEMP_FILE, REPLAY_FILE);
    syncStateDirectory();
}

function persistProtectedSnapshot(payload, previousProtectedPayload) {
    writeDurablePrivateTemp(TEMP_FILE, payload);
    const replayChange = prepareReplayRevocation(previousProtectedPayload);
    let replayCommitted = false;
    let statePromoted = false;
    try {
        if (replayChange) {
            commitReplayRevocation(replayChange);
            replayCommitted = true;
        }
        fs.renameSync(TEMP_FILE, STATE_FILE);
        statePromoted = true;
        syncStateDirectory();
    } catch (error) {
        if (replayCommitted && !statePromoted) {
            try {
                rollbackReplayRevocation(replayChange);
            } catch {
                // Leaving the prior snapshot revoked is fail-closed after rollback failure.
            }
        }
        throw error;
    }
}

function deserializeState(raw) {
    const parsed = JSON.parse(String(raw || ''));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('state_store_payload_invalid');
    }

    const now = Date.now();
    const retentionLimit = now + MAX_RETENTION_SECONDS * 1000;
    const restored = new Map();
    let normalized = false;
    for (const [userId, wrapper] of Object.entries(parsed)) {
        if (!userId || !wrapper || Array.isArray(wrapper) || typeof wrapper !== 'object'
            || !Object.hasOwn(wrapper, 'data')) {
            throw new Error('state_store_entry_invalid');
        }
        const persistedExpiry = Number(wrapper.expiresAt);
        if (Number.isFinite(persistedExpiry) && persistedExpiry <= now) {
            normalized = true;
            continue;
        }
        const boundedExpiry = Number.isFinite(persistedExpiry)
            ? Math.min(persistedExpiry, retentionLimit)
            : retentionLimit;
        if (!Number.isFinite(persistedExpiry) || boundedExpiry !== persistedExpiry) {
            normalized = true;
        }
        restored.set(userId, {
            data: wrapper.data,
            expiresAt: boundedExpiry
        });
    }
    return { restored, normalized };
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
        if (readReplayJournal().includes(snapshotDigest(protectedPayload))) {
            throw new Error('state_store_snapshot_replayed');
        }
        const { restored, normalized } = deserializeState(decryptStateSnapshot(protectedPayload));
        replaceStateMap(restored);
        dirty = normalized;
        if (normalized) flushStateToDisk();
    } catch (error) {
        logger.error('[state-store] file_restore_failed code=state_store_restore_failed');
        throw new Error('state_store_restore_failed');
    }
}

function loadStateFromJsonString(raw) {
    if (!raw) return;
    const { restored, normalized } = deserializeState(raw);
    replaceStateMap(restored);
    if (normalized) markDirty();
}

function serializeState({ sanitize = true } = {}) {
    cleanupExpired();
    const obj = {};
    for (const [key, value] of stateMap.entries()) {
        obj[key] = sanitize ? sanitizeStateForPersistence(value) : value;
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
    let previousProtectedPayload = '';
    try {
        const payload = encryptStateSnapshot(serializeState({ sanitize: false }));
        if (fs.existsSync(STATE_FILE)) {
            previousProtectedPayload = fs.readFileSync(STATE_FILE, 'utf8');
        }
        persistProtectedSnapshot(payload, previousProtectedPayload);
        dirty = false;
    } catch (error) {
        try {
            fs.rmSync(TEMP_FILE, { force: true });
            fs.rmSync(REPLAY_TEMP_FILE, { force: true });
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
    assertStateStoreReady();
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
    assertStateStoreReady();
    const requestedTtl = Number(ttlSeconds);
    const retentionSeconds = Number.isFinite(requestedTtl) && requestedTtl > 0
        ? Math.min(requestedTtl, MAX_RETENTION_SECONDS)
        : MAX_RETENTION_SECONDS;
    const expiresAt = Date.now() + retentionSeconds * 1000;
    stateMap.set(userId, { data: state, expiresAt });
    markDirty();
}

function deleteState(userId) {
    assertStateStoreReady();
    if (stateMap.delete(userId)) {
        markDirty();
    }
}

function findStateEntry(predicate) {
    assertStateStoreReady();
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
    assertStateStoreReady();
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
    try {
        loadStateFromDisk();
    } catch {
        initializationFailureCode = 'state_store_restore_failed';
    }
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
        getStateFilePaths: () => ({
            stateFile: STATE_FILE,
            tempFile: TEMP_FILE,
            replayFile: REPLAY_FILE,
            replayTempFile: REPLAY_TEMP_FILE
        }),
        getStateFileMode: () => STATE_FILE_MODE,
        getMaxRetentionSeconds: () => MAX_RETENTION_SECONDS,
        isDirty: () => dirty
    }
};
