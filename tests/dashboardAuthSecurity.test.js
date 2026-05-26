const test = require('node:test');
const assert = require('node:assert');

const dashboardAuthPath = require.resolve('../src/utils/dashboardAuth');

function loadDashboardAuthWithEnv(overrides = {}) {
    const keys = [
        'DASHBOARD_BASE_URL',
        'DASHBOARD_TOKEN_SECRET',
        'DASHBOARD_REQUIRE_STRONG_SECRET',
        'DASHBOARD_TOKEN_TTL_SECONDS',
        'DASHBOARD_TOKEN_MAX_TTL_SECONDS',
        'NODE_ENV',
        'GEMINI_API_KEY'
    ];
    const previous = {};
    for (const key of keys) {
        previous[key] = process.env[key];
        delete process.env[key];
    }
    Object.assign(process.env, overrides);
    delete require.cache[dashboardAuthPath];
    const auth = require('../src/utils/dashboardAuth');
    return {
        auth,
        restore: () => {
            for (const key of keys) {
                if (previous[key] === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = previous[key];
                }
            }
            delete require.cache[dashboardAuthPath];
        }
    };
}

function tamperTokenPayload(token) {
    const [header, payload, signature] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    decoded.uid = 'other-user';
    const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url');
    return `${header}.${tamperedPayload}.${signature}`;
}

test('dashboard auth requires explicit token secret for public dashboard access', () => {
    const { auth, restore } = loadDashboardAuthWithEnv({
        DASHBOARD_BASE_URL: 'https://finance.example.com'
    });
    try {
        assert.throws(
            () => auth.generateDashboardToken({ userId: 'user-a' }),
            /DASHBOARD_TOKEN_SECRET/
        );
        assert.throws(
            () => auth.buildDashboardAccessLink({ userId: 'user-a' }),
            /DASHBOARD_TOKEN_SECRET/
        );
    } finally {
        restore();
    }
});

test('dashboard auth allows local dev fallback only without public/production mode', () => {
    const { auth, restore } = loadDashboardAuthWithEnv({});
    try {
        const token = auth.generateDashboardToken({ userId: 'user-a', ttlSeconds: 600 });
        const payload = auth.verifyDashboardToken(token);
        assert.strictEqual(payload.uid, 'user-a');
        assert.strictEqual(auth.getDashboardTokenSecret(), 'dashboard-dev-secret');
    } finally {
        restore();
    }
});

test('dashboard auth rejects tampered tokens and tokens signed with another secret', () => {
    const { auth, restore } = loadDashboardAuthWithEnv({
        DASHBOARD_TOKEN_SECRET: 'test-secret-one'
    });
    try {
        const token = auth.generateDashboardToken({ userId: 'user-a', ttlSeconds: 600 });
        assert.strictEqual(auth.verifyDashboardToken(token).uid, 'user-a');
        assert.strictEqual(auth.verifyDashboardToken(tamperTokenPayload(token)), null);

        process.env.DASHBOARD_TOKEN_SECRET = 'test-secret-two';
        assert.strictEqual(auth.verifyDashboardToken(token), null);
    } finally {
        restore();
    }
});

test('dashboard auth caps excessive token ttl', () => {
    const { auth, restore } = loadDashboardAuthWithEnv({
        DASHBOARD_TOKEN_SECRET: 'test-secret-ttl',
        DASHBOARD_TOKEN_MAX_TTL_SECONDS: '900'
    });
    try {
        const before = Math.floor(Date.now() / 1000);
        const token = auth.generateDashboardToken({ userId: 'user-a', ttlSeconds: 999999 });
        const payload = auth.verifyDashboardToken(token);
        assert.ok(payload.exp - before <= 901);
    } finally {
        restore();
    }
});

test('dashboard access link keeps token out of query string', () => {
    const { auth, restore } = loadDashboardAuthWithEnv({
        DASHBOARD_BASE_URL: 'https://finance.example.com',
        DASHBOARD_TOKEN_SECRET: 'test-secret-link'
    });
    try {
        const link = auth.buildDashboardAccessLink({ userId: 'user-a', ttlSeconds: 600 });
        const url = new URL(link.url);
        assert.strictEqual(url.pathname, '/dashboard');
        assert.strictEqual(url.searchParams.get('token'), null);
        assert.match(url.hash, /^#token=/);

        const token = new URLSearchParams(url.hash.slice(1)).get('token');
        assert.strictEqual(auth.verifyDashboardToken(token).uid, 'user-a');
    } finally {
        restore();
    }
});
