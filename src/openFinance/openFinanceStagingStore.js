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
        `);
    }

    #ref(kind, value) {
        return crypto.createHmac('sha256', this.secret).update(`${kind}:${value}`).digest('hex');
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
