const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    applyFinancialCommandPlannerRuntimeConfig,
    readFinancialCommandPlannerRuntimeConfig,
    registerFinancialCommandPlannerRuntimeReload
} = require('../src/config/financialCommandPlannerRuntimeConfig');

test('financial command planner runtime reload applies a complete canary config atomically', () => {
    const env = {
        FINANCIAL_COMMAND_PLANNER_MODE: 'shadow',
        FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: ''
    };

    const result = applyFinancialCommandPlannerRuntimeConfig({
        env,
        config: {
            FINANCIAL_COMMAND_PLANNER_MODE: 'canary',
            FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: ' user-a, user-b '
        }
    });

    assert.deepEqual(result, {
        applied: true,
        mode: 'canary',
        allowlistedUserCount: 2
    });
    assert.equal(env.FINANCIAL_COMMAND_PLANNER_MODE, 'canary');
    assert.equal(env.FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS, 'user-a,user-b');
});

test('financial command planner runtime reload rejects global route and preserves current config', () => {
    const env = {
        FINANCIAL_COMMAND_PLANNER_MODE: 'shadow',
        FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: ''
    };

    const result = applyFinancialCommandPlannerRuntimeConfig({
        env,
        config: {
            FINANCIAL_COMMAND_PLANNER_MODE: 'route',
            FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: 'user-a'
        }
    });

    assert.deepEqual(result, {
        applied: false,
        reason: 'unsupported_mode'
    });
    assert.equal(env.FINANCIAL_COMMAND_PLANNER_MODE, 'shadow');
    assert.equal(env.FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS, '');
});

test('financial command planner runtime reload rejects canary without an allowlisted user', () => {
    const env = {
        FINANCIAL_COMMAND_PLANNER_MODE: 'shadow',
        FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: ''
    };

    const result = applyFinancialCommandPlannerRuntimeConfig({
        env,
        config: {
            FINANCIAL_COMMAND_PLANNER_MODE: 'canary',
            FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: '  '
        }
    });

    assert.deepEqual(result, {
        applied: false,
        reason: 'canary_allowlist_required'
    });
    assert.equal(env.FINANCIAL_COMMAND_PLANNER_MODE, 'shadow');
});

test('financial command planner runtime config reader exposes only selected operational keys', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-planner-runtime-'));
    const envFilePath = path.join(dir, '.env');
    fs.writeFileSync(
        envFilePath,
        'FINANCIAL_COMMAND_PLANNER_MODE=canary\n' +
        'FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS=user-a\n' +
        'GEMINI_API_KEY=must-not-leak\n',
        'utf8'
    );

    const config = readFinancialCommandPlannerRuntimeConfig({ envFilePath });

    assert.deepEqual(config, {
        FINANCIAL_COMMAND_PLANNER_MODE: 'canary',
        FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: 'user-a'
    });
    assert.equal(Object.hasOwn(config, 'GEMINI_API_KEY'), false);
});

test('financial command planner runtime reload registers one SIGHUP handler and logs only sanitized counts', () => {
    const handlers = [];
    const info = [];
    const warn = [];
    const processRef = {
        env: {
            FINANCIAL_COMMAND_PLANNER_MODE: 'shadow',
            FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: ''
        },
        on(signal, handler) {
            handlers.push({ signal, handler });
        }
    };
    const logger = {
        info(message) {
            info.push(message);
        },
        warn(message) {
            warn.push(message);
        }
    };
    const readRuntimeConfig = () => ({
        FINANCIAL_COMMAND_PLANNER_MODE: 'canary',
        FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS: 'private-user-id'
    });

    assert.equal(registerFinancialCommandPlannerRuntimeReload({ processRef, logger, readRuntimeConfig }), true);
    assert.equal(registerFinancialCommandPlannerRuntimeReload({ processRef, logger, readRuntimeConfig }), false);
    assert.equal(handlers.length, 1);
    assert.equal(handlers[0].signal, 'SIGHUP');

    handlers[0].handler();

    assert.equal(processRef.env.FINANCIAL_COMMAND_PLANNER_MODE, 'canary');
    assert.equal(info.length, 1);
    assert.match(info[0], /mode=canary/);
    assert.match(info[0], /allowlisted_users=1/);
    assert.doesNotMatch(info[0], /private-user-id/);
    assert.deepEqual(warn, []);
});