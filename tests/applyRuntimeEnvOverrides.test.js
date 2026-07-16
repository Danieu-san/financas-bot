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
