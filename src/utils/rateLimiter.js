// src/utils/rateLimiter.js

// Carrega os limites do .env ou usa valores padrão seguros
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 20; // 20 msg
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 60000; // por 1 minuto

// Mapa para armazenar os timestamps das requisições de cada usuário
const userRequests = new Map();

console.log('✅ Módulo Rate Limiter inicializado.');

function isTestEnv() {
  const env = String(process.env.NODE_ENV || '').toLowerCase();
  return env === 'test';
}

function isDisabledByEnv() {
  // Permite desligar manualmente sem mexer em NODE_ENV
  // Ex.: DISABLE_RATE_LIMITER=true
  const v = String(process.env.DISABLE_RATE_LIMITER || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function isAllowed(userId) {
  // ✅ Em testes automatizados, não bloqueia
  if (isTestEnv() || isDisabledByEnv()) return true;

  const now = Date.now();
  const requests = userRequests.get(userId) || [];

  // Remove timestamps expirados
  const recentRequests = requests.filter(timestamp => (now - timestamp) < RATE_LIMIT_WINDOW_MS);

  // Verifica limite
  if (recentRequests.length >= RATE_LIMIT_MAX) {
    console.warn(`🚦 Rate limit atingido para o usuário: ${userId}`);
    return false;
  }

  // Registra e permite
  recentRequests.push(now);
  userRequests.set(userId, recentRequests);
  return true;
}

function resetRateLimiter() {
  userRequests.clear();
}

module.exports = { isAllowed, resetRateLimiter };