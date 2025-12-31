// src/utils/auth.js

// Carrega os IDs de administradores do arquivo .env
// Espera uma string de IDs separados por vírgula, ex: "5521970112407@c.us,5511987654321@c.us"
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];

/**
 * Verifica se um userId é um administrador.
 * @param {string} userId O ID do usuário (ex: "5521970112407@c.us").
 * @returns {boolean} True se o usuário for um administrador, False caso contrário.
 */
function isAdmin(userId) {
    // Normaliza o userId removendo o sufixo do WhatsApp, se presente
    const cleanUserId = userId.replace(/@c\.us$|@s\.whatsapp\.net$/, '');
    return ADMIN_IDS.includes(cleanUserId);
}

module.exports = {
    isAdmin
};