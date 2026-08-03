'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
    createCollector,
    sanitizeOtlpEnvelope,
    writeObjectiveState
} = require('../scripts/agent/codexTelemetryCollector');

function attribute(key, value) {
    const typedValue = typeof value === 'number'
        ? { intValue: String(value) }
        : { stringValue: value };
    return { key, value: typedValue };
}

function logEnvelope() {
    return {
        resourceLogs: [{
            resource: {
                attributes: [
                    attribute('service.name', 'codex'),
                    attribute('host.name', 'private-machine-name')
                ]
            },
            scopeLogs: [{
                logRecords: [{
                    timeUnixNano: '1785796800000000000',
                    body: { stringValue: 'codex.sse_event' },
                    attributes: [
                        attribute('conversation.id', 'conv-123'),
                        attribute('model', 'gpt-5.6-sol'),
                        attribute('model_reasoning_effort', 'medium'),
                        attribute('kind', 'response.completed'),
                        attribute('input_token_count', 120),
                        attribute('output_token_count', 30),
                        attribute('user.prompt', 'SEGREDO FINANCEIRO'),
                        attribute('command', 'Get-Content .env'),
                        attribute('tool.output', 'token=privado'),
                        attribute('message', 'conteudo pessoal'),
                        attribute('failure_reason', 'C:/Users/Daniel/.ssh/id_ed25519'),
                        attribute('source', 'daniel@example.com')
                    ]
                }]
            }]
        }]
    };
}

test('sanitizacao conserva metadados e elimina conteudo sensivel em qualquer campo', () => {
    const records = sanitizeOtlpEnvelope(logEnvelope(), {
        kind: 'logs',
        objectiveId: 'RX-HIST-SEG-01',
        receivedAt: '2026-08-03T21:00:00.000Z'
    });

    assert.equal(records.length, 1);
    const [record] = records;
    assert.equal(record.objective_id, 'RX-HIST-SEG-01');
    assert.equal(record.event_name, 'codex.sse_event');
    assert.equal(record.attributes['conversation.id'], 'conv-123');
    assert.equal(record.attributes.model, 'gpt-5.6-sol');
    assert.equal(record.attributes.model_reasoning_effort, 'medium');
    assert.equal(record.attributes.input_token_count, 120);
    assert.equal(record.attributes.output_token_count, 30);
    assert.equal(record.attributes['service.name'], 'codex');

    const serialized = JSON.stringify(record);
    for (const forbidden of [
        'SEGREDO FINANCEIRO',
        'Get-Content .env',
        'token=privado',
        'conteudo pessoal',
        'private-machine-name',
        'user.prompt',
        'tool.output'
        ,'C:/Users/Daniel/.ssh/id_ed25519'
        ,'daniel@example.com'
    ]) {
        assert.equal(serialized.includes(forbidden), false, forbidden);
    }
    assert.match(record.event_id, /^[a-f0-9]{64}$/);
});

test('metricas preservam contagens numericas sem dimensoes nao autorizadas', () => {
    const payload = {
        resourceMetrics: [{
            resource: { attributes: [attribute('service.name', 'codex')] },
            scopeMetrics: [{
                metrics: [{
                    name: 'codex.turn.token_usage',
                    unit: 'tokens',
                    sum: {
                        dataPoints: [{
                            timeUnixNano: '1785796800000000001',
                            asInt: '400',
                            attributes: [
                                attribute('token_type', 'total'),
                                attribute('model', 'gpt-5.6-sol'),
                                attribute('account.email', 'private@example.com')
                            ]
                        }]
                    }
                }]
            }]
        }]
    };

    const [record] = sanitizeOtlpEnvelope(payload, {
        kind: 'metrics',
        objectiveId: 'RX-HIST-SEG-01',
        receivedAt: '2026-08-03T21:00:00.000Z'
    });
    assert.equal(record.event_name, 'codex.turn.token_usage');
    assert.equal(record.value, 400);
    assert.equal(record.attributes.token_type, 'total');
    assert.equal(record.attributes.model, 'gpt-5.6-sol');
    assert.equal(JSON.stringify(record).includes('private@example.com'), false);
});

test('receptor local persiste uma vez, rejeita payload grande e nao guarda corpo bruto', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-otel-test-'));
    const outputPath = path.join(root, 'events.jsonl');
    const statePath = path.join(root, 'active-objective.json');
    writeObjectiveState(statePath, {
        objective_id: 'RX-HIST-SEG-01',
        category: 'mudanca_transversal',
        risk: 'alto',
        authorized_outcome_scope: 'preview_sem_escrita',
        status: 'active'
    });

    const collector = createCollector({
        host: '127.0.0.1',
        port: 0,
        outputPath,
        statePath,
        maxBodyBytes: 16 * 1024
    });
    await collector.start();
    const address = collector.address();
    const endpoint = `http://127.0.0.1:${address.port}/v1/logs`;

    try {
        const first = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(logEnvelope())
        });
        assert.equal(first.status, 200);

        const duplicate = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(logEnvelope())
        });
        assert.equal(duplicate.status, 200);

        const oversized = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ padding: 'x'.repeat(20 * 1024) })
        });
        assert.equal(oversized.status, 413);
    } finally {
        await collector.stop();
    }

    const lines = fs.readFileSync(outputPath, 'utf8').trim().split(/\r?\n/);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].includes('SEGREDO FINANCEIRO'), false);
    assert.equal(lines[0].includes('Get-Content .env'), false);
    assert.equal(lines[0].includes('tool.output'), false);
});

test('listener recusa bind nao loopback e CLI recusa armazenamento dentro do repositorio', () => {
    assert.throws(() => createCollector({
        host: '0.0.0.0',
        outputPath: path.join(os.tmpdir(), 'events.jsonl'),
        statePath: path.join(os.tmpdir(), 'active-objective.json')
    }), /loopback/);

    const collectorPath = path.resolve(__dirname, '..', 'scripts', 'agent', 'codexTelemetryCollector.js');
    const unsafeOutput = path.resolve(__dirname, '..', '.private-telemetry.jsonl');
    const rejected = spawnSync(process.execPath, [
        collectorPath,
        'summary',
        '--output', unsafeOutput
    ], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /fora_do_repositorio/);
});

test('objective stop impede atribuicao posterior sem transformar ausencia em zero', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-objective-test-'));
    const statePath = path.join(root, 'active-objective.json');
    writeObjectiveState(statePath, {
        objective_id: null,
        status: 'stopped',
        native_usage_status: 'CONSUMO_POR_TAREFA_NAO_OBSERVAVEL'
    });

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(state.objective_id, null);
    assert.equal(state.native_usage_status, 'CONSUMO_POR_TAREFA_NAO_OBSERVAVEL');
    assert.equal(Object.hasOwn(state, 'native_usage_value'), false);
});

test('CLI inicia e encerra objetivo sem aceitar texto livre inseguro', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-objective-cli-'));
    const statePath = path.join(root, 'active-objective.json');
    const collectorPath = path.resolve(__dirname, '..', 'scripts', 'agent', 'codexTelemetryCollector.js');
    const started = spawnSync(process.execPath, [
        collectorPath,
        'objective',
        'start',
        '--state', statePath,
        '--objective-id', 'RX-HIST-SEG-01',
        '--category', 'mudanca_transversal',
        '--risk', 'alto',
        '--authorized-outcome-scope', 'preview_sem_escrita'
    ], { encoding: 'utf8' });
    assert.equal(started.status, 0, started.stderr);
    assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).objective_id, 'RX-HIST-SEG-01');

    const rejected = spawnSync(process.execPath, [
        collectorPath,
        'objective',
        'start',
        '--state', statePath,
        '--objective-id', 'RX com descricao privada',
        '--category', 'mudanca_transversal',
        '--risk', 'alto',
        '--authorized-outcome-scope', 'preview_sem_escrita'
    ], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);

    const stopped = spawnSync(process.execPath, [
        collectorPath,
        'objective',
        'stop',
        '--state', statePath
    ], { encoding: 'utf8' });
    assert.equal(stopped.status, 0, stopped.stderr);
    assert.equal(JSON.parse(fs.readFileSync(statePath, 'utf8')).objective_id, null);
});

test('instalador fixa loopback, JSON, prompt desligado e backup sem segredo embutido', () => {
    const installerPath = path.resolve(__dirname, '..', 'scripts', 'agent', 'Manage-CodexUsageTelemetry.ps1');
    const installer = fs.readFileSync(installerPath, 'utf8');
    assert.match(installer, /127\.0\.0\.1:4318\/v1\/logs/);
    assert.match(installer, /127\.0\.0\.1:4318\/v1\/metrics/);
    assert.match(installer, /log_user_prompt = false/);
    assert.match(installer, /Copy-Item -LiteralPath \$configPath -Destination \$backupPath/);
    assert.match(installer, /Start-Process[^\n]+-WindowStyle Hidden/);
    assert.doesNotMatch(installer, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|gh[opsu]_|sk-/);
});
