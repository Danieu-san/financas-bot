const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
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
    constructor({ databasePath = ':memory:', terminalAnchorPath, secret } = {}) {
        this.secret = requireSecret(secret);
        this.databasePath = databasePath;
        this.terminalAnchorPath = databasePath === ':memory:'
            ? null
            : String(terminalAnchorPath || `${databasePath}.terminal-anchor.sqlite`);
        if (this.terminalAnchorPath &&
            path.resolve(this.terminalAnchorPath) === path.resolve(this.databasePath)) {
            throw new Error('open_finance_terminal_journal_anchor_must_be_separate');
        }
        const anchorExisted = this.terminalAnchorPath && fs.existsSync(this.terminalAnchorPath);
        this.db = null;
        this.anchorDb = null;
        this.memoryAnchor = null;
        try {
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
                CREATE TABLE IF NOT EXISTS open_finance_save_proposal_terminal_journal (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    proposal_ref TEXT NOT NULL UNIQUE,
                    terminal_state TEXT NOT NULL,
                    confirmation_ref_hash TEXT,
                    confirmation_actor_ref TEXT,
                    confirmation_ready_at TEXT,
                    confirmation_expires_at TEXT,
                    confirmation_decided_at TEXT NOT NULL,
                    resolved_by_ref TEXT,
                    entry_mac TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS open_finance_terminal_journal_metadata (
                    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
                    journal_id TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    metadata_mac TEXT NOT NULL
                );
            `);
            if (this.terminalAnchorPath) {
                this.anchorDb = new Database(this.terminalAnchorPath);
                this.anchorDb.pragma('journal_mode = DELETE');
                this.anchorDb.pragma('synchronous = FULL');
                this.anchorDb.exec(`
                    CREATE TABLE IF NOT EXISTS open_finance_terminal_journal_anchor (
                        singleton INTEGER PRIMARY KEY CHECK(singleton=1),
                        schema TEXT NOT NULL,
                        journal_id TEXT NOT NULL,
                        entries INTEGER NOT NULL,
                        sequence INTEGER NOT NULL,
                        head_mac TEXT NOT NULL,
                        anchor_mac TEXT NOT NULL
                    );
                `);
            }
            this.#initializeTerminalAnchor({ anchorExisted });
            this.#hardenFiles();
        } catch (error) {
            try { this.anchorDb?.close(); } catch {}
            try { this.db?.close(); } catch {}
            throw error;
        }
    }

    #hmac(value) {
        return crypto.createHmac('sha256', this.secret).update(String(value || '')).digest('hex').slice(0, 32);
    }

    #metadataMac({ journal_id: journalId, created_at: createdAt }) {
        return this.#hmac(`open-finance-terminal-journal-metadata:${journalId}:${createdAt}`);
    }

    #anchorMac(anchor) {
        return this.#hmac(`open-finance-terminal-journal-anchor:${JSON.stringify(anchor)}`);
    }

    #terminalRows() {
        return this.db.prepare(`SELECT sequence,entry_mac
            FROM open_finance_save_proposal_terminal_journal ORDER BY sequence`).all();
    }

    #terminalHead(journalId, rows = this.#terminalRows()) {
        let head = this.#hmac(`open-finance-terminal-journal-head:${journalId}:root`);
        for (const row of rows) {
            head = this.#hmac(
                `open-finance-terminal-journal-head:${journalId}:${head}:${row.sequence}:${row.entry_mac}`
            );
        }
        return {
            entries: rows.length,
            sequence: rows.length ? rows[rows.length - 1].sequence : 0,
            head_mac: head
        };
    }

    #readMetadata() {
        const metadata = this.db.prepare(`SELECT journal_id,created_at,metadata_mac
            FROM open_finance_terminal_journal_metadata WHERE singleton=1`).get();
        if (!metadata || !/^[a-f0-9]{32}$/.test(metadata.journal_id) ||
            Number.isNaN(new Date(metadata.created_at).getTime()) ||
            metadata.metadata_mac !== this.#metadataMac(metadata)) {
            throw new Error('open_finance_terminal_journal_metadata_mismatch');
        }
        return metadata;
    }

    #readAnchor() {
        if (!this.anchorDb) return this.memoryAnchor;
        return this.anchorDb.prepare(`SELECT schema,journal_id,entries,sequence,head_mac,anchor_mac
            FROM open_finance_terminal_journal_anchor WHERE singleton=1`).get() || null;
    }

    #writeAnchor(anchor) {
        const row = { ...anchor, anchor_mac: this.#anchorMac(anchor) };
        if (!this.anchorDb) {
            this.memoryAnchor = row;
            return;
        }
        this.anchorDb.prepare(`INSERT INTO open_finance_terminal_journal_anchor (
            singleton,schema,journal_id,entries,sequence,head_mac,anchor_mac
        ) VALUES (1,?,?,?,?,?,?)
        ON CONFLICT(singleton) DO UPDATE SET
            schema=excluded.schema,
            journal_id=excluded.journal_id,
            entries=excluded.entries,
            sequence=excluded.sequence,
            head_mac=excluded.head_mac,
            anchor_mac=excluded.anchor_mac`).run(
            row.schema,
            row.journal_id,
            row.entries,
            row.sequence,
            row.head_mac,
            row.anchor_mac
        );
        this.#hardenFiles();
    }

    #expectedAnchor(metadata = this.#readMetadata()) {
        return {
            schema: 'open-finance-terminal-journal-anchor-v1',
            journal_id: metadata.journal_id,
            ...this.#terminalHead(metadata.journal_id)
        };
    }

    #initializeTerminalAnchor({ anchorExisted }) {
        let metadata = this.db.prepare(`SELECT journal_id,created_at,metadata_mac
            FROM open_finance_terminal_journal_metadata WHERE singleton=1`).get();
        const terminalCount = this.db.prepare(`SELECT COUNT(*) AS entries
            FROM open_finance_save_proposal_terminal_journal`).get().entries;
        const anchor = this.#readAnchor();
        if (!metadata) {
            if (anchorExisted || anchor || terminalCount > 0) {
                throw new Error('open_finance_terminal_journal_anchor_migration_required');
            }
            metadata = {
                journal_id: crypto.randomBytes(16).toString('hex'),
                created_at: new Date().toISOString()
            };
            metadata.metadata_mac = this.#metadataMac(metadata);
            this.db.prepare(`INSERT INTO open_finance_terminal_journal_metadata (
                singleton,journal_id,created_at,metadata_mac
            ) VALUES (1,?,?,?)`).run(
                metadata.journal_id,
                metadata.created_at,
                metadata.metadata_mac
            );
            this.#writeAnchor(this.#expectedAnchor(metadata));
            return;
        }
        metadata = this.#readMetadata();
        if (!anchor) throw new Error('open_finance_terminal_journal_anchor_required');
        this.#assertTerminalAnchorIntegrity(metadata, anchor);
    }

    #assertTerminalAnchorIntegrity(metadata = this.#readMetadata(), anchor = this.#readAnchor()) {
        if (!anchor) throw new Error('open_finance_terminal_journal_anchor_required');
        const unsigned = {
            schema: anchor.schema,
            journal_id: anchor.journal_id,
            entries: anchor.entries,
            sequence: anchor.sequence,
            head_mac: anchor.head_mac
        };
        const validShape = anchor.schema === 'open-finance-terminal-journal-anchor-v1' &&
            /^[a-f0-9]{32}$/.test(String(anchor.journal_id || '')) &&
            Number.isInteger(anchor.entries) && anchor.entries >= 0 &&
            Number.isInteger(anchor.sequence) && anchor.sequence >= 0 &&
            /^[a-f0-9]{32}$/.test(String(anchor.head_mac || '')) &&
            /^[a-f0-9]{32}$/.test(String(anchor.anchor_mac || ''));
        const expected = this.#expectedAnchor(metadata);
        if (!validShape ||
            anchor.anchor_mac !== this.#anchorMac(unsigned) ||
            JSON.stringify(unsigned) !== JSON.stringify(expected)) {
            throw new Error('open_finance_terminal_journal_anchor_mismatch');
        }
        return expected;
    }

    #refreshTerminalAnchor() {
        this.#writeAnchor(this.#expectedAnchor());
        this.#assertTerminalAnchorIntegrity();
    }

    #hardenFiles() {
        for (const file of [
            this.databasePath,
            `${this.databasePath}-wal`,
            `${this.databasePath}-shm`,
            this.terminalAnchorPath
        ]) {
            if (!file || file === ':memory:' || !fs.existsSync(file)) continue;
            try { fs.chmodSync(file, 0o600); } catch {}
        }
    }

    #ref(alias) {
        return crypto.createHmac('sha256', this.secret)
            .update(`open-finance-revocation-lineage:${normalizeAlias(alias)}`).digest('hex').slice(0, 32);
    }

    recordRevocation({ alias, generation = 1, revokedAt = new Date().toISOString(),
        keyVersion = 1, reasonCode = 'consent_revoked' } = {}) {
        this.#assertTerminalAnchorIntegrity();
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
        this.#assertTerminalAnchorIntegrity();
        const row = this.db.prepare(`SELECT MAX(generation) AS generation FROM open_finance_revocation_journal
            WHERE alias_ref=?`).get(this.#ref(alias));
        return row?.generation || 0;
    }

    isGenerationRevoked(alias, generation = 1) {
        return normalizeGeneration(generation) <= this.revokedGeneration(alias);
    }

    aliasRef(alias) {
        return this.#ref(alias);
    }

    listRevocations() {
        this.#assertTerminalAnchorIntegrity();
        return this.db.prepare(`SELECT alias_ref,generation,revoked_at FROM open_finance_revocation_journal
            ORDER BY sequence`).all();
    }

    #normalizeSaveProposalTerminal(entry) {
        const proposalRef = String(entry?.proposal_ref || '');
        const terminalState = String(entry?.terminal_state || '');
        const confirmationRefHash = entry?.confirmation_ref_hash || null;
        const confirmationActorRef = entry?.confirmation_actor_ref || null;
        const confirmationReadyAt = entry?.confirmation_ready_at || null;
        const confirmationExpiresAt = entry?.confirmation_expires_at || null;
        const resolvedByRef = entry?.resolved_by_ref || null;
        const confirmationDecidedAt = new Date(entry?.confirmation_decided_at);
        if (!/^[a-f0-9]{32}$/.test(proposalRef) ||
            !['accepted', 'declined', 'cancelled'].includes(terminalState) ||
            Number.isNaN(confirmationDecidedAt.getTime())) {
            throw new Error('valid_save_proposal_terminal_required');
        }
        const confirmationFields = [
            confirmationRefHash,
            confirmationActorRef,
            confirmationReadyAt,
            confirmationExpiresAt
        ];
        const hasConfirmation = confirmationFields.some(Boolean);
        if (hasConfirmation && (
            !/^[a-f0-9]{32}$/.test(String(confirmationRefHash || '')) ||
            !/^[a-f0-9]{32}$/.test(String(confirmationActorRef || '')) ||
            Number.isNaN(new Date(confirmationReadyAt).getTime()) ||
            Number.isNaN(new Date(confirmationExpiresAt).getTime())
        )) {
            throw new Error('valid_save_proposal_terminal_confirmation_required');
        }
        if (terminalState !== 'cancelled' && !hasConfirmation) {
            throw new Error('save_proposal_terminal_confirmation_required');
        }
        if (terminalState === 'cancelled' && !/^[a-f0-9]{32}$/.test(String(resolvedByRef || ''))) {
            throw new Error('save_proposal_terminal_resolver_required');
        }
        return {
            proposal_ref: proposalRef,
            terminal_state: terminalState,
            confirmation_ref_hash: confirmationRefHash,
            confirmation_actor_ref: confirmationActorRef,
            confirmation_ready_at: hasConfirmation ? new Date(confirmationReadyAt).toISOString() : null,
            confirmation_expires_at: hasConfirmation ? new Date(confirmationExpiresAt).toISOString() : null,
            confirmation_decided_at: confirmationDecidedAt.toISOString(),
            resolved_by_ref: resolvedByRef
        };
    }

    #saveProposalTerminalMac(entry) {
        return this.#hmac(`open-finance-save-proposal-terminal:${JSON.stringify(entry)}`);
    }

    #readSaveProposalTerminal(row) {
        if (!row) return null;
        const entry = this.#normalizeSaveProposalTerminal(row);
        if (row.entry_mac !== this.#saveProposalTerminalMac(entry)) {
            throw new Error('save_proposal_terminal_journal_metadata_mismatch');
        }
        return entry;
    }

    recordSaveProposalTerminal(entry = {}) {
        this.#assertTerminalAnchorIntegrity();
        const normalized = this.#normalizeSaveProposalTerminal(entry);
        const existing = this.db.prepare(`SELECT proposal_ref,terminal_state,confirmation_ref_hash,
            confirmation_actor_ref,confirmation_ready_at,confirmation_expires_at,
            confirmation_decided_at,resolved_by_ref,entry_mac
            FROM open_finance_save_proposal_terminal_journal WHERE proposal_ref=?`)
            .get(normalized.proposal_ref);
        if (existing) {
            const prior = this.#readSaveProposalTerminal(existing);
            if (JSON.stringify(prior) !== JSON.stringify(normalized)) {
                throw new Error('save_proposal_terminal_journal_conflict');
            }
            return { recorded: false, replay: true, terminal_state: prior.terminal_state,
                financial_writes: 0 };
        }
        this.db.prepare(`INSERT INTO open_finance_save_proposal_terminal_journal (
                proposal_ref,terminal_state,confirmation_ref_hash,confirmation_actor_ref,
                confirmation_ready_at,confirmation_expires_at,confirmation_decided_at,entry_mac,
                resolved_by_ref
            ) VALUES (?,?,?,?,?,?,?,?,?)`).run(
                normalized.proposal_ref,
                normalized.terminal_state,
                normalized.confirmation_ref_hash,
                normalized.confirmation_actor_ref,
                normalized.confirmation_ready_at,
                normalized.confirmation_expires_at,
                normalized.confirmation_decided_at,
                this.#saveProposalTerminalMac(normalized),
                normalized.resolved_by_ref
            );
        this.#refreshTerminalAnchor();
        return { recorded: true, replay: false, terminal_state: normalized.terminal_state,
            financial_writes: 0 };
    }

    getSaveProposalTerminal(proposalRef) {
        this.#assertTerminalAnchorIntegrity();
        const normalized = String(proposalRef || '');
        if (!/^[a-f0-9]{32}$/.test(normalized)) throw new Error('valid_save_proposal_ref_required');
        return this.#readSaveProposalTerminal(this.db.prepare(`SELECT proposal_ref,terminal_state,
            confirmation_ref_hash,confirmation_actor_ref,confirmation_ready_at,
            confirmation_expires_at,confirmation_decided_at,resolved_by_ref,entry_mac
            FROM open_finance_save_proposal_terminal_journal WHERE proposal_ref=?`).get(normalized));
    }

    listSaveProposalTerminals() {
        this.#assertTerminalAnchorIntegrity();
        return this.db.prepare(`SELECT proposal_ref,terminal_state,confirmation_ref_hash,
            confirmation_actor_ref,confirmation_ready_at,confirmation_expires_at,
            confirmation_decided_at,resolved_by_ref,entry_mac
            FROM open_finance_save_proposal_terminal_journal ORDER BY sequence`).all()
            .map(row => this.#readSaveProposalTerminal(row));
    }

    checkpoint() {
        this.#assertTerminalAnchorIntegrity();
        const row = this.db.prepare(`SELECT COUNT(*) AS entries,COALESCE(MAX(sequence),0) AS sequence,
            MAX(revoked_at) AS latest_revoked_at FROM open_finance_revocation_journal`).get();
        return Object.freeze({ schema: 'open-finance-revocation-journal-v1', entries: row.entries,
            sequence: row.sequence, latest_revoked_at: row.latest_revoked_at || null, financial_writes: 0 });
    }

    reapplyRevocations({ mappings = [], vault, baseline, outbox } = {}) {
        this.#assertTerminalAnchorIntegrity();
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

    close() {
        this.#hardenFiles();
        this.anchorDb?.close();
        this.db.close();
        this.#hardenFiles();
    }
}

module.exports = { OpenFinanceRevocationJournal };
