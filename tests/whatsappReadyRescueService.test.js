const assert = require('node:assert/strict');
const test = require('node:test');

const {
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
