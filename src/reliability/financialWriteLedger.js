const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'data', 'financial_write_operations.sqlite');

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function sha256(value, length = 32) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function createOperationKey({ userId, messageId, operation, itemFingerprint }) {
    return sha256(stableJson({ userId, messageId, operation, itemFingerprint }), 48);
}

function sanitizeLedgerObject(value) {
    if (Array.isArray(value)) return value.map(sanitizeLedgerObject);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    for (const [key, child] of Object.entries(value)) {
        if (/description|descricao|message|texto|raw|phone|whatsapp|token|secret|sheet_id|user_id/i.test(key)) {
            output[`${key}Hash`] = sha256(stableJson(child), 16);
            continue;
        }
        if (/amount|valor|value/i.test(key) && typeof child !== 'object') {
            output[`${key}Hash`] = sha256(String(child), 16);
            continue;
        }
        output[key] = sanitizeLedgerObject(child);
    }
    return output;
}

function buildFinancialWriteEnvelope({ operationKey, actorScope, operation, payload, provenance, validationVersion = 'interpretation-reliability-v1' }) {
    return {
        operationKey,
        actorScope: sanitizeLedgerObject(actorScope || {}),
        operation,
        payload: sanitizeLedgerObject(payload || {}),
        provenance: sanitizeLedgerObject(provenance || {}),
        validationVersion
    };
}

class FinancialWriteLedger {
    constructor({ dbPath = DEFAULT_DB_PATH } = {}) {
        this.dbPath = dbPath;
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS financial_write_operations (
                operation_key TEXT PRIMARY KEY,
                status TEXT NOT NULL CHECK(status IN ('pending', 'committed', 'uncertain', 'failed')),
                operation TEXT NOT NULL,
                actor_scope_json TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                provenance_json TEXT NOT NULL,
                receipt_json TEXT NOT NULL DEFAULT '{}',
                validation_version TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        `);
    }

    beginOperation(envelope) {
        const now = new Date().toISOString();
        const safeEnvelope = buildFinancialWriteEnvelope(envelope);
        this.db.prepare(`
            INSERT OR IGNORE INTO financial_write_operations (
                operation_key, status, operation, actor_scope_json, payload_json,
                provenance_json, validation_version, created_at, updated_at
            ) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?)
        `).run(
            safeEnvelope.operationKey,
            safeEnvelope.operation,
            JSON.stringify(safeEnvelope.actorScope),
            JSON.stringify(safeEnvelope.payload),
            JSON.stringify(safeEnvelope.provenance),
            safeEnvelope.validationVersion,
            now,
            now
        );
        return this.getOperation(safeEnvelope.operationKey);
    }

    commitOperation(operationKey, { receipt = {} } = {}) {
        this.updateStatus(operationKey, 'committed', receipt);
        return this.getOperation(operationKey);
    }

    markUncertain(operationKey, { receipt = {} } = {}) {
        this.updateStatus(operationKey, 'uncertain', receipt);
        return this.getOperation(operationKey);
    }

    markFailed(operationKey, { receipt = {} } = {}) {
        this.updateStatus(operationKey, 'failed', receipt);
        return this.getOperation(operationKey);
    }

    updateStatus(operationKey, status, receipt = {}) {
        this.db.prepare(`
            UPDATE financial_write_operations
            SET status = ?, receipt_json = ?, updated_at = ?
            WHERE operation_key = ?
        `).run(status, JSON.stringify(sanitizeLedgerObject(receipt)), new Date().toISOString(), operationKey);
    }

    getOperation(operationKey) {
        const row = this.db.prepare('SELECT * FROM financial_write_operations WHERE operation_key = ?').get(operationKey);
        if (!row) return null;
        return {
            operationKey: row.operation_key,
            status: row.status,
            operation: row.operation,
            actorScope: JSON.parse(row.actor_scope_json || '{}'),
            payload: JSON.parse(row.payload_json || '{}'),
            provenance: JSON.parse(row.provenance_json || '{}'),
            receipt: JSON.parse(row.receipt_json || '{}'),
            validationVersion: row.validation_version,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    close() {
        this.db.close();
    }
}

module.exports = {
    FinancialWriteLedger,
    buildFinancialWriteEnvelope,
    createOperationKey,
    sanitizeLedgerObject,
    __test__: {
        stableJson,
        sha256
    }
};
