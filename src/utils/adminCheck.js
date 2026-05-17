// src/utils/adminCheck.js

const constants = require('../config/constants');
const { userMap } = constants;

console.log('✅ Módulo de Verificação de Admin inicializado.');

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function normalizeDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

function getCurrentAdminIds() {
    return constants.getAdminIds ? constants.getAdminIds() : constants.adminIds;
}

function getCurrentAdminDigits() {
    return new Set(Array.from(getCurrentAdminIds()).map(normalizeDigits).filter(Boolean));
}

function getCurrentAdminDisplayNames() {
    return new Set(
        Array.from(getCurrentAdminIds())
            .map(id => normalizeText(userMap[id]))
            .filter(Boolean)
    );
}

function isAdmin(userId) {
    const adminIds = getCurrentAdminIds();
    if (adminIds.has(userId)) return true;
    const digits = normalizeDigits(userId);
    return Boolean(digits && getCurrentAdminDigits().has(digits));
}

function isAdminWithContext(userId, user) {
    if (isAdmin(userId)) return true;

    // Compatibilidade para IDs @lid quando o contato admin aparece com outro identificador.
    const displayName = normalizeText(user?.display_name || '');
    if (displayName && getCurrentAdminDisplayNames().has(displayName)) {
        return true;
    }

    return false;
}

module.exports = { isAdmin, isAdminWithContext };
