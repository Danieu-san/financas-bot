const assert = require('node:assert/strict');
const test = require('node:test');

const {
    installSingleFlightListenerAttachment,
    scheduleReadyRescue,
    triggerReadyRescue
} = require('../src/services/whatsappReadyRescueService');

test('triggerReadyRescue skips when startup is no longer pending', async () => {
    let evaluated = false;
    const result = await triggerReadyRescue({
        pupPage: {
            evaluate: async () => {
                evaluated = true;
                return {};
            }
        }
    }, {
        isStillPending: () => false
    });

    assert.deepEqual(result, { skipped: true, reason: 'not_pending' });
    assert.equal(evaluated, false);
});

test('triggerReadyRescue evaluates the WhatsApp page when startup is pending', async () => {
    let evaluated = false;
    const result = await triggerReadyRescue({
        pupPage: {
            evaluate: async fn => {
                evaluated = typeof fn === 'function';
                return {
                    href: 'https://web.whatsapp.com/',
                    title: '(1) WhatsApp',
                    wwebjs: 'object',
                    sync: 'function',
                    add: 'function',
                    triggered: true
                };
            }
        }
    }, {
        isStillPending: () => true,
        logger: { info() {}, warn() {} }
    });

    assert.equal(evaluated, true);
    assert.equal(result.skipped, false);
    assert.equal(result.result.triggered, true);
});
test('triggerReadyRescue attaches WhatsApp event listeners before emitting ready', async () => {
    const calls = [];
    const result = await triggerReadyRescue({
        attachEventListeners: async () => {
            calls.push('attach');
        },
        pupPage: {
            evaluate: async () => {
                calls.push('evaluate');
                return {
                    href: 'https://web.whatsapp.com/',
                    title: '(1) WhatsApp',
                    wwebjs: 'object',
                    sync: 'function',
                    add: 'function',
                    triggered: true
                };
            }
        }
    }, {
        isStillPending: () => true,
        logger: { info() {}, warn() {} }
    });

    assert.equal(result.skipped, false);
    assert.deepEqual(calls, ['attach', 'evaluate']);
});

test('triggerReadyRescue continues when the message page binding already exists', async () => {
    const calls = [];
    const result = await triggerReadyRescue({
        attachEventListeners: async () => {
            calls.push('attach');
            throw new Error(
                "Failed to add page binding with name onAddMessageEvent: "
                + "window['onAddMessageEvent'] already exists!"
            );
        },
        pupPage: {
            evaluate: async () => {
                calls.push('evaluate');
                return {
                    wwebjs: 'object',
                    sync: 'function',
                    add: 'function',
                    triggered: true
                };
            }
        }
    }, {
        isStillPending: () => true,
        logger: { info() {}, warn() {} }
    });

    assert.equal(result.skipped, false);
    assert.equal(result.result.triggered, true);
    assert.deepEqual(calls, ['attach', 'evaluate']);
});

test('single-flight attachment makes rescue await the initialization attachment', async () => {
    let finishAttachment;
    let attachments = 0;
    let evaluations = 0;
    const client = {
        attachEventListeners() {
            attachments += 1;
            return new Promise(resolve => {
                finishAttachment = resolve;
            });
        },
        pupPage: {
            async evaluate() {
                evaluations += 1;
                return { triggered: true };
            }
        }
    };
    installSingleFlightListenerAttachment(client);

    const initializationAttachment = client.attachEventListeners();
    const rescue = triggerReadyRescue(client, {
        isStillPending: () => true,
        logger: { info() {}, warn() {} }
    });
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(attachments, 1);
    assert.equal(evaluations, 0);
    finishAttachment();
    await Promise.all([initializationAttachment, rescue]);

    assert.equal(attachments, 1);
    assert.equal(evaluations, 1);
});

test('single-flight attachment permits a later completed reattachment', async () => {
    let attachments = 0;
    const client = {
        async attachEventListeners() {
            attachments += 1;
        }
    };
    installSingleFlightListenerAttachment(client);
    installSingleFlightListenerAttachment(client);

    const first = client.attachEventListeners();
    const concurrent = client.attachEventListeners();
    assert.equal(first, concurrent);
    await first;
    await client.attachEventListeners();

    assert.equal(attachments, 2);
});

test('single-flight attachment clears a shared rejection before a later retry', async () => {
    let attachments = 0;
    const client = {
        async attachEventListeners() {
            attachments += 1;
            if (attachments === 1) throw new Error('transient attach failure');
        }
    };
    installSingleFlightListenerAttachment(client);

    const first = client.attachEventListeners();
    const shared = client.attachEventListeners();
    assert.equal(first, shared);
    const results = await Promise.allSettled([first, shared]);
    assert.deepEqual(results.map(result => result.status), ['rejected', 'rejected']);

    await client.attachEventListeners();
    assert.equal(attachments, 2);
});

test('triggerReadyRescue rejects a different attachEventListeners failure', async () => {
    let evaluations = 0;
    await assert.rejects(
        triggerReadyRescue({
            attachEventListeners: async () => {
                throw new Error('different private binding failure');
            },
            pupPage: {
                evaluate: async () => {
                    evaluations += 1;
                }
            }
        }, {
            isStillPending: () => true,
            logger: { info() {}, warn() {} }
        }),
        /different private binding failure/
    );
    assert.equal(evaluations, 0);
});

test('triggerReadyRescue stops when readiness is cancelled during listener attachment', async () => {
    let pending = true;
    let evaluations = 0;
    const result = await triggerReadyRescue({
        async attachEventListeners() {
            pending = false;
        },
        pupPage: {
            async evaluate() {
                evaluations += 1;
                return { triggered: true };
            }
        }
    }, {
        isStillPending: () => pending,
        logger: { info() {}, warn() {} }
    });

    assert.deepEqual(result, {
        skipped: true,
        reason: 'not_pending_after_attach'
    });
    assert.equal(evaluations, 0);
});

test('scheduleReadyRescue retries a transient failure and stops after ready', async () => {
    const timers = [];
    const warnings = [];
    let pending = true;
    let attachments = 0;
    let evaluations = 0;

    scheduleReadyRescue({
        async attachEventListeners() {
            attachments += 1;
            if (attachments === 1) throw new Error('transient attach failure');
        },
        pupPage: {
            async evaluate() {
                evaluations += 1;
                pending = false;
                return { triggered: true };
            }
        }
    }, {
        delayMs: 10,
        retryDelayMs: 20,
        maxAttempts: 3,
        isStillPending: () => pending,
        setTimeoutFn(callback, delayMs) {
            timers.push({ callback, delayMs });
            return timers.length;
        },
        clearTimeoutFn() {},
        logger: {
            info() {},
            warn(message) { warnings.push(message); }
        }
    });

    assert.equal(timers.length, 1);
    assert.equal(timers[0].delayMs, 10);
    await timers.shift().callback();
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delayMs, 20);
    await timers.shift().callback();

    assert.equal(attachments, 2);
    assert.equal(evaluations, 1);
    assert.equal(timers.length, 0);
    assert.equal(warnings.some(message => message.includes('attempt=1')), true);
    assert.equal(warnings.some(message => message.includes('exhausted')), false);
});

test('scheduleReadyRescue caps configured attempts and reports exhaustion', async () => {
    const timers = [];
    const warnings = [];
    let attempts = 0;

    scheduleReadyRescue({
        async attachEventListeners() {
            attempts += 1;
            throw new Error('persistent attach failure');
        },
        pupPage: { async evaluate() { return { triggered: false }; } }
    }, {
        delayMs: 1,
        retryDelayMs: 1,
        maxAttempts: 99,
        isStillPending: () => true,
        setTimeoutFn(callback, delayMs) {
            timers.push({ callback, delayMs });
            return timers.length;
        },
        clearTimeoutFn() {},
        logger: {
            info() {},
            warn(message) { warnings.push(message); }
        }
    });

    while (timers.length) {
        await timers.shift().callback();
    }

    assert.equal(attempts, 3);
    assert.equal(warnings.filter(message => message.includes('ready_rescue_failed')).length, 3);
    assert.equal(warnings.filter(message => message.includes('ready_rescue_exhausted')).length, 1);
});

test('scheduleReadyRescue cancellation clears the pending attempt', () => {
    const cleared = [];
    const rescue = scheduleReadyRescue({}, {
        delayMs: 1,
        setTimeoutFn() { return 42; },
        clearTimeoutFn(timer) { cleared.push(timer); }
    });

    rescue.cancel();
    rescue.cancel();
    assert.deepEqual(cleared, [42]);
});

test('scheduleReadyRescue cancellation stops an attachment already in flight', async () => {
    const timers = [];
    let finishAttachment;
    let evaluations = 0;
    const client = {
        attachEventListeners() {
            return new Promise(resolve => {
                finishAttachment = resolve;
            });
        },
        pupPage: {
            async evaluate() {
                evaluations += 1;
                return { triggered: true };
            }
        }
    };
    installSingleFlightListenerAttachment(client);
    const rescue = scheduleReadyRescue(client, {
        delayMs: 1,
        isStillPending: () => true,
        setTimeoutFn(callback) {
            timers.push(callback);
            return timers.length;
        },
        clearTimeoutFn() {},
        logger: { info() {}, warn() {} }
    });

    const activeAttempt = timers.shift()();
    await Promise.resolve();
    await Promise.resolve();
    rescue.cancel();
    finishAttachment();
    await activeAttempt;

    assert.equal(evaluations, 0);
    assert.equal(timers.length, 0);
});
