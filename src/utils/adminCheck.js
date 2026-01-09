// src/utils/adminCheck.js
console.log('✅ Módulo de Verificação de Admin inicializado.');

function normalizeWhatsappId(id) {
  if (!id) return '';
  let s = String(id).trim();

  // remove aspas acidentais no env: "5521..." ou '5521...'
  s = s.replace(/^['"]|['"]$/g, '');

  // se já tem sufixo do WhatsApp, só padroniza
  if (s.includes('@')) return s.toLowerCase();

  // se veio só número, padroniza para @c.us
  const digits = s.replace(/\D/g, '');
  return digits ? `${digits}@c.us` : s.toLowerCase();
}

/**
 * Verifica se um ID de usuário pertence à lista de administradores.
 * @param {string} userId - O ID do usuário (ex: '5521970112407@c.us')
 * @returns {boolean}
 */
function isAdmin(userId) {
    const { adminIds } = require('../config/constants'); // ✅ lazy require
    const normalized = normalizeWhatsappId(userId);
    return adminIds.has(normalized);
}

module.exports = { isAdmin, normalizeWhatsappId };