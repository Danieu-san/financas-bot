const fs = require('node:fs/promises');
const path = require('node:path');
const logger = require('../utils/logger');
const { hashRef, sanitizeText, sanitizeValue } = require('./adminActionLogService');

const DEFAULT_LOG_FILE = path.resolve(process.cwd(), 'data', 'dashboard-access.jsonl');

function isDashboardAccessLogEnabled() {
    return process.env.DASHBOARD_ACCESS_LOG_ENABLED !== 'false';
}

function getDashboardAccessLogPath() {
    return process.env.DASHBOARD_ACCESS_LOG_PATH || DEFAULT_LOG_FILE;
}

function sanitizePath(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        return sanitizeText(new URL(raw, 'https://dashboard.local').pathname);
    } catch (_) {
        return sanitizeText(raw.split('?')[0].split('#')[0]);
    }
}

function buildDashboardAccessEntry(input = {}) {
    return {
        schema_version: 1,
        logged_at: new Date().toISOString(),
        event: sanitizeText(input.event || 'unknown'),
        result: sanitizeText(input.result || 'unknown'),
        token_ref: input.tokenRef ? sanitizeText(input.tokenRef) : hashRef(input.token || ''),
        actor_user_ref: hashRef(input.userId || input.actorUserId || ''),
        data_user_ref: hashRef(input.dataUserId || ''),
        is_admin: Boolean(input.isAdmin),
        scope: sanitizeText(input.scope || ''),
        path: sanitizePath(input.path || ''),
        metadata: sanitizeValue(input.metadata || {})
    };
}

async function recordDashboardAccessEvent(input = {}) {
    if (!isDashboardAccessLogEnabled()) return null;

    const entry = buildDashboardAccessEntry(input);
    const filePath = getDashboardAccessLogPath();

    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
        return entry;
    } catch (error) {
        logger.warn(`[dashboard-access-log] record_failed ${logger.safeError(error)}`);
        return null;
    }
}

module.exports = {
    recordDashboardAccessEvent,
    buildDashboardAccessEntry,
    getDashboardAccessLogPath
};
