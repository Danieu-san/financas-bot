const Module = require('node:module');

const BLOCKED_MODULES = new Set([
    'http', 'node:http', 'https', 'node:https', 'net', 'node:net', 'tls',
    'node:tls', 'dns', 'node:dns', 'dgram', 'node:dgram', 'undici'
]);

let activeReplay = false;

function networkError() {
    const error = new Error('network_access_forbidden');
    error.code = 'NETWORK_ACCESS_FORBIDDEN';
    return error;
}

async function runHermeticReplay(execution) {
    if (typeof execution !== 'function') throw new Error('invalid_replay_execution');
    if (activeReplay) throw new Error('nested_hermetic_replay_forbidden');
    activeReplay = true;
    const originalLoad = Module._load;
    const hadFetch = Object.hasOwn(globalThis, 'fetch');
    const originalFetch = globalThis.fetch;
    Module._load = function hermeticLoad(request, parent, isMain) {
        if (BLOCKED_MODULES.has(String(request || ''))) throw networkError();
        return originalLoad.call(this, request, parent, isMain);
    };
    globalThis.fetch = async function forbiddenFetch() {
        throw networkError();
    };

    try {
        return await execution();
    } finally {
        Module._load = originalLoad;
        if (hadFetch) globalThis.fetch = originalFetch;
        else delete globalThis.fetch;
        activeReplay = false;
    }
}

module.exports = {
    runHermeticReplay
};
