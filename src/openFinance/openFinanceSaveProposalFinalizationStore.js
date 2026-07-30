const crypto = require('node:crypto');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const STATES = new Set([
    'awaiting_confirmation',
    'writing',
    'uncertain',
    'committed',
    'receipt_delivered',
    'failed',
    'cancelled',
    'invalidated',
    'expired'
]);
const TERMINAL_STATES = new Set([
    'receipt_delivered',
    'failed',
    'cancelled',
    'invalidated',
    'expired'
]);

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
    if (value.length < 32) {
        throw new Error('open_finance_final_secret_required');
    }
    return value;
}

function sanitizeReceipt(receipt = {}) {
    return {
        status: String(receipt.status || 'committed').slice(0, 32),
        sheetName: String(receipt.sheetName || receipt.receipt?.sheetName || '').slice(0, 80),
        mappedSheetName: String(
            receipt.mappedSheetName || receipt.receipt?.mappedSheetName || ''
        ).slice(0, 80),
        updatedRange: String(
            receipt.updatedRange || receipt.receipt?.updatedRange || ''
        ).slice(0, 120),
        reconciled: Boolean(receipt.reconciled || receipt.receipt?.reconciled)
    };
}

class OpenFinanceSaveProposalFinalizationStore {
    constructor({
        databasePath = ':memory:',
        secret,
        familyScope = 'shared-family',
        authorizedWhatsAppIds = [],
        clock = () => new Date()
    } = {}) {
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
            CREATE TABLE IF NOT EXISTS open_finance_save_proposal_finalizations (
                proposal_ref TEXT PRIMARY KEY,
                family_scope_ref TEXT NOT NULL,
                actor_ref TEXT NOT NULL,
                operation_key_ref TEXT NOT NULL UNIQUE,
                encrypted_payload TEXT,
                payload_version INTEGER,
                final_state TEXT NOT NULL,
                revision INTEGER NOT NULL,
                state_mac TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                completed_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_open_finance_finalizations_actor
                ON open_finance_save_proposal_finalizations(
                    family_scope_ref, actor_ref, final_state, updated_at
                );
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
        if (!normalized) throw new Error('open_finance_final_actor_required');
        return this.#hmac(`final-actor:${normalized}`);
    }

    #requireActor(value) {
        const actorRef = this.#actorRef(value);
        if (!this.authorizedActorRefs.has(actorRef)) {
            throw new Error('open_finance_final_actor_unauthorized');
        }
        return actorRef;
    }

    #now() {
        const date = new Date(this.clock());
        if (Number.isNaN(date.getTime())) {
            throw new Error('open_finance_final_time_required');
        }
        return date.toISOString();
    }

    #key() {
        return crypto.createHash('sha256')
            .update(`open-finance-finalization:${this.secret}`)
            .digest();
    }

    #encrypt(proposalRef, payload) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.#key(), iv);
        cipher.setAAD(Buffer.from(`finalization:${proposalRef}`));
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
        if (!iv || !tag || !encrypted) {
            throw new Error('open_finance_final_payload_invalid');
        }
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            this.#key(),
            Buffer.from(iv, 'base64')
        );
        decipher.setAAD(Buffer.from(`finalization:${proposalRef}`));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return JSON.parse(Buffer.concat([
            decipher.update(Buffer.from(encrypted, 'base64')),
            decipher.final()
        ]).toString('utf8'));
    }

    #stateMac(row) {
        return this.#hmac(`final-state:${stableSerialize({
            proposal_ref: row.proposal_ref,
            family_scope_ref: row.family_scope_ref,
            actor_ref: row.actor_ref,
            operation_key_ref: row.operation_key_ref,
            final_state: row.final_state,
            revision: row.revision,
            created_at: row.created_at,
            updated_at: row.updated_at,
            expires_at: row.expires_at,
            completed_at: row.completed_at || null
        })}`);
    }

    #assertRow(row) {
        if (!row ||
            row.family_scope_ref !== this.familyScopeRef ||
            !STATES.has(row.final_state) ||
            !Number.isInteger(row.revision) ||
            row.revision < 0 ||
            row.state_mac !== this.#stateMac(row)) {
            throw new Error('open_finance_final_state_metadata_mismatch');
        }
        const terminal = TERMINAL_STATES.has(row.final_state);
        if ((terminal && !row.completed_at) ||
            (!terminal && row.completed_at) ||
            (row.final_state === 'expired' &&
                (row.encrypted_payload || row.payload_version)) ||
            (row.final_state !== 'expired' &&
                (!row.encrypted_payload || row.payload_version !== 1))) {
            throw new Error('open_finance_final_state_metadata_mismatch');
        }
    }

    #readPayload(row) {
        this.#assertRow(row);
        if (row.final_state === 'expired') return null;
        const payload = this.#decrypt(row.proposal_ref, row.encrypted_payload);
        if (payload.proposal_ref !== row.proposal_ref ||
            payload.family_scope_ref !== row.family_scope_ref ||
            payload.actor_ref !== row.actor_ref ||
            payload.operation_key_ref !== row.operation_key_ref ||
            payload.created_at !== row.created_at ||
            payload.expires_at !== row.expires_at) {
            throw new Error('open_finance_final_payload_metadata_mismatch');
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

    #readRow(proposalRef) {
        return this.db.prepare(`
            SELECT * FROM open_finance_save_proposal_finalizations
            WHERE proposal_ref=? AND family_scope_ref=?
        `).get(String(proposalRef || '').trim(), this.familyScopeRef);
    }

    purgeExpired() {
        const now = this.#now();
        const rows = this.db.prepare(`
            SELECT * FROM open_finance_save_proposal_finalizations
            WHERE family_scope_ref=? AND final_state='awaiting_confirmation'
                AND expires_at<=?
        `).all(this.familyScopeRef, now);
        const update = this.db.prepare(`
            UPDATE open_finance_save_proposal_finalizations
            SET encrypted_payload=NULL,payload_version=NULL,final_state='expired',
                revision=?,state_mac=?,updated_at=?,completed_at=?
            WHERE proposal_ref=? AND revision=? AND final_state='awaiting_confirmation'
        `);
        this.db.transaction(() => {
            for (const row of rows) {
                this.#assertRow(row);
                const next = {
                    ...row,
                    final_state: 'expired',
                    revision: row.revision + 1,
                    updated_at: now,
                    completed_at: now
                };
                update.run(
                    next.revision,
                    this.#stateMac(next),
                    now,
                    now,
                    row.proposal_ref,
                    row.revision
                );
            }
        })();
        this.#hardenFiles();
        return { expired: rows.length, financial_writes: 0 };
    }

    prepare({
        proposalRef,
        actorWhatsappId,
        operationKey,
        payload,
        expiresAt
    } = {}) {
        const safeProposalRef = String(proposalRef || '').trim();
        const safeOperationKey = String(operationKey || '').trim();
        if (!/^[a-f0-9]{32}$/.test(safeProposalRef)) {
            throw new Error('open_finance_final_proposal_required');
        }
        if (!/^[a-f0-9]{48}$/.test(safeOperationKey)) {
            throw new Error('open_finance_final_operation_key_required');
        }
        const actorRef = this.#requireActor(actorWhatsappId);
        const createdAt = this.#now();
        const parsedExpiresAt = Date.parse(String(expiresAt || ''));
        if (!Number.isFinite(parsedExpiresAt)) {
            throw new Error('open_finance_final_expiry_required');
        }
        const safeExpiresAt = new Date(parsedExpiresAt).toISOString();
        if (safeExpiresAt <= createdAt) {
            throw new Error('open_finance_final_expiry_required');
        }
        const operationKeyRef = this.#hmac(`operation:${safeOperationKey}`, 48);
        this.purgeExpired();
        const existing = this.#readRow(safeProposalRef);
        if (existing) {
            this.#assertRow(existing);
            if (existing.actor_ref !== actorRef) {
                throw new Error('open_finance_final_actor_unauthorized');
            }
            const existingPayload = this.#readPayload(existing);
            if (existing.operation_key_ref !== operationKeyRef ||
                stableSerialize(existingPayload?.validated) !== stableSerialize(payload)) {
                throw new Error('open_finance_final_replay_conflict');
            }
            return {
                proposal_ref: safeProposalRef,
                state: existing.final_state,
                replay: true,
                payload: existingPayload,
                financial_writes: ['committed', 'receipt_delivered']
                    .includes(existing.final_state) ? 1 : 0
            };
        }
        const encryptedPayload = {
            proposal_ref: safeProposalRef,
            family_scope_ref: this.familyScopeRef,
            actor_ref: actorRef,
            operation_key_ref: operationKeyRef,
            operation_key: safeOperationKey,
            validated: payload,
            receipt: null,
            receipt_ref: null,
            created_at: createdAt,
            expires_at: safeExpiresAt
        };
        const row = {
            proposal_ref: safeProposalRef,
            family_scope_ref: this.familyScopeRef,
            actor_ref: actorRef,
            operation_key_ref: operationKeyRef,
            final_state: 'awaiting_confirmation',
            revision: 0,
            created_at: createdAt,
            updated_at: createdAt,
            expires_at: safeExpiresAt,
            completed_at: null
        };
        this.db.prepare(`
            INSERT INTO open_finance_save_proposal_finalizations (
                proposal_ref,family_scope_ref,actor_ref,operation_key_ref,
                encrypted_payload,payload_version,final_state,revision,state_mac,
                created_at,updated_at,expires_at,completed_at
            ) VALUES (?,?,?,?,?,1,'awaiting_confirmation',0,?,?,?,?,NULL)
        `).run(
            row.proposal_ref,
            row.family_scope_ref,
            row.actor_ref,
            row.operation_key_ref,
            this.#encrypt(safeProposalRef, encryptedPayload),
            this.#stateMac(row),
            row.created_at,
            row.updated_at,
            row.expires_at
        );
        this.#hardenFiles();
        return {
            proposal_ref: safeProposalRef,
            state: 'awaiting_confirmation',
            replay: false,
            payload: encryptedPayload,
            financial_writes: 0
        };
    }

    read(proposalRef, { actorWhatsappId } = {}) {
        const actorRef = this.#requireActor(actorWhatsappId);
        this.purgeExpired();
        const row = this.#readRow(proposalRef);
        if (!row) return null;
        this.#assertRow(row);
        if (row.actor_ref !== actorRef) {
            throw new Error('open_finance_final_actor_unauthorized');
        }
        return {
            proposal_ref: row.proposal_ref,
            state: row.final_state,
            revision: row.revision,
            payload: this.#readPayload(row),
            replay: false,
            financial_writes: ['committed', 'receipt_delivered']
                .includes(row.final_state) ? 1 : 0
        };
    }

    listActive({ actorWhatsappId, limit = 2 } = {}) {
        const actorRef = this.#requireActor(actorWhatsappId);
        if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
            throw new Error('open_finance_final_limit_required');
        }
        this.purgeExpired();
        return this.db.prepare(`
            SELECT * FROM open_finance_save_proposal_finalizations
            WHERE family_scope_ref=? AND actor_ref=?
                AND final_state IN (
                    'awaiting_confirmation','writing','uncertain','committed'
                )
            ORDER BY created_at,proposal_ref LIMIT ?
        `).all(this.familyScopeRef, actorRef, limit).map(row => {
            this.#assertRow(row);
            return {
                proposal_ref: row.proposal_ref,
                state: row.final_state,
                financial_writes: 0
            };
        });
    }

    claim(proposalRef, { actorWhatsappId } = {}) {
        const current = this.read(proposalRef, { actorWhatsappId });
        if (!current) throw new Error('open_finance_final_not_found');
        if (['committed', 'receipt_delivered'].includes(current.state)) {
            return { ...current, replay: true };
        }
        if (!['awaiting_confirmation', 'writing', 'uncertain'].includes(current.state)) {
            throw new Error('open_finance_final_state_conflict');
        }
        if (current.state === 'writing') return { ...current, replay: true };
        return this.#transition(proposalRef, {
            actorWhatsappId,
            allowedStates: ['awaiting_confirmation', 'uncertain'],
            targetState: 'writing',
            mutatePayload: payload => ({ ...payload })
        });
    }

    markCommitted(proposalRef, { actorWhatsappId, receipt } = {}) {
        const current = this.read(proposalRef, { actorWhatsappId });
        if (!current) throw new Error('open_finance_final_not_found');
        if (current.state === 'committed') return { ...current, replay: true };
        const safeReceipt = sanitizeReceipt(receipt);
        const receiptRef = this.#hmac(`receipt:${current.payload.operation_key}:${
            stableSerialize(safeReceipt)
        }`, 24);
        return this.#transition(proposalRef, {
            actorWhatsappId,
            allowedStates: ['writing'],
            targetState: 'committed',
            mutatePayload: payload => ({
                ...payload,
                receipt: safeReceipt,
                receipt_ref: receiptRef
            })
        });
    }

    acknowledgeReceipt(proposalRef, { actorWhatsappId } = {}) {
        const current = this.read(proposalRef, { actorWhatsappId });
        if (!current) throw new Error('open_finance_final_not_found');
        if (current.state === 'receipt_delivered') {
            return { ...current, replay: true };
        }
        return this.#transition(proposalRef, {
            actorWhatsappId,
            allowedStates: ['committed'],
            targetState: 'receipt_delivered',
            mutatePayload: payload => ({ ...payload })
        });
    }

    markUncertain(proposalRef, { actorWhatsappId, reasonCode } = {}) {
        const safeReason = String(reasonCode || 'write_result_uncertain')
            .replace(/[^a-z0-9_:-]/gi, '_')
            .slice(0, 80);
        return this.#transition(proposalRef, {
            actorWhatsappId,
            allowedStates: ['writing', 'uncertain'],
            targetState: 'uncertain',
            mutatePayload: payload => ({
                ...payload,
                last_reason_code: safeReason
            })
        });
    }

    cancel(proposalRef, { actorWhatsappId } = {}) {
        const current = this.read(proposalRef, { actorWhatsappId });
        if (!current) throw new Error('open_finance_final_not_found');
        if (current.state === 'cancelled') return { ...current, replay: true };
        return this.#transition(proposalRef, {
            actorWhatsappId,
            allowedStates: ['awaiting_confirmation'],
            targetState: 'cancelled',
            mutatePayload: payload => ({ ...payload })
        });
    }

    invalidate(proposalRef, { actorWhatsappId, reasonCode } = {}) {
        const safeReason = String(reasonCode || 'revalidation_failed')
            .replace(/[^a-z0-9_:-]/gi, '_')
            .slice(0, 80);
        return this.#transition(proposalRef, {
            actorWhatsappId,
            allowedStates: ['awaiting_confirmation'],
            targetState: 'invalidated',
            mutatePayload: payload => ({
                ...payload,
                last_reason_code: safeReason
            })
        });
    }

    #transition(proposalRef, {
        actorWhatsappId,
        allowedStates,
        targetState,
        mutatePayload
    }) {
        const actorRef = this.#requireActor(actorWhatsappId);
        const row = this.#readRow(proposalRef);
        this.#assertRow(row);
        if (row.actor_ref !== actorRef) {
            throw new Error('open_finance_final_actor_unauthorized');
        }
        if (!allowedStates.includes(row.final_state)) {
            if (row.final_state === targetState) {
                return {
                    proposal_ref: row.proposal_ref,
                    state: row.final_state,
                    revision: row.revision,
                    payload: this.#readPayload(row),
                    replay: true,
                    financial_writes: ['committed', 'receipt_delivered']
                        .includes(row.final_state) ? 1 : 0
                };
            }
            throw new Error('open_finance_final_state_conflict');
        }
        const updatedAt = this.#now();
        const terminal = TERMINAL_STATES.has(targetState);
        const payload = mutatePayload(this.#readPayload(row));
        const nextRow = {
            ...row,
            final_state: targetState,
            revision: row.revision + 1,
            updated_at: updatedAt,
            completed_at: terminal ? updatedAt : null
        };
        const result = this.db.prepare(`
            UPDATE open_finance_save_proposal_finalizations
            SET encrypted_payload=?,final_state=?,revision=?,state_mac=?,
                updated_at=?,completed_at=?
            WHERE proposal_ref=? AND family_scope_ref=? AND actor_ref=?
                AND revision=? AND final_state=?
        `).run(
            this.#encrypt(proposalRef, payload),
            targetState,
            nextRow.revision,
            this.#stateMac(nextRow),
            updatedAt,
            nextRow.completed_at,
            proposalRef,
            this.familyScopeRef,
            actorRef,
            row.revision,
            row.final_state
        );
        if (result.changes !== 1) {
            throw new Error('open_finance_final_state_changed');
        }
        this.#hardenFiles();
        return {
            proposal_ref: proposalRef,
            state: targetState,
            revision: nextRow.revision,
            payload,
            replay: false,
            financial_writes: ['committed', 'receipt_delivered']
                .includes(targetState) ? 1 : 0
        };
    }

    close() {
        this.#hardenFiles();
        this.db.close();
        this.#hardenFiles();
    }
}

module.exports = {
    OpenFinanceSaveProposalFinalizationStore,
    sanitizeOpenFinanceFinalizationReceipt: sanitizeReceipt
};
