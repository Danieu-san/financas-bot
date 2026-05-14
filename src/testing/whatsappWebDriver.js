const fs = require('node:fs');
const { chromium } = require('playwright');

const WHATSAPP_WEB_URL = 'https://web.whatsapp.com/';

const LOGGED_IN_SELECTORS = [
    '[data-testid="chat-list"]',
    '[data-testid="chat-list-search"]',
    '#pane-side',
    '[aria-label="Chat list"]',
    '[aria-label="Lista de conversas"]',
    '[aria-label="Search input textbox"]',
    '[aria-label="Caixa de texto de pesquisa"]',
    'div[contenteditable="true"][aria-label*="Pesquisar"]',
    'div[contenteditable="true"][aria-label*="Search"]',
    'div[contenteditable="true"][role="textbox"]'
];

const QR_SELECTORS = [
    'canvas',
    '[data-testid="qrcode"]'
];

const MESSAGE_BOX_SELECTORS = [
    'footer div[contenteditable="true"][role="textbox"]',
    'footer div[contenteditable="true"]',
    'div[contenteditable="true"][data-tab="10"]',
    'div[contenteditable="true"][data-lexical-editor="true"]',
    '[data-testid="conversation-compose-box-input"]',
    'div[aria-label="Digite uma mensagem"][contenteditable="true"]',
    'div[aria-placeholder="Digite uma mensagem"][contenteditable="true"]',
    'div[aria-label="Type a message"][contenteditable="true"]',
    'div[aria-placeholder="Type a message"][contenteditable="true"]'
];

const SEARCH_BOX_SELECTORS = [
    'input[aria-label="Pesquisar ou começar uma nova conversa"]',
    'input[placeholder="Pesquisar ou começar uma nova conversa"]',
    'input[aria-label="Search or start a new chat"]',
    'input[placeholder="Search or start a new chat"]',
    '[data-testid="chat-list-search"] div[contenteditable="true"]',
    '[aria-label="Search input textbox"]',
    '[aria-label="Caixa de texto de pesquisa"]',
    'div[contenteditable="true"][aria-label*="Pesquisar"]',
    'div[contenteditable="true"][aria-label*="Search"]'
];

function firstVisibleLocator(page, selectors, timeoutMs = 1500) {
    return Promise.any(selectors.map(async selector => {
        const locator = page.locator(selector).first();
        await locator.waitFor({ state: 'visible', timeout: timeoutMs });
        return { selector, locator };
    })).catch(() => null);
}

function buildChatUrl(phone) {
    return `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=&type=phone_number&app_absent=0`;
}

function cssString(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function countOccurrences(text, search) {
    if (!search) return 0;
    return String(text || '').split(search).length - 1;
}

async function describeContentEditableFields(page) {
    return page.locator('div[contenteditable="true"]').evaluateAll(nodes => nodes.slice(0, 10).map(node => ({
        ariaLabel: node.getAttribute('aria-label'),
        ariaPlaceholder: node.getAttribute('aria-placeholder'),
        dataTab: node.getAttribute('data-tab'),
        role: node.getAttribute('role'),
        text: (node.innerText || '').slice(0, 80)
    }))).catch(() => []);
}

async function describeClickableCandidates(page) {
    return page.locator('[aria-label], [title], [data-testid], input').evaluateAll(nodes => nodes.slice(0, 60).map(node => ({
        tag: node.tagName,
        ariaLabel: node.getAttribute('aria-label'),
        title: node.getAttribute('title'),
        dataTestId: node.getAttribute('data-testid'),
        role: node.getAttribute('role'),
        placeholder: node.getAttribute('placeholder'),
        text: (node.innerText || node.getAttribute('value') || '').slice(0, 80)
    }))).catch(() => []);
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
        const loggedIn = await firstVisibleLocator(this.page, LOGGED_IN_SELECTORS, Math.min(this.config.timeoutMs, 30000));
        if (loggedIn) {
            return loggedIn.selector;
        }

        const qr = await firstVisibleLocator(this.page, QR_SELECTORS, 3000);
        if (qr) {
            throw new Error(
                'WhatsApp Web nao esta logado. Rode `npm run test:whatsapp:e2e:setup` e escaneie o QR Code.'
            );
        }

        throw new Error('Nao foi possivel confirmar login no WhatsApp Web. Verifique a janela aberta e tente novamente.');
    }

    async openChat(phone = this.config.botPhone) {
        if (this.config.botChatName) {
            try {
                return await this.openChatBySearch(this.config.botChatName);
            } catch (error) {
                console.log(`Chat "${this.config.botChatName}" nao encontrado; tentando pelo telefone ${phone}.`);
            }
        }

        return this.openChatBySearch(phone);
    }

    async openChatBySearch(query) {
        await this.gotoHome();
        await this.assertLoggedIn();

        const search = await firstVisibleLocator(this.page, SEARCH_BOX_SELECTORS, Math.min(this.config.timeoutMs, 30000));
        if (!search) {
            const candidates = await describeClickableCandidates(this.page);
            throw new Error(
                `Campo de busca do WhatsApp Web nao encontrado para abrir o chat pelo nome. ` +
                `Candidatos visiveis: ${JSON.stringify(candidates)}`
            );
        }

        await search.locator.click();
        await this.page.keyboard.press('Control+A');
        await this.page.keyboard.press('Backspace');
        await this.page.keyboard.insertText(query);

        const exactTitle = this.page.locator(`span[title="${cssString(query)}"]`).first();
        const looseText = this.page.getByText(query, { exact: false }).first();

        await Promise.any([
            exactTitle.waitFor({ state: 'visible', timeout: this.config.timeoutMs }).then(() => exactTitle.click()),
            looseText.waitFor({ state: 'visible', timeout: this.config.timeoutMs }).then(() => looseText.click())
        ]).catch(() => {
            throw new Error(`Chat "${query}" nao encontrado na busca do WhatsApp Web.`);
        });

        await this.getMessageBox();
        return this.page.url();
    }

    async getMessageBox() {
        const result = await firstVisibleLocator(this.page, MESSAGE_BOX_SELECTORS);
        if (!result) {
            const fields = await describeContentEditableFields(this.page);
            throw new Error(
                `Campo de mensagem do WhatsApp Web nao encontrado. URL atual: ${this.page.url()}. ` +
                `Campos editaveis visiveis: ${JSON.stringify(fields)}`
            );
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

    async waitForAnyIncomingMessage({ containsAny, previousCounts = {}, timeoutMs = this.config.timeoutMs }) {
        const found = await this.page.waitForFunction(
            ({ texts, counts }) => {
                const bodyText = document.body.innerText || '';
                return texts.find(text => bodyText.split(text).length - 1 > (counts[text] || 0)) || null;
            },
            { texts: containsAny, counts: previousCounts },
            { timeout: timeoutMs }
        );

        return found.jsonValue();
    }

    async close() {
        await this.context.close();
    }
}

module.exports = {
    LOGGED_IN_SELECTORS,
    MESSAGE_BOX_SELECTORS,
    QR_SELECTORS,
    SEARCH_BOX_SELECTORS,
    WHATSAPP_WEB_URL,
    WhatsAppWebDriver,
    buildChatUrl,
    countOccurrences,
    describeContentEditableFields,
    describeClickableCandidates,
    launchWhatsAppWebDriver
};
