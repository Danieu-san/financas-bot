const test = require('node:test');
const assert = require('node:assert');

const {
    LOGGED_IN_SELECTORS,
    MESSAGE_BOX_SELECTORS,
    QR_SELECTORS,
    SEARCH_BOX_SELECTORS,
    WHATSAPP_WEB_URL,
    buildChatUrl,
    countOccurrences,
    isIncomingMessageMetadata,
    isNewExpectedReply,
    resolveWhatsAppLoadTimeout
} = require('../src/testing/whatsappWebDriver');

test('whatsappWebDriver.buildChatUrl opens the bot chat without prefilled text', () => {
    const url = buildChatUrl('55 21 99999-9999');

    assert.strictEqual(
        url,
        'https://web.whatsapp.com/send?phone=55%2021%2099999-9999&text=&type=phone_number&app_absent=0'
    );
});

test('whatsappWebDriver exports stable selector groups', () => {
    assert.strictEqual(WHATSAPP_WEB_URL, 'https://web.whatsapp.com/');
    assert.ok(LOGGED_IN_SELECTORS.length >= 1);
    assert.ok(MESSAGE_BOX_SELECTORS.length >= 1);
    assert.ok(QR_SELECTORS.length >= 1);
    assert.ok(SEARCH_BOX_SELECTORS.length >= 1);
});

test('whatsappWebDriver.countOccurrences counts repeated reply text', () => {
    assert.strictEqual(countOccurrences('abc abc abc', 'abc'), 3);
    assert.strictEqual(countOccurrences('sem correspondencia', 'xyz'), 0);
    assert.strictEqual(countOccurrences('', 'abc'), 0);
});

test('whatsappWebDriver recognizes grouped incoming bubbles without tail-in', () => {
    assert.strictEqual(isIncomingMessageMetadata({ hasDataId: true }), true);
    assert.strictEqual(isIncomingMessageMetadata({ hasDataId: true, hasTailIn: true }), true);
    assert.strictEqual(isIncomingMessageMetadata({ hasDataId: true, hasTailOut: true }), false);
    assert.strictEqual(isIncomingMessageMetadata({ hasDataId: true, hasOutgoingStatus: true }), false);
    assert.strictEqual(isIncomingMessageMetadata({ hasDataId: true, matchesOutgoing: true }), false);
});

test('whatsappWebDriver recognizes a repeated analytical answer as new when the latest incoming message changes', () => {
    assert.strictEqual(
        isNewExpectedReply(
            'Total gasto em junho/2026: R$ 226,01',
            'incoming-new',
            'incoming-old',
            ['Total gasto em', 'Critério:']
        ),
        'Total gasto em'
    );
    assert.strictEqual(
        isNewExpectedReply(
            'Total gasto em junho/2026: R$ 226,01',
            'incoming-same',
            'incoming-same',
            ['Total gasto em', 'Critério:']
        ),
        null
    );
});

test('whatsapp E2E assertions require every token in a newly received message', async () => {
    const { sendAndWaitForAllReply } = require('../src/testing/e2eAssertions');
    const calls = [];
    const driver = {
        config: { timeoutMs: 1000 },
        getIncomingMessageFingerprints: async () => ['old-a', 'old-b'],
        sendMessage: async text => calls.push(['send', text]),
        waitForNewIncomingMessageContainingAll: async options => calls.push(['wait-new', options])
    };

    const found = await sendAndWaitForAllReply(
        driver,
        'Pix',
        ['Confirma', 'Conta telefone'],
        { settleMs: 0 }
    );

    assert.deepStrictEqual(found, ['Confirma', 'Conta telefone']);
    assert.deepStrictEqual(calls[0], ['send', 'Pix']);
    assert.deepStrictEqual(calls[1], ['wait-new', {
        containsAll: ['Confirma', 'Conta telefone'],
        previousFingerprints: ['old-a', 'old-b'],
        timeoutMs: 1000
    }]);
});

test('whatsapp E2E assertions count only incoming replies before sending a message', async () => {
    const { sendAndWaitForAnyReply } = require('../src/testing/e2eAssertions');
    const calls = [];
    const driver = {
        config: { timeoutMs: 1000 },
        countIncomingTextOccurrences: async text => {
            calls.push(['countIncoming', text]);
            return 0;
        },
        getLatestIncomingFingerprint: async () => 'before',
        sendMessage: async text => calls.push(['send', text]),
        waitForAnyIncomingMessage: async options => {
            calls.push(['wait', options]);
            return 'reserva';
        },
        getVisibleText: async () => ''
    };

    await sendAndWaitForAnyReply(driver, 'pergunta com reserva', ['reserva'], { settleMs: 0 });

    assert.deepStrictEqual(calls[0], ['countIncoming', 'reserva']);
    assert.deepStrictEqual(calls[1], ['send', 'pergunta com reserva']);
    assert.strictEqual(calls[2][1].previousCounts.reserva, 0);
});

test('whatsapp E2E assertions can accept a newly visible reply when incoming selector misses it', async () => {
    const { sendAndWaitForAnyReply } = require('../src/testing/e2eAssertions');
    let visibleText = 'historico';
    const driver = {
        config: { timeoutMs: 1000 },
        countIncomingTextOccurrences: async () => 0,
        getLatestIncomingFingerprint: async () => 'before',
        getVisibleText: async () => visibleText,
        sendMessage: async () => {
            visibleText += '\nItem(ns) apagado(s) com sucesso!';
        },
        waitForAnyIncomingMessage: async () => {
            throw new Error('selector missed the incoming message');
        }
    };

    const found = await sendAndWaitForAnyReply(
        driver,
        'sim',
        ['Item(ns) apagado(s) com sucesso'],
        { settleMs: 0 }
    );

    assert.strictEqual(found, 'Item(ns) apagado(s) com sucesso');
});

test('whatsappWebDriver respects configured load timeout for slow WhatsApp Web sessions', () => {
    assert.strictEqual(resolveWhatsAppLoadTimeout({ timeoutMs: 180000 }), 180000);
    assert.strictEqual(resolveWhatsAppLoadTimeout({}), 60000);
});
