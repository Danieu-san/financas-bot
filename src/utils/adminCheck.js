// src/utils/adminCheck.js

const { adminIds } = require('../config/constants');

console.log('✅ Módulo de Verificação de Admin inicializado.');

/**
 * Verifica se um ID de usuário pertence à lista de administradores.
 * @param {string} userId - O ID do usuário (ex: '5521970112407@c.us')
 * @returns {boolean} - True se for admin, false caso contrário.
 */
function isAdmin(userId) {
    // O .has() de um Set é extremamente rápido e eficiente para essa checagem.
    return adminIds.has(userId);
}

module.exports = { isAdmin };