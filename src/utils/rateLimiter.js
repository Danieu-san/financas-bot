// src/utils/rateLimiter.js

// Carrega os limites do .env ou usa valores padrão seguros
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 20; // 20 msg
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 60000; // por 1 minuto

// Mapa para armazenar os timestamps das requisições de cada usuário
const userRequests = new Map();

console.log('✅ Módulo Rate Limiter inicializado.');

function isAllowed(userId) {
    const now = Date.now();
    const requests = userRequests.get(userId) || [];

    // 1. Remove os timestamps que já expiraram (são mais antigos que a janela de tempo)
    const recentRequests = requests.filter(timestamp => (now - timestamp) < RATE_LIMIT_WINDOW_MS);

    // 2. Verifica se o número de requisições recentes ultrapassou o limite
    if (recentRequests.length >= RATE_LIMIT_MAX) {
        console.warn(`🚦 Rate limit atingido para o usuário: ${userId}`);
        return false; // Usuário bloqueado
    }

    // 3. Se estiver dentro do limite, adiciona o timestamp atual e permite a passagem
    recentRequests.push(now);
    userRequests.set(userId, recentRequests);
    return true; // Usuário permitido
}

module.exports = { isAllowed };