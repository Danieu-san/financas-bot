const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const logger = require('../utils/logger');

const DEFAULT_LOG_FILE = path.resolve(process.cwd(), 'data', 'admin-actions.jsonl');
const MAX_TEXT_LENGTH = 240;

function isAdminActionLogEnabled() {
    return process.env.ADMIN_ACTION_LOG_ENABLED !== 'false';
}

function getAdminActionLogPath() {
    return process.env.ADMIN_ACTION_LOG_PATH || DEFAULT_LOG_FILE;
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
        .replace(/\b(?:\+?55)?\d{10,13}(?:@(c\.us|lid))?\b/gi, '[telefone]')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
        .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]')
        .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, '[uuid]')
        .replace(/(code|state|token|secret|client_secret)=([^&\s]+)/gi, '$1=[redigido]')
        .replace(/GOCSPX-[A-Za-z0-9_-]+/g, '[google-client-secret]')
        .replace(/https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/\s]+/gi, 'https://docs.google.com/spreadsheets/d/[id]')
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
                .map(([key, item]) => [sanitizeText(key), sanitizeValue(item)])
        );
    }
    return sanitizeText(String(value));
}

function buildAdminActionEntry(input = {}) {
    const actor = input.actor || {};
    const target = input.target || input.targetId || input.targetWhatsAppId || '';
    const error = input.error
        ? {
            name: sanitizeText(input.error.name || 'Error'),
            message: sanitizeText(input.error.message || String(input.error))
        }
        : null;

    return {
        schema_version: 1,
        logged_at: new Date().toISOString(),
        action: sanitizeText(input.action || 'unknown'),
        result: sanitizeText(input.result || 'unknown'),
        actor_ref: hashRef(actor.senderId || actor.sender_id || input.senderId),
        actor_user_ref: hashRef(actor.userId || actor.actor_user_id || input.actorUserId),
        actor_name: sanitizeText(actor.name || actor.actor_name || ''),
        target_ref: hashRef(target),
        target_hint: sanitizeText(target),
        metadata: sanitizeValue(input.metadata || {}),
        error
    };
}

async function recordAdminAction(input = {}) {
    if (!isAdminActionLogEnabled()) return null;

    const entry = buildAdminActionEntry(input);
    const filePath = getAdminActionLogPath();

    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
        return entry;
    } catch (error) {
        logger.warn(`[admin-action-log] record_failed ${logger.safeError(error)}`);
        return null;
    }
}

module.exports = {
    recordAdminAction,
    buildAdminActionEntry,
    sanitizeText,
    sanitizeValue,
    hashRef,
    getAdminActionLogPath
};
