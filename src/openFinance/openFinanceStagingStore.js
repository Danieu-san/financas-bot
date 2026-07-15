const crypto = require('crypto');
const Database = require('better-sqlite3');

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 16) throw new Error('open_finance_hmac_secret_required');
    return value;
}

class OpenFinanceStagingStore {
    constructor(options = {}) {
        this.secret = requireSecret(options.hmacSecret);
        this.db = new Database(options.databasePath || ':memory:');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('journal_mode = WAL');
        this.#migrate();
    }

    #migrate() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS staging_events (
                event_ref TEXT PRIMARY KEY,
                item_ref TEXT NOT NULL,
                observed_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS staging_items (
                item_ref TEXT PRIMARY KEY,
                connector_ref TEXT NOT NULL,
                status TEXT NOT NULL,
                observed_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS staging_accounts (
                account_ref TEXT PRIMARY KEY,
                item_ref TEXT NOT NULL REFERENCES staging_items(item_ref) ON DELETE CASCADE,
                type TEXT NOT NULL,
                subtype TEXT NOT NULL,
                currency TEXT NOT NULL,
                balance_cents INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS staging_transactions (
                transaction_ref TEXT PRIMARY KEY,
                item_ref TEXT NOT NULL REFERENCES staging_items(item_ref) ON DELETE CASCADE,
                account_ref TEXT NOT NULL REFERENCES staging_accounts(account_ref) ON DELETE CASCADE,
                description TEXT NOT NULL,
                amount_cents INTEGER NOT NULL,
                currency TEXT NOT NULL,
                transaction_date TEXT NOT NULL,
                status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS staging_bills (
                bill_ref TEXT PRIMARY KEY,
                item_ref TEXT NOT NULL REFERENCES staging_items(item_ref) ON DELETE CASCADE,
                account_ref TEXT NOT NULL REFERENCES staging_accounts(account_ref) ON DELETE CASCADE,
                due_date TEXT NOT NULL,
                total_cents INTEGER NOT NULL,
                currency TEXT NOT NULL,
                status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS staging_revocations (
                item_ref TEXT PRIMARY KEY,
                revoked_at TEXT NOT NULL,
                reason_code TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS staging_webhook_inbox (
                event_ref TEXT PRIMARY KEY,
                item_ref TEXT NOT NULL,
                event_type TEXT NOT NULL,
                encrypted_job TEXT,
                status TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                available_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                completed_at TEXT,
                failure_code TEXT
            );
            CREATE TABLE IF NOT EXISTS staging_poll_state (
                item_ref TEXT PRIMARY KEY,
                lease_ref TEXT,
                lease_until TEXT,
                last_started_at TEXT,
                last_success_at TEXT,
                next_allowed_at TEXT,
                consecutive_failures INTEGER NOT NULL DEFAULT 0
            );
        `);
        this.db.prepare("UPDATE staging_webhook_inbox SET status = 'pending' WHERE status = 'processing'").run();
    }

    #ref(kind, value) {
        return crypto.createHmac('sha256', this.secret).update(`${kind}:${value}`).digest('hex');
    }

    #encryptionKey() {
        return crypto.createHash('sha256').update(`open-finance-inbox:${this.secret}`).digest();
    }

    #encryptJob(job) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.#encryptionKey(), iv);
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(job), 'utf8'), cipher.final()]);
        return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
    }

    #decryptJob(value) {
        const [ivText, tagText, encryptedText] = String(value || '').split('.');
        if (!ivText || !tagText || !encryptedText) throw new Error('invalid_encrypted_webhook_job');
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.#encryptionKey(), Buffer.from(ivText, 'base64'));
        decipher.setAuthTag(Buffer.from(tagText, 'base64'));
        const clear = Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64')), decipher.final()]);
        return JSON.parse(clear.toString('utf8'));
    }

    ingestSnapshot(snapshot) {
        if (!snapshot || snapshot.mode !== 'sandbox' || snapshot.provider !== 'pluggy') {
            throw new Error('sandbox_snapshot_required');
        }
        const eventRef = this.#ref('event', snapshot.event_id);
        const itemRef = this.#ref('item', snapshot.item.id);
        if (this.db.prepare('SELECT 1 FROM staging_revocations WHERE item_ref = ?').get(itemRef)) {
            return { applied: false, replay: false, blocked: true, reason: 'item_revoked' };
        }
        if (this.db.prepare('SELECT 1 FROM staging_events WHERE event_ref = ?').get(eventRef)) {
            return { applied: false, replay: true, event_ref: eventRef };
        }

        const accountRef = (id) => this.#ref('account', id);
        const transaction = this.db.transaction(() => {
            this.db.prepare(`
                INSERT INTO staging_items (item_ref, connector_ref, status, observed_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(item_ref) DO UPDATE SET
                    connector_ref = excluded.connector_ref,
                    status = excluded.status,
                    observed_at = excluded.observed_at
            `).run(itemRef, this.#ref('connector', snapshot.item.connector_id), snapshot.item.status, snapshot.observed_at);

            const accountStatement = this.db.prepare(`
                INSERT INTO staging_accounts
                    (account_ref, item_ref, type, subtype, currency, balance_cents)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(account_ref) DO UPDATE SET
                    type = excluded.type,
                    subtype = excluded.subtype,
                    currency = excluded.currency,
                    balance_cents = excluded.balance_cents
            `);
            for (const account of snapshot.accounts) {
                accountStatement.run(accountRef(account.id), itemRef, account.type, account.subtype, account.currency, account.balance_cents);
            }

            const transactionStatement = this.db.prepare(`
                INSERT INTO staging_transactions
                    (transaction_ref, item_ref, account_ref, description, amount_cents, currency, transaction_date, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(transaction_ref) DO UPDATE SET
                    description = excluded.description,
                    amount_cents = excluded.amount_cents,
                    currency = excluded.currency,
                    transaction_date = excluded.transaction_date,
                    status = excluded.status
            `);
            const deleteTransaction = this.db.prepare('DELETE FROM staging_transactions WHERE transaction_ref = ?');
            for (const entry of snapshot.transactions) {
                const transactionRef = this.#ref('transaction', entry.id);
                if (entry.deleted) {
                    deleteTransaction.run(transactionRef);
                } else {
                    transactionStatement.run(transactionRef, itemRef, accountRef(entry.account_id), entry.description, entry.amount_cents, entry.currency, entry.date, entry.status);
                }
            }

            const billStatement = this.db.prepare(`
                INSERT INTO staging_bills
                    (bill_ref, item_ref, account_ref, due_date, total_cents, currency, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(bill_ref) DO UPDATE SET
                    due_date = excluded.due_date,
                    total_cents = excluded.total_cents,
                    currency = excluded.currency,
                    status = excluded.status
            `);
            for (const bill of snapshot.bills) {
                billStatement.run(this.#ref('bill', bill.id), itemRef, accountRef(bill.account_id), bill.due_date, bill.total_cents, bill.currency, bill.status);
            }

            this.db.prepare('INSERT INTO staging_events (event_ref, item_ref, observed_at) VALUES (?, ?, ?)')
                .run(eventRef, itemRef, snapshot.observed_at);
        });
        transaction();
        return { applied: true, replay: false, event_ref: eventRef };
    }

    revokeItem(itemId, options = {}) {
        const itemRef = this.#ref('item', itemId);
        const revokedAt = options.revokedAt || new Date().toISOString();
        const reasonCode = String(options.reasonCode || 'consent_revoked');
        const transaction = this.db.transaction(() => {
            this.db.prepare('DELETE FROM staging_items WHERE item_ref = ?').run(itemRef);
            this.db.prepare('DELETE FROM staging_events WHERE item_ref = ?').run(itemRef);
            this.db.prepare(`
                INSERT INTO staging_revocations (item_ref, revoked_at, reason_code)
                VALUES (?, ?, ?)
                ON CONFLICT(item_ref) DO UPDATE SET revoked_at = excluded.revoked_at, reason_code = excluded.reason_code
            `).run(itemRef, revokedAt, reasonCode);
        });
        transaction();
        return { revoked: true, item_ref: itemRef };
    }

    enqueueWebhookJob(job, options = {}) {
        if (!job || !job.event_id || !job.item_id || !job.event || !job.action) throw new Error('invalid_webhook_job');
        const now = options.now || new Date().toISOString();
        const eventRef = this.#ref('webhook_event', job.event_id);
        const result = this.db.prepare(`
            INSERT OR IGNORE INTO staging_webhook_inbox
                (event_ref, item_ref, event_type, encrypted_job, status, attempts, available_at, created_at)
            VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)
        `).run(eventRef, this.#ref('item', job.item_id), String(job.event), this.#encryptJob(job), now, now);
        return { queued: result.changes === 1, replay: result.changes === 0, event_ref: eventRef };
    }

    claimNextWebhookJob(options = {}) {
        const now = options.now || new Date().toISOString();
        const claim = this.db.transaction(() => {
            const row = this.db.prepare(`
                SELECT event_ref, encrypted_job, attempts
                FROM staging_webhook_inbox
                WHERE status = 'pending' AND available_at <= ?
                ORDER BY created_at, event_ref
                LIMIT 1
            `).get(now);
            if (!row) return null;
            const updated = this.db.prepare(`
                UPDATE staging_webhook_inbox
                SET status = 'processing', attempts = attempts + 1
                WHERE event_ref = ? AND status = 'pending'
            `).run(row.event_ref);
            if (updated.changes !== 1) return null;
            return { event_ref: row.event_ref, attempts: row.attempts + 1, job: this.#decryptJob(row.encrypted_job) };
        });
        return claim();
    }

    completeWebhookJob(eventRef, options = {}) {
        const completedAt = options.completedAt || new Date().toISOString();
        const result = this.db.prepare(`
            UPDATE staging_webhook_inbox
            SET status = 'completed', encrypted_job = NULL, completed_at = ?, failure_code = NULL
            WHERE event_ref = ? AND status = 'processing'
        `).run(completedAt, eventRef);
        return result.changes === 1;
    }

    retryWebhookJob(eventRef, retryAfterSeconds, options = {}) {
        const seconds = Math.min(3600, Math.max(1, Number(retryAfterSeconds) || 60));
        const base = new Date(options.now || new Date().toISOString());
        const availableAt = new Date(base.getTime() + (seconds * 1000)).toISOString();
        const result = this.db.prepare(`
            UPDATE staging_webhook_inbox
            SET status = 'pending', available_at = ?, failure_code = 'retry_scheduled'
            WHERE event_ref = ? AND status = 'processing'
        `).run(availableAt, eventRef);
        return { scheduled: result.changes === 1, available_at: availableAt };
    }

    failWebhookJob(eventRef, failureCode = 'processing_failed') {
        const result = this.db.prepare(`
            UPDATE staging_webhook_inbox
            SET status = 'failed', encrypted_job = NULL, failure_code = ?
            WHERE event_ref = ? AND status = 'processing'
        `).run(String(failureCode).slice(0, 64), eventRef);
        return result.changes === 1;
    }

    webhookInboxStats() {
        const rows = this.db.prepare('SELECT status, COUNT(*) AS total FROM staging_webhook_inbox GROUP BY status').all();
        const stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
        for (const row of rows) if (Object.hasOwn(stats, row.status)) stats[row.status] = row.total;
        return Object.freeze(stats);
    }

    acquirePollingLease(itemId, options = {}) {
        const now = new Date(options.now || new Date().toISOString());
        if (Number.isNaN(now.getTime())) throw new Error('invalid_poll_time');
        const leaseSeconds = Math.min(3600, Math.max(30, Number(options.leaseSeconds) || 300));
        const itemRef = this.#ref('item', itemId);
        const leaseToken = crypto.randomUUID();
        const leaseRef = this.#ref('poll_lease', leaseToken);
        const leaseUntil = new Date(now.getTime() + (leaseSeconds * 1000)).toISOString();
        const acquire = this.db.transaction(() => {
            const current = this.db.prepare('SELECT lease_until, next_allowed_at FROM staging_poll_state WHERE item_ref = ?').get(itemRef);
            if (current?.lease_until && current.lease_until > now.toISOString()) {
                return { acquired: false, reason: 'overlap', retry_at: current.lease_until };
            }
            if (current?.next_allowed_at && current.next_allowed_at > now.toISOString()) {
                return { acquired: false, reason: 'interval', retry_at: current.next_allowed_at };
            }
            this.db.prepare(`
                INSERT INTO staging_poll_state (item_ref, lease_ref, lease_until, last_started_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(item_ref) DO UPDATE SET
                    lease_ref = excluded.lease_ref,
                    lease_until = excluded.lease_until,
                    last_started_at = excluded.last_started_at
            `).run(itemRef, leaseRef, leaseUntil, now.toISOString());
            return { acquired: true, lease_token: leaseToken, lease_until: leaseUntil };
        });
        return acquire();
    }

    completePollingLease(itemId, leaseToken, options = {}) {
        const now = new Date(options.now || new Date().toISOString());
        const intervalSeconds = Math.max(21600, Number(options.intervalSeconds) || 21600);
        const nextAllowedAt = new Date(now.getTime() + (intervalSeconds * 1000)).toISOString();
        const result = this.db.prepare(`
            UPDATE staging_poll_state
            SET lease_ref = NULL, lease_until = NULL, last_success_at = ?, next_allowed_at = ?, consecutive_failures = 0
            WHERE item_ref = ? AND lease_ref = ?
        `).run(now.toISOString(), nextAllowedAt, this.#ref('item', itemId), this.#ref('poll_lease', leaseToken));
        return { completed: result.changes === 1, next_allowed_at: nextAllowedAt };
    }

    failPollingLease(itemId, leaseToken, options = {}) {
        const now = new Date(options.now || new Date().toISOString());
        const requestedBackoff = Math.max(60, Number(options.retryAfterSeconds) || 60);
        const row = this.db.prepare('SELECT consecutive_failures FROM staging_poll_state WHERE item_ref = ?').get(this.#ref('item', itemId));
        const failures = (row?.consecutive_failures || 0) + 1;
        const backoffSeconds = Math.min(21600, requestedBackoff * (2 ** Math.min(5, failures - 1)));
        const nextAllowedAt = new Date(now.getTime() + (backoffSeconds * 1000)).toISOString();
        const result = this.db.prepare(`
            UPDATE staging_poll_state
            SET lease_ref = NULL, lease_until = NULL, next_allowed_at = ?, consecutive_failures = ?
            WHERE item_ref = ? AND lease_ref = ?
        `).run(nextAllowedAt, failures, this.#ref('item', itemId), this.#ref('poll_lease', leaseToken));
        return { failed: result.changes === 1, next_allowed_at: nextAllowedAt, consecutive_failures: failures };
    }

    pollingStats() {
        const row = this.db.prepare(`
            SELECT COUNT(*) AS items,
                   SUM(CASE WHEN lease_ref IS NOT NULL THEN 1 ELSE 0 END) AS leased,
                   SUM(CASE WHEN consecutive_failures > 0 THEN 1 ELSE 0 END) AS failing
            FROM staging_poll_state
        `).get();
        return Object.freeze({ items: row.items || 0, leased: row.leased || 0, failing: row.failing || 0 });
    }

    stats() {
        const count = (table) => this.db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total;
        return Object.freeze({
            events: count('staging_events'),
            items: count('staging_items'),
            accounts: count('staging_accounts'),
            transactions: count('staging_transactions'),
            bills: count('staging_bills'),
            revocations: count('staging_revocations')
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = { OpenFinanceStagingStore };
