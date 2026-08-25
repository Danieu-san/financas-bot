'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TASK_SCHEMA = 'financasbot-chat-codex-task-v1';
const TASK_KEYS = [
    'schema', 'task_id', 'objective', 'required_files', 'allowed_paths',
    'result_file', 'validation', 'constraints'
];
const DENIED_SEGMENTS = new Set([
    '.git', '.env', 'private', 'data', '.wwebjs_auth', 'node_modules'
]);
const DENIED_BASENAMES = new Set([
    'credentials.json', 'state_store.json', 'agents.md'
]);
const DENIED_PREFIXES = [
    '.github/', '.agents/', '.codex/', 'scripts/agent/',
    'docs/agent-memory/workstreams/chat-codex-orchestration',
    'docs/agent-memory/workstreams/chat-codex-channel'
];

function assertSafeRepoPath(value, name) {
    if (typeof value !== 'string' || !value || value.length > 240
        || !/^[A-Za-z0-9._/-]+$/.test(value) || value.includes('..')
        || path.isAbsolute(value) || value.startsWith('/') || value.includes('//')) {
        throw new Error(`${name} inválido`);
    }
    const segments = value.toLowerCase().split('/');
    if (segments.some(segment => DENIED_SEGMENTS.has(segment))
        || DENIED_BASENAMES.has(segments.at(-1))
        || DENIED_PREFIXES.some(prefix => value.toLowerCase().startsWith(prefix))) {
        throw new Error(`${name} sensível`);
    }
    return value;
}

function assertStringList(value, name, validator = item => item) {
    if (!Array.isArray(value) || value.length > 40) throw new Error(`${name} inválido`);
    const normalized = value.map((item, index) => {
        if (typeof item !== 'string' || !item.trim() || item.length > 1000
            || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(item)) {
            throw new Error(`${name}[${index}] inválido`);
        }
        return validator(item, `${name}[${index}]`);
    });
    if (new Set(normalized).size !== normalized.length) throw new Error(`${name} duplicado`);
    return normalized;
}

function validateTask(value, expectedTaskId) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || value.schema !== TASK_SCHEMA
        || Object.keys(value).length !== TASK_KEYS.length
        || Object.keys(value).some(key => !TASK_KEYS.includes(key))) {
        throw new Error('schema de tarefa inválido');
    }
    if (!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(value.task_id || '')
        || value.task_id !== expectedTaskId) throw new Error('task_id divergente');
    if (typeof value.objective !== 'string' || !value.objective.trim()
        || value.objective.length > 4000) throw new Error('objective inválido');
    const requiredFiles = assertStringList(
        value.required_files, 'required_files', assertSafeRepoPath
    );
    const allowedPaths = assertStringList(
        value.allowed_paths, 'allowed_paths', assertSafeRepoPath
    );
    if (allowedPaths.length === 0) throw new Error('allowed_paths vazio');
    const resultFile = assertSafeRepoPath(value.result_file, 'result_file');
    if (!resultFile.startsWith('docs/agent-memory/workstreams/results/')
        || !allowedPaths.includes(resultFile)) {
        throw new Error('result_file fora dos caminhos autorizados');
    }
    return {
        schema: TASK_SCHEMA,
        task_id: value.task_id,
        objective: value.objective.trim(),
        required_files: requiredFiles,
        allowed_paths: allowedPaths,
        result_file: resultFile,
        validation: assertStringList(value.validation, 'validation'),
        constraints: assertStringList(value.constraints, 'constraints')
    };
}

function assertPathTraversalSafe(repoPath, safePath, requireFile) {
    let current = fs.realpathSync(repoPath);
    for (const [index, segment] of safePath.split('/').entries()) {
        current = path.join(current, segment);
        if (!fs.existsSync(current)) {
            if (requireFile) throw new Error(`arquivo obrigatório ausente: ${safePath}`);
            return;
        }
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) throw new Error(`caminho por symlink recusado: ${safePath}`);
        const isLeaf = index === safePath.split('/').length - 1;
        if (!isLeaf && !stat.isDirectory()) throw new Error(`ancestral não é diretório: ${safePath}`);
        if (isLeaf && requireFile && !stat.isFile()) {
            throw new Error(`required_file deve ser arquivo regular: ${safePath}`);
        }
    }
}

function loadTaskDefinition(repoPath, taskPath, expectedTaskId) {
    const safeTaskPath = assertSafeRepoPath(taskPath, 'task_file');
    const fullPath = path.join(repoPath, ...safeTaskPath.split('/'));
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('task_file deve ser arquivo regular');
    const task = validateTask(JSON.parse(fs.readFileSync(fullPath, 'utf8')), expectedTaskId);
    if (task.allowed_paths.includes(safeTaskPath)) {
        throw new Error('task_file não pode ser gravável pelo executor');
    }
    for (const filePath of task.required_files) assertPathTraversalSafe(repoPath, filePath, true);
    for (const filePath of task.allowed_paths) assertPathTraversalSafe(repoPath, filePath, false);
    return task;
}

module.exports = {
    TASK_SCHEMA,
    assertPathTraversalSafe,
    assertSafeRepoPath,
    loadTaskDefinition,
    validateTask
};
