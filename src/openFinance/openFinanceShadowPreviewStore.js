const crypto = require('node:crypto');
const fs = require('node:fs');
const Database = require('better-sqlite3');

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_shadow_preview_secret_required');
    return value;
}

function validTimestamp(value, reason) {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) throw new Error(reason);
    return timestamp;
}

function validGeneration(value) {
    const generation = Number(value || 1);
    if (!Number.isInteger(generation) || generation < 1 || generation > 1000000) {
        throw new Error('valid_shadow_preview_generation_required');
    }
    return generation;
}

class OpenFinanceShadowPreviewStore {
    constructor({ databasePath = ':memory:', secret, retentionDays = 30,
        familyScope = 'shared-family', revocationJournal, authorizedWhatsAppIds = [],
        clock = () => new Date() } = {}) {
        this.secret = requireSecret(secret);
        if (!Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 90) {
            throw new Error('open_finance_shadow_preview_retention_out_of_range');
        }
        this.databasePath = databasePath;
        this.retentionDays = retentionDays;
        this.familyScopeRef = this.#hmac(`family:${String(familyScope || 'shared-family')}`);
        this.authorizedActorRefs = new Set(authorizedWhatsAppIds.map(value => this.#actorRef(value)));
        this.revocationJournal = revocationJournal;
        this.clock = clock;
        this.db = new Database(databasePath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS shadow_preview_items (
                preview_ref TEXT PRIMARY KEY,
                transaction_ref TEXT NOT NULL UNIQUE,
                family_scope_ref TEXT NOT NULL,
                alias_ref TEXT NOT NULL,
                generation INTEGER NOT NULL,
                encrypted_payload TEXT NOT NULL,
                payload_version INTEGER NOT NULL,
                reconciliation_status TEXT NOT NULL,
                rule_code TEXT NOT NULL,
                review_state TEXT NOT NULL DEFAULT 'pending',
                review_action TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                claimed_by_ref TEXT,
                reviewed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS open_finance_save_proposals (
                proposal_ref TEXT PRIMARY KEY,
                transaction_ref TEXT NOT NULL UNIQUE,
                family_scope_ref TEXT NOT NULL,
                alias_ref TEXT NOT NULL,
                generation INTEGER NOT NULL,
                encrypted_payload TEXT NOT NULL,
                payload_version INTEGER NOT NULL,
                proposal_state TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                resolved_by_ref TEXT,
                resolved_at TEXT
            );
        `);
        this.#migrateLegacySchema();
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_shadow_preview_pending
                ON shadow_preview_items(family_scope_ref,review_state,expires_at,created_at);
            CREATE INDEX IF NOT EXISTS idx_shadow_preview_alias_generation
                ON shadow_preview_items(alias_ref,generation);
            CREATE INDEX IF NOT EXISTS idx_open_finance_save_proposals_pending
                ON open_finance_save_proposals(family_scope_ref,proposal_state,expires_at,created_at);
            CREATE INDEX IF NOT EXISTS idx_open_finance_save_proposals_alias_generation
                ON open_finance_save_proposals(alias_ref,generation);
        `);
        this.#hardenFiles();
    }

    #hmac(value) {
        return crypto.createHmac('sha256', this.secret).update(String(value || '')).digest('hex').slice(0, 32);
    }

    #operationKey(value) {
        return crypto.createHmac('sha256', this.secret).update(String(value || '')).digest('hex').slice(0, 48);
    }

    #aliasRef(alias) {
        const normalized = String(alias || '').toLowerCase();
        if (!/^[a-z0-9_-]{2,48}$/.test(normalized)) throw new Error('valid_shadow_preview_alias_required');
        return this.#hmac(`open-finance-revocation-lineage:${normalized}`);
    }

    #actorRef(whatsappId) {
        const normalized = String(whatsappId || '').trim();
        if (!normalized) throw new Error('valid_shadow_preview_actor_required');
        return this.#hmac(`family-reviewer:${normalized}`);
    }

    #requireAuthorizedActor(whatsappId) {
        if (!this.authorizedActorRefs.has(this.#actorRef(whatsappId))) {
            throw new Error('shadow_preview_actor_unauthorized');
        }
    }

    #now() {
        return validTimestamp(this.clock(), 'valid_shadow_preview_time_required').toISOString();
    }

    #migrateLegacySchema() {
        const existing = new Set(this.db.pragma('table_info(shadow_preview_items)').map(column => column.name));
        const additions = {
            family_scope_ref: 'TEXT',
            alias_ref: 'TEXT',
            generation: 'INTEGER NOT NULL DEFAULT 1',
            payload_version: 'INTEGER NOT NULL DEFAULT 1',
            updated_at: 'TEXT',
            expires_at: 'TEXT',
            claimed_by_ref: 'TEXT'
        };
        for (const [column, definition] of Object.entries(additions)) {
            if (!existing.has(column)) this.db.exec(`ALTER TABLE shadow_preview_items ADD COLUMN ${column} ${definition}`);
        }
        // Legacy previews have no revocation lineage. They are ephemeral and
        // must be regenerated instead of being exposed under weaker metadata.
        this.db.prepare(`DELETE FROM shadow_preview_items
            WHERE family_scope_ref IS NULL OR alias_ref IS NULL OR updated_at IS NULL OR expires_at IS NULL`).run();
    }

    #hardenFiles() {
        if (this.databasePath === ':memory:') return;
        for (const file of [this.databasePath, `${this.databasePath}-wal`, `${this.databasePath}-shm`]) {
            if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
        }
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
        const created = validTimestamp(observedAt, 'valid_shadow_preview_time_required');
        const now = this.#now();
        if (created.getTime() > Date.parse(now) + 5 * 60 * 1000) {
            throw new Error('shadow_preview_future_observation_rejected');
        }
        const expiresAt = new Date(created.getTime() + this.retentionDays * 86400000).toISOString();
        this.purgeExpired();
        const sources = new Map();
        for (const item of openFinanceItems) {
            const generation = validGeneration(item.generation || 1);
            if (this.revocationJournal?.isGenerationRevoked?.(item.alias_code, generation)) {
                throw new Error('shadow_preview_revoked_generation');
            }
            for (const transaction of item.transactions || []) {
                sources.set(this.#hmac(`${item.id}:${transaction.id}`), {
                    alias: item.alias_code,
                    aliasRef: this.#aliasRef(item.alias_code),
                    generation,
                    transaction
                });
            }
        }
        const canonical = new Map(canonicalTransactions.map((transaction, index) => [
            this.#hmac(transaction.id || index), transaction
        ]));
        let inserted = 0;
        let replayed = 0;
        let expired = 0;
        const existing = this.db.prepare('SELECT review_state FROM shadow_preview_items WHERE preview_ref=?');
        const statement = this.db.prepare(`
            INSERT INTO shadow_preview_items (
                preview_ref, transaction_ref, family_scope_ref, alias_ref, generation,
                encrypted_payload, payload_version, reconciliation_status, rule_code,
                created_at, updated_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?)
            ON CONFLICT(preview_ref) DO UPDATE SET
                encrypted_payload=excluded.encrypted_payload,
                payload_version=excluded.payload_version,
                reconciliation_status=excluded.reconciliation_status,
                rule_code=excluded.rule_code,
                updated_at=excluded.updated_at
            WHERE shadow_preview_items.review_state='pending'
        `);
        const transaction = this.db.transaction(() => {
            for (const decision of decisions.filter(row => ['possible_duplicate', 'uncertain'].includes(row.status))) {
                const source = sources.get(decision.transaction_ref);
                if (!source) throw new Error('shadow_preview_source_unavailable');
                if (expiresAt <= now) {
                    expired += 1;
                    continue;
                }
                const previewRef = this.#hmac(`preview:${source.aliasRef}:${source.generation}:${decision.transaction_ref}`);
                const transactionRef = this.#hmac(
                    `generation:${source.aliasRef}:${source.generation}:${decision.transaction_ref}`
                );
                const payload = {
                    alias: source.alias,
                    generation: source.generation,
                    source: source.transaction,
                    canonical: decision.canonical_ref ? canonical.get(decision.canonical_ref) || null : null,
                    status: decision.status,
                    rule: decision.rule,
                    confidence_band: decision.confidence_band
                };
                const prior = existing.get(previewRef);
                const result = statement.run(
                    previewRef, transactionRef, this.familyScopeRef, source.aliasRef, source.generation,
                    this.#encrypt(previewRef, payload), decision.status, decision.rule,
                    created.toISOString(), now, expiresAt
                );
                if (!prior && result.changes) inserted += 1;
                else if (prior?.review_state === 'pending') replayed += 1;
            }
        });
        transaction();
        this.#hardenFiles();
        return { inserted, replayed, reviewable: inserted + replayed, financial_writes: 0,
            ...(expired ? { expired } : {}) };
    }

    ingestSaveProposals({
        reconciliationDecisions = [],
        lifecycleDecisions = [],
        openFinanceItems = [],
        policies = [],
        observedAt = new Date().toISOString()
    } = {}) {
        const created = validTimestamp(observedAt, 'valid_save_proposal_time_required');
        const now = this.#now();
        if (created.getTime() > Date.parse(now) + 5 * 60 * 1000) {
            throw new Error('save_proposal_future_observation_rejected');
        }
        const expiresAt = new Date(created.getTime() + this.retentionDays * 86400000).toISOString();
        this.purgeExpired();
        const lifecycleByObservation = new Map(
            lifecycleDecisions.map(decision => [decision.observation_ref, decision])
        );
        const principalByAlias = new Map();
        for (const policy of policies) {
            const alias = String(policy.alias || '').trim().toLowerCase();
            const principal = String(policy.write_confirmation_principal || '').trim().toLowerCase();
            if (!/^[a-z0-9_-]{2,48}$/.test(alias) || !['daniel', 'thais'].includes(principal)) {
                throw new Error('invalid_save_proposal_policy');
            }
            if (principalByAlias.has(alias)) throw new Error('duplicate_save_proposal_policy');
            principalByAlias.set(alias, principal);
        }
        const sourceByObservation = new Map();
        for (const item of openFinanceItems) {
            const alias = String(item.alias_code || '').trim().toLowerCase();
            const generation = validGeneration(item.generation || 1);
            if (this.revocationJournal?.isGenerationRevoked?.(alias, generation)) {
                throw new Error('save_proposal_revoked_generation');
            }
            const accounts = new Map((item.accounts || []).map(account => [account.id, account]));
            for (const transaction of item.transactions || []) {
                const observationRef = this.#hmac(
                    `observation:${item.id}:${transaction.account_id}:${transaction.id}`
                );
                sourceByObservation.set(observationRef, {
                    alias,
                    aliasRef: this.#aliasRef(alias),
                    generation,
                    accountType: String(accounts.get(transaction.account_id)?.type || '').toUpperCase(),
                    transaction
                });
            }
        }
        let inserted = 0;
        let replayed = 0;
        let blocked = 0;
        const existing = this.db.prepare(
            'SELECT proposal_state FROM open_finance_save_proposals WHERE proposal_ref=?'
        );
        const insert = this.db.prepare(`INSERT INTO open_finance_save_proposals (
            proposal_ref,transaction_ref,family_scope_ref,alias_ref,generation,encrypted_payload,
            payload_version,proposal_state,created_at,updated_at,expires_at
        ) VALUES (?,?,?,?,?,?,1,'pending',?,?,?)`);
        const updatePending = this.db.prepare(`UPDATE open_finance_save_proposals
            SET encrypted_payload=?,updated_at=?
            WHERE proposal_ref=? AND proposal_state='pending'`);
        this.db.transaction(() => {
            for (const decision of reconciliationDecisions) {
                const lifecycle = lifecycleByObservation.get(decision.observation_ref);
                const source = sourceByObservation.get(decision.observation_ref);
                const principal = source ? principalByAlias.get(source.alias) : null;
                if (decision.status !== 'new' || !source || !principal ||
                    lifecycle?.classification !== 'purchase' || lifecycle?.provider_state !== 'POSTED' ||
                    expiresAt <= now) {
                    blocked += 1;
                    continue;
                }
                const proposalRef = this.#hmac(
                    `save-proposal:${source.aliasRef}:${source.generation}:${decision.observation_ref}`
                );
                const transactionRef = this.#hmac(
                    `save-proposal-transaction:${source.aliasRef}:${source.generation}:${decision.transaction_ref}`
                );
                const payload = {
                    alias: source.alias,
                    generation: source.generation,
                    principal,
                    classification: lifecycle.classification,
                    provider_state: lifecycle.provider_state,
                    account_type: source.accountType,
                    source: source.transaction,
                    observation_ref: decision.observation_ref,
                    operation_key: this.#operationKey(
                        `open-finance-write:${source.aliasRef}:${source.generation}:${decision.observation_ref}`
                    )
                };
                const prior = existing.get(proposalRef);
                if (prior) {
                    if (prior.proposal_state === 'pending') {
                        updatePending.run(this.#encrypt(proposalRef, payload), now, proposalRef);
                    }
                    replayed += 1;
                    continue;
                }
                insert.run(
                    proposalRef,
                    transactionRef,
                    this.familyScopeRef,
                    source.aliasRef,
                    source.generation,
                    this.#encrypt(proposalRef, payload),
                    created.toISOString(),
                    now,
                    expiresAt
                );
                inserted += 1;
            }
        })();
        this.#hardenFiles();
        const pending = this.db.prepare(`SELECT COUNT(*) AS total FROM open_finance_save_proposals
            WHERE family_scope_ref=? AND proposal_state='pending' AND expires_at>?`)
            .get(this.familyScopeRef, now).total;
        return { inserted, replayed, blocked, pending, financial_writes: 0 };
    }

    purgeExpired() {
        const timestamp = this.#now();
        const result = this.db.transaction(() => ({
            previews: this.db.prepare('DELETE FROM shadow_preview_items WHERE expires_at<=?').run(timestamp).changes,
            saveProposals: this.db.prepare(
                'DELETE FROM open_finance_save_proposals WHERE expires_at<=?'
            ).run(timestamp).changes
        }))();
        this.#hardenFiles();
        return {
            removed: result.previews,
            removed_save_proposals: result.saveProposals,
            financial_writes: 0
        };
    }

    listPending({ actorWhatsappId, limit = 100 } = {}) {
        this.#requireAuthorizedActor(actorWhatsappId);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('valid_shadow_preview_limit_required');
        this.purgeExpired();
        return this.db.prepare(`
            SELECT preview_ref, reconciliation_status AS status, rule_code AS rule, created_at
            FROM shadow_preview_items WHERE family_scope_ref=? AND review_state='pending'
            ORDER BY created_at, preview_ref LIMIT ?
        `).all(this.familyScopeRef, limit);
    }

    readPrivate(previewRef, { actorWhatsappId } = {}) {
        this.#requireAuthorizedActor(actorWhatsappId);
        this.purgeExpired();
        const row = this.db.prepare(`SELECT encrypted_payload FROM shadow_preview_items
            WHERE preview_ref=? AND family_scope_ref=?`).get(previewRef, this.familyScopeRef);
        return row ? this.#decrypt(previewRef, row.encrypted_payload) : null;
    }

    review(previewRef, action, { actorWhatsappId } = {}) {
        this.#requireAuthorizedActor(actorWhatsappId);
        if (!['confirm_duplicate', 'not_duplicate', 'ignore'].includes(action)) throw new Error('invalid_shadow_review_action');
        const timestamp = this.#now();
        this.purgeExpired();
        const row = this.db.prepare(`SELECT review_state,review_action FROM shadow_preview_items
            WHERE preview_ref=? AND family_scope_ref=?`).get(previewRef, this.familyScopeRef);
        if (!row) throw new Error('shadow_preview_not_found');
        if (row.review_state === 'reviewed') {
            if (row.review_action === action) return { applied: false, replay: true, financial_writes: 0 };
            throw new Error('shadow_preview_review_conflict');
        }
        this.db.prepare(`UPDATE shadow_preview_items SET review_state='reviewed', review_action=?, reviewed_at=? WHERE preview_ref=?`)
            .run(action, timestamp, previewRef);
        this.#hardenFiles();
        return { applied: true, replay: false, financial_writes: 0 };
    }

    listPendingSaveProposals({ actorWhatsappId, limit = 100 } = {}) {
        this.#requireAuthorizedActor(actorWhatsappId);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new Error('valid_save_proposal_limit_required');
        }
        this.purgeExpired();
        return this.db.prepare(`SELECT proposal_ref,created_at,expires_at FROM open_finance_save_proposals
            WHERE family_scope_ref=? AND proposal_state='pending'
            ORDER BY created_at,proposal_ref LIMIT ?`).all(this.familyScopeRef, limit);
    }

    readSaveProposalPrivate(proposalRef, { actorWhatsappId } = {}) {
        this.#requireAuthorizedActor(actorWhatsappId);
        this.purgeExpired();
        const row = this.db.prepare(`SELECT encrypted_payload FROM open_finance_save_proposals
            WHERE proposal_ref=? AND family_scope_ref=?`).get(proposalRef, this.familyScopeRef);
        return row ? this.#decrypt(proposalRef, row.encrypted_payload) : null;
    }

    cancelSaveProposal(proposalRef, { actorWhatsappId } = {}) {
        this.#requireAuthorizedActor(actorWhatsappId);
        const timestamp = this.#now();
        this.purgeExpired();
        const actorRef = this.#actorRef(actorWhatsappId);
        const row = this.db.prepare(`SELECT proposal_state FROM open_finance_save_proposals
            WHERE proposal_ref=? AND family_scope_ref=?`).get(proposalRef, this.familyScopeRef);
        if (!row) throw new Error('save_proposal_not_found');
        if (row.proposal_state === 'cancelled') {
            return { cancelled: true, replay: true, financial_writes: 0 };
        }
        if (row.proposal_state !== 'pending') throw new Error('save_proposal_state_conflict');
        const result = this.db.prepare(`UPDATE open_finance_save_proposals
            SET proposal_state='cancelled',resolved_by_ref=?,resolved_at=?,updated_at=?
            WHERE proposal_ref=? AND family_scope_ref=? AND proposal_state='pending'`)
            .run(actorRef, timestamp, timestamp, proposalRef, this.familyScopeRef);
        if (result.changes !== 1) throw new Error('save_proposal_state_changed');
        this.#hardenFiles();
        return { cancelled: true, replay: false, financial_writes: 0 };
    }

    revokeSourceAlias(alias, { generation = 1, revokedAt = this.#now() } = {}) {
        validTimestamp(revokedAt, 'valid_shadow_preview_revocation_time_required');
        const aliasRef = this.#aliasRef(alias);
        const valid = validGeneration(generation);
        const result = this.db.transaction(() => ({
            previews: this.db.prepare('DELETE FROM shadow_preview_items WHERE alias_ref=? AND generation<=?')
                .run(aliasRef, valid).changes,
            saveProposals: this.db.prepare(
                'DELETE FROM open_finance_save_proposals WHERE alias_ref=? AND generation<=?'
            ).run(aliasRef, valid).changes
        }))();
        this.#hardenFiles();
        return {
            removed_previews: result.previews,
            removed_save_proposals: result.saveProposals,
            financial_writes: 0
        };
    }

    reapplyRevocations({ revocations = [] } = {}) {
        let removed = 0;
        let removedSaveProposals = 0;
        const statement = this.db.prepare('DELETE FROM shadow_preview_items WHERE alias_ref=? AND generation<=?');
        const saveProposalStatement = this.db.prepare(
            'DELETE FROM open_finance_save_proposals WHERE alias_ref=? AND generation<=?'
        );
        this.db.transaction(() => {
            for (const revocation of revocations) {
                if (!/^[a-f0-9]{32}$/.test(String(revocation.alias_ref || ''))) {
                    throw new Error('valid_shadow_preview_alias_ref_required');
                }
                const generation = validGeneration(revocation.generation);
                removed += statement.run(revocation.alias_ref, generation).changes;
                removedSaveProposals += saveProposalStatement.run(revocation.alias_ref, generation).changes;
            }
        })();
        this.#hardenFiles();
        return {
            removed_previews: removed,
            removed_save_proposals: removedSaveProposals,
            financial_writes: 0
        };
    }

    stats() {
        this.purgeExpired();
        const row = this.db.prepare(`SELECT COUNT(*) AS total,
            SUM(CASE WHEN review_state='pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN review_state='reviewed' THEN 1 ELSE 0 END) AS reviewed
            FROM shadow_preview_items WHERE family_scope_ref=?`).get(this.familyScopeRef);
        const proposalRow = this.db.prepare(`SELECT COUNT(*) AS total,
            SUM(CASE WHEN proposal_state='pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN proposal_state='cancelled' THEN 1 ELSE 0 END) AS cancelled
            FROM open_finance_save_proposals WHERE family_scope_ref=?`).get(this.familyScopeRef);
        return { total: row.total, pending: row.pending || 0, reviewed: row.reviewed || 0,
            retention_days: this.retentionDays,
            save_proposals_total: proposalRow.total,
            save_proposals_pending: proposalRow.pending || 0,
            save_proposals_cancelled: proposalRow.cancelled || 0,
            financial_writes: 0 };
    }

    close() { this.#hardenFiles(); this.db.close(); this.#hardenFiles(); }
}

module.exports = { OpenFinanceShadowPreviewStore };
