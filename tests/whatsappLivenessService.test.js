const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createWhatsAppLivenessMonitor
} = require('../src/services/whatsappLivenessService');

function createLogger() {
    return {
        info() {},
        warn() {},
        error() {}
    };
}

test('runtime probe is disabled before ready and while QR is pending', async () => {
    let probes = 0;
    const exits = [];
    const monitor = createWhatsAppLivenessMonitor({
        probe: async () => {
            probes += 1;
            return 'CONNECTED';
        },
        onUnhealthy: reason => exits.push(reason),
        logger: createLogger(),
        failureThreshold: 2,
        probeTimeoutMs: 20
    });

    assert.deepEqual(await monitor.runProbe(), {
        skipped: true,
        reason: 'not_ready'
    });

    monitor.markQrPending();
    assert.deepEqual(await monitor.runProbe(), {
        skipped: true,
        reason: 'not_ready'
    });
    assert.equal(probes, 0);
    assert.deepEqual(exits, []);
    assert.equal(monitor.getSnapshot().status, 'qr_pending');
});

test('one runtime failure degrades health but a following success recovers without exit', async () => {
    const states = ['UNPAIRED', 'CONNECTED'];
    const exits = [];
    const monitor = createWhatsAppLivenessMonitor({
        probe: async () => states.shift(),
        onUnhealthy: reason => exits.push(reason),
        logger: createLogger(),
        failureThreshold: 2,
        probeTimeoutMs: 20
    });

    monitor.markReady();

    const failed = await monitor.runProbe();
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, 'state_not_connected');
    assert.equal(monitor.getSnapshot().status, 'degraded');
    assert.equal(monitor.getSnapshot().consecutiveFailures, 1);

    const recovered = await monitor.runProbe();
    assert.equal(recovered.ok, true);
    assert.equal(monitor.getSnapshot().status, 'ready');
    assert.equal(monitor.getSnapshot().consecutiveFailures, 0);
    assert.deepEqual(exits, []);
});

test('consecutive runtime failures request exactly one supervisor recovery', async () => {
    const exits = [];
    const monitor = createWhatsAppLivenessMonitor({
        probe: async () => 'UNPAIRED',
        onUnhealthy: reason => exits.push(reason),
        logger: createLogger(),
        failureThreshold: 2,
        probeTimeoutMs: 20
    });

    monitor.markReady();

    await monitor.runProbe();
    await monitor.runProbe();
    await monitor.runProbe();

    assert.deepEqual(exits, ['state_not_connected']);
    assert.equal(monitor.getSnapshot().recoveryRequested, true);
    assert.equal(monitor.getSnapshot().status, 'degraded');
});

test('a timed-out probe fails closed and does not allow an overlapping probe', async () => {
    const exits = [];
    let releaseProbe;
    let calls = 0;
    const pendingProbe = new Promise(resolve => {
        releaseProbe = resolve;
    });
    const monitor = createWhatsAppLivenessMonitor({
        probe: async () => {
            calls += 1;
            return pendingProbe;
        },
        onUnhealthy: reason => exits.push(reason),
        logger: createLogger(),
        failureThreshold: 2,
        probeTimeoutMs: 15
    });

    monitor.markReady();
    const first = monitor.runProbe();
    const overlapping = await monitor.runProbe();

    assert.deepEqual(overlapping, {
        skipped: true,
        reason: 'probe_in_flight'
    });
    const timedOut = await first;
    assert.equal(timedOut.ok, false);
    assert.equal(timedOut.reason, 'probe_timeout');
    assert.equal(calls, 1);

    const stillPending = await monitor.runProbe();
    assert.equal(stillPending.ok, false);
    assert.equal(stillPending.reason, 'probe_still_in_flight');
    assert.equal(calls, 1);
    assert.deepEqual(exits, ['probe_still_in_flight']);

    releaseProbe('CONNECTED');
    await pendingProbe;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(monitor.getSnapshot().recoveryRequested, true);
    assert.equal(monitor.getSnapshot().status, 'degraded');
    assert.deepEqual(exits, ['probe_still_in_flight']);
});

test('transport protocol timeouts contribute to the same bounded recovery threshold', () => {
    const exits = [];
    const monitor = createWhatsAppLivenessMonitor({
        probe: async () => 'CONNECTED',
        onUnhealthy: reason => exits.push(reason),
        logger: createLogger(),
        failureThreshold: 2,
        probeTimeoutMs: 20
    });

    monitor.markReady();
    monitor.recordTransportFailure(new Error('Runtime.callFunctionOn timed out'));
    assert.equal(monitor.getSnapshot().consecutiveFailures, 1);
    assert.deepEqual(exits, []);

    monitor.recordTransportFailure(new Error('Runtime.callFunctionOn timed out'));
    monitor.recordTransportFailure(new Error('Runtime.callFunctionOn timed out'));
    assert.deepEqual(exits, ['protocol_timeout']);
});
