'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const validator = path.resolve(__dirname,
    '../scripts/agent/validateChatCodexWatcherRepository.js');
const gitPath = spawnSync('where.exe', ['git'], { encoding: 'utf8', windowsHide: true })
    .stdout.split(/\r?\n/).find(Boolean);

function git(cwd, args) {
    const result = spawnSync('git', ['-C', cwd, ...args], {
        encoding: 'utf8', windowsHide: true
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-repo-validator-'));
    const source = path.join(root, 'source');
    const origin = path.join(root, 'origin.git');
    const dedicated = path.join(root, 'dedicated');
    const runtime = path.join(root, 'runtime');
    fs.mkdirSync(source);
    git(source, ['init', '-b', 'chat/test']);
    git(source, ['config', 'user.email', 'tests@example.invalid']);
    git(source, ['config', 'user.name', 'Watcher Tests']);
    fs.mkdirSync(path.join(source, 'scripts', 'agent'), { recursive: true });
    fs.writeFileSync(path.join(source, 'scripts', 'agent',
        'watchChatCodexOrchestration.js'), "'use strict';\n");
    fs.writeFileSync(path.join(source, '.gitignore'), '.runtime/\n');
    git(source, ['add', '.']);
    git(source, ['commit', '-m', 'fixture']);
    spawnSync('git', ['clone', '--bare', source, origin], { encoding: 'utf8', windowsHide: true });
    const cloned = spawnSync('git', ['clone', '--branch', 'chat/test', origin, dedicated], {
        encoding: 'utf8', windowsHide: true
    });
    assert.equal(cloned.status, 0, cloned.stderr);
    fs.mkdirSync(runtime);
    return { root, source, origin, dedicated, runtime };
}

function validate(item, extra = []) {
    return spawnSync(process.execPath, [validator,
        '--repo', item.dedicated,
        '--expected-repo', item.dedicated,
        '--runtime', item.runtime,
        '--git', gitPath,
        '--branch', 'chat/test',
        '--expected-origin', item.origin,
        ...extra
    ], { encoding: 'utf8', windowsHide: true });
}

test('validador aceita somente clone dedicado limpo, atual e da origem esperada', t => {
    const item = fixture();
    t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
    const result = validate(item);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /VALIDATED/);
});

test('validador recusa untracked e ignored reais', t => {
    const item = fixture();
    t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
    fs.writeFileSync(path.join(item.dedicated, 'untracked.txt'), 'x');
    let result = validate(item);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /deve estar limpa/);
    fs.rmSync(path.join(item.dedicated, 'untracked.txt'));
    fs.mkdirSync(path.join(item.dedicated, '.runtime'));
    fs.writeFileSync(path.join(item.dedicated, '.runtime', 'cache'), 'x');
    result = validate(item);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /caminho ignorado/);
});

test('validador recusa linked worktree, origem divergente e revisão desatualizada', t => {
    const item = fixture();
    t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
    const linked = path.join(item.root, 'linked');
    git(item.dedicated, ['worktree', 'add', linked, 'HEAD']);
    let linkedResult = spawnSync(process.execPath, [validator,
        '--repo', linked, '--expected-repo', linked,
        '--runtime', item.runtime, '--git', gitPath, '--branch', 'HEAD',
        '--expected-origin', item.origin
    ], { encoding: 'utf8', windowsHide: true });
    assert.notEqual(linkedResult.status, 0);
    assert.match(linkedResult.stderr, /clone Git dedicado/);

    let result = validate(item, ['--expected-origin', item.source]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /origin divergente/);

    fs.writeFileSync(path.join(item.source, 'new.txt'), 'new');
    git(item.source, ['add', 'new.txt']);
    git(item.source, ['commit', '-m', 'advance']);
    git(item.source, ['push', item.origin, 'chat/test']);
    result = validate(item);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /revisão local não corresponde/);
});
