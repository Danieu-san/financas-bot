const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const { normalizeText, parseSheetDate, parseValue } = require('../utils/helpers');

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const RECEIPT_TYPES = Object.freeze({
    'application/pdf': { extension: 'pdf', signature: buffer => buffer.subarray(0, 5).toString() === '%PDF-' },
    'image/jpeg': { extension: 'jpg', signature: buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
    'image/png': { extension: 'png', signature: buffer => buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) },
    'image/webp': { extension: 'webp', signature: buffer => buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' }
});

const EVENT_SPECS = Object.freeze({
    expense: { sheetName: 'Saídas', userId: 9, date: 0, description: 1, amount: 4, label: 'gasto' },
    income: { sheetName: 'Entradas', userId: 8, date: 0, description: 1, amount: 3, label: 'entrada' },
    card: { sheetName: 'Lançamentos Cartão', userId: 9, date: 0, description: 1, amount: 3, label: 'compra no cartão' }
});

function receiptError(code, message, details = {}) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    error.details = details;
    return error;
}

function buildFinancialReceiptPolicy(env = process.env, userId = '') {
    const requestedMode = String(env.FINANCIAL_RECEIPTS_MODE || 'off').trim().toLowerCase();
    const mode = ['off', 'canary', 'on'].includes(requestedMode) ? requestedMode : 'off';
    const scopedUserId = String(userId || '').trim();
    const allowlist = new Set(String(env.FINANCIAL_RECEIPTS_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean));
    if (mode === 'off') return { mode, allowed: false, reason: 'mode_off' };
    if (!scopedUserId) return { mode, allowed: false, reason: 'user_required' };
    if (mode === 'canary' && !allowlist.has(scopedUserId)) return { mode, allowed: false, reason: 'user_not_allowlisted' };
    return { mode, allowed: true, reason: mode === 'on' ? 'mode_on' : 'canary_allowlisted' };
}

function buildStableEventKey(event = {}) {
    const parts = [event.userId, event.kind, event.sheetName, event.date, event.description, Number(event.amount || 0).toFixed(2)];
    return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function findLatestFinancialEvent({ sheetDataByName = {}, userId, kind = 'expense' } = {}) {
    const spec = EVENT_SPECS[kind];
    const scopedUserId = String(userId || '').trim();
    if (!spec || !scopedUserId) return null;
    const candidates = (sheetDataByName[spec.sheetName] || []).slice(1).map((row, index) => {
        if (!Array.isArray(row) || String(row[spec.userId] || '').trim() !== scopedUserId) return null;
        const parsedDate = parseSheetDate(String(row[spec.date] || ''));
        if (!parsedDate) return null;
        const event = {
            userId: scopedUserId,
            kind,
            sheetName: spec.sheetName,
            rowNumber: index + 2,
            date: String(row[spec.date] || '').trim(),
            description: String(row[spec.description] || '').replace(/\s+/g, ' ').trim(),
            amount: Math.abs(Number(parseValue(row[spec.amount]) || 0)),
            label: spec.label,
            timestamp: parsedDate.getTime()
        };
        return { ...event, eventKey: buildStableEventKey(event) };
    }).filter(Boolean);
    candidates.sort((a, b) => b.timestamp - a.timestamp || b.rowNumber - a.rowNumber);
    return candidates[0] || null;
}

function validateReceiptMedia(media = {}, env = process.env) {
    const mimeType = String(media.mimetype || '').toLowerCase().split(';')[0].trim();
    const type = RECEIPT_TYPES[mimeType];
    if (!type) throw receiptError('RECEIPT_TYPE_FORBIDDEN', 'Tipo de comprovante não permitido.');
    const buffer = Buffer.from(String(media.data || ''), 'base64');
    const maxBytes = Math.max(1, Number.parseInt(env.FINANCIAL_RECEIPT_MAX_BYTES || '', 10) || DEFAULT_MAX_BYTES);
    if (!buffer.length) throw receiptError('RECEIPT_EMPTY', 'Arquivo vazio.');
    if (buffer.length > maxBytes) throw receiptError('RECEIPT_TOO_LARGE', 'Arquivo excede o limite seguro.', { maxBytes, byteLength: buffer.length });
    if (!type.signature(buffer)) throw receiptError('RECEIPT_SIGNATURE_INVALID', 'Conteúdo não corresponde ao tipo declarado.');
    return {
        buffer,
        mimeType,
        extension: type.extension,
        contentHash: crypto.createHash('sha256').update(buffer).digest('hex')
    };
}

class FinancialReceiptStore {
    constructor({ dbPath = process.env.FINANCIAL_RECEIPTS_DB_PATH || path.resolve(process.cwd(), 'data/financial-receipts.sqlite') } = {}) {
        if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS financial_receipts (
                receipt_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                event_key TEXT NOT NULL,
                event_type TEXT NOT NULL,
                drive_file_id TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                file_name TEXT NOT NULL,
                permission_scope TEXT NOT NULL,
                created_at TEXT NOT NULL,
                deleted_at TEXT NOT NULL DEFAULT '',
                UNIQUE(user_id, event_key, content_hash)
            );
            CREATE INDEX IF NOT EXISTS idx_financial_receipts_event ON financial_receipts(user_id, event_key, created_at);
        `);
    }

    attach(input = {}) {
        const required = ['userId', 'eventKey', 'eventType', 'driveFileId', 'contentHash', 'mimeType', 'fileName', 'permissionScope'];
        for (const field of required) if (!String(input[field] || '').trim()) throw receiptError('RECEIPT_FIELD_REQUIRED', `Campo ${field} obrigatório.`);
        const existing = this.db.prepare(`SELECT * FROM financial_receipts WHERE user_id=? AND event_key=? AND content_hash=? AND deleted_at=''`).get(input.userId, input.eventKey, input.contentHash);
        if (existing) return { ...this.map(existing), replayed: true };
        const row = {
            receipt_id: crypto.randomUUID(), user_id: input.userId, event_key: input.eventKey,
            event_type: input.eventType, drive_file_id: input.driveFileId, content_hash: input.contentHash,
            mime_type: input.mimeType, file_name: input.fileName, permission_scope: input.permissionScope,
            created_at: new Date().toISOString()
        };
        this.db.prepare(`INSERT INTO financial_receipts(receipt_id,user_id,event_key,event_type,drive_file_id,content_hash,mime_type,file_name,permission_scope,created_at) VALUES(@receipt_id,@user_id,@event_key,@event_type,@drive_file_id,@content_hash,@mime_type,@file_name,@permission_scope,@created_at)`).run(row);
        return { ...this.map(row), replayed: false };
    }

    map(row) {
        return { receiptId: row.receipt_id, userId: row.user_id, eventKey: row.event_key, eventType: row.event_type, driveFileId: row.drive_file_id, contentHash: row.content_hash, mimeType: row.mime_type, fileName: row.file_name, permissionScope: row.permission_scope, createdAt: row.created_at };
    }

    findByEvent({ userId, eventKey }) {
        const row = this.db.prepare(`SELECT * FROM financial_receipts WHERE user_id=? AND event_key=? AND deleted_at='' ORDER BY created_at DESC LIMIT 1`).get(userId, eventKey);
        return row ? this.map(row) : null;
    }

    findByEventHash({ userId, eventKey, contentHash }) {
        const row = this.db.prepare(`SELECT * FROM financial_receipts WHERE user_id=? AND event_key=? AND content_hash=? AND deleted_at='' LIMIT 1`).get(userId, eventKey, contentHash);
        return row ? this.map(row) : null;
    }

    findPublicByEvent(query) {
        const row = this.findByEvent(query);
        return row ? { hasReceipt: true, mimeType: row.mimeType, fileName: row.fileName, createdAt: row.createdAt } : null;
    }

    close() { if (this.db?.open) this.db.close(); }
}

module.exports = {
    EVENT_SPECS,
    FinancialReceiptStore,
    buildFinancialReceiptPolicy,
    buildStableEventKey,
    findLatestFinancialEvent,
    validateReceiptMedia,
    __test__: { RECEIPT_TYPES, receiptError }
};
