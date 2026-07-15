const crypto = require('crypto');
const Database = require('better-sqlite3');

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_live_staging_secret_required');
    return value;
}

class OpenFinanceLiveStagingVault {
    constructor(options = {}) {
        this.secret = requireSecret(options.secret);
        this.db = new Database(options.databasePath || ':memory:');
        this.db.pragma('journal_mode = WAL');
        this.#migrate();
    }

    #migrate() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS live_staging_events (
                event_ref TEXT PRIMARY KEY,
                observed_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS live_staging_items (
                item_ref TEXT PRIMARY KEY,
                alias_ref TEXT NOT NULL UNIQUE,
                encrypted_payload TEXT NOT NULL,
                observed_at TEXT NOT NULL,
                accounts_count INTEGER NOT NULL,
                transactions_count INTEGER NOT NULL,
                bills_count INTEGER NOT NULL,
                investments_count INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS live_staging_revocations (
                item_ref TEXT PRIMARY KEY,
                revoked_at TEXT NOT NULL,
                reason_code TEXT NOT NULL
            );
        `);
    }

    #ref(kind, value) {
        return crypto.createHmac('sha256', this.secret).update(`${kind}:${value}`).digest('hex');
    }

    #key() {
        return crypto.createHash('sha256').update(`open-finance-live-staging:${this.secret}`).digest();
    }

    #encrypt(itemRef, payload) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.#key(), iv);
        cipher.setAAD(Buffer.from(itemRef));
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
        return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
    }

    #decrypt(itemRef, payload) {
        const [ivText, tagText, encryptedText] = String(payload || '').split('.');
        if (!ivText || !tagText || !encryptedText) throw new Error('invalid_live_staging_payload');
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.#key(), Buffer.from(ivText, 'base64'));
        decipher.setAAD(Buffer.from(itemRef));
        decipher.setAuthTag(Buffer.from(tagText, 'base64'));
        const clear = Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64')), decipher.final()]);
        return JSON.parse(clear.toString('utf8'));
    }

    ingestSnapshot(snapshot) {
        if (snapshot?.provider !== 'pluggy' || snapshot?.mode !== 'live_readonly_staging') {
            throw new Error('pluggy_live_readonly_snapshot_required');
        }
        const eventRef = this.#ref('event', snapshot.event_id);
        if (this.db.prepare('SELECT 1 FROM live_staging_events WHERE event_ref = ?').get(eventRef)) {
            return { applied: false, replay: true, staged_items: 0, blocked_items: 0, financial_writes: 0 };
        }
        let stagedItems = 0;
        let blockedItems = 0;
        const transaction = this.db.transaction(() => {
            const statement = this.db.prepare(`
                INSERT INTO live_staging_items (
                    item_ref, alias_ref, encrypted_payload, observed_at,
                    accounts_count, transactions_count, bills_count, investments_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(item_ref) DO UPDATE SET
                    alias_ref = excluded.alias_ref,
                    encrypted_payload = excluded.encrypted_payload,
                    observed_at = excluded.observed_at,
                    accounts_count = excluded.accounts_count,
                    transactions_count = excluded.transactions_count,
                    bills_count = excluded.bills_count,
                    investments_count = excluded.investments_count
            `);
            for (const item of snapshot.items) {
                const itemRef = this.#ref('item', item.id);
                if (this.db.prepare('SELECT 1 FROM live_staging_revocations WHERE item_ref = ?').get(itemRef)) {
                    blockedItems += 1;
                    continue;
                }
                statement.run(
                    itemRef,
                    this.#ref('alias', item.alias_code),
                    this.#encrypt(itemRef, item),
                    snapshot.observed_at,
                    item.accounts.length,
                    item.transactions.length,
                    item.bills.length,
                    item.investments.length
                );
                stagedItems += 1;
            }
            this.db.prepare('INSERT INTO live_staging_events (event_ref, observed_at) VALUES (?, ?)')
                .run(eventRef, snapshot.observed_at);
        });
        transaction();
        return { applied: true, replay: false, staged_items: stagedItems, blocked_items: blockedItems, financial_writes: 0 };
    }

    readItemByAlias(alias) {
        const row = this.db.prepare('SELECT item_ref, encrypted_payload FROM live_staging_items WHERE alias_ref = ?')
            .get(this.#ref('alias', String(alias || '').toLowerCase()));
        return row ? this.#decrypt(row.item_ref, row.encrypted_payload) : null;
    }

    revokeItem(itemId, options = {}) {
        const itemRef = this.#ref('item', itemId);
        const transaction = this.db.transaction(() => {
            this.db.prepare('DELETE FROM live_staging_items WHERE item_ref = ?').run(itemRef);
            this.db.prepare(`
                INSERT INTO live_staging_revocations (item_ref, revoked_at, reason_code)
                VALUES (?, ?, ?)
                ON CONFLICT(item_ref) DO UPDATE SET
                    revoked_at = excluded.revoked_at,
                    reason_code = excluded.reason_code
            `).run(
                itemRef,
                options.revokedAt || new Date().toISOString(),
                String(options.reasonCode || 'consent_revoked').slice(0, 64)
            );
        });
        transaction();
        return { revoked: true, item_ref: itemRef, financial_writes: 0 };
    }

    stats() {
        const totals = this.db.prepare(`
            SELECT
                COUNT(*) AS items,
                COALESCE(SUM(accounts_count), 0) AS accounts,
                COALESCE(SUM(transactions_count), 0) AS transactions,
                COALESCE(SUM(bills_count), 0) AS bills,
                COALESCE(SUM(investments_count), 0) AS investments
            FROM live_staging_items
        `).get();
        return Object.freeze({
            events: this.db.prepare('SELECT COUNT(*) AS total FROM live_staging_events').get().total,
            items: totals.items,
            accounts: totals.accounts,
            transactions: totals.transactions,
            bills: totals.bills,
            investments: totals.investments,
            revocations: this.db.prepare('SELECT COUNT(*) AS total FROM live_staging_revocations').get().total,
            financial_writes: 0
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = { OpenFinanceLiveStagingVault };
