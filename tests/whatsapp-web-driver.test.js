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

test('whatsappWebDriver respects configured load timeout for slow WhatsApp Web sessions', () => {
    assert.strictEqual(resolveWhatsAppLoadTimeout({ timeoutMs: 180000 }), 180000);
    assert.strictEqual(resolveWhatsAppLoadTimeout({}), 60000);
});
