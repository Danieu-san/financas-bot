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

            for (const account of projected.accounts || []) this.insertAccount(runId, account);
            for (const event of projected.events || []) this.insertEvent(runId, event);
            for (const invoice of projected.invoices || []) this.insertInvoice(runId, invoice);
            for (const item of projected.invoiceItems || []) this.insertInvoiceItem(runId, item);
            for (const payment of projected.invoicePayments || []) this.insertInvoicePayment(runId, payment);
            for (const rule of projected.recurrenceRules || []) this.insertRecurrenceRule(runId, rule);
            for (const occurrence of projected.recurrenceOccurrences || []) this.insertRecurrenceOccurrence(runId, occurrence);
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
            'canonical_ledger_accounts',
            'canonical_ledger_reconciliation_links',
            'canonical_ledger_recurrence_occurrences',
            'canonical_ledger_recurrence_rules',
            'canonical_ledger_schedules',
            'canonical_ledger_invoice_payments',
            'canonical_ledger_invoice_items',
            'canonical_ledger_invoices',
            'canonical_ledger_event_lines',
            'canonical_ledger_events',
            'canonical_ledger_projection_runs'
        ]) {
            this.db.prepare(`DELETE FROM ${table} WHERE run_id = ?`).run(runId);
        }
    }

    insertAccount(runId, account) {
        if (!account || !Object.prototype.hasOwnProperty.call(account, 'opening_balance_cents')) {
            throw new Error('canonical ledger account requires explicit opening_balance_cents');
        }
        const openingBalanceCents = Number(account.opening_balance_cents);
        if (!Number.isInteger(openingBalanceCents)) {
            throw new Error('canonical ledger account opening_balance_cents must be an integer');
        }

        this.db.prepare(`
            INSERT INTO canonical_ledger_accounts (
                run_id, account_id, household_id, owner_person_id, account_type,
                name, currency, opening_balance_cents, opened_on, status,
                account_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            runId,
            account.account_id,
            account.household_id || null,
            account.owner_person_id || null,
            account.account_type || account.type || 'bank',
            account.name,
            account.currency || 'BRL',
            openingBalanceCents,
            account.opened_on || null,
            account.status || 'active',
            JSON.stringify(account)
        );
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

    insertInvoice(runId, invoice) {
        this.db.prepare(`
            INSERT INTO canonical_ledger_invoices (
                run_id, invoice_id, household_id, owner_person_id, card_key,
                card_name, competence_month, due_on, currency, invoice_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            runId,
            invoice.invoice_id,
            invoice.household_id || null,
            invoice.owner_person_id || null,
            invoice.card_key,
            invoice.card_name || null,
            invoice.competence_month,
            invoice.due_on || null,
            invoice.currency || 'BRL',
            JSON.stringify(invoice)
        );
    }

    insertInvoiceItem(runId, item) {
        this.db.prepare(`
            INSERT INTO canonical_ledger_invoice_items (
                run_id, invoice_item_id, invoice_id, event_id, amount_cents,
                currency, item_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            runId,
            item.invoice_item_id,
            item.invoice_id,
            item.event_id,
            item.amount_cents,
            item.currency || 'BRL',
            JSON.stringify(item)
        );
    }

    insertInvoicePayment(runId, payment) {
        this.db.prepare(`
            INSERT INTO canonical_ledger_invoice_payments (
                run_id, invoice_payment_id, invoice_id, event_id, amount_cents,
                currency, payment_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            runId,
            payment.invoice_payment_id,
            payment.invoice_id,
            payment.event_id,
            payment.amount_cents,
            payment.currency || 'BRL',
            JSON.stringify(payment)
        );
    }

    insertRecurrenceRule(runId, rule) {
        this.db.prepare(`
            INSERT INTO canonical_ledger_recurrence_rules (
                run_id, recurrence_rule_id, household_id, owner_person_id,
                source_type, source_row_ref, rule_type, status, description,
                frequency, start_on, end_on, due_day, amount_cents, currency,
                category, subcategory, rule_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            runId,
            rule.recurrence_rule_id,
            rule.household_id || null,
            rule.owner_person_id || null,
            rule.source_type,
            rule.source_row_ref || null,
            rule.rule_type,
            rule.status,
            rule.description || null,
            rule.frequency,
            rule.start_on || null,
            rule.end_on || null,
            rule.due_day || null,
            rule.amount_cents,
            rule.currency || 'BRL',
            rule.category || null,
            rule.subcategory || null,
            JSON.stringify(rule)
        );
    }

    insertRecurrenceOccurrence(runId, occurrence) {
        this.db.prepare(`
            INSERT INTO canonical_ledger_recurrence_occurrences (
                run_id, recurrence_occurrence_id, recurrence_rule_id,
                occurrence_event_id, settled_event_id, source_type, source_row_ref,
                competence_month, due_on, status, amount_cents, currency,
                description, category, subcategory, occurrence_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            runId,
            occurrence.recurrence_occurrence_id,
            occurrence.recurrence_rule_id,
            occurrence.occurrence_event_id || null,
            occurrence.settled_event_id || null,
            occurrence.source_type,
            occurrence.source_row_ref || null,
            occurrence.competence_month,
            occurrence.due_on || null,
            occurrence.status,
            occurrence.amount_cents,
            occurrence.currency || 'BRL',
            occurrence.description || null,
            occurrence.category || null,
            occurrence.subcategory || null,
            JSON.stringify(occurrence)
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
            recurrenceRules: count('canonical_ledger_recurrence_rules'),
            recurrenceOccurrences: count('canonical_ledger_recurrence_occurrences'),
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

    listInvoiceAggregates({ reportType = '' } = {}) {
        return this.db.prepare(`
            WITH ranked_invoices AS (
                SELECT i.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY i.invoice_id
                        ORDER BY r.created_at DESC, i.run_id DESC
                    ) AS row_rank
                FROM canonical_ledger_invoices i
                JOIN canonical_ledger_projection_runs r ON r.run_id = i.run_id
                WHERE (? = '' OR r.report_type = ?)
            ),
            ranked_items AS (
                SELECT i.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY i.invoice_item_id
                        ORDER BY r.created_at DESC, i.run_id DESC
                    ) AS row_rank
                FROM canonical_ledger_invoice_items i
                JOIN canonical_ledger_projection_runs r ON r.run_id = i.run_id
                WHERE (? = '' OR r.report_type = ?)
            ),
            ranked_payments AS (
                SELECT p.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY p.invoice_payment_id
                        ORDER BY r.created_at DESC, p.run_id DESC
                    ) AS row_rank
                FROM canonical_ledger_invoice_payments p
                JOIN canonical_ledger_projection_runs r ON r.run_id = p.run_id
                WHERE (? = '' OR r.report_type = ?)
            ),
            item_totals AS (
                SELECT invoice_id, SUM(amount_cents) AS total_cents, COUNT(*) AS item_count
                FROM ranked_items
                WHERE row_rank = 1
                GROUP BY invoice_id
            ),
            payment_totals AS (
                SELECT invoice_id, SUM(amount_cents) AS total_cents, COUNT(*) AS payment_count
                FROM ranked_payments
                WHERE row_rank = 1
                GROUP BY invoice_id
            )
            SELECT i.invoice_id, i.household_id, i.owner_person_id, i.card_key,
                i.card_name, i.competence_month, i.due_on, i.currency,
                COALESCE(items.total_cents, 0) AS item_total_cents,
                COALESCE(payments.total_cents, 0) AS payment_total_cents,
                COALESCE(items.item_count, 0) AS item_count,
                COALESCE(payments.payment_count, 0) AS payment_count,
                CASE
                    WHEN COALESCE(items.total_cents, 0) > 0
                        AND COALESCE(payments.total_cents, 0) >= items.total_cents THEN 'paid'
                    WHEN COALESCE(items.total_cents, 0) > 0
                        AND COALESCE(payments.total_cents, 0) > 0 THEN 'partially_paid'
                    WHEN COALESCE(items.total_cents, 0) > 0 THEN 'open'
                    WHEN COALESCE(payments.total_cents, 0) > 0 THEN 'payment_observed'
                    ELSE 'empty'
                END AS status
            FROM ranked_invoices i
            LEFT JOIN item_totals items ON items.invoice_id = i.invoice_id
            LEFT JOIN payment_totals payments ON payments.invoice_id = i.invoice_id
            WHERE i.row_rank = 1
            ORDER BY i.competence_month, i.card_key, i.invoice_id
        `).all(reportType, reportType, reportType, reportType, reportType, reportType);
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
