const test = require('node:test');
const assert = require('node:assert');

const {
    LOGGED_IN_SELECTORS,
    QR_SELECTORS,
    WHATSAPP_WEB_URL,
    buildChatUrl
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
    assert.ok(QR_SELECTORS.length >= 1);
});
