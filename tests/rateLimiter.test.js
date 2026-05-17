const test = require('node:test');
const assert = require('node:assert');

const rateLimiterPath = require.resolve('../src/utils/rateLimiter');

function loadRateLimiterWithEnv(env) {
    const previous = {
        NODE_ENV: process.env.NODE_ENV,
        DISABLE_RATE_LIMITER: process.env.DISABLE_RATE_LIMITER,
        RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW: process.env.RATE_LIMIT_WINDOW
    };

    Object.assign(process.env, env);
    delete require.cache[rateLimiterPath];
    const module = require('../src/utils/rateLimiter');

    return {
        module,
        restore() {
            for (const [key, value] of Object.entries(previous)) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
            delete require.cache[rateLimiterPath];
        }
    };
}

test('rateLimiter blocks requests above configured limit per user', () => {
    const { module: rateLimiter, restore } = loadRateLimiterWithEnv({
        NODE_ENV: 'production',
        DISABLE_RATE_LIMITER: '',
        RATE_LIMIT_MAX: '2',
        RATE_LIMIT_WINDOW: '60000'
    });

    try {
        assert.strictEqual(rateLimiter.isAllowed('user-a'), true);
        assert.strictEqual(rateLimiter.isAllowed('user-a'), true);
        assert.strictEqual(rateLimiter.isAllowed('user-a'), false);
        assert.strictEqual(rateLimiter.isAllowed('user-b'), true);

        rateLimiter.resetRateLimiter();
        assert.strictEqual(rateLimiter.isAllowed('user-a'), true);
    } finally {
        restore();
    }
});

test('rateLimiter stays disabled in test env and explicit disable env', () => {
    let loaded = loadRateLimiterWithEnv({
        NODE_ENV: 'test',
        DISABLE_RATE_LIMITER: '',
        RATE_LIMIT_MAX: '1',
        RATE_LIMIT_WINDOW: '60000'
    });

    try {
        assert.strictEqual(loaded.module.isAllowed('test-user'), true);
        assert.strictEqual(loaded.module.isAllowed('test-user'), true);
        assert.strictEqual(loaded.module.isAllowed('test-user'), true);
    } finally {
        loaded.restore();
    }

    loaded = loadRateLimiterWithEnv({
        NODE_ENV: 'production',
        DISABLE_RATE_LIMITER: 'true',
        RATE_LIMIT_MAX: '1',
        RATE_LIMIT_WINDOW: '60000'
    });

    try {
        assert.strictEqual(loaded.module.isAllowed('disabled-user'), true);
        assert.strictEqual(loaded.module.isAllowed('disabled-user'), true);
    } finally {
        loaded.restore();
    }
});
