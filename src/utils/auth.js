// src/utils/auth.js
require('../reliability/legacyEntrypointTripwire').observeLegacyEntrypoint(
    'legacy_auth_utility', { domain: 'none' }
);
const { isAdmin, normalizeWhatsappId } = require('./adminCheck');

module.exports = { isAdmin, normalizeWhatsappId };
