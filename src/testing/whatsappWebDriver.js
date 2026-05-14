const fs = require('node:fs');
const { chromium } = require('playwright');

const WHATSAPP_WEB_URL = 'https://web.whatsapp.com/';

const LOGGED_IN_SELECTORS = [
    '[data-testid="chat-list"]',
    '[aria-label="Chat list"]',
    '[aria-label="Lista de conversas"]',
    'div[contenteditable="true"][role="textbox"]'
];

const QR_SELECTORS = [
    'canvas',
    '[data-testid="qrcode"]'
];

const MESSAGE_BOX_SELECTORS = [
    'footer div[contenteditable="true"][role="textbox"]',
    'div[aria-label="Digite uma mensagem"][contenteditable="true"]',
    'div[aria-placeholder="Digite uma mensagem"][contenteditable="true"]',
    'div[aria-label="Type a message"][contenteditable="true"]',
    'div[aria-placeholder="Type a message"][contenteditable="true"]'
];

function firstVisibleLocator(page, selectors) {
    return Promise.any(selectors.map(async selector => {
        const locator = page.locator(selector).first();
        await locator.waitFor({ state: 'visible', timeout: 1500 });
        return { selector, locator };
    })).catch(() => null);
}

function buildChatUrl(phone) {
    return `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=&type=phone_number&app_absent=0`;
}

function countOccurrences(text, search) {
    if (!search) return 0;
    return String(text || '').split(search).length - 1;
}

async function launchWhatsAppWebDriver(config, options = {}) {
    fs.mkdirSync(config.profilePath, { recursive: true });

    const context = await chromium.launchPersistentContext(config.profilePath, {
        headless: options.headless ?? config.headless,
        viewport: options.viewport || { width: 1366, height: 900 },
        args: ['--start-maximized']
    });

    const page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(config.timeoutMs);

    return new WhatsAppWebDriver({ context, page, config });
}

class WhatsAppWebDriver {
    constructor({ context, page, config }) {
        this.context = context;
        this.page = page;
        this.config = config;
    }

    async gotoHome() {
        await this.page.goto(WHATSAPP_WEB_URL, {
            waitUntil: 'domcontentloaded',
            timeout: this.config.timeoutMs
        });
    }

    async assertLoggedIn() {
        const loggedIn = await firstVisibleLocator(this.page, LOGGED_IN_SELECTORS);
        if (loggedIn) {
            return loggedIn.selector;
        }

        const qr = await firstVisibleLocator(this.page, QR_SELECTORS);
        if (qr) {
            throw new Error(
                'WhatsApp Web nao esta logado. Rode `npm run test:whatsapp:e2e:setup` e escaneie o QR Code.'
            );
        }

        throw new Error('Nao foi possivel confirmar login no WhatsApp Web. Verifique a janela aberta e tente novamente.');
    }

    async openChat(phone = this.config.botPhone) {
        await this.page.goto(buildChatUrl(phone), {
            waitUntil: 'domcontentloaded',
            timeout: this.config.timeoutMs
        });

        await this.assertLoggedIn();
        await this.getMessageBox();
        return this.page.url();
    }

    async getMessageBox() {
        const result = await firstVisibleLocator(this.page, MESSAGE_BOX_SELECTORS);
        if (!result) {
            throw new Error('Campo de mensagem do WhatsApp Web nao encontrado. Verifique se o chat do bot abriu corretamente.');
        }
        return result.locator;
    }

    async getVisibleText() {
        return this.page.evaluate(() => document.body.innerText || '');
    }

    async countTextOccurrences(search) {
        return countOccurrences(await this.getVisibleText(), search);
    }

    async sendMessage(text) {
        const box = await this.getMessageBox();
        await box.click();
        await this.page.keyboard.insertText(text);
        await this.page.keyboard.press('Enter');
    }

    async waitForIncomingMessage({ contains, previousCount = 0, timeoutMs = this.config.timeoutMs }) {
        await this.page.waitForFunction(
            ({ text, minCount }) => {
                const bodyText = document.body.innerText || '';
                return bodyText.split(text).length - 1 > minCount;
            },
            { text: contains, minCount: previousCount },
            { timeout: timeoutMs }
        );

        return contains;
    }

    async close() {
        await this.context.close();
    }
}

module.exports = {
    LOGGED_IN_SELECTORS,
    MESSAGE_BOX_SELECTORS,
    QR_SELECTORS,
    WHATSAPP_WEB_URL,
    WhatsAppWebDriver,
    buildChatUrl,
    countOccurrences,
    launchWhatsAppWebDriver
};
