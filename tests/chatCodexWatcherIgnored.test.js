'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { runCodex } = require('../scripts/agent/watchChatCodexOrchestration');

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-watch-ignored-'));
    const codex = path.join(root, 'codex.exe');
    execFileSync('git', ['init', '-q', root]);
    fs.writeFileSync(path.join(root, '.gitignore'), '.secret\n');
    execFileSync('git', ['-C', root, 'add', '.gitignore']);
    fs.writeFileSync(codex, 'fixture\n');
    return {
        root,
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
        spawnSync: () => { spawned = true; return { status: 0, stdout: '', stderr: '' }; }
    }), /worktree contém caminho ignorado: \.secret/);
    assert.equal(spawned, false);
});
