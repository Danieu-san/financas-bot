const crypto = require('crypto');
const Database = require('better-sqlite3');

const {
    PROJECTED_PLANS_SCHEMA_VERSION,
    assertProjectedPlans,
    __test__: { stableStringify }
} = require('./projectedPlansContract');

const PROJECTED_PLANS_STORE_SCHEMA_VERSION = 1;
const PROJECTED_PLANS_STORE_BACKUP_VERSION = 'projected-plans-store-backup-v1';

function checksum(value) {
    return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function parseJson(value) {
    return JSON.parse(value);
}

function nowIso(clock) {
    return String(clock());
}

class ProjectedPlansStore {
    constructor({ dbPath, writeEnabled = false, clock = () => new Date().toISOString() } = {}) {
        if (!dbPath) throw new Error('projected_plans_store_db_path_required');
        this.db = new Database(dbPath);
        this.db.pragma('foreign_keys = ON');
        this.writeEnabled = writeEnabled === true;
        this.clock = clock;
        this.initialize();
    }

    initialize() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS projected_plan_store_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS projected_plan_identities (
                source_type TEXT NOT NULL,
                legacy_ref TEXT NOT NULL,
                plan_id TEXT NOT NULL,
                identity_status TEXT NOT NULL CHECK (identity_status IN ('stable', 'provisional')),
                state TEXT NOT NULL CHECK (state IN ('active', 'superseded')),
                superseded_by_ref TEXT,
                revision INTEGER NOT NULL CHECK (revision >= 1),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (source_type, legacy_ref)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS projected_plan_one_active_identity
                ON projected_plan_identities (source_type, plan_id)
                WHERE state = 'active';
            CREATE TABLE IF NOT EXISTS projected_plans (
                plan_id TEXT PRIMARY KEY,
                version INTEGER NOT NULL CHECK (version >= 1),
                payload_json TEXT NOT NULL,
                payload_checksum TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS projected_plan_versions (
                plan_id TEXT NOT NULL,
                version INTEGER NOT NULL CHECK (version >= 1),
                payload_json TEXT NOT NULL,
                payload_checksum TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (plan_id, version)
            );
            CREATE TABLE IF NOT EXISTS projected_plan_movements (
                movement_id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                operation_key TEXT NOT NULL UNIQUE,
                payload_json TEXT NOT NULL,
                payload_checksum TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS projected_plan_snapshots (
                snapshot_checksum TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS projected_plan_projection_state (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                snapshot_checksum TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (snapshot_checksum) REFERENCES projected_plan_snapshots(snapshot_checksum)
            );
        `);
        this.db.prepare(`
            INSERT INTO projected_plan_store_metadata (key, value)
            VALUES ('schema_version', ?)
            ON CONFLICT(key) DO NOTHING
        `).run(String(PROJECTED_PLANS_STORE_SCHEMA_VERSION));
        const version = Number(this.db.prepare("SELECT value FROM projected_plan_store_metadata WHERE key = 'schema_version'").pluck().get());
        if (version !== PROJECTED_PLANS_STORE_SCHEMA_VERSION) throw new Error(`unsupported_projected_plans_store_schema:${version}`);
        return version;
    }

    assertWriteEnabled() {
        if (!this.writeEnabled) throw new Error('projected_plans_store_writes_disabled');
    }

    listTables() {
        return this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'projected_plan_%' ORDER BY name").pluck().all();
    }

    resolveLegacyIdentity({ sourceType, legacyRef }) {
        const row = this.db.prepare(`
            SELECT source_type, legacy_ref, plan_id, identity_status, state, superseded_by_ref, revision
            FROM projected_plan_identities
            WHERE source_type = ? AND legacy_ref = ?
        `).get(String(sourceType || '').trim(), String(legacyRef || '').trim());
        return row || null;
    }

    countIdentityBindings({ state = '' } = {}) {
        if (state && !['active', 'superseded'].includes(state)) throw new Error('invalid_projected_plan_identity_state');
        return Number(state
            ? this.db.prepare('SELECT COUNT(*) FROM projected_plan_identities WHERE state = ?').pluck().get(state)
            : this.db.prepare('SELECT COUNT(*) FROM projected_plan_identities').pluck().get());
    }

    bindLegacyIdentity({ sourceType, legacyRef, planId, identityStatus = 'stable' }) {
        this.assertWriteEnabled();
        return this.db.transaction(() => this.bindLegacyIdentityInternal({ sourceType, legacyRef, planId, identityStatus }))();
    }

    bindLegacyIdentityInternal({ sourceType, legacyRef, planId, identityStatus = 'stable' }) {
        const source = String(sourceType || '').trim();
        const ref = String(legacyRef || '').trim();
        const id = String(planId || '').trim();
        if (!source || !ref || !id) throw new Error('projected_plan_identity_fields_required');
        if (!['stable', 'provisional'].includes(identityStatus)) throw new Error('invalid_projected_plan_identity_status');
        const exact = this.resolveLegacyIdentity({ sourceType: source, legacyRef: ref });
        if (exact) {
            if (exact.plan_id !== id || exact.state !== 'active') throw new Error('projected_plan_identity_conflict');
            if (exact.identity_status !== identityStatus) throw new Error('projected_plan_identity_status_conflict');
            return { ...exact, replayed: true };
        }
        const active = this.db.prepare(`
            SELECT legacy_ref FROM projected_plan_identities
            WHERE source_type = ? AND plan_id = ? AND state = 'active'
        `).get(source, id);
        if (active) throw new Error('projected_plan_identity_rebind_required');
        const at = nowIso(this.clock);
        this.db.prepare(`
            INSERT INTO projected_plan_identities
                (source_type, legacy_ref, plan_id, identity_status, state, superseded_by_ref, revision, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', NULL, 1, ?, ?)
        `).run(source, ref, id, identityStatus, at, at);
        return { source_type: source, legacy_ref: ref, plan_id: id, identity_status: identityStatus, state: 'active', superseded_by_ref: null, revision: 1, replayed: false };
    }

    rebindLegacyIdentity({ sourceType, fromLegacyRef, toLegacyRef, planId }) {
        this.assertWriteEnabled();
        return this.db.transaction(() => {
            const source = String(sourceType || '').trim();
            const fromRef = String(fromLegacyRef || '').trim();
            const toRef = String(toLegacyRef || '').trim();
            const id = String(planId || '').trim();
            if (!source || !fromRef || !toRef || !id) throw new Error('projected_plan_rebind_fields_required');
            const from = this.resolveLegacyIdentity({ sourceType: source, legacyRef: fromRef });
            const to = this.resolveLegacyIdentity({ sourceType: source, legacyRef: toRef });
            if (from?.state === 'superseded' && from.plan_id === id && from.superseded_by_ref === toRef && to?.state === 'active' && to.plan_id === id) {
                return { ...to, replayed: true };
            }
            if (!from || from.state !== 'active' || from.plan_id !== id) throw new Error('projected_plan_rebind_source_mismatch');
            if (to && (to.plan_id !== id || to.state !== 'active')) throw new Error('projected_plan_rebind_target_conflict');
            const at = nowIso(this.clock);
            this.db.prepare(`
                UPDATE projected_plan_identities
                SET state = 'superseded', superseded_by_ref = ?, revision = revision + 1, updated_at = ?
                WHERE source_type = ? AND legacy_ref = ?
            `).run(toRef, at, source, fromRef);
            if (!to) {
                this.db.prepare(`
                    INSERT INTO projected_plan_identities
                        (source_type, legacy_ref, plan_id, identity_status, state, superseded_by_ref, revision, created_at, updated_at)
                    VALUES (?, ?, ?, 'stable', 'active', NULL, ?, ?, ?)
                `).run(source, toRef, id, from.revision + 1, at, at);
            }
            return { ...this.resolveLegacyIdentity({ sourceType: source, legacyRef: toRef }), replayed: false };
        })();
    }

    persistProjection(projection) {
        this.assertWriteEnabled();
        assertProjectedPlans(projection);
        const snapshotPayload = stableStringify(projection);
        const snapshotChecksum = checksum(projection);
        return this.db.transaction(() => {
            const current = this.db.prepare('SELECT snapshot_checksum FROM projected_plan_projection_state WHERE singleton = 1').get();
            if (current?.snapshot_checksum === snapshotChecksum) {
                return { snapshot_checksum: snapshotChecksum, replayed: true, plans_written: 0, movements_written: 0 };
            }
            let plansWritten = 0;
            let movementsWritten = 0;
            for (const plan of projection.plans) plansWritten += this.persistPlanInternal(plan);
            for (const movement of projection.plan_movements) movementsWritten += this.persistMovementInternal(movement);
            const at = nowIso(this.clock);
            this.db.prepare(`
                INSERT INTO projected_plan_snapshots (snapshot_checksum, payload_json, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(snapshot_checksum) DO NOTHING
            `).run(snapshotChecksum, snapshotPayload, at);
            this.db.prepare(`
                INSERT INTO projected_plan_projection_state (singleton, snapshot_checksum, updated_at)
                VALUES (1, ?, ?)
                ON CONFLICT(singleton) DO UPDATE SET snapshot_checksum = excluded.snapshot_checksum, updated_at = excluded.updated_at
            `).run(snapshotChecksum, at);
            return { snapshot_checksum: snapshotChecksum, replayed: false, plans_written: plansWritten, movements_written: movementsWritten };
        })();
    }

    persistPlanInternal(plan) {
        const payload = stableStringify(plan);
        const digest = checksum(plan);
        const versionRow = this.db.prepare('SELECT payload_checksum FROM projected_plan_versions WHERE plan_id = ? AND version = ?').get(plan.plan_id, plan.version);
        if (versionRow) {
            if (versionRow.payload_checksum !== digest) throw new Error('projected_plan_version_conflict');
            return 0;
        }
        const current = this.db.prepare('SELECT version FROM projected_plans WHERE plan_id = ?').get(plan.plan_id);
        if (current && plan.version !== current.version + 1) throw new Error(plan.version <= current.version ? 'stale_projected_plan_version' : 'projected_plan_version_gap');
        if (!current && plan.version !== 1) throw new Error('projected_plan_initial_version_must_be_one');
        this.bindLegacyIdentityInternal({
            sourceType: plan.source?.type,
            legacyRef: plan.source?.legacy_ref,
            planId: plan.plan_id,
            identityStatus: plan.source?.identity_status
        });
        const at = nowIso(this.clock);
        this.db.prepare(`
            INSERT INTO projected_plan_versions (plan_id, version, payload_json, payload_checksum, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(plan.plan_id, plan.version, payload, digest, at);
        this.db.prepare(`
            INSERT INTO projected_plans (plan_id, version, payload_json, payload_checksum, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(plan_id) DO UPDATE SET
                version = excluded.version,
                payload_json = excluded.payload_json,
                payload_checksum = excluded.payload_checksum,
                updated_at = excluded.updated_at
        `).run(plan.plan_id, plan.version, payload, digest, at);
        return 1;
    }

    persistMovementInternal(movement) {
        const payload = stableStringify(movement);
        const digest = checksum(movement);
        const byId = this.db.prepare('SELECT movement_id, operation_key, payload_checksum FROM projected_plan_movements WHERE movement_id = ?').get(movement.movement_id);
        const byOperation = this.db.prepare('SELECT movement_id, operation_key, payload_checksum FROM projected_plan_movements WHERE operation_key = ?').get(movement.operation_key);
        if (byId || byOperation) {
            if (byId?.movement_id === movement.movement_id && byOperation?.movement_id === movement.movement_id && byId.payload_checksum === digest) return 0;
            throw new Error('projected_plan_movement_idempotency_conflict');
        }
        const at = nowIso(this.clock);
        this.db.prepare(`
            INSERT INTO projected_plan_movements
                (movement_id, plan_id, operation_key, payload_json, payload_checksum, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(movement.movement_id, movement.plan_id, movement.operation_key, payload, digest, at);
        return 1;
    }

    readProjection() {
        const row = this.db.prepare(`
            SELECT snapshots.payload_json
            FROM projected_plan_projection_state state
            JOIN projected_plan_snapshots snapshots ON snapshots.snapshot_checksum = state.snapshot_checksum
            WHERE state.singleton = 1
        `).get();
        return row ? parseJson(row.payload_json) : null;
    }

    listPlanVersions(planId) {
        return this.db.prepare(`
            SELECT payload_json FROM projected_plan_versions WHERE plan_id = ? ORDER BY version
        `).all(planId).map(row => parseJson(row.payload_json));
    }

    getReadiness() {
        const totalPlans = Number(this.db.prepare('SELECT COUNT(*) FROM projected_plans').pluck().get());
        const provisional = Number(this.db.prepare("SELECT COUNT(*) FROM projected_plan_identities WHERE state = 'active' AND identity_status = 'provisional'").pluck().get());
        const orphaned = Number(this.db.prepare(`
            SELECT COUNT(*) FROM projected_plans plans
            WHERE NOT EXISTS (
                SELECT 1 FROM projected_plan_identities identities
                WHERE identities.plan_id = plans.plan_id AND identities.state = 'active'
            )
        `).pluck().get());
        const projection = this.readProjection();
        const issueCount = Array.isArray(projection?.issues) ? projection.issues.length : 0;
        return {
            total_plan_count: totalPlans,
            provisional_identity_count: provisional,
            orphaned_plan_count: orphaned,
            projection_issue_count: issueCount,
            cutover_ready: totalPlans > 0 && provisional === 0 && orphaned === 0 && issueCount === 0
        };
    }

    createBackup({ createdAt = nowIso(this.clock) } = {}) {
        const payload = {
            schema_version: PROJECTED_PLANS_STORE_SCHEMA_VERSION,
            current_projection: this.readProjection(),
            identities: this.db.prepare('SELECT * FROM projected_plan_identities ORDER BY source_type, legacy_ref').all(),
            plans: this.db.prepare('SELECT * FROM projected_plans ORDER BY plan_id').all(),
            versions: this.db.prepare('SELECT * FROM projected_plan_versions ORDER BY plan_id, version').all(),
            movements: this.db.prepare('SELECT * FROM projected_plan_movements ORDER BY movement_id').all()
        };
        return {
            backup_version: PROJECTED_PLANS_STORE_BACKUP_VERSION,
            created_at: String(createdAt),
            checksum: checksum(payload),
            payload: clone(payload)
        };
    }

    restoreBackup(backup) {
        this.assertWriteEnabled();
        if (backup?.backup_version !== PROJECTED_PLANS_STORE_BACKUP_VERSION || !backup.payload) throw new Error('invalid_projected_plans_store_backup');
        if (checksum(backup.payload) !== backup.checksum) throw new Error('projected_plans_store_backup_checksum_mismatch');
        if (backup.payload.schema_version !== PROJECTED_PLANS_STORE_SCHEMA_VERSION) throw new Error('unsupported_projected_plans_store_backup_schema');
        if (backup.payload.current_projection) assertProjectedPlans(backup.payload.current_projection);
        return this.db.transaction(() => {
            for (const table of ['projected_plan_projection_state', 'projected_plan_snapshots', 'projected_plan_movements', 'projected_plans', 'projected_plan_versions', 'projected_plan_identities']) {
                this.db.prepare(`DELETE FROM ${table}`).run();
            }
            for (const row of backup.payload.identities || []) {
                this.db.prepare(`
                    INSERT INTO projected_plan_identities
                    (source_type, legacy_ref, plan_id, identity_status, state, superseded_by_ref, revision, created_at, updated_at)
                    VALUES (@source_type, @legacy_ref, @plan_id, @identity_status, @state, @superseded_by_ref, @revision, @created_at, @updated_at)
                `).run(row);
            }
            for (const row of backup.payload.versions || []) {
                this.db.prepare(`
                    INSERT INTO projected_plan_versions (plan_id, version, payload_json, payload_checksum, created_at)
                    VALUES (@plan_id, @version, @payload_json, @payload_checksum, @created_at)
                `).run(row);
            }
            for (const row of backup.payload.plans || []) {
                this.db.prepare(`
                    INSERT INTO projected_plans (plan_id, version, payload_json, payload_checksum, updated_at)
                    VALUES (@plan_id, @version, @payload_json, @payload_checksum, @updated_at)
                `).run(row);
            }
            for (const row of backup.payload.movements || []) {
                this.db.prepare(`
                    INSERT INTO projected_plan_movements (movement_id, plan_id, operation_key, payload_json, payload_checksum, created_at)
                    VALUES (@movement_id, @plan_id, @operation_key, @payload_json, @payload_checksum, @created_at)
                `).run(row);
            }
            if (backup.payload.current_projection) {
                const projectionPayload = stableStringify(backup.payload.current_projection);
                const projectionChecksum = checksum(backup.payload.current_projection);
                const at = String(backup.created_at || nowIso(this.clock));
                this.db.prepare('INSERT INTO projected_plan_snapshots (snapshot_checksum, payload_json, created_at) VALUES (?, ?, ?)').run(projectionChecksum, projectionPayload, at);
                this.db.prepare('INSERT INTO projected_plan_projection_state (singleton, snapshot_checksum, updated_at) VALUES (1, ?, ?)').run(projectionChecksum, at);
            }
            return { restored: true, plan_count: (backup.payload.plans || []).length, movement_count: (backup.payload.movements || []).length };
        })();
    }

    close() {
        this.db.close();
    }
}

module.exports = {
    ProjectedPlansStore,
    PROJECTED_PLANS_STORE_SCHEMA_VERSION,
    PROJECTED_PLANS_STORE_BACKUP_VERSION
};
