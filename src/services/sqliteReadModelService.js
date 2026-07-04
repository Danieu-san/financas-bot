const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { normalizeText, parseValue, parseSheetDate } = require('../utils/helpers');
const { matchesAnyField } = require('../utils/textMatcher');
const { normalizeCycleStartDay, getBudgetCycleForDate, getBudgetCycleForPeriod } = require('../utils/budgetCycle');

let Database = null;
try {
    // Dependencia opcional: caso não exista, o sistema cai para fallback em memória.
    // eslint-disable-next-line global-require
    Database = require('better-sqlite3');
} catch (error) {
    Database = null;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SQLITE_FILE = path.join(DATA_DIR, 'read_model.sqlite');
const MONTH_NAMES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

let db = null;
let sqliteReady = false;
let currentSyncId = 0;
const ALL_USERS_ID = '__ALL_USERS__';

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function makeFingerprint(parts) {
    const payload = JSON.stringify(parts);
    return crypto.createHash('sha1').update(payload).digest('hex');
}

function snapshotRowValue(item = {}, aliases = [], fallbackIndex = -1) {
    const row = Array.isArray(item.row) ? item.row : [];
    const headers = Array.isArray(item.headers) ? item.headers : [];
    if (headers.length > 0) {
        const normalizedAliases = aliases.map(alias => normalizeText(alias));
        const index = headers.findIndex(header => normalizedAliases.includes(normalizeText(header)));
        return index >= 0 ? row[index] : '';
    }
    return fallbackIndex >= 0 ? row[fallbackIndex] : '';
}

function initSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS expenses (
            fingerprint TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_name TEXT,
            date_text TEXT,
            year INTEGER,
            month INTEGER,
            description TEXT,
            category TEXT,
            subcategory TEXT,
            value REAL NOT NULL,
            card_id TEXT,
            card_name TEXT,
            installment_text TEXT,
            last_seen_sync INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_expenses_user_period ON expenses(user_id, year, month);
        CREATE INDEX IF NOT EXISTS idx_expenses_user_category ON expenses(user_id, category);

        CREATE TABLE IF NOT EXISTS entries (
            fingerprint TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            date_text TEXT,
            year INTEGER,
            month INTEGER,
            description TEXT,
            category TEXT,
            value REAL NOT NULL,
            payment_method TEXT,
            recurrence TEXT,
            last_seen_sync INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_entries_user_period ON entries(user_id, year, month);

        CREATE TABLE IF NOT EXISTS transfers (
            fingerprint TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            date_text TEXT,
            year INTEGER,
            month INTEGER,
            description TEXT,
            value REAL NOT NULL,
            origin TEXT,
            destination TEXT,
            method TEXT,
            notes TEXT,
            status TEXT,
            last_seen_sync INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_transfers_user_period ON transfers(user_id, year, month);
        CREATE INDEX IF NOT EXISTS idx_transfers_user_status ON transfers(user_id, status);

        CREATE TABLE IF NOT EXISTS budget_settings (
            user_id TEXT PRIMARY KEY,
            monthly_budget_enabled TEXT,
            monthly_budget_amount REAL,
            monthly_budget_scope TEXT,
            monthly_budget_cycle_start_day INTEGER,
            last_seen_sync INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS card_configs (
            fingerprint TEXT PRIMARY KEY,
            card_id TEXT,
            name TEXT,
            due_day INTEGER,
            active TEXT,
            last_seen_sync INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS goals (
            fingerprint TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT,
            target REAL,
            current REAL,
            progress_pct REAL,
            status TEXT,
            priority TEXT,
            scope TEXT,
            last_movement TEXT,
            last_seen_sync INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);

        CREATE TABLE IF NOT EXISTS goal_movements (
            fingerprint TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            goal_user_id TEXT,
            date_text TEXT,
            goal_name TEXT,
            movement_type TEXT,
            value REAL,
            value_before REAL,
            value_after REAL,
            notes TEXT,
            responsible TEXT,
            last_seen_sync INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_goal_movements_owner_goal ON goal_movements(goal_user_id, goal_name);

        CREATE TABLE IF NOT EXISTS debts (
            fingerprint TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT,
            creditor TEXT,
            status TEXT,
            saldo_atual REAL,
            juros_pct REAL,
            next_due TEXT,
            last_seen_sync INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id);

        CREATE TABLE IF NOT EXISTS recurring_bills (
            fingerprint TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            account_name TEXT,
            friendly_name TEXT,
            due_day INTEGER,
            notes TEXT,
            category TEXT,
            subcategory TEXT,
            expected_value REAL,
            rule_active TEXT,
            last_seen_sync INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_recurring_bills_user_due ON recurring_bills(user_id, due_day);

        CREATE TABLE IF NOT EXISTS financial_accounts (
            fingerprint TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            account_type TEXT,
            opening_balance REAL NOT NULL,
            opened_on TEXT,
            status TEXT,
            currency TEXT,
            responsible TEXT,
            last_seen_sync INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_financial_accounts_user ON financial_accounts(user_id);

        CREATE TABLE IF NOT EXISTS financial_events_public (
            fingerprint TEXT PRIMARY KEY,
            owner_hash TEXT NOT NULL,
            date_text TEXT,
            iso_date TEXT,
            year INTEGER,
            month INTEGER,
            weekday TEXT,
            event_type TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            category TEXT,
            subcategory TEXT,
            person TEXT,
            payment_method TEXT,
            card TEXT,
            billing_month TEXT,
            due_date TEXT,
            source TEXT,
            last_seen_sync INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_financial_events_owner_date ON financial_events_public(owner_hash, iso_date);
        CREATE INDEX IF NOT EXISTS idx_financial_events_owner_type ON financial_events_public(owner_hash, event_type);

        CREATE TABLE IF NOT EXISTS sync_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);
    ensureExpenseSchemaColumns();
    ensureEntrySchemaColumns();
    ensureTransferSchemaColumns();
    ensureGoalSchemaColumns();
    ensureDebtSchemaColumns();
}

function hashOwnerId(userId) {
    return crypto.createHash('sha256').update(String(userId || '')).digest('hex');
}

function billingMonthLabel(year, month) {
    const monthIndex = Number.parseInt(month, 10);
    const parsedYear = Number.parseInt(year, 10);
    if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11 || !Number.isInteger(parsedYear)) return '';
    return `${MONTH_NAMES_PT[monthIndex]} de ${parsedYear}`;
}

function publicDateParts(dateText, fallbackYear = null, fallbackMonth = null) {
    const parsed = parseSheetDate(String(dateText || '').trim());
    if (!parsed) {
        return {
            iso_date: '',
            year: Number.isInteger(fallbackYear) ? fallbackYear : null,
            month: Number.isInteger(fallbackMonth) ? fallbackMonth : null,
            weekday: ''
        };
    }
    return {
        iso_date: parsed.toISOString().slice(0, 10),
        year: parsed.getFullYear(),
        month: parsed.getMonth(),
        weekday: ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][parsed.getDay()]
    };
}

function rebuildFinancialEventsPublic(syncId) {
    if (!sqliteReady || !db) return;
    const insert = db.prepare(`
        INSERT INTO financial_events_public(
            fingerprint, owner_hash, date_text, iso_date, year, month, weekday,
            event_type, amount, description, category, subcategory, person,
            payment_method, card, billing_month, due_date, source, last_seen_sync
        )
        VALUES(
            @fingerprint, @owner_hash, @date_text, @iso_date, @year, @month, @weekday,
            @event_type, @amount, @description, @category, @subcategory, @person,
            @payment_method, @card, @billing_month, @due_date, @source, @last_seen_sync
        )
    `);

    db.prepare('DELETE FROM financial_events_public').run();

    const addEvent = (event) => {
        if (!event?.user_id) return;
        const dateParts = publicDateParts(event.date_text, event.year, event.month);
        insert.run({
            fingerprint: makeFingerprint([
                'financial_event_public',
                event.event_type,
                event.user_id,
                event.source,
                event.date_text,
                event.description,
                event.amount,
                event.card,
                event.billing_month,
                event.due_date
            ]),
            owner_hash: hashOwnerId(event.user_id),
            date_text: event.date_text || '',
            iso_date: dateParts.iso_date,
            year: dateParts.year,
            month: dateParts.month,
            weekday: dateParts.weekday,
            event_type: event.event_type,
            amount: Number(event.amount || 0),
            description: event.description || '',
            category: event.category || '',
            subcategory: event.subcategory || '',
            person: '',
            payment_method: event.payment_method || '',
            card: event.card || '',
            billing_month: event.billing_month || '',
            due_date: event.due_date || '',
            source: event.source || '',
            last_seen_sync: syncId
        });
    };

    db.prepare(`
        SELECT user_id, source_type, source_name, date_text, year, month, description, category, subcategory, value, card_name, installment_text
        FROM expenses
    `).all().forEach((row) => {
        addEvent({
            user_id: row.user_id,
            date_text: row.date_text,
            year: row.year,
            month: row.month,
            event_type: row.source_type === 'cartao' ? 'card_expense' : 'expense',
            amount: row.value,
            description: row.description,
            category: row.category,
            subcategory: row.subcategory,
            payment_method: row.source_type === 'cartao' ? 'Crédito' : '',
            card: row.card_name || row.source_name || '',
            billing_month: row.source_type === 'cartao' ? billingMonthLabel(row.year, row.month) : '',
            source: row.source_name || row.source_type
        });
    });

    db.prepare(`
        SELECT user_id, date_text, year, month, description, category, value, payment_method, recurrence
        FROM entries
    `).all().forEach((row) => {
        addEvent({
            user_id: row.user_id,
            date_text: row.date_text,
            year: row.year,
            month: row.month,
            event_type: 'income',
            amount: row.value,
            description: row.description,
            category: row.category,
            payment_method: row.payment_method,
            source: 'Entradas'
        });
    });

    db.prepare(`
        SELECT user_id, date_text, year, month, description, value, origin, destination, method, notes, status
        FROM transfers
    `).all().forEach((row) => {
        addEvent({
            user_id: row.user_id,
            date_text: row.date_text,
            year: row.year,
            month: row.month,
            event_type: 'transfer',
            amount: row.value,
            description: row.description,
            category: row.status || 'Transferência',
            subcategory: [row.origin, row.destination].filter(Boolean).join(' -> '),
            payment_method: row.method,
            source: 'Transferências'
        });
    });

    db.prepare(`
        SELECT user_id, name, target, current, status, scope, last_movement
        FROM goals
    `).all().forEach((row) => {
        addEvent({
            user_id: row.user_id,
            event_type: 'goal',
            amount: row.current,
            description: row.name,
            category: row.status || 'Meta',
            subcategory: row.scope || '',
            source: 'Metas'
        });
    });

    db.prepare(`
        SELECT user_id, name, creditor, saldo_atual, next_due, status
        FROM debts
    `).all().forEach((row) => {
        addEvent({
            user_id: row.user_id,
            date_text: row.next_due || '',
            event_type: 'debt',
            amount: row.saldo_atual,
            description: row.name,
            category: row.status || 'Dívida',
            subcategory: row.creditor || '',
            due_date: row.next_due || '',
            source: 'Dívidas'
        });
    });

    db.prepare(`
        SELECT user_id, account_name, friendly_name, due_day, category, subcategory, expected_value, rule_active
        FROM recurring_bills
    `).all().forEach((row) => {
        addEvent({
            user_id: row.user_id,
            event_type: 'bill',
            amount: row.expected_value,
            description: row.friendly_name || row.account_name,
            category: row.category || 'Conta',
            subcategory: row.subcategory || '',
            due_date: row.due_day ? `dia ${row.due_day}` : '',
            source: 'Contas'
        });
    });
}

function ensureExpenseSchemaColumns() {
    const columns = new Set(db.pragma('table_info(expenses)').map((column) => column.name));
    const additions = [
        ['card_id', 'TEXT'],
        ['card_name', 'TEXT'],
        ['installment_text', 'TEXT'],
        ['financial_account', 'TEXT']
    ];
    additions.forEach(([name, type]) => {
        if (!columns.has(name)) {
            db.exec(`ALTER TABLE expenses ADD COLUMN ${name} ${type}`);
        }
    });
}

function ensureEntrySchemaColumns() {
    const columns = new Set(db.pragma('table_info(entries)').map((column) => column.name));
    const additions = [
        ['payment_method', 'TEXT'],
        ['recurrence', 'TEXT'],
        ['financial_account', 'TEXT']
    ];
    additions.forEach(([name, type]) => {
        if (!columns.has(name)) {
            db.exec(`ALTER TABLE entries ADD COLUMN ${name} ${type}`);
        }
    });
}

function ensureTransferSchemaColumns() {
    const columns = new Set(db.pragma('table_info(transfers)').map((column) => column.name));
    const additions = [
        ['origin', 'TEXT'],
        ['destination', 'TEXT'],
        ['method', 'TEXT'],
        ['notes', 'TEXT'],
        ['status', 'TEXT']
    ];
    additions.forEach(([name, type]) => {
        if (!columns.has(name)) {
            db.exec(`ALTER TABLE transfers ADD COLUMN ${name} ${type}`);
        }
    });
}

function ensureGoalSchemaColumns() {
    const columns = new Set(db.pragma('table_info(goals)').map((column) => column.name));
    const additions = [
        ['status', 'TEXT'],
        ['priority', 'TEXT'],
        ['scope', 'TEXT'],
        ['last_movement', 'TEXT']
    ];
    additions.forEach(([name, type]) => {
        if (!columns.has(name)) {
            db.exec(`ALTER TABLE goals ADD COLUMN ${name} ${type}`);
        }
    });
}

function ensureDebtSchemaColumns() {
    const columns = new Set(db.pragma('table_info(debts)').map((column) => column.name));
    const additions = [
        ['debt_type', 'TEXT'],
        ['original_value', 'REAL'],
        ['installment_value', 'REAL'],
        ['due_day', 'TEXT'],
        ['start_date', 'TEXT'],
        ['total_installments', 'REAL'],
        ['responsible', 'TEXT'],
        ['notes', 'TEXT'],
        ['progress_pct', 'REAL'],
        ['overdue_days', 'REAL'],
        ['payoff_date', 'TEXT']
    ];
    additions.forEach(([name, type]) => {
        if (!columns.has(name)) {
            db.exec(`ALTER TABLE debts ADD COLUMN ${name} ${type}`);
        }
    });
}

function ensureSqliteReady() {
    if (sqliteReady) return true;
    if (!Database) {
        logger.warn('sqlite-read-model: better-sqlite3 não instalado. Fallback em memória ativo.');
        return false;
    }

    try {
        ensureDataDir();
        db = new Database(SQLITE_FILE);
        db.pragma('journal_mode = WAL');
        initSchema();
        sqliteReady = true;
        logger.info(`sqlite-read-model: pronto em ${SQLITE_FILE}`);
        return true;
    } catch (error) {
        logger.warn(`sqlite-read-model: falha ao iniciar (${error.message}). Fallback em memória ativo.`);
        sqliteReady = false;
        db = null;
        return false;
    }
}

function setSyncMeta(key, value) {
    if (!sqliteReady || !db) return;
    const stmt = db.prepare('INSERT INTO sync_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    stmt.run(String(key), String(value));
}

function syncSnapshotToSqlite(snapshot) {
    if (!ensureSqliteReady() || !db) return false;
    const saidas = Array.isArray(snapshot?.saidas) ? snapshot.saidas : [];
    const entradas = Array.isArray(snapshot?.entradas) ? snapshot.entradas : [];
    const transferencias = Array.isArray(snapshot?.transferencias) ? snapshot.transferencias : [];
    const userSettings = Array.isArray(snapshot?.userSettings) ? snapshot.userSettings : [];
    const cartoesConfig = Array.isArray(snapshot?.cartoesConfig) ? snapshot.cartoesConfig : [];
    const cartoes = Array.isArray(snapshot?.cartoes) ? snapshot.cartoes : [];
    const metas = Array.isArray(snapshot?.metas) ? snapshot.metas : [];
    const movimentacoesMetas = Array.isArray(snapshot?.movimentacoesMetas) ? snapshot.movimentacoesMetas : [];
    const dividas = Array.isArray(snapshot?.dividas) ? snapshot.dividas : [];
    const contas = Array.isArray(snapshot?.contas) ? snapshot.contas : [];
    const financialAccounts = Array.isArray(snapshot?.financialAccounts) ? snapshot.financialAccounts : [];

    currentSyncId = Date.now();

    const upsertExpense = db.prepare(`
        INSERT INTO expenses(fingerprint, user_id, source_type, source_name, date_text, year, month, description, category, subcategory, value, card_id, card_name, installment_text, financial_account, last_seen_sync)
        VALUES(@fingerprint, @user_id, @source_type, @source_name, @date_text, @year, @month, @description, @category, @subcategory, @value, @card_id, @card_name, @installment_text, @financial_account, @last_seen_sync)
        ON CONFLICT(fingerprint) DO UPDATE SET
            user_id = excluded.user_id,
            source_type = excluded.source_type,
            source_name = excluded.source_name,
            date_text = excluded.date_text,
            year = excluded.year,
            month = excluded.month,
            description = excluded.description,
            category = excluded.category,
            subcategory = excluded.subcategory,
            value = excluded.value,
            card_id = excluded.card_id,
            card_name = excluded.card_name,
            installment_text = excluded.installment_text,
            financial_account = excluded.financial_account,
            last_seen_sync = excluded.last_seen_sync
    `);

    const upsertEntry = db.prepare(`
        INSERT INTO entries(fingerprint, user_id, date_text, year, month, description, category, value, payment_method, recurrence, financial_account, last_seen_sync)
        VALUES(@fingerprint, @user_id, @date_text, @year, @month, @description, @category, @value, @payment_method, @recurrence, @financial_account, @last_seen_sync)
        ON CONFLICT(fingerprint) DO UPDATE SET
            user_id = excluded.user_id,
            date_text = excluded.date_text,
            year = excluded.year,
            month = excluded.month,
            description = excluded.description,
            category = excluded.category,
            value = excluded.value,
            payment_method = excluded.payment_method,
            recurrence = excluded.recurrence,
            financial_account = excluded.financial_account,
            last_seen_sync = excluded.last_seen_sync
    `);

    const upsertTransfer = db.prepare(`
        INSERT INTO transfers(fingerprint, user_id, date_text, year, month, description, value, origin, destination, method, notes, status, last_seen_sync)
        VALUES(@fingerprint, @user_id, @date_text, @year, @month, @description, @value, @origin, @destination, @method, @notes, @status, @last_seen_sync)
        ON CONFLICT(fingerprint) DO UPDATE SET
            user_id = excluded.user_id,
            date_text = excluded.date_text,
            year = excluded.year,
            month = excluded.month,
            description = excluded.description,
            value = excluded.value,
            origin = excluded.origin,
            destination = excluded.destination,
            method = excluded.method,
            notes = excluded.notes,
            status = excluded.status,
            last_seen_sync = excluded.last_seen_sync
    `);

    const upsertGoal = db.prepare(`
        INSERT INTO goals(fingerprint, user_id, name, target, current, progress_pct, status, priority, scope, last_movement, last_seen_sync)
        VALUES(@fingerprint, @user_id, @name, @target, @current, @progress_pct, @status, @priority, @scope, @last_movement, @last_seen_sync)
        ON CONFLICT(fingerprint) DO UPDATE SET
            user_id = excluded.user_id,
            name = excluded.name,
            target = excluded.target,
            current = excluded.current,
            progress_pct = excluded.progress_pct,
            status = excluded.status,
            priority = excluded.priority,
            scope = excluded.scope,
            last_movement = excluded.last_movement,
            last_seen_sync = excluded.last_seen_sync
    `);

    const upsertGoalMovement = db.prepare(`
        INSERT INTO goal_movements(fingerprint, user_id, goal_user_id, date_text, goal_name, movement_type, value, value_before, value_after, notes, responsible, last_seen_sync)
        VALUES(@fingerprint, @user_id, @goal_user_id, @date_text, @goal_name, @movement_type, @value, @value_before, @value_after, @notes, @responsible, @last_seen_sync)
        ON CONFLICT(fingerprint) DO UPDATE SET
            user_id = excluded.user_id,
            goal_user_id = excluded.goal_user_id,
            date_text = excluded.date_text,
            goal_name = excluded.goal_name,
            movement_type = excluded.movement_type,
            value = excluded.value,
            value_before = excluded.value_before,
            value_after = excluded.value_after,
            notes = excluded.notes,
            responsible = excluded.responsible,
            last_seen_sync = excluded.last_seen_sync
    `);

    const upsertBudgetSettings = db.prepare(`
        INSERT INTO budget_settings(user_id, monthly_budget_enabled, monthly_budget_amount, monthly_budget_scope, monthly_budget_cycle_start_day, last_seen_sync)
        VALUES(@user_id, @monthly_budget_enabled, @monthly_budget_amount, @monthly_budget_scope, @monthly_budget_cycle_start_day, @last_seen_sync)
        ON CONFLICT(user_id) DO UPDATE SET
            monthly_budget_enabled = excluded.monthly_budget_enabled,
            monthly_budget_amount = excluded.monthly_budget_amount,
            monthly_budget_scope = excluded.monthly_budget_scope,
            monthly_budget_cycle_start_day = excluded.monthly_budget_cycle_start_day,
            last_seen_sync = excluded.last_seen_sync
    `);

    const upsertCardConfig = db.prepare(`
        INSERT INTO card_configs(fingerprint, card_id, name, due_day, active, last_seen_sync)
        VALUES(@fingerprint, @card_id, @name, @due_day, @active, @last_seen_sync)
        ON CONFLICT(fingerprint) DO UPDATE SET
            card_id = excluded.card_id,
            name = excluded.name,
            due_day = excluded.due_day,
            active = excluded.active,
            last_seen_sync = excluded.last_seen_sync
    `);

    const upsertDebt = db.prepare(`
        INSERT INTO debts(
            fingerprint, user_id, name, creditor, debt_type, original_value, saldo_atual,
            installment_value, juros_pct, due_day, start_date, total_installments, status,
            responsible, notes, progress_pct, next_due, overdue_days, payoff_date, last_seen_sync
        )
        VALUES(
            @fingerprint, @user_id, @name, @creditor, @debt_type, @original_value, @saldo_atual,
            @installment_value, @juros_pct, @due_day, @start_date, @total_installments, @status,
            @responsible, @notes, @progress_pct, @next_due, @overdue_days, @payoff_date, @last_seen_sync
        )
        ON CONFLICT(fingerprint) DO UPDATE SET
            user_id = excluded.user_id,
            name = excluded.name,
            creditor = excluded.creditor,
            debt_type = excluded.debt_type,
            original_value = excluded.original_value,
            status = excluded.status,
            saldo_atual = excluded.saldo_atual,
            installment_value = excluded.installment_value,
            juros_pct = excluded.juros_pct,
            due_day = excluded.due_day,
            start_date = excluded.start_date,
            total_installments = excluded.total_installments,
            responsible = excluded.responsible,
            notes = excluded.notes,
            progress_pct = excluded.progress_pct,
            next_due = excluded.next_due,
            overdue_days = excluded.overdue_days,
            payoff_date = excluded.payoff_date,
            last_seen_sync = excluded.last_seen_sync
    `);
    const upsertBill = db.prepare(`
        INSERT INTO recurring_bills(
            fingerprint, user_id, account_name, friendly_name, due_day, notes,
            category, subcategory, expected_value, rule_active, last_seen_sync
        )
        VALUES(
            @fingerprint, @user_id, @account_name, @friendly_name, @due_day, @notes,
            @category, @subcategory, @expected_value, @rule_active, @last_seen_sync
        )
        ON CONFLICT(fingerprint) DO UPDATE SET
            user_id = excluded.user_id,
            account_name = excluded.account_name,
            friendly_name = excluded.friendly_name,
            due_day = excluded.due_day,
            notes = excluded.notes,
            category = excluded.category,
            subcategory = excluded.subcategory,
            expected_value = excluded.expected_value,
            rule_active = excluded.rule_active,
            last_seen_sync = excluded.last_seen_sync
    `);
    const upsertFinancialAccount = db.prepare(`
        INSERT INTO financial_accounts(
            fingerprint, user_id, name, account_type, opening_balance,
            opened_on, status, currency, responsible, last_seen_sync
        )
        VALUES(
            @fingerprint, @user_id, @name, @account_type, @opening_balance,
            @opened_on, @status, @currency, @responsible, @last_seen_sync
        )
        ON CONFLICT(fingerprint) DO UPDATE SET
            user_id = excluded.user_id,
            name = excluded.name,
            account_type = excluded.account_type,
            opening_balance = excluded.opening_balance,
            opened_on = excluded.opened_on,
            status = excluded.status,
            currency = excluded.currency,
            responsible = excluded.responsible,
            last_seen_sync = excluded.last_seen_sync
    `);


    const tx = db.transaction(() => {
        for (const item of saidas) {
            const fingerprint = makeFingerprint(['saida', item.user_id, item.data, item.descricao, item.categoria, item.subcategoria, item.valor]);
            upsertExpense.run({
                fingerprint,
                user_id: item.user_id,
                source_type: 'saida',
                source_name: 'Saídas',
                date_text: item.data || '',
                year: Number(item.year || 0),
                month: Number(item.month || 0),
                description: item.descricao || '',
                category: item.categoria || '',
                subcategory: item.subcategoria || '',
                value: Number(item.valor || 0),
                card_id: '',
                card_name: '',
                installment_text: '',
                financial_account: item.contaFinanceira || item.financialAccount || '',
                last_seen_sync: currentSyncId
            });
        }

        for (const item of cartoes) {
            const fingerprint = makeFingerprint([
                'cartao',
                item.user_id,
                item.source,
                item.card_id,
                item.cartao,
                item.data,
                item.descricao,
                item.categoria,
                item.valor,
                item.month,
                item.year,
                item.parcela
            ]);
            upsertExpense.run({
                fingerprint,
                user_id: item.user_id,
                source_type: 'cartao',
                source_name: item.source || '',
                date_text: item.data || '',
                year: Number(item.year || 0),
                month: Number(item.month || 0),
                description: item.descricao || '',
                category: item.categoria || '',
                subcategory: item.subcategoria || 'Cartão de Crédito',
                value: Number(item.valor || 0),
                card_id: item.card_id || item.cardId || item.source || '',
                card_name: item.cartao || item.cardName || item.source || '',
                installment_text: item.parcela || item.installment || '',
                financial_account: item.contaFinanceira || item.financialAccount || '',
                last_seen_sync: currentSyncId
            });
        }

        for (const item of entradas) {
            const fingerprint = makeFingerprint(['entrada', item.user_id, item.data, item.descricao, item.categoria, item.valor]);
            upsertEntry.run({
                fingerprint,
                user_id: item.user_id,
                date_text: item.data || '',
                year: Number(item.year || 0),
                month: Number(item.month || 0),
                description: item.descricao || '',
                category: item.categoria || '',
                value: Number(item.valor || 0),
                payment_method: item.recebimento || item.paymentMethod || '',
                recurrence: item.recorrente || item.recurrence || '',
                financial_account: item.contaFinanceira || item.financialAccount || '',
                last_seen_sync: currentSyncId
            });
        }

        for (const item of transferencias) {
            const fingerprint = makeFingerprint(['transferencia', item.user_id, item.data, item.descricao, item.valor, item.origem, item.destino, item.status]);
            upsertTransfer.run({
                fingerprint,
                user_id: item.user_id,
                date_text: item.data || '',
                year: Number(item.year || 0),
                month: Number(item.month || 0),
                description: item.descricao || '',
                value: Number(item.valor || 0),
                origin: item.origem || item.origin || '',
                destination: item.destino || item.destination || '',
                method: item.metodo || item.method || '',
                notes: item.observacoes || item.notes || '',
                status: item.status || '',
                last_seen_sync: currentSyncId
            });
        }

        for (const item of userSettings) {
            const user_id = String(item.user_id || '').trim();
            if (!user_id) continue;
            upsertBudgetSettings.run({
                user_id,
                monthly_budget_enabled: item.monthly_budget_enabled || item.enabled || '',
                monthly_budget_amount: parseValue(item.monthly_budget_amount || item.amount || 0),
                monthly_budget_scope: item.monthly_budget_scope || item.scope || 'personal',
                monthly_budget_cycle_start_day: Number.parseInt(item.monthly_budget_cycle_start_day || item.cycleStartDay || '1', 10) || 1,
                last_seen_sync: currentSyncId
            });
        }

        for (const item of cartoesConfig) {
            const cardId = item.card_id || item.cardId || item.id || '';
            const name = item.nome || item.name || item.cartao || item.cardName || '';
            const fingerprint = makeFingerprint(['card_config', cardId, name]);
            upsertCardConfig.run({
                fingerprint,
                card_id: cardId,
                name,
                due_day: Number.parseInt(item.due_day || item.dueDay || item.dia_vencimento || item.vencimento || '1', 10) || 1,
                active: item.active || item.ativo || 'SIM',
                last_seen_sync: currentSyncId
            });
        }

        for (const item of metas) {
            const row = item.row || [];
            const target = parseValue(row[1] || 0);
            const current = parseValue(row[2] || 0);
            const progressPct = target > 0 ? Math.min(100, (current / target) * 100) : parseValue(row[3] || 0);
            const fingerprint = makeFingerprint(['meta', item.user_id, row[0], target, current]);
            upsertGoal.run({
                fingerprint,
                user_id: item.user_id,
                name: row[0] || 'Meta',
                target,
                current,
                progress_pct: progressPct,
                status: row[6] || '',
                priority: row[7] || '',
                scope: row[9] || '',
                last_movement: row[10] || '',
                last_seen_sync: currentSyncId
            });
        }

        for (const item of movimentacoesMetas) {
            const row = item.row || [];
            const fingerprint = makeFingerprint(['goal-movement', item.user_id, row[9], row[0], row[1], row[2], row[3], row[4], row[5]]);
            upsertGoalMovement.run({
                fingerprint,
                user_id: item.user_id,
                goal_user_id: row[9] || item.user_id,
                date_text: row[0] || '',
                goal_name: row[1] || '',
                movement_type: row[2] || '',
                value: parseValue(row[3] || 0),
                value_before: parseValue(row[4] || 0),
                value_after: parseValue(row[5] || 0),
                notes: row[6] || '',
                responsible: row[7] || '',
                last_seen_sync: currentSyncId
            });
        }

        for (const item of dividas) {
            const name = snapshotRowValue(item, ['Nome', 'Nome da Dívida'], 0);
            const creditor = snapshotRowValue(item, ['Credor'], 1);
            const debtType = snapshotRowValue(item, ['Tipo'], 2);
            const originalValue = parseValue(snapshotRowValue(item, ['Valor Original'], 3) || 0);
            const saldoAtual = parseValue(snapshotRowValue(item, ['Saldo Atual'], 4) || 0);
            const status = snapshotRowValue(item, ['Status'], 10);
            const fingerprint = makeFingerprint(['divida', item.user_id, name, creditor, saldoAtual, status]);
            const progressPct = originalValue > 0
                ? Math.min(100, Math.max(0, ((originalValue - saldoAtual) / originalValue) * 100))
                : parseValue(snapshotRowValue(item, ['% Quitado', 'Quitado'], 13) || 0);
            upsertDebt.run({
                fingerprint,
                user_id: item.user_id,
                name: name || 'Dívida',
                creditor: creditor || '',
                debt_type: debtType || '',
                original_value: originalValue,
                status: status || '',
                saldo_atual: saldoAtual,
                installment_value: parseValue(snapshotRowValue(item, ['Parcela', 'Valor da Parcela'], 5) || 0),
                juros_pct: parseValue(snapshotRowValue(item, ['Juros', 'Taxa de Juros', 'Taxa'], 6) || 0),
                due_day: snapshotRowValue(item, ['Vencimento', 'Dia de Vencimento'], 7) || '',
                start_date: snapshotRowValue(item, ['Início', 'Inicio', 'Data de Início', 'Data de Inicio'], 8) || '',
                total_installments: parseValue(snapshotRowValue(item, ['Total Parcelas', 'Total de Parcelas'], 9) || 0),
                responsible: snapshotRowValue(item, ['Responsável', 'Responsavel'], 11) || '',
                notes: snapshotRowValue(item, ['Observações', 'Observacoes', 'Obs'], 12) || '',
                progress_pct: progressPct,
                next_due: snapshotRowValue(item, ['Próximo Vencimento', 'Proximo Vencimento', 'Next Due'], 14) || '',
                overdue_days: parseValue(snapshotRowValue(item, ['Atraso (Dias)', 'Dias de Atraso', 'Atraso'], 15) || 0),
                payoff_date: snapshotRowValue(item, ['Data Prevista para Quitação', 'Data Prevista para Quitacao'], 16) || '',
                last_seen_sync: currentSyncId
            });
        }

        for (const item of contas) {
            const accountName = snapshotRowValue(item, ['Nome da Conta', 'Nome'], 0);
            const friendlyName = snapshotRowValue(item, ['Nome Amigável', 'Nome Amigavel'], 4);
            const dueDay = Number.parseInt(snapshotRowValue(item, ['Dia do Vencimento', 'Vencimento', 'Dia'], 1), 10);
            const fingerprint = makeFingerprint(['conta', item.user_id, accountName, friendlyName, dueDay]);
            upsertBill.run({
                fingerprint,
                user_id: item.user_id,
                account_name: accountName || '',
                friendly_name: friendlyName || '',
                due_day: Number.isInteger(dueDay) ? dueDay : null,
                notes: snapshotRowValue(item, ['Observações', 'Observacoes', 'Obs'], 2) || '',
                category: snapshotRowValue(item, ['Categoria'], 5) || '',
                subcategory: snapshotRowValue(item, ['Subcategoria'], 6) || '',
                expected_value: parseValue(snapshotRowValue(item, ['Valor Esperado', 'Valor'], 7) || 0),
                rule_active: snapshotRowValue(item, ['Regra Ativa'], 8) || '',
                last_seen_sync: currentSyncId
            });
        }
        for (const item of financialAccounts) {
            const userId = String(item.user_id || item.userId || '').trim();
            const name = snapshotRowValue(item, ['Nome da Conta', 'Nome'], 0) || item.nome || item.name || '';
            if (!userId || !String(name || '').trim()) continue;
            const fingerprint = makeFingerprint(['financial-account', userId, name]);
            upsertFinancialAccount.run({
                fingerprint,
                user_id: userId,
                name: String(name || '').trim(),
                account_type: snapshotRowValue(item, ['Tipo'], 1) || item.tipo || item.accountType || '',
                opening_balance: parseValue(snapshotRowValue(item, ['Saldo Inicial'], 2) || item.saldoInicial || item.openingBalance || 0),
                opened_on: snapshotRowValue(item, ['Data de Abertura'], 3) || item.dataAbertura || item.openedOn || '',
                status: snapshotRowValue(item, ['Status'], 4) || item.status || '',
                currency: snapshotRowValue(item, ['Moeda'], 5) || item.moeda || item.currency || 'BRL',
                responsible: snapshotRowValue(item, ['Responsavel', 'Responsável'], 6) || item.responsavel || item.responsible || '',
                last_seen_sync: currentSyncId
            });
        }

        db.prepare('DELETE FROM expenses WHERE last_seen_sync < ?').run(currentSyncId);
        db.prepare('DELETE FROM entries WHERE last_seen_sync < ?').run(currentSyncId);
        db.prepare('DELETE FROM transfers WHERE last_seen_sync < ?').run(currentSyncId);
        db.prepare('DELETE FROM budget_settings WHERE last_seen_sync < ?').run(currentSyncId);
        db.prepare('DELETE FROM card_configs WHERE last_seen_sync < ?').run(currentSyncId);
        db.prepare('DELETE FROM goals WHERE last_seen_sync < ?').run(currentSyncId);
        db.prepare('DELETE FROM goal_movements WHERE last_seen_sync < ?').run(currentSyncId);
        db.prepare('DELETE FROM debts WHERE last_seen_sync < ?').run(currentSyncId);
        db.prepare('DELETE FROM recurring_bills WHERE last_seen_sync < ?').run(currentSyncId);
        db.prepare('DELETE FROM financial_accounts WHERE last_seen_sync < ?').run(currentSyncId);
        rebuildFinancialEventsPublic(currentSyncId);
    });

    tx();
    setSyncMeta('last_sync_id', currentSyncId);
    setSyncMeta('last_sync_at', new Date().toISOString());
    return true;
}

function normalizeMonthParam(month) {
    if (month === null || month === undefined) return new Date().getMonth();
    const parsed = Number.parseInt(month, 10);
    if (Number.isNaN(parsed)) return new Date().getMonth();
    return parsed;
}

function normalizeYearParam(year) {
    const parsed = Number.parseInt(year, 10);
    if (Number.isNaN(parsed)) return new Date().getFullYear();
    return parsed;
}

function daysConsideredForAverage(month, year, now = new Date()) {
    if (month === null || month === undefined) return 365;
    if (year === now.getFullYear() && month === now.getMonth()) {
        return Math.max(1, now.getDate());
    }
    return new Date(year, month + 1, 0).getDate();
}

function isAllUsersScope(userId) {
    return String(userId || '') === ALL_USERS_ID;
}

function isGoalActive(status, target, current) {
    const normalized = normalizeText(status || '');
    return !/(concluid|finalizad|atingid|quitad|cancelad|pausad)/.test(normalized) && Number(target || 0) > Number(current || 0);
}

function titleCaseLabel(value) {
    return String(value || '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
        .trim();
}

function normalizeEstablishmentLabel(description) {
    const original = String(description || '').trim();
    const normalized = normalizeText(original);
    if (!normalized) return 'Sem descrição';
    if (normalized.includes('ifood') || normalized.includes('i food')) return 'iFood';
    if (normalized.includes('uber')) return 'Uber';
    if (normalized.includes('mercadolivre') || normalized.includes('mercado livre')) return 'Mercado Livre';
    if (normalized.includes('google')) return 'Google';

    const cleaned = original
        .replace(/\s*[-–—]?\s*(?:parcela\s*)?\d+\s*\/\s*\d+\s*$/i, '')
        .replace(/\b(?:compra|pagamento|pix|debito|débito|credito|crédito|nu\s*pay|nupay)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return titleCaseLabel(cleaned || original).slice(0, 60);
}

function groupExpenseRows(rows, keyFn) {
    const grouped = new Map();
    rows.forEach((row) => {
        const label = String(keyFn(row) || 'Outros').trim() || 'Outros';
        const key = normalizeText(label) || label;
        const existing = grouped.get(key) || { label, total: 0, count: 0 };
        existing.total += Number(row.valor || row.value || 0);
        existing.count += 1;
        grouped.set(key, existing);
    });
    return Array.from(grouped.values())
        .sort((a, b) => b.total - a.total || b.count - a.count || String(a.label).localeCompare(String(b.label), 'pt-BR'));
}

function buildExpenseDetailResult(rows, params = {}) {
    const totalSaidas = rows
        .filter(row => row.tipo === 'saida')
        .reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const totalCartoes = rows
        .filter(row => row.tipo === 'cartao')
        .reduce((sum, row) => sum + Number(row.valor || 0), 0);
    return {
        total: totalSaidas + totalCartoes,
        totalSaidas,
        totalCartoes,
        categorias: groupExpenseRows(rows, row => row.categoria || 'Outros').slice(0, 8),
        estabelecimentos: groupExpenseRows(rows, row => normalizeEstablishmentLabel(row.descricao)).slice(0, 10),
        formas: groupExpenseRows(rows, row => row.tipo === 'cartao' ? (row.cartao || 'Cartão de Crédito') : 'Saídas').slice(0, 8),
        lancamentos: rows.slice(0, 12),
        filtroCartao: params.cartao || ''
    };
}

function transferDashboardText(row = {}) {
    return normalizeText([
        row.description,
        row.origin,
        row.destination,
        row.notes,
        row.status
    ].filter(Boolean).join(' '));
}

function transferHasReserveKeyword(row = {}) {
    const text = transferDashboardText(row);
    return [
        'rdb',
        'caixinha',
        'nu reserva',
        'reserva',
        'investimento',
        'aplic aut',
        'aplicacao aut',
        'aplicação aut'
    ].some(term => text.includes(normalizeText(term)));
}

function isDashboardReserveApplication(row = {}) {
    const text = transferDashboardText(row);
    return transferHasReserveKeyword(row) && (
        text.includes('aplicacao') ||
        text.includes('aplicação') ||
        text.includes('guardar') ||
        text.includes('guardado')
    );
}

function isDashboardReserveRedemption(row = {}) {
    const text = transferDashboardText(row);
    return transferHasReserveKeyword(row) && (
        text.includes('resgate') ||
        text.includes('retirada')
    );
}

function roundDashboardMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function dashboardDateTimestamp(value) {
    const parsed = parseSheetDate(value);
    return parsed ? parsed.getTime() : 0;
}

function summarizeDashboardReserveTransfers(rows = []) {
    const applied = roundDashboardMoney(rows
        .filter(isDashboardReserveApplication)
        .reduce((sum, row) => sum + Number(row.value || 0), 0));
    const redeemed = roundDashboardMoney(rows
        .filter(isDashboardReserveRedemption)
        .reduce((sum, row) => sum + Number(row.value || 0), 0));
    return {
        applied,
        redeemed,
        netApplied: roundDashboardMoney(applied - redeemed)
    };
}

function queryKpis(userId, { month, year } = {}) {
    if (!sqliteReady || !db) return null;
    const m = normalizeMonthParam(month);
    const y = normalizeYearParam(year);

    const allUsers = isAllUsersScope(userId) ? 1 : 0;
    const entradas = db.prepare('SELECT COALESCE(SUM(value), 0) AS total FROM entries WHERE (? = 1 OR user_id = ?) AND month = ? AND year = ?').get(allUsers, userId, m, y).total || 0;
    const saidas = db.prepare("SELECT COALESCE(SUM(value), 0) AS total FROM expenses WHERE (? = 1 OR user_id = ?) AND month = ? AND year = ? AND source_type = 'saida'").get(allUsers, userId, m, y).total || 0;
    const cartoes = db.prepare("SELECT COALESCE(SUM(value), 0) AS total FROM expenses WHERE (? = 1 OR user_id = ?) AND month = ? AND year = ? AND source_type = 'cartao'").get(allUsers, userId, m, y).total || 0;
    const debt = db.prepare(`
        SELECT
            COUNT(*) AS active_count,
            COALESCE(SUM(saldo_atual), 0) AS total
        FROM debts
        WHERE (? = 1 OR user_id = ?)
        AND lower(COALESCE(status, '')) NOT LIKE '%quitad%'
        AND lower(COALESCE(status, '')) NOT LIKE '%pago%'
        AND lower(COALESCE(status, '')) NOT LIKE '%finalizad%'
    `).get(allUsers, userId);
    const transferRows = db.prepare(`
        SELECT date_text, description, value, origin, destination, notes, status
        FROM transfers
        WHERE (? = 1 OR user_id = ?) AND month = ? AND year = ?
    `).all(allUsers, userId, m, y);
    const reserveSummary = summarizeDashboardReserveTransfers(transferRows);
    const saldo = entradas - (saidas + cartoes);

    return {
        period: { month: m, year: y },
        entradas,
        saidas,
        cartoes,
        saldo,
        reservaAplicada: reserveSummary.applied,
        reservaResgatada: reserveSummary.redeemed,
        reservaLiquida: reserveSummary.netApplied,
        saldoDisponivelEstimado: roundDashboardMoney(saldo - reserveSummary.netApplied),
        debtActiveCount: Number(debt?.active_count || 0),
        debtTotal: Number(debt?.total || 0)
    };
}

function queryTopCategories(userId, { month, year } = {}) {
    if (!sqliteReady || !db) return null;
    const m = normalizeMonthParam(month);
    const y = normalizeYearParam(year);
    const allUsers = isAllUsersScope(userId) ? 1 : 0;
    return db.prepare(`
        SELECT category, COALESCE(SUM(value), 0) AS value
        FROM expenses
        WHERE (? = 1 OR user_id = ?) AND month = ? AND year = ?
        GROUP BY category
        ORDER BY value DESC
        LIMIT 8
    `).all(allUsers, userId, m, y);
}

function queryCashflow(userId, { month, year } = {}) {
    if (!sqliteReady || !db) return null;
    const m = normalizeMonthParam(month);
    const y = normalizeYearParam(year);
    const allUsers = isAllUsersScope(userId) ? 1 : 0;

    const entries = db.prepare(`
        SELECT date_text AS date, COALESCE(SUM(value), 0) AS value
        FROM entries
        WHERE (? = 1 OR user_id = ?) AND month = ? AND year = ?
        GROUP BY date_text
    `).all(allUsers, userId, m, y);

    const expenses = db.prepare(`
        SELECT date_text AS date, COALESCE(SUM(value), 0) AS value
        FROM expenses
        WHERE (? = 1 OR user_id = ?) AND month = ? AND year = ?
        GROUP BY date_text
    `).all(allUsers, userId, m, y);

    const map = new Map();
    entries.forEach((item) => {
        map.set(item.date, { date: item.date, entradas: Number(item.value || 0), saidas: 0, saldo: Number(item.value || 0) });
    });
    expenses.forEach((item) => {
        const current = map.get(item.date) || { date: item.date, entradas: 0, saidas: 0, saldo: 0 };
        current.saidas += Number(item.value || 0);
        current.saldo -= Number(item.value || 0);
        map.set(item.date, current);
    });
    return Array.from(map.values())
        .sort((a, b) => dashboardDateTimestamp(a.date) - dashboardDateTimestamp(b.date))
        .slice(-31);
}

function roundAccountMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function queryFinancialAccounts(userId) {
    if (!sqliteReady || !db) return null;
    const allUsers = isAllUsersScope(userId) ? 1 : 0;
    const accountRows = db.prepare(`
        SELECT name, account_type, opening_balance, opened_on, status, currency, responsible
        FROM financial_accounts
        WHERE (? = 1 OR user_id = ?)
        ORDER BY responsible ASC, name ASC
    `).all(allUsers, userId);
    const balanceByName = new Map();
    const keyFor = value => normalizeText(String(value || '').trim());
    accountRows.forEach((row) => {
        balanceByName.set(keyFor(row.name), roundAccountMoney(row.opening_balance));
    });
    const addMovement = (accountName, amount) => {
        const key = keyFor(accountName);
        if (!key || !balanceByName.has(key)) return;
        balanceByName.set(key, roundAccountMoney(Number(balanceByName.get(key) || 0) + Number(amount || 0)));
    };
    db.prepare(`
        SELECT value, financial_account
        FROM expenses
        WHERE (? = 1 OR user_id = ?) AND source_type = 'saida' AND COALESCE(financial_account, '') <> ''
    `).all(allUsers, userId).forEach(row => addMovement(row.financial_account, -Number(row.value || 0)));
    db.prepare(`
        SELECT value, financial_account
        FROM entries
        WHERE (? = 1 OR user_id = ?) AND COALESCE(financial_account, '') <> ''
    `).all(allUsers, userId).forEach(row => addMovement(row.financial_account, Number(row.value || 0)));
    db.prepare(`
        SELECT value, origin, destination, status
        FROM transfers
        WHERE (? = 1 OR user_id = ?)
    `).all(allUsers, userId)
        .filter(row => {
            const status = normalizeText(row.status || '');
            return !status.includes('pendent') && !status.includes('cancel');
        })
        .forEach((row) => {
            addMovement(row.origin, -Number(row.value || 0));
            addMovement(row.destination, Number(row.value || 0));
        });

    const rows = accountRows.map(row => ({
        name: row.name || '',
        accountType: row.account_type || '',
        openingBalance: roundAccountMoney(row.opening_balance),
        balance: roundAccountMoney(balanceByName.get(keyFor(row.name))),
        openedOn: row.opened_on || '',
        status: row.status || '',
        currency: row.currency || 'BRL',
        responsible: row.responsible || ''
    }));
    rows.totalBalance = roundAccountMoney(rows.reduce((sum, row) => sum + Number(row.balance || 0), 0));
    return rows;
}
function queryDebts(userId) {
    if (!sqliteReady || !db) return null;
    const allUsers = isAllUsersScope(userId) ? 1 : 0;
    return db.prepare(`
        SELECT name, creditor, status, saldo_atual AS saldoAtual, juros_pct AS jurosPct, next_due AS nextDue
        FROM debts
        WHERE (? = 1 OR user_id = ?)
        ORDER BY saldo_atual DESC
        LIMIT 20
    `).all(allUsers, userId);
}

function queryGoals(userId) {
    if (!sqliteReady || !db) return null;
    const allUsers = isAllUsersScope(userId) ? 1 : 0;
    return db.prepare(`
        SELECT name, target, current, progress_pct AS progressPct, status, priority, scope, last_movement AS lastMovement
        FROM goals
        WHERE (? = 1 OR user_id = ?)
        ORDER BY progress_pct DESC
        LIMIT 20
    `).all(allUsers, userId);
}

function queryRecentTransactions(userId, { month, year } = {}) {
    if (!sqliteReady || !db) return null;
    const m = normalizeMonthParam(month);
    const y = normalizeYearParam(year);
    const allUsers = isAllUsersScope(userId) ? 1 : 0;

    const recentEntries = db.prepare(`
        SELECT date_text AS date, description, category, value, 'entrada' AS type
        FROM entries
        WHERE (? = 1 OR user_id = ?) AND month = ? AND year = ?
    `).all(allUsers, userId, m, y);

    const recentExpenses = db.prepare(`
        SELECT date_text AS date, description, category, value, source_type AS type
        FROM expenses
        WHERE (? = 1 OR user_id = ?) AND month = ? AND year = ?
    `).all(allUsers, userId, m, y);

    const recentTransfers = db.prepare(`
        SELECT date_text AS date, description, 'Transferência' AS category, value, 'transferencia' AS type
        FROM transfers
        WHERE (? = 1 OR user_id = ?) AND month = ? AND year = ?
    `).all(allUsers, userId, m, y);

    return [...recentEntries, ...recentExpenses, ...recentTransfers]
        .sort((a, b) => dashboardDateTimestamp(b.date) - dashboardDateTimestamp(a.date))
        .slice(0, 20)
        .map(item => ({
            ...item,
            typeLabel: item.type === 'entrada'
                ? 'Entrada'
                : item.type === 'cartao'
                    ? 'Cartão'
                    : item.type === 'transferencia'
                        ? 'Transferência'
                        : 'Saída'
        }));
}

function queryAlerts(userId, { month, year } = {}) {
    if (!sqliteReady || !db) return null;
    const kpi = queryKpis(userId, { month, year });
    if (!kpi) return [];
    const alerts = [];
    if (kpi.saldo < 0) {
        alerts.push({
            level: 'high',
            code: 'NEGATIVE_CASHFLOW',
            message: `Saldo negativo no período: ${kpi.saldo.toFixed(2)}`
        });
    }
    if (kpi.debtTotal > 0 && kpi.entradas > 0 && (kpi.debtTotal / Math.max(1, kpi.entradas)) > 3) {
        alerts.push({
            level: 'medium',
            code: 'HIGH_DEBT_LOAD',
            message: 'Carga de dívida elevada em relação às entradas.'
        });
    }
    return alerts;
}

function queryAnalyticalIntentSql(intent, parameters, { userId }) {
    if (!sqliteReady || !db) return null;
    const month = normalizeMonthParam(parameters?.mes);
    const year = normalizeYearParam(parameters?.ano);
    const categoriaRaw = String(parameters?.categoria || '').trim();
    const cartaoRaw = String(parameters?.cartao || '').trim();

    const expenseMatchesCategory = (row) => {
        return matchesAnyField(
            [row.category || '', row.subcategory || '', row.description || ''],
            categoriaRaw
        );
    };

    const normalizedSourceNameSql = [
        ["'á'", "'a'"],
        ["'à'", "'a'"],
        ["'ã'", "'a'"],
        ["'â'", "'a'"],
        ["'é'", "'e'"],
        ["'ê'", "'e'"],
        ["'í'", "'i'"],
        ["'ó'", "'o'"],
        ["'ô'", "'o'"],
        ["'õ'", "'o'"],
        ["'ú'", "'u'"],
        ["'ç'", "'c'"]
    ].reduce((expr, [from, to]) => `REPLACE(${expr}, ${from}, ${to})`, 'LOWER(source_name)');

    if (intent === 'saldo_do_mes') {
        const kpi = queryKpis(userId, { month, year });
        return {
            results: kpi.saldo,
            details: {
                totalSaidas: kpi.saidas + kpi.cartoes,
                totalEntradas: kpi.entradas,
                mes: month,
                ano: year
            }
        };
    }

    if (intent === 'total_gastos_mes') {
        const kpi = queryKpis(userId, { month, year });
        return {
            results: kpi.saidas + kpi.cartoes,
            details: {
                totalSaidas: kpi.saidas,
                totalCartoes: kpi.cartoes,
                mes: month,
                ano: year
            }
        };
    }

    if (intent === 'total_fatura_cartao') {
        const cardNeedle = `%${normalizeText(cartaoRaw)}%`;
        const rows = db.prepare(`
            SELECT value
            FROM expenses
            WHERE user_id = ? AND source_type = 'cartao' AND month = ? AND year = ?
              AND (? = '' OR ${normalizedSourceNameSql} LIKE ?)
        `).all(userId, month, year, normalizeText(cartaoRaw), cardNeedle);
        return {
            results: rows.reduce((sum, row) => sum + Number(row.value || 0), 0),
            details: { cartao: cartaoRaw, mes: month, ano: year, parcelas: rows.length }
        };
    }

    if (intent === 'total_faturas_por_cartao') {
        const cardNeedle = `%${normalizeText(cartaoRaw)}%`;
        const rows = db.prepare(`
            SELECT COALESCE(source_name, 'Cartão') AS cartao, SUM(value) AS total, COUNT(*) AS parcelas
            FROM expenses
            WHERE user_id = ? AND source_type = 'cartao' AND month = ? AND year = ?
              AND (? = '' OR ${normalizedSourceNameSql} LIKE ?)
            GROUP BY COALESCE(source_name, 'Cartão')
            ORDER BY total DESC, cartao ASC
        `).all(userId, month, year, normalizeText(cartaoRaw), cardNeedle);
        const results = rows.map(row => ({
            cartao: row.cartao || 'Cartão',
            total: Number(row.total || 0),
            parcelas: Number(row.parcelas || 0)
        }));
        return {
            results,
            details: {
                cartao: cartaoRaw,
                mes: month,
                ano: year,
                total: results.reduce((sum, row) => sum + Number(row.total || 0), 0),
                cartoes: results.length,
                parcelas: results.reduce((sum, row) => sum + Number(row.parcelas || 0), 0)
            }
        };
    }

    if (intent === 'detalhamento_gastos_mes' || intent === 'detalhamento_cartao_mes' || intent === 'ranking_estabelecimentos_gastos') {
        const allUsers = isAllUsersScope(userId) ? 1 : 0;
        const onlyCards = intent === 'detalhamento_cartao_mes' || normalizeText(parameters?.origem || '') === 'cartao';
        const cardNeedle = `%${normalizeText(cartaoRaw)}%`;
        const sourceTypeFilter = onlyCards ? 'cartao' : '';
        const rows = db.prepare(`
            SELECT
                date_text AS data,
                description AS descricao,
                category AS categoria,
                subcategory AS subcategoria,
                value AS valor,
                source_type AS tipo,
                source_name AS cartao
            FROM expenses
            WHERE (? = 1 OR user_id = ?)
              AND month = ? AND year = ?
              AND (? = '' OR source_type = ?)
              AND (? = '' OR ${normalizedSourceNameSql} LIKE ?)
            ORDER BY value DESC, date_text DESC
            LIMIT 300
        `).all(
            allUsers,
            userId,
            month,
            year,
            sourceTypeFilter,
            sourceTypeFilter,
            normalizeText(cartaoRaw),
            cardNeedle
        ).map(row => ({
            data: row.data || '',
            descricao: row.descricao || '',
            categoria: row.categoria || 'Outros',
            subcategoria: row.subcategoria || '',
            valor: Number(row.valor || 0),
            origem: row.tipo === 'cartao' ? 'Cartão' : 'Saídas',
            tipo: row.tipo || '',
            pagamento: row.tipo === 'cartao' ? 'Crédito' : '',
            cartao: row.cartao || '',
            parcela: '',
            mesCobranca: ''
        }));

        if (intent === 'ranking_estabelecimentos_gastos') {
            const results = groupExpenseRows(rows, row => normalizeEstablishmentLabel(row.descricao)).slice(0, 15);
            return {
                results,
                details: {
                    mes: month,
                    ano: year,
                    total: results.reduce((sum, item) => sum + Number(item.total || 0), 0),
                    totalLancamentos: rows.length,
                    somenteCartao: onlyCards
                }
            };
        }

        return {
            results: buildExpenseDetailResult(rows, { cartao: cartaoRaw }),
            details: {
                cartao: cartaoRaw,
                mes: month,
                ano: year,
                totalLancamentos: rows.length,
                criterioCartao: 'mes_cobranca',
                somenteCartao: onlyCards
            }
        };
    }

    if (intent === 'total_cartoes_em_aberto') {
        const targetKey = Number(year || 0) * 12 + Number(month || 0);
        const cardNeedle = `%${normalizeText(cartaoRaw)}%`;
        const rows = db.prepare(`
            SELECT value, year, month
            FROM expenses
            WHERE user_id = ? AND source_type = 'cartao'
              AND ((year * 12) + month) >= ?
              AND (? = '' OR ${normalizedSourceNameSql} LIKE ?)
        `).all(userId, targetKey, normalizeText(cartaoRaw), cardNeedle);
        const monthKeys = new Set(rows.map(row => `${row.year}-${row.month}`));
        return {
            results: rows.reduce((sum, row) => sum + Number(row.value || 0), 0),
            details: { cartao: cartaoRaw, mes: month, ano: year, parcelas: rows.length, meses: monthKeys.size }
        };
    }

    if (intent === 'resumo_parcelamentos_cartao') {
        const targetKey = Number(year || 0) * 12 + Number(month || 0);
        const cardNeedle = `%${normalizeText(cartaoRaw)}%`;
        const rows = db.prepare(`
            SELECT description, source_name, category, COUNT(*) AS parcelasLancadas, SUM(value) AS totalPrevisto, MIN(date_text) AS primeiraParcela, MAX(date_text) AS ultimaParcela
            FROM expenses
            WHERE user_id = ? AND source_type = 'cartao'
              AND ((year * 12) + month) >= ?
              AND (? = '' OR ${normalizedSourceNameSql} LIKE ?)
            GROUP BY description, source_name, category
            HAVING COUNT(*) > 1
            ORDER BY totalPrevisto DESC
        `).all(userId, targetKey, normalizeText(cartaoRaw), cardNeedle);
        return {
            results: rows.map(row => ({
                descricao: row.description || '',
                cartao: row.source_name || '',
                categoria: row.category || '',
                parcelasLancadas: Number(row.parcelasLancadas || 0),
                totalPrevisto: Number(row.totalPrevisto || 0),
                primeiraParcela: row.primeiraParcela || '',
                ultimaParcela: row.ultimaParcela || ''
            })),
            details: { cartao: cartaoRaw, mes: month, ano: year }
        };
    }

    if (intent === 'resumo_metas' || intent === 'progresso_metas') {
        const rows = db.prepare(`
            SELECT name, target, current, progress_pct AS progressPct, status, priority, scope, last_movement AS lastMovement
            FROM goals
            WHERE user_id = ?
            ORDER BY progress_pct ASC, target DESC
            LIMIT 100
        `).all(userId);
        const allGoals = rows.map(row => {
            const alvo = Number(row.target || 0);
            const atual = Number(row.current || 0);
            const falta = Math.max(0, alvo - atual);
            return {
                nome: row.name || 'Meta',
                alvo,
                atual,
                progressoPct: Number(row.progressPct || 0),
                falta,
                valorMensal: 0,
                dataFim: '',
                status: row.status || (falta > 0 ? 'Em andamento' : 'Concluída'),
                prioridade: row.priority || '',
                escopo: row.scope || '',
                ultimaMovimentacao: row.lastMovement || '',
                ativa: isGoalActive(row.status, alvo, atual)
            };
        }).sort((a, b) => Number(b.ativa) - Number(a.ativa) || b.falta - a.falta || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
        const goals = intent === 'progresso_metas' ? allGoals.filter(goal => goal.ativa) : allGoals;
        return {
            results: goals,
            details: {
                total: allGoals.length,
                ativas: allGoals.filter(goal => goal.ativa).length,
                totalAlvo: allGoals.reduce((sum, goal) => sum + goal.alvo, 0),
                totalAtual: allGoals.reduce((sum, goal) => sum + goal.atual, 0),
                totalFalta: goals.reduce((sum, goal) => sum + goal.falta, 0),
                totalValorMensal: 0
            }
        };
    }

    if (intent === 'total_gastos_categoria_mes') {
        const rows = db.prepare(`
            SELECT description, category, subcategory, value
            FROM expenses
            WHERE user_id = ? AND month = ? AND year = ?
        `).all(userId, month, year);
        const total = rows
            .filter(expenseMatchesCategory)
            .reduce((sum, row) => sum + Number(row.value || 0), 0);

        return {
            results: total,
            details: { categoria: categoriaRaw, mes: month, ano: year }
        };
    }

    if (intent === 'media_gastos_categoria_mes') {
        const rows = db.prepare(`
            SELECT description, category, subcategory, value
            FROM expenses
            WHERE user_id = ? AND month = ? AND year = ?
        `).all(userId, month, year);
        const filtered = rows.filter(expenseMatchesCategory);
        const total = filtered.reduce((sum, row) => sum + Number(row.value || 0), 0);
        return {
            results: filtered.length > 0 ? total / filtered.length : 0,
            details: { categoria: categoriaRaw, mes: month, ano: year }
        };
    }

    if (intent === 'media_diaria_gastos_mes') {
        const kpi = queryKpis(userId, { month, year });
        const total = kpi.saidas + kpi.cartoes;
        const days = daysConsideredForAverage(month, year);
        return {
            results: days > 0 ? total / days : 0,
            details: { mes: month, ano: year, diasConsiderados: days, totalGastos: total }
        };
    }

    if (intent === 'total_gastos_multiplas_categorias') {
        const categorias = Array.isArray(parameters?.categorias) ? parameters.categorias.filter(Boolean) : [];
        const rows = db.prepare(`
            SELECT description, category, subcategory, value
            FROM expenses
            WHERE user_id = ? AND month = ? AND year = ?
        `).all(userId, month, year);
        const total = rows
            .filter(row => categorias.some(cat => matchesAnyField([row.category || '', row.subcategory || '', row.description || ''], cat)))
            .reduce((sum, row) => sum + Number(row.value || 0), 0);
        return {
            results: total,
            details: { categorias, mes: month, ano: year }
        };
    }

    if (intent === 'percentual_categoria_gastos') {
        const rows = db.prepare(`
            SELECT description, category, subcategory, value
            FROM expenses
            WHERE user_id = ? AND month = ? AND year = ?
        `).all(userId, month, year);
        const totalGastos = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
        const totalCategoria = rows
            .filter(expenseMatchesCategory)
            .reduce((sum, row) => sum + Number(row.value || 0), 0);
        return {
            results: totalGastos > 0 ? (totalCategoria / totalGastos) * 100 : 0,
            details: { categoria: categoriaRaw, mes: month, ano: year, totalCategoria, totalGastos }
        };
    }

    if (intent === 'comparacao_gastos_categorias') {
        const categorias = Array.isArray(parameters?.categorias) ? parameters.categorias.filter(Boolean).slice(0, 2) : [];
        const rows = db.prepare(`
            SELECT description, category, subcategory, value
            FROM expenses
            WHERE user_id = ? AND month = ? AND year = ?
        `).all(userId, month, year);
        return {
            results: {
                categorias: categorias.map(cat => ({
                    categoria: cat,
                    total: rows
                        .filter(row => matchesAnyField([row.category || '', row.subcategory || '', row.description || ''], cat))
                        .reduce((sum, row) => sum + Number(row.value || 0), 0)
                }))
            },
            details: { categorias, mes: month, ano: year }
        };
    }

    if (intent === 'listagem_gastos_categoria') {
        const rows = db.prepare(`
            SELECT date_text, description, category, subcategory, value
            FROM expenses
            WHERE user_id = ? AND month = ? AND year = ?
            ORDER BY date_text DESC
            LIMIT 100
        `).all(userId, month, year)
            .filter(expenseMatchesCategory)
            .map((row) => [row.date_text, row.description, row.category, row.subcategory, row.value]);
        return {
            results: rows,
            details: { categoria: categoriaRaw, mes: month, ano: year }
        };
    }

    if (intent === 'contagem_ocorrencias') {
        const rows = db.prepare(`
            SELECT description, category, subcategory
            FROM expenses
            WHERE user_id = ? AND month = ? AND year = ?
        `).all(userId, month, year);
        return {
            results: rows.filter(expenseMatchesCategory).length,
            details: { categoria: categoriaRaw, mes: month, ano: year }
        };
    }

    if (intent === 'maior_menor_gasto') {
        const minRow = db.prepare(`
            SELECT date_text, description, category, subcategory, value
            FROM expenses
            WHERE user_id = ? AND month = ? AND year = ?
            ORDER BY value ASC
            LIMIT 1
        `).get(userId, month, year);
        const maxRow = db.prepare(`
            SELECT date_text, description, category, subcategory, value
            FROM expenses
            WHERE user_id = ? AND month = ? AND year = ?
            ORDER BY value DESC
            LIMIT 1
        `).get(userId, month, year);
        return {
            results: {
                min: minRow ? [minRow.date_text, minRow.description, minRow.category, minRow.subcategory, minRow.value] : null,
                max: maxRow ? [maxRow.date_text, maxRow.description, maxRow.category, maxRow.subcategory, maxRow.value] : null
            },
            details: { mes: month, ano: year }
        };
    }

    if (intent === 'maior_menor_gasto_categoria') {
        const rows = db.prepare(`
            SELECT date_text, description, category, subcategory, value
            FROM expenses
            WHERE user_id = ? AND month = ? AND year = ?
        `).all(userId, month, year).filter(expenseMatchesCategory);
        const sorted = rows.slice().sort((a, b) => Number(a.value || 0) - Number(b.value || 0));
        const minRow = sorted[0];
        const maxRow = sorted[sorted.length - 1];
        return {
            results: {
                min: minRow ? [minRow.date_text, minRow.description, minRow.category, minRow.subcategory, minRow.value] : null,
                max: maxRow ? [maxRow.date_text, maxRow.description, maxRow.category, maxRow.subcategory, maxRow.value] : null
            },
            details: { categoria: categoriaRaw, mes: month, ano: year }
        };
    }

    return null;
}

function parseIsoMonthKey(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-\d{2}$/);
    if (!match) return null;
    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10) - 1;
    if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
    return year * 12 + month;
}

function sqlDateExpression(column = 'date_text') {
    return `date(substr(${column}, 7, 4) || '-' || substr(${column}, 4, 2) || '-' || substr(${column}, 1, 2))`;
}

function planNeedsFutureCardRows(plan = {}) {
    if (plan.domain !== 'cards') return false;
    const status = normalizeText(plan.filters?.status || '');
    const isInstallmentStatus = status.includes('installment') ||
        status.includes('parcel') ||
        status.includes('ativo') ||
        status.includes('aberto');
    const isOpenCardRanking = plan.operation === 'rank' &&
        Array.isArray(plan.groupBy) &&
        plan.groupBy.includes('card') &&
        !plan.filters?.category &&
        !plan.filters?.merchant;
    return plan.operation === 'forecast' || isInstallmentStatus || isOpenCardRanking;
}

function planNeedsPreviousPeriodRows(plan = {}) {
    const period = plan.filters?.period || {};
    return plan.operation === 'compare' &&
        Number.isInteger(period.month) &&
        Number.isInteger(period.year) &&
        ['expenses', 'cards', 'income', 'transfers'].includes(plan.domain);
}

function previousMonthKey(year, month) {
    const previous = new Date(year, month - 1, 1, 12, 0, 0, 0);
    return previous.getFullYear() * 12 + previous.getMonth();
}

function buildFinancialQuerySqlWhere(plan = {}, { allUsers = false, scopeUserIds = [] } = {}) {
    const where = [];
    const params = [];

    if (!allUsers) {
        where.push(`user_id IN (${scopeUserIds.map(() => '?').join(', ')})`);
        params.push(...scopeUserIds);
    }

    if (plan.domain === 'cards') {
        where.push("source_type = 'cartao'");
    } else if (plan.domain === 'expenses') {
        where.push("source_type IN ('saida', 'cartao')");
    }

    const period = plan.filters?.period || {};
    const month = Number.isInteger(period.month) ? period.month : null;
    const year = Number.isInteger(period.year) ? period.year : null;
    const usesTransactionDate = plan.timeBasis === 'transaction_date';
    const needsFutureCards = planNeedsFutureCardRows(plan);

    if (month !== null && year !== null) {
        if (planNeedsPreviousPeriodRows(plan)) {
            const previousKey = previousMonthKey(year, month);
            const currentKey = year * 12 + month;
            if (usesTransactionDate) {
                const previousStart = new Date(Math.floor(previousKey / 12), previousKey % 12, 1, 12, 0, 0, 0);
                const currentEnd = new Date(year, month + 1, 0, 12, 0, 0, 0);
                where.push(`${sqlDateExpression()} >= date(?)`);
                where.push(`${sqlDateExpression()} <= date(?)`);
                params.push(formatIsoDate(previousStart), formatIsoDate(currentEnd));
            } else {
                where.push('(year * 12 + month) >= ?');
                where.push('(year * 12 + month) <= ?');
                params.push(previousKey, currentKey);
            }
        } else if (usesTransactionDate) {
            where.push(`CAST(substr(date_text, 7, 4) AS INTEGER) = ?`);
            where.push(`CAST(substr(date_text, 4, 2) AS INTEGER) = ?`);
            params.push(year, month + 1);
        } else if (needsFutureCards) {
            where.push('(year * 12 + month) >= ?');
            params.push(year * 12 + month);
        } else {
            where.push('year = ?');
            where.push('month = ?');
            params.push(year, month);
        }
    } else if (period.from || period.to) {
        if (usesTransactionDate) {
            if (period.from) {
                where.push(`${sqlDateExpression()} >= date(?)`);
                params.push(period.from);
            }
            if (period.to) {
                where.push(`${sqlDateExpression()} <= date(?)`);
                params.push(period.to);
            }
        } else {
            const fromKey = parseIsoMonthKey(period.from);
            const toKey = parseIsoMonthKey(period.to);
            if (fromKey !== null) {
                where.push('(year * 12 + month) >= ?');
                params.push(fromKey);
            }
            if (toKey !== null && !needsFutureCards) {
                where.push('(year * 12 + month) <= ?');
                params.push(toKey);
            }
        }
    }

    return {
        clause: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
        params
    };
}

function buildDebtFinancialQuerySqlWhere(plan = {}, { allUsers = false, scopeUserIds = [], currentDate = '' } = {}) {
    const where = [];
    const params = [];

    if (!allUsers) {
        where.push(`user_id IN (${scopeUserIds.map(() => '?').join(', ')})`);
        params.push(...scopeUserIds);
    }

    const period = plan.filters?.period || {};
    const nextDueExpression = sqlDateExpression('next_due');
    const missingNextDue = `(next_due IS NULL OR trim(next_due) = '')`;
    const month = Number.isInteger(period.month) ? period.month : null;
    const year = Number.isInteger(period.year) ? period.year : null;

    if (month !== null && year !== null) {
        where.push(`(${missingNextDue} OR (CAST(substr(next_due, 7, 4) AS INTEGER) = ? AND CAST(substr(next_due, 4, 2) AS INTEGER) = ?))`);
        params.push(year, month + 1);
    } else if (period.from || period.to) {
        if (period.from) {
            where.push(`(${missingNextDue} OR ${nextDueExpression} >= date(?))`);
            params.push(period.from);
        }
        if (period.to) {
            where.push(`(${missingNextDue} OR ${nextDueExpression} <= date(?))`);
            params.push(period.to);
        }
    }

    const status = normalizeText(plan.filters?.status || '');
    const referenceDate = parseSheetDate(currentDate) || new Date();
    const referenceIso = formatIsoDate(referenceDate);
    if (status.includes('overdue') || status.includes('atras')) {
        where.push(`(${missingNextDue} OR COALESCE(overdue_days, 0) > 0 OR ${nextDueExpression} < date(?))`);
        params.push(referenceIso);
    } else if ((status.includes('upcoming') || status.includes('venc')) && period.type === 'relative') {
        const days = Number.parseInt(period.days || period.amount || period.value || '10', 10) || 10;
        const toDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() + days, 12, 0, 0, 0);
        where.push(`(${missingNextDue} OR ${nextDueExpression} >= date(?))`);
        where.push(`(${missingNextDue} OR ${nextDueExpression} <= date(?))`);
        params.push(referenceIso, formatIsoDate(toDate));
    }

    return {
        clause: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
        params
    };
}

function buildTransferenciasDataSource(rows = []) {
    const transferencias = [
        ['Data', 'Descrição', 'Valor', 'Origem', 'Destino', 'Método', 'Observações', 'Status', 'user_id']
    ];
    rows.forEach((row) => {
        transferencias.push([
            row.date_text || '',
            row.description || '',
            Number(row.value || 0),
            row.origin || '',
            row.destination || '',
            row.method || '',
            row.notes || '',
            row.status || '',
            row.user_id || ''
        ]);
    });
    return transferencias;
}

function buildEntradasDataSource(rows = []) {
    const entradas = [
        ['Data', 'Descrição', 'Categoria', 'Valor', 'Responsável', 'Recebimento', 'Recorrente', 'Obs', 'user_id']
    ];
    rows.forEach((row) => {
        entradas.push([
            row.date_text || '',
            row.description || '',
            row.category || '',
            Number(row.value || 0),
            '',
            row.payment_method || '',
            row.recurrence || '',
            '',
            row.user_id || ''
        ]);
    });
    return entradas;
}

function buildDividasDataSource(rows = []) {
    const dividas = [
        ['Nome', 'Credor', 'Tipo', 'Valor Original', 'Saldo Atual', 'Parcela', 'Juros', 'Vencimento', 'Início', 'Total Parcelas', 'Status', 'Responsável', 'Observações', '% Quitado', 'Próximo Vencimento', 'Atraso (Dias)', 'Data Prevista para Quitação', 'user_id']
    ];
    rows.forEach((row) => {
        dividas.push([
            row.name || '',
            row.creditor || '',
            row.debt_type || '',
            Number(row.original_value || 0),
            Number(row.saldo_atual || 0),
            Number(row.installment_value || 0),
            Number(row.juros_pct || 0),
            row.due_day || '',
            row.start_date || '',
            Number(row.total_installments || 0),
            row.status || '',
            row.responsible || '',
            row.notes || '',
            Number(row.progress_pct || 0),
            row.next_due || '',
            Number(row.overdue_days || 0),
            row.payoff_date || '',
            row.user_id || ''
        ]);
    });
    return dividas;
}

function formatIsoDate(date) {
    if (!(date instanceof Date)) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseBudgetReferenceDate(value) {
    const parsed = parseSheetDate(value);
    if (parsed) return parsed;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
}

function buildUserSettingsDataSource(rows = []) {
    const userSettings = [
        ['user_id', 'monthly_budget_enabled', 'monthly_budget_amount', 'monthly_budget_scope', 'monthly_budget_cycle_start_day']
    ];
    rows.forEach((row) => {
        userSettings.push([
            row.user_id || '',
            row.monthly_budget_enabled || '',
            Number(row.monthly_budget_amount || 0),
            row.monthly_budget_scope || 'personal',
            row.monthly_budget_cycle_start_day || 1
        ]);
    });
    return userSettings;
}

function buildCardConfigsDataSource(rows = []) {
    const cartoesConfig = [
        ['card_id', 'Nome', 'Banco', 'Dia de Fechamento', 'Dia de Vencimento', 'Ativo', 'Observações']
    ];
    rows.forEach((row) => {
        cartoesConfig.push([
            row.card_id || '',
            row.name || '',
            '',
            '',
            row.due_day || 1,
            row.active || 'SIM',
            ''
        ]);
    });
    return cartoesConfig;
}

function queryBudgetFinancialQueryDataSourcesSql(plan, { userId, userIds, currentDate } = {}) {
    const requestedUserIds = Array.isArray(userIds)
        ? userIds.map(value => String(value || '').trim()).filter(Boolean)
        : [];
    const scopeUserIds = requestedUserIds.length > 0
        ? Array.from(new Set(requestedUserIds))
        : [String(userId || '').trim()].filter(Boolean);
    if (scopeUserIds.length === 0) return null;

    const settingsPlaceholders = scopeUserIds.map(() => '?').join(', ');
    const settingsRows = db.prepare(`
        SELECT user_id, monthly_budget_enabled, monthly_budget_amount, monthly_budget_scope, monthly_budget_cycle_start_day
        FROM budget_settings
        WHERE user_id IN (${settingsPlaceholders})
        ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END
    `).all(...scopeUserIds, String(userId || '').trim());
    const requestedScope = normalizeText(plan.filters?.scope || '');
    const activeSettingsRows = settingsRows.filter(row =>
        normalizeText(row.monthly_budget_enabled || '') === 'sim' &&
        Number(row.monthly_budget_amount || 0) > 0
    );
    const activeSettings = requestedScope
        ? activeSettingsRows.find(row => normalizeText(row.monthly_budget_scope || '') === requestedScope)
        : (
            scopeUserIds.length > 1
                ? activeSettingsRows.find(row => normalizeText(row.monthly_budget_scope || '') === 'family') || activeSettingsRows[0]
                : activeSettingsRows[0]
        );
    const cycleSettings = activeSettings ||
        settingsRows.find(row => normalizeText(row.monthly_budget_scope || '') === requestedScope) ||
        settingsRows[0] ||
        { monthly_budget_cycle_start_day: 1 };
    const cycleStartDay = normalizeCycleStartDay(cycleSettings.monthly_budget_cycle_start_day || 1);
    const referenceDate = parseBudgetReferenceDate(currentDate);
    const referenceParts = {
        year: referenceDate.getFullYear(),
        month: referenceDate.getMonth(),
        day: referenceDate.getDate()
    };
    const period = plan.filters?.period || {};
    const cycle = period.type === 'month' && Number.isInteger(period.month) && Number.isInteger(period.year)
        ? getBudgetCycleForPeriod(period, cycleStartDay, referenceParts)
        : getBudgetCycleForDate(referenceParts, cycleStartDay);
    const startIso = formatIsoDate(cycle.start);
    const endIso = formatIsoDate(cycle.end);
    const startKey = cycle.start.getFullYear() * 12 + cycle.start.getMonth();
    const endKey = cycle.end.getFullYear() * 12 + cycle.end.getMonth();

    const userPlaceholders = scopeUserIds.map(() => '?').join(', ');
    const expenseRows = db.prepare(`
        SELECT user_id, source_type, source_name, date_text, year, month, description, category, subcategory, value, card_id, card_name, installment_text
        FROM expenses
        WHERE user_id IN (${userPlaceholders})
          AND (
            (source_type = 'saida' AND ${sqlDateExpression()} >= date(?) AND ${sqlDateExpression()} <= date(?))
            OR
            (source_type = 'cartao' AND (year * 12 + month) >= ? AND (year * 12 + month) <= ?)
          )
        ORDER BY year DESC, month DESC, date_text DESC
    `).all(...scopeUserIds, startIso, endIso, startKey, endKey);

    const cardConfigRows = db.prepare(`
        SELECT card_id, name, due_day, active
        FROM card_configs
        ORDER BY name ASC, card_id ASC
    `).all();

    return {
        ...buildExpensesDataSourcesFromRows(expenseRows),
        userSettings: buildUserSettingsDataSource(settingsRows),
        cartoesConfig: buildCardConfigsDataSource(cardConfigRows),
        scopeUserIds,
        currentDate: currentDate || ''
    };
}

function queryFinancialQueryDataSourcesSql(plan, { userId, userIds, currentDate } = {}) {
    if (!sqliteReady || !db || !plan || !['expenses', 'cards', 'income', 'transfers', 'budget', 'goals', 'debts', 'bills'].includes(plan.domain)) return null;

    if (plan.domain === 'budget') {
        return queryBudgetFinancialQueryDataSourcesSql(plan, { userId, userIds, currentDate });
    }

    const requestedUserIds = Array.isArray(userIds)
        ? userIds.map(value => String(value || '').trim()).filter(Boolean)
        : [];
    const scopeUserIds = requestedUserIds.length > 0
        ? Array.from(new Set(requestedUserIds))
        : [String(userId || '').trim()].filter(Boolean);
    const allUsers = isAllUsersScope(userId) || scopeUserIds.includes(ALL_USERS_ID);
    if (!allUsers && scopeUserIds.length === 0) return null;

    if (plan.domain === 'bills') {
        const ownerClause = allUsers ? '1 = 1' : `user_id IN (${scopeUserIds.map(() => '?').join(', ')})`;
        const ownerParams = allUsers ? [] : scopeUserIds;
        const billRows = db.prepare(`
            SELECT user_id, account_name, friendly_name, due_day, notes, category, subcategory, expected_value, rule_active
            FROM recurring_bills
            WHERE ${ownerClause}
            ORDER BY due_day ASC, friendly_name ASC, account_name ASC
        `).all(...ownerParams);
        const referenceDate = parseSheetDate(currentDate) || new Date();
        const period = plan.filters?.period || {};
        let start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 12, 0, 0, 0);
        let end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 12, 0, 0, 0);
        if (Number.isInteger(period.month) && Number.isInteger(period.year)) {
            start = new Date(period.year, period.month, 1, 12, 0, 0, 0);
            end = new Date(period.year, period.month + 1, 0, 12, 0, 0, 0);
        } else if (period.from || period.to) {
            start = parseSheetDate(period.from) || start;
            end = parseSheetDate(period.to) || start;
        } else if (period.type === 'relative') {
            const days = Math.max(1, Number.parseInt(period.days || '7', 10) || 7);
            const offset = period.label === 'tomorrow' ? 1 : 0;
            start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() + offset, 12, 0, 0, 0);
            end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days - 1, 12, 0, 0, 0);
        } else if (period.type === 'today') {
            start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 12, 0, 0, 0);
            end = start;
        }
        const expenseRows = db.prepare(`
            SELECT user_id, source_type, source_name, date_text, year, month, description, category, subcategory, value, card_id, card_name, installment_text
            FROM expenses
            WHERE ${ownerClause} AND source_type = 'saida'
              AND ${sqlDateExpression()} >= date(?)
              AND ${sqlDateExpression()} <= date(?)
            ORDER BY date_text DESC
        `).all(...ownerParams, formatIsoDate(new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, 0)), formatIsoDate(new Date(end.getFullYear(), end.getMonth() + 1, 0, 12, 0, 0, 0)));
        return {
            ...buildExpensesDataSourcesFromRows(expenseRows),
            contas: [
                ['Nome da Conta', 'Dia do Vencimento', 'Observações', 'user_id', 'Nome Amigável', 'Categoria', 'Subcategoria', 'Valor Esperado', 'Regra Ativa'],
                ...billRows.map(row => [
                    row.account_name || '',
                    row.due_day || '',
                    row.notes || '',
                    row.user_id || '',
                    row.friendly_name || '',
                    row.category || '',
                    row.subcategory || '',
                    Number(row.expected_value || 0),
                    row.rule_active || ''
                ])
            ],
            scopeUserIds: allUsers ? billRows.map(row => String(row.user_id || '')) : scopeUserIds,
            currentDate: currentDate || ''
        };
    }

    if (plan.domain === 'goals') {
        const ownerClause = allUsers ? '1 = 1' : `user_id IN (${scopeUserIds.map(() => '?').join(', ')})`;
        const visibilityClause = allUsers ? '1 = 1' : "(user_id = ? OR lower(COALESCE(scope, '')) IN ('family', 'familiar'))";
        const ownerParams = allUsers ? [] : [...scopeUserIds, String(userId || '')];
        const goalRows = db.prepare(`
            SELECT user_id, name, target, current, progress_pct, status, priority, scope, last_movement
            FROM goals
            WHERE ${ownerClause} AND ${visibilityClause}
            ORDER BY name ASC
        `).all(...ownerParams);
        const visibleGoalKeys = new Set(goalRows.map(row => `${String(row.user_id)}|${normalizeText(row.name)}`));
        const movementOwnerClause = allUsers ? '1 = 1' : `goal_user_id IN (${scopeUserIds.map(() => '?').join(', ')})`;
        const movementRows = db.prepare(`
            SELECT user_id, goal_user_id, date_text, goal_name, movement_type, value, value_before, value_after, notes, responsible
            FROM goal_movements
            WHERE ${movementOwnerClause}
            ORDER BY date_text DESC
        `).all(...(allUsers ? [] : scopeUserIds))
            .filter(row => visibleGoalKeys.has(`${String(row.goal_user_id)}|${normalizeText(row.goal_name)}`));

        return {
            metas: [
                ['Nome da Meta', 'Valor Alvo', 'Valor Atual', '% Progresso', 'Valor Mensal Sugerido', 'Data Alvo', 'Status', 'Prioridade', 'user_id', 'Escopo', 'Última Movimentação'],
                ...goalRows.map(row => [row.name, row.target, row.current, row.progress_pct, 0, '', row.status, row.priority, row.user_id, row.scope, row.last_movement])
            ],
            movimentacoesMetas: [
                ['Data', 'Meta', 'Tipo', 'Valor', 'Valor Antes', 'Valor Depois', 'Observação', 'Responsável', 'user_id', 'goal_user_id'],
                ...movementRows.map(row => [row.date_text, row.goal_name, row.movement_type, row.value, row.value_before, row.value_after, row.notes, row.responsible, row.goal_user_id, row.goal_user_id])
            ]
        };
    }

    if (plan.domain === 'debts') {
        const debtFilter = buildDebtFinancialQuerySqlWhere(plan, { allUsers, scopeUserIds, currentDate });
        const debtRows = db.prepare(`
            SELECT
                user_id, name, creditor, debt_type, original_value, saldo_atual,
                installment_value, juros_pct, due_day, start_date, total_installments,
                status, responsible, notes, progress_pct, next_due, overdue_days, payoff_date
            FROM debts
            ${debtFilter.clause}
            ORDER BY saldo_atual DESC, name ASC
        `).all(...debtFilter.params);

        return {
            dividas: buildDividasDataSource(debtRows),
            scopeUserIds: allUsers ? [] : scopeUserIds,
            currentDate: currentDate || ''
        };
    }

    const sqlFilter = buildFinancialQuerySqlWhere(plan, { allUsers, scopeUserIds });
    if (plan.domain === 'income') {
        const rows = db.prepare(`
            SELECT user_id, date_text, year, month, description, category, value, payment_method, recurrence
            FROM entries
            ${sqlFilter.clause}
            ORDER BY year DESC, month DESC, date_text DESC
        `).all(...sqlFilter.params);

        return {
            entradas: buildEntradasDataSource(rows),
            saidas: [['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id']],
            cartoes: [[['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Observações', 'user_id']]],
            scopeUserIds: allUsers ? [] : scopeUserIds,
            currentDate: currentDate || ''
        };
    }

    if (plan.domain === 'transfers') {
        const transferRows = db.prepare(`
            SELECT user_id, date_text, year, month, description, value, origin, destination, method, notes, status
            FROM transfers
            ${sqlFilter.clause}
            ORDER BY year DESC, month DESC, date_text DESC
        `).all(...sqlFilter.params);

        const entryRows = db.prepare(`
            SELECT user_id, date_text, year, month, description, category, value, payment_method, recurrence
            FROM entries
            ${sqlFilter.clause}
            ORDER BY year DESC, month DESC, date_text DESC
        `).all(...sqlFilter.params);

        const expenseRows = db.prepare(`
            SELECT user_id, source_type, source_name, date_text, year, month, description, category, subcategory, value, card_id, card_name, installment_text
            FROM expenses
            ${buildFinancialQuerySqlWhere({ ...plan, domain: 'expenses', timeBasis: 'billing_month' }, { allUsers, scopeUserIds }).clause}
            ORDER BY year DESC, month DESC, date_text DESC
        `).all(...buildFinancialQuerySqlWhere({ ...plan, domain: 'expenses', timeBasis: 'billing_month' }, { allUsers, scopeUserIds }).params);

        const expenseSources = buildExpensesDataSourcesFromRows(expenseRows);
        return {
            ...expenseSources,
            entradas: buildEntradasDataSource(entryRows),
            transferencias: buildTransferenciasDataSource(transferRows),
            scopeUserIds: allUsers ? [] : scopeUserIds,
            currentDate: currentDate || ''
        };
    }

    const rows = db.prepare(`
        SELECT user_id, source_type, source_name, date_text, year, month, description, category, subcategory, value, card_id, card_name, installment_text
        FROM expenses
        ${sqlFilter.clause}
        ORDER BY year DESC, month DESC, date_text DESC
    `).all(...sqlFilter.params);

    return {
        ...buildExpensesDataSourcesFromRows(rows),
        scopeUserIds: allUsers ? [] : scopeUserIds,
        currentDate: currentDate || ''
    };
}

function buildExpensesDataSourcesFromRows(rows = []) {
    const saidas = [
        ['Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor', 'Responsável', 'Pagamento', 'Recorrente', 'Obs', 'user_id']
    ];
    const cartoes = [[
        ['Data', 'Descrição', 'Categoria', 'Valor Parcela', 'Parcela', 'Mês de Cobrança', 'card_id', 'Cartão', 'Observações', 'user_id']
    ]];

    rows.forEach((row) => {
        if (row.source_type === 'cartao') {
            const monthIndex = Number(row.month || 0);
            const billingMonth = `${MONTH_NAMES_PT[monthIndex] || ''} de ${row.year}`;
            cartoes[0].push([
                row.date_text || '',
                row.description || '',
                row.category || '',
                Number(row.value || 0),
                row.installment_text || '',
                billingMonth,
                row.card_id || row.source_name || '',
                row.card_name || row.source_name || '',
                '',
                row.user_id || ''
            ]);
            return;
        }

        saidas.push([
            row.date_text || '',
            row.description || '',
            row.category || '',
            row.subcategory || '',
            Number(row.value || 0),
            '',
            '',
            '',
            '',
            row.user_id || ''
        ]);
    });

    return { saidas, cartoes };
}

function isSqliteReady() {
    return sqliteReady;
}

function getSqliteStats() {
    if (!sqliteReady || !db) return { ready: false };
    const expenses = db.prepare('SELECT COUNT(*) AS c FROM expenses').get()?.c || 0;
    const entries = db.prepare('SELECT COUNT(*) AS c FROM entries').get()?.c || 0;
    const transfers = db.prepare('SELECT COUNT(*) AS c FROM transfers').get()?.c || 0;
    const budgetSettings = db.prepare('SELECT COUNT(*) AS c FROM budget_settings').get()?.c || 0;
    const cardConfigs = db.prepare('SELECT COUNT(*) AS c FROM card_configs').get()?.c || 0;
    const goals = db.prepare('SELECT COUNT(*) AS c FROM goals').get()?.c || 0;
    const goalMovements = db.prepare('SELECT COUNT(*) AS c FROM goal_movements').get()?.c || 0;
    const debts = db.prepare('SELECT COUNT(*) AS c FROM debts').get()?.c || 0;
    const recurringBills = db.prepare('SELECT COUNT(*) AS c FROM recurring_bills').get()?.c || 0;
    const financialAccounts = db.prepare('SELECT COUNT(*) AS c FROM financial_accounts').get()?.c || 0;
    const financialEventsPublic = db.prepare('SELECT COUNT(*) AS c FROM financial_events_public').get()?.c || 0;
    const syncAt = db.prepare("SELECT value FROM sync_meta WHERE key = 'last_sync_at'").get()?.value || '';
    return { ready: true, expenses, entries, transfers, budgetSettings, cardConfigs, goals, goalMovements, debts, recurringBills, financialAccounts, financialEventsPublic, lastSyncAt: syncAt };
}

function queryFinancialEventsPublicRows({ userIds = [], personByUserId = {} } = {}) {
    if (!ensureSqliteReady() || !db) return [];
    const ids = Array.from(new Set((userIds || []).map(id => String(id || '').trim()).filter(Boolean)));
    if (ids.length === 0) return [];
    const ownerHashes = ids.map(hashOwnerId);
    const ownerHashToPerson = new Map(ids.map((id) => [hashOwnerId(id), String(personByUserId[id] || '').trim() || 'Usuario']));
    const placeholders = ownerHashes.map(() => '?').join(', ');
    const rows = db.prepare(`
        SELECT
            rowid AS insertion_order,
            owner_hash, date_text, iso_date, year, month, weekday, event_type,
            amount, description, category, subcategory, person, payment_method,
            card, billing_month, due_date, source
        FROM financial_events_public
        WHERE owner_hash IN (${placeholders})
        ORDER BY iso_date DESC, date_text DESC, insertion_order DESC
    `).all(...ownerHashes);

    return rows.map((row) => ({
        date: row.date_text || '',
        iso_date: row.iso_date || '',
        year: row.year,
        month: row.month,
        weekday: row.weekday || '',
        event_type: row.event_type || '',
        amount: Number(row.amount || 0),
        description: row.description || '',
        category: row.category || '',
        subcategory: row.subcategory || '',
        person: row.person || ownerHashToPerson.get(row.owner_hash) || 'Usuario',
        payment_method: row.payment_method || '',
        card: row.card || '',
        billing_month: row.billing_month || '',
        due_date: row.due_date || '',
        source: row.source || '',
        insertion_order: Number(row.insertion_order || 0)
    }));
}

module.exports = {
    ALL_USERS_ID,
    ensureSqliteReady,
    syncSnapshotToSqlite,
    queryFinancialEventsPublicRows,
    queryFinancialAccounts,
    queryAnalyticalIntentSql,
    queryFinancialQueryDataSourcesSql,
    queryKpis,
    queryTopCategories,
    queryCashflow,
    queryDebts,
    queryGoals,
    queryRecentTransactions,
    queryAlerts,
    isSqliteReady,
    getSqliteStats
};
