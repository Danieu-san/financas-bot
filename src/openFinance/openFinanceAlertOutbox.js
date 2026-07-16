const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const ALERTABLE_CLASSIFICATIONS = new Set(['purchase', 'refund']);

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_outbox_secret_required');
    return value;
}

function normalizePolicies(policies = []) {
    const aliases = new Set();
    return policies.map(policy => {
        const alias = String(policy.alias || '').toLowerCase();
        const owner = String(policy.source_owner || '').toLowerCase();
        const recipient = String(policy.whatsapp_recipient || '').toLowerCase();
        const viewers = [...new Set((policy.authorized_viewers || []).map(value => String(value).toLowerCase()))];
        const principal = String(policy.write_confirmation_principal || '').toLowerCase();
        if (!/^[a-z0-9_-]{2,48}$/.test(alias) || !['daniel', 'thais'].includes(owner) || recipient !== owner ||
            principal !== owner || viewers.length !== 1 || viewers[0] !== owner || policy.family_aggregation_allowed !== false) {
            throw new Error('invalid_fail_closed_visibility_policy');
        }
        if (aliases.has(alias)) throw new Error('duplicate_visibility_policy');
        aliases.add(alias);
        return { alias, owner, recipient, principal, viewers, family: false };
    });
}

class OpenFinanceAlertOutbox {
    constructor({ databasePath = ':memory:', secret } = {}) {
        this.secret = requireSecret(secret);
        this.db = new Database(databasePath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS finance_alert_outbox (
                alert_ref TEXT PRIMARY KEY, external_event_ref TEXT NOT NULL,
                milestone TEXT NOT NULL, recipient_ref TEXT NOT NULL,
                encrypted_payload TEXT NOT NULL, delivery_state TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
                sent_at TEXT, whatsapp_message_ref TEXT,
                UNIQUE(external_event_ref, milestone)
            );
            CREATE TABLE IF NOT EXISTS finance_alert_revocations (
                alias_ref TEXT PRIMARY KEY, revoked_at TEXT NOT NULL,
                reason_code TEXT NOT NULL
            );
        `);
        const columns = new Set(this.db.prepare('PRAGMA table_info(finance_alert_outbox)').all().map(row => row.name));
        for (const [name, type] of [
            ['lease_token', 'TEXT'], ['lease_expires_at', 'TEXT'], ['last_error_code', 'TEXT']
        ]) {
            if (!columns.has(name)) this.db.exec(`ALTER TABLE finance_alert_outbox ADD COLUMN ${name} ${type}`);
        }
    }
    #ref(kind, value) { return crypto.createHmac('sha256', this.secret).update(`${kind}:${value}`).digest('hex').slice(0, 32); }
    #key() { return crypto.createHash('sha256').update(`open-finance-outbox:${this.secret}`).digest(); }
    #encrypt(ref, payload) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.#key(), iv);
        cipher.setAAD(Buffer.from(ref));
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
        return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
    }
    #decrypt(ref, value) {
        const [iv, tag, encrypted] = String(value || '').split('.');
        if (!iv || !tag || !encrypted) throw new Error('invalid_encrypted_outbox_payload');
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.#key(), Buffer.from(iv, 'base64'));
        decipher.setAAD(Buffer.from(ref));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return JSON.parse(Buffer.concat([
            decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()
        ]).toString('utf8'));
    }

    enqueue({ candidates = [], lifecycleDecisions = [], items = [], policies = [], baselineComplete = false, createdAt = new Date().toISOString() } = {}) {
        if (!baselineComplete) throw new Error('outbox_requires_completed_baseline');
        const normalizedPolicies = new Map(normalizePolicies(policies).map(policy => [policy.alias, policy]));
        const decisionByRef = new Map(lifecycleDecisions.map(decision => [decision.observation_ref, decision]));
        const sourceByRef = new Map();
        for (const item of items) {
            for (const transaction of item.transactions || []) {
                const observationRef = this.#ref('observation', `${item.id}:${transaction.account_id}:${transaction.id}`);
                sourceByRef.set(observationRef, { alias: item.alias_code, transaction });
            }
        }
        let inserted = 0; let replayed = 0; let blocked = 0;
        const statement = this.db.prepare(`INSERT OR IGNORE INTO finance_alert_outbox (
            alert_ref,external_event_ref,milestone,recipient_ref,encrypted_payload,delivery_state,created_at
        ) VALUES (?,?,?,?,?,'pending',?)`);
        const apply = this.db.transaction(() => {
            for (const candidate of candidates) {
                const decision = decisionByRef.get(candidate.observation_ref);
                const source = sourceByRef.get(candidate.observation_ref);
                if (!decision || !source || candidate.correlation_state === 'possible_replacement') { blocked += 1; continue; }
                const policy = normalizedPolicies.get(source.alias);
                const ineligible = !ALERTABLE_CLASSIFICATIONS.has(decision.classification) ||
                    (decision.provider_state === 'PENDING' && decision.lifecycle_milestone !== 'first_pending');
                const revoked = this.db.prepare('SELECT 1 FROM finance_alert_revocations WHERE alias_ref=?')
                    .get(this.#ref('alias', source.alias));
                if (!policy || ineligible || revoked) { blocked += 1; continue; }
                const milestone = decision.provider_state === 'PENDING' ? 'first_pending' : decision.lifecycle_milestone;
                const alertRef = this.#ref('alert', `${candidate.external_event_ref}:${milestone}`);
                const payload = {
                    recipient: policy.recipient,
                    alias: source.alias,
                    classification: decision.classification,
                    provider_state: decision.provider_state,
                    date: source.transaction.date,
                    amount_cents: source.transaction.amount_cents,
                    description: String(source.transaction.description || '').slice(0, 120),
                    internal_reference: alertRef.slice(0, 10),
                    write_enabled: false
                };
                const result = statement.run(alertRef, candidate.external_event_ref, milestone,
                    this.#ref('recipient', policy.recipient), this.#encrypt(alertRef, payload), createdAt);
                if (result.changes) inserted += 1; else replayed += 1;
            }
        });
        apply();
        return { inserted, replayed, blocked, transport_calls: 0, financial_writes: 0 };
    }

    listPending() {
        return this.db.prepare(`SELECT alert_ref, milestone, delivery_state, attempts, created_at
            FROM finance_alert_outbox WHERE delivery_state='pending' ORDER BY created_at,alert_ref`).all();
    }
    claimNext({ canaryAlias, now = new Date().toISOString(), leaseSeconds = 120 } = {}) {
        const alias = String(canaryAlias || '').toLowerCase();
        if (!/^[a-z0-9_-]{2,48}$/.test(alias)) throw new Error('valid_canary_alias_required');
        if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 900) throw new Error('invalid_outbox_lease');
        const leaseToken = crypto.randomBytes(24).toString('hex');
        const leaseExpiresAt = new Date(Date.parse(now) + leaseSeconds * 1000).toISOString();
        return this.db.transaction(() => {
            const rows = this.db.prepare(`SELECT alert_ref,encrypted_payload,delivery_state,lease_expires_at
                FROM finance_alert_outbox
                WHERE delivery_state='pending' OR (delivery_state='in_flight' AND lease_expires_at<=?)
                ORDER BY created_at,alert_ref`).all(now);
            for (const row of rows) {
                const payload = this.#decrypt(row.alert_ref, row.encrypted_payload);
                if (String(payload.alias || '').toLowerCase() !== alias) continue;
                if (!ALERTABLE_CLASSIFICATIONS.has(payload.classification)) continue;
                const updated = this.db.prepare(`UPDATE finance_alert_outbox SET delivery_state='in_flight',
                    lease_token=?,lease_expires_at=?,attempts=attempts+1,last_error_code=NULL
                    WHERE alert_ref=? AND (delivery_state='pending' OR
                        (delivery_state='in_flight' AND lease_expires_at<=?))`)
                    .run(leaseToken, leaseExpiresAt, row.alert_ref, now);
                if (!updated.changes) continue;
                return { alert_ref: row.alert_ref, lease_token: leaseToken, ...payload };
            }
            return null;
        })();
    }
    quarantineNonAlertable() {
        let blocked = 0;
        const apply = this.db.transaction(() => {
            const rows = this.db.prepare(`SELECT alert_ref,encrypted_payload FROM finance_alert_outbox
                WHERE delivery_state IN ('pending','in_flight')`).all();
            const statement = this.db.prepare(`UPDATE finance_alert_outbox SET delivery_state='blocked',
                lease_token=NULL,lease_expires_at=NULL,last_error_code='classification_not_alertable'
                WHERE alert_ref=? AND delivery_state IN ('pending','in_flight')`);
            for (const row of rows) {
                const payload = this.#decrypt(row.alert_ref, row.encrypted_payload);
                if (ALERTABLE_CLASSIFICATIONS.has(payload.classification)) continue;
                blocked += statement.run(row.alert_ref).changes;
            }
        });
        apply();
        return { blocked, financial_writes: 0 };
    }
    acknowledgeSent({ alertRef, leaseToken, whatsappMessageId, sentAt = new Date().toISOString() } = {}) {
        if (!alertRef || !leaseToken || !whatsappMessageId) throw new Error('outbox_ack_fields_required');
        const result = this.db.prepare(`UPDATE finance_alert_outbox SET delivery_state='sent',sent_at=?,
            whatsapp_message_ref=?,lease_token=NULL,lease_expires_at=NULL,last_error_code=NULL
            WHERE alert_ref=? AND delivery_state='in_flight' AND lease_token=?`)
            .run(sentAt, this.#ref('whatsapp-message', whatsappMessageId), alertRef, leaseToken);
        if (!result.changes) throw new Error('outbox_ack_lease_mismatch');
        return { sent: true, financial_writes: 0 };
    }
    acknowledgeUserConfirmed({ internalReference, confirmedAt = new Date().toISOString() } = {}) {
        const reference = String(internalReference || '').toLowerCase();
        if (!/^[a-f0-9]{10}$/.test(reference)) throw new Error('valid_internal_reference_required');
        const candidates = this.db.prepare(`SELECT alert_ref,encrypted_payload FROM finance_alert_outbox
            WHERE delivery_state='pending' AND attempts>0 AND last_error_code='transport_ack_unavailable'`).all()
            .filter(row => this.#decrypt(row.alert_ref, row.encrypted_payload).internal_reference === reference);
        if (candidates.length !== 1) throw new Error('ambiguous_user_confirmation');
        const row = candidates[0];
        const result = this.db.prepare(`UPDATE finance_alert_outbox SET delivery_state='sent',sent_at=?,
            whatsapp_message_ref=?,lease_token=NULL,lease_expires_at=NULL,last_error_code='user_confirmed_after_ambiguous_ack'
            WHERE alert_ref=? AND delivery_state='pending' AND attempts>0 AND last_error_code='transport_ack_unavailable'`)
            .run(confirmedAt, this.#ref('whatsapp-message', `user-confirmed:${row.alert_ref}`), row.alert_ref);
        if (result.changes !== 1) throw new Error('user_confirmation_state_changed');
        return { sent: true, alert_ref: row.alert_ref, financial_writes: 0 };
    }
    releaseFailed({ alertRef, leaseToken, errorCode = 'transport_error' } = {}) {
        const code = String(errorCode || '').toLowerCase();
        if (!/^[a-z0-9_]{2,48}$/.test(code)) throw new Error('invalid_outbox_error_code');
        const result = this.db.prepare(`UPDATE finance_alert_outbox SET delivery_state='pending',
            lease_token=NULL,lease_expires_at=NULL,last_error_code=?
            WHERE alert_ref=? AND delivery_state='in_flight' AND lease_token=?`)
            .run(code, alertRef, leaseToken);
        if (!result.changes) throw new Error('outbox_release_lease_mismatch');
        return { released: true, financial_writes: 0 };
    }
    revokeSourceAlias(alias, options = {}) {
        const normalizedAlias = String(alias || '').toLowerCase();
        if (!/^[a-z0-9_-]{2,48}$/.test(normalizedAlias)) throw new Error('valid_source_alias_required');
        const aliasRef = this.#ref('alias', normalizedAlias);
        const removed = this.db.transaction(() => {
            this.db.prepare(`INSERT INTO finance_alert_revocations (alias_ref,revoked_at,reason_code)
                VALUES (?,?,?) ON CONFLICT(alias_ref) DO UPDATE SET
                revoked_at=excluded.revoked_at,reason_code=excluded.reason_code`).run(
                aliasRef,
                options.revokedAt || new Date().toISOString(),
                String(options.reasonCode || 'consent_revoked').slice(0, 64)
            );
            const rows = this.db.prepare('SELECT alert_ref,encrypted_payload FROM finance_alert_outbox').all();
            const statement = this.db.prepare('DELETE FROM finance_alert_outbox WHERE alert_ref=?');
            let count = 0;
            for (const row of rows) {
                const payload = this.#decrypt(row.alert_ref, row.encrypted_payload);
                if (String(payload.alias || '').toLowerCase() === normalizedAlias) count += statement.run(row.alert_ref).changes;
            }
            return count;
        })();
        return { revoked: true, removed_alerts: removed, financial_writes: 0 };
    }
    isSourceRevoked(alias) {
        const normalizedAlias = String(alias || '').toLowerCase();
        if (!/^[a-z0-9_-]{2,48}$/.test(normalizedAlias)) return false;
        return Boolean(this.db.prepare('SELECT 1 FROM finance_alert_revocations WHERE alias_ref=?')
            .get(this.#ref('alias', normalizedAlias)));
    }
    reinstateSourceAlias(alias) {
        const normalizedAlias = String(alias || '').toLowerCase();
        if (!/^[a-z0-9_-]{2,48}$/.test(normalizedAlias)) throw new Error('valid_source_alias_required');
        const changes = this.db.prepare('DELETE FROM finance_alert_revocations WHERE alias_ref=?')
            .run(this.#ref('alias', normalizedAlias)).changes;
        return { reinstated: changes === 1, financial_writes: 0 };
    }
    stats() {
        const row = this.db.prepare(`SELECT COUNT(*) total,
            SUM(CASE WHEN delivery_state='pending' THEN 1 ELSE 0 END) pending,
            SUM(CASE WHEN delivery_state='in_flight' THEN 1 ELSE 0 END) in_flight,
            SUM(CASE WHEN delivery_state='blocked' THEN 1 ELSE 0 END) blocked,
            SUM(CASE WHEN delivery_state='sent' THEN 1 ELSE 0 END) sent FROM finance_alert_outbox`).get();
        return { total: row.total, pending: row.pending || 0, in_flight: row.in_flight || 0,
            blocked: row.blocked || 0, sent: row.sent || 0, transport_calls: 0, financial_writes: 0 };
    }
    close() { this.db.close(); }
}

module.exports = { OpenFinanceAlertOutbox, normalizePolicies, ALERTABLE_CLASSIFICATIONS };
