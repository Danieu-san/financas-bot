'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { runCodex } = require('../scripts/agent/watchChatCodexOrchestration');

function auditedGitPath() {
    return process.env.EXHAUSTIVE_LOCAL_GIT_PATH || 'git';
}

function runFixtureGit(repoPath, args) {
    return execFileSync(auditedGitPath(), [
        '-c', `safe.directory=${repoPath}`,
        '-C', repoPath,
        ...args
    ], {
        cwd: repoPath,
        encoding: 'utf8'
    });
}

function fixture() {
    const tempRoot = process.env.EXHAUSTIVE_AUDIT_TEMP_ROOT || os.tmpdir();
    const root = fs.mkdtempSync(path.join(tempRoot, 'orch-watch-ignored-'));
    const codex = path.join(root, 'codex.exe');
    execFileSync(auditedGitPath(), ['init', '-q'], { cwd: root });
    fs.writeFileSync(path.join(root, '.gitignore'), '.secret\n');
    execFileSync(auditedGitPath(), ['add', '.gitignore'], { cwd: root });
    fs.writeFileSync(codex, 'fixture\n');
    return {
        root,
        runGit: runFixtureGit,
        options: {
            codexPath: codex,
            powershellPath: codex,
            repoPath: root,
            prompt: 'no-op',
            logPath: path.join(root, 'run.log')
        }
    };
}

test('cadeia Git real rejeita arquivo ignorado criado pelo executor', () => {
    const item = fixture();
    assert.throws(() => runCodex(item.options, {
        runGit: item.runGit,
        spawnSync: () => {
            fs.writeFileSync(path.join(item.root, '.secret'), 'novo\n');
            return { status: 0, stdout: 'ok', stderr: '' };
        }
    }), /worktree contém caminho ignorado: \.secret/);
});

test('ignorado preexistente impede o executor antes do spawn', () => {
    const item = fixture();
    fs.writeFileSync(path.join(item.root, '.secret'), 'preexistente\n');
    let spawned = false;
    assert.throws(() => runCodex(item.options, {
        runGit: item.runGit,
        spawnSync: () => { spawned = true; return { status: 0, stdout: '', stderr: '' }; }
    }), /worktree contém caminho ignorado: \.secret/);
    assert.equal(spawned, false);
});

test('launcher grava progresso durante a execução e limita o no-op a dez minutos', () => {
    const item = fixture();
    const status = runCodex(item.options, {
        listIgnoredPaths: () => new Set(),
        spawnSync(command, args, options) {
            assert.deepEqual(args.slice(0, 3), [
                '--profile', 'chat-codex-orchestration', 'exec'
            ]);
            assert.equal(options.timeout, 10 * 60_000);
            assert.equal(options.stdio[0], 'pipe');
            fs.writeSync(options.stdio[1], 'progresso-visível\n');
            return { status: 0 };
        }
    });
    const log = fs.readFileSync(item.options.logPath, 'utf8');
    assert.equal(status, 0);
    assert.match(log, /started_at=/);
    assert.match(log, /progresso-visível/);
    assert.match(log, /status=0/);
});

test('tarefa limitada instala perfil dedicado unelevated sem elevar o watcher', () => {
    const installer = fs.readFileSync(path.join(
        __dirname, '..', 'scripts', 'agent', 'Install-ChatCodexOrchestrationWatcher.ps1'
    ), 'utf8');
    const watcher = fs.readFileSync(path.join(
        __dirname, '..', 'scripts', 'agent', 'watchChatCodexOrchestration.js'
    ), 'utf8');
    assert.match(installer, /RunLevel = 'Limited'/);
    assert.doesNotMatch(installer, /RunLevel = 'Highest'/);
    assert.match(installer, /chat-codex-orchestration\.config\.toml/);
    assert.match(installer, /sandbox = `"unelevated`"/);
    assert.match(installer, /Assert-OrchestrationProfileSafe/);
    assert.match(watcher, /'--profile', 'chat-codex-orchestration'/);
});
