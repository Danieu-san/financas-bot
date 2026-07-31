'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    applyFamilyPolicy,
    buildFamilyPolicyPlan,
    familyPolicyPayload,
    parsePolicies
} = require('../scripts/release/openFinanceFamilyPolicyRelease');

const COMMIT = '8f89aec906439dba0024318bddee8d255747b54f';

function ownerPolicy(alias, owner) {
    return {
        alias,
        source_owner: owner,
        authorized_viewers: [owner],
        whatsapp_recipient: owner,
        family_aggregation_allowed: false,
        write_confirmation_principal: owner
    };
}

function createHarness() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'of-family-policy-'));
    const data = path.join(root, 'data');
    fs.mkdirSync(path.join(data, 'backups'), { recursive: true });
    const required = {
        OPEN_FINANCE_LIVE_STAGING_SECRET_FILE: path.join(data, 'secret'),
        OPEN_FINANCE_REVOCATION_JOURNAL_DB: path.join(data, 'journal.sqlite'),
        OPEN_FINANCE_SHADOW_PREVIEW_DB: path.join(data, 'preview.sqlite'),
        OPEN_FINANCE_OUTBOX_DB: path.join(data, 'outbox.sqlite')
    };
    for (const file of Object.values(required)) fs.writeFileSync(file, 'x');
    const policyPath = path.join(data, 'visibility.json');
    const policies = [
        ownerPolicy('daniel_nubank', 'daniel'),
        ownerPolicy('thais_nubank', 'thais')
    ];
    const policyRaw = `${JSON.stringify(policies, null, 2)}\n`;
    fs.writeFileSync(policyPath, policyRaw);
    const env = {
        OPEN_FINANCE_ALERT_MODE: 'canary',
        OPEN_FINANCE_RECONCILIATION_MODE: 'canary',
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: 'canary',
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_WRITE_APPROVED: 'false',
        OPEN_FINANCE_VISIBILITY_POLICY_FILE: policyPath,
        ...required
    };
    fs.writeFileSync(
        path.join(root, '.env'),
        `${Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n')}\n`
    );
    return {
        root,
        policyPath,
        policyRaw,
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

test('OF-FAMILY-ACT-01 plans all sources for the authorized couple only', () => {
    const policies = [
        ownerPolicy('daniel_nubank', 'daniel'),
        ownerPolicy('thais_nubank', 'thais')
    ];
    const plan = buildFamilyPolicyPlan(policies);
    assert.equal(plan.changed, 2);
    assert.equal(plan.financial_write_enabled, false);
    assert.deepEqual(plan.next.map(policy => policy.authorized_viewers), [
        ['daniel', 'thais'],
        ['daniel', 'thais']
    ]);
    assert.ok(plan.next.every(policy => policy.family_aggregation_allowed));
    assert.deepEqual(
        plan.next.map(policy => policy.write_confirmation_principal),
        ['daniel', 'thais']
    );
});

test('OF-FAMILY-ACT-01 fails closed on invalid or mixed policies', () => {
    assert.throws(() => parsePolicies('{'), /policy_json_invalid/);
    assert.throws(() => parsePolicies('[]'), /policy_empty/);
    assert.throws(() => buildFamilyPolicyPlan([
        ownerPolicy('daniel_nubank', 'daniel'),
        {
            ...ownerPolicy('thais_nubank', 'thais'),
            authorized_viewers: ['daniel', 'thais'],
            family_aggregation_allowed: true
        }
    ]), /mixed_open_finance_visibility_mode/);
});

test('OF-FAMILY-ACT-01 preserves unrelated policy fields', () => {
    const policy = {
        ...ownerPolicy('daniel_nubank', 'daniel'),
        generation: 7,
        note: 'preserve'
    };
    const { payload } = familyPolicyPayload(`${JSON.stringify([policy])}\n`);
    const [next] = JSON.parse(payload);
    assert.equal(next.generation, 7);
    assert.equal(next.note, 'preserve');
    assert.deepEqual(next.authorized_viewers, ['daniel', 'thais']);
    assert.equal(next.family_aggregation_allowed, true);
});

test('OF-FAMILY-ACT-01 applies atomically with private exact backup and zero write', async () => {
    const harness = createHarness();
    const commands = [];
    try {
        const result = await applyFamilyPolicy({
            targetRoot: harness.root,
            expectedCommitSha: COMMIT,
            confirmConfigChange: true,
            healthAttempts: 12,
            healthDelayMs: 0,
            runCommand: async (command, args) => {
                commands.push([command, ...args]);
                return args[0] === 'jlist'
                    ? { stdout: pm2Inventory(harness.root) }
                    : { stdout: '' };
            },
            healthCheck: async () => true,
            now: () => new Date('2026-07-31T12:00:00.000Z')
        });
        const current = JSON.parse(fs.readFileSync(harness.policyPath, 'utf8'));
        assert.ok(current.every(policy => policy.family_aggregation_allowed));
        assert.ok(current.every(policy =>
            JSON.stringify(policy.authorized_viewers) ===
            JSON.stringify(['daniel', 'thais'])
        ));
        assert.equal(result.financial_write_enabled, false);
        assert.equal(result.rollback_performed, false);
        assert.equal(
            fs.readFileSync(path.join(harness.root, result.backup_file), 'utf8'),
            harness.policyRaw
        );
        assert.deepEqual(commands.map(item => item.slice(0, 3)), [
            ['pm2', 'jlist'],
            ['pm2', 'restart', 'financas-bot'],
            ['pm2', 'save']
        ]);
    } finally {
        harness.close();
    }
});

test('OF-FAMILY-ACT-01 restores exact policy after failed readiness', async () => {
    const harness = createHarness();
    let healthCalls = 0;
    let restarts = 0;
    try {
        await assert.rejects(() => applyFamilyPolicy({
            targetRoot: harness.root,
            expectedCommitSha: COMMIT,
            confirmConfigChange: true,
            healthAttempts: 12,
            healthDelayMs: 0,
            runCommand: async (_command, args) => {
                if (args[0] === 'jlist') {
                    return { stdout: pm2Inventory(harness.root) };
                }
                if (args[0] === 'restart') restarts += 1;
                return { stdout: '' };
            },
            healthCheck: async () => {
                healthCalls += 1;
                if (healthCalls === 1) return true;
                if (healthCalls <= 13) return false;
                return true;
            },
            now: () => new Date('2026-07-31T12:00:00.000Z')
        }), /rolled_back:open_finance_family_policy_health_failed/);
        assert.equal(restarts, 2);
        assert.equal(fs.readFileSync(harness.policyPath, 'utf8'), harness.policyRaw);
    } finally {
        harness.close();
    }
});

test('OF-FAMILY-ACT-01 restarts restored policy after post-rename sync failure', async () => {
    const harness = createHarness();
    let syncCalls = 0;
    let restarts = 0;
    try {
        await assert.rejects(() => applyFamilyPolicy({
            targetRoot: harness.root,
            expectedCommitSha: COMMIT,
            confirmConfigChange: true,
            healthAttempts: 12,
            healthDelayMs: 0,
            runCommand: async (_command, args) => {
                if (args[0] === 'jlist') {
                    return { stdout: pm2Inventory(harness.root) };
                }
                if (args[0] === 'restart') {
                    restarts += 1;
                    assert.equal(
                        fs.readFileSync(harness.policyPath, 'utf8'),
                        harness.policyRaw
                    );
                }
                return { stdout: '' };
            },
            healthCheck: async () => true,
            atomicDirectorySync: () => {
                syncCalls += 1;
                if (syncCalls === 1) throw new Error('forced_sync_failure');
            },
            now: () => new Date('2026-07-31T12:00:00.000Z')
        }), /rolled_back:forced_sync_failure/);
        assert.equal(syncCalls, 2);
        assert.equal(restarts, 1);
        assert.equal(fs.readFileSync(harness.policyPath, 'utf8'), harness.policyRaw);
    } finally {
        harness.close();
    }
});

test('OF-FAMILY-ACT-01 refuses mutation unless prompt-only and confirmed', async () => {
    const harness = createHarness();
    try {
        await assert.rejects(() => applyFamilyPolicy({
            targetRoot: harness.root,
            expectedCommitSha: COMMIT
        }), /policy_confirmation_required/);
        const envPath = path.join(harness.root, '.env');
        fs.writeFileSync(
            envPath,
            fs.readFileSync(envPath, 'utf8')
                .replace('OPEN_FINANCE_WRITE_MODE=off', 'OPEN_FINANCE_WRITE_MODE=confirm')
        );
        await assert.rejects(() => applyFamilyPolicy({
            targetRoot: harness.root,
            expectedCommitSha: COMMIT,
            confirmConfigChange: true
        }), /prompt_only_required/);
        assert.equal(fs.readFileSync(harness.policyPath, 'utf8'), harness.policyRaw);
    } finally {
        harness.close();
    }
});
