const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

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

let db = null;
let sqliteReady = false;
let currentSyncId = 0;

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function makeFingerprint(parts) {
    const payload = JSON.stringify(parts);
    return crypto.createHash('sha1').update(payload).digest('hex');
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
            last_seen_sync INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_entries_user_period ON entries(user_id, year, month);

        CREATE TABLE IF NOT EXISTS goals (
            fingerprint TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT,
            target REAL,
            current REAL,
            progress_pct REAL,
            last_seen_sync INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_goals_user ON goals(user_id);

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

        CREATE TABLE IF NOT EXISTS sync_meta (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);
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
    const cartoes = Array.isArray(snapshot?.cartoes) ? snapshot.cartoes : [];
    const metas = Array.isArray(snapshot?.metas) ? snapshot.metas : [];
    const dividas = Array.isArray(snapshot?.dividas) ? snapshot.dividas : [];

    currentSyncId = Date.now();

    const upsertExpense = db.prepare(`
        INSERT INTO expenses(fingerprint, user_id, source_type, source_name, date_text, year, month, description, category, subcategory, value, last_seen_sync)
        VALUES(@fingerprint, @user_id, @source_type, @source_name, @date_text, @year, @month, @description, @category, @subcategory, @value, @last_seen_sync)
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
            last_seen_sync = excluded.last_seen_sync
    `);

    const upsertEntry = db.prepare(`
        INSERT INTO entries(fingerprint, user_id, date_text, year, month, description, category, value, last_seen_sync)
        VALUES(@fingerprint, @user_id, @date_text, @year, @month, @description, @category, @value, @last_seen_sync)
        ON CONFLICT(fingerprint) DO UPDATE SET
            user_id = excluded.user_id,
            date_text = excluded.date_text,
            year = excluded.year,
            month = excluded.month,
            description = excluded.description,
            category = excluded.category,
            value = excluded.value,
            last_seen_sync = excluded.last_seen_sync
    `);

    const upsertGoal = db.prepare(`
        INSERT INTO goals(fingerprint, user_id, name, target, current, progress_pct, last_seen_sync)
        VALUES(@fingerprint, @user_id, @name, @target, @current, @progress_pct, @last_seen_sync)
        ON CONFLICT(fingerprint) DO UPDATE SET
            user_id = excluded.user_id,
            name = excluded.name,
            target = excluded.target,
            current = excluded.current,
            progress_pct = excluded.progress_pct,
            last_seen_sync = excluded.last_seen_sync
    `);

    const upsertDebt = db.prepare(`
        INSERT INTO debts(fingerprint, user_id, name, creditor, status, saldo_atual, juros_pct, next_due, last_seen_sync)
        VALUES(@fingerprint, @user_id, @name, @creditor, @status, @saldo_atual, @juros_pct, @next_due, @last_seen_sync)
        ON CONFLICT(fingerprint) DO UPDATE SET
            user_id = excluded.user_id,
            name = excluded.name,
            creditor = excluded.creditor,
            status = excluded.status,
            saldo_atual = excluded.saldo_atual,
            juros_pct = excluded.juros_pct,
            next_due = excluded.next_due,
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
                last_seen_sync: currentSyncId
            });
        }

        for (const item of cartoes) {
            const fingerprint = makeFingerprint(['cartao', item.user_id, item.source, item.data, item.descricao, item.categoria, item.valor, item.month, item.year]);
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
                last_seen_sync: currentSyncId
            });
        }

        for (const item of metas) {
            const row = item.row || [];
            const target = Number(row[1] || 0);
            const current = Number(row[2] || 0);
            const progressPct = target > 0 ? Math.min(100, (current / target) * 100) : Number(row[3] || 0);
            const fingerprint = makeFingerprint(['meta', item.user_id, row[0], target, current]);
            upsertGoal.run({
                fingerprint,
                user_id: item.user_id,
                name: row[0] || 'Meta',
                target,
                current,
                progress_pct: progressPct,
                last_seen_sync: currentSyncId
            });
        }

        for (const item of dividas) {
            const row = item.row || [];
            const fingerprint = makeFingerprint(['divida', item.user_id, row[0], row[1], row[4], row[10]]);
            upsertDebt.run({
                fingerprint,
                user_id: item.user_id,
                name: row[0] || 'Dívida',
                creditor: row[1] || '',
                status: row[10] || '',
                saldo_atual: Number(row[4] || 0),
                juros_pct: Number(row[6] || 0),
                next_due: row[14] || '',
                last_seen_sync: currentSyncId
            });
        }

        db.prepare('DELETE FROM expenses WHERE last_seen_sync < ?').run(currentSyncId);
        db.prepare('DELETE FROM entries WHERE last_seen_sync < ?').run(currentSyncId);
        db.prepare('DELETE FROM goals WHERE last_seen_sync < ?').run(currentSyncId);
        db.prepare('DELETE FROM debts WHERE last_seen_sync < ?').run(currentSyncId);
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

function queryKpis(userId, { month, year } = {}) {
    if (!sqliteReady || !db) return null;
    const m = normalizeMonthParam(month);
    const y = normalizeYearParam(year);

    const entradas = db.prepare('SELECT COALESCE(SUM(value), 0) AS total FROM entries WHERE user_id = ? AND month = ? AND year = ?').get(userId, m, y).total || 0;
    const saidas = db.prepare("SELECT COALESCE(SUM(value), 0) AS total FROM expenses WHERE user_id = ? AND month = ? AND year = ? AND source_type = 'saida'").get(userId, m, y).total || 0;
    const cartoes = db.prepare("SELECT COALESCE(SUM(value), 0) AS total FROM expenses WHERE user_id = ? AND month = ? AND year = ? AND source_type = 'cartao'").get(userId, m, y).total || 0;
    const debt = db.prepare(`
        SELECT
            COUNT(*) AS active_count,
            COALESCE(SUM(saldo_atual), 0) AS total
        FROM debts
        WHERE user_id = ?
        AND lower(COALESCE(status, '')) NOT LIKE '%quitad%'
        AND lower(COALESCE(status, '')) NOT LIKE '%pago%'
        AND lower(COALESCE(status, '')) NOT LIKE '%finalizad%'
    `).get(userId);

    return {
        period: { month: m, year: y },
        entradas,
        saidas,
        cartoes,
        saldo: entradas - (saidas + cartoes),
        debtActiveCount: Number(debt?.active_count || 0),
        debtTotal: Number(debt?.total || 0)
    };
}

function queryTopCategories(userId, { month, year } = {}) {
    if (!sqliteReady || !db) return null;
    const m = normalizeMonthParam(month);
    const y = normalizeYearParam(year);
    return db.prepare(`
        SELECT category, COALESCE(SUM(value), 0) AS value
        FROM expenses
        WHERE user_id = ? AND month = ? AND year = ?
        GROUP BY category
        ORDER BY value DESC
        LIMIT 8
    `).all(userId, m, y);
}

function queryCashflow(userId, { month, year } = {}) {
    if (!sqliteReady || !db) return null;
    const m = normalizeMonthParam(month);
    const y = normalizeYearParam(year);

    const entries = db.prepare(`
        SELECT date_text AS date, COALESCE(SUM(value), 0) AS value
        FROM entries
        WHERE user_id = ? AND month = ? AND year = ?
        GROUP BY date_text
    `).all(userId, m, y);

    const expenses = db.prepare(`
        SELECT date_text AS date, COALESCE(SUM(value), 0) AS value
        FROM expenses
        WHERE user_id = ? AND month = ? AND year = ?
        GROUP BY date_text
    `).all(userId, m, y);

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
    return Array.from(map.values()).slice(-31);
}

function queryDebts(userId) {
    if (!sqliteReady || !db) return null;
    return db.prepare(`
        SELECT name, creditor, status, saldo_atual AS saldoAtual, juros_pct AS jurosPct, next_due AS nextDue
        FROM debts
        WHERE user_id = ?
        ORDER BY saldo_atual DESC
        LIMIT 20
    `).all(userId);
}

function queryGoals(userId) {
    if (!sqliteReady || !db) return null;
    return db.prepare(`
        SELECT name, target, current, progress_pct AS progressPct
        FROM goals
        WHERE user_id = ?
        ORDER BY progress_pct DESC
        LIMIT 20
    `).all(userId);
}

function queryRecentTransactions(userId, { month, year } = {}) {
    if (!sqliteReady || !db) return null;
    const m = normalizeMonthParam(month);
    const y = normalizeYearParam(year);

    const recentEntries = db.prepare(`
        SELECT date_text AS date, description, category, value, 'entrada' AS type
        FROM entries
        WHERE user_id = ? AND month = ? AND year = ?
    `).all(userId, m, y);

    const recentExpenses = db.prepare(`
        SELECT date_text AS date, description, category, value, source_type AS type
        FROM expenses
        WHERE user_id = ? AND month = ? AND year = ?
    `).all(userId, m, y);

    return [...recentEntries, ...recentExpenses]
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
        .slice(0, 20);
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
    const categoriaLike = `%${categoriaRaw}%`;

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

    if (intent === 'total_gastos_categoria_mes') {
        const row = db.prepare(`
            SELECT COALESCE(SUM(value), 0) AS total
            FROM expenses
            WHERE user_id = ? AND month = ? AND year = ?
            AND (
                lower(COALESCE(category, '')) LIKE lower(?)
                OR lower(COALESCE(subcategory, '')) LIKE lower(?)
                OR lower(COALESCE(description, '')) LIKE lower(?)
            )
        `).get(userId, month, year, categoriaLike, categoriaLike, categoriaLike);

        return {
            results: Number(row?.total || 0),
            details: { categoria: categoriaRaw, mes: month, ano: year }
        };
    }

    if (intent === 'media_gastos_categoria_mes') {
        const row = db.prepare(`
            SELECT COALESCE(AVG(value), 0) AS avg_value
            FROM expenses
            WHERE user_id = ? AND month = ? AND year = ?
            AND (
                lower(COALESCE(category, '')) LIKE lower(?)
                OR lower(COALESCE(subcategory, '')) LIKE lower(?)
                OR lower(COALESCE(description, '')) LIKE lower(?)
            )
        `).get(userId, month, year, categoriaLike, categoriaLike, categoriaLike);
        return {
            results: Number(row?.avg_value || 0),
            details: { categoria: categoriaRaw, mes: month, ano: year }
        };
    }

    if (intent === 'listagem_gastos_categoria') {
        const rows = db.prepare(`
            SELECT date_text, description, category, subcategory, value
            FROM expenses
            WHERE user_id = ? AND month = ? AND year = ?
            AND (
                lower(COALESCE(category, '')) LIKE lower(?)
                OR lower(COALESCE(subcategory, '')) LIKE lower(?)
                OR lower(COALESCE(description, '')) LIKE lower(?)
            )
            ORDER BY date_text DESC
            LIMIT 100
        `).all(userId, month, year, categoriaLike, categoriaLike, categoriaLike)
            .map((row) => [row.date_text, row.description, row.category, row.subcategory, row.value]);
        return {
            results: rows,
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

    return null;
}

function isSqliteReady() {
    return sqliteReady;
}

function getSqliteStats() {
    if (!sqliteReady || !db) return { ready: false };
    const expenses = db.prepare('SELECT COUNT(*) AS c FROM expenses').get()?.c || 0;
    const entries = db.prepare('SELECT COUNT(*) AS c FROM entries').get()?.c || 0;
    const goals = db.prepare('SELECT COUNT(*) AS c FROM goals').get()?.c || 0;
    const debts = db.prepare('SELECT COUNT(*) AS c FROM debts').get()?.c || 0;
    const syncAt = db.prepare("SELECT value FROM sync_meta WHERE key = 'last_sync_at'").get()?.value || '';
    return { ready: true, expenses, entries, goals, debts, lastSyncAt: syncAt };
}

module.exports = {
    ensureSqliteReady,
    syncSnapshotToSqlite,
    queryAnalyticalIntentSql,
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

