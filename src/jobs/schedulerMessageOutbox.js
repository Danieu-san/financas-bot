const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const logger = require('../utils/logger');

const ALLOWED_JOB_KINDS = new Set([
    'event_reminder',
    'bill_reminder',
    'morning_summary',
    'evening_summary',
    'weekly_checkin',
    'monthly_report'
]);
const TERMINAL_STATES = ['delivered_confirmed', 'accepted_unconfirmed', 'dead'];
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BACKOFF_SECONDS = 60;
const DEFAULT_RETENTION_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_LEASE_SECONDS = 120;
const DEFAULT_DRAIN_LIMIT = 100;

function parseIso(value, errorCode) {
    const normalized = value instanceof Date ? value.toISOString() : String(value || '');
    if (!Number.isFinite(Date.parse(normalized))) throw new Error(errorCode);
    return new Date(normalized).toISOString();
}

function decodeEncryptionKey(value) {
    const raw = String(value || '').trim();
    if (!raw) throw new Error('scheduler_outbox_encryption_key_required');
    if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
        throw new Error('scheduler_outbox_encryption_key_invalid');
    }
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length !== 32 || decoded.toString('base64') !== raw) {
        throw new Error('scheduler_outbox_encryption_key_invalid');
    }
    return decoded;
}

function requireBoundedInteger(value, fallback, { minimum, maximum, code }) {
    const resolved = value === undefined ? fallback : Number(value);
    if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
        throw new Error(code);
    }
    return resolved;
}

function ensurePrivateDatabasePath(databasePath) {
    if (databasePath === ':memory:') return;
    const resolved = path.resolve(databasePath);
    const directory = path.dirname(resolved);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);
}

function enforcePrivateDatabaseMode(databasePath) {
    if (databasePath === ':memory:') return;
    for (const candidate of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
        if (fs.existsSync(candidate)) fs.chmodSync(candidate, 0o600);
    }
}

function extractProviderMessageId(result) {
    const id = result?.id;
    if (typeof id === 'string' && id.trim()) return id.trim();
    for (const value of [id?._serialized, id?.id]) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

class SchedulerMessageOutbox {
    constructor({
        databasePath = ':memory:',
        encryptionKey,
        maxAttempts,
        baseBackoffSeconds,
        retentionSeconds
    } = {}) {
        this.encryptionKey = decodeEncryptionKey(encryptionKey);
        this.maxAttempts = requireBoundedInteger(maxAttempts, DEFAULT_MAX_ATTEMPTS, {
            minimum: 1,
            maximum: 20,
            code: 'scheduler_outbox_max_attempts_invalid'
        });
        this.baseBackoffSeconds = requireBoundedInteger(baseBackoffSeconds, DEFAULT_BACKOFF_SECONDS, {
            minimum: 1,
            maximum: 24 * 60 * 60,
            code: 'scheduler_outbox_backoff_invalid'
        });
        this.retentionSeconds = requireBoundedInteger(retentionSeconds, DEFAULT_RETENTION_SECONDS, {
            minimum: 60,
            maximum: 365 * 24 * 60 * 60,
            code: 'scheduler_outbox_retention_invalid'
        });
        this.databasePath = databasePath === ':memory:' ? databasePath : path.resolve(databasePath);
        ensurePrivateDatabasePath(this.databasePath);
        this.db = new Database(this.databasePath);
        this.db.pragma('busy_timeout = 5000');
        this.db.pragma('journal_mode = DELETE');
        this.db.pragma('foreign_keys = ON');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS scheduler_message_outbox (
                job_ref TEXT PRIMARY KEY,
                recipient_ref TEXT NOT NULL,
                job_kind TEXT NOT NULL,
                encrypted_payload TEXT NOT NULL,
                delivery_state TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                available_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                lease_token TEXT,
                lease_expires_at TEXT,
                delivered_at TEXT,
                transport_ref TEXT,
                last_error_code TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_scheduler_message_due
                ON scheduler_message_outbox(delivery_state, available_at, created_at);
        `);
        enforcePrivateDatabaseMode(this.databasePath);
    }

    #assertOpen() {
        if (!this.db) throw new Error('scheduler_outbox_closed');
    }

    #ref(kind, value) {
        return crypto.createHmac('sha256', this.encryptionKey)
            .update(`scheduler-outbox:${kind}:${value}`)
            .digest('hex');
    }

    #payloadKey() {
        return crypto.createHash('sha256')
            .update(Buffer.concat([
                Buffer.from('financasbot:scheduler-outbox:v1:', 'utf8'),
                this.encryptionKey
            ]))
            .digest();
    }

    #encrypt(jobRef, payload) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.#payloadKey(), iv);
        cipher.setAAD(Buffer.from(`scheduler-message:${jobRef}`, 'utf8'));
        const ciphertext = Buffer.concat([
            cipher.update(JSON.stringify(payload), 'utf8'),
            cipher.final()
        ]);
        return [
            iv.toString('base64'),
            cipher.getAuthTag().toString('base64'),
            ciphertext.toString('base64')
        ].join('.');
    }

    #decrypt(jobRef, envelope) {
        const fields = String(envelope || '').split('.');
        if (fields.length !== 3) throw new Error('scheduler_outbox_payload_invalid');
        const [ivValue, tagValue, ciphertextValue] = fields;
        try {
            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                this.#payloadKey(),
                Buffer.from(ivValue, 'base64')
            );
            decipher.setAAD(Buffer.from(`scheduler-message:${jobRef}`, 'utf8'));
            decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
            return JSON.parse(Buffer.concat([
                decipher.update(Buffer.from(ciphertextValue, 'base64')),
                decipher.final()
            ]).toString('utf8'));
        } catch {
            throw new Error('scheduler_outbox_payload_invalid');
        }
    }

    enqueue({
        dedupeKey,
        jobKind,
        recipient,
        message,
        createdAt = new Date().toISOString()
    } = {}) {
        this.#assertOpen();
        const normalizedDedupeKey = String(dedupeKey || '').trim();
        const normalizedRecipient = String(recipient || '').trim();
        const normalizedMessage = String(message || '');
        const normalizedKind = String(jobKind || '').trim();
        const timestamp = parseIso(createdAt, 'scheduler_outbox_created_at_invalid');
        if (!normalizedDedupeKey || normalizedDedupeKey.length > 512) {
            throw new Error('scheduler_outbox_dedupe_key_invalid');
        }
        if (!ALLOWED_JOB_KINDS.has(normalizedKind)) {
            throw new Error('scheduler_outbox_job_kind_invalid');
        }
        if (!normalizedRecipient || !normalizedMessage) {
            throw new Error('scheduler_outbox_payload_required');
        }
        const jobRef = this.#ref('job', normalizedDedupeKey);
        const result = this.db.prepare(`
            INSERT OR IGNORE INTO scheduler_message_outbox (
                job_ref, recipient_ref, job_kind, encrypted_payload, delivery_state,
                attempts, available_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?)
        `).run(
            jobRef,
            this.#ref('recipient', normalizedRecipient),
            normalizedKind,
            this.#encrypt(jobRef, {
                recipient: normalizedRecipient,
                message: normalizedMessage
            }),
            timestamp,
            timestamp,
            timestamp
        );
        enforcePrivateDatabaseMode(this.databasePath);
        return {
            inserted: result.changes === 1,
            jobRef,
            state: result.changes === 1 ? 'pending' : 'existing'
        };
    }

    recoverExpiredAmbiguous({ now = new Date().toISOString() } = {}) {
        this.#assertOpen();
        const timestamp = parseIso(now, 'scheduler_outbox_now_invalid');
        const result = this.db.prepare(`
            UPDATE scheduler_message_outbox
            SET delivery_state='accepted_unconfirmed',
                updated_at=?,
                lease_token=NULL,
                lease_expires_at=NULL,
                last_error_code='ambiguous_after_crash'
            WHERE delivery_state='in_flight' AND lease_expires_at<=?
        `).run(timestamp, timestamp);
        return { recoveredAmbiguous: result.changes };
    }

    claimNext({
        now = new Date().toISOString(),
        leaseSeconds = DEFAULT_LEASE_SECONDS
    } = {}) {
        this.#assertOpen();
        const timestamp = parseIso(now, 'scheduler_outbox_now_invalid');
        const normalizedLeaseSeconds = requireBoundedInteger(leaseSeconds, DEFAULT_LEASE_SECONDS, {
            minimum: 30,
            maximum: 15 * 60,
            code: 'scheduler_outbox_lease_invalid'
        });
        const leaseToken = crypto.randomBytes(24).toString('hex');
        const leaseExpiresAt = new Date(
            Date.parse(timestamp) + normalizedLeaseSeconds * 1000
        ).toISOString();
        return this.db.transaction(() => {
            const row = this.db.prepare(`
                SELECT job_ref, job_kind, encrypted_payload, attempts
                FROM scheduler_message_outbox
                WHERE delivery_state='pending' AND available_at<=?
                ORDER BY available_at, created_at, job_ref
                LIMIT 1
            `).get(timestamp);
            if (!row) return null;
            const update = this.db.prepare(`
                UPDATE scheduler_message_outbox
                SET delivery_state='in_flight',
                    attempts=attempts+1,
                    updated_at=?,
                    lease_token=?,
                    lease_expires_at=?,
                    last_error_code=NULL
                WHERE job_ref=? AND delivery_state='pending'
            `).run(timestamp, leaseToken, leaseExpiresAt, row.job_ref);
            if (!update.changes) return null;
            const payload = this.#decrypt(row.job_ref, row.encrypted_payload);
            return {
                jobRef: row.job_ref,
                jobKind: row.job_kind,
                attempt: row.attempts + 1,
                leaseToken,
                recipient: payload.recipient,
                message: payload.message
            };
        })();
    }

    acknowledgeDelivered({
        jobRef,
        leaseToken,
        providerMessageId,
        now = new Date().toISOString()
    } = {}) {
        this.#assertOpen();
        const timestamp = parseIso(now, 'scheduler_outbox_now_invalid');
        if (!jobRef || !leaseToken || !providerMessageId) {
            throw new Error('scheduler_outbox_ack_fields_required');
        }
        const result = this.db.prepare(`
            UPDATE scheduler_message_outbox
            SET delivery_state='delivered_confirmed',
                updated_at=?,
                delivered_at=?,
                transport_ref=?,
                lease_token=NULL,
                lease_expires_at=NULL,
                last_error_code=NULL
            WHERE job_ref=? AND delivery_state='in_flight' AND lease_token=?
        `).run(
            timestamp,
            timestamp,
            this.#ref('transport', providerMessageId),
            jobRef,
            leaseToken
        );
        if (!result.changes) throw new Error('scheduler_outbox_ack_lease_mismatch');
        return { delivered: true };
    }

    acknowledgeAccepted({
        jobRef,
        leaseToken,
        now = new Date().toISOString()
    } = {}) {
        this.#assertOpen();
        const timestamp = parseIso(now, 'scheduler_outbox_now_invalid');
        if (!jobRef || !leaseToken) throw new Error('scheduler_outbox_ack_fields_required');
        const result = this.db.prepare(`
            UPDATE scheduler_message_outbox
            SET delivery_state='accepted_unconfirmed',
                updated_at=?,
                delivered_at=?,
                lease_token=NULL,
                lease_expires_at=NULL,
                last_error_code='transport_accepted_without_provider_id'
            WHERE job_ref=? AND delivery_state='in_flight' AND lease_token=?
        `).run(timestamp, timestamp, jobRef, leaseToken);
        if (!result.changes) throw new Error('scheduler_outbox_ack_lease_mismatch');
        return { acceptedUnconfirmed: true };
    }

    releaseFailure({
        jobRef,
        leaseToken,
        now = new Date().toISOString()
    } = {}) {
        this.#assertOpen();
        const timestamp = parseIso(now, 'scheduler_outbox_now_invalid');
        if (!jobRef || !leaseToken) throw new Error('scheduler_outbox_release_fields_required');
        const row = this.db.prepare(`
            SELECT attempts FROM scheduler_message_outbox
            WHERE job_ref=? AND delivery_state='in_flight' AND lease_token=?
        `).get(jobRef, leaseToken);
        if (!row) throw new Error('scheduler_outbox_release_lease_mismatch');
        const dead = row.attempts >= this.maxAttempts;
        const delaySeconds = Math.min(
            this.baseBackoffSeconds * (2 ** Math.max(0, row.attempts - 1)),
            24 * 60 * 60
        );
        const availableAt = new Date(Date.parse(timestamp) + delaySeconds * 1000).toISOString();
        this.db.prepare(`
            UPDATE scheduler_message_outbox
            SET delivery_state=?,
                available_at=?,
                updated_at=?,
                lease_token=NULL,
                lease_expires_at=NULL,
                last_error_code='transport_send_failed'
            WHERE job_ref=? AND delivery_state='in_flight' AND lease_token=?
        `).run(dead ? 'dead' : 'pending', availableAt, timestamp, jobRef, leaseToken);
        return {
            retryScheduled: !dead,
            dead
        };
    }

    purgeExpired({ now = new Date().toISOString() } = {}) {
        this.#assertOpen();
        const timestamp = parseIso(now, 'scheduler_outbox_now_invalid');
        const cutoff = new Date(
            Date.parse(timestamp) - this.retentionSeconds * 1000
        ).toISOString();
        const placeholders = TERMINAL_STATES.map(() => '?').join(',');
        const result = this.db.prepare(`
            DELETE FROM scheduler_message_outbox
            WHERE delivery_state IN (${placeholders}) AND updated_at<?
        `).run(...TERMINAL_STATES, cutoff);
        return { purged: result.changes };
    }

    getStateCounts() {
        this.#assertOpen();
        return Object.fromEntries(this.db.prepare(`
            SELECT delivery_state, COUNT(*) AS count
            FROM scheduler_message_outbox
            GROUP BY delivery_state
            ORDER BY delivery_state
        `).all().map(row => [row.delivery_state, row.count]));
    }

    close() {
        if (!this.db) return;
        this.db.close();
        this.db = null;
    }
}

async function drainSchedulerMessageOutbox({
    store,
    client,
    now = new Date().toISOString(),
    limit = DEFAULT_DRAIN_LIMIT
} = {}) {
    if (!store || !client || typeof client.sendMessage !== 'function') {
        throw new Error('scheduler_outbox_transport_required');
    }
    const timestamp = parseIso(now, 'scheduler_outbox_now_invalid');
    const normalizedLimit = requireBoundedInteger(limit, DEFAULT_DRAIN_LIMIT, {
        minimum: 1,
        maximum: 1000,
        code: 'scheduler_outbox_drain_limit_invalid'
    });
    const recovered = store.recoverExpiredAmbiguous({ now: timestamp });
    const purged = store.purgeExpired({ now: timestamp });
    const result = {
        claimed: 0,
        delivered: 0,
        acceptedUnconfirmed: 0,
        retryScheduled: 0,
        dead: 0,
        confirmationAmbiguous: 0,
        stateUpdateFailures: 0,
        recoveredAmbiguous: recovered.recoveredAmbiguous,
        purged: purged.purged
    };
    for (let index = 0; index < normalizedLimit; index += 1) {
        const job = store.claimNext({ now: timestamp });
        if (!job) break;
        result.claimed += 1;
        let transportResult;
        try {
            transportResult = await client.sendMessage(job.recipient, job.message);
        } catch {
            try {
                const released = store.releaseFailure({
                    jobRef: job.jobRef,
                    leaseToken: job.leaseToken,
                    now: timestamp
                });
                if (released.dead) result.dead += 1;
                else result.retryScheduled += 1;
            } catch {
                result.stateUpdateFailures += 1;
            }
            continue;
        }
        try {
            const providerMessageId = extractProviderMessageId(transportResult);
            if (providerMessageId) {
                store.acknowledgeDelivered({
                    jobRef: job.jobRef,
                    leaseToken: job.leaseToken,
                    providerMessageId,
                    now: timestamp
                });
                result.delivered += 1;
            } else {
                store.acknowledgeAccepted({
                    jobRef: job.jobRef,
                    leaseToken: job.leaseToken,
                    now: timestamp
                });
                result.acceptedUnconfirmed += 1;
            }
        } catch {
            // The transport already resolved. Keep the lease in-flight so its
            // expiry becomes accepted_unconfirmed instead of retrying blindly.
            result.confirmationAmbiguous += 1;
        }
    }
    return result;
}

let runtimeStore = null;
let runtimeSignature = '';

function getRuntimeStore(env = process.env) {
    const databasePath = String(
        env.SCHEDULER_OUTBOX_DB_PATH
        || path.resolve(process.cwd(), 'data', 'scheduler-message-outbox.sqlite')
    ).trim();
    const encryptionKey = String(env.STATE_STORE_ENCRYPTION_KEY || '').trim();
    const signature = crypto.createHash('sha256')
        .update(`${databasePath}\0${encryptionKey}`)
        .digest('hex');
    if (runtimeStore && runtimeSignature === signature) return runtimeStore;
    if (runtimeStore) runtimeStore.close();
    runtimeStore = new SchedulerMessageOutbox({ databasePath, encryptionKey });
    runtimeSignature = signature;
    return runtimeStore;
}

async function enqueueAndDrainScheduledMessage({
    client,
    recipient,
    message,
    jobKind,
    dedupeKey,
    now = new Date()
} = {}) {
    try {
        const timestamp = parseIso(now, 'scheduler_outbox_now_invalid');
        const store = getRuntimeStore();
        const queued = store.enqueue({
            recipient,
            message,
            jobKind,
            dedupeKey,
            createdAt: timestamp
        });
        const delivery = await drainSchedulerMessageOutbox({
            store,
            client,
            now: timestamp
        });
        return {
            queued: queued.inserted,
            ...delivery
        };
    } catch {
        logger.error('[scheduler-outbox] dispatch_failed code=scheduler_outbox_unavailable');
        return {
            queued: false,
            claimed: 0,
            delivered: 0,
            acceptedUnconfirmed: 0,
            retryScheduled: 0,
            dead: 0,
            confirmationAmbiguous: 0,
            stateUpdateFailures: 0,
            recoveredAmbiguous: 0,
            purged: 0,
            errorCode: 'SCHEDULER_OUTBOX_UNAVAILABLE'
        };
    }
}

async function drainScheduledMessages({ client, now = new Date() } = {}) {
    try {
        return await drainSchedulerMessageOutbox({
            store: getRuntimeStore(),
            client,
            now
        });
    } catch {
        logger.error('[scheduler-outbox] drain_failed code=scheduler_outbox_unavailable');
        return {
            claimed: 0,
            delivered: 0,
            acceptedUnconfirmed: 0,
            retryScheduled: 0,
            dead: 0,
            confirmationAmbiguous: 0,
            stateUpdateFailures: 0,
            recoveredAmbiguous: 0,
            purged: 0,
            errorCode: 'SCHEDULER_OUTBOX_UNAVAILABLE'
        };
    }
}

function resetRuntimeStoreForTest() {
    if (runtimeStore) runtimeStore.close();
    runtimeStore = null;
    runtimeSignature = '';
}

module.exports = {
    SchedulerMessageOutbox,
    drainSchedulerMessageOutbox,
    enqueueAndDrainScheduledMessage,
    drainScheduledMessages,
    __test__: {
        decodeEncryptionKey,
        extractProviderMessageId,
        resetRuntimeStoreForTest
    }
};
