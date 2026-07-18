const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

function normalizeHost(value) {
    return String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function isLoopbackHost(value) {
    const host = normalizeHost(value);
    return !host || host === 'localhost' || host === '::1' || host === '0.0.0.0'
        || host.startsWith('127.');
}

function requestHost(input, options) {
    if (typeof input === 'string' || input instanceof URL) {
        try {
            return new URL(input).hostname;
        } catch {
            return '';
        }
    }
    const candidate = input && typeof input === 'object' ? input : options;
    return candidate?.hostname || candidate?.host || '';
}

function blockedError(host) {
    const error = new Error(`EXHAUSTIVE_AUDIT_NETWORK_BLOCKED:${normalizeHost(host) || 'unknown'}`);
    error.code = 'EXHAUSTIVE_AUDIT_NETWORK_BLOCKED';
    return error;
}

function installTripwire() {
    if (global.__FINANCASBOT_EXHAUSTIVE_NETWORK_TRIPWIRE__) return;
    global.__FINANCASBOT_EXHAUSTIVE_NETWORK_TRIPWIRE__ = true;

    for (const module of [http, https]) {
        const originalRequest = module.request.bind(module);
        module.request = function guardedRequest(input, options, callback) {
            const host = requestHost(input, options);
            if (!isLoopbackHost(host)) throw blockedError(host);
            return originalRequest(input, options, callback);
        };
        const originalGet = module.get.bind(module);
        module.get = function guardedGet(input, options, callback) {
            const host = requestHost(input, options);
            if (!isLoopbackHost(host)) throw blockedError(host);
            return originalGet(input, options, callback);
        };
    }

    for (const method of ['connect', 'createConnection']) {
        const original = net[method].bind(net);
        net[method] = function guardedConnect(...args) {
            const options = args[0] && typeof args[0] === 'object' ? args[0] : null;
            const host = options?.host || options?.hostname || (typeof args[1] === 'string' ? args[1] : '');
            if (!isLoopbackHost(host)) throw blockedError(host);
            return original(...args);
        };
    }

    if (typeof global.fetch === 'function') {
        const originalFetch = global.fetch.bind(global);
        global.fetch = function guardedFetch(input, init) {
            const host = requestHost(input, init);
            if (!isLoopbackHost(host)) return Promise.reject(blockedError(host));
            return originalFetch(input, init);
        };
    }
}

if (String(process.env.EXHAUSTIVE_NETWORK_TRIPWIRE_ACTIVE || '').toLowerCase() === 'true') {
    installTripwire();
}

module.exports = { normalizeHost, isLoopbackHost, requestHost, installTripwire };
