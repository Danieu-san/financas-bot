const crypto = require('crypto');

const MIN_TTL_SECONDS = 300;
const DEFAULT_TTL_SECONDS = Math.max(MIN_TTL_SECONDS, Number.parseInt(process.env.DASHBOARD_TOKEN_TTL_SECONDS || '900', 10));
const MAX_TTL_SECONDS = Math.max(MIN_TTL_SECONDS, Number.parseInt(process.env.DASHBOARD_TOKEN_MAX_TTL_SECONDS || '1800', 10));
const DEV_DASHBOARD_SECRET = 'dashboard-dev-secret';

function getDashboardBaseUrl() {
    return String(process.env.DASHBOARD_BASE_URL || '').trim().replace(/\/+$/g, '');
}

function isDashboardV2Enabled(env = process.env) {
    const value = String(env.DASHBOARD_V2_ENABLED ?? 'true').trim().toLowerCase();
    return !['false', '0', 'no', 'nao', 'off'].includes(value);
}

function isProductionLikeDashboard() {
    const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
    return nodeEnv === 'production' ||
        nodeEnv === 'prod' ||
        String(process.env.DASHBOARD_REQUIRE_STRONG_SECRET || '').trim().toLowerCase() === 'true' ||
        Boolean(getDashboardBaseUrl());
}

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
    const configuredSecret = String(process.env.DASHBOARD_TOKEN_SECRET || '').trim();
    if (configuredSecret) return configuredSecret;
    if (isProductionLikeDashboard()) {
        throw new Error('DASHBOARD_TOKEN_SECRET is required when dashboard is enabled for public/production access.');
    }
    return DEV_DASHBOARD_SECRET;
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

function hashDashboardToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex').slice(0, 16);
}

function timingSafeStringEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    if (leftBuffer.length !== rightBuffer.length) return false;
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveDashboardTtl(ttlSeconds = DEFAULT_TTL_SECONDS) {
    const parsedTtl = Number.parseInt(ttlSeconds, 10) || DEFAULT_TTL_SECONDS;
    return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, parsedTtl));
}

function generateDashboardToken({ userId, ttlSeconds = DEFAULT_TTL_SECONDS, isAdmin = false }) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const nowSec = Math.floor(Date.now() / 1000);
    const safeTtl = resolveDashboardTtl(ttlSeconds);
    const payload = {
        uid: String(userId || ''),
        iat: nowSec,
        exp: nowSec + safeTtl,
        adm: Boolean(isAdmin)
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
    if (!timingSafeStringEqual(signature, expectedSignature)) return null;

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

function buildDashboardAccessLink({ userId, ttlSeconds = DEFAULT_TTL_SECONDS, isAdmin = false, version = 'current' }) {
    const baseUrl = getDashboardBaseUrl();
    if (!baseUrl) return null;
    const effectiveTtlSeconds = resolveDashboardTtl(ttlSeconds);
    const token = generateDashboardToken({ userId, ttlSeconds: effectiveTtlSeconds, isAdmin });
    const requestedVersion = version === 'v2' ? 'v2' : 'current';
    const effectiveVersion = requestedVersion === 'v2' && isDashboardV2Enabled() ? 'v2' : 'current';
    const path = effectiveVersion === 'v2' ? '/dashboard/v2' : '/dashboard';
    return {
        url: `${baseUrl}${path}#token=${encodeURIComponent(token)}`,
        ttlSeconds: effectiveTtlSeconds,
        tokenRef: hashDashboardToken(token),
        version: effectiveVersion,
        path,
        ...(requestedVersion !== effectiveVersion ? { rolledBackFrom: requestedVersion } : {})
    };
}

module.exports = {
    generateDashboardToken,
    verifyDashboardToken,
    buildDashboardAccessLink,
    isDashboardV2Enabled,
    getDashboardBaseUrl,
    getDashboardTokenSecret
};
