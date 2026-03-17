const crypto = require('crypto');

const DEFAULT_TTL_SECONDS = Math.max(300, Number.parseInt(process.env.DASHBOARD_TOKEN_TTL_SECONDS || '7200', 10));

function base64UrlEncode(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64UrlDecode(input) {
    const padded = String(input || '')
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(String(input || '').length / 4) * 4, '=');
    return Buffer.from(padded, 'base64').toString('utf8');
}

function getDashboardTokenSecret() {
    return process.env.DASHBOARD_TOKEN_SECRET || process.env.GEMINI_API_KEY || 'dashboard-dev-secret';
}

function signTokenPayload(payload) {
    const secret = getDashboardTokenSecret();
    return crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function generateDashboardToken({ userId, ttlSeconds = DEFAULT_TTL_SECONDS }) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
        uid: String(userId || ''),
        iat: nowSec,
        exp: nowSec + Math.max(300, Number.parseInt(ttlSeconds, 10) || DEFAULT_TTL_SECONDS)
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const body = `${encodedHeader}.${encodedPayload}`;
    const signature = signTokenPayload(body);
    return `${body}.${signature}`;
}

function verifyDashboardToken(token) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const parts = raw.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const body = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = signTokenPayload(body);
    if (signature !== expectedSignature) return null;

    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        if (!payload || !payload.uid || !payload.exp) return null;
        const nowSec = Math.floor(Date.now() / 1000);
        if (payload.exp < nowSec) return null;
        return payload;
    } catch (error) {
        return null;
    }
}

function getDashboardBaseUrl() {
    return String(process.env.DASHBOARD_BASE_URL || '').trim().replace(/\/+$/g, '');
}

function buildDashboardAccessLink({ userId, ttlSeconds = DEFAULT_TTL_SECONDS }) {
    const baseUrl = getDashboardBaseUrl();
    if (!baseUrl) return null;
    const token = generateDashboardToken({ userId, ttlSeconds });
    return {
        url: `${baseUrl}/dashboard?token=${encodeURIComponent(token)}`,
        ttlSeconds
    };
}

module.exports = {
    generateDashboardToken,
    verifyDashboardToken,
    buildDashboardAccessLink,
    getDashboardBaseUrl
};

