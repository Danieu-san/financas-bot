const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    buildExecutorPrompt,
    runCodex
} = require('../scripts/agent/watchChatCodexOrchestration');

test('executor recebe sequência mecânica fechada', () => {
    const prompt = buildExecutorPrompt({
        branch: 'chat/test', observedHash: 'b'.repeat(64), taskId: 'ORCH-01'
    });
    for (const text of [
        '--experimental-test-isolation=none --test tests/chatCodexOrchestration.test.js',
        'node scripts/agent/validateAgentWorkflow.js', 'falhe fechado',
        'Altere somente o JSON de estado'
    ]) assert.ok(prompt.includes(text));
    assert.doesNotMatch(prompt, /leia somente AGENTS\.md/);
});

test('launcher limita safe.directory ao processo executor', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-executor-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const repo = path.join(root, 'repo');
    const codex = path.join(root, 'codex.exe');
    fs.mkdirSync(repo);
    fs.writeFileSync(codex, 'fixture\n');
    let invocation;
    assert.equal(runCodex({
        codexPath: codex, powershellPath: null, repoPath: repo, prompt: 'no-op',
        logPath: path.join(root, 'run.log')
    }, {
        listIgnoredPaths: () => new Set(),
        spawnSync(command, args, options) {
            invocation = { command, args, options };
            return { status: 0 };
        }
    }), 0);
    assert.deepEqual([
        invocation.options.env.GIT_CONFIG_COUNT, invocation.options.env.GIT_CONFIG_KEY_0,
        invocation.options.env.GIT_CONFIG_VALUE_0
    ], ['1', 'safe.directory', repo.replaceAll('\\', '/')]);
});
