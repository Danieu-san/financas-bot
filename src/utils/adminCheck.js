// src/utils/adminCheck.js

const constants = require('../config/constants');

console.log('✅ Módulo de Verificação de Admin inicializado.');

function normalizeDigits(value) {
    return String(value || '').replace(/\D/g, '');
}

function getCurrentAdminIds() {
    return constants.getAdminIds ? constants.getAdminIds() : constants.adminIds;
}

function getCurrentAdminDigits() {
    return new Set(Array.from(getCurrentAdminIds()).map(normalizeDigits).filter(Boolean));
}

function isAdmin(userId) {
    const adminIds = getCurrentAdminIds();
    if (adminIds.has(userId)) return true;
    const digits = normalizeDigits(userId);
    return Boolean(digits && getCurrentAdminDigits().has(digits));
}

function isAdminWithContext(userId) {
    return isAdmin(userId);
}

module.exports = { isAdmin, isAdminWithContext };
