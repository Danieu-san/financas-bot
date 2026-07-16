const crypto = require('node:crypto');
const Database = require('better-sqlite3');

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_shadow_preview_secret_required');
    return value;
}

class OpenFinanceShadowPreviewStore {
    constructor({ databasePath = ':memory:', secret } = {}) {
        this.secret = requireSecret(secret);
        this.db = new Database(databasePath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS shadow_preview_items (
                preview_ref TEXT PRIMARY KEY,
                transaction_ref TEXT NOT NULL UNIQUE,
                encrypted_payload TEXT NOT NULL,
                reconciliation_status TEXT NOT NULL,
                rule_code TEXT NOT NULL,
                review_state TEXT NOT NULL DEFAULT 'pending',
                review_action TEXT,
                created_at TEXT NOT NULL,
                reviewed_at TEXT
            );
        `);
    }

    #hmac(value) {
        return crypto.createHmac('sha256', this.secret).update(String(value || '')).digest('hex').slice(0, 32);
    }

    #key() {
        return crypto.createHash('sha256').update(`open-finance-shadow-preview:${this.secret}`).digest();
    }

    #encrypt(ref, payload) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.#key(), iv);
        cipher.setAAD(Buffer.from(ref));
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
        return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
    }

    #decrypt(ref, payload) {
        const [iv, tag, encrypted] = String(payload).split('.');
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.#key(), Buffer.from(iv, 'base64'));
        decipher.setAAD(Buffer.from(ref));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8'));
    }

    ingest({ decisions = [], openFinanceItems = [], canonicalTransactions = [], observedAt = new Date().toISOString() } = {}) {
        const sources = new Map();
        for (const item of openFinanceItems) {
            for (const transaction of item.transactions || []) {
                sources.set(this.#hmac(`${item.id}:${transaction.id}`), { alias: item.alias_code, transaction });
            }
        }
        const canonical = new Map(canonicalTransactions.map((transaction, index) => [
            this.#hmac(transaction.id || index), transaction
        ]));
        let inserted = 0;
        let replayed = 0;
        const statement = this.db.prepare(`
            INSERT OR IGNORE INTO shadow_preview_items (
                preview_ref, transaction_ref, encrypted_payload, reconciliation_status,
                rule_code, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
        `);
        const transaction = this.db.transaction(() => {
            for (const decision of decisions.filter(row => ['possible_duplicate', 'uncertain'].includes(row.status))) {
                const source = sources.get(decision.transaction_ref);
                if (!source) throw new Error('shadow_preview_source_unavailable');
                const previewRef = this.#hmac(`preview:${decision.transaction_ref}`);
                const payload = {
                    alias: source.alias,
                    source: source.transaction,
                    canonical: decision.canonical_ref ? canonical.get(decision.canonical_ref) || null : null,
                    status: decision.status,
                    rule: decision.rule,
                    confidence_band: decision.confidence_band
                };
                const result = statement.run(
                    previewRef, decision.transaction_ref, this.#encrypt(previewRef, payload),
                    decision.status, decision.rule, observedAt
                );
                if (result.changes) inserted += 1; else replayed += 1;
            }
        });
        transaction();
        return { inserted, replayed, reviewable: inserted + replayed, financial_writes: 0 };
    }

    listPending() {
        return this.db.prepare(`
            SELECT preview_ref, reconciliation_status AS status, rule_code AS rule, created_at
            FROM shadow_preview_items WHERE review_state = 'pending' ORDER BY created_at, preview_ref
        `).all();
    }

    readPrivate(previewRef) {
        const row = this.db.prepare('SELECT encrypted_payload FROM shadow_preview_items WHERE preview_ref = ?').get(previewRef);
        return row ? this.#decrypt(previewRef, row.encrypted_payload) : null;
    }

    review(previewRef, action, reviewedAt = new Date().toISOString()) {
        if (!['confirm_duplicate', 'not_duplicate', 'ignore'].includes(action)) throw new Error('invalid_shadow_review_action');
        const row = this.db.prepare('SELECT review_state, review_action FROM shadow_preview_items WHERE preview_ref = ?').get(previewRef);
        if (!row) throw new Error('shadow_preview_not_found');
        if (row.review_state === 'reviewed') {
            if (row.review_action === action) return { applied: false, replay: true, financial_writes: 0 };
            throw new Error('shadow_preview_review_conflict');
        }
        this.db.prepare(`UPDATE shadow_preview_items SET review_state='reviewed', review_action=?, reviewed_at=? WHERE preview_ref=?`)
            .run(action, reviewedAt, previewRef);
        return { applied: true, replay: false, financial_writes: 0 };
    }

    close() { this.db.close(); }
}

module.exports = { OpenFinanceShadowPreviewStore };
