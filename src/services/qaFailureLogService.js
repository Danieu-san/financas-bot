const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const logger = require('../utils/logger');

const DEFAULT_LOG_FILE = path.resolve(process.cwd(), 'data', 'qa-failures.jsonl');
const MAX_TEXT_LENGTH = 800;

function isQaFailureLogEnabled() {
    return process.env.QA_FAILURE_LOG_ENABLED !== 'false';
}

function getQaFailureLogPath() {
    return process.env.QA_FAILURE_LOG_PATH || DEFAULT_LOG_FILE;
}

function hashRef(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function truncateText(value, maxLength = MAX_TEXT_LENGTH) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
}

function sanitizeText(value) {
    return truncateText(value)
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]')
        .replace(/\b(?:\+?55)?\d{10,13}\b/g, '[telefone]')
        .replace(/(code|state|token|secret|client_secret)=([^&\s]+)/gi, '$1=[redigido]')
        .replace(/https?:\/\/\S+/gi, (url) => {
            try {
                const parsed = new URL(url);
                return `${parsed.origin}${parsed.pathname}`;
            } catch (_) {
                return '[url]';
            }
        });
}

function sanitizeValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return sanitizeText(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeValue);
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .slice(0, 30)
                .map(([key, item]) => [key, sanitizeValue(item)])
        );
    }
    return sanitizeText(String(value));
}

function buildQaFailureEntry(input = {}) {
    const error = input.error
        ? {
            name: input.error.name || 'Error',
            message: sanitizeText(input.error.message || String(input.error))
        }
        : null;

    return {
        schema_version: 1,
        logged_at: new Date().toISOString(),
        status: 'open',
        kind: sanitizeText(input.kind || 'unknown'),
        reason: sanitizeText(input.reason || ''),
        user_ref: hashRef(input.userId),
        whatsapp_ref: hashRef(input.whatsappId),
        message: sanitizeText(input.message || input.userQuestion || ''),
        intent: sanitizeText(input.intent || ''),
        parameters: sanitizeValue(input.parameters || {}),
        analysis_source: sanitizeText(input.analysisSource || ''),
        response_mode: sanitizeText(input.responseMode || ''),
        error,
        metadata: sanitizeValue(input.metadata || {})
    };
}

async function recordQaFailure(input = {}) {
    if (!isQaFailureLogEnabled()) return null;

    const entry = buildQaFailureEntry(input);
    const filePath = getQaFailureLogPath();

    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
        return entry;
    } catch (error) {
        logger.warn(`qa-failure-log: falha ao registrar evento (${error.message})`);
        return null;
    }
}

module.exports = {
    recordQaFailure,
    buildQaFailureEntry,
    sanitizeText,
    hashRef,
    getQaFailureLogPath
};
