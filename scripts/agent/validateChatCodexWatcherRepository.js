'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function parseArgs(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index], value = argv[index + 1];
        if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) {
            throw new Error(`argumento inválido: ${key || '<vazio>'}`);
        }
        options[key.slice(2)] = value;
    }
    return options;
}

function required(options, name) {
    if (!options[name]) throw new Error(`--${name} é obrigatório`);
    return options[name];
}

function realDirectory(value, name) {
    if (!path.isAbsolute(value)) throw new Error(`${name} deve ser absoluto`);
    const resolved = fs.realpathSync(value);
    if (!fs.statSync(resolved).isDirectory()) throw new Error(`${name} não é diretório`);
    return resolved;
}

function realFile(value, name) {
    if (!path.isAbsolute(value)) throw new Error(`${name} deve ser absoluto`);
    const resolved = fs.realpathSync(value);
    if (!fs.statSync(resolved).isFile()) throw new Error(`${name} não é arquivo`);
    return resolved;
}

function realPathAllowMissing(value, name) {
    if (!path.isAbsolute(value)) throw new Error(`${name} deve ser absoluto`);
    let cursor = path.resolve(value);
    const suffix = [];
    while (!fs.existsSync(cursor)) {
        const parent = path.dirname(cursor);
        if (parent === cursor) throw new Error(`${name} não possui ancestral existente`);
        suffix.unshift(path.basename(cursor));
        cursor = parent;
    }
    return path.join(fs.realpathSync(cursor), ...suffix);
}

function runGit(gitPath, repo, args) {
    const result = spawnSync(gitPath, ['-c', `safe.directory=${repo}`, '-C', repo, ...args], {
        encoding: 'utf8', windowsHide: true, timeout: 60_000
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`git ${args[0]} falhou: ${(result.stderr || '').trim()}`);
    }
    return result.stdout.trim();
}

function normalizeOrigin(value) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^git@/i.test(value)) {
        return value.replace(/[\\/]$/, '').replace(/\.git$/i, '').toLowerCase();
    }
    return fs.realpathSync(path.resolve(value)).replaceAll('\\', '/')
        .replace(/\/$/, '').toLowerCase();
}

function validateRepository(options) {
    const repo = realDirectory(required(options, 'repo'), 'repo');
    const expectedRepo = realDirectory(required(options, 'expected-repo'), 'expected-repo');
    const runtime = realPathAllowMissing(required(options, 'runtime'), 'runtime');
    const gitPath = realFile(required(options, 'git'), 'git');
    const branch = required(options, 'branch');
    const expectedOrigin = required(options, 'expected-origin');

    if (repo.toLowerCase() !== expectedRepo.toLowerCase()) {
        throw new Error(`RepositoryRoot deve usar o clone Git dedicado: ${expectedRepo}`);
    }
    const gitMetadata = path.join(repo, '.git');
    if (!fs.existsSync(gitMetadata) || !fs.lstatSync(gitMetadata).isDirectory()) {
        throw new Error('RepositoryRoot deve ser um clone Git dedicado, não uma worktree de desenvolvimento.');
    }
    const relativeRuntime = path.relative(repo, runtime);
    if (relativeRuntime === '' || (!relativeRuntime.startsWith('..') && !path.isAbsolute(relativeRuntime))) {
        throw new Error('O runtime do watcher não pode ficar dentro do repositório dedicado.');
    }
    const status = runGit(gitPath, repo, ['status', '--porcelain=v1', '--untracked-files=all']);
    if (status) throw new Error('A worktree dedicada deve estar limpa antes da instalação.');
    const ignored = runGit(gitPath, repo,
        ['ls-files', '--others', '--ignored', '--exclude-standard']);
    if (ignored) throw new Error('A worktree dedicada contém caminho ignorado; instalação recusada.');

    const origin = runGit(gitPath, repo, ['remote', 'get-url', 'origin']);
    if (normalizeOrigin(origin) !== normalizeOrigin(expectedOrigin)) {
        throw new Error(`origin divergente: esperado ${expectedOrigin}`);
    }
    const currentBranch = runGit(gitPath, repo, ['branch', '--show-current']);
    if (currentBranch !== branch) {
        throw new Error(`branch local divergente: esperado ${branch}, atual ${currentBranch || '<detached>'}`);
    }
    runGit(gitPath, repo, ['fetch', '--quiet', 'origin', branch]);
    const head = runGit(gitPath, repo, ['rev-parse', 'HEAD']);
    const fetched = runGit(gitPath, repo, ['rev-parse', 'FETCH_HEAD']);
    if (head !== fetched) throw new Error(`revisão local não corresponde a origin/${branch}`);

    const watcherRelative = 'scripts/agent/watchChatCodexOrchestration.js';
    const watcher = path.join(repo, ...watcherRelative.split('/'));
    if (!fs.existsSync(watcher) || !fs.lstatSync(watcher).isFile()
        || fs.lstatSync(watcher).isSymbolicLink()) {
        throw new Error(`Watcher ausente ou inválido no clone dedicado: ${watcher}`);
    }
    runGit(gitPath, repo, ['ls-files', '--error-unmatch', '--', watcherRelative]);
    return { repo, branch, head, origin };
}

if (require.main === module) {
    try {
        const result = validateRepository(parseArgs(process.argv.slice(2)));
        process.stdout.write(`VALIDATED ${result.head}\n`);
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { normalizeOrigin, parseArgs, validateRepository };
