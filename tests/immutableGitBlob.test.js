'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { buildHermeticTestEnvironment } = require('../scripts/runExhaustiveLocalTestCoverage');
const root = path.resolve(__dirname, '..');
const readerPath = path.join(root, 'scripts/agent/immutableGitBlob.cjs');

test('immutable blob reader rejects mutable refs and locator escapes before executing Git', () => {
    const { immutableBlobSpecifier } = require(readerPath);
    const commit = '629a6871ffbdaa581fb64bd59165589bae04c92a';
    assert.equal(immutableBlobSpecifier(commit, '.github/workflows/check.yml'),
        commit + ':.github/workflows/check.yml');
    for (const ref of ['HEAD', commit + '^', commit.toUpperCase(), '', '--help', null]) {
        assert.throws(() => immutableBlobSpecifier(ref, 'docs/a.json'), /immutable_git_blob_locator/);
    }
    for (const locator of ['', '/a', '../a', './a', 'a/../b', 'a//b', 'a\\b',
        'a:b', 'a;echo', 'a\n/b', 'a\0b', null]) {
        assert.throws(() => immutableBlobSpecifier(commit, locator), /immutable_git_blob_locator/);
    }
});

test('immutable blob reader preserves frozen bytes under the unchanged hermetic Git boundary', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'financasbot-exhaustive-blob-'));
    const environment = buildHermeticTestEnvironment(process.env, { auditTempRoot: temp });
    const source = `
        const assert = require('node:assert/strict');
        const { createHash } = require('node:crypto');
        const { readImmutableBlob, immutableBlobEnvironment } = require(${JSON.stringify(readerPath)});
        const env = immutableBlobEnvironment({ GIT_DIR: 'elsewhere', GIT_WORK_TREE: 'elsewhere',
            GIT_INDEX_FILE: 'elsewhere', GIT_OBJECT_DIRECTORY: 'elsewhere',
            GIT_ALTERNATE_OBJECT_DIRECTORIES: 'elsewhere', GIT_CONFIG_COUNT: '8',
            GIT_CONFIG_KEY_7: 'core.sshCommand', GIT_CONFIG_VALUE_7: 'arbitrary',
            GIT_SSH_COMMAND: 'arbitrary', GIT_ASKPASS: 'arbitrary' });
        for (const name of ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY',
            'GIT_ALTERNATE_OBJECT_DIRECTORIES','GIT_CONFIG_KEY_7','GIT_CONFIG_VALUE_7',
            'GIT_SSH_COMMAND','GIT_ASKPASS']) assert.equal(env[name], undefined, name);
        assert.equal(env.GIT_NO_REPLACE_OBJECTS, '1');
        assert.equal(env.GIT_TERMINAL_PROMPT, '0');
        const bytes = readImmutableBlob('629a6871ffbdaa581fb64bd59165589bae04c92a',
            'docs/audit-evidence/n02g-causal-authoring-profile/account-installment-observation-proposal.json');
        const text = bytes.toString('utf8').replaceAll('\\r\\n', '\\n');
        assert.equal(createHash('sha256').update(text).digest('hex'),
            '2660302e20b3b6c1be337472849aa5453735b5ad9aeeaddbac83b6978e2a23a3');
        assert.throws(() => readImmutableBlob('HEAD', 'package.json'), /immutable_git_blob_locator/);
    `;
    const child = spawnSync(process.execPath, ['--require',
        path.join(root, 'tests/helpers/exhaustiveNetworkTripwire.js'), '-e', source],
        { cwd: root, env: environment, encoding: 'utf8', windowsHide: true });
    assert.equal(child.status, 0, `${child.stdout || ''}\n${child.stderr || ''}`);
});
