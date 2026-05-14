const path = require('node:path');

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_PROFILE_DIR = '.e2e/whatsapp-sender-profile';
const VALID_SENDER_KINDS = new Set(['personal-temporary', 'qa-dedicated']);

function parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;

    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'sim', 's'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'nao', 'não'].includes(normalized)) return false;

    throw new Error(`Valor booleano invalido: ${value}`);
}

function parsePositiveInteger(value, fallback, name) {
    if (value === undefined || value === null || value === '') return fallback;

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${name} deve ser um numero inteiro positivo.`);
    }

    return parsed;
}

function normalizePhone(value, name) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) {
        throw new Error(`${name} deve conter um telefone valido com DDI e DDD.`);
    }

    if (digits.length < 10) {
        throw new Error(`${name} parece curto demais. Use DDI + DDD + numero.`);
    }

    return digits;
}

function requireEnv(env, name) {
    const value = env[name];
    if (value === undefined || value === null || String(value).trim() === '') {
        throw new Error(`Variavel obrigatoria ausente: ${name}`);
    }
    return String(value).trim();
}

function loadWhatsAppE2EConfig(env = process.env, options = {}) {
    const enabled = parseBoolean(env.WHATSAPP_E2E_ENABLED, false);

    if (!enabled) {
        if (options.allowDisabled) {
            return { enabled: false };
        }

        throw new Error(
            'WhatsApp E2E esta desabilitado. Defina WHATSAPP_E2E_ENABLED=true para rodar testes reais.'
        );
    }

    const botPhone = normalizePhone(requireEnv(env, 'WHATSAPP_E2E_BOT_PHONE'), 'WHATSAPP_E2E_BOT_PHONE');
    const testUserPhone = normalizePhone(
        requireEnv(env, 'WHATSAPP_E2E_TEST_USER_PHONE'),
        'WHATSAPP_E2E_TEST_USER_PHONE'
    );

    if (botPhone === testUserPhone) {
        throw new Error('WHATSAPP_E2E_BOT_PHONE e WHATSAPP_E2E_TEST_USER_PHONE nao podem ser o mesmo numero.');
    }

    const senderKind = String(env.WHATSAPP_E2E_SENDER_KIND || 'personal-temporary').trim();
    if (!VALID_SENDER_KINDS.has(senderKind)) {
        throw new Error(
            `WHATSAPP_E2E_SENDER_KIND invalido: ${senderKind}. Use personal-temporary ou qa-dedicated.`
        );
    }

    const profileDir = String(env.WHATSAPP_E2E_PROFILE_DIR || DEFAULT_PROFILE_DIR).trim();
    if (!profileDir) {
        throw new Error('WHATSAPP_E2E_PROFILE_DIR nao pode ficar vazio.');
    }

    return {
        enabled: true,
        botPhone,
        testUserPhone,
        senderKind,
        botChatName: String(env.WHATSAPP_E2E_BOT_CHAT_NAME || '').trim(),
        timeoutMs: parsePositiveInteger(env.WHATSAPP_E2E_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 'WHATSAPP_E2E_TIMEOUT_MS'),
        headless: parseBoolean(env.WHATSAPP_E2E_HEADLESS, false),
        resetSpreadsheet: parseBoolean(env.WHATSAPP_E2E_RESET_SPREADSHEET, false),
        profileDir,
        profilePath: path.resolve(process.cwd(), profileDir)
    };
}

module.exports = {
    DEFAULT_PROFILE_DIR,
    DEFAULT_TIMEOUT_MS,
    VALID_SENDER_KINDS,
    loadWhatsAppE2EConfig,
    parseBoolean,
    parsePositiveInteger,
    normalizePhone
};
