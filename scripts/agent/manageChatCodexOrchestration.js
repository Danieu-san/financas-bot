'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = 'financasbot-chat-codex-orchestration-v1';
const STATES = new Set([
    'CHAT_WORKING',
    'CODEX_READY',
    'CODEX_RUNNING',
    'CHAT_READY',
    'BLOCKED',
    'FAILED',
    'HUMAN_APPROVAL_REQUIRED',
    'FINISHED'
]);

const EXECUTOR_BY_STATE = Object.freeze({
    CHAT_WORKING: 'chat',
    CODEX_READY: 'codex',
    CODEX_RUNNING: 'codex',
    CHAT_READY: 'chat',
    BLOCKED: 'none',
    FAILED: 'none',
    HUMAN_APPROVAL_REQUIRED: 'human',
    FINISHED: 'none'
});

const TRANSITIONS = Object.freeze({
    CHAT_WORKING: new Set([
        'CODEX_READY',
        'BLOCKED',
        'FAILED',
        'HUMAN_APPROVAL_REQUIRED',
        'FINISHED'
    ]),
    CODEX_READY: new Set([
        'CODEX_RUNNING',
        'BLOCKED',
        'FAILED',
        'HUMAN_APPROVAL_REQUIRED'
    ]),
    CODEX_RUNNING: new Set([
        'CHAT_READY',
        'BLOCKED',
        'FAILED',
        'HUMAN_APPROVAL_REQUIRED'
    ]),
    CHAT_READY: new Set([
        'CHAT_WORKING',
        'BLOCKED',
        'FAILED',
        'HUMAN_APPROVAL_REQUIRED',
        'FINISHED'
    ]),
    BLOCKED: new Set(),
    FAILED: new Set(),
    HUMAN_APPROVAL_REQUIRED: new Set(),
    FINISHED: new Set()
});

const ALLOWED_KEYS = new Set([
    'schema',
    'orchestration_state',
    'next_executor',
    'task_id',
    'expected_base_sha',
    'task_file',
    'candidate_sha',
    'result_file',
    'updated_at'
]);

function isFullSha(value) {
    return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

function isSafeRepoPath(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) return false;
    if (path.isAbsolute(value)) return false;
    const normalized = value.replaceAll('\\', '/');
    if (normalized.startsWith('/') || normalized.startsWith('//')) return false;
    const parts = normalized.split('/');
    return !parts.some(part => part === '..' || part === '');
}

function isIsoTimestamp(value) {
    if (typeof value !== 'string' || !value) return false;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return false;
    return new Date(parsed).toISOString() === value;
}

function validateState(input) {
    const errors = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return ['estado deve ser objeto JSON'];
    }

    for (const key of Object.keys(input)) {
        if (!ALLOWED_KEYS.has(key)) errors.push(`campo extra não permitido: ${key}`);
    }
    for (const key of ALLOWED_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(input, key)) {
            errors.push(`campo obrigatório ausente: ${key}`);
        }
    }

    if (input.schema !== SCHEMA) errors.push(`schema inválido: ${input.schema}`);
    if (!STATES.has(input.orchestration_state)) {
        errors.push(`orchestration_state inválido: ${input.orchestration_state}`);
    } else if (input.next_executor !== EXECUTOR_BY_STATE[input.orchestration_state]) {
        errors.push(
            `next_executor incoerente: esperado ${EXECUTOR_BY_STATE[input.orchestration_state]}`
        );
    }

    if (typeof input.task_id !== 'string' || !/^[A-Z0-9][A-Z0-9._-]{1,63}$/.test(input.task_id)) {
        errors.push('task_id inválido');
    }
    if (!isFullSha(input.expected_base_sha)) errors.push('expected_base_sha inválido');
    if (!isSafeRepoPath(input.task_file)) errors.push('task_file inválido');
    if (input.candidate_sha !== null && !isFullSha(input.candidate_sha)) {
        errors.push('candidate_sha inválido');
    }
    if (input.result_file !== null && !isSafeRepoPath(input.result_file)) {
        errors.push('result_file inválido');
    }
    if (!isIsoTimestamp(input.updated_at)) errors.push('updated_at inválido');

    if (input.orchestration_state === 'CHAT_READY' && !input.result_file) {
        errors.push('CHAT_READY exige result_file');
    }
    if (input.orchestration_state === 'CODEX_RUNNING' && input.result_file !== null) {
        errors.push('CODEX_RUNNING não pode antecipar result_file');
    }

    return errors;
}

function parseState(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`JSON inválido: ${error.message}`);
    }
    const errors = validateState(parsed);
    if (errors.length) throw new Error(errors.join('; '));
    return parsed;
}

function serializeState(state) {
    return `${JSON.stringify(state, null, 2)}\n`;
}

function stateHash(raw) {
    const canonical = raw.replace(/\r\n?/g, '\n');
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function assertExpectedStateHash(raw, expectedHash) {
    if (expectedHash === undefined || expectedHash === null) return;
    if (!/^[0-9a-f]{64}$/i.test(expectedHash)) throw new Error('expected-state-hash inválido');
    const actual = stateHash(raw);
    if (actual !== expectedHash.toLowerCase()) {
        throw new Error(`estado mudou: esperado ${expectedHash.toLowerCase()}, atual ${actual}`);
    }
}

function transitionState(current, nextState, patch = {}, now = new Date()) {
    const currentErrors = validateState(current);
    if (currentErrors.length) throw new Error(`estado atual inválido: ${currentErrors.join('; ')}`);
    if (!STATES.has(nextState)) throw new Error(`estado de destino inválido: ${nextState}`);
    if (!TRANSITIONS[current.orchestration_state].has(nextState)) {
        throw new Error(`transição inválida: ${current.orchestration_state} -> ${nextState}`);
    }

    const allowedPatchKeys = new Set([
        'task_id',
        'expected_base_sha',
        'task_file',
        'candidate_sha',
        'result_file'
    ]);
    for (const key of Object.keys(patch)) {
        if (!allowedPatchKeys.has(key)) throw new Error(`patch não permitido: ${key}`);
    }

    const next = {
        ...current,
        ...patch,
        orchestration_state: nextState,
        next_executor: EXECUTOR_BY_STATE[nextState],
        updated_at: now.toISOString()
    };

    if (nextState === 'CODEX_READY') {
        next.candidate_sha = null;
        next.result_file = null;
    }
    if (nextState === 'CODEX_RUNNING') next.result_file = null;
    if (nextState === 'CHAT_WORKING' && current.orchestration_state === 'CHAT_READY') {
        next.candidate_sha = patch.candidate_sha ?? current.candidate_sha;
        next.result_file = patch.result_file ?? current.result_file;
    }

    const errors = validateState(next);
    if (errors.length) throw new Error(`estado de destino inválido: ${errors.join('; ')}`);
    return next;
}

function writeAtomically(filePath, content) {
    const directory = path.dirname(filePath);
    const temporary = path.join(
        directory,
        `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`
    );
    fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    try {
        fs.renameSync(temporary, filePath);
    } catch (error) {
        try { fs.rmSync(temporary, { force: true }); } catch {}
        throw error;
    }
}

function withStateLock(filePath, callback) {
    const lockPath = `${filePath}.lock`;
    let descriptor;
    try {
        descriptor = fs.openSync(lockPath, 'wx');
    } catch (error) {
        if (error.code === 'EEXIST') throw new Error(`estado já está sendo transicionado: ${lockPath}`);
        throw error;
    }
    try {
        return callback();
    } finally {
        fs.closeSync(descriptor);
        fs.rmSync(lockPath, { force: true });
    }
}

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = {};
    for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index];
        if (!token.startsWith('--')) throw new Error(`argumento inválido: ${token}`);
        const key = token.slice(2);
        const value = rest[index + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(`valor ausente para --${key}`);
        options[key] = value;
        index += 1;
    }
    return { command, options };
}

function defaultStatePath() {
    return path.resolve(
        __dirname,
        '..',
        '..',
        'docs',
        'agent-memory',
        'workstreams',
        'chat-codex-orchestration.state.json'
    );
}

function runCli(argv = process.argv.slice(2)) {
    const { command, options } = parseArgs(argv);
    const filePath = path.resolve(options.file || defaultStatePath());

    if (command === 'validate' || command === 'hash' || command === 'status') {
        const raw = fs.readFileSync(filePath, 'utf8');
        const state = parseState(raw);
        if (command === 'validate') {
            process.stdout.write(`${state.orchestration_state} ${state.next_executor}\n`);
            return;
        }
        if (command === 'hash') {
            process.stdout.write(`${stateHash(raw)}\n`);
            return;
        }
        process.stdout.write(`${JSON.stringify({
            hash: stateHash(raw),
            orchestration_state: state.orchestration_state,
            next_executor: state.next_executor,
            task_id: state.task_id,
            expected_base_sha: state.expected_base_sha
        })}\n`);
        return;
    }

    if (command === 'transition') {
        if (!options.to) throw new Error('transition exige --to');
        withStateLock(filePath, () => {
            const raw = fs.readFileSync(filePath, 'utf8');
            assertExpectedStateHash(raw, options['expected-state-hash']);
            const current = parseState(raw);
            const patch = {};
            const optionToField = {
                'task-id': 'task_id',
                'expected-base-sha': 'expected_base_sha',
                'task-file': 'task_file',
                'candidate-sha': 'candidate_sha',
                'result-file': 'result_file'
            };
            for (const [option, field] of Object.entries(optionToField)) {
                if (Object.prototype.hasOwnProperty.call(options, option)) patch[field] = options[option];
            }
            const next = transitionState(current, options.to, patch);
            writeAtomically(filePath, serializeState(next));
            process.stdout.write(`${next.orchestration_state} ${next.next_executor}\n`);
        });
        return;
    }

    throw new Error('comando esperado: validate | hash | status | transition');
}

if (require.main === module) {
    try {
        runCli();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    ALLOWED_KEYS,
    EXECUTOR_BY_STATE,
    SCHEMA,
    STATES,
    TRANSITIONS,
    assertExpectedStateHash,
    isFullSha,
    isSafeRepoPath,
    parseState,
    serializeState,
    stateHash,
    transitionState,
    validateState,
    withStateLock,
    writeAtomically
};
