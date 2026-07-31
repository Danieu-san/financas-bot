'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const {
    evaluateOpenFinanceWriteActivation
} = require('../../src/openFinance/openFinanceWriteActivationPolicy');
const {
    parseCurrentPm2Process
} = require('./ociArtifactRelease');

const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const STAGES = new Set(['prompt', 'confirm', 'write-off', 'off']);
const HEALTH_ATTEMPTS_MIN = 12;
const HEALTH_ATTEMPTS_MAX = 60;
const PRIVATE_FILE_MODE = 0o600;
const SAFE_FLAG_KEYS = Object.freeze([
    'OPEN_FINANCE_ALERT_MODE',
    'OPEN_FINANCE_RECONCILIATION_MODE',
    'OPEN_FINANCE_SHADOW_PREVIEW_MODE',
    'OPEN_FINANCE_SAVE_PROPOSAL_MODE',
    'OPEN_FINANCE_WRITE_MODE',
    'OPEN_FINANCE_WRITE_APPROVED'
]);

function normalize(value, fallback = '') {
    return String(value ?? fallback).trim().toLowerCase();
}

function argumentValue(args, name, fallback = null) {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
}

function parseHealthAttempts(value = HEALTH_ATTEMPTS_MIN) {
    const raw = String(value);
    if (!/^\d+$/.test(raw)) {
        throw new Error('open_finance_activation_health_attempts_invalid');
    }
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) ||
        parsed < HEALTH_ATTEMPTS_MIN ||
        parsed > HEALTH_ATTEMPTS_MAX) {
        throw new Error('open_finance_activation_health_attempts_invalid');
    }
    return parsed;
}

function safeFlagSnapshot(env = {}) {
    return Object.freeze({
        OPEN_FINANCE_ALERT_MODE: normalize(env.OPEN_FINANCE_ALERT_MODE, 'off'),
        OPEN_FINANCE_RECONCILIATION_MODE: normalize(
            env.OPEN_FINANCE_RECONCILIATION_MODE,
            'off'
        ),
        OPEN_FINANCE_SHADOW_PREVIEW_MODE: normalize(
            env.OPEN_FINANCE_SHADOW_PREVIEW_MODE,
            'off'
        ),
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: normalize(
            env.OPEN_FINANCE_SAVE_PROPOSAL_MODE,
            'off'
        ),
        OPEN_FINANCE_WRITE_MODE: normalize(
            env.OPEN_FINANCE_WRITE_MODE,
            'off'
        ),
        OPEN_FINANCE_WRITE_APPROVED: normalize(
            env.OPEN_FINANCE_WRITE_APPROVED,
            'false'
        )
    });
}

function assertCanaryPrerequisites(env) {
    const current = safeFlagSnapshot(env);
    if (current.OPEN_FINANCE_ALERT_MODE !== 'canary') {
        throw new Error('open_finance_activation_alert_canary_required');
    }
    if (current.OPEN_FINANCE_RECONCILIATION_MODE !== 'canary') {
        throw new Error('open_finance_activation_reconciliation_canary_required');
    }
    if (current.OPEN_FINANCE_SHADOW_PREVIEW_MODE !== 'canary') {
        throw new Error('open_finance_activation_preview_canary_required');
    }
}

function assertRequiredStateFiles(env, { existsSync = fs.existsSync } = {}) {
    const required = [
        ['OPEN_FINANCE_LIVE_STAGING_SECRET_FILE',
            env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE],
        ['OPEN_FINANCE_REVOCATION_JOURNAL_DB',
            env.OPEN_FINANCE_REVOCATION_JOURNAL_DB],
        ['OPEN_FINANCE_SHADOW_PREVIEW_DB',
            env.OPEN_FINANCE_SHADOW_PREVIEW_DB],
        ['OPEN_FINANCE_OUTBOX_DB', env.OPEN_FINANCE_OUTBOX_DB]
    ];
    for (const [name, file] of required) {
        if (!file || !existsSync(file)) {
            throw new Error(
                `open_finance_activation_state_unavailable:${name}`
            );
        }
    }
}

function stageUpdates(stage) {
    if (!STAGES.has(stage)) {
        throw new Error('open_finance_activation_stage_invalid');
    }
    if (stage === 'off') {
        return {
            OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'off',
            OPEN_FINANCE_WRITE_MODE: 'off',
            OPEN_FINANCE_WRITE_APPROVED: 'false'
        };
    }
    if (stage === 'confirm') {
        return {
            OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
            OPEN_FINANCE_WRITE_MODE: 'confirm',
            OPEN_FINANCE_WRITE_APPROVED: 'true'
        };
    }
    return {
        OPEN_FINANCE_SAVE_PROPOSAL_MODE: 'prompt',
        OPEN_FINANCE_WRITE_MODE: 'off',
        OPEN_FINANCE_WRITE_APPROVED: 'false'
    };
}

function buildActivationPlan(env, {
    stage,
    existsSync = fs.existsSync
} = {}) {
    if (!STAGES.has(stage)) {
        throw new Error('open_finance_activation_stage_invalid');
    }
    const current = safeFlagSnapshot(env);
    if (stage !== 'off') {
        assertCanaryPrerequisites(env);
        assertRequiredStateFiles(env, { existsSync });
    }
    const nextEnv = { ...env, ...stageUpdates(stage) };
    const next = safeFlagSnapshot(nextEnv);
    const activation = evaluateOpenFinanceWriteActivation(nextEnv);
    if (stage === 'confirm' && !activation.enabled) {
        throw new Error(
            activation.blockers[0] ||
            'open_finance_activation_confirm_invalid'
        );
    }
    if (stage !== 'confirm' && activation.enabled) {
        throw new Error('open_finance_activation_non_confirm_write_enabled');
    }
    return Object.freeze({
        stage,
        current,
        next,
        financial_write_enabled: activation.enabled,
        blockers: [...activation.blockers],
        rollback_stage: stage === 'confirm' ? 'write-off' : 'off'
    });
}

function assertNoDuplicateFlags(raw) {
    const counts = new Map();
    for (const line of String(raw).split(/\r?\n/)) {
        const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
        if (!match || !SAFE_FLAG_KEYS.includes(match[1])) continue;
        counts.set(match[1], (counts.get(match[1]) || 0) + 1);
    }
    if ([...counts.values()].some(count => count > 1)) {
        throw new Error('open_finance_activation_duplicate_flag');
    }
}

function updateEnvPayload(raw, updates) {
    assertNoDuplicateFlags(raw);
    const newline = String(raw).includes('\r\n') ? '\r\n' : '\n';
    const lines = String(raw).split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    const pending = new Map(Object.entries(updates));
    const output = lines.map(line => {
        const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
        if (!match || !pending.has(match[1])) return line;
        const value = pending.get(match[1]);
        pending.delete(match[1]);
        return `${match[1]}=${value}`;
    });
    for (const [key, value] of pending) output.push(`${key}=${value}`);
    return `${output.join(newline)}${newline}`;
}

function syncDirectory(directory) {
    let handle;
    try {
        handle = fs.openSync(directory, 'r');
        try {
            fs.fsyncSync(handle);
        } catch (error) {
            if (process.platform !== 'win32' ||
                !['EPERM', 'EINVAL'].includes(error?.code)) {
                throw error;
            }
        }
    } finally {
        if (handle !== undefined) fs.closeSync(handle);
    }
}

function writePrivateNew(file, payload) {
    fs.mkdirSync(path.dirname(file), {
        recursive: true,
        mode: 0o700
    });
    fs.chmodSync(path.dirname(file), 0o700);
    let handle;
    try {
        handle = fs.openSync(file, 'wx', PRIVATE_FILE_MODE);
        fs.writeFileSync(handle, payload);
        fs.fsyncSync(handle);
    } finally {
        if (handle !== undefined) fs.closeSync(handle);
    }
    fs.chmodSync(file, PRIVATE_FILE_MODE);
    syncDirectory(path.dirname(file));
}

function writePrivateAtomic(file, payload) {
    const directory = path.dirname(file);
    const temporary = path.join(
        directory,
        `.${path.basename(file)}.activation-${process.pid}-${Date.now()}`
    );
    let handle;
    try {
        handle = fs.openSync(temporary, 'wx', PRIVATE_FILE_MODE);
        fs.writeFileSync(handle, payload);
        fs.fsyncSync(handle);
        fs.closeSync(handle);
        handle = undefined;
        fs.chmodSync(temporary, PRIVATE_FILE_MODE);
        fs.renameSync(temporary, file);
        syncDirectory(directory);
    } finally {
        if (handle !== undefined) fs.closeSync(handle);
        if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    }
}

async function defaultRunCommand(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: options.cwd,
        env: options.env || process.env,
        encoding: 'utf8',
        windowsHide: true
    });
    if (result.error || result.status !== 0) {
        throw new Error(
            `open_finance_activation_command_failed:${command}`
        );
    }
    return result;
}

async function defaultHealthCheck(url) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.ok === true &&
        body?.sqlite === true &&
        body?.whatsapp === true &&
        body?.whatsappStatus === 'ready' &&
        body?.whatsappLiveness === 'healthy';
}

async function waitForHealthy({
    healthCheck,
    healthUrl,
    attempts,
    delayMs
}) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            if (await healthCheck(healthUrl)) return true;
        } catch {
            // Retry inside the bounded readiness window.
        }
        if (attempt < attempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    return false;
}

function timestamp(now = new Date()) {
    return now.toISOString().replace(/[:.]/g, '-');
}

async function applyActivationStage({
    targetRoot,
    stage,
    expectedCommitSha,
    processName = 'financas-bot',
    healthUrl = 'http://127.0.0.1:8787/dashboard/health',
    healthAttempts = HEALTH_ATTEMPTS_MIN,
    healthDelayMs = 5000,
    confirmConfigChange = false,
    confirmFinancialWrite = false,
    confirmUserPresent = false,
    runCommand = defaultRunCommand,
    healthCheck = defaultHealthCheck,
    now = () => new Date()
}) {
    if (!confirmConfigChange) {
        throw new Error(
            'open_finance_activation_config_change_confirmation_required'
        );
    }
    if (!COMMIT_PATTERN.test(String(expectedCommitSha || ''))) {
        throw new Error('open_finance_activation_expected_commit_invalid');
    }
    if (stage === 'confirm' &&
        (!confirmFinancialWrite || !confirmUserPresent)) {
        throw new Error(
            'open_finance_activation_live_confirmation_required'
        );
    }
    const attempts = parseHealthAttempts(healthAttempts);
    const root = path.resolve(targetRoot);
    const envPath = path.join(root, '.env');
    const raw = fs.readFileSync(envPath, 'utf8');
    const parsed = dotenv.parse(raw);
    const plan = buildActivationPlan(parsed, {
        stage,
        existsSync: file => fs.existsSync(
            path.isAbsolute(file) ? file : path.join(root, file)
        )
    });
    const nextPayload = updateEnvPayload(raw, stageUpdates(stage));

    const inventory = await runCommand('pm2', ['jlist'], { cwd: root });
    const current = parseCurrentPm2Process(inventory, {
        processName,
        targetRoot: root
    });
    if (current.appCommitSha !== expectedCommitSha) {
        throw new Error('open_finance_activation_commit_mismatch');
    }
    if (!await healthCheck(healthUrl)) {
        throw new Error('open_finance_activation_pre_health_failed');
    }

    const backupRoot = path.join(root, 'data', 'backups');
    const backupPath = path.join(
        backupRoot,
        `.env.pre-open-finance-${stage}-${timestamp(now())}`
    );
    writePrivateNew(backupPath, raw);
    let envChanged = false;
    try {
        writePrivateAtomic(envPath, nextPayload);
        envChanged = true;
        await runCommand(
            'pm2',
            ['restart', processName, '--update-env'],
            {
                cwd: root,
                env: {
                    ...process.env,
                    APP_COMMIT_SHA: expectedCommitSha
                }
            }
        );
        if (!await waitForHealthy({
            healthCheck,
            healthUrl,
            attempts,
            delayMs: healthDelayMs
        })) {
            throw new Error('open_finance_activation_health_failed');
        }
        await runCommand('pm2', ['save'], { cwd: root });
        return Object.freeze({
            applied: true,
            stage,
            commit_sha: expectedCommitSha,
            script: current.script,
            health_url: healthUrl,
            financial_write_enabled: plan.financial_write_enabled,
            flags: plan.next,
            backup_file: path.relative(root, backupPath)
                .replaceAll('\\', '/'),
            rollback_performed: false
        });
    } catch (error) {
        if (!envChanged) throw error;
        writePrivateAtomic(envPath, raw);
        await runCommand(
            'pm2',
            ['restart', processName, '--update-env'],
            {
                cwd: root,
                env: {
                    ...process.env,
                    APP_COMMIT_SHA: expectedCommitSha
                }
            }
        );
        if (!await waitForHealthy({
            healthCheck,
            healthUrl,
            attempts,
            delayMs: healthDelayMs
        })) {
            throw new Error(
                `open_finance_activation_rollback_health_failed:${error.message}`
            );
        }
        await runCommand('pm2', ['save'], { cwd: root });
        throw new Error(
            `open_finance_activation_rolled_back:${error.message}`
        );
    }
}

function readPlan({ envPath, stage }) {
    const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    const root = path.dirname(envPath);
    return buildActivationPlan(parsed, {
        stage,
        existsSync: file => fs.existsSync(
            path.isAbsolute(file) ? file : path.join(root, file)
        )
    });
}

async function main(args = process.argv.slice(2)) {
    const command = args[0];
    const targetRoot = path.resolve(
        argumentValue(args, '--target', process.cwd())
    );
    const stage = normalize(argumentValue(args, '--stage'));
    const envPath = path.resolve(
        argumentValue(args, '--env', path.join(targetRoot, '.env'))
    );
    if (command === 'plan') {
        process.stdout.write(`${JSON.stringify(
            readPlan({ envPath, stage }),
            null,
            2
        )}\n`);
        return;
    }
    if (command === 'apply') {
        const result = await applyActivationStage({
            targetRoot,
            stage,
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
            confirmConfigChange: args.includes('--confirm-config-change'),
            confirmFinancialWrite: args.includes('--confirm-financial-write'),
            confirmUserPresent: args.includes('--confirm-user-present')
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
    SAFE_FLAG_KEYS,
    applyActivationStage,
    buildActivationPlan,
    parseHealthAttempts,
    safeFlagSnapshot,
    stageUpdates,
    updateEnvPayload,
    waitForHealthy
};
