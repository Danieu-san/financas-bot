const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildRuntimeHealthSnapshot
} = require('../src/services/runtimeHealthService');

test('health is 200 only when SQLite and WhatsApp runtime are healthy', () => {
    const result = buildRuntimeHealthSnapshot({
        sqliteReady: true,
        whatsappHealth: {
            status: 'ready',
            liveness: 'healthy',
            consecutiveFailures: 0
        }
    });

    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.payload, {
        ok: true,
        sqlite: true,
        whatsapp: true,
        whatsappStatus: 'ready',
        whatsappLiveness: 'healthy'
    });
});

test('health fails closed when WhatsApp is degraded although process and SQLite are healthy', () => {
    const result = buildRuntimeHealthSnapshot({
        sqliteReady: true,
        whatsappHealth: {
            status: 'degraded',
            liveness: 'degraded',
            consecutiveFailures: 1,
            lastReason: 'protocol_timeout'
        }
    });

    assert.equal(result.statusCode, 503);
    assert.deepEqual(result.payload, {
        ok: false,
        sqlite: true,
        whatsapp: false,
        whatsappStatus: 'degraded',
        whatsappLiveness: 'degraded'
    });
    assert.equal(JSON.stringify(result.payload).includes('protocol_timeout'), false);
});

test('health fails closed during startup or QR without exposing session details', () => {
    for (const status of ['starting', 'authenticated', 'qr_pending', 'stopped']) {
        const result = buildRuntimeHealthSnapshot({
            sqliteReady: true,
            whatsappHealth: {
                status,
                liveness: 'pending',
                qr: 'forbidden',
                sessionUrl: 'forbidden'
            }
        });

        assert.equal(result.statusCode, 503);
        assert.equal(result.payload.ok, false);
        assert.equal(result.payload.whatsapp, false);
        assert.equal(result.payload.whatsappStatus, status);
        assert.equal(JSON.stringify(result.payload).includes('forbidden'), false);
    }
});

test('health fails when SQLite is unavailable even if WhatsApp is ready', () => {
    const result = buildRuntimeHealthSnapshot({
        sqliteReady: false,
        whatsappHealth: {
            status: 'ready',
            liveness: 'healthy'
        }
    });

    assert.equal(result.statusCode, 503);
    assert.equal(result.payload.ok, false);
    assert.equal(result.payload.sqlite, false);
    assert.equal(result.payload.whatsapp, true);
});
