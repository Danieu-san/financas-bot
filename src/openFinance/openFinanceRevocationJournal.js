const crypto = require('node:crypto');
const Database = require('better-sqlite3');

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_revocation_journal_secret_required');
    return value;
}

function normalizeAlias(alias) {
    const value = String(alias || '').toLowerCase();
    if (!/^[a-z0-9_-]{2,48}$/.test(value)) throw new Error('valid_revocation_alias_required');
    return value;
}

function normalizeGeneration(generation) {
    const value = Number(generation || 1);
    if (!Number.isInteger(value) || value < 1 || value > 1000000) throw new Error('valid_revocation_generation_required');
    return value;
}

class OpenFinanceRevocationJournal {
    constructor({ databasePath = ':memory:', secret } = {}) {
        this.secret = requireSecret(secret);
        this.db = new Database(databasePath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS open_finance_revocation_journal (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                alias_ref TEXT NOT NULL,
                generation INTEGER NOT NULL,
                revoked_at TEXT NOT NULL,
                key_version INTEGER NOT NULL,
                reason_code TEXT NOT NULL,
                UNIQUE(alias_ref,generation)
            );
        `);
    }

    #ref(alias) {
        return crypto.createHmac('sha256', this.secret)
            .update(`open-finance-revocation-lineage:${normalizeAlias(alias)}`).digest('hex').slice(0, 32);
    }

    recordRevocation({ alias, generation = 1, revokedAt = new Date().toISOString(),
        keyVersion = 1, reasonCode = 'consent_revoked' } = {}) {
        const aliasRef = this.#ref(alias);
        const normalizedGeneration = normalizeGeneration(generation);
        const timestamp = new Date(revokedAt);
        if (Number.isNaN(timestamp.getTime())) throw new Error('valid_revocation_time_required');
        if (!Number.isInteger(keyVersion) || keyVersion < 1 || keyVersion > 1000000) {
            throw new Error('valid_revocation_key_version_required');
        }
        const result = this.db.prepare(`INSERT OR IGNORE INTO open_finance_revocation_journal
            (alias_ref,generation,revoked_at,key_version,reason_code) VALUES (?,?,?,?,?)`).run(
            aliasRef, normalizedGeneration, timestamp.toISOString(), keyVersion,
            String(reasonCode || 'consent_revoked').slice(0, 64)
        );
        const row = this.db.prepare(`SELECT sequence,revoked_at,key_version FROM open_finance_revocation_journal
            WHERE alias_ref=? AND generation=?`).get(aliasRef, normalizedGeneration);
        return { recorded: result.changes === 1, replay: result.changes === 0,
            sequence: row.sequence, generation: normalizedGeneration, key_version: row.key_version,
            revoked_at: row.revoked_at, financial_writes: 0 };
    }

    revokedGeneration(alias) {
        const row = this.db.prepare(`SELECT MAX(generation) AS generation FROM open_finance_revocation_journal
            WHERE alias_ref=?`).get(this.#ref(alias));
        return row?.generation || 0;
    }

    isGenerationRevoked(alias, generation = 1) {
        return normalizeGeneration(generation) <= this.revokedGeneration(alias);
    }

    checkpoint() {
        const row = this.db.prepare(`SELECT COUNT(*) AS entries,COALESCE(MAX(sequence),0) AS sequence,
            MAX(revoked_at) AS latest_revoked_at FROM open_finance_revocation_journal`).get();
        return Object.freeze({ schema: 'open-finance-revocation-journal-v1', entries: row.entries,
            sequence: row.sequence, latest_revoked_at: row.latest_revoked_at || null, financial_writes: 0 });
    }

    reapplyRevocations({ mappings = [], vault, baseline, outbox } = {}) {
        if (!vault?.revokeItem || !baseline?.revokeConnection || !outbox?.revokeSourceAlias) {
            throw new Error('revocation_reapply_stores_required');
        }
        const applied = [];
        for (const mapping of mappings) {
            const alias = normalizeAlias(mapping.alias);
            const generation = normalizeGeneration(mapping.generation || 1);
            if (!this.isGenerationRevoked(alias, generation)) continue;
            if (!String(mapping.itemId || '').trim()) throw new Error('revoked_mapping_item_id_required');
            const options = { revokedAt: new Date().toISOString(), reasonCode: 'journal_reapplied_after_restore' };
            outbox.revokeSourceAlias(alias, options);
            baseline.revokeConnection(alias, options);
            vault.revokeItem(String(mapping.itemId), options);
            applied.push({ alias, generation });
        }
        return { reapplied: applied.length, revoked_mappings: applied, financial_writes: 0 };
    }

    close() { this.db.close(); }
}

module.exports = { OpenFinanceRevocationJournal };
