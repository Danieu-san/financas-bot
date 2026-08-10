const crypto = require('node:crypto');
const fs = require('node:fs');
const Database = require('better-sqlite3');

function stableSerialize(value) {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key =>
            `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_proactive_review_secret_required');
    return value;
}

function normalizePrincipal(value) {
    const principal = String(value || '').trim().toLowerCase();
    if (!['daniel', 'thais'].includes(principal)) {
        throw new Error('invalid_open_finance_proactive_review_principal');
    }
    return principal;
}

class OpenFinanceProactiveReviewStore {
    constructor({ databasePath = ':memory:', secret, familyScope = 'shared-family',
        retentionDays = 30, clock = () => new Date() } = {}) {
        this.secret = requireSecret(secret);
        if (!Number.isInteger(retentionDays) || retentionDays < 7 || retentionDays > 90) {
            throw new Error('open_finance_proactive_review_retention_out_of_range');
        }
        this.databasePath = databasePath;
        this.familyScopeRef = this.#hmac(`family:${String(familyScope || 'shared-family')}`);
        this.retentionDays = retentionDays;
        this.clock = clock;
        this.db = new Database(databasePath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS open_finance_proactive_reviews (
                review_ref TEXT PRIMARY KEY,
                review_code TEXT NOT NULL UNIQUE,
                observation_ref TEXT NOT NULL UNIQUE,
                family_scope_ref TEXT NOT NULL,
                alias_ref TEXT NOT NULL,
                generation INTEGER NOT NULL,
                encrypted_payload TEXT,
                payload_version INTEGER,
                review_state TEXT NOT NULL,
                decision TEXT,
                decided_by_ref TEXT,
                state_mac TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                completed_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_open_finance_proactive_reviews_pending
                ON open_finance_proactive_reviews(family_scope_ref,review_state,created_at);
        `);
        this.#hardenFiles();
    }

    #hmac(value, length = 32) {
        return crypto.createHmac('sha256', this.secret)
            .update(String(value || ''))
            .digest('hex')
            .slice(0, length);
    }

    #actorRef(value) {
        const normalized = String(value || '').trim();
        if (!normalized) throw new Error('valid_open_finance_proactive_review_actor_required');
        return this.#hmac(`family-reviewer:${normalized}`);
    }

    #aliasRef(alias) {
        const normalized = String(alias || '').trim().toLowerCase();
        if (!/^[a-z0-9_-]{2,48}$/.test(normalized)) {
            throw new Error('valid_open_finance_proactive_review_alias_required');
        }
        return this.#hmac(`open-finance-revocation-lineage:${normalized}`);
    }

    #now() {
        const value = new Date(this.clock());
        if (Number.isNaN(value.getTime())) {
            throw new Error('valid_open_finance_proactive_review_time_required');
        }
        return value.toISOString();
    }

    #key() {
        return crypto.createHash('sha256')
            .update(`open-finance-proactive-review:${this.secret}`)
            .digest();
    }

    #encrypt(reviewRef, payload) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.#key(), iv);
        cipher.setAAD(Buffer.from(`proactive-review:${reviewRef}`));
        const encrypted = Buffer.concat([
            cipher.update(JSON.stringify(payload), 'utf8'),
            cipher.final()
        ]);
        return [iv.toString('base64'), cipher.getAuthTag().toString('base64'),
            encrypted.toString('base64')].join('.');
    }

    #decrypt(reviewRef, encryptedPayload) {
        const [iv, tag, encrypted] = String(encryptedPayload || '').split('.');
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.#key(), Buffer.from(iv, 'base64'));
        decipher.setAAD(Buffer.from(`proactive-review:${reviewRef}`));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return JSON.parse(Buffer.concat([
            decipher.update(Buffer.from(encrypted, 'base64')),
            decipher.final()
        ]).toString('utf8'));
    }

    #stateMac(row) {
        return this.#hmac(`proactive-review-state:${stableSerialize({
            review_ref: row.review_ref,
            review_code: row.review_code,
            observation_ref: row.observation_ref,
            family_scope_ref: row.family_scope_ref,
            alias_ref: row.alias_ref,
            generation: row.generation,
            review_state: row.review_state,
            decision: row.decision || null,
            decided_by_ref: row.decided_by_ref || null,
            created_at: row.created_at,
            updated_at: row.updated_at,
            expires_at: row.expires_at,
            completed_at: row.completed_at || null
        })}`);
    }

    #assertRow(row) {
        if (!row || row.family_scope_ref !== this.familyScopeRef ||
            !['pending', 'decided', 'expired'].includes(row.review_state) ||
            row.state_mac !== this.#stateMac(row)) {
            throw new Error('open_finance_proactive_review_state_metadata_mismatch');
        }
        if (row.review_state === 'pending' && (row.decision || row.decided_by_ref || row.completed_at)) {
            throw new Error('open_finance_proactive_review_state_metadata_mismatch');
        }
        if (row.review_state === 'decided' && (!row.decision || !row.decided_by_ref || !row.completed_at)) {
            throw new Error('open_finance_proactive_review_state_metadata_mismatch');
        }
        if (row.review_state === 'expired' &&
            (row.encrypted_payload || row.payload_version || !row.completed_at)) {
            throw new Error('open_finance_proactive_review_state_metadata_mismatch');
        }
        if (row.review_state !== 'expired' &&
            (!row.encrypted_payload || row.payload_version !== 1)) {
            throw new Error('open_finance_proactive_review_state_metadata_mismatch');
        }
    }

    #readPayload(row) {
        this.#assertRow(row);
        if (!row.encrypted_payload || row.payload_version !== 1) {
            throw new Error('open_finance_proactive_review_payload_metadata_mismatch');
        }
        const payload = this.#decrypt(row.review_ref, row.encrypted_payload);
        if (payload.review_ref !== row.review_ref ||
            payload.review_code !== row.review_code ||
            payload.observation_ref !== row.observation_ref ||
            payload.family_scope_ref !== row.family_scope_ref ||
            payload.alias_ref !== row.alias_ref ||
            payload.generation !== row.generation ||
            payload.created_at !== row.created_at || payload.expires_at !== row.expires_at) {
            throw new Error('open_finance_proactive_review_payload_metadata_mismatch');
        }
        return payload;
    }

    #requireActor(payload, actorWhatsappId) {
        const actorRef = this.#actorRef(actorWhatsappId);
        if (!payload.authorized_actor_refs.includes(actorRef)) {
            throw new Error('proactive_review_actor_unauthorized');
        }
        return actorRef;
    }

    #hardenFiles() {
        if (this.databasePath === ':memory:') return;
        for (const file of [this.databasePath, `${this.databasePath}-wal`, `${this.databasePath}-shm`]) {
            if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
        }
    }

    purgeExpired() {
        const now = this.#now();
        const rows = this.db.prepare(`SELECT * FROM open_finance_proactive_reviews
            WHERE family_scope_ref=? AND review_state='pending' AND expires_at<=?`)
            .all(this.familyScopeRef, now);
        const update = this.db.prepare(`UPDATE open_finance_proactive_reviews
            SET encrypted_payload=NULL,payload_version=NULL,review_state='expired',
                updated_at=?,completed_at=?,state_mac=?
            WHERE review_ref=? AND review_state='pending'`);
        this.db.transaction(() => {
            for (const row of rows) {
                this.#assertRow(row);
                const next = { ...row, review_state: 'expired', updated_at: now, completed_at: now };
                update.run(now, now, this.#stateMac(next), row.review_ref);
            }
        })();
        this.#hardenFiles();
        return { expired: rows.length, financial_writes: 0 };
    }

    ingest({ reviews = [], items = [], policies = [], confirmationActors = [],
        observedAt = new Date().toISOString() } = {}) {
        const created = new Date(observedAt);
        if (Number.isNaN(created.getTime())) {
            throw new Error('valid_open_finance_proactive_review_observation_time_required');
        }
        const now = this.#now();
        if (created.getTime() > Date.parse(now) + 5 * 60 * 1000) {
            throw new Error('open_finance_proactive_review_future_observation_rejected');
        }
        this.purgeExpired();
        const expiresAt = new Date(created.getTime() + this.retentionDays * 86400000).toISOString();
        if (expiresAt <= now) {
            throw new Error('open_finance_proactive_review_observation_expired');
        }
        const actorByPrincipal = new Map();
        for (const actor of confirmationActors) {
            const principal = normalizePrincipal(actor?.principal);
            if (actorByPrincipal.has(principal)) {
                throw new Error('duplicate_open_finance_proactive_review_actor');
            }
            actorByPrincipal.set(principal, this.#actorRef(actor?.whatsappId));
        }
        const policyByAlias = new Map();
        for (const policy of policies) {
            const alias = String(policy?.alias || '').trim().toLowerCase();
            const principal = normalizePrincipal(policy?.principal);
            const recipients = [...new Set((policy?.recipients || []).map(normalizePrincipal))];
            if (!/^[a-z0-9_-]{2,48}$/.test(alias) || !recipients.length ||
                policyByAlias.has(alias) || recipients.some(recipient => !actorByPrincipal.has(recipient))) {
                throw new Error('invalid_open_finance_proactive_review_policy');
            }
            policyByAlias.set(alias, { principal, recipients });
        }
        const sourceByObservation = new Map();
        for (const item of items) {
            for (const transaction of item.transactions || []) {
                const observation = this.#hmac(
                    `observation:${item.id}:${transaction.account_id}:${transaction.id}`
                );
                sourceByObservation.set(observation, transaction);
            }
        }
        let inserted = 0;
        let replayed = 0;
        const links = [];
        const select = this.db.prepare('SELECT * FROM open_finance_proactive_reviews WHERE review_ref=?');
        const insert = this.db.prepare(`INSERT INTO open_finance_proactive_reviews(
            review_ref,review_code,observation_ref,family_scope_ref,alias_ref,generation,
            encrypted_payload,payload_version,review_state,decision,decided_by_ref,state_mac,
            created_at,updated_at,expires_at,completed_at
        ) VALUES (?,?,?,?,?,?,?,1,'pending',NULL,NULL,?,?,?,?,NULL)`);
        this.db.transaction(() => {
            for (const review of reviews) {
                const observation = String(review?.observation_ref || '');
                const alias = String(review?.source_alias || '').trim().toLowerCase();
                const generation = Number(review?.generation);
                const source = sourceByObservation.get(observation);
                const policy = policyByAlias.get(alias);
                if (!/^[a-f0-9]{32}$/.test(observation) || !source || !policy ||
                    !Number.isInteger(generation) || generation < 1 ||
                    !['income', 'refund_link'].includes(review.review_kind) ||
                    review.save_eligible !== false) {
                    throw new Error('invalid_open_finance_proactive_review');
                }
                const aliasRef = this.#aliasRef(alias);
                const reviewRef = this.#hmac(`proactive-review:${aliasRef}:${generation}:${observation}`);
                const reviewCode = this.#hmac(`proactive-review-code:${reviewRef}`, 10);
                const authorizedActorRefs = policy.recipients.map(recipient => actorByPrincipal.get(recipient)).sort();
                const payload = {
                    review_ref: reviewRef,
                    review_code: reviewCode,
                    observation_ref: observation,
                    family_scope_ref: this.familyScopeRef,
                    alias_ref: aliasRef,
                    generation,
                    principal: policy.principal,
                    authorized_actor_refs: authorizedActorRefs,
                    classification: review.classification,
                    review_kind: review.review_kind,
                    review_status: review.review_status,
                    save_eligible: false,
                    source: {
                        id: String(source.id || ''),
                        account_id: String(source.account_id || ''),
                        amount_cents: Number(source.amount_cents),
                        description: String(source.description || '').slice(0, 200),
                        date: String(source.date || ''),
                        status: String(source.status || '')
                    },
                    ...(review.pair_observation_ref ? {
                        pair_observation_ref: review.pair_observation_ref,
                        pair_basis: review.pair_basis
                    } : {}),
                    ...(Array.isArray(review.candidate_observation_refs) ? {
                        candidate_observation_refs: review.candidate_observation_refs
                    } : {}),
                    created_at: created.toISOString(),
                    expires_at: expiresAt
                };
                const prior = select.get(reviewRef);
                if (prior) {
                    const priorPayload = this.#readPayload(prior);
                    if (stableSerialize(priorPayload) !== stableSerialize(payload)) {
                        throw new Error('open_finance_proactive_review_replay_conflict');
                    }
                    replayed += 1;
                } else {
                    const row = {
                        review_ref: reviewRef,
                        review_code: reviewCode,
                        observation_ref: observation,
                        family_scope_ref: this.familyScopeRef,
                        alias_ref: aliasRef,
                        generation,
                        review_state: 'pending',
                        decision: null,
                        decided_by_ref: null,
                        created_at: created.toISOString(),
                        updated_at: now,
                        expires_at: expiresAt,
                        completed_at: null
                    };
                    insert.run(reviewRef, reviewCode, observation, this.familyScopeRef, aliasRef,
                        generation, this.#encrypt(reviewRef, payload), this.#stateMac(row),
                        row.created_at, row.updated_at, row.expires_at);
                    inserted += 1;
                }
                links.push({
                    observation_ref: observation,
                    review_ref: reviewRef,
                    review_code: reviewCode,
                    principal: policy.principal,
                    review_kind: review.review_kind,
                    review_status: review.review_status
                });
            }
        })();
        this.#hardenFiles();
        return { inserted, replayed, pending: this.stats().pending, links, financial_writes: 0 };
    }

    readPrivateByCode(reviewCode, { actorWhatsappId } = {}) {
        const code = String(reviewCode || '').trim().toLowerCase();
        if (!/^[a-f0-9]{10}$/.test(code)) {
            throw new Error('valid_open_finance_proactive_review_code_required');
        }
        this.purgeExpired();
        const row = this.db.prepare(`SELECT * FROM open_finance_proactive_reviews
            WHERE review_code=? AND family_scope_ref=?`).get(code, this.familyScopeRef);
        if (!row) throw new Error('open_finance_proactive_review_not_found');
        this.#assertRow(row);
        if (row.review_state === 'expired') {
            throw new Error('open_finance_proactive_review_not_pending');
        }
        const payload = this.#readPayload(row);
        this.#requireActor(payload, actorWhatsappId);
        return { ...payload, review_state: row.review_state, decision: row.decision,
            financial_writes: 0 };
    }

    decideByCode(reviewCode, decision, { actorWhatsappId } = {}) {
        this.purgeExpired();
        const code = String(reviewCode || '').trim().toLowerCase();
        const row = this.db.prepare(`SELECT * FROM open_finance_proactive_reviews
            WHERE review_code=? AND family_scope_ref=?`).get(code, this.familyScopeRef);
        if (!row) throw new Error('open_finance_proactive_review_not_found');
        this.#assertRow(row);
        if (row.review_state === 'expired') {
            throw new Error('open_finance_proactive_review_not_pending');
        }
        const payload = this.#readPayload(row);
        const actorRef = this.#requireActor(payload, actorWhatsappId);
        const normalized = String(decision || '').trim().toLowerCase();
        const allowed = payload.review_kind === 'income'
            ? ['income', 'transfer', 'reserve', 'uncertain']
            : payload.review_status === 'pair_confirmation_required'
                ? ['confirm_pair', 'reject_pair', 'uncertain']
                : ['unlinked_refund', 'not_refund', 'uncertain'];
        if (!allowed.includes(normalized)) {
            throw new Error('invalid_open_finance_proactive_review_decision');
        }
        if (row.review_state === 'decided') {
            if (row.decision !== normalized) {
                throw new Error('proactive_review_decision_conflict');
            }
            return { decided: true, replay: true, review_ref: row.review_ref,
                decision: normalized, financial_writes: 0 };
        }
        if (row.review_state !== 'pending' || row.expires_at <= this.#now()) {
            throw new Error('open_finance_proactive_review_not_pending');
        }
        const now = this.#now();
        const next = { ...row, review_state: 'decided', decision: normalized,
            decided_by_ref: actorRef, updated_at: now, completed_at: now };
        const result = this.db.prepare(`UPDATE open_finance_proactive_reviews SET
            review_state='decided',decision=?,decided_by_ref=?,updated_at=?,completed_at=?,state_mac=?
            WHERE review_ref=? AND review_state='pending'`).run(
            normalized, actorRef, now, now, this.#stateMac(next), row.review_ref
        );
        if (result.changes !== 1) throw new Error('proactive_review_decision_conflict');
        this.#hardenFiles();
        return { decided: true, replay: false, review_ref: row.review_ref,
            decision: normalized, financial_writes: 0 };
    }

    stats() {
        const row = this.db.prepare(`SELECT COUNT(*) AS total,
            SUM(CASE WHEN review_state='pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN review_state='decided' THEN 1 ELSE 0 END) AS decided,
            SUM(CASE WHEN review_state='expired' THEN 1 ELSE 0 END) AS expired
            FROM open_finance_proactive_reviews WHERE family_scope_ref=?`).get(this.familyScopeRef);
        return { total: row.total, pending: row.pending || 0, decided: row.decided || 0,
            expired: row.expired || 0, financial_writes: 0 };
    }

    close() {
        this.db.close();
    }
}

module.exports = { OpenFinanceProactiveReviewStore };
