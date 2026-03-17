// src/state/userStateManager.js
const fs = require('fs');
const path = require('path');
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
        console.warn('⚠️ Não foi possível carregar state_store.json:', error.message);
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
        obj[key] = value;
    }
    return JSON.stringify(obj, null, 2);
}

function flushStateToDisk() {
    if (!dirty) return;
    try {
        const payload = serializeState();
        fs.writeFileSync(TEMP_FILE, payload, 'utf8');
        fs.renameSync(TEMP_FILE, STATE_FILE);
        dirty = false;
    } catch (error) {
        console.error('❌ Erro ao persistir state_store.json:', error.message);
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
            logger.error(`Redis state store erro: ${error.message}`);
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
        logger.warn(`Redis nao disponivel para state store. Fallback para arquivo local. Motivo: ${error.message}`);
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
        logger.error(`Erro ao persistir state no Redis: ${error.message}`);
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

function closeStateStore() {
    cleanupExpired();
    if (storeMode === 'redis' && redisReady) {
        void flushStateToRedis().finally(async () => {
            try {
                if (redisClient) {
                    await redisClient.quit();
                }
            } catch (error) {
                logger.error(`Erro ao fechar conexao Redis: ${error.message}`);
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
    closeStateStore,
    getStoreMode: () => storeMode
};
