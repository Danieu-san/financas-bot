const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main } = require('../scripts/applyRuntimeEnvOverrides');

test('runtime env updater changes only allowlisted keys without exposing values', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-env-'));
    const envFile = path.join(directory, '.env');
    fs.writeFileSync(envFile, 'SECRET=preserve\nAPP_COMMIT_SHA=old\n', { mode: 0o600 });
    const result = main([
        '--env-file', envFile,
        'APP_COMMIT_SHA=new',
        'LEGACY_RETIREMENT_TRIPWIRE_ENABLED=true',
        'LEGACY_RETIREMENT_SOFT_DISABLED_CANDIDATES='
    ]);
    assert.equal(fs.readFileSync(envFile, 'utf8'), [
        'SECRET=preserve',
        'APP_COMMIT_SHA=new',
        'LEGACY_RETIREMENT_TRIPWIRE_ENABLED=true',
        'LEGACY_RETIREMENT_SOFT_DISABLED_CANDIDATES=',
        ''
    ].join('\n'));
    assert.deepEqual(result.updated_keys, [
        'APP_COMMIT_SHA',
        'LEGACY_RETIREMENT_SOFT_DISABLED_CANDIDATES',
        'LEGACY_RETIREMENT_TRIPWIRE_ENABLED'
    ]);
    assert.equal(result.values_exposed, 0);
});

test('runtime env updater rejects arbitrary keys and multiline values', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-env-'));
    const envFile = path.join(directory, '.env');
    fs.writeFileSync(envFile, 'SAFE=true\n');
    assert.throws(() => main(['--env-file', envFile, 'PLUGGY_CLIENT_SECRET=x']), /runtime_env_key_forbidden/);
    assert.throws(() => main(['--env-file', envFile, 'APP_COMMIT_SHA=x\ny']), /runtime_env_value_invalid/);
});

test('runtime env updater builds multi-source activation JSON without shell quoting', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-env-'));
    const envFile = path.join(directory, '.env');
    fs.writeFileSync(envFile, [
        'OPEN_FINANCE_ALERT_CANARY_ALIAS=daniel_nubank',
        'OPEN_FINANCE_ALERT_CANARY_ALIASES=',
        'OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON=',
        ''
    ].join('\n'));
    main([
        '--env-file', envFile,
        '--activate-open-finance-canary',
        'daniel_nubank,thais_nubank',
        '2026-07-16T18:40:00Z'
    ]);
    const content = fs.readFileSync(envFile, 'utf8');
    assert.match(content, /^OPEN_FINANCE_ALERT_CANARY_ALIAS=$/m);
    assert.match(content, /^OPEN_FINANCE_ALERT_CANARY_ALIASES=daniel_nubank,thais_nubank$/m);
    assert.match(content, /OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON=\{"daniel_nubank":"2026-07-16T18:40:00.000Z","thais_nubank":"2026-07-16T18:40:00.000Z"\}/);
});

test('runtime env updater provides an explicit single-source rollback', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-env-'));
    const envFile = path.join(directory, '.env');
    fs.writeFileSync(envFile, 'OPEN_FINANCE_ALERT_CANARY_ALIAS=\n');
    main(['--env-file', envFile, '--single-open-finance-canary', 'daniel_nubank']);
    const content = fs.readFileSync(envFile, 'utf8');
    assert.match(content, /^OPEN_FINANCE_ALERT_CANARY_ALIAS=daniel_nubank$/m);
    assert.match(content, /^OPEN_FINANCE_ALERT_CANARY_ALIASES=$/m);
    assert.match(content, /^OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON=$/m);
});

test('runtime env updater accepts only bounded safe family promotions', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-env-'));
    const envFile = path.join(directory, '.env');
    fs.writeFileSync(envFile, 'FINANCIAL_AGENT_MODE=canary\n');
    const first = '11111111-1111-4111-8111-111111111111';
    const second = '22222222-2222-4222-8222-222222222222';
    main([
        '--env-file', envFile,
        'FINANCIAL_AGENT_MODE=answer',
        'FINANCIAL_FILE_IO_MODE=on',
        'FINANCIAL_RECEIPTS_MODE=on',
        'FINANCIAL_DOCUMENT_OCR_MODE=on',
        'BATCH_MAINTENANCE_MODE=canary',
        `BATCH_MAINTENANCE_USER_IDS=${first},${second}`,
        'OPEN_FINANCE_ALERT_MAX_PER_RUN=4'
    ]);
    const content = fs.readFileSync(envFile, 'utf8');
    assert.match(content, /^FINANCIAL_AGENT_MODE=answer$/m);
    assert.match(content, /^FINANCIAL_FILE_IO_MODE=on$/m);
    assert.match(content, /^FINANCIAL_RECEIPTS_MODE=on$/m);
    assert.match(content, /^FINANCIAL_DOCUMENT_OCR_MODE=on$/m);
    assert.match(content, /^BATCH_MAINTENANCE_MODE=canary$/m);
    assert.match(content, /^OPEN_FINANCE_ALERT_MAX_PER_RUN=4$/m);
});

test('runtime env updater rejects unsafe promotion values', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-env-'));
    const envFile = path.join(directory, '.env');
    fs.writeFileSync(envFile, 'FINANCIAL_AGENT_MODE=canary\n');
    assert.throws(() => main(['--env-file', envFile, 'FINANCIAL_AGENT_MODE=enforce']), /runtime_env_mode_invalid/);
    assert.throws(() => main(['--env-file', envFile, 'FINANCIAL_FILE_IO_MODE=route']), /runtime_env_mode_invalid/);
    assert.throws(() => main(['--env-file', envFile, 'OPEN_FINANCE_ALERT_MAX_PER_RUN=6']), /open_finance_alert_limit_invalid/);
    assert.throws(() => main(['--env-file', envFile, 'BATCH_MAINTENANCE_USER_IDS=not-a-user']), /batch_maintenance_user_ids_invalid/);
});
