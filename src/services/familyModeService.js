const { normalizeText } = require('../utils/helpers');

function splitList(value) {
    return String(value || '')
        .split(',')
        .map(item => String(item || '').trim())
        .filter(Boolean);
}

function normalizeWhatsappId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.endsWith('@c.us') || raw.endsWith('@lid')) return raw;
    const digits = raw.replace(/\D+/g, '');
    return digits ? `${digits}@c.us` : raw;
}

function truthy(value) {
    return ['1', 'true', 'sim', 'yes', 'on', 'enabled', 'ativo'].includes(normalizeText(value));
}

function getFamilyModeConfig({ env = process.env } = {}) {
    const enabled = truthy(env.FAMILY_MODE_ENABLED);
    const allowedUserIds = splitList(env.FAMILY_MODE_USER_IDS);
    const allowedWhatsappIds = splitList(env.FAMILY_MODE_WHATSAPP_IDS).map(normalizeWhatsappId);
    return {
        enabled,
        allowedUserIds,
        allowedWhatsappIds
    };
}

function evaluateFamilyModeAccess({ user = {}, senderId = '', env = process.env } = {}) {
    const config = getFamilyModeConfig({ env });
    if (!config.enabled) return { allowed: true, reason: 'family_mode_disabled' };

    const allowedUserIds = new Set(config.allowedUserIds);
    const allowedWhatsappIds = new Set(config.allowedWhatsappIds);
    if (allowedUserIds.size === 0 && allowedWhatsappIds.size === 0) {
        return {
            allowed: false,
            reason: 'family_mode_empty_allowlist',
            reply: 'O FinançasBot está em modo familiar restrito. Peça ao Daniel para revisar a configuração de acesso.'
        };
    }

    const userId = String(user?.user_id || '').trim();
    const userWhatsappId = normalizeWhatsappId(user?.whatsapp_id || '');
    const senderWhatsappId = normalizeWhatsappId(senderId);
    const phoneWhatsappId = normalizeWhatsappId(user?.phone_e164 || '');

    const allowed = (
        (userId && allowedUserIds.has(userId)) ||
        (userWhatsappId && allowedWhatsappIds.has(userWhatsappId)) ||
        (senderWhatsappId && allowedWhatsappIds.has(senderWhatsappId)) ||
        (phoneWhatsappId && allowedWhatsappIds.has(phoneWhatsappId))
    );

    return allowed
        ? { allowed: true, reason: 'family_mode_allowlisted' }
        : {
            allowed: false,
            reason: 'family_mode_not_allowlisted',
            reply: 'O FinançasBot está em modo familiar restrito para Daniel e Thaís. Este acesso não está habilitado.'
        };
}

module.exports = {
    getFamilyModeConfig,
    evaluateFamilyModeAccess,
    __test__: {
        splitList,
        normalizeWhatsappId,
        truthy
    }
};
