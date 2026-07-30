const crypto = require('node:crypto');
const fs = require('node:fs');
const Database = require('better-sqlite3');

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_save_review_secret_required');
    return value;
}

function stableSerialize(value) {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key =>
            `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function normalizeCatalogItems(items, kind, limit) {
    if (!Array.isArray(items) || items.length > limit) {
        throw new Error(`invalid_open_finance_save_review_${kind}_catalog`);
    }
    const seen = new Set();
    return items.map((item) => {
        const id = String(item?.id || '').trim();
        const label = String(item?.label || '').trim();
        if (!id || id.length > 128 || !label || label.length > 160 || seen.has(id)) {
            throw new Error(`invalid_open_finance_save_review_${kind}_catalog`);
        }
        seen.add(id);
        if (kind === 'categories') {
            const category = String(item.category || '').trim();
            const subcategory = String(item.subcategory || '').trim();
            if (!category || category.length > 80 || subcategory.length > 80) {
                throw new Error('invalid_open_finance_save_review_categories_catalog');
            }
            return { id, label, category, subcategory };
        }
        if (kind === 'payment_methods') {
            const value = String(item.value || '').trim();
            if (!['Crédito', 'Débito', 'PIX', 'Dinheiro'].includes(value)) {
                throw new Error('invalid_open_finance_save_review_payment_methods_catalog');
            }
            return { id, label, value };
        }
        if (kind === 'people') {
            return { id, label };
        }
        if (kind === 'financial_accounts') {
            return {
                id,
                label,
                ownerUserId: String(item.ownerUserId || '').trim()
            };
        }
        if (kind === 'cards') {
            const cardId = String(item.cardId || '').trim();
            const closingDay = Number(item.closingDay);
            if (!cardId || cardId.length > 128 ||
                !Number.isInteger(closingDay) ||
                closingDay < 1 || closingDay > 31) {
                throw new Error('invalid_open_finance_save_review_cards_catalog');
            }
            return { id, label, cardId, closingDay };
        }
        return { id, label };
    });
}

function normalizeCatalog(catalog = {}) {
    return {
        people: normalizeCatalogItems(catalog.people || [], 'people', 10),
        categories: normalizeCatalogItems(catalog.categories || [], 'categories', 100),
        paymentMethods: normalizeCatalogItems(
            catalog.paymentMethods || [],
            'payment_methods',
            10
        ),
        financialAccounts: normalizeCatalogItems(
            catalog.financialAccounts || [],
            'financial_accounts',
            50
        ),
        cards: normalizeCatalogItems(catalog.cards || [], 'cards', 50)
    };
}

function initialDraft(proposal, catalog) {
    const principal = normalizeText(proposal?.principal);
    const person = catalog.people.find(item =>
        normalizeText(item.label).split(/\s+/)[0] === principal) || null;
    const accountType = String(proposal?.account_type || '').trim().toUpperCase();
    const paymentValue = accountType === 'CREDIT'
        ? 'Crédito'
        : (['CHECKING', 'SAVINGS', 'BANK'].includes(accountType) ? 'Débito' : '');
    const paymentMethod = catalog.paymentMethods.find(item => item.value === paymentValue) || null;
    return {
        person: person ? { id: person.id, label: person.label } : null,
        category: null,
        paymentMethod: paymentMethod
            ? { id: paymentMethod.id, label: paymentMethod.label, value: paymentMethod.value }
            : null,
        financialAccount: null,
        card: null
    };
}

class OpenFinanceSaveProposalReviewStore {
    constructor({ databasePath = ':memory:', secret, familyScope = 'shared-family',
        authorizedWhatsAppIds = [], clock = () => new Date() } = {}) {
        this.secret = requireSecret(secret);
        this.databasePath = databasePath;
        this.familyScopeRef = this.#hmac(`family:${String(familyScope || 'shared-family')}`);
        this.authorizedActorRefs = new Set(
            authorizedWhatsAppIds.map(value => this.#actorRef(value))
        );
        this.clock = clock;
        this.db = new Database(databasePath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS open_finance_save_proposal_reviews (
                proposal_ref TEXT PRIMARY KEY,
                family_scope_ref TEXT NOT NULL,
                actor_ref TEXT NOT NULL,
                encrypted_payload TEXT,
                payload_version INTEGER,
                review_state TEXT NOT NULL,
                state_mac TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                completed_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_open_finance_save_reviews_actor
                ON open_finance_save_proposal_reviews(
                    family_scope_ref,actor_ref,review_state,updated_at
                );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_open_finance_save_reviews_one_active_actor
                ON open_finance_save_proposal_reviews(family_scope_ref,actor_ref)
                WHERE review_state IN ('prepared','editing');
        `);
        this.#hardenFiles();
    }

    #hmac(value) {
        return crypto.createHmac('sha256', this.secret)
            .update(String(value || ''))
            .digest('hex')
            .slice(0, 32);
    }

    #actorRef(value) {
        const normalized = String(value || '').trim();
        if (!normalized) throw new Error('valid_open_finance_save_review_actor_required');
        return this.#hmac(`family-reviewer:${normalized}`);
    }

    #requireActor(value) {
        const actorRef = this.#actorRef(value);
        if (!this.authorizedActorRefs.has(actorRef)) {
            throw new Error('open_finance_save_review_actor_unauthorized');
        }
        return actorRef;
    }

    #now() {
        const date = new Date(this.clock());
        if (Number.isNaN(date.getTime())) throw new Error('valid_open_finance_save_review_time_required');
        return date.toISOString();
    }

    #key() {
        return crypto.createHash('sha256')
            .update(`open-finance-save-review:${this.secret}`)
            .digest();
    }

    #encrypt(proposalRef, payload) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.#key(), iv);
        cipher.setAAD(Buffer.from(`review:${proposalRef}`));
        const encrypted = Buffer.concat([
            cipher.update(JSON.stringify(payload), 'utf8'),
            cipher.final()
        ]);
        return [
            iv.toString('base64'),
            cipher.getAuthTag().toString('base64'),
            encrypted.toString('base64')
        ].join('.');
    }

    #decrypt(proposalRef, encryptedPayload) {
        const [iv, tag, encrypted] = String(encryptedPayload || '').split('.');
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            this.#key(),
            Buffer.from(iv, 'base64')
        );
        decipher.setAAD(Buffer.from(`review:${proposalRef}`));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return JSON.parse(Buffer.concat([
            decipher.update(Buffer.from(encrypted, 'base64')),
            decipher.final()
        ]).toString('utf8'));
    }

    #stateMac(row) {
        return this.#hmac(`save-review-state:${stableSerialize({
            proposal_ref: row.proposal_ref,
            family_scope_ref: row.family_scope_ref,
            actor_ref: row.actor_ref,
            review_state: row.review_state,
            created_at: row.created_at,
            updated_at: row.updated_at,
            expires_at: row.expires_at,
            completed_at: row.completed_at || null
        })}`);
    }

    #assertRow(row) {
        if (!row || row.family_scope_ref !== this.familyScopeRef ||
            !['prepared', 'editing', 'ready', 'finalized', 'cancelled', 'expired']
                .includes(row.review_state) ||
            row.state_mac !== this.#stateMac(row)) {
            throw new Error('open_finance_save_review_state_metadata_mismatch');
        }
        const terminal = ['ready', 'finalized', 'cancelled', 'expired']
            .includes(row.review_state);
        if ((terminal && !row.completed_at) || (!terminal && row.completed_at) ||
            (row.review_state === 'expired' && (row.encrypted_payload || row.payload_version)) ||
            (row.review_state !== 'expired' &&
                (!row.encrypted_payload || row.payload_version !== 1))) {
            throw new Error('open_finance_save_review_state_metadata_mismatch');
        }
    }

    #readPayload(row) {
        this.#assertRow(row);
        if (row.review_state === 'expired') return null;
        const payload = this.#decrypt(row.proposal_ref, row.encrypted_payload);
        if (payload.proposal_ref !== row.proposal_ref ||
            payload.family_scope_ref !== row.family_scope_ref ||
            payload.actor_ref !== row.actor_ref ||
            payload.created_at !== row.created_at ||
            payload.expires_at !== row.expires_at) {
            throw new Error('open_finance_save_review_payload_metadata_mismatch');
        }
        return payload;
    }

    #hardenFiles() {
        if (this.databasePath === ':memory:') return;
        for (const file of [
            this.databasePath,
            `${this.databasePath}-wal`,
            `${this.databasePath}-shm`
        ]) {
            if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
        }
    }

    purgeExpired() {
        const now = this.#now();
        const rows = this.db.prepare(`SELECT * FROM open_finance_save_proposal_reviews
            WHERE family_scope_ref=? AND review_state IN ('prepared','editing')
                AND expires_at<=?`).all(this.familyScopeRef, now);
        const update = this.db.prepare(`UPDATE open_finance_save_proposal_reviews
            SET encrypted_payload=NULL,payload_version=NULL,review_state='expired',
                state_mac=?,updated_at=?,completed_at=?
            WHERE proposal_ref=? AND review_state IN ('prepared','editing')`);
        this.db.transaction(() => {
            for (const row of rows) {
                this.#assertRow(row);
                const next = {
                    ...row,
                    review_state: 'expired',
                    updated_at: now,
                    completed_at: now
                };
                update.run(this.#stateMac(next), now, now, row.proposal_ref);
            }
            this.db.prepare(`DELETE FROM open_finance_save_proposal_reviews
                WHERE proposal_ref NOT IN (SELECT proposal_ref FROM open_finance_save_proposals)`)
                .run();
        })();
        this.#hardenFiles();
        return { expired: rows.length, financial_writes: 0 };
    }

    prepareReview({ proposalRef, proposal, actorWhatsappId, catalog } = {}) {
        const safeProposalRef = String(proposalRef || '').trim();
        if (!/^[a-f0-9]{32}$/.test(safeProposalRef) ||
            proposal?.proposal_ref && proposal.proposal_ref !== safeProposalRef) {
            throw new Error('valid_open_finance_save_review_proposal_required');
        }
        const actorRef = this.#requireActor(actorWhatsappId);
        const normalizedCatalog = normalizeCatalog(catalog);
        const createdAt = this.#now();
        const expiresAt = String(proposal?.review_expires_at || proposal?.expires_at || '');
        if (!expiresAt || Number.isNaN(Date.parse(expiresAt)) || expiresAt <= createdAt) {
            throw new Error('valid_open_finance_save_review_expiry_required');
        }
        this.purgeExpired();
        const existing = this.db.prepare(`SELECT * FROM open_finance_save_proposal_reviews
            WHERE proposal_ref=? AND family_scope_ref=?`)
            .get(safeProposalRef, this.familyScopeRef);
        if (existing) {
            this.#assertRow(existing);
            if (existing.actor_ref !== actorRef) {
                throw new Error('open_finance_save_review_actor_unauthorized');
            }
            const payload = this.#readPayload(existing);
            return {
                proposal_ref: safeProposalRef,
                state: existing.review_state,
                replay: true,
                payload,
                financial_writes: 0
            };
        }
        const payload = {
            proposal_ref: safeProposalRef,
            family_scope_ref: this.familyScopeRef,
            actor_ref: actorRef,
            source: {
                description: String(proposal?.source?.description || '').trim().slice(0, 200),
                amount_cents: Number.isSafeInteger(proposal?.source?.amount_cents)
                    ? proposal.source.amount_cents
                    : null,
                date: String(proposal?.source?.date || '').trim(),
                account_type: String(proposal?.account_type || '').trim()
            },
            catalog: normalizedCatalog,
            draft: initialDraft(proposal, normalizedCatalog),
            step: 'menu',
            created_at: createdAt,
            updated_at: createdAt,
            expires_at: expiresAt
        };
        const row = {
            proposal_ref: safeProposalRef,
            family_scope_ref: this.familyScopeRef,
            actor_ref: actorRef,
            review_state: 'prepared',
            created_at: createdAt,
            updated_at: createdAt,
            expires_at: expiresAt,
            completed_at: null
        };
        try {
            this.db.prepare(`INSERT INTO open_finance_save_proposal_reviews (
                proposal_ref,family_scope_ref,actor_ref,encrypted_payload,payload_version,
                review_state,state_mac,created_at,updated_at,expires_at,completed_at
            ) VALUES (?,?,?,?,1,'prepared',?,?,?,?,NULL)`).run(
                row.proposal_ref,
                row.family_scope_ref,
                row.actor_ref,
                this.#encrypt(safeProposalRef, payload),
                this.#stateMac(row),
                row.created_at,
                row.updated_at,
                row.expires_at
            );
        } catch (error) {
            if (String(error.code || '').startsWith('SQLITE_CONSTRAINT')) {
                throw new Error('open_finance_save_review_active_actor_conflict');
            }
            throw error;
        }
        this.#hardenFiles();
        return {
            proposal_ref: safeProposalRef,
            state: 'prepared',
            replay: false,
            payload,
            financial_writes: 0
        };
    }

    activateReview(proposalRef, { actorWhatsappId } = {}) {
        return this.#transition(proposalRef, {
            actorWhatsappId,
            allowedStates: ['prepared', 'editing'],
            targetState: 'editing'
        });
    }

    updateReview(proposalRef, { actorWhatsappId, mutate } = {}) {
        if (typeof mutate !== 'function') {
            throw new Error('open_finance_save_review_mutator_required');
        }
        const actorRef = this.#requireActor(actorWhatsappId);
        this.purgeExpired();
        const row = this.db.prepare(`SELECT * FROM open_finance_save_proposal_reviews
            WHERE proposal_ref=? AND family_scope_ref=?`)
            .get(proposalRef, this.familyScopeRef);
        this.#assertRow(row);
        if (row.actor_ref !== actorRef) {
            throw new Error('open_finance_save_review_actor_unauthorized');
        }
        if (row.review_state !== 'editing') {
            throw new Error('open_finance_save_review_state_conflict');
        }
        const current = this.#readPayload(row);
        const nextPayload = mutate(JSON.parse(JSON.stringify(current)));
        if (!nextPayload || nextPayload.proposal_ref !== current.proposal_ref ||
            nextPayload.family_scope_ref !== current.family_scope_ref ||
            nextPayload.actor_ref !== current.actor_ref ||
            nextPayload.created_at !== current.created_at ||
            nextPayload.expires_at !== current.expires_at) {
            throw new Error('open_finance_save_review_mutation_metadata_mismatch');
        }
        const updatedAt = this.#now();
        nextPayload.updated_at = updatedAt;
        const nextRow = { ...row, updated_at: updatedAt };
        const result = this.db.prepare(`UPDATE open_finance_save_proposal_reviews
            SET encrypted_payload=?,state_mac=?,updated_at=?
            WHERE proposal_ref=? AND family_scope_ref=? AND actor_ref=?
                AND review_state='editing' AND updated_at=?`).run(
            this.#encrypt(proposalRef, nextPayload),
            this.#stateMac(nextRow),
            updatedAt,
            proposalRef,
            this.familyScopeRef,
            actorRef,
            row.updated_at
        );
        if (result.changes !== 1) throw new Error('open_finance_save_review_state_changed');
        this.#hardenFiles();
        return {
            proposal_ref: proposalRef,
            state: 'editing',
            payload: nextPayload,
            financial_writes: 0
        };
    }

    completeReview(proposalRef, { actorWhatsappId } = {}) {
        return this.#transition(proposalRef, {
            actorWhatsappId,
            allowedStates: ['editing', 'ready'],
            targetState: 'ready'
        });
    }

    finalizeReview(proposalRef, { actorWhatsappId } = {}) {
        return this.#transition(proposalRef, {
            actorWhatsappId,
            allowedStates: ['ready', 'finalized'],
            targetState: 'finalized'
        });
    }

    cancelReview(proposalRef, { actorWhatsappId } = {}) {
        return this.#transition(proposalRef, {
            actorWhatsappId,
            allowedStates: ['prepared', 'editing', 'cancelled'],
            targetState: 'cancelled'
        });
    }

    #transition(proposalRef, { actorWhatsappId, allowedStates, targetState }) {
        const actorRef = this.#requireActor(actorWhatsappId);
        this.purgeExpired();
        const row = this.db.prepare(`SELECT * FROM open_finance_save_proposal_reviews
            WHERE proposal_ref=? AND family_scope_ref=?`)
            .get(proposalRef, this.familyScopeRef);
        this.#assertRow(row);
        if (row.actor_ref !== actorRef) {
            throw new Error('open_finance_save_review_actor_unauthorized');
        }
        if (!allowedStates.includes(row.review_state)) {
            throw new Error('open_finance_save_review_state_conflict');
        }
        if (row.review_state === targetState) {
            return {
                proposal_ref: proposalRef,
                state: targetState,
                replay: true,
                payload: this.#readPayload(row),
                financial_writes: 0
            };
        }
        const updatedAt = this.#now();
        const terminal = ['ready', 'finalized', 'cancelled'].includes(targetState);
        const nextRow = {
            ...row,
            review_state: targetState,
            updated_at: updatedAt,
            completed_at: terminal ? updatedAt : null
        };
        const nextStateMac = this.#stateMac(nextRow);
        const result = this.db.prepare(`UPDATE open_finance_save_proposal_reviews
            SET review_state=?,state_mac=?,updated_at=?,completed_at=?
            WHERE proposal_ref=? AND family_scope_ref=? AND actor_ref=?
                AND review_state=? AND updated_at=?`).run(
            targetState,
            nextStateMac,
            updatedAt,
            nextRow.completed_at,
            proposalRef,
            this.familyScopeRef,
            actorRef,
            row.review_state,
            row.updated_at
        );
        if (result.changes !== 1) throw new Error('open_finance_save_review_state_changed');
        this.#hardenFiles();
        return {
            proposal_ref: proposalRef,
            state: targetState,
            replay: false,
            payload: this.#readPayload({ ...nextRow, state_mac: nextStateMac }),
            financial_writes: 0
        };
    }

    listActiveReviews({ actorWhatsappId, limit = 2 } = {}) {
        const actorRef = this.#requireActor(actorWhatsappId);
        if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
            throw new Error('valid_open_finance_save_review_limit_required');
        }
        this.purgeExpired();
        return this.db.prepare(`SELECT * FROM open_finance_save_proposal_reviews
            WHERE family_scope_ref=? AND actor_ref=?
                AND review_state IN ('prepared','editing')
            ORDER BY created_at,proposal_ref LIMIT ?`)
            .all(this.familyScopeRef, actorRef, limit)
            .map((row) => {
                const payload = this.#readPayload(row);
                return {
                    proposal_ref: row.proposal_ref,
                    state: row.review_state,
                    step: payload.step,
                    financial_writes: 0
                };
            });
    }

    listReadyReviews({ actorWhatsappId, limit = 2 } = {}) {
        const actorRef = this.#requireActor(actorWhatsappId);
        if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
            throw new Error('valid_open_finance_save_review_limit_required');
        }
        this.purgeExpired();
        return this.db.prepare(`SELECT * FROM open_finance_save_proposal_reviews
            WHERE family_scope_ref=? AND actor_ref=? AND review_state='ready'
            ORDER BY updated_at,proposal_ref LIMIT ?`)
            .all(this.familyScopeRef, actorRef, limit)
            .map((row) => {
                const payload = this.#readPayload(row);
                return {
                    proposal_ref: row.proposal_ref,
                    state: row.review_state,
                    expires_at: payload.expires_at,
                    financial_writes: 0
                };
            });
    }

    readReviewPrivate(proposalRef, { actorWhatsappId } = {}) {
        const actorRef = this.#requireActor(actorWhatsappId);
        this.purgeExpired();
        const row = this.db.prepare(`SELECT * FROM open_finance_save_proposal_reviews
            WHERE proposal_ref=? AND family_scope_ref=?`)
            .get(proposalRef, this.familyScopeRef);
        if (!row) return null;
        this.#assertRow(row);
        if (row.actor_ref !== actorRef) {
            throw new Error('open_finance_save_review_actor_unauthorized');
        }
        return {
            proposal_ref: row.proposal_ref,
            state: row.review_state,
            payload: this.#readPayload(row),
            financial_writes: 0
        };
    }

    close() {
        this.#hardenFiles();
        this.db.close();
        this.#hardenFiles();
    }
}

module.exports = {
    OpenFinanceSaveProposalReviewStore,
    normalizeOpenFinanceSaveReviewCatalog: normalizeCatalog
};
