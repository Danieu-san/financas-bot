const assert = require('node:assert/strict');
const test = require('node:test');

const {
    createSupervisorExitRequester
} = require('../src/services/supervisorExitService');

test('concurrent recovery causes schedule exactly one supervisor exit', () => {
    const logs = [];
    const timers = [];
    const exits = [];
    const requester = createSupervisorExitRequester({
        logger: {
            error(message) {
                logs.push(message);
            }
        },
        delayMs: 25,
        setTimeoutFn(callback, delayMs) {
            timers.push({ callback, delayMs });
            return timers.length;
        },
        exitFn(code) {
            exits.push(code);
        }
    });

    assert.equal(requester.request('runtime_liveness_failed'), true);
    assert.equal(requester.request('client_disconnected'), false);
    assert.equal(requester.request('auth_failure'), false);
    assert.equal(requester.isRequested(), true);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delayMs, 25);
    assert.deepEqual(logs, [
        '[whatsapp] unavailable reason_code=runtime_liveness_failed'
    ]);

    timers[0].callback();
    assert.deepEqual(exits, [1]);
});
