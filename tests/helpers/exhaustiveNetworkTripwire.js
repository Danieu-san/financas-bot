const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const childProcess = require('node:child_process');

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

function blockedSubprocessError() {
    const error = new Error('EXHAUSTIVE_AUDIT_SUBPROCESS_BLOCKED');
    error.code = 'EXHAUSTIVE_AUDIT_SUBPROCESS_BLOCKED';
    return error;
}

function isCurrentNodeExecutable(command) {
    if (typeof command !== 'string' || !command) return false;
    const resolvedCommand = path.resolve(command);
    const resolvedNode = path.resolve(process.execPath);
    return process.platform === 'win32'
        ? resolvedCommand.toLowerCase() === resolvedNode.toLowerCase()
        : resolvedCommand === resolvedNode;
}

function protectedChildOptions(options) {
    const source = options && typeof options === 'object' ? options : {};
    return {
        ...source,
        env: {
            ...(source.env || process.env),
            EXHAUSTIVE_NETWORK_TRIPWIRE_ACTIVE: 'true',
            NODE_OPTIONS: process.env.NODE_OPTIONS || ''
        }
    };
}

function installSubprocessTripwire() {
    const originalSpawn = childProcess.spawn.bind(childProcess);
    childProcess.spawn = function guardedSpawn(command, args, options) {
        if (!isCurrentNodeExecutable(command)) throw blockedSubprocessError();
        if (!Array.isArray(args)) return originalSpawn(command, [], protectedChildOptions(args));
        return originalSpawn(command, args, protectedChildOptions(options));
    };

    const originalSpawnSync = childProcess.spawnSync.bind(childProcess);
    childProcess.spawnSync = function guardedSpawnSync(command, args, options) {
        if (!isCurrentNodeExecutable(command)) throw blockedSubprocessError();
        if (!Array.isArray(args)) return originalSpawnSync(command, [], protectedChildOptions(args));
        return originalSpawnSync(command, args, protectedChildOptions(options));
    };

    const originalExecFile = childProcess.execFile.bind(childProcess);
    childProcess.execFile = function guardedExecFile(file, args, options, callback) {
        if (!isCurrentNodeExecutable(file)) throw blockedSubprocessError();
        if (typeof args === 'function') {
            callback = args;
            args = [];
            options = {};
        } else if (!Array.isArray(args)) {
            callback = typeof options === 'function' ? options : callback;
            options = args;
            args = [];
        } else if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        return originalExecFile(file, args, protectedChildOptions(options), callback);
    };

    const originalExecFileSync = childProcess.execFileSync.bind(childProcess);
    childProcess.execFileSync = function guardedExecFileSync(file, args, options) {
        if (!isCurrentNodeExecutable(file)) throw blockedSubprocessError();
        if (!Array.isArray(args)) {
            options = args;
            args = [];
        }
        return originalExecFileSync(file, args, protectedChildOptions(options));
    };

    const originalFork = childProcess.fork.bind(childProcess);
    childProcess.fork = function guardedFork(modulePath, args, options) {
        if (!Array.isArray(args)) return originalFork(modulePath, [], protectedChildOptions(args));
        return originalFork(modulePath, args, protectedChildOptions(options));
    };

    childProcess.exec = function blockedExec() {
        throw blockedSubprocessError();
    };
    childProcess.execSync = function blockedExecSync() {
        throw blockedSubprocessError();
    };
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

    installSubprocessTripwire();
}

if (String(process.env.EXHAUSTIVE_NETWORK_TRIPWIRE_ACTIVE || '').toLowerCase() === 'true') {
    installTripwire();
}

module.exports = {
    normalizeHost,
    isLoopbackHost,
    requestHost,
    installTripwire,
    isCurrentNodeExecutable
};
