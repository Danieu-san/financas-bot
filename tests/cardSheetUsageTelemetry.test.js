const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
    classifyCardSheetRoute,
    recordCardSheetInvocation
} = require('../src/telemetry/cardSheetUsageTelemetry');
const {
    runWithUserSheetContext,
    getCurrentSheetContext
} = require('../src/services/google');

test('google sheet context propagates only the allowlisted consumer label to nested calls', async () => {
    await runWithUserSheetContext({
        userId: 'private-user',
        telemetryConsumer: 'message_handler'
    }, async () => {
        const context = getCurrentSheetContext();
        assert.strictEqual(context.telemetryConsumer, 'message_handler');
    });
    const explicit = getCurrentSheetContext({
        userId: 'private-user',
        telemetryConsumer: 'read_model_service'
    });
    assert.strictEqual(explicit.telemetryConsumer, 'read_model_service');
});

test('card sheet telemetry classifies unified and legacy routes without exposing sheet names', async () => {
    assert.strictEqual(classifyCardSheetRoute('Lançamentos Cartão!A:J'), 'card_sheet_unified_route');
    assert.strictEqual(classifyCardSheetRoute("'Cartão Banco Privado - Pessoa'!A:G"), 'card_sheet_legacy_route');
    assert.strictEqual(classifyCardSheetRoute('Saídas!A:J'), '');

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'card-sheet-telemetry-'));
    const filePath = path.join(tempDir, 'events.jsonl');
    const env = {
        LEGACY_USAGE_TELEMETRY_ENABLED: 'true',
        LEGACY_USAGE_TELEMETRY_PATH: filePath,
        LEGACY_USAGE_TELEMETRY_HMAC_SECRET: 'card-sheet-test-hmac-secret',
        APP_COMMIT_SHA: 'a28f9f8'
    };
    await recordCardSheetInvocation({
        range: "'Cartão Banco Privado - Pessoa'!A:G",
        operation: 'read',
        consumer: 'read_model_service',
        actorId: 'private-user',
        sessionId: 'private-session'
    }, { env });
    await recordCardSheetInvocation({
        sheetName: 'Lançamentos Cartão',
        operation: 'write',
        actorId: 'private-user'
    }, { env });

    const entries = (await fs.readFile(filePath, 'utf8')).trim().split(/\r?\n/).map(JSON.parse);
    assert.deepStrictEqual(entries.map(entry => entry.reason_code), [
        'card_sheet_legacy_route', 'card_sheet_unified_route'
    ]);
    assert.deepStrictEqual(entries.map(entry => entry.operation), ['read', 'write']);
    assert.deepStrictEqual(entries.map(entry => entry.consumer), ['read_model_service', 'sheets_runtime']);
    assert.deepStrictEqual(entries.map(entry => entry.write_attempted), [false, true]);
    assert.ok(entries.every(entry => entry.result === 'partial'));
    const serialized = JSON.stringify(entries);
    for (const forbidden of ['Banco Privado', 'Pessoa', 'private-user', 'private-session']) {
        assert.ok(!serialized.includes(forbidden));
    }
});
