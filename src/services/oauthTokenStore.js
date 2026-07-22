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
    return ['SQLITE_BUSY', 'SQLITE_LOCKED'].includes(error?.code) ||
        /database(?: table)? is locked/i.test(String(error?.message || ''));
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
    try {
        candidate.pragma(`busy_timeout = ${busyTimeoutMs}`);
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
                CREATE TABLE IF NOT EXISTS shared_membership_revocations (
                    revocation_id TEXT PRIMARY KEY,
                    member_user_id TEXT NOT NULL,
                    owner_user_id TEXT NOT NULL,
                    generation INTEGER NOT NULL,
                    spreadsheet_id TEXT NOT NULL,
                    drive_permission_id TEXT NOT NULL DEFAULT '',
                    member_google_email TEXT NOT NULL DEFAULT '',
                    encrypted_owner_tokens TEXT NOT NULL DEFAULT '',
                    reason TEXT NOT NULL,
                    status TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    last_error_code TEXT NOT NULL DEFAULT '',
                    requested_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    next_attempt_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    max_attempts INTEGER NOT NULL DEFAULT 5,
                    lease_id TEXT NOT NULL DEFAULT '',
                    lease_expires_at TEXT NOT NULL DEFAULT '',
                    completed_at TEXT NOT NULL DEFAULT '',
                    has_pending_token INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(member_user_id, generation)
                );
                CREATE INDEX IF NOT EXISTS idx_shared_membership_revocations_owner
                    ON shared_membership_revocations(owner_user_id, status);
                CREATE INDEX IF NOT EXISTS idx_shared_membership_revocations_recovery
                    ON shared_membership_revocations(has_pending_token, next_attempt_at);
                CREATE TABLE IF NOT EXISTS oauth_connection_attempts (
                    attempt_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    generation INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    stage TEXT NOT NULL,
                    lease_id TEXT NOT NULL DEFAULT '',
                    lease_expires_at TEXT NOT NULL DEFAULT '',
                    next_attempt_at TEXT NOT NULL DEFAULT '',
                    attempts INTEGER NOT NULL DEFAULT 0,
                    max_attempts INTEGER NOT NULL DEFAULT 5,
                    expires_at TEXT NOT NULL,
                    retention_expires_at TEXT NOT NULL,
                    encrypted_tokens TEXT NOT NULL DEFAULT '',
                    candidate_scopes TEXT NOT NULL DEFAULT '[]',
                    google_user_id TEXT NOT NULL DEFAULT '',
                    google_email TEXT NOT NULL DEFAULT '',
                    candidate_spreadsheet_id TEXT NOT NULL DEFAULT '',
                    candidate_sheet_origin TEXT NOT NULL DEFAULT '',
                    candidate_sheet_marker TEXT NOT NULL DEFAULT '',
                    compensation_attempts INTEGER NOT NULL DEFAULT 0,
                    compensation_completed_at TEXT NOT NULL DEFAULT '',
                    result_json TEXT NOT NULL DEFAULT '',
                    last_error_code TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    completed_at TEXT NOT NULL DEFAULT '',
                    UNIQUE(user_id, generation)
                );
                CREATE INDEX IF NOT EXISTS idx_oauth_connection_attempts_user_generation
                    ON oauth_connection_attempts(user_id, generation DESC);
                CREATE INDEX IF NOT EXISTS idx_oauth_connection_attempts_recovery
                    ON oauth_connection_attempts(status, lease_expires_at, retention_expires_at);
            `);
            ensureOAuthRevocationSchema(candidate);
            ensureColumn(candidate, 'shared_spreadsheet_members', 'member_google_email', 'TEXT');
            ensureColumn(candidate, 'shared_spreadsheet_members', 'drive_permission_id', 'TEXT');
            ensureColumn(candidate, 'oauth_connection_attempts', 'compensation_attempts', 'INTEGER NOT NULL DEFAULT 0');
            ensureColumn(candidate, 'oauth_connection_attempts', 'compensation_completed_at', "TEXT NOT NULL DEFAULT ''");
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

function closeDatabaseForTests() {
    if (db) {
        db.close();
        db = null;
        activeDbPath = '';
    }
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

function parseJsonObject(value) {
    try {
        const parsed = JSON.parse(value || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
}

function mapOAuthConnectionAttempt(row, { includeTokens = false } = {}) {
    if (!row) return null;
    const mapped = {
        attempt_id: row.attempt_id,
        user_id: row.user_id,
        generation: Number(row.generation || 0),
        status: row.status,
        stage: row.stage,
        lease_id: row.lease_id || '',
        lease_expires_at: row.lease_expires_at || '',
        next_attempt_at: row.next_attempt_at || '',
        attempts: Number(row.attempts || 0),
        max_attempts: Number(row.max_attempts || 0),
        expires_at: row.expires_at || '',
        retention_expires_at: row.retention_expires_at || '',
        scopes: parseScopes(row.candidate_scopes),
        google_user_id: row.google_user_id || '',
        google_email: row.google_email || '',
        candidate_spreadsheet_id: row.candidate_spreadsheet_id || '',
        candidate_sheet_origin: row.candidate_sheet_origin || '',
        candidate_sheet_marker: row.candidate_sheet_marker || '',
        compensation_attempts: Number(row.compensation_attempts || 0),
        compensation_completed_at: row.compensation_completed_at || '',
        result: parseJsonObject(row.result_json),
        last_error_code: row.last_error_code || '',
        created_at: row.created_at || '',
        updated_at: row.updated_at || '',
        completed_at: row.completed_at || ''
    };
    if (includeTokens && row.encrypted_tokens) {
        mapped.tokens = decryptJson(row.encrypted_tokens);
    }
    return mapped;
}

function getOAuthConnectionAttempt(attemptId, options = {}) {
    const safeAttemptId = String(attemptId || '').trim();
    if (!safeAttemptId) return null;
    const row = ensureDb().prepare(`
        SELECT * FROM oauth_connection_attempts WHERE attempt_id = ?
    `).get(safeAttemptId);
    return mapOAuthConnectionAttempt(row, options);
}

function issueOAuthConnectionAttempt({ userId, expiresAt, attemptId = crypto.randomUUID() } = {}) {
    const safeUserId = String(userId || '').trim();
    const safeAttemptId = String(attemptId || '').trim();
    if (!safeUserId || !safeAttemptId) {
        throw new Error('user_id e attempt_id sÃ£o obrigatÃ³rios para emitir state OAuth.');
    }
    const expiry = normalizeDate(expiresAt);
    if (expiry.getTime() <= Date.now()) throw new Error('ExpiraÃ§Ã£o do state OAuth invÃ¡lida.');
    const retentionMs = boundedInteger(
        process.env.GOOGLE_OAUTH_ATTEMPT_RETENTION_MS,
        7 * 24 * 60 * 60 * 1000,
        60 * 60 * 1000,
        30 * 24 * 60 * 60 * 1000
    );
    const maxAttempts = boundedInteger(process.env.GOOGLE_OAUTH_ATTEMPT_MAX_ATTEMPTS, 5, 1, 20);
    const database = ensureDb();
    const now = new Date(Date.now()).toISOString();
    const issue = database.transaction(() => {
        const latest = database.prepare(`
            SELECT COALESCE(MAX(generation), 0) AS generation
            FROM oauth_connection_attempts
            WHERE user_id = ?
        `).get(safeUserId);
        const generation = Number(latest?.generation || 0) + 1;
        database.prepare(`
            UPDATE oauth_connection_attempts
            SET status = 'superseded', lease_id = '', lease_expires_at = '', updated_at = @updated_at
            WHERE user_id = @user_id
              AND status NOT IN (
                  'completed', 'compensated', 'compensation_not_required',
                  'compensation_pending', 'compensating', 'expired', 'manual_required'
              )
        `).run({ user_id: safeUserId, updated_at: now });
        database.prepare(`
            INSERT INTO oauth_connection_attempts(
                attempt_id, user_id, generation, status, stage, lease_id,
                lease_expires_at, next_attempt_at, attempts, max_attempts, expires_at,
                retention_expires_at, candidate_sheet_marker, created_at, updated_at
            ) VALUES(
                @attempt_id, @user_id, @generation, 'issued', 'issued', '',
                '', @next_attempt_at, 0, @max_attempts, @expires_at,
                @retention_expires_at, @candidate_sheet_marker, @created_at, @updated_at
            )
        `).run({
            attempt_id: safeAttemptId,
            user_id: safeUserId,
            generation,
            max_attempts: maxAttempts,
            next_attempt_at: now,
            expires_at: expiry.toISOString(),
            retention_expires_at: new Date(expiry.getTime() + retentionMs).toISOString(),
            candidate_sheet_marker: `financasbot-oauth-${safeAttemptId}`,
            created_at: now,
            updated_at: now
        });
        return generation;
    });
    const generation = issue.immediate();
    return { ...getOAuthConnectionAttempt(safeAttemptId), generation };
}

function claimOAuthConnectionAttempt({ attemptId, userId, generation, leaseMs } = {}) {
    const safeAttemptId = String(attemptId || '').trim();
    const safeUserId = String(userId || '').trim();
    const safeGeneration = Number(generation || 0);
    if (!safeAttemptId || !safeUserId || !Number.isInteger(safeGeneration) || safeGeneration < 1) {
        return { outcome: 'invalid' };
    }
    const boundedLeaseMs = boundedInteger(
        leaseMs || process.env.GOOGLE_OAUTH_ATTEMPT_LEASE_MS,
        120000,
        5000,
        10 * 60 * 1000
    );
    const database = ensureDb();
    const claim = database.transaction(() => {
        const row = database.prepare(`
            SELECT * FROM oauth_connection_attempts
            WHERE attempt_id = ? AND user_id = ? AND generation = ?
        `).get(safeAttemptId, safeUserId, safeGeneration);
        if (!row) return { outcome: 'invalid' };
        const latest = database.prepare(`
            SELECT MAX(generation) AS generation
            FROM oauth_connection_attempts
            WHERE user_id = ?
        `).get(safeUserId);
        if (Number(latest?.generation || 0) !== safeGeneration) {
            if (![
                'completed', 'compensated', 'compensation_not_required',
                'compensation_pending', 'compensating', 'expired', 'manual_required'
            ].includes(row.status)) {
                database.prepare(`
                    UPDATE oauth_connection_attempts
                    SET status = 'superseded', lease_id = '', lease_expires_at = '', updated_at = ?
                    WHERE attempt_id = ?
                `).run(new Date(Date.now()).toISOString(), safeAttemptId);
            }
            return { outcome: [
                'compensated', 'compensation_not_required', 'compensation_pending',
                'compensating', 'expired', 'manual_required'
            ].includes(row.status) ? row.status : 'superseded' };
        }
        if (row.status === 'completed') {
            return { outcome: 'completed', result: parseJsonObject(row.result_json) };
        }
        if ([
            'superseded', 'compensated', 'compensation_not_required',
            'compensation_pending', 'compensating', 'manual_required', 'expired'
        ].includes(row.status)) {
            return { outcome: row.status };
        }
        const nowMs = Date.now();
        if (Date.parse(row.expires_at) <= nowMs) {
            database.prepare(`
                UPDATE oauth_connection_attempts
                SET status = 'expired', lease_id = '', lease_expires_at = '',
                    encrypted_tokens = '', updated_at = ?
                WHERE attempt_id = ?
            `).run(new Date(nowMs).toISOString(), safeAttemptId);
            return { outcome: 'expired' };
        }
        if (row.status === 'in_progress' && Date.parse(row.lease_expires_at || '') > nowMs) {
            return { outcome: 'in_progress', leaseExpiresAt: row.lease_expires_at };
        }
        if (Date.parse(row.next_attempt_at || '') > nowMs) {
            return { outcome: 'retry_later', nextAttemptAt: row.next_attempt_at };
        }
        if (Number(row.attempts || 0) >= Number(row.max_attempts || 0)) {
            database.prepare(`
                UPDATE oauth_connection_attempts
                SET status = 'manual_required', lease_id = '', lease_expires_at = '',
                    last_error_code = 'ATTEMPTS_EXHAUSTED', updated_at = ?
                WHERE attempt_id = ?
            `).run(new Date(nowMs).toISOString(), safeAttemptId);
            return { outcome: 'manual_required' };
        }
        if (row.stage === 'token_exchange_started' && !row.encrypted_tokens) {
            database.prepare(`
                UPDATE oauth_connection_attempts
                SET status = 'manual_required', lease_id = '', lease_expires_at = '',
                    last_error_code = 'TOKEN_EXCHANGE_UNCERTAIN', updated_at = ?
                WHERE attempt_id = ?
            `).run(new Date(nowMs).toISOString(), safeAttemptId);
            return { outcome: 'manual_required' };
        }
        const leaseId = crypto.randomUUID();
        const updatedAt = new Date(nowMs).toISOString();
        const leaseExpiresAt = new Date(nowMs + boundedLeaseMs).toISOString();
        database.prepare(`
            UPDATE oauth_connection_attempts
            SET status = 'in_progress', lease_id = @lease_id,
                lease_expires_at = @lease_expires_at, attempts = attempts + 1,
                updated_at = @updated_at
            WHERE attempt_id = @attempt_id
        `).run({
            attempt_id: safeAttemptId,
            lease_id: leaseId,
            lease_expires_at: leaseExpiresAt,
            updated_at: updatedAt
        });
        return {
            outcome: 'claimed',
            leaseId,
            attempt: getOAuthConnectionAttempt(safeAttemptId, { includeTokens: true })
        };
    });
    return claim.immediate();
}

function expireOAuthConnectionAttempts({ now = new Date(), limit = 100 } = {}) {
    const current = normalizeDate(now);
    const boundedLimit = boundedInteger(limit, 100, 1, 1000);
    const database = ensureDb();
    const expire = database.transaction(() => {
        const rows = database.prepare(`
            SELECT attempt_id, status
            FROM oauth_connection_attempts
            WHERE retention_expires_at <= ?
            ORDER BY retention_expires_at ASC
            LIMIT ?
        `).all(current.toISOString(), boundedLimit);
        let expired = 0;
        let deleted = 0;
        const expireStatement = database.prepare(`
            UPDATE oauth_connection_attempts
            SET status = 'expired', encrypted_tokens = '', lease_id = '',
                lease_expires_at = '', result_json = '', updated_at = ?
            WHERE attempt_id = ?
        `);
        const deleteStatement = database.prepare(`
            DELETE FROM oauth_connection_attempts WHERE attempt_id = ?
        `);
        for (const row of rows) {
            if (row.status === 'completed' || row.status === 'compensated') {
                deleteStatement.run(row.attempt_id);
                deleted += 1;
            } else {
                expireStatement.run(current.toISOString(), row.attempt_id);
                expired += 1;
            }
        }
        return { expired, deleted };
    });
    return expire.immediate();
}

const OAUTH_ATTEMPT_STAGES = Object.freeze([
    'issued',
    'token_exchange_started',
    'token_staged',
    'account_ready',
    'sheet_create_dispatched',
    'sheet_ready',
    'template_ready',
    'connection_committed',
    'lifecycle_active',
    'completed'
]);

const OAUTH_ATTEMPT_TRANSITIONS = Object.freeze({
    issued: Object.freeze(['token_exchange_started']),
    token_exchange_started: Object.freeze(['token_staged']),
    token_staged: Object.freeze(['account_ready']),
    account_ready: Object.freeze(['sheet_create_dispatched', 'sheet_ready']),
    sheet_create_dispatched: Object.freeze(['sheet_ready']),
    sheet_ready: Object.freeze(['template_ready']),
    connection_committed: Object.freeze(['lifecycle_active'])
});

function advanceOAuthConnectionAttempt({
    attemptId,
    generation,
    leaseId,
    expectedStage,
    nextStage,
    tokens,
    scopes,
    googleAccount,
    spreadsheetId,
    sheetOrigin,
    errorCode
} = {}) {
    const safeAttemptId = String(attemptId || '').trim();
    const safeLeaseId = String(leaseId || '').trim();
    const safeGeneration = Number(generation || 0);
    const safeExpectedStages = (Array.isArray(expectedStage) ? expectedStage : [expectedStage])
        .map(value => String(value || '').trim())
        .filter(value => OAUTH_ATTEMPT_STAGES.includes(value));
    const safeNextStage = String(nextStage || '').trim();
    if (!safeAttemptId || !safeLeaseId || !Number.isInteger(safeGeneration) ||
        !safeExpectedStages.length || !OAUTH_ATTEMPT_STAGES.includes(safeNextStage)) {
        throw new Error('AvanÃ§o de tentativa OAuth invÃ¡lido.');
    }
    const database = ensureDb();
    const advance = database.transaction(() => {
        const row = database.prepare(`
            SELECT * FROM oauth_connection_attempts
            WHERE attempt_id = ? AND generation = ? AND lease_id = ? AND status = 'in_progress'
        `).get(safeAttemptId, safeGeneration, safeLeaseId);
        if (!row || !safeExpectedStages.includes(row.stage)) {
            throw new Error('Claim OAuth perdeu precedÃªncia ou etapa esperada.');
        }
        if (!OAUTH_ATTEMPT_TRANSITIONS[row.stage]?.includes(safeNextStage)) {
            throw new Error('Transicao de etapa OAuth nao permitida.');
        }
        const latest = database.prepare(`
            SELECT MAX(generation) AS generation FROM oauth_connection_attempts WHERE user_id = ?
        `).get(row.user_id);
        if (Number(latest?.generation || 0) !== safeGeneration) {
            throw new Error('Claim OAuth pertence a geraÃ§Ã£o superada.');
        }
        const now = new Date(Date.now()).toISOString();
        database.prepare(`
            UPDATE oauth_connection_attempts
            SET stage = @next_stage,
                encrypted_tokens = CASE WHEN @set_tokens = 1 THEN @encrypted_tokens ELSE encrypted_tokens END,
                candidate_scopes = CASE WHEN @set_scopes = 1 THEN @candidate_scopes ELSE candidate_scopes END,
                google_user_id = CASE WHEN @set_account = 1 THEN @google_user_id ELSE google_user_id END,
                google_email = CASE WHEN @set_account = 1 THEN @google_email ELSE google_email END,
                candidate_spreadsheet_id = CASE WHEN @set_sheet = 1 THEN @spreadsheet_id ELSE candidate_spreadsheet_id END,
                candidate_sheet_origin = CASE WHEN @set_sheet = 1 THEN @sheet_origin ELSE candidate_sheet_origin END,
                last_error_code = CASE WHEN @set_error = 1 THEN @last_error_code ELSE '' END,
                updated_at = @updated_at
            WHERE attempt_id = @attempt_id AND generation = @generation AND lease_id = @lease_id
        `).run({
            attempt_id: safeAttemptId,
            generation: safeGeneration,
            lease_id: safeLeaseId,
            next_stage: safeNextStage,
            set_tokens: tokens && typeof tokens === 'object' ? 1 : 0,
            encrypted_tokens: tokens && typeof tokens === 'object' ? encryptJson(tokens) : '',
            set_scopes: Array.isArray(scopes) ? 1 : 0,
            candidate_scopes: serializeScopes(scopes),
            set_account: googleAccount && typeof googleAccount === 'object' ? 1 : 0,
            google_user_id: googleAccount?.id || '',
            google_email: googleAccount?.email || '',
            set_sheet: typeof spreadsheetId === 'string' ? 1 : 0,
            spreadsheet_id: String(spreadsheetId || '').trim(),
            sheet_origin: String(sheetOrigin || '').trim(),
            set_error: typeof errorCode === 'string' ? 1 : 0,
            last_error_code: String(errorCode || '').trim(),
            updated_at: now
        });
        return getOAuthConnectionAttempt(safeAttemptId, { includeTokens: true });
    });
    return advance.immediate();
}

function releaseOAuthConnectionAttempt({ attemptId, generation, leaseId, retryable = true, errorCode = '' } = {}) {
    const safeAttemptId = String(attemptId || '').trim();
    const safeLeaseId = String(leaseId || '').trim();
    const safeGeneration = Number(generation || 0);
    const status = retryable ? 'retryable' : 'manual_required';
    const database = ensureDb();
    const current = database.prepare(`
        SELECT attempts FROM oauth_connection_attempts
        WHERE attempt_id = ? AND generation = ? AND lease_id = ?
    `).get(safeAttemptId, safeGeneration, safeLeaseId);
    const retryBaseMs = boundedInteger(process.env.GOOGLE_OAUTH_ATTEMPT_RETRY_BASE_MS, 1000, 0, 60000);
    const retryDelayMs = Math.min(
        retryBaseMs * (2 ** Math.max(0, Number(current?.attempts || 1) - 1)),
        15 * 60 * 1000
    );
    const result = database.prepare(`
        UPDATE oauth_connection_attempts
        SET status = @status, lease_id = '', lease_expires_at = '',
            encrypted_tokens = CASE WHEN @retryable = 1 THEN encrypted_tokens ELSE '' END,
            next_attempt_at = @next_attempt_at,
            last_error_code = @last_error_code, updated_at = @updated_at
        WHERE attempt_id = @attempt_id AND generation = @generation
          AND lease_id = @lease_id AND status = 'in_progress'
    `).run({
        attempt_id: safeAttemptId,
        generation: safeGeneration,
        lease_id: safeLeaseId,
        status,
        retryable: retryable ? 1 : 0,
        next_attempt_at: retryable
            ? new Date(Date.now() + retryDelayMs).toISOString()
            : '',
        last_error_code: String(errorCode || '').trim(),
        updated_at: new Date(Date.now()).toISOString()
    });
    return result.changes === 1 ? getOAuthConnectionAttempt(safeAttemptId) : null;
}

function promoteOAuthConnectionAttempt({ attemptId, generation, leaseId } = {}) {
    const safeAttemptId = String(attemptId || '').trim();
    const safeLeaseId = String(leaseId || '').trim();
    const safeGeneration = Number(generation || 0);
    const database = ensureDb();
    const promote = database.transaction(() => {
        const row = database.prepare(`
            SELECT * FROM oauth_connection_attempts
            WHERE attempt_id = ? AND generation = ? AND lease_id = ?
              AND status = 'in_progress' AND stage = 'template_ready'
        `).get(safeAttemptId, safeGeneration, safeLeaseId);
        if (!row || !row.encrypted_tokens || !row.candidate_spreadsheet_id) {
            throw new Error('Tentativa OAuth nÃ£o estÃ¡ pronta para promoÃ§Ã£o.');
        }
        const latest = database.prepare(`
            SELECT MAX(generation) AS generation FROM oauth_connection_attempts WHERE user_id = ?
        `).get(row.user_id);
        if (Number(latest?.generation || 0) !== safeGeneration) {
            throw new Error('Tentativa OAuth superada antes da promoÃ§Ã£o.');
        }
        const pendingRevocation = database.prepare(`
            SELECT revocation_id FROM oauth_revocations
            WHERE user_id = ? AND has_pending_token = 1
              AND status IN ('pending', 'in_progress', 'remote_failed')
            LIMIT 1
        `).get(row.user_id);
        if (pendingRevocation) {
            throw new Error('NÃ£o Ã© possÃ­vel promover conexÃ£o com revogaÃ§Ã£o OAuth pendente.');
        }
        assertSpreadsheetNotBeingCompensated(database, row.candidate_spreadsheet_id, row.attempt_id);
        const now = new Date(Date.now()).toISOString();
        database.prepare(`
            INSERT INTO oauth_connections(
                user_id, provider, scopes, encrypted_tokens, google_user_id, google_email,
                spreadsheet_id, calendar_id, connected_at, updated_at, revoked_at
            ) VALUES(
                @user_id, 'google', @scopes, @encrypted_tokens, @google_user_id, @google_email,
                @spreadsheet_id, '', @connected_at, @updated_at, ''
            )
            ON CONFLICT(user_id) DO UPDATE SET
                provider = excluded.provider,
                scopes = excluded.scopes,
                encrypted_tokens = excluded.encrypted_tokens,
                google_user_id = excluded.google_user_id,
                google_email = excluded.google_email,
                spreadsheet_id = excluded.spreadsheet_id,
                updated_at = excluded.updated_at,
                revoked_at = ''
        `).run({
            user_id: row.user_id,
            scopes: row.candidate_scopes,
            encrypted_tokens: row.encrypted_tokens,
            google_user_id: row.google_user_id,
            google_email: row.google_email,
            spreadsheet_id: row.candidate_spreadsheet_id,
            connected_at: now,
            updated_at: now
        });
        database.prepare(`
            UPDATE oauth_connection_attempts
            SET stage = 'connection_committed', updated_at = ?
            WHERE attempt_id = ? AND generation = ? AND lease_id = ?
        `).run(now, safeAttemptId, safeGeneration, safeLeaseId);
        return mapRow(database.prepare(`
            SELECT * FROM oauth_connections WHERE user_id = ?
        `).get(row.user_id));
    });
    return promote.immediate();
}

function isOAuthSpreadsheetReferenced(spreadsheetId) {
    const safeSpreadsheetId = String(spreadsheetId || '').trim();
    if (!safeSpreadsheetId) return false;
    const row = ensureDb().prepare(`
        SELECT 1 AS referenced FROM oauth_connections
        WHERE spreadsheet_id = @spreadsheet_id AND COALESCE(revoked_at, '') = ''
        UNION ALL
        SELECT 1 AS referenced FROM shared_spreadsheet_members
        WHERE spreadsheet_id = @spreadsheet_id AND COALESCE(revoked_at, '') = ''
        LIMIT 1
    `).get({ spreadsheet_id: safeSpreadsheetId });
    return Boolean(row?.referenced);
}

function assertSpreadsheetNotBeingCompensated(database, spreadsheetId, excludedAttemptId = '') {
    const safeSpreadsheetId = String(spreadsheetId || '').trim();
    if (!safeSpreadsheetId) return;
    const active = database.prepare(`
        SELECT attempt_id FROM oauth_connection_attempts
        WHERE candidate_spreadsheet_id = @spreadsheet_id
          AND status = 'compensating'
          AND attempt_id <> @excluded_attempt_id
        LIMIT 1
    `).get({
        spreadsheet_id: safeSpreadsheetId,
        excluded_attempt_id: String(excludedAttemptId || '').trim()
    });
    if (active) {
        throw new Error('Planilha Google estÃ¡ em compensaÃ§Ã£o OAuth e nÃ£o pode ser vinculada.');
    }
}

function beginOAuthConnectionCompensation({
    attemptId,
    generation,
    leaseId = '',
    spreadsheetId = '',
    leaseMs
} = {}) {
    const safeAttemptId = String(attemptId || '').trim();
    const safeGeneration = Number(generation || 0);
    const expectedLeaseId = String(leaseId || '').trim();
    const locallyCreatedSpreadsheetId = String(spreadsheetId || '').trim();
    if (!safeAttemptId || !Number.isInteger(safeGeneration) || safeGeneration < 1) {
        return { outcome: 'invalid' };
    }
    const boundedLeaseMs = boundedInteger(
        leaseMs || process.env.GOOGLE_OAUTH_ATTEMPT_LEASE_MS,
        120000,
        5000,
        10 * 60 * 1000
    );
    const database = ensureDb();
    const begin = database.transaction(() => {
        let row = database.prepare(`
            SELECT * FROM oauth_connection_attempts
            WHERE attempt_id = ? AND generation = ?
        `).get(safeAttemptId, safeGeneration);
        if (!row) return { outcome: 'not_applicable' };
        if (['connection_committed', 'lifecycle_active', 'completed'].includes(row.stage) ||
            ['completed', 'compensated', 'compensation_not_required', 'expired'].includes(row.status)) {
            return { outcome: row.status === 'compensated' ? 'compensated' : 'not_applicable' };
        }
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        if (row.status === 'compensating' && row.lease_id && Date.parse(row.lease_expires_at || '') > nowMs) {
            return { outcome: 'in_progress', leaseExpiresAt: row.lease_expires_at };
        }
        if (row.status === 'in_progress' && row.lease_id && row.lease_id !== expectedLeaseId &&
            Date.parse(row.lease_expires_at || '') > nowMs) {
            return { outcome: 'in_progress', leaseExpiresAt: row.lease_expires_at };
        }
        if (!row.candidate_spreadsheet_id && locallyCreatedSpreadsheetId &&
            row.stage === 'sheet_create_dispatched') {
            database.prepare(`
                UPDATE oauth_connection_attempts
                SET candidate_spreadsheet_id = @spreadsheet_id,
                    candidate_sheet_origin = 'created', updated_at = @updated_at
                WHERE attempt_id = @attempt_id AND generation = @generation
                  AND stage = 'sheet_create_dispatched'
            `).run({
                attempt_id: safeAttemptId,
                generation: safeGeneration,
                spreadsheet_id: locallyCreatedSpreadsheetId,
                updated_at: nowIso
            });
            row = database.prepare(`
                SELECT * FROM oauth_connection_attempts
                WHERE attempt_id = ? AND generation = ?
            `).get(safeAttemptId, safeGeneration);
        }
        if (row.candidate_sheet_origin !== 'created' || !row.candidate_spreadsheet_id) {
            return { outcome: 'not_applicable' };
        }
        const referenced = database.prepare(`
            SELECT 1 AS referenced FROM oauth_connections
            WHERE spreadsheet_id = @spreadsheet_id AND COALESCE(revoked_at, '') = ''
            UNION ALL
            SELECT 1 AS referenced FROM shared_spreadsheet_members
            WHERE spreadsheet_id = @spreadsheet_id AND COALESCE(revoked_at, '') = ''
            LIMIT 1
        `).get({ spreadsheet_id: row.candidate_spreadsheet_id });
        if (referenced) {
            database.prepare(`
                UPDATE oauth_connection_attempts
                SET status = 'compensation_not_required', encrypted_tokens = '',
                    lease_id = '', lease_expires_at = '', next_attempt_at = '',
                    last_error_code = '', compensation_completed_at = @completed_at,
                    updated_at = @updated_at
                WHERE attempt_id = @attempt_id AND generation = @generation
            `).run({
                attempt_id: safeAttemptId,
                generation: safeGeneration,
                completed_at: nowIso,
                updated_at: nowIso
            });
            return { outcome: 'not_required_referenced' };
        }
        if (Date.parse(row.retention_expires_at || '') <= nowMs ||
            Number(row.compensation_attempts || 0) >= Number(row.max_attempts || 0) ||
            !row.encrypted_tokens) {
            const errorCode = !row.encrypted_tokens
                ? 'COMPENSATION_CREDENTIALS_MISSING'
                : (Date.parse(row.retention_expires_at || '') <= nowMs
                    ? 'COMPENSATION_RETENTION_EXPIRED'
                    : 'COMPENSATION_ATTEMPTS_EXHAUSTED');
            database.prepare(`
                UPDATE oauth_connection_attempts
                SET status = 'manual_required', encrypted_tokens = '',
                    lease_id = '', lease_expires_at = '', next_attempt_at = '',
                    last_error_code = @error_code, updated_at = @updated_at
                WHERE attempt_id = @attempt_id AND generation = @generation
            `).run({
                attempt_id: safeAttemptId,
                generation: safeGeneration,
                error_code: errorCode,
                updated_at: nowIso
            });
            return { outcome: 'manual_required', errorCode };
        }
        const compensationLeaseId = crypto.randomUUID();
        database.prepare(`
            UPDATE oauth_connection_attempts
            SET status = 'compensating', lease_id = @lease_id,
                lease_expires_at = @lease_expires_at, next_attempt_at = @updated_at,
                compensation_attempts = compensation_attempts + 1,
                last_error_code = '', updated_at = @updated_at
            WHERE attempt_id = @attempt_id AND generation = @generation
        `).run({
            attempt_id: safeAttemptId,
            generation: safeGeneration,
            lease_id: compensationLeaseId,
            lease_expires_at: new Date(nowMs + boundedLeaseMs).toISOString(),
            updated_at: nowIso
        });
        return {
            outcome: 'claimed',
            leaseId: compensationLeaseId,
            attempt: getOAuthConnectionAttempt(safeAttemptId, { includeTokens: true })
        };
    });
    return begin.immediate();
}

function finishOAuthConnectionCompensation({
    attemptId,
    generation,
    leaseId,
    compensated = false,
    errorCode = 'COMPENSATION_DELETE_FAILED'
} = {}) {
    const safeAttemptId = String(attemptId || '').trim();
    const safeGeneration = Number(generation || 0);
    const safeLeaseId = String(leaseId || '').trim();
    if (!safeAttemptId || !Number.isInteger(safeGeneration) || !safeLeaseId) return null;
    const database = ensureDb();
    const row = database.prepare(`
        SELECT compensation_attempts FROM oauth_connection_attempts
        WHERE attempt_id = ? AND generation = ? AND lease_id = ? AND status = 'compensating'
    `).get(safeAttemptId, safeGeneration, safeLeaseId);
    if (!row) return null;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const retryBaseMs = boundedInteger(process.env.GOOGLE_OAUTH_ATTEMPT_RETRY_BASE_MS, 1000, 0, 60000);
    const retryDelayMs = Math.min(
        retryBaseMs * (2 ** Math.max(0, Number(row.compensation_attempts || 1) - 1)),
        15 * 60 * 1000
    );
    const update = database.prepare(`
        UPDATE oauth_connection_attempts
        SET status = @status,
            encrypted_tokens = CASE WHEN @compensated = 1 THEN '' ELSE encrypted_tokens END,
            google_user_id = CASE WHEN @compensated = 1 THEN '' ELSE google_user_id END,
            google_email = CASE WHEN @compensated = 1 THEN '' ELSE google_email END,
            lease_id = '', lease_expires_at = '',
            next_attempt_at = @next_attempt_at,
            last_error_code = @last_error_code,
            compensation_completed_at = CASE WHEN @compensated = 1 THEN @updated_at ELSE compensation_completed_at END,
            updated_at = @updated_at
        WHERE attempt_id = @attempt_id AND generation = @generation
          AND lease_id = @lease_id AND status = 'compensating'
    `).run({
        attempt_id: safeAttemptId,
        generation: safeGeneration,
        lease_id: safeLeaseId,
        status: compensated ? 'compensated' : 'compensation_pending',
        compensated: compensated ? 1 : 0,
        next_attempt_at: compensated ? '' : new Date(nowMs + retryDelayMs).toISOString(),
        last_error_code: compensated ? '' : String(errorCode || 'COMPENSATION_DELETE_FAILED').trim(),
        updated_at: nowIso
    });
    return update.changes === 1 ? getOAuthConnectionAttempt(safeAttemptId) : null;
}

function listOAuthConnectionCompensationsForRecovery({ now = new Date(), limit = 50 } = {}) {
    const nowIso = normalizeDate(now).toISOString();
    const boundedLimit = boundedInteger(limit, 50, 1, 100);
    return ensureDb().prepare(`
        SELECT attempt_id, generation
        FROM oauth_connection_attempts
        WHERE candidate_sheet_origin = 'created'
          AND candidate_spreadsheet_id <> ''
          AND status IN ('compensation_pending', 'compensating')
          AND retention_expires_at > @now
          AND (next_attempt_at = '' OR next_attempt_at <= @now)
          AND (status <> 'compensating' OR lease_expires_at = '' OR lease_expires_at <= @now)
        ORDER BY updated_at ASC
        LIMIT @limit
    `).all({ now: nowIso, limit: boundedLimit });
}

function completeOAuthConnectionAttempt({ attemptId, generation, leaseId, result = {} } = {}) {
    const safeAttemptId = String(attemptId || '').trim();
    const safeLeaseId = String(leaseId || '').trim();
    const safeGeneration = Number(generation || 0);
    if (!safeAttemptId || !safeLeaseId || !Number.isInteger(safeGeneration)) {
        throw new Error('Claim OAuth invÃ¡lido para concluir tentativa.');
    }
    const database = ensureDb();
    const now = new Date(Date.now()).toISOString();
    const update = database.prepare(`
        UPDATE oauth_connection_attempts
        SET status = 'completed', stage = 'completed', result_json = @result_json,
            encrypted_tokens = '', google_user_id = '', google_email = '',
            lease_id = '', lease_expires_at = '',
            last_error_code = '', completed_at = @completed_at, updated_at = @updated_at
        WHERE attempt_id = @attempt_id
          AND generation = @generation
          AND lease_id = @lease_id
          AND status = 'in_progress'
          AND stage = 'lifecycle_active'
          AND generation = (
              SELECT MAX(generation)
              FROM oauth_connection_attempts
              WHERE user_id = (
                  SELECT user_id FROM oauth_connection_attempts WHERE attempt_id = @attempt_id
              )
          )
    `).run({
        attempt_id: safeAttemptId,
        generation: safeGeneration,
        lease_id: safeLeaseId,
        result_json: JSON.stringify(result || {}),
        completed_at: now,
        updated_at: now
    });
    if (update.changes !== 1) throw new Error('Claim OAuth perdeu precedÃªncia antes da conclusÃ£o.');
    return getOAuthConnectionAttempt(safeAttemptId);
}

function saveOAuthConnection(userId, { scopes, tokens, googleAccount = {}, spreadsheetId = '', calendarId = '' } = {}) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) throw new Error('user_id é obrigatório para salvar conexão OAuth.');
    if (!tokens || typeof tokens !== 'object') throw new Error('tokens OAuth são obrigatórios.');

    const database = ensureDb();
    const now = new Date(Date.now()).toISOString();
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
        assertSpreadsheetNotBeingCompensated(database, spreadsheetId);
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
    const update = database.transaction(() => {
        if (Object.prototype.hasOwnProperty.call(patch, 'spreadsheetId')) {
            assertSpreadsheetNotBeingCompensated(database, patch.spreadsheetId);
        }
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
            updated_at: new Date(Date.now()).toISOString()
        });
    });
    update.immediate();
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
    const now = new Date(Date.now()).toISOString();
    const persistMembership = database.transaction(() => {
        assertSpreadsheetNotBeingCompensated(database, safeSpreadsheetId);
        if (safeDrivePermissionId || safeMemberGoogleEmail) {
            const activeConnection = database.prepare(`
                SELECT 1 AS active FROM oauth_connections
                WHERE user_id = ? AND COALESCE(revoked_at, '') = ''
            `);
            if (!activeConnection.get(safeOwnerUserId) || !activeConnection.get(safeMemberUserId)) {
                throw new Error('Dono e membro precisam ter conexões OAuth ativas para compartilhar a planilha.');
            }
            const pendingCleanup = database.prepare(`
                SELECT 1 AS pending FROM shared_membership_revocations
                WHERE status <> 'remote_revoked'
                  AND (member_user_id IN (?, ?) OR owner_user_id IN (?, ?))
                LIMIT 1
            `).get(safeMemberUserId, safeOwnerUserId, safeMemberUserId, safeOwnerUserId);
            if (pendingCleanup) {
                throw new Error('Existe remoção de compartilhamento pendente para um dos usuários.');
            }
        }
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
    });
    persistMembership.immediate();
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
          AND (
              (COALESCE(drive_permission_id, '') = '' AND COALESCE(member_google_email, '') = '')
              OR EXISTS (
                  SELECT 1 FROM oauth_connections owner_connection
                  WHERE owner_connection.user_id = shared_spreadsheet_members.owner_user_id
                    AND COALESCE(owner_connection.revoked_at, '') = ''
              )
          )
          AND (
              (COALESCE(drive_permission_id, '') = '' AND COALESCE(member_google_email, '') = '')
              OR EXISTS (
                  SELECT 1 FROM oauth_connections member_connection
                  WHERE member_connection.user_id = shared_spreadsheet_members.user_id
                    AND COALESCE(member_connection.revoked_at, '') = ''
              )
          )
    `).get(safeUserId);
    return mapSharedMembership(row);
}

function revokeSharedSpreadsheetMembership(userId) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) return null;
    const existing = getSharedSpreadsheetMembership(safeUserId);
    if (!existing) return null;

    const database = ensureDb();
    const now = new Date(Date.now()).toISOString();
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
          AND (
              (COALESCE(drive_permission_id, '') = '' AND COALESCE(member_google_email, '') = '')
              OR EXISTS (
                  SELECT 1 FROM oauth_connections owner_connection
                  WHERE owner_connection.user_id = shared_spreadsheet_members.owner_user_id
                    AND COALESCE(owner_connection.revoked_at, '') = ''
              )
          )
          AND (
              (COALESCE(drive_permission_id, '') = '' AND COALESCE(member_google_email, '') = '')
              OR EXISTS (
                  SELECT 1 FROM oauth_connections member_connection
                  WHERE member_connection.user_id = shared_spreadsheet_members.user_id
                    AND COALESCE(member_connection.revoked_at, '') = ''
              )
          )
        ORDER BY created_at ASC
    `).all(safeSpreadsheetId).map(mapSharedMembership);
}

function hasUnresolvedSharedMembershipRevocationForUsers(...userIds) {
    const safeUserIds = [...new Set(userIds.flat().map(value => String(value || '').trim()).filter(Boolean))];
    if (safeUserIds.length === 0) return false;
    const placeholders = safeUserIds.map(() => '?').join(', ');
    const row = ensureDb().prepare(`
        SELECT 1 AS pending FROM shared_membership_revocations
        WHERE status <> 'remote_revoked'
          AND (
              member_user_id IN (${placeholders})
              OR owner_user_id IN (${placeholders})
          )
        LIMIT 1
    `).get(...safeUserIds, ...safeUserIds);
    return Boolean(row);
}

function mapSharedMembershipRevocation(row) {
    if (!row) return null;
    return {
        revocation_id: row.revocation_id || '',
        member_user_id: row.member_user_id || '',
        owner_user_id: row.owner_user_id || '',
        generation: Number(row.generation || 0),
        spreadsheet_id: row.spreadsheet_id || '',
        drive_permission_id: row.drive_permission_id || '',
        member_google_email: row.member_google_email || '',
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

function getSharedMembershipRevocation(revocationId) {
    const safeRevocationId = String(revocationId || '').trim();
    if (!safeRevocationId) return null;
    return mapSharedMembershipRevocation(ensureDb().prepare(`
        SELECT * FROM shared_membership_revocations WHERE revocation_id = ?
    `).get(safeRevocationId));
}

function beginSharedMembershipRevocationsForLifecycle(userId, {
    reason = 'lifecycle',
    targetOwnerTokens = null,
    relationshipScope = 'all',
    now,
    retentionDays = 30,
    maxAttempts = 5,
    leaseDurationMs = 10000
} = {}) {
    const safeUserId = String(userId || '').trim();
    const safeReason = String(reason || 'lifecycle').trim().toUpperCase().slice(0, 32) || 'LIFECYCLE';
    if (!safeUserId) throw new Error('user_id é obrigatório para remover compartilhamentos por lifecycle.');
    const database = ensureDb();
    const requestedAt = normalizeDate(now);
    const nowIso = requestedAt.toISOString();
    const safeRetentionDays = boundedInteger(retentionDays, 30, 1, 90);
    const safeMaxAttempts = boundedInteger(maxAttempts, 5, 1, 20);
    const safeLeaseDurationMs = boundedInteger(leaseDurationMs, 10000, 1000, 60000);
    const expiresAt = new Date(requestedAt.getTime() + safeRetentionDays * 86400000).toISOString();
    const leaseExpiresAt = new Date(requestedAt.getTime() + safeLeaseDurationMs).toISOString();
    const suppliedOwnerTokens = targetOwnerTokens && typeof targetOwnerTokens === 'object'
        ? targetOwnerTokens
        : null;
    const safeRelationshipScope = relationshipScope === 'member' ? 'member' : 'all';

    const begin = database.transaction(() => {
        const relationshipPredicate = safeRelationshipScope === 'member'
            ? 'user_id = @user_id'
            : '(user_id = @user_id OR owner_user_id = @user_id)';
        const memberships = database.prepare(`
            SELECT * FROM shared_spreadsheet_members
            WHERE COALESCE(revoked_at, '') = ''
              AND ${relationshipPredicate}
            ORDER BY user_id ASC
        `).all({ user_id: safeUserId });
        const results = [];

        for (const membership of memberships) {
            const ownerConnection = membership.owner_user_id === safeUserId && suppliedOwnerTokens
                ? null
                : database.prepare(`
                    SELECT encrypted_tokens FROM oauth_connections
                    WHERE user_id = ? AND COALESCE(revoked_at, '') = ''
                `).get(membership.owner_user_id);
            let ownerTokens = suppliedOwnerTokens && membership.owner_user_id === safeUserId
                ? suppliedOwnerTokens
                : null;
            if (!ownerTokens && ownerConnection?.encrypted_tokens) {
                ownerTokens = decryptJson(ownerConnection.encrypted_tokens);
            }
            const hasRemoteReference = Boolean(
                String(membership.drive_permission_id || '').trim()
                || String(membership.member_google_email || '').trim()
            );
            const hasOwnerTokens = Boolean(ownerTokens && Object.keys(ownerTokens).length > 0);
            const retryable = hasRemoteReference && hasOwnerTokens;
            const status = !hasRemoteReference
                ? 'manual_required_missing_permission'
                : (hasOwnerTokens ? 'in_progress' : 'manual_required_missing_owner_credentials');
            const generation = Number(database.prepare(`
                SELECT COALESCE(MAX(generation), 0) AS value
                FROM shared_membership_revocations WHERE member_user_id = ?
            `).get(membership.user_id).value || 0) + 1;
            const revocationId = crypto.randomUUID();
            const leaseId = retryable ? crypto.randomUUID() : '';
            database.prepare(`
                INSERT INTO shared_membership_revocations(
                    revocation_id, member_user_id, owner_user_id, generation,
                    spreadsheet_id, drive_permission_id, member_google_email,
                    encrypted_owner_tokens, reason, status, attempts,
                    last_error_code, requested_at, updated_at, next_attempt_at,
                    expires_at, max_attempts, lease_id, lease_expires_at,
                    completed_at, has_pending_token
                ) VALUES(
                    @revocation_id, @member_user_id, @owner_user_id, @generation,
                    @spreadsheet_id, @drive_permission_id, @member_google_email,
                    @encrypted_owner_tokens, @reason, @status, @attempts,
                    @last_error_code, @requested_at, @updated_at, @next_attempt_at,
                    @expires_at, @max_attempts, @lease_id, @lease_expires_at,
                    @completed_at, @has_pending_token
                )
            `).run({
                revocation_id: revocationId,
                member_user_id: membership.user_id,
                owner_user_id: membership.owner_user_id,
                generation,
                spreadsheet_id: membership.spreadsheet_id,
                drive_permission_id: String(membership.drive_permission_id || ''),
                member_google_email: String(membership.member_google_email || ''),
                encrypted_owner_tokens: retryable ? encryptJson(ownerTokens) : '',
                reason: safeReason,
                status,
                attempts: retryable ? 1 : 0,
                last_error_code: retryable ? '' : (hasRemoteReference
                    ? 'OWNER_CREDENTIALS_UNAVAILABLE'
                    : 'DRIVE_PERMISSION_REFERENCE_UNAVAILABLE'),
                requested_at: nowIso,
                updated_at: nowIso,
                next_attempt_at: nowIso,
                expires_at: expiresAt,
                max_attempts: safeMaxAttempts,
                lease_id: leaseId,
                lease_expires_at: retryable ? leaseExpiresAt : '',
                completed_at: retryable ? '' : nowIso,
                has_pending_token: retryable ? 1 : 0
            });
            database.prepare(`
                UPDATE shared_spreadsheet_members
                SET revoked_at = @revoked_at, updated_at = @revoked_at
                WHERE user_id = @member_user_id AND COALESCE(revoked_at, '') = ''
            `).run({ member_user_id: membership.user_id, revoked_at: nowIso });
            results.push({
                ...getSharedMembershipRevocation(revocationId),
                leaseId,
                ownerTokens: retryable ? ownerTokens : null
            });
        }
        return results;
    });
    return begin.immediate();
}

function beginDetachedSharedPermissionRevocation({
    memberUserId,
    ownerUserId,
    spreadsheetId,
    drivePermissionId = '',
    memberGoogleEmail = '',
    reason = 'membership_persist_failed',
    ownerTokens = null,
    now,
    retentionDays = 30,
    maxAttempts = 5,
    leaseDurationMs = 10000
} = {}) {
    const safeMemberUserId = String(memberUserId || '').trim();
    const safeOwnerUserId = String(ownerUserId || '').trim();
    const safeSpreadsheetId = String(spreadsheetId || '').trim();
    const safeDrivePermissionId = String(drivePermissionId || '').trim();
    const safeMemberGoogleEmail = String(memberGoogleEmail || '').trim().toLowerCase();
    const safeReason = String(reason || 'membership_persist_failed').trim().toUpperCase().slice(0, 32)
        || 'MEMBERSHIP_PERSIST_FAILED';
    if (!safeMemberUserId || !safeOwnerUserId || !safeSpreadsheetId) {
        throw new Error('Membro, dono e planilha são obrigatórios para compensar compartilhamento.');
    }
    if (!safeDrivePermissionId && !safeMemberGoogleEmail) {
        throw new Error('permissionId ou e-mail do membro é obrigatório para compensar compartilhamento.');
    }
    const database = ensureDb();
    const requestedAt = normalizeDate(now);
    const nowIso = requestedAt.toISOString();
    const safeRetentionDays = boundedInteger(retentionDays, 30, 1, 90);
    const safeMaxAttempts = boundedInteger(maxAttempts, 5, 1, 20);
    const safeLeaseDurationMs = boundedInteger(leaseDurationMs, 10000, 1000, 60000);
    const expiresAt = new Date(requestedAt.getTime() + safeRetentionDays * 86400000).toISOString();
    const leaseExpiresAt = new Date(requestedAt.getTime() + safeLeaseDurationMs).toISOString();

    const begin = database.transaction(() => {
        let resolvedOwnerTokens = ownerTokens && typeof ownerTokens === 'object' ? ownerTokens : null;
        if (!resolvedOwnerTokens) {
            const ownerConnection = database.prepare(`
                SELECT encrypted_tokens FROM oauth_connections
                WHERE user_id = ? AND COALESCE(revoked_at, '') = ''
            `).get(safeOwnerUserId);
            if (ownerConnection?.encrypted_tokens) {
                resolvedOwnerTokens = decryptJson(ownerConnection.encrypted_tokens);
            }
        }
        const hasOwnerTokens = Boolean(resolvedOwnerTokens && Object.keys(resolvedOwnerTokens).length > 0);
        const generation = Number(database.prepare(`
            SELECT COALESCE(MAX(generation), 0) AS value
            FROM shared_membership_revocations WHERE member_user_id = ?
        `).get(safeMemberUserId).value || 0) + 1;
        const revocationId = crypto.randomUUID();
        const leaseId = hasOwnerTokens ? crypto.randomUUID() : '';
        database.prepare(`
            INSERT INTO shared_membership_revocations(
                revocation_id, member_user_id, owner_user_id, generation,
                spreadsheet_id, drive_permission_id, member_google_email,
                encrypted_owner_tokens, reason, status, attempts,
                last_error_code, requested_at, updated_at, next_attempt_at,
                expires_at, max_attempts, lease_id, lease_expires_at,
                completed_at, has_pending_token
            ) VALUES(
                @revocation_id, @member_user_id, @owner_user_id, @generation,
                @spreadsheet_id, @drive_permission_id, @member_google_email,
                @encrypted_owner_tokens, @reason, @status, @attempts,
                @last_error_code, @requested_at, @updated_at, @next_attempt_at,
                @expires_at, @max_attempts, @lease_id, @lease_expires_at,
                @completed_at, @has_pending_token
            )
        `).run({
            revocation_id: revocationId,
            member_user_id: safeMemberUserId,
            owner_user_id: safeOwnerUserId,
            generation,
            spreadsheet_id: safeSpreadsheetId,
            drive_permission_id: safeDrivePermissionId,
            member_google_email: safeMemberGoogleEmail,
            encrypted_owner_tokens: hasOwnerTokens ? encryptJson(resolvedOwnerTokens) : '',
            reason: safeReason,
            status: hasOwnerTokens ? 'in_progress' : 'manual_required_missing_owner_credentials',
            attempts: hasOwnerTokens ? 1 : 0,
            last_error_code: hasOwnerTokens ? '' : 'OWNER_CREDENTIALS_UNAVAILABLE',
            requested_at: nowIso,
            updated_at: nowIso,
            next_attempt_at: nowIso,
            expires_at: expiresAt,
            max_attempts: safeMaxAttempts,
            lease_id: leaseId,
            lease_expires_at: hasOwnerTokens ? leaseExpiresAt : '',
            completed_at: hasOwnerTokens ? '' : nowIso,
            has_pending_token: hasOwnerTokens ? 1 : 0
        });
        return {
            ...getSharedMembershipRevocation(revocationId),
            leaseId,
            ownerTokens: hasOwnerTokens ? resolvedOwnerTokens : null
        };
    });
    return begin.immediate();
}

function claimSharedMembershipRevocation(revocationId, {
    now,
    leaseDurationMs = 10000,
    respectBackoff = true
} = {}) {
    const safeRevocationId = String(revocationId || '').trim();
    if (!safeRevocationId) return null;
    const database = ensureDb();
    const claimedAt = normalizeDate(now);
    const nowIso = claimedAt.toISOString();
    const safeLeaseDurationMs = boundedInteger(leaseDurationMs, 10000, 1000, 60000);
    const leaseExpiresAt = new Date(claimedAt.getTime() + safeLeaseDurationMs).toISOString();
    const claim = database.transaction(() => {
        const current = database.prepare(`
            SELECT * FROM shared_membership_revocations WHERE revocation_id = ?
        `).get(safeRevocationId);
        if (!current || Number(current.has_pending_token || 0) !== 1) {
            return { claimed: false, job: mapSharedMembershipRevocation(current), ownerTokens: null, leaseId: '' };
        }
        const activeLease = current.status === 'in_progress'
            && String(current.lease_id || '')
            && String(current.lease_expires_at || '') > nowIso;
        if (activeLease) {
            return { claimed: false, job: mapSharedMembershipRevocation(current), ownerTokens: null, leaseId: '' };
        }
        const expired = nowIso >= String(current.expires_at || '');
        const exhausted = Number(current.attempts || 0) >= Number(current.max_attempts || 5);
        if (expired || exhausted) {
            const status = expired ? 'manual_required_expired' : 'manual_required_exhausted';
            database.prepare(`
                UPDATE shared_membership_revocations
                SET encrypted_owner_tokens = '', has_pending_token = 0,
                    status = @status, last_error_code = @error_code,
                    updated_at = @updated_at, completed_at = @updated_at,
                    lease_id = '', lease_expires_at = ''
                WHERE revocation_id = @revocation_id AND has_pending_token = 1
            `).run({
                revocation_id: safeRevocationId,
                status,
                error_code: expired ? 'REVOCATION_RETENTION_EXPIRED' : 'REVOCATION_ATTEMPTS_EXHAUSTED',
                updated_at: nowIso
            });
            return { claimed: false, job: getSharedMembershipRevocation(safeRevocationId), ownerTokens: null, leaseId: '' };
        }
        const eligible = ['remote_failed', 'in_progress'].includes(current.status)
            && (!respectBackoff || String(current.next_attempt_at || '') <= nowIso);
        if (!eligible) {
            return { claimed: false, job: mapSharedMembershipRevocation(current), ownerTokens: null, leaseId: '' };
        }
        const leaseId = crypto.randomUUID();
        const updated = database.prepare(`
            UPDATE shared_membership_revocations
            SET status = 'in_progress', attempts = attempts + 1,
                last_error_code = '', updated_at = @updated_at,
                lease_id = @lease_id, lease_expires_at = @lease_expires_at
            WHERE revocation_id = @revocation_id AND has_pending_token = 1
              AND attempts < max_attempts AND expires_at > @updated_at
              AND NOT (
                  status = 'in_progress' AND COALESCE(lease_id, '') <> ''
                  AND COALESCE(lease_expires_at, '') > @updated_at
              )
              AND (@respect_backoff = 0 OR next_attempt_at <= @updated_at)
        `).run({
            revocation_id: safeRevocationId,
            updated_at: nowIso,
            lease_id: leaseId,
            lease_expires_at: leaseExpiresAt,
            respect_backoff: respectBackoff ? 1 : 0
        });
        if (updated.changes !== 1) {
            return { claimed: false, job: getSharedMembershipRevocation(safeRevocationId), ownerTokens: null, leaseId: '' };
        }
        return {
            claimed: true,
            job: getSharedMembershipRevocation(safeRevocationId),
            ownerTokens: decryptJson(current.encrypted_owner_tokens),
            leaseId
        };
    });
    return claim.immediate();
}

function markSharedMembershipRevocationResult(revocationId, leaseId, {
    status,
    errorCode = '',
    now,
    baseDelayMs = 300000,
    maxDelayMs = 86400000
} = {}) {
    const safeRevocationId = String(revocationId || '').trim();
    const safeLeaseId = String(leaseId || '').trim();
    const safeStatus = String(status || '').trim().toLowerCase();
    if (!safeRevocationId || !safeLeaseId || !['remote_revoked', 'remote_failed'].includes(safeStatus)) {
        throw new Error('Resultado de revogação de compartilhamento inválido.');
    }
    const database = ensureDb();
    const completedAt = normalizeDate(now);
    const nowIso = completedAt.toISOString();
    const current = database.prepare(`
        SELECT * FROM shared_membership_revocations WHERE revocation_id = ?
    `).get(safeRevocationId);
    if (!current) return null;
    const completed = safeStatus === 'remote_revoked';
    const safeBaseDelayMs = boundedInteger(baseDelayMs, 300000, 1000, 86400000);
    const safeMaxDelayMs = boundedInteger(maxDelayMs, 86400000, safeBaseDelayMs, 604800000);
    const delayMs = Math.min(
        safeBaseDelayMs * (2 ** Math.max(0, Number(current.attempts || 1) - 1)),
        safeMaxDelayMs
    );
    const updated = database.prepare(`
        UPDATE shared_membership_revocations
        SET status = @status,
            encrypted_owner_tokens = CASE WHEN @completed = 1 THEN '' ELSE encrypted_owner_tokens END,
            has_pending_token = CASE WHEN @completed = 1 THEN 0 ELSE has_pending_token END,
            last_error_code = @last_error_code,
            updated_at = @updated_at,
            next_attempt_at = @next_attempt_at,
            completed_at = CASE WHEN @completed = 1 THEN @updated_at ELSE completed_at END,
            lease_id = '', lease_expires_at = ''
        WHERE revocation_id = @revocation_id AND has_pending_token = 1
          AND status = 'in_progress' AND lease_id = @lease_id
    `).run({
        revocation_id: safeRevocationId,
        lease_id: safeLeaseId,
        status: safeStatus,
        completed: completed ? 1 : 0,
        last_error_code: completed ? '' : sanitizeRevocationErrorCode(errorCode),
        updated_at: nowIso,
        next_attempt_at: completed ? nowIso : new Date(completedAt.getTime() + delayMs).toISOString()
    });
    const job = getSharedMembershipRevocation(safeRevocationId);
    return job ? { ...job, applied: updated.changes === 1 } : { applied: false };
}

function listSharedMembershipRevocationsForRecovery({ limit = 50, now } = {}) {
    const safeLimit = boundedInteger(limit, 50, 1, 100);
    const nowIso = normalizeDate(now).toISOString();
    return ensureDb().prepare(`
        SELECT * FROM shared_membership_revocations
        WHERE has_pending_token = 1
          AND next_attempt_at <= ?
          AND (
              status = 'remote_failed'
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
    `).all(nowIso, nowIso, safeLimit).map(mapSharedMembershipRevocation);
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
    issueOAuthConnectionAttempt,
    getOAuthConnectionAttempt,
    claimOAuthConnectionAttempt,
    advanceOAuthConnectionAttempt,
    releaseOAuthConnectionAttempt,
    promoteOAuthConnectionAttempt,
    isOAuthSpreadsheetReferenced,
    beginOAuthConnectionCompensation,
    finishOAuthConnectionCompensation,
    listOAuthConnectionCompensationsForRecovery,
    expireOAuthConnectionAttempts,
    completeOAuthConnectionAttempt,
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
    hasUnresolvedSharedMembershipRevocationForUsers,
    beginSharedMembershipRevocationsForLifecycle,
    beginDetachedSharedPermissionRevocation,
    claimSharedMembershipRevocation,
    getSharedMembershipRevocation,
    markSharedMembershipRevocationResult,
    listSharedMembershipRevocationsForRecovery,
    getFinancialScopeUserIds,
    __test__: {
        encryptJson,
        decryptJson,
        decodeEncryptionKey,
        closeDatabaseForTests
    }
};
