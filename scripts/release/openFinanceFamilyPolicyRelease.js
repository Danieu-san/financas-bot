'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const {
    normalizePolicies
} = require('../../src/openFinance/openFinanceAlertOutbox');
const {
    familySharingEnabled
} = require('../../src/openFinance/openFinanceCanaryRuntime');
const {
    parseCurrentPm2Process
} = require('./ociArtifactRelease');
const {
    buildActivationPlan,
    defaultHealthCheck,
    defaultRunCommand,
    parseHealthAttempts,
    syncDirectory,
    timestamp,
    waitForHealthy,
    writePrivateAtomic,
    writePrivateNew
} = require('./openFinanceActivationRelease');

const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const HEALTH_ATTEMPTS_MIN = 12;

function argumentValue(args, name, fallback = null) {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
}

function policySummary(policies) {
    return policies.map(policy => ({
        alias: String(policy.alias || '').toLowerCase(),
        source_owner: String(policy.source_owner || '').toLowerCase(),
        authorized_viewers: [...policy.authorized_viewers],
        whatsapp_recipient: String(policy.whatsapp_recipient || '').toLowerCase(),
        write_confirmation_principal: String(
            policy.write_confirmation_principal || ''
        ).toLowerCase(),
        family_aggregation_allowed: policy.family_aggregation_allowed === true
    }));
}

function parsePolicies(raw) {
    let policies;
    try {
        policies = JSON.parse(String(raw));
    } catch {
        throw new Error('open_finance_family_policy_json_invalid');
    }
    if (!Array.isArray(policies) || policies.length === 0) {
        throw new Error('open_finance_family_policy_empty');
    }
    normalizePolicies(policies);
    familySharingEnabled(policies);
    return policies;
}

function buildFamilyPolicyPlan(policies) {
    parsePolicies(JSON.stringify(policies));
    const nextPolicies = policies.map(policy => ({
        ...policy,
        authorized_viewers: ['daniel', 'thais'],
        family_aggregation_allowed: true
    }));
    normalizePolicies(nextPolicies);
    if (!familySharingEnabled(nextPolicies)) {
        throw new Error('open_finance_family_policy_activation_failed');
    }
    const current = policySummary(policies);
    const next = policySummary(nextPolicies);
    const changed = current.filter((policy, index) =>
        JSON.stringify(policy) !== JSON.stringify(next[index])
    ).length;
    return Object.freeze({
        stage: 'family',
        current,
        next,
        changed,
        financial_write_enabled: false,
        rollback: 'exact_private_backup'
    });
}

function familyPolicyPayload(raw) {
    const policies = parsePolicies(raw);
    const plan = buildFamilyPolicyPlan(policies);
    const nextPolicies = policies.map(policy => ({
        ...policy,
        authorized_viewers: ['daniel', 'thais'],
        family_aggregation_allowed: true
    }));
    return {
        plan,
        payload: `${JSON.stringify(nextPolicies, null, 2)}\n`
    };
}

function resolvePrivatePath(root, value, code) {
    if (!value) throw new Error(code);
    const resolved = path.resolve(path.isAbsolute(value) ? value : path.join(root, value));
    if (!fs.existsSync(resolved)) throw new Error(code);
    return resolved;
}

function readFamilyPolicyPlan({ targetRoot, envPath = null }) {
    const root = path.resolve(targetRoot);
    const resolvedEnv = path.resolve(envPath || path.join(root, '.env'));
    const env = dotenv.parse(fs.readFileSync(resolvedEnv, 'utf8'));
    const activation = buildActivationPlan(env, {
        stage: 'prompt',
        existsSync: file => fs.existsSync(
            path.isAbsolute(file) ? file : path.join(root, file)
        )
    });
    if (activation.current.OPEN_FINANCE_SAVE_PROPOSAL_MODE !== 'prompt' ||
        activation.current.OPEN_FINANCE_WRITE_MODE !== 'off' ||
        activation.current.OPEN_FINANCE_WRITE_APPROVED !== 'false') {
        throw new Error('open_finance_family_policy_prompt_only_required');
    }
    const policyPath = resolvePrivatePath(
        root,
        env.OPEN_FINANCE_VISIBILITY_POLICY_FILE,
        'open_finance_family_policy_unavailable'
    );
    return {
        ...familyPolicyPayload(fs.readFileSync(policyPath, 'utf8')).plan,
        policyPath
    };
}

async function applyFamilyPolicy({
    targetRoot,
    expectedCommitSha,
    processName = 'financas-bot',
    healthUrl = 'http://127.0.0.1:8787/dashboard/health',
    healthAttempts = HEALTH_ATTEMPTS_MIN,
    healthDelayMs = 5000,
    confirmConfigChange = false,
    runCommand = defaultRunCommand,
    healthCheck = defaultHealthCheck,
    now = () => new Date(),
    observeTransition = () => {},
    atomicDirectorySync = syncDirectory
}) {
    if (!confirmConfigChange) {
        throw new Error('open_finance_family_policy_confirmation_required');
    }
    if (!COMMIT_PATTERN.test(String(expectedCommitSha || ''))) {
        throw new Error('open_finance_family_policy_expected_commit_invalid');
    }
    const attempts = parseHealthAttempts(healthAttempts);
    const root = path.resolve(targetRoot);
    const envPath = path.join(root, '.env');
    const env = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    const activation = buildActivationPlan(env, {
        stage: 'prompt',
        existsSync: file => fs.existsSync(
            path.isAbsolute(file) ? file : path.join(root, file)
        )
    });
    if (activation.current.OPEN_FINANCE_SAVE_PROPOSAL_MODE !== 'prompt' ||
        activation.current.OPEN_FINANCE_WRITE_MODE !== 'off' ||
        activation.current.OPEN_FINANCE_WRITE_APPROVED !== 'false') {
        throw new Error('open_finance_family_policy_prompt_only_required');
    }
    const policyPath = resolvePrivatePath(
        root,
        env.OPEN_FINANCE_VISIBILITY_POLICY_FILE,
        'open_finance_family_policy_unavailable'
    );
    const raw = fs.readFileSync(policyPath, 'utf8');
    const { plan, payload } = familyPolicyPayload(raw);

    const inventory = await runCommand('pm2', ['jlist'], { cwd: root });
    const current = parseCurrentPm2Process(inventory, {
        processName,
        targetRoot: root
    });
    if (current.appCommitSha !== expectedCommitSha) {
        throw new Error('open_finance_family_policy_commit_mismatch');
    }
    if (!await healthCheck(healthUrl)) {
        throw new Error('open_finance_family_policy_pre_health_failed');
    }
    if (plan.changed === 0) {
        return Object.freeze({
            applied: false,
            stage: 'family',
            commit_sha: expectedCommitSha,
            script: current.script,
            health_url: healthUrl,
            financial_write_enabled: false,
            policy: plan.next,
            backup_file: null,
            rollback_performed: false
        });
    }

    const backupRoot = path.join(root, 'data', 'backups');
    const backupPath = path.join(
        backupRoot,
        `visibility-policy.pre-family-${timestamp(now())}.json`
    );
    writePrivateNew(backupPath, raw);
    observeTransition('backup_durable', { backupPath, policyPath });
    let policyChanged = false;
    try {
        writePrivateAtomic(policyPath, payload, {
            onReplaced: () => {
                policyChanged = true;
            },
            syncDirectoryFn: atomicDirectorySync
        });
        observeTransition('policy_replaced', { backupPath, policyPath });
        await runCommand('pm2', ['restart', processName, '--update-env'], {
            cwd: root,
            env: { ...process.env, APP_COMMIT_SHA: expectedCommitSha }
        });
        if (!await waitForHealthy({
            healthCheck,
            healthUrl,
            attempts,
            delayMs: healthDelayMs
        })) {
            throw new Error('open_finance_family_policy_health_failed');
        }
        await runCommand('pm2', ['save'], { cwd: root });
        return Object.freeze({
            applied: true,
            stage: 'family',
            commit_sha: expectedCommitSha,
            script: current.script,
            health_url: healthUrl,
            financial_write_enabled: false,
            policy: plan.next,
            backup_file: path.relative(root, backupPath).replaceAll('\\', '/'),
            rollback_performed: false
        });
    } catch (error) {
        if (!policyChanged) throw error;
        let policyRestored = false;
        let rollbackDurabilityError = null;
        try {
            writePrivateAtomic(policyPath, raw, {
                onReplaced: () => {
                    policyRestored = true;
                },
                syncDirectoryFn: atomicDirectorySync
            });
        } catch (restoreError) {
            if (!policyRestored) {
                throw new Error(
                    `open_finance_family_policy_rollback_restore_failed:` +
                    `${error.message}:${restoreError.message}`
                );
            }
            rollbackDurabilityError = restoreError;
        }
        observeTransition('policy_restored', { backupPath, policyPath });
        await runCommand('pm2', ['restart', processName, '--update-env'], {
            cwd: root,
            env: { ...process.env, APP_COMMIT_SHA: expectedCommitSha }
        });
        if (!await waitForHealthy({
            healthCheck,
            healthUrl,
            attempts,
            delayMs: healthDelayMs
        })) {
            throw new Error(
                `open_finance_family_policy_rollback_health_failed:${error.message}`
            );
        }
        await runCommand('pm2', ['save'], { cwd: root });
        if (rollbackDurabilityError) {
            throw new Error(
                `open_finance_family_policy_rollback_durability_failed:` +
                `${error.message}:${rollbackDurabilityError.message}`
            );
        }
        throw new Error(`open_finance_family_policy_rolled_back:${error.message}`);
    }
}

async function main(args = process.argv.slice(2)) {
    const command = args[0];
    const targetRoot = path.resolve(
        argumentValue(args, '--target', process.cwd())
    );
    if (command === 'plan') {
        const { policyPath, ...plan } = readFamilyPolicyPlan({ targetRoot });
        process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
        return;
    }
    if (command === 'apply') {
        const result = await applyFamilyPolicy({
            targetRoot,
            expectedCommitSha: argumentValue(args, '--expected-commit'),
            processName: argumentValue(args, '--process', 'financas-bot'),
            healthUrl: argumentValue(
                args,
                '--health-url',
                'http://127.0.0.1:8787/dashboard/health'
            ),
            healthAttempts: argumentValue(
                args,
                '--health-attempts',
                HEALTH_ATTEMPTS_MIN
            ),
            confirmConfigChange: args.includes('--confirm-config-change')
        });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        return;
    }
    throw new Error('usage: plan|apply');
}

if (require.main === module) {
    main().catch(error => {
        process.stderr.write(`${JSON.stringify({
            ok: false,
            error: error.message
        })}\n`);
        process.exitCode = 1;
    });
}

module.exports = {
    applyFamilyPolicy,
    buildFamilyPolicyPlan,
    familyPolicyPayload,
    parsePolicies,
    policySummary,
    readFamilyPolicyPlan
};
