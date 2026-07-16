const crypto = require('node:crypto');
const Database = require('better-sqlite3');

function requireSecret(secret) {
    const value = String(secret || '');
    if (value.length < 32) throw new Error('open_finance_baseline_secret_required');
    return value;
}

class OpenFinanceBaselineStore {
    constructor({ databasePath = ':memory:', secret } = {}) {
        this.secret = requireSecret(secret);
        this.db = new Database(databasePath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS finance_connections (
                connection_ref TEXT PRIMARY KEY, lineage_ref TEXT NOT NULL,
                owner_ref TEXT NOT NULL, active_item_ref TEXT NOT NULL,
                sync_generation INTEGER NOT NULL, authorization_state TEXT NOT NULL,
                baseline_started_at TEXT, baseline_completed_at TEXT,
                generation_reason TEXT NOT NULL, family_aggregation_allowed INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS finance_external_events (
                external_event_ref TEXT PRIMARY KEY, connection_ref TEXT NOT NULL,
                lifecycle_state TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS finance_observations (
                observation_ref TEXT PRIMARY KEY, external_event_ref TEXT NOT NULL,
                connection_ref TEXT NOT NULL, provider_status TEXT NOT NULL,
                correlation_state TEXT NOT NULL, encrypted_payload TEXT NOT NULL,
                first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS finance_candidate_queue (
                observation_ref TEXT PRIMARY KEY, external_event_ref TEXT NOT NULL,
                correlation_state TEXT NOT NULL, provider_status TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS finance_connection_revocations (
                connection_ref TEXT PRIMARY KEY, revoked_at TEXT NOT NULL,
                reason_code TEXT NOT NULL
            );
        `);
    }

    #ref(kind, value) { return crypto.createHmac('sha256', this.secret).update(`${kind}:${value}`).digest('hex').slice(0, 32); }
    #key() { return crypto.createHash('sha256').update(`open-finance-baseline:${this.secret}`).digest(); }
    #encrypt(ref, payload) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.#key(), iv);
        cipher.setAAD(Buffer.from(ref));
        const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
        return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
    }

    #economicKey(item, transaction) {
        const strong = transaction.provider_id || transaction.reference_number || transaction.receiver_reference_id;
        if (strong) return { key: `strong:${item.alias_code}:${strong}`, strong: true };
        return {
            key: ['fallback', item.alias_code, transaction.account_id, transaction.original_date || transaction.date,
                Math.abs(transaction.amount_cents), transaction.currency, transaction.type || '', transaction.bill_id || '',
                transaction.installment_number || '', transaction.total_installments || ''].join(':'),
            strong: false
        };
    }

    #validateSnapshot(snapshot) {
        if (snapshot?.provider !== 'pluggy' || snapshot?.mode !== 'live_readonly_staging') throw new Error('pluggy_live_readonly_snapshot_required');
        if (snapshot.collection_health?.complete !== true || snapshot.collection_health?.warning_count !== 0) {
            throw new Error('incomplete_open_finance_collection');
        }
        if (snapshot.items.some(item => item.availability?.accounts !== 'available' || item.availability?.transactions !== 'available')) {
            throw new Error('open_finance_source_unhealthy');
        }
    }

    ingestSnapshot(snapshot, options = {}) {
        this.#validateSnapshot(snapshot);
        const observedAt = snapshot.observed_at;
        const result = { baseline_items: 0, baselined_observations: 0, new_observations: 0, possible_replacements: 0, pending_observations: 0, alert_candidates: 0, revoked_items: 0, financial_writes: 0 };
        let processed = 0;
        const apply = this.db.transaction(() => {
            for (const item of snapshot.items) {
                const connectionRef = this.#ref('connection', item.alias_code);
                const itemRef = this.#ref('item', item.id);
                if (this.db.prepare('SELECT 1 FROM finance_connection_revocations WHERE connection_ref=?').get(connectionRef)) {
                    result.revoked_items += 1;
                    continue;
                }
                let connection = this.db.prepare('SELECT * FROM finance_connections WHERE connection_ref=?').get(connectionRef);
                if (!connection) {
                    this.db.prepare(`INSERT INTO finance_connections (
                        connection_ref,lineage_ref,owner_ref,active_item_ref,sync_generation,authorization_state,
                        baseline_started_at,generation_reason,family_aggregation_allowed
                    ) VALUES (?,?,?,?,1,'active',?,'initial',0)`).run(
                        connectionRef, this.#ref('lineage', item.alias_code), this.#ref('owner', item.owner_scope), itemRef, observedAt
                    );
                    connection = this.db.prepare('SELECT * FROM finance_connections WHERE connection_ref=?').get(connectionRef);
                } else if (connection.active_item_ref !== itemRef) {
                    throw new Error('reconnection_generation_required');
                }
                const isBaseline = !connection.baseline_completed_at;
                if (isBaseline) result.baseline_items += 1;
                for (const transaction of item.transactions) {
                    processed += 1;
                    if (options.failAfterObservations && processed > options.failAfterObservations) throw new Error('injected_baseline_failure');
                    const observationRef = this.#ref('observation', `${item.id}:${transaction.account_id}:${transaction.id}`);
                    const existing = this.db.prepare('SELECT observation_ref FROM finance_observations WHERE observation_ref=?').get(observationRef);
                    if (existing) {
                        this.db.prepare('UPDATE finance_observations SET provider_status=?,last_seen_at=? WHERE observation_ref=?')
                            .run(transaction.status, observedAt, observationRef);
                        continue;
                    }
                    const economic = this.#economicKey(item, transaction);
                    const externalEventRef = this.#ref('external_event', economic.key);
                    const priorEvent = this.db.prepare('SELECT external_event_ref FROM finance_external_events WHERE external_event_ref=?').get(externalEventRef);
                    const correlationState = priorEvent && !economic.strong ? 'possible_replacement' : priorEvent ? 'alias_confirmed' : 'new_event';
                    if (!priorEvent) {
                        this.db.prepare(`INSERT INTO finance_external_events VALUES (?,?,?,?,?)`)
                            .run(externalEventRef, connectionRef, transaction.status, observedAt, observedAt);
                    } else {
                        this.db.prepare('UPDATE finance_external_events SET lifecycle_state=?,last_seen_at=? WHERE external_event_ref=?')
                            .run(transaction.status, observedAt, externalEventRef);
                    }
                    this.db.prepare(`INSERT INTO finance_observations VALUES (?,?,?,?,?,?,?,?)`).run(
                        observationRef, externalEventRef, connectionRef, transaction.status, correlationState,
                        this.#encrypt(observationRef, { alias: item.alias_code, transaction }), observedAt, observedAt
                    );
                    if (isBaseline) result.baselined_observations += 1;
                    else {
                        result.new_observations += 1;
                        this.db.prepare(`INSERT OR IGNORE INTO finance_candidate_queue VALUES (?,?,?,?,?)`)
                            .run(observationRef, externalEventRef, correlationState, transaction.status, observedAt);
                    }
                    if (correlationState === 'possible_replacement') result.possible_replacements += 1;
                    if (transaction.status === 'PENDING') result.pending_observations += 1;
                }
                if (isBaseline) {
                    this.db.prepare('UPDATE finance_connections SET baseline_completed_at=? WHERE connection_ref=?')
                        .run(observedAt, connectionRef);
                }
            }
        });
        apply();
        return result;
    }

    startNewGeneration(alias, itemId, reason = 'reconnected', startedAt = new Date().toISOString()) {
        const connectionRef = this.#ref('connection', alias);
        if (this.db.prepare('SELECT 1 FROM finance_connection_revocations WHERE connection_ref=?').get(connectionRef)) {
            throw new Error('open_finance_connection_revoked');
        }
        const row = this.db.prepare('SELECT sync_generation FROM finance_connections WHERE connection_ref=?').get(connectionRef);
        if (!row) throw new Error('open_finance_connection_not_found');
        this.db.prepare(`UPDATE finance_connections SET active_item_ref=?,sync_generation=?,baseline_started_at=?,
            baseline_completed_at=NULL,generation_reason=?,authorization_state='active' WHERE connection_ref=?`).run(
            this.#ref('item', itemId), row.sync_generation + 1, startedAt, String(reason).slice(0, 64), connectionRef
        );
        return { generation: row.sync_generation + 1, baseline_required: true, alert_candidates: 0, financial_writes: 0 };
    }

    revokeConnection(alias, options = {}) {
        const normalizedAlias = String(alias || '').toLowerCase();
        if (!/^[a-z0-9_-]{2,48}$/.test(normalizedAlias)) throw new Error('valid_connection_alias_required');
        const connectionRef = this.#ref('connection', normalizedAlias);
        const removed = this.db.transaction(() => {
            const observations = this.db.prepare('SELECT observation_ref FROM finance_observations WHERE connection_ref=?')
                .all(connectionRef).map(row => row.observation_ref);
            const events = this.db.prepare('SELECT external_event_ref FROM finance_external_events WHERE connection_ref=?')
                .all(connectionRef).map(row => row.external_event_ref);
            let candidates = 0;
            const deleteCandidate = this.db.prepare('DELETE FROM finance_candidate_queue WHERE observation_ref=?');
            for (const observationRef of observations) candidates += deleteCandidate.run(observationRef).changes;
            const observationCount = this.db.prepare('DELETE FROM finance_observations WHERE connection_ref=?').run(connectionRef).changes;
            let eventCount = 0;
            const deleteEvent = this.db.prepare('DELETE FROM finance_external_events WHERE external_event_ref=?');
            for (const eventRef of events) eventCount += deleteEvent.run(eventRef).changes;
            const connections = this.db.prepare('DELETE FROM finance_connections WHERE connection_ref=?').run(connectionRef).changes;
            this.db.prepare(`INSERT INTO finance_connection_revocations (connection_ref,revoked_at,reason_code)
                VALUES (?,?,?) ON CONFLICT(connection_ref) DO UPDATE SET
                revoked_at=excluded.revoked_at,reason_code=excluded.reason_code`).run(
                connectionRef,
                options.revokedAt || new Date().toISOString(),
                String(options.reasonCode || 'consent_revoked').slice(0, 64)
            );
            return { connections, events: eventCount, observations: observationCount, candidates };
        })();
        return { revoked: true, removed, financial_writes: 0 };
    }

    isConnectionRevoked(alias) {
        const normalizedAlias = String(alias || '').toLowerCase();
        if (!/^[a-z0-9_-]{2,48}$/.test(normalizedAlias)) return false;
        return Boolean(this.db.prepare('SELECT 1 FROM finance_connection_revocations WHERE connection_ref=?')
            .get(this.#ref('connection', normalizedAlias)));
    }

    reinstateConnection(alias) {
        const normalizedAlias = String(alias || '').toLowerCase();
        if (!/^[a-z0-9_-]{2,48}$/.test(normalizedAlias)) throw new Error('valid_connection_alias_required');
        const changes = this.db.prepare('DELETE FROM finance_connection_revocations WHERE connection_ref=?')
            .run(this.#ref('connection', normalizedAlias)).changes;
        return { reinstated: changes === 1, baseline_required: true, financial_writes: 0 };
    }

    listCandidates() {
        return this.db.prepare(`SELECT observation_ref,external_event_ref,correlation_state,provider_status,created_at
            FROM finance_candidate_queue ORDER BY created_at,observation_ref`).all();
    }

    stats() {
        const scalar = table => this.db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total;
        return { connections: scalar('finance_connections'), events: scalar('finance_external_events'), observations: scalar('finance_observations'), candidates: scalar('finance_candidate_queue'), completed_baselines: this.db.prepare('SELECT COUNT(*) AS total FROM finance_connections WHERE baseline_completed_at IS NOT NULL').get().total, financial_writes: 0 };
    }
    close() { this.db.close(); }
}

module.exports = { OpenFinanceBaselineStore };
