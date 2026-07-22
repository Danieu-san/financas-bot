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
const sqliteRetryBuffer = new Int32Array(new SharedArrayBuffer(4));

function isSqliteBusy(error) {
    return error?.code === 'SQLITE_BUSY' || /database is locked/i.test(String(error?.message || ''));
}

function runWithSqliteBusyRetry(operation, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let delayMs = 10;
    while (true) {
        try {
            return operation();
        } catch (error) {
            const remainingMs = deadline - Date.now();
            if (!isSqliteBusy(error) || remainingMs <= 0) throw error;
            Atomics.wait(sqliteRetryBuffer, 0, 0, Math.min(delayMs, remainingMs));
            delayMs = Math.min(delayMs * 2, 100);
        }
    }
}

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
    const candidate = new Database(dbPath);
    const busyTimeoutMs = boundedInteger(
        process.env.OAUTH_SQLITE_BUSY_TIMEOUT_MS,
        5000,
        100,
        30000
    );
    candidate.pragma(`busy_timeout = ${busyTimeoutMs}`);
    try {
        runWithSqliteBusyRetry(() => {
            candidate.pragma('journal_mode = WAL');
            candidate.exec(`
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
                CREATE TABLE IF NOT EXISTS oauth_revocations (
                    revocation_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    generation INTEGER NOT NULL,
                    encrypted_tokens TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    status TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    last_error_code TEXT,
                    requested_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    next_attempt_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    max_attempts INTEGER NOT NULL DEFAULT 5,
                    lease_id TEXT NOT NULL DEFAULT '',
                    lease_expires_at TEXT NOT NULL DEFAULT '',
                    completed_at TEXT,
                    has_pending_token INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(user_id, generation)
                );
                CREATE TABLE IF NOT EXISTS shared_spreadsheet_members (
                    user_id TEXT PRIMARY KEY,
                    owner_user_id TEXT NOT NULL,
                    spreadsheet_id TEXT NOT NULL,
                    member_google_email TEXT,
                    drive_permission_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    revoked_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_shared_spreadsheet_owner ON shared_spreadsheet_members(owner_user_id);
                CREATE INDEX IF NOT EXISTS idx_shared_spreadsheet_id ON shared_spreadsheet_members(spreadsheet_id);
            `);
            ensureOAuthRevocationSchema(candidate);
            ensureColumn(candidate, 'shared_spreadsheet_members', 'member_google_email', 'TEXT');
            ensureColumn(candidate, 'shared_spreadsheet_members', 'drive_permission_id', 'TEXT');
        }, busyTimeoutMs);
    } catch (error) {
        try { candidate.close(); } catch (closeError) { /* best effort */ }
        throw error;
    }
    db = candidate;
    activeDbPath = dbPath;
    return db;
}

function ensureOAuthRevocationSchema(database) {
    const migrateLegacySchema = database.transaction(() => {
        const columns = database.prepare('PRAGMA table_info(oauth_revocations)').all();
        if (!columns.some(column => column.name === 'revocation_id')) {
            database.exec(`
                DROP INDEX IF EXISTS idx_oauth_revocations_status;
                ALTER TABLE oauth_revocations RENAME TO oauth_revocations_legacy;
                CREATE TABLE oauth_revocations (
                    revocation_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    generation INTEGER NOT NULL,
                    encrypted_tokens TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    status TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    last_error_code TEXT,
                    requested_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    next_attempt_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    max_attempts INTEGER NOT NULL DEFAULT 5,
                    lease_id TEXT NOT NULL DEFAULT '',
                    lease_expires_at TEXT NOT NULL DEFAULT '',
                    completed_at TEXT,
                    has_pending_token INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(user_id, generation)
                );
                INSERT INTO oauth_revocations(
                    revocation_id, user_id, generation, encrypted_tokens, reason, status,
                    attempts, last_error_code, requested_at, updated_at, next_attempt_at,
                    expires_at, max_attempts, lease_id, lease_expires_at,
                    completed_at, has_pending_token
                )
                SELECT
                    lower(hex(randomblob(16))), user_id, 1, encrypted_tokens, reason, status,
                    attempts, last_error_code, requested_at, updated_at, updated_at,
                    strftime('%Y-%m-%dT%H:%M:%fZ', requested_at, '+30 days'),
                    5, '', '', completed_at, has_pending_token
                FROM oauth_revocations_legacy;
                DROP TABLE oauth_revocations_legacy;
            `);
        }
        ensureColumn(database, 'oauth_revocations', 'max_attempts', 'INTEGER NOT NULL DEFAULT 5');
        ensureColumn(database, 'oauth_revocations', 'lease_id', "TEXT NOT NULL DEFAULT ''");
        ensureColumn(database, 'oauth_revocations', 'lease_expires_at', "TEXT NOT NULL DEFAULT ''");
    });
    migrateLegacySchema.immediate();
    database.exec(`
        CREATE INDEX IF NOT EXISTS idx_oauth_revocations_status
            ON oauth_revocations(status);
        CREATE INDEX IF NOT EXISTS idx_oauth_revocations_user_generation
            ON oauth_revocations(user_id, generation DESC);
        CREATE INDEX IF NOT EXISTS idx_oauth_revocations_recovery
            ON oauth_revocations(has_pending_token, next_attempt_at);
    `);
}

function ensureColumn(database, tableName, columnName, definition) {
    const columns = database.prepare(`PRAGMA table_info(${tableName})`).all();
    if (columns.some(column => column.name === columnName)) return;
    database.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
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

function normalizeDate(value) {
    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
    if (Number.isNaN(parsed.getTime())) throw new Error('Data de revogação OAuth inválida.');
    return parsed;
}

function boundedInteger(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(Math.trunc(parsed), max));
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
    const persistConnection = database.transaction(() => {
        const pendingRevocation = database.prepare(`
            SELECT revocation_id
            FROM oauth_revocations
            WHERE user_id = ?
              AND has_pending_token = 1
              AND status IN ('pending', 'in_progress', 'remote_failed')
            LIMIT 1
        `).get(safeUserId);
        if (pendingRevocation) {
            throw new Error('Não é possível salvar conexão enquanto existe revogacao OAuth pendente.');
        }
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
    });
    persistConnection.immediate();

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

function mapOAuthRevocation(row) {
    if (!row) return null;
    return {
        revocation_id: row.revocation_id || '',
        user_id: row.user_id || '',
        generation: Number(row.generation || 0),
        reason: row.reason || '',
        status: row.status || '',
        attempts: Number(row.attempts || 0),
        last_error_code: row.last_error_code || '',
        requested_at: row.requested_at || '',
        updated_at: row.updated_at || '',
        next_attempt_at: row.next_attempt_at || '',
        expires_at: row.expires_at || '',
        max_attempts: Number(row.max_attempts || 5),
        lease_expires_at: row.lease_expires_at || '',
        completed_at: row.completed_at || '',
        has_pending_token: Number(row.has_pending_token || 0) === 1
    };
}

function getOAuthRevocation(userId) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) return null;
    const row = ensureDb().prepare(`
        SELECT * FROM oauth_revocations
        WHERE user_id = ?
        ORDER BY generation DESC
        LIMIT 1
    `).get(safeUserId);
    return mapOAuthRevocation(row);
}

function getOAuthRevocationById(userId, revocationId) {
    const safeUserId = String(userId || '').trim();
    const safeRevocationId = String(revocationId || '').trim();
    if (!safeUserId || !safeRevocationId) return null;
    return mapOAuthRevocation(ensureDb().prepare(`
        SELECT * FROM oauth_revocations
        WHERE user_id = ? AND revocation_id = ?
    `).get(safeUserId, safeRevocationId));
}

function beginOAuthRevocation(userId, {
    reason = 'lifecycle',
    revocationId = '',
    now,
    retentionDays = 30,
    maxAttempts = 5,
    leaseDurationMs = 10000,
    respectBackoff = false
} = {}) {
    const safeUserId = String(userId || '').trim();
    const safeReason = String(reason || 'lifecycle').trim().toUpperCase().slice(0, 32) || 'LIFECYCLE';
    if (!safeUserId) throw new Error('user_id é obrigatório para revogar conexão OAuth.');

    const database = ensureDb();
    const requestedAt = normalizeDate(now);
    const nowIso = requestedAt.toISOString();
    const safeRetentionDays = boundedInteger(retentionDays, 30, 1, 90);
    const safeMaxAttempts = boundedInteger(maxAttempts, 5, 1, 20);
    const safeLeaseDurationMs = boundedInteger(leaseDurationMs, 10000, 1000, 60000);
    const expiresAt = new Date(requestedAt.getTime() + safeRetentionDays * 86400000).toISOString();
    const leaseExpiresAt = new Date(requestedAt.getTime() + safeLeaseDurationMs).toISOString();
    const expectedRevocationId = String(revocationId || '').trim();
    const claimRevocation = database.transaction(() => {
        const connection = database.prepare(`
            SELECT * FROM oauth_connections
            WHERE user_id = ? AND COALESCE(revoked_at, '') = ''
        `).get(safeUserId);
        const existingRevocation = expectedRevocationId
            ? database.prepare(`
                SELECT * FROM oauth_revocations
                WHERE user_id = ? AND revocation_id = ?
            `).get(safeUserId, expectedRevocationId)
            : database.prepare(`
                SELECT * FROM oauth_revocations
                WHERE user_id = ?
                ORDER BY generation DESC
                LIMIT 1
            `).get(safeUserId);

        if (connection) {
            const generation = Number(database.prepare(`
                SELECT COALESCE(MAX(generation), 0) AS value
                FROM oauth_revocations
                WHERE user_id = ?
            `).get(safeUserId).value || 0) + 1;
            const newRevocationId = crypto.randomUUID();
            const newLeaseId = crypto.randomUUID();
            database.prepare(`
                INSERT INTO oauth_revocations(
                    revocation_id, user_id, generation, encrypted_tokens, reason, status,
                    attempts, last_error_code, requested_at, updated_at, next_attempt_at,
                    expires_at, max_attempts, lease_id, lease_expires_at,
                    completed_at, has_pending_token
                ) VALUES(
                    @revocation_id, @user_id, @generation, @encrypted_tokens, @reason, 'in_progress',
                    1, '', @requested_at, @updated_at, @next_attempt_at, @expires_at,
                    @max_attempts, @lease_id, @lease_expires_at, '', 1
                )
            `).run({
                revocation_id: newRevocationId,
                user_id: safeUserId,
                generation,
                encrypted_tokens: connection.encrypted_tokens,
                reason: safeReason,
                requested_at: nowIso,
                updated_at: nowIso,
                next_attempt_at: nowIso,
                expires_at: expiresAt,
                max_attempts: safeMaxAttempts,
                lease_id: newLeaseId,
                lease_expires_at: leaseExpiresAt
            });
            database.prepare(`
                UPDATE oauth_connections
                SET encrypted_tokens = @empty_tokens, revoked_at = @revoked_at, updated_at = @updated_at
                WHERE user_id = @user_id AND COALESCE(revoked_at, '') = ''
            `).run({
                user_id: safeUserId,
                empty_tokens: '',
                revoked_at: nowIso,
                updated_at: nowIso
            });
            return {
                started: true,
                retry: false,
                revocationId: newRevocationId,
                leaseId: newLeaseId,
                tokens: decryptJson(connection.encrypted_tokens),
                revocation: getOAuthRevocationById(safeUserId, newRevocationId)
            };
        }

        const hasPendingToken = Number(existingRevocation?.has_pending_token || 0) === 1;
        const activeLease = hasPendingToken
            && existingRevocation.status === 'in_progress'
            && String(existingRevocation.lease_id || '')
            && String(existingRevocation.lease_expires_at || '') > nowIso;
        if (activeLease) {
            return {
                started: false,
                retry: false,
                revocationId: existingRevocation.revocation_id,
                leaseId: '',
                tokens: null,
                revocation: mapOAuthRevocation(existingRevocation)
            };
        }

        const retryable = hasPendingToken
            && ['pending', 'in_progress', 'remote_failed'].includes(existingRevocation.status);
        if (retryable) {
            const expired = requestedAt.getTime() >= normalizeDate(existingRevocation.expires_at).getTime();
            const persistedMaxAttempts = boundedInteger(existingRevocation.max_attempts, 5, 1, 20);
            const exhausted = Number(existingRevocation.attempts || 0) >= persistedMaxAttempts;
            if (expired || exhausted) {
                database.prepare(`
                    UPDATE oauth_revocations
                    SET encrypted_tokens = '', has_pending_token = 0,
                        status = @status, last_error_code = @error_code,
                        updated_at = @updated_at, completed_at = @updated_at,
                        lease_id = '', lease_expires_at = ''
                    WHERE user_id = @user_id AND revocation_id = @revocation_id
                      AND has_pending_token = 1
                      AND NOT (
                          status = 'in_progress'
                          AND COALESCE(lease_id, '') <> ''
                          AND COALESCE(lease_expires_at, '') > @updated_at
                      )
                `).run({
                    user_id: safeUserId,
                    revocation_id: existingRevocation.revocation_id,
                    status: expired ? 'manual_required_expired' : 'manual_required_exhausted',
                    error_code: expired ? 'REVOCATION_RETENTION_EXPIRED' : 'REVOCATION_ATTEMPTS_EXHAUSTED',
                    updated_at: nowIso
                });
                return {
                    started: false,
                    retry: false,
                    revocationId: existingRevocation.revocation_id,
                    leaseId: '',
                    tokens: null,
                    revocation: getOAuthRevocationById(safeUserId, existingRevocation.revocation_id)
                };
            }
            const newLeaseId = crypto.randomUUID();
            const claimed = database.prepare(`
                UPDATE oauth_revocations
                SET reason = @reason, status = 'in_progress', attempts = attempts + 1,
                    last_error_code = '', updated_at = @updated_at,
                    lease_id = @lease_id, lease_expires_at = @lease_expires_at
                WHERE user_id = @user_id AND revocation_id = @revocation_id
                  AND has_pending_token = 1
                  AND attempts < max_attempts
                  AND expires_at > @updated_at
                  AND (
                      (
                          status = 'remote_failed'
                          AND (@respect_backoff = 0 OR next_attempt_at <= @updated_at)
                      )
                      OR (
                          status = 'pending'
                          AND (@respect_backoff = 0 OR next_attempt_at <= @updated_at)
                          AND (
                              COALESCE(lease_id, '') = ''
                              OR COALESCE(lease_expires_at, '') = ''
                              OR lease_expires_at <= @updated_at
                          )
                      )
                      OR (
                          status = 'in_progress'
                          AND (
                              COALESCE(lease_id, '') = ''
                              OR COALESCE(lease_expires_at, '') = ''
                              OR lease_expires_at <= @updated_at
                          )
                      )
                  )
            `).run({
                user_id: safeUserId,
                revocation_id: existingRevocation.revocation_id,
                reason: safeReason,
                updated_at: nowIso,
                lease_id: newLeaseId,
                lease_expires_at: leaseExpiresAt,
                respect_backoff: respectBackoff ? 1 : 0
            });
            if (claimed.changes !== 1) {
                return {
                    started: false,
                    retry: false,
                    revocationId: existingRevocation.revocation_id,
                    leaseId: '',
                    tokens: null,
                    revocation: getOAuthRevocationById(safeUserId, existingRevocation.revocation_id)
                };
            }
            return {
                started: false,
                retry: true,
                revocationId: existingRevocation.revocation_id,
                leaseId: newLeaseId,
                tokens: decryptJson(existingRevocation.encrypted_tokens),
                revocation: getOAuthRevocationById(safeUserId, existingRevocation.revocation_id)
            };
        }

        return {
            started: false,
            retry: false,
            revocationId: existingRevocation?.revocation_id || '',
            leaseId: '',
            tokens: null,
            revocation: mapOAuthRevocation(existingRevocation)
        };
    });
    return claimRevocation.immediate();
}

function markOAuthRevocationResult(userId, revocationId, leaseId, {
    status,
    errorCode = '',
    now,
    baseDelayMs = 300000,
    maxDelayMs = 86400000
} = {}) {
    const safeUserId = String(userId || '').trim();
    const safeRevocationId = String(revocationId || '').trim();
    const safeLeaseId = String(leaseId || '').trim();
    const safeStatus = String(status || '').trim().toLowerCase();
    if (!safeUserId || !safeRevocationId || !safeLeaseId) {
        throw new Error('user_id, revocation_id e lease_id sao obrigatorios para concluir revogacao OAuth.');
    }
    if (!['remote_revoked', 'remote_failed'].includes(safeStatus)) {
        throw new Error('Status de revogação OAuth inválido.');
    }

    const database = ensureDb();
    const completedAt = normalizeDate(now);
    const nowIso = completedAt.toISOString();
    const completed = safeStatus === 'remote_revoked';
    const current = database.prepare(`
        SELECT * FROM oauth_revocations
        WHERE user_id = ? AND revocation_id = ?
    `).get(safeUserId, safeRevocationId);
    if (!current) return null;
    const safeBaseDelayMs = boundedInteger(baseDelayMs, 300000, 1000, 86400000);
    const safeMaxDelayMs = boundedInteger(maxDelayMs, 86400000, safeBaseDelayMs, 604800000);
    const delayMs = Math.min(
        safeBaseDelayMs * (2 ** Math.max(0, Number(current.attempts || 1) - 1)),
        safeMaxDelayMs
    );
    const updated = database.prepare(`
        UPDATE oauth_revocations
        SET status = @status,
            encrypted_tokens = CASE WHEN @completed = 1 THEN '' ELSE encrypted_tokens END,
            has_pending_token = CASE WHEN @completed = 1 THEN 0 ELSE has_pending_token END,
            last_error_code = @last_error_code,
            updated_at = @updated_at,
            next_attempt_at = @next_attempt_at,
            completed_at = CASE WHEN @completed = 1 THEN @updated_at ELSE completed_at END,
            lease_id = '',
            lease_expires_at = ''
        WHERE user_id = @user_id AND revocation_id = @revocation_id
          AND has_pending_token = 1
          AND status = 'in_progress'
          AND lease_id = @lease_id
    `).run({
        user_id: safeUserId,
        revocation_id: safeRevocationId,
        lease_id: safeLeaseId,
        status: safeStatus,
        completed: completed ? 1 : 0,
        last_error_code: completed ? '' : sanitizeRevocationErrorCode(errorCode),
        updated_at: nowIso,
        next_attempt_at: completed ? nowIso : new Date(completedAt.getTime() + delayMs).toISOString()
    });
    const revocation = getOAuthRevocationById(safeUserId, safeRevocationId);
    return revocation ? { ...revocation, applied: updated.changes === 1 } : { applied: false };
}

function sanitizeRevocationErrorCode(value) {
    const code = String(value || '').trim().toUpperCase();
    return /^[A-Z0-9_]{1,64}$/.test(code) ? code : 'REMOTE_REVOKE_FAILED';
}

function listOAuthRevocationsForRecovery({ limit = 50, now } = {}) {
    const safeLimit = boundedInteger(limit, 50, 1, 100);
    const nowIso = normalizeDate(now).toISOString();
    return ensureDb().prepare(`
        SELECT * FROM oauth_revocations
        WHERE has_pending_token = 1
          AND (
              (status = 'remote_failed' AND next_attempt_at <= ?)
              OR (
                  status = 'pending'
                  AND next_attempt_at <= ?
                  AND (
                      COALESCE(lease_id, '') = ''
                      OR COALESCE(lease_expires_at, '') = ''
                      OR lease_expires_at <= ?
                  )
              )
              OR (
                  status = 'in_progress'
                  AND (
                      COALESCE(lease_id, '') = ''
                      OR COALESCE(lease_expires_at, '') = ''
                      OR lease_expires_at <= ?
                  )
              )
          )
        ORDER BY next_attempt_at ASC, generation ASC
        LIMIT ?
    `).all(nowIso, nowIso, nowIso, nowIso, safeLimit).map(mapOAuthRevocation);
}

function expireOAuthRevocation(userId, revocationId, {
    status = 'manual_required_expired',
    errorCode = 'REVOCATION_RETENTION_EXPIRED',
    now
} = {}) {
    const safeUserId = String(userId || '').trim();
    const safeRevocationId = String(revocationId || '').trim();
    const safeStatus = String(status || '').trim().toLowerCase();
    if (!safeUserId || !safeRevocationId || ![
        'manual_required_expired',
        'manual_required_exhausted'
    ].includes(safeStatus)) {
        throw new Error('Expiração de revogação OAuth inválida.');
    }
    const nowIso = normalizeDate(now).toISOString();
    const updated = ensureDb().prepare(`
        UPDATE oauth_revocations
        SET encrypted_tokens = '', has_pending_token = 0,
            status = @status, last_error_code = @error_code,
            updated_at = @updated_at, completed_at = @updated_at,
            lease_id = '', lease_expires_at = ''
        WHERE user_id = @user_id AND revocation_id = @revocation_id
          AND has_pending_token = 1
          AND NOT (
              status = 'in_progress'
              AND COALESCE(lease_id, '') <> ''
              AND COALESCE(lease_expires_at, '') > @updated_at
          )
    `).run({
        user_id: safeUserId,
        revocation_id: safeRevocationId,
        status: safeStatus,
        error_code: sanitizeRevocationErrorCode(errorCode),
        updated_at: nowIso
    });
    const revocation = getOAuthRevocationById(safeUserId, safeRevocationId);
    return revocation ? { ...revocation, applied: updated.changes === 1 } : { applied: false };
}

function mapSharedMembership(row) {
    if (!row) return null;
    return {
        user_id: row.user_id || '',
        owner_user_id: row.owner_user_id || '',
        spreadsheet_id: row.spreadsheet_id || '',
        member_google_email: row.member_google_email || '',
        drive_permission_id: row.drive_permission_id || '',
        created_at: row.created_at || '',
        updated_at: row.updated_at || '',
        revoked_at: row.revoked_at || ''
    };
}

function setSharedSpreadsheetMembership({ memberUserId, ownerUserId, spreadsheetId, memberGoogleEmail = '', drivePermissionId = '' } = {}) {
    const safeMemberUserId = String(memberUserId || '').trim();
    const safeOwnerUserId = String(ownerUserId || '').trim();
    const safeSpreadsheetId = String(spreadsheetId || '').trim();
    const safeMemberGoogleEmail = String(memberGoogleEmail || '').trim().toLowerCase();
    const safeDrivePermissionId = String(drivePermissionId || '').trim();
    if (!safeMemberUserId) throw new Error('memberUserId é obrigatório para compartilhar planilha.');
    if (!safeOwnerUserId) throw new Error('ownerUserId é obrigatório para compartilhar planilha.');
    if (!safeSpreadsheetId) throw new Error('spreadsheetId é obrigatório para compartilhar planilha.');
    if (safeMemberUserId === safeOwnerUserId) {
        throw new Error('O membro compartilhado precisa ser diferente do dono da planilha.');
    }

    const database = ensureDb();
    const now = new Date().toISOString();
    database.prepare(`
        INSERT INTO shared_spreadsheet_members(
            user_id, owner_user_id, spreadsheet_id, member_google_email,
            drive_permission_id, created_at, updated_at, revoked_at
        )
        VALUES(
            @user_id, @owner_user_id, @spreadsheet_id, @member_google_email,
            @drive_permission_id, @created_at, @updated_at, ''
        )
        ON CONFLICT(user_id) DO UPDATE SET
            owner_user_id = excluded.owner_user_id,
            spreadsheet_id = excluded.spreadsheet_id,
            member_google_email = excluded.member_google_email,
            drive_permission_id = excluded.drive_permission_id,
            updated_at = excluded.updated_at,
            revoked_at = ''
    `).run({
        user_id: safeMemberUserId,
        owner_user_id: safeOwnerUserId,
        spreadsheet_id: safeSpreadsheetId,
        member_google_email: safeMemberGoogleEmail,
        drive_permission_id: safeDrivePermissionId,
        created_at: now,
        updated_at: now
    });
    logger.info('oauth: planilha compartilhada familiar vinculada');
    return getSharedSpreadsheetMembership(safeMemberUserId);
}

function getSharedSpreadsheetMembership(userId) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) return null;
    const database = ensureDb();
    const row = database.prepare(`
        SELECT * FROM shared_spreadsheet_members
        WHERE user_id = ? AND COALESCE(revoked_at, '') = ''
    `).get(safeUserId);
    return mapSharedMembership(row);
}

function revokeSharedSpreadsheetMembership(userId) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) return null;
    const existing = getSharedSpreadsheetMembership(safeUserId);
    if (!existing) return null;

    const database = ensureDb();
    const now = new Date().toISOString();
    database.prepare(`
        UPDATE shared_spreadsheet_members
        SET revoked_at = @revoked_at, updated_at = @updated_at
        WHERE user_id = @user_id AND COALESCE(revoked_at, '') = ''
    `).run({
        user_id: safeUserId,
        updated_at: now,
        revoked_at: now
    });
    logger.info('oauth: planilha compartilhada familiar revogada');
    return existing;
}

function listSharedSpreadsheetMembersBySpreadsheetId(spreadsheetId) {
    const safeSpreadsheetId = String(spreadsheetId || '').trim();
    if (!safeSpreadsheetId) return [];
    const database = ensureDb();
    return database.prepare(`
        SELECT * FROM shared_spreadsheet_members
        WHERE spreadsheet_id = ? AND COALESCE(revoked_at, '') = ''
        ORDER BY created_at ASC
    `).all(safeSpreadsheetId).map(mapSharedMembership);
}

function getFinancialScopeUserIds(userId) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) return [];

    const ownConnection = getOAuthConnection(safeUserId);
    const membership = getSharedSpreadsheetMembership(safeUserId);
    const spreadsheetId = membership?.spreadsheet_id || ownConnection?.spreadsheet_id || '';
    const ownerUserId = membership?.owner_user_id || safeUserId;
    if (!spreadsheetId) return [safeUserId];

    const memberIds = listSharedSpreadsheetMembersBySpreadsheetId(spreadsheetId).map(member => member.user_id);
    return Array.from(new Set([ownerUserId, ...memberIds, safeUserId].filter(Boolean)));
}

module.exports = {
    saveOAuthConnection,
    getOAuthConnection,
    updateOAuthConnectionMetadata,
    beginOAuthRevocation,
    getOAuthRevocation,
    markOAuthRevocationResult,
    listOAuthRevocationsForRecovery,
    expireOAuthRevocation,
    setSharedSpreadsheetMembership,
    getSharedSpreadsheetMembership,
    revokeSharedSpreadsheetMembership,
    listSharedSpreadsheetMembersBySpreadsheetId,
    getFinancialScopeUserIds,
    __test__: {
        encryptJson,
        decryptJson,
        decodeEncryptionKey
    }
};
