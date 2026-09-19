// Local fixture for the coverage harness. Never contacts a service: refuse to
// probe network APIs unless the tripwire has already been installed.
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const { civilDateInPinnedTimezone, checkTimezoneRuntime } = require('../../src/next/provenance/pinnedCivilTimezone');

function checkProtectedRuntime() {
    assert.equal(global.__FINANCASBOT_EXHAUSTIVE_NETWORK_TRIPWIRE__, true);
    assert.equal(process.env.NODE_OPTIONS, undefined);
    assert.equal(civilDateInPinnedTimezone('2018-11-04T03:00:00Z',
        'America/Sao_Paulo', 'proleptic_gregorian'), '2018-11-04');
    assert.throws(() => require('node:https').get('https://example.com'),
        { code: 'EXHAUSTIVE_AUDIT_NETWORK_BLOCKED' });
    assert.throws(() => checkTimezoneRuntime(process.versions, process.config.variables,
        { NODE_OPTIONS: '--no-warnings' }, []), /timezone_runtime_invalid/);
}

function collect(child) {
    return new Promise((resolve, reject) => {
        let output = '', error = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { error += chunk; });
        child.on('error', reject);
        child.on('close', code => {
            try { assert.equal(code, 0, error); resolve(output.trim()); }
            catch (failure) { reject(failure); }
        });
    });
}

async function main() {
    checkProtectedRuntime();
    const mode = process.argv[2] || 'leaf';
    if (mode === 'leaf') return console.log('protected-timezone-ok');
    process.env.NODE_OPTIONS = '--no-warnings';
    const options = { env: { ...process.env, NODE_OPTIONS: '' }, encoding: 'utf8' };
    const args = [__filename, 'leaf'];
    const sync = cp.spawnSync(process.execPath, args, options);
    assert.equal(sync.status, 0, sync.stderr);
    assert.equal(sync.stdout.trim(), 'protected-timezone-ok');
    if (mode === 'branch') return console.log('protected-timezone-ok');
    assert.equal(cp.execFileSync(process.execPath, args, options).trim(), 'protected-timezone-ok');
    assert.equal(await collect(cp.spawn(process.execPath, args, options)), 'protected-timezone-ok');
    const executed = await new Promise((resolve, reject) => cp.execFile(process.execPath, args, options,
        (error, stdout) => error ? reject(error) : resolve(stdout.trim())));
    assert.equal(executed, 'protected-timezone-ok');
    assert.equal(await collect(cp.fork(__filename, ['branch'], {
        ...options, execArgv: [], silent: true
    })), 'protected-timezone-ok');
    console.log('protected-tree-ok');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
