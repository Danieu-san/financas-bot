// src/utils/cache.js

const NodeCache = require('node-cache');

// Configura o cache.
// stdTTL: (Time-To-Live Padrão) em segundos. 300 segundos = 5 minutos.
// checkperiod: De quanto em quanto tempo o cache vai verificar e apagar itens expirados (em segundos).
const cache = new NodeCache({ stdTTL: 300, checkperiod: 120 });

console.log('✅ Módulo de Cache inicializado.');

function clearAllCache() {
    cache.flushAll();
}

cache.clearAllCache = clearAllCache;

module.exports = cache;