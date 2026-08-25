'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
    TASK_SCHEMA,
    loadTaskDefinition,
    validateTask
} = require('../scripts/agent/chatCodexTaskContract');
const { serializeState } = require('../scripts/agent/manageChatCodexOrchestration');
const { publishLocalResult } = require('../scripts/agent/watchChatCodexOrchestration');

function validTask() {
    return {
        schema: TASK_SCHEMA,
        task_id: 'JOB-01',
        objective: 'Atualizar um arquivo delimitado.',
        required_files: ['src/input.js'],
        allowed_paths: [
            'src/output.js',
            'docs/agent-memory/workstreams/results/JOB-01.md'
        ],
        result_file: 'docs/agent-memory/workstreams/results/JOB-01.md',
        validation: ['node --check src/output.js'],
        constraints: ['Não acessar produção.']
    };
}

test('contrato aceita tarefa delimitada e rejeita campo extra, segredo e resultado externo', () => {
    assert.equal(validateTask(validTask(), 'JOB-01').task_id, 'JOB-01');
    assert.throws(() => validateTask({ ...validTask(), extra: true }, 'JOB-01'), /schema/);
    assert.throws(() => validateTask({
        ...validTask(), required_files: ['.env']
    }, 'JOB-01'), /sensível/);
    assert.throws(() => validateTask({
        ...validTask(), allowed_paths: [
            'scripts/agent/watchChatCodexOrchestration.js',
            'docs/agent-memory/workstreams/results/JOB-01.md'
        ]
    }, 'JOB-01'), /sensível/);
    assert.throws(() => validateTask({
        ...validTask(), result_file: 'docs/out.md'
    }, 'JOB-01'), /result_file/);
    assert.throws(() => validateTask(validTask(), 'JOB-02'), /task_id divergente/);
});

test('loader exige task e required_files regulares e mantém task_file somente leitura', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-codex-task-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'input.js'), '// input\n');
    fs.writeFileSync(path.join(root, 'docs', 'task.json'), JSON.stringify(validTask()));
    assert.equal(loadTaskDefinition(root, 'docs/task.json', 'JOB-01').objective,
        'Atualizar um arquivo delimitado.');

    const writableTask = validTask();
    writableTask.allowed_paths.push('docs/task.json');
    fs.writeFileSync(path.join(root, 'docs', 'task.json'), JSON.stringify(writableTask));
    assert.throws(() => loadTaskDefinition(root, 'docs/task.json', 'JOB-01'), /não pode ser gravável/);
});

test('publicador recusa artefato autorizado que virou link simbólico', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-codex-link-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const statePath = 'docs/state.json';
    const initialState = {
        schema: 'financasbot-chat-codex-orchestration-v1',
        orchestration_state: 'CODEX_READY', next_executor: 'codex', task_id: 'JOB-01',
        expected_base_sha: 'a'.repeat(40), task_file: 'docs/task.json',
        candidate_sha: null, result_file: null, updated_at: '2026-08-25T00:00:00.000Z'
    };
    const finalState = {
        ...initialState, orchestration_state: 'CHAT_READY', next_executor: 'chat',
        result_file: 'docs/agent-memory/workstreams/results/JOB-01.md',
        updated_at: '2026-08-25T00:01:00.000Z'
    };
    fs.mkdirSync(path.join(root, 'docs', 'agent-memory', 'workstreams', 'results'), { recursive: true });
    fs.writeFileSync(path.join(root, ...statePath.split('/')), serializeState(finalState));
    const target = path.join(root, 'target.md');
    const result = path.join(root, ...finalState.result_file.split('/'));
    fs.writeFileSync(target, 'target\n');
    try {
        fs.symlinkSync(target, result, 'file');
    } catch (error) {
        if (process.platform === 'win32' && error.code === 'EPERM') return;
        throw error;
    }
    assert.throws(() => publishLocalResult({
        repoPath: root, branch: 'chat/test', statePath, observedHash: '0'.repeat(64),
        initialState, task: validTask()
    }, {
        runGit: () => ` M ${statePath}\n?? ${finalState.result_file}\n`,
        fetchRemoteState: () => serializeState(initialState)
    }), /arquivo regular/);
});
