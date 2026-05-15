const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

let Database = null;
try {
    // eslint-disable-next-line global-require
    Database = require('better-sqlite3');
} catch (error) {
    Database = null;
}

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data', 'oauth_tokens.sqlite');
let db = null;
let activeDbPath = '';

function getDbPath() {
    return path.resolve(process.env.OAUTH_TOKEN_DB_PATH || DEFAULT_DB_PATH);
}

function ensureDataDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function ensureDb() {
    if (!Database) {
        throw new Error('better-sqlite3 não está disponível para armazenar tokens OAuth.');
    }

    const dbPath = getDbPath();
    if (db && activeDbPath === dbPath) return db;

    ensureDataDir(dbPath);
    db = new Database(dbPath);
    activeDbPath = dbPath;
    db.pragma('journal_mode = WAL');
    db.exec(`
        CREATE TABLE IF NOT EXISTS oauth_connections (
            user_id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            scopes TEXT NOT NULL,
            encrypted_tokens TEXT NOT NULL,
            google_user_id TEXT,
            google_email TEXT,
            spreadsheet_id TEXT,
            calendar_id TEXT,
            connected_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            revoked_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_oauth_connections_provider ON oauth_connections(provider);
    `);
    return db;
}

function decodeEncryptionKey() {
    const raw = String(process.env.OAUTH_TOKEN_ENCRYPTION_KEY || '').trim();
    if (!raw) {
        throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY é obrigatório para armazenar tokens OAuth.');
    }

    const candidates = [];
    if (/^[a-f0-9]{64}$/i.test(raw)) {
        candidates.push(Buffer.from(raw, 'hex'));
    }
    candidates.push(Buffer.from(raw, 'base64'));

    const key = candidates.find(candidate => candidate.length === 32);
    if (!key) {
        throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY deve ter 32 bytes em base64 ou 64 caracteres hex.');
    }
    return key;
}

function encryptJson(payload) {
    const key = decodeEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const plaintext = Buffer.from(JSON.stringify(payload || {}), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
        'v1',
        iv.toString('base64'),
        tag.toString('base64'),
        ciphertext.toString('base64')
    ].join(':');
}

function decryptJson(encrypted) {
    const key = decodeEncryptionKey();
    const [version, ivB64, tagB64, ciphertextB64] = String(encrypted || '').split(':');
    if (version !== 'v1' || !ivB64 || !tagB64 || !ciphertextB64) {
        throw new Error('Formato de token OAuth criptografado inválido.');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextB64, 'base64')),
        decipher.final()
    ]);
    return JSON.parse(plaintext.toString('utf8'));
}

function serializeScopes(scopes) {
    return JSON.stringify(Array.isArray(scopes) ? scopes : []);
}

function parseScopes(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function mapRow(row, { includeTokens = false } = {}) {
    if (!row) return null;
    const mapped = {
        user_id: row.user_id,
        provider: row.provider,
        scopes: parseScopes(row.scopes),
        google_user_id: row.google_user_id || '',
        google_email: row.google_email || '',
        spreadsheet_id: row.spreadsheet_id || '',
        calendar_id: row.calendar_id || '',
        connected_at: row.connected_at || '',
        updated_at: row.updated_at || '',
        revoked_at: row.revoked_at || ''
    };
    if (includeTokens) {
        mapped.tokens = decryptJson(row.encrypted_tokens);
    }
    return mapped;
}

function saveOAuthConnection(userId, { scopes, tokens, googleAccount = {}, spreadsheetId = '', calendarId = '' } = {}) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) throw new Error('user_id é obrigatório para salvar conexão OAuth.');
    if (!tokens || typeof tokens !== 'object') throw new Error('tokens OAuth são obrigatórios.');

    const database = ensureDb();
    const now = new Date().toISOString();
    const encryptedTokens = encryptJson(tokens);
    database.prepare(`
        INSERT INTO oauth_connections(
            user_id, provider, scopes, encrypted_tokens, google_user_id, google_email,
            spreadsheet_id, calendar_id, connected_at, updated_at, revoked_at
        )
        VALUES(@user_id, 'google', @scopes, @encrypted_tokens, @google_user_id, @google_email,
            @spreadsheet_id, @calendar_id, @connected_at, @updated_at, '')
        ON CONFLICT(user_id) DO UPDATE SET
            provider = excluded.provider,
            scopes = excluded.scopes,
            encrypted_tokens = excluded.encrypted_tokens,
            google_user_id = excluded.google_user_id,
            google_email = excluded.google_email,
            spreadsheet_id = COALESCE(NULLIF(excluded.spreadsheet_id, ''), oauth_connections.spreadsheet_id),
            calendar_id = COALESCE(NULLIF(excluded.calendar_id, ''), oauth_connections.calendar_id),
            updated_at = excluded.updated_at,
            revoked_at = ''
    `).run({
        user_id: safeUserId,
        scopes: serializeScopes(scopes),
        encrypted_tokens: encryptedTokens,
        google_user_id: googleAccount.id || '',
        google_email: googleAccount.email || '',
        spreadsheet_id: spreadsheetId || '',
        calendar_id: calendarId || '',
        connected_at: now,
        updated_at: now
    });

    logger.info(`oauth: conexão Google salva para user_id=${safeUserId}`);
    return getOAuthConnection(safeUserId);
}

function getOAuthConnection(userId, options = {}) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) return null;
    const database = ensureDb();
    const row = database
        .prepare("SELECT * FROM oauth_connections WHERE user_id = ? AND COALESCE(revoked_at, '') = ''")
        .get(safeUserId);
    return mapRow(row, options);
}

function updateOAuthConnectionMetadata(userId, patch = {}) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) throw new Error('user_id é obrigatório para atualizar conexão OAuth.');
    const existing = getOAuthConnection(safeUserId);
    if (!existing) return null;
    const database = ensureDb();
    database.prepare(`
        UPDATE oauth_connections
        SET spreadsheet_id = COALESCE(@spreadsheet_id, spreadsheet_id),
            calendar_id = COALESCE(@calendar_id, calendar_id),
            updated_at = @updated_at
        WHERE user_id = @user_id
    `).run({
        user_id: safeUserId,
        spreadsheet_id: Object.prototype.hasOwnProperty.call(patch, 'spreadsheetId') ? patch.spreadsheetId : null,
        calendar_id: Object.prototype.hasOwnProperty.call(patch, 'calendarId') ? patch.calendarId : null,
        updated_at: new Date().toISOString()
    });
    return getOAuthConnection(safeUserId);
}

module.exports = {
    saveOAuthConnection,
    getOAuthConnection,
    updateOAuthConnectionMetadata,
    __test__: {
        encryptJson,
        decryptJson,
        decodeEncryptionKey
    }
};
