'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { runCodex } = require('../scripts/agent/watchChatCodexOrchestration');

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-watch-ignored-'));
    const codex = path.join(root, 'codex.exe');
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

test('executor falha fechado quando cria arquivo novo ignorado', () => {
    const item = fixture();
    const snapshots = [new Set(['cache/existente']), new Set(['cache/existente', '.env.novo'])];
    assert.throws(() => runCodex(item.options, {
        listIgnoredPaths: () => snapshots.shift(),
        spawnSync: () => ({ status: 0, stdout: 'ok', stderr: '' })
    }), /executor criou caminho ignorado: \.env\.novo/);
});

test('arquivo ignorado preexistente e inalterado não produz falso positivo', () => {
    const item = fixture();
    const snapshots = [new Set(['cache/existente']), new Set(['cache/existente'])];
    const status = runCodex(item.options, {
        listIgnoredPaths: () => snapshots.shift(),
        spawnSync: () => ({ status: 0, stdout: 'ok', stderr: '' })
    });
    assert.equal(status, 0);
    assert.match(fs.readFileSync(item.options.logPath, 'utf8'), /status=0/);
});
