const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const OPERATION_TYPE = 'sheet.append.marker_only';
const MARKER_PATTERN = /^TESTE_APAGAR_[A-Z0-9_]{6,96}$/;

function hash(value, length = 32) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function normalizeCell(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim().replace(/\s+/g, ' ');
}

function fingerprintRow(row = []) {
    const normalized = (Array.isArray(row) ? row : []).map(normalizeCell);
    while (normalized.length > 0 && normalized.at(-1) === '') normalized.pop();
    return hash(JSON.stringify(normalized), 24);
}

function buildFinancialUndoPolicy(env = process.env, userId = '') {
    const requestedMode = String(env.FINANCIAL_UNDO_MODE || 'off').trim().toLowerCase();
    const mode = ['off', 'canary', 'on'].includes(requestedMode) ? requestedMode : 'off';
    const scopedUserId = String(userId || '').trim();
    const allowlist = new Set(String(env.FINANCIAL_UNDO_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean));
    if (mode === 'off') return { mode, allowed: false, reason: 'mode_off' };
    if (!scopedUserId) return { mode, allowed: false, reason: 'user_required' };
    if (mode === 'canary' && !allowlist.has(scopedUserId)) return { mode, allowed: false, reason: 'user_not_allowlisted' };
    return { mode, allowed: true, reason: mode === 'on' ? 'mode_on' : 'canary_allowlisted' };
}

function undoError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
}

class FinancialUndoStore {
    constructor({ dbPath = process.env.FINANCIAL_UNDO_DB_PATH || path.resolve(process.cwd(), 'data/financial-undo.sqlite') } = {}) {
        if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS financial_undo_receipts (
                receipt_id TEXT PRIMARY KEY,
                user_hash TEXT NOT NULL,
                operation_key_hash TEXT NOT NULL,
                operation_type TEXT NOT NULL,
                sheet_name TEXT NOT NULL,
                marker TEXT NOT NULL,
                row_fingerprint TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('active','undoing','undone')),
                created_at TEXT NOT NULL,
                undone_at TEXT NOT NULL DEFAULT '',
                UNIQUE(user_hash, operation_key_hash)
            );
            CREATE TABLE IF NOT EXISTS financial_undo_audit (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                receipt_id TEXT NOT NULL,
                user_hash TEXT NOT NULL,
                operation_type TEXT NOT NULL,
                event_type TEXT NOT NULL,
                outcome TEXT NOT NULL,
                reason_code TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_financial_undo_receipts_user ON financial_undo_receipts(user_hash, created_at);
            CREATE INDEX IF NOT EXISTS idx_financial_undo_audit_user ON financial_undo_audit(user_hash, event_id);
        `);
    }

    register({ userHash, operationKeyHash, sheetName, marker, rowFingerprint }) {
        const existing = this.db.prepare(`
            SELECT * FROM financial_undo_receipts WHERE user_hash=? AND operation_key_hash=?
        `).get(userHash, operationKeyHash);
        if (existing) {
            const sameReceipt = existing.operation_type === OPERATION_TYPE
                && existing.sheet_name === sheetName
                && existing.marker === marker
                && existing.row_fingerprint === rowFingerprint;
            if (!sameReceipt) {
                throw undoError('FINANCIAL_UNDO_RECEIPT_CONFLICT', 'A chave da operação já identifica outro recibo.');
            }
            return { receipt: this.mapReceipt(existing), replayed: true };
        }
        const now = new Date().toISOString();
        const row = {
            receipt_id: crypto.randomUUID(), user_hash: userHash, operation_key_hash: operationKeyHash,
            operation_type: OPERATION_TYPE, sheet_name: sheetName, marker,
            row_fingerprint: rowFingerprint, status: 'active', created_at: now, undone_at: ''
        };
        this.db.prepare(`
            INSERT INTO financial_undo_receipts(
                receipt_id,user_hash,operation_key_hash,operation_type,sheet_name,marker,
                row_fingerprint,status,created_at,undone_at
            ) VALUES(@receipt_id,@user_hash,@operation_key_hash,@operation_type,@sheet_name,@marker,
                @row_fingerprint,@status,@created_at,@undone_at)
        `).run(row);
        this.addAudit(row, { eventType: 'register', outcome: 'registered', reasonCode: 'marker_only_receipt' });
        return { receipt: this.mapReceipt(row), replayed: false };
    }

    getForUser(receiptId, userHash) {
        const row = this.db.prepare(`SELECT * FROM financial_undo_receipts WHERE receipt_id=? AND user_hash=?`).get(receiptId, userHash);
        return row ? this.mapReceipt(row) : null;
    }

    claim(receiptId, userHash) {
        const result = this.db.prepare(`
            UPDATE financial_undo_receipts SET status='undoing'
            WHERE receipt_id=? AND user_hash=? AND status='active'
        `).run(receiptId, userHash);
        return result.changes === 1;
    }

    release(receiptId, userHash) {
        this.db.prepare(`UPDATE financial_undo_receipts SET status='active' WHERE receipt_id=? AND user_hash=? AND status='undoing'`).run(receiptId, userHash);
    }

    markUndone(receiptId, userHash) {
        this.db.prepare(`
            UPDATE financial_undo_receipts SET status='undone', undone_at=?
            WHERE receipt_id=? AND user_hash=? AND status='undoing'
        `).run(new Date().toISOString(), receiptId, userHash);
    }

    addAudit(receipt, { eventType, outcome, reasonCode }) {
        this.db.prepare(`
            INSERT INTO financial_undo_audit(receipt_id,user_hash,operation_type,event_type,outcome,reason_code,created_at)
            VALUES(?,?,?,?,?,?,?)
        `).run(receipt.receiptId || receipt.receipt_id, receipt.userHash || receipt.user_hash,
            receipt.operationType || receipt.operation_type, eventType, outcome, reasonCode, new Date().toISOString());
    }

    listAudit(userHash, limit = 20) {
        return this.db.prepare(`
            SELECT receipt_id,operation_type,event_type,outcome,reason_code,created_at
            FROM financial_undo_audit WHERE user_hash=? ORDER BY event_id DESC LIMIT ?
        `).all(userHash, Math.max(1, Math.min(100, Number(limit) || 20))).map(row => ({
            receiptId: row.receipt_id,
            operationType: row.operation_type,
            eventType: row.event_type,
            outcome: row.outcome,
            reason: row.reason_code,
            createdAt: row.created_at
        }));
    }

    mapReceipt(row) {
        return {
            receiptId: row.receipt_id, userHash: row.user_hash, operationKeyHash: row.operation_key_hash,
            operationType: row.operation_type, sheetName: row.sheet_name, marker: row.marker,
            rowFingerprint: row.row_fingerprint, status: row.status, createdAt: row.created_at,
            undoneAt: row.undone_at || ''
        };
    }

    close() { if (this.db?.open) this.db.close(); }
}

class FinancialUndoService {
    constructor({ store = new FinancialUndoStore(), env = process.env, readRows, deleteRow, isReconciled } = {}) {
        this.store = store;
        this.env = env;
        this.readRows = readRows;
        this.deleteRow = deleteRow;
        this.isReconciled = isReconciled || (async () => false);
    }

    requirePolicy(userId) {
        const policy = buildFinancialUndoPolicy(this.env, userId);
        if (!policy.allowed) throw undoError('FINANCIAL_UNDO_DISABLED', policy.reason);
        return policy;
    }

    registerMarkerAppend(input = {}) {
        const userId = String(input.userId || '').trim();
        this.requirePolicy(userId);
        const operationKey = String(input.operationKey || '').trim();
        const sheetName = String(input.sheetName || '').trim();
        const marker = String(input.marker || '').trim();
        const rowFingerprint = String(input.rowFingerprint || '').trim();
        if (!operationKey || !sheetName || !/^[a-f0-9]{24}$/.test(rowFingerprint)) {
            throw undoError('FINANCIAL_UNDO_RECEIPT_INVALID', 'Recibo incompleto.');
        }
        if (!MARKER_PATTERN.test(marker)) {
            throw undoError('FINANCIAL_UNDO_NOT_REVERSIBLE', 'Somente operações marker-only são reversíveis nesta fase.');
        }
        const result = this.store.register({
            userHash: hash(userId), operationKeyHash: hash(operationKey), sheetName, marker, rowFingerprint
        });
        return this.publicReceipt(result.receipt, { replayed: result.replayed });
    }

    async undo({ userId, receiptId } = {}) {
        const scopedUserId = String(userId || '').trim();
        this.requirePolicy(scopedUserId);
        const userHash = hash(scopedUserId);
        let receipt = this.store.getForUser(String(receiptId || '').trim(), userHash);
        if (!receipt) throw undoError('FINANCIAL_UNDO_RECEIPT_NOT_FOUND', 'Recibo não encontrado neste escopo.');
        if (receipt.status === 'undone') {
            this.store.addAudit(receipt, { eventType: 'undo', outcome: 'replayed', reasonCode: 'already_undone' });
            return this.publicReceipt(receipt, { replayed: true });
        }
        if (!this.store.claim(receipt.receiptId, userHash)) {
            throw undoError('FINANCIAL_UNDO_IN_PROGRESS', 'Outra tentativa de undo está em andamento.');
        }
        receipt = this.store.getForUser(receipt.receiptId, userHash);
        try {
            if (await this.isReconciled(receipt)) {
                return this.block(receipt, 'already_reconciled');
            }
            if (typeof this.readRows !== 'function' || typeof this.deleteRow !== 'function') {
                throw undoError('FINANCIAL_UNDO_ADAPTER_REQUIRED', 'Adaptadores de leitura e exclusão são obrigatórios.');
            }
            const rows = await this.readRows({ sheetName: receipt.sheetName, userId: scopedUserId });
            const markerMatches = (Array.isArray(rows) ? rows : []).map((row, rowIndex) => ({ row, rowIndex }))
                .filter(item => item.rowIndex > 0 && item.row.some(cell => normalizeCell(cell) === receipt.marker));
            const exactMatches = markerMatches.filter(item => fingerprintRow(item.row) === receipt.rowFingerprint);
            if (exactMatches.length === 0) return this.block(receipt, 'exact_match_not_found');
            if (exactMatches.length !== 1 || markerMatches.length !== 1) return this.block(receipt, 'multiple_exact_matches');
            const deletion = await this.deleteRow({
                sheetName: receipt.sheetName,
                rowIndex: exactMatches[0].rowIndex,
                operationKey: `financial-undo:${receipt.receiptId}`,
                userId: scopedUserId
            });
            if (!deletion?.success || deletion?.status !== 'committed') {
                this.store.release(receipt.receiptId, receipt.userHash);
                this.store.addAudit(receipt, { eventType: 'undo', outcome: 'failed', reasonCode: 'delete_not_committed' });
                return { ...this.publicReceipt(receipt), status: 'failed', reason: 'delete_not_committed' };
            }
            this.store.markUndone(receipt.receiptId, receipt.userHash);
            this.store.addAudit(receipt, { eventType: 'undo', outcome: 'undone', reasonCode: 'exact_marker_deleted' });
            return { ...this.publicReceipt(receipt), status: 'undone', replayed: false };
        } catch (error) {
            this.store.release(receipt.receiptId, receipt.userHash);
            this.store.addAudit(receipt, { eventType: 'undo', outcome: 'failed', reasonCode: 'internal_failure' });
            throw error;
        }
    }

    block(receipt, reason) {
        this.store.release(receipt.receiptId, receipt.userHash);
        this.store.addAudit(receipt, { eventType: 'undo', outcome: 'blocked', reasonCode: reason });
        return { ...this.publicReceipt(receipt), status: 'blocked', reason };
    }

    listAuditHistory({ userId, limit } = {}) {
        const scopedUserId = String(userId || '').trim();
        this.requirePolicy(scopedUserId);
        return this.store.listAudit(hash(scopedUserId), limit);
    }

    publicReceipt(receipt, extra = {}) {
        return {
            receiptId: receipt.receiptId,
            operationType: receipt.operationType,
            status: receipt.status,
            createdAt: receipt.createdAt,
            ...extra
        };
    }
}

module.exports = {
    FinancialUndoService,
    FinancialUndoStore,
    buildFinancialUndoPolicy,
    fingerprintRow,
    __test__: { MARKER_PATTERN, hash, normalizeCell, undoError }
};
require('../reliability/legacyEntrypointTripwire').observeLegacyEntrypoint(
    'financial_undo_service', { domain: 'none' }
);
