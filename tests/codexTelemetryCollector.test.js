'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const {
    assertOutsideRepository,
    createCollector,
    createEventId,
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
                        attribute('source', 'daniel@example.com'),
                        attribute('originator', 'Daniel'),
                        attribute('failure_reason', 'SegredoFinanceiro')
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
    assert.match(record.attributes['conversation.id'], /^sha256:[a-f0-9]{64}$/);
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
        ,'Daniel'
        ,'SegredoFinanceiro'
        ,'conv-123'
    ]) {
        assert.equal(serialized.includes(forbidden), false, forbidden);
    }
    assert.match(record.event_id, /^[a-f0-9]{64}$/);
});

test('event_id ignora objetivo de recebimento para deduplicar retransmissao tardia', () => {
    const base = {
        schema_version: 1,
        telemetry_kind: 'logs',
        event_name: 'codex.sse_event',
        observed_time_unix_nano: '150',
        attributes: { kind: 'response.completed' },
        received_at: '2026-08-03T21:00:00.000Z'
    };
    assert.equal(
        createEventId({ ...base, objective_id: 'OBJ-A' }),
        createEventId({ ...base, objective_id: 'OBJ-B' })
    );
});

test('evento atrasado usa intervalo temporal e nao o objetivo ativo no recebimento', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-temporal-test-'));
    const outputPath = path.join(root, 'events.jsonl');
    const statePath = path.join(root, 'active-objective.json');
    const intervalsPath = path.join(root, 'objective-intervals.jsonl');
    writeObjectiveState(statePath, {
        objective_id: 'OBJ-B',
        status: 'active',
        started_time_unix_nano: '300',
        started_at: '1970-01-01T00:00:00.000Z'
    });
    fs.writeFileSync(intervalsPath, `${JSON.stringify({
        objective_id: 'OBJ-A',
        started_time_unix_nano: '100',
        stopped_time_unix_nano: '200'
    })}\n`, 'utf8');
    const payload = logEnvelope();
    payload.resourceLogs[0].scopeLogs[0].logRecords[0].timeUnixNano = '150';

    const collector = createCollector({
        host: '127.0.0.1',
        port: 0,
        outputPath,
        statePath,
        intervalsPath
    });
    await collector.start();
    const endpoint = `http://127.0.0.1:${collector.address().port}/v1/logs`;
    try {
        assert.equal((await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
        })).status, 200);
        assert.equal((await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
        })).status, 200);
    } finally {
        await collector.stop();
    }

    const records = fs.readFileSync(outputPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(records.length, 1);
    assert.equal(records[0].objective_id, 'OBJ-A');
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

test('valores tecnicos desconhecidos viram categoria neutra sem conservar o texto', () => {
    const payload = logEnvelope();
    payload.resourceLogs[0].scopeLogs[0].logRecords[0].attributes.push(
        attribute('model', 'gpt-5-DanielPrivado'),
        attribute('tool', 'FerramentaSecreta'),
        attribute('status', 'ContaPessoal'),
        attribute('service.version', '1.2.3-DanielPrivado'),
        attribute('app.version', '9.8.7-ContaPessoal')
    );
    const [record] = sanitizeOtlpEnvelope(payload, {
        kind: 'logs',
        objectiveId: 'OBJ-A',
        receivedAt: '2026-08-03T21:00:00.000Z'
    });
    assert.equal(record.attributes.model, 'other');
    assert.equal(record.attributes.tool, 'other');
    assert.equal(record.attributes.status, 'other');
    assert.equal(Object.hasOwn(record.attributes, 'service.version'), false);
    assert.equal(Object.hasOwn(record.attributes, 'app.version'), false);
    const serialized = JSON.stringify(record);
    assert.equal(serialized.includes('DanielPrivado'), false);
    assert.equal(serialized.includes('FerramentaSecreta'), false);
    assert.equal(serialized.includes('ContaPessoal'), false);
});

test('intervalos sobrepostos falham fechado mesmo com o mesmo objective_id', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-overlap-test-'));
    const outputPath = path.join(root, 'events.jsonl');
    const statePath = path.join(root, 'active-objective.json');
    const intervalsPath = path.join(root, 'objective-intervals.jsonl');
    writeObjectiveState(statePath, { objective_id: null, status: 'stopped' });
    fs.writeFileSync(intervalsPath, [
        { objective_id: 'OBJ-A', started_time_unix_nano: '100', stopped_time_unix_nano: '250' },
        { objective_id: 'OBJ-A', started_time_unix_nano: '150', stopped_time_unix_nano: '300' }
    ].map(value => JSON.stringify(value)).join('\n') + '\n', 'utf8');
    const payload = logEnvelope();
    payload.resourceLogs[0].scopeLogs[0].logRecords[0].timeUnixNano = '200';
    const collector = createCollector({
        host: '127.0.0.1', port: 0, outputPath, statePath, intervalsPath
    });
    await collector.start();
    try {
        const response = await fetch(`http://127.0.0.1:${collector.address().port}/v1/logs`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
        });
        assert.equal(response.status, 200);
    } finally {
        await collector.stop();
    }
    const [record] = fs.readFileSync(outputPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(record.objective_id, null);
});

test('timestamp ausente ou invalido nunca recebe o objetivo ativo', () => {
    const payload = logEnvelope();
    delete payload.resourceLogs[0].scopeLogs[0].logRecords[0].timeUnixNano;
    payload.resourceLogs[0].scopeLogs[0].logRecords[0].observedTimeUnixNano = 'segredo-temporal';
    const [record] = sanitizeOtlpEnvelope(payload, {
        kind: 'logs',
        objectiveForTimestamp: () => 'OBJ-A',
        receivedAt: '2026-08-03T21:00:00.000Z'
    });
    assert.equal(record.observed_time_unix_nano, null);
    assert.equal(record.objective_id, null);
    assert.equal(JSON.stringify(record).includes('segredo-temporal'), false);
});

test('intervalo terminal reconcilia estado ativo obsoleto e falha fechado fora da janela', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-crash-window-test-'));
    const outputPath = path.join(root, 'events.jsonl');
    const statePath = path.join(root, 'active-objective.json');
    const intervalsPath = path.join(root, 'objective-intervals.jsonl');
    writeObjectiveState(statePath, {
        objective_id: 'OBJ-A',
        status: 'active',
        started_time_unix_nano: '100'
    });
    fs.writeFileSync(intervalsPath, `${JSON.stringify({
        objective_id: 'OBJ-A',
        started_time_unix_nano: '100',
        stopped_time_unix_nano: '200'
    })}\n`, 'utf8');
    const payload = logEnvelope();
    payload.resourceLogs[0].scopeLogs[0].logRecords[0].timeUnixNano = '250';
    const collector = createCollector({
        host: '127.0.0.1', port: 0, outputPath, statePath, intervalsPath
    });
    await collector.start();
    try {
        const response = await fetch(`http://127.0.0.1:${collector.address().port}/v1/logs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
        });
        assert.equal(response.status, 200);
    } finally {
        await collector.stop();
    }
    const [record] = fs.readFileSync(outputPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(record.objective_id, null);
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
        status: 'active',
        started_time_unix_nano: '1'
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

    const restarted = createCollector({
        host: '127.0.0.1',
        port: 0,
        outputPath,
        statePath,
        maxBodyBytes: 16 * 1024
    });
    await restarted.start();
    try {
        const replayAfterRestart = await fetch(
            `http://127.0.0.1:${restarted.address().port}/v1/logs`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(logEnvelope())
            }
        );
        assert.equal(replayAfterRestart.status, 200);
    } finally {
        await restarted.stop();
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

    const junctionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-junction-test-'));
    const junction = path.join(junctionRoot, 'repo-link');
    fs.symlinkSync(path.resolve(__dirname, '..'), junction, 'junction');
    assert.throws(
        () => assertOutsideRepository(path.join(junction, 'events.jsonl')),
        /fora_do_repositorio/
    );
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
    const intervalsPath = path.join(root, 'objective-intervals.jsonl');
    const intervals = fs.readFileSync(intervalsPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].objective_id, 'RX-HIST-SEG-01');
    assert.match(intervals[0].started_time_unix_nano, /^\d+$/);
    assert.match(intervals[0].stopped_time_unix_nano, /^\d+$/);
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

test('instalador executa install e uninstall restaurando bytes preexistentes', {
    skip: process.platform !== 'win32'
}, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-installer-test-'));
    const configPath = path.join(root, 'config.toml');
    const storagePath = path.join(root, 'telemetry');
    const original = Buffer.from('[features]\napps = true\n', 'utf8');
    fs.writeFileSync(configPath, original);
    const installerPath = path.resolve(__dirname, '..', 'scripts', 'agent', 'Manage-CodexUsageTelemetry.ps1');
    const common = [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installerPath,
        '-CodexConfigPath', configPath,
        '-TelemetryStorageRoot', storagePath
    ];
    const installed = spawnSync('powershell.exe', [...common, '-Action', 'Install'], { encoding: 'utf8' });
    assert.equal(installed.status, 0, installed.stderr);
    assert.match(fs.readFileSync(configPath, 'utf8'), /\[otel\]/);

    const uninstalled = spawnSync('powershell.exe', [...common, '-Action', 'Uninstall'], { encoding: 'utf8' });
    assert.equal(uninstalled.status, 0, uninstalled.stderr);
    assert.deepEqual(fs.readFileSync(configPath), original);
});

test('uninstall recusa configuracao alterada e preserva o arquivo atual', {
    skip: process.platform !== 'win32'
}, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-uninstall-guard-'));
    const configPath = path.join(root, 'config.toml');
    const storagePath = path.join(root, 'telemetry');
    fs.writeFileSync(configPath, '[features]\napps = true\n', 'utf8');
    const installerPath = path.resolve(__dirname, '..', 'scripts', 'agent', 'Manage-CodexUsageTelemetry.ps1');
    const common = [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installerPath,
        '-CodexConfigPath', configPath,
        '-TelemetryStorageRoot', storagePath
    ];
    assert.equal(spawnSync('powershell.exe', [...common, '-Action', 'Install']).status, 0);
    fs.appendFileSync(configPath, '\n# alteracao posterior\n', 'utf8');
    const before = fs.readFileSync(configPath);
    const rejected = spawnSync('powershell.exe', [...common, '-Action', 'Uninstall'], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
    assert.deepEqual(fs.readFileSync(configPath), before);
});

test('uninstall recusa divergencia somente de BOM e preserva bytes atuais', {
    skip: process.platform !== 'win32'
}, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-uninstall-bom-'));
    const configPath = path.join(root, 'config.toml');
    const storagePath = path.join(root, 'telemetry');
    const text = Buffer.from('[features]\napps = true\n', 'utf8');
    fs.writeFileSync(configPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), text]));
    const installerPath = path.resolve(__dirname, '..', 'scripts', 'agent', 'Manage-CodexUsageTelemetry.ps1');
    const common = [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installerPath,
        '-CodexConfigPath', configPath,
        '-TelemetryStorageRoot', storagePath
    ];
    assert.equal(spawnSync('powershell.exe', [...common, '-Action', 'Install']).status, 0);
    const installedBytes = fs.readFileSync(configPath);
    assert.deepEqual([...installedBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    fs.writeFileSync(configPath, installedBytes.subarray(3));
    const before = fs.readFileSync(configPath);
    const rejected = spawnSync('powershell.exe', [...common, '-Action', 'Uninstall'], { encoding: 'utf8' });
    assert.notEqual(rejected.status, 0);
    assert.deepEqual(fs.readFileSync(configPath), before);
});
