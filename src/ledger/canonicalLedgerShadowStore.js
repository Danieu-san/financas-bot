const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data', 'canonical_ledger_shadow.sqlite');

function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function sha256(value, length = 32) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function migrationFiles(migrationsDir) {
    if (!fs.existsSync(migrationsDir)) return [];
    return fs.readdirSync(migrationsDir)
        .map(name => {
            const match = name.match(/^(\d+)_.*\.sql$/);
            if (!match) return null;
            return {
                version: Number(match[1]),
                name,
                filePath: path.join(migrationsDir, name)
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.version - b.version);
}

function quoteSqlitePath(filePath) {
    return `'${String(filePath).replace(/'/g, "''")}'`;
}

class CanonicalLedgerShadowStore {
    constructor({
        dbPath = DEFAULT_DB_PATH,
        migrationsDir = DEFAULT_MIGRATIONS_DIR,
        writesEnabled = false
    } = {}) {
        this.dbPath = dbPath;
        this.migrationsDir = migrationsDir;
        this.writesEnabled = writesEnabled;
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        this.db = new Database(dbPath);
        this.db.pragma('foreign_keys = ON');
    }

    applyMigrations() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS canonical_ledger_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                checksum TEXT NOT NULL,
                applied_at TEXT NOT NULL
            )
        `);

        for (const migration of migrationFiles(this.migrationsDir)) {
            const sql = fs.readFileSync(migration.filePath, 'utf8');
            const checksum = sha256(sql, 64);
            const existing = this.db.prepare('SELECT checksum FROM canonical_ledger_migrations WHERE version = ?').get(migration.version);
            if (existing) {
                if (existing.checksum !== checksum) {
                    throw new Error(`canonical ledger migration checksum changed: ${migration.name}`);
                }
                continue;
            }
            const runMigration = this.db.transaction(() => {
                this.db.exec(sql);
                this.db.prepare(`
                    INSERT INTO canonical_ledger_migrations (version, name, checksum, applied_at)
                    VALUES (?, ?, ?, ?)
                `).run(migration.version, migration.name, checksum, new Date().toISOString());
            });
            runMigration();
        }

        return this.db.prepare(`
            SELECT version, name, checksum, applied_at
            FROM canonical_ledger_migrations
            ORDER BY version
        `).all();
    }

    listTables() {
        return this.db.prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `).all().map(row => row.name);
    }

    persistProjection({ runId, projected = {}, publicProjection = [], report = {} } = {}) {
        if (!this.writesEnabled) {
            throw new Error('Canonical ledger shadow writes are disabled by default.');
        }
        if (!runId) throw new Error('runId is required to persist canonical ledger shadow projection.');
        this.applyMigrations();

        const now = new Date().toISOString();
        const write = this.db.transaction(() => {
            this.deleteRun(runId);
            this.db.prepare(`
                INSERT INTO canonical_ledger_projection_runs (
                    run_id, report_type, schema_version, synthetic_fixture_only, report_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                runId,
                report.report_type || 'canonical_ledger_dry_run',
                report.schema_version || 'canonical-ledger-v1',
                report.synthetic_fixture_only === false ? 0 : 1,
                JSON.stringify(report),
                now
            );

            for (const event of projected.events || []) this.insertEvent(runId, event);
            for (const line of projected.lines || []) this.insertLine(runId, line);
            for (const schedule of projected.schedules || []) this.insertSchedule(runId, schedule);
            for (const link of projected.reconciliationLinks || []) this.insertReconciliationLink(runId, link);
            publicProjection.forEach((row, index) => this.insertPublicProjectionRow(runId, index, row));

            this.db.prepare(`
                INSERT INTO canonical_ledger_audit_log (audit_id, run_id, action, detail_json, created_at)
                VALUES (?, ?, 'projection_persisted', ?, ?)
            `).run(
                `audit_${sha256(stableStringify({ runId, now }), 24)}`,
                runId,
                JSON.stringify({
                    event_count: (projected.events || []).length,
                    public_projection_rows: publicProjection.length
                }),
                now
            );
        });
        write();
        return {
            runId,
            ...this.countRows(runId)
        };
    }

    deleteRun(runId) {
        for (const table of [
            'canonical_ledger_audit_log',
            'canonical_ledger_public_projection',
            'canonical_ledger_reconciliation_links',
            'canonical_ledger_schedules',
            'canonical_ledger_event_lines',
            'canonical_ledger_events',
            'canonical_ledger_projection_runs'
        ]) {
            this.db.prepare(`DELETE FROM ${table} WHERE run_id = ?`).run(runId);
        }
    }

    insertEvent(runId, event) {
        this.db.prepare(`
            INSERT INTO canonical_ledger_events (
                run_id, event_id, household_id, owner_person_id, actor_person_id, kind,
                status, description, amount_cents, currency, occurred_on, effective_on,
                competence_month, due_on, category, subcategory, category_status,
                free_budget_eligible, net_income_expense_impact, source_type,
                source_row_ref, source_id_hash, source_row_hash, idempotency_key,
                event_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            runId,
            event.event_id,
            event.household_id || null,
            event.owner_person_id || null,
            event.actor_person_id || null,
            event.kind,
            event.status,
            event.description || null,
            event.amount_cents || 0,
            event.currency || 'BRL',
            event.occurred_on || null,
            event.effective_on || null,
            event.competence_month || null,
            event.due_on || null,
            event.category || null,
            event.subcategory || null,
            event.category_status || null,
            event.free_budget_eligible ? 1 : 0,
            event.net_income_expense_impact || 0,
            event.source_type,
            event.source_row_ref || null,
            event.source_id_hash,
            event.source_row_hash,
            event.idempotency_key,
            JSON.stringify(event),
            event.created_at || new Date().toISOString(),
            event.updated_at || new Date().toISOString()
        );
    }

    insertLine(runId, line) {
        this.db.prepare(`
            INSERT INTO canonical_ledger_event_lines (
                run_id, line_id, event_id, line_type, account_id, category_id,
                related_event_id, direction, amount_cents, currency, metadata_hash, line_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            runId,
            line.line_id,
            line.event_id,
            line.line_type,
            line.account_id || null,
            line.category_id || null,
            line.related_event_id || null,
            line.direction,
            line.amount_cents || 0,
            line.currency || 'BRL',
            line.metadata_hash,
            JSON.stringify(line)
        );
    }

    insertSchedule(runId, schedule) {
        this.db.prepare(`
            INSERT INTO canonical_ledger_schedules (
                run_id, schedule_id, household_id, owner_person_id, schedule_type,
                status, start_on, end_on, frequency, amount_cents, currency,
                next_due_on, source_id_hash, schedule_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            runId,
            schedule.schedule_id,
            schedule.household_id || null,
            schedule.owner_person_id || null,
            schedule.schedule_type,
            schedule.status,
            schedule.start_on || null,
            schedule.end_on || null,
            schedule.frequency || null,
            schedule.amount_cents || 0,
            schedule.currency || 'BRL',
            schedule.next_due_on || null,
            schedule.source_id_hash || null,
            JSON.stringify(schedule)
        );
    }

    insertReconciliationLink(runId, link) {
        this.db.prepare(`
            INSERT INTO canonical_ledger_reconciliation_links (
                run_id, link_id, event_id, link_type, related_event_id,
                external_hash, confidence, status, created_at, link_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            runId,
            link.link_id,
            link.event_id,
            link.link_type,
            link.related_event_id || null,
            link.external_hash,
            link.confidence,
            link.status,
            link.created_at || new Date().toISOString(),
            JSON.stringify(link)
        );
    }

    insertPublicProjectionRow(runId, index, row) {
        this.db.prepare(`
            INSERT INTO canonical_ledger_public_projection (
                run_id, row_index, date, effective_on, competence_month, due_on, kind,
                status, description, amount_cents, currency, category, subcategory,
                category_status, responsible, source, free_budget_eligible, row_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            runId,
            index,
            row.date || null,
            row.effective_on || null,
            row.competence_month || null,
            row.due_on || null,
            row.kind,
            row.status,
            row.description || null,
            row.amount_cents || 0,
            row.currency || 'BRL',
            row.category || null,
            row.subcategory || null,
            row.category_status || null,
            row.responsible || null,
            row.source || null,
            row.free_budget_eligible ? 1 : 0,
            JSON.stringify(row)
        );
    }

    countRows(runId) {
        const count = table => this.db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE run_id = ?`).get(runId).count;
        return {
            events: count('canonical_ledger_events'),
            lines: count('canonical_ledger_event_lines'),
            schedules: count('canonical_ledger_schedules'),
            reconciliationLinks: count('canonical_ledger_reconciliation_links'),
            publicProjectionRows: count('canonical_ledger_public_projection'),
            projectionRuns: count('canonical_ledger_projection_runs'),
            auditRows: count('canonical_ledger_audit_log')
        };
    }

    listPublicProjection(runId) {
        return this.db.prepare(`
            SELECT date, effective_on, competence_month, due_on, kind, status,
                description, amount_cents, currency, category, subcategory,
                category_status, responsible, source, free_budget_eligible
            FROM canonical_ledger_public_projection
            WHERE run_id = ?
            ORDER BY row_index
        `).all(runId);
    }

    backupTo(backupPath) {
        fs.mkdirSync(path.dirname(backupPath), { recursive: true });
        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
        this.db.exec(`VACUUM INTO ${quoteSqlitePath(backupPath)}`);
        return backupPath;
    }

    close() {
        this.db.close();
    }

    static restoreFromBackup({ backupPath, dbPath }) {
        if (!backupPath || !fs.existsSync(backupPath)) {
            throw new Error('Canonical ledger shadow backup file not found.');
        }
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        fs.copyFileSync(backupPath, dbPath);
        return dbPath;
    }
}

module.exports = {
    CanonicalLedgerShadowStore,
    DEFAULT_DB_PATH,
    DEFAULT_MIGRATIONS_DIR,
    __test__: {
        migrationFiles,
        sha256,
        stableStringify
    }
};
