'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    applyActivationStage,
    buildActivationPlan,
    parseHealthAttempts,
    updateEnvPayload
} = require('../scripts/release/openFinanceActivationRelease');

const COMMIT = '8f89aec906439dba0024318bddee8d255747b54f';

function createHarness({ precreateBackups = true } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'of-activation-'));
    const data = path.join(root, 'data');
    const backups = path.join(data, 'backups');
    fs.mkdirSync(precreateBackups ? backups : data, { recursive: true });
    const required = {
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: path.join(data, 'secret'),
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: path.join(data, 'journal.sqlite'),
        OPEN_FINANCE_SHADOW_PREVIEW_DB: path.join(data, 'preview.sqlite'),
        OPEN_FINANCE_OUTBOX_DB: path.join(data, 'outbox.sqlite')
    };
    for (const file of Object.values(required)) fs.writeFileSync(file, 'x');
    const env = {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'off',
        OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_WRITE_APPROVED: 'false',
        ...required
    };
    const envPath = path.join(root, '.env');
    const raw = [
        '# preserve comments and unrelated secrets',
        'GEMINI_API_KEY=not-for-output',
        ...Object.entries(env).map(([key, value]) => `${key}=${value}`),
        ''
    ].join('\n');
    fs.writeFileSync(envPath, raw);
    return {
        root,
        env,
        envPath,
        raw,
        close: () => fs.rmSync(root, { recursive: true, force: true })
    };
}

function pm2Inventory(root) {
    return JSON.stringify([{
        name: 'financas-bot',
        pm2_env: {
            status: 'online',
            pm_exec_path: path.join(root, 'releases', COMMIT, 'index.js'),
            pm_cwd: root,
            env: { APP_COMMIT_SHA: COMMIT }
        }
    }]);
}

test('PROD-ACT-01 builds prompt, confirm and rollback plans fail-closed', () => {
    const harness = createHarness();
    try {
        const prompt = buildActivationPlan(harness.env, {
            stage: 'prompt'
        });
        assert.equal(prompt.financial_write_enabled, false);
        assert.equal(prompt.next.OPEN_FINANCE_SAVE_PROPOSAL_MODE, 'prompt');
        assert.equal(prompt.next.OPEN_FINANCE_WRITE_MODE, 'off');

        const confirm = buildActivationPlan(harness.env, {
            stage: 'confirm'
        });
        assert.equal(confirm.financial_write_enabled, true);
        assert.equal(confirm.next.OPEN_FINANCE_WRITE_APPROVED, 'true');
        assert.equal(confirm.rollback_stage, 'write-off');

        const rollback = buildActivationPlan({
            ...harness.env,
            OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
            OPEN_FINANCE_WRITE_MODE: 'confirm',
            OPEN_FINANCE_WRITE_APPROVED: 'true'
        }, { stage: 'write-off' });
        assert.equal(rollback.financial_write_enabled, false);
        assert.equal(rollback.next.OPEN_FINANCE_SAVE_PROPOSAL_MODE, 'prompt');
        assert.equal(rollback.next.OPEN_FINANCE_WRITE_MODE, 'off');
    } finally {
        harness.close();
    }
});

test('PROD-ACT-01 rejects missing canary prerequisite and invalid stage', () => {
    const harness = createHarness();
    try {
        assert.throws(() => buildActivationPlan({
            ...harness.env,
            OPEN_FINANCE_RECONCILIATION_MODE: 'off'
        }, { stage: 'prompt' }),
        /open_finance_activation_reconciliation_canary_required/);
        assert.throws(() => buildActivationPlan(harness.env, {
            stage: 'unknown'
        }), /open_finance_activation_stage_invalid/);
        fs.rmSync(harness.env.OPEN_FINANCE_OUTBOX_DB);
        assert.throws(() => buildActivationPlan(harness.env, {
            stage: 'prompt'
        }), /open_finance_activation_state_unavailable:OPEN_FINANCE_OUTBOX_DB/);
    } finally {
        harness.close();
    }
});

test('PROD-ACT-01 updates only requested flags and rejects duplicates', () => {
    const raw = 'SECRET=x\nOPEN_FINANCE_WRITE_MODE=off\n';
    const next = updateEnvPayload(raw, {
        OPEN_FINANCE_WRITE_MODE: 'confirm',
        OPEN_FINANCE_WRITE_APPROVED: 'true'
    });
    assert.equal(next, [
        'SECRET=x',
        'OPEN_FINANCE_WRITE_MODE=confirm',
        'OPEN_FINANCE_WRITE_APPROVED=true',
        ''
    ].join('\n'));
    assert.throws(() => updateEnvPayload(
        'OPEN_FINANCE_WRITE_MODE=off\nOPEN_FINANCE_WRITE_MODE=confirm\n',
        { OPEN_FINANCE_WRITE_MODE: 'off' }
    ), /open_finance_activation_duplicate_flag/);
});

test('PROD-ACT-01 parses only bounded health attempts', () => {
    assert.equal(parseHealthAttempts(), 12);
    assert.equal(parseHealthAttempts('60'), 60);
    for (const value of ['0', '11', '61', '1.5', 'text']) {
        assert.throws(
            () => parseHealthAttempts(value),
            /open_finance_activation_health_attempts_invalid/
        );
    }
});

test('PROD-ACT-01 requires live confirmations before confirm mutation', async () => {
    const harness = createHarness();
    let commands = 0;
    try {
        await assert.rejects(() => applyActivationStage({
            targetRoot: harness.root,
            stage: 'confirm',
            expectedCommitSha: COMMIT,
            confirmConfigChange: true,
            runCommand: async () => {
                commands += 1;
                return { stdout: pm2Inventory(harness.root) };
            }
        }), /open_finance_activation_live_confirmation_required/);
        assert.equal(commands, 0);
        assert.equal(fs.readFileSync(harness.envPath, 'utf8'), harness.raw);
        assert.equal(fs.readdirSync(
            path.join(harness.root, 'data', 'backups')
        ).length, 0);
    } finally {
        harness.close();
    }
});

test('PROD-ACT-01 applies prompt transactionally without exposing secrets', async () => {
    const harness = createHarness({ precreateBackups: false });
    const commands = [];
    const backups = path.join(harness.root, 'data', 'backups');
    const transitions = [];
    try {
        const result = await applyActivationStage({
            targetRoot: harness.root,
            stage: 'prompt',
            expectedCommitSha: COMMIT,
            confirmConfigChange: true,
            healthAttempts: 12,
            healthDelayMs: 0,
            runCommand: async (command, args) => {
                commands.push([command, ...args]);
                if (args[0] === 'jlist') {
                    assert.equal(fs.existsSync(backups), false);
                    assert.equal(
                        fs.readFileSync(harness.envPath, 'utf8'),
                        harness.raw
                    );
                    return { stdout: pm2Inventory(harness.root) };
                }
                if (args[0] === 'restart') {
                    assert.equal(fs.readdirSync(backups).length, 1);
                    assert.match(
                        fs.readFileSync(harness.envPath, 'utf8'),
                        /OPEN_FINANCE_SAVE_PROPOSAL_MODE=prompt/
                    );
                }
                return { stdout: '' };
            },
            healthCheck: async () => true,
            observeTransition: (step, context) => {
                transitions.push(step);
                assert.equal(context.envPath, harness.envPath);
                assert.equal(fs.existsSync(context.backupPath), true);
                if (step === 'backup_durable') {
                    assert.equal(
                        fs.readFileSync(harness.envPath, 'utf8'),
                        harness.raw
                    );
                }
                if (step === 'env_replaced') {
                    assert.match(
                        fs.readFileSync(harness.envPath, 'utf8'),
                        /OPEN_FINANCE_SAVE_PROPOSAL_MODE=prompt/
                    );
                }
            },
            now: () => new Date('2026-07-31T12:00:00.000Z')
        });
        const next = fs.readFileSync(harness.envPath, 'utf8');
        assert.match(next, /OPEN_FINANCE_SAVE_PROPOSAL_MODE=prompt/);
        assert.match(next, /OPEN_FINANCE_WRITE_MODE=off/);
        assert.match(next, /OPEN_FINANCE_WRITE_APPROVED=false/);
        assert.match(next, /GEMINI_API_KEY=not-for-output/);
        assert.deepEqual(commands.map(item => item.slice(0, 3)), [
            ['pm2', 'jlist'],
            ['pm2', 'restart', 'financas-bot'],
            ['pm2', 'save']
        ]);
        assert.equal(result.financial_write_enabled, false);
        assert.equal(JSON.stringify(result).includes('not-for-output'), false);
        assert.equal(result.rollback_performed, false);
        assert.deepEqual(transitions, [
            'backup_durable',
            'env_replaced'
        ]);
        assert.equal(
            fs.existsSync(path.join(harness.root, result.backup_file)),
            true
        );
        if (process.platform !== 'win32') {
            assert.equal(
                fs.statSync(path.join(harness.root, result.backup_file))
                    .mode & 0o777,
                0o600
            );
        }
    } finally {
        harness.close();
    }
});

test('PROD-ACT-01 applies confirm only with all live gates', async () => {
    const harness = createHarness();
    try {
        const result = await applyActivationStage({
            targetRoot: harness.root,
            stage: 'confirm',
            expectedCommitSha: COMMIT,
            confirmConfigChange: true,
            confirmFinancialWrite: true,
            confirmUserPresent: true,
            healthAttempts: 12,
            healthDelayMs: 0,
            runCommand: async (_command, args) => {
                if (args[0] === 'jlist') {
                    return { stdout: pm2Inventory(harness.root) };
                }
                return { stdout: '' };
            },
            healthCheck: async () => true,
            now: () => new Date('2026-07-31T12:00:00.000Z')
        });
        assert.equal(result.financial_write_enabled, true);
        assert.equal(result.flags.OPEN_FINANCE_WRITE_MODE, 'confirm');
        assert.equal(result.flags.OPEN_FINANCE_WRITE_APPROVED, 'true');
    } finally {
        harness.close();
    }
});

test('PROD-ACT-01 restores exact env and health after failed activation', async () => {
    const harness = createHarness();
    const commands = [];
    const transitions = [];
    let healthCalls = 0;
    let restarts = 0;
    try {
        await assert.rejects(() => applyActivationStage({
            targetRoot: harness.root,
            stage: 'prompt',
            expectedCommitSha: COMMIT,
            confirmConfigChange: true,
            healthAttempts: 12,
            healthDelayMs: 0,
            runCommand: async (command, args) => {
                commands.push([command, ...args]);
                if (args[0] === 'jlist') {
                    return { stdout: pm2Inventory(harness.root) };
                }
                if (args[0] === 'restart') {
                    restarts += 1;
                    const current = fs.readFileSync(
                        harness.envPath,
                        'utf8'
                    );
                    if (restarts === 1) {
                        assert.match(
                            current,
                            /OPEN_FINANCE_SAVE_PROPOSAL_MODE=prompt/
                        );
                    } else {
                        assert.equal(current, harness.raw);
                    }
                }
                return { stdout: '' };
            },
            healthCheck: async () => {
                healthCalls += 1;
                if (healthCalls === 1) return true;
                if (healthCalls <= 13) return false;
                return true;
            },
            observeTransition: step => {
                transitions.push(step);
                if (step === 'env_restored') {
                    assert.equal(
                        fs.readFileSync(harness.envPath, 'utf8'),
                        harness.raw
                    );
                }
            },
            now: () => new Date('2026-07-31T12:00:00.000Z')
        }), /open_finance_activation_rolled_back:open_finance_activation_health_failed/);
        assert.equal(fs.readFileSync(harness.envPath, 'utf8'), harness.raw);
        assert.deepEqual(commands.map(item => item.slice(0, 3)), [
            ['pm2', 'jlist'],
            ['pm2', 'restart', 'financas-bot'],
            ['pm2', 'restart', 'financas-bot'],
            ['pm2', 'save']
        ]);
        assert.deepEqual(transitions, [
            'backup_durable',
            'env_replaced',
            'env_restored'
        ]);
    } finally {
        harness.close();
    }
});

test('PROD-ACT-01 rolls back when directory sync fails after env rename', async () => {
    const harness = createHarness();
    const commands = [];
    let syncCalls = 0;
    try {
        await assert.rejects(() => applyActivationStage({
            targetRoot: harness.root,
            stage: 'prompt',
            expectedCommitSha: COMMIT,
            confirmConfigChange: true,
            healthAttempts: 12,
            healthDelayMs: 0,
            runCommand: async (command, args) => {
                commands.push([command, ...args]);
                if (args[0] === 'jlist') {
                    return { stdout: pm2Inventory(harness.root) };
                }
                if (args[0] === 'restart') {
                    assert.equal(
                        fs.readFileSync(harness.envPath, 'utf8'),
                        harness.raw
                    );
                }
                return { stdout: '' };
            },
            healthCheck: async () => true,
            atomicDirectorySync: () => {
                syncCalls += 1;
                if (syncCalls === 1) {
                    throw new Error('forced_directory_sync_failure');
                }
            },
            now: () => new Date('2026-07-31T12:00:00.000Z')
        }), /open_finance_activation_rolled_back:forced_directory_sync_failure/);
        assert.equal(syncCalls, 2);
        assert.equal(fs.readFileSync(harness.envPath, 'utf8'), harness.raw);
        assert.deepEqual(commands.map(item => item.slice(0, 3)), [
            ['pm2', 'jlist'],
            ['pm2', 'restart', 'financas-bot'],
            ['pm2', 'save']
        ]);
    } finally {
        harness.close();
    }
});

test('PROD-ACT-01 restarts safe env before reporting rollback sync failure', async () => {
    const harness = createHarness();
    const commands = [];
    let healthCalls = 0;
    let syncCalls = 0;
    try {
        await assert.rejects(() => applyActivationStage({
            targetRoot: harness.root,
            stage: 'prompt',
            expectedCommitSha: COMMIT,
            confirmConfigChange: true,
            healthAttempts: 12,
            healthDelayMs: 0,
            runCommand: async (command, args) => {
                commands.push([command, ...args]);
                if (args[0] === 'jlist') {
                    return { stdout: pm2Inventory(harness.root) };
                }
                if (args[0] === 'restart' &&
                    commands.filter(item => item[1] === 'restart').length === 2) {
                    assert.equal(
                        fs.readFileSync(harness.envPath, 'utf8'),
                        harness.raw
                    );
                }
                return { stdout: '' };
            },
            healthCheck: async () => {
                healthCalls += 1;
                if (healthCalls === 1) return true;
                if (healthCalls <= 13) return false;
                return true;
            },
            atomicDirectorySync: () => {
                syncCalls += 1;
                if (syncCalls === 2) {
                    throw new Error('forced_rollback_sync_failure');
                }
            },
            now: () => new Date('2026-07-31T12:00:00.000Z')
        }), /open_finance_activation_rollback_durability_failed:/);
        assert.equal(fs.readFileSync(harness.envPath, 'utf8'), harness.raw);
        assert.deepEqual(commands.map(item => item.slice(0, 3)), [
            ['pm2', 'jlist'],
            ['pm2', 'restart', 'financas-bot'],
            ['pm2', 'restart', 'financas-bot'],
            ['pm2', 'save']
        ]);
    } finally {
        harness.close();
    }
});

test('PROD-ACT-01 rejects unhealthy runtime before backup or mutation', async () => {
    const harness = createHarness();
    const commands = [];
    try {
        await assert.rejects(() => applyActivationStage({
            targetRoot: harness.root,
            stage: 'prompt',
            expectedCommitSha: COMMIT,
            confirmConfigChange: true,
            runCommand: async (command, args) => {
                commands.push([command, ...args]);
                return { stdout: pm2Inventory(harness.root) };
            },
            healthCheck: async () => false
        }), /open_finance_activation_pre_health_failed/);
        assert.deepEqual(commands, [['pm2', 'jlist']]);
        assert.equal(fs.readFileSync(harness.envPath, 'utf8'), harness.raw);
        assert.equal(fs.readdirSync(
            path.join(harness.root, 'data', 'backups')
        ).length, 0);
    } finally {
        harness.close();
    }
});

test('PROD-ACT-01 rejects commit mismatch before backup or restart', async () => {
    const harness = createHarness();
    const commands = [];
    try {
        await assert.rejects(() => applyActivationStage({
            targetRoot: harness.root,
            stage: 'prompt',
            expectedCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            confirmConfigChange: true,
            runCommand: async (command, args) => {
                commands.push([command, ...args]);
                return { stdout: pm2Inventory(harness.root) };
            },
            healthCheck: async () => true
        }), /open_finance_activation_commit_mismatch/);
        assert.deepEqual(commands, [['pm2', 'jlist']]);
        assert.equal(fs.readFileSync(harness.envPath, 'utf8'), harness.raw);
        assert.equal(fs.readdirSync(
            path.join(harness.root, 'data', 'backups')
        ).length, 0);
    } finally {
        harness.close();
    }
});
