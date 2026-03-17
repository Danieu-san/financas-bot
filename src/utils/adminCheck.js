// src/utils/adminCheck.js

const { adminIds, userMap } = require('../config/constants');

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

const adminDigits = new Set(
    Array.from(adminIds).map(normalizeDigits).filter(Boolean)
);

const adminDisplayNames = new Set(
    Array.from(adminIds)
        .map(id => normalizeText(userMap[id]))
        .filter(Boolean)
);

function isAdmin(userId) {
    if (adminIds.has(userId)) return true;
    const digits = normalizeDigits(userId);
    return Boolean(digits && adminDigits.has(digits));
}

function isAdminWithContext(userId, user) {
    if (isAdmin(userId)) return true;

    // Compatibilidade para IDs @lid quando o contato admin aparece com outro identificador.
    const displayName = normalizeText(user?.display_name || '');
    if (displayName && adminDisplayNames.has(displayName)) {
        return true;
    }

    return false;
}

module.exports = { isAdmin, isAdminWithContext };
