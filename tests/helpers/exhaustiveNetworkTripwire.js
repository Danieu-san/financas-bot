const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const childProcess = require('node:child_process');

const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const RELEASE_ARTIFACT_PATTERN =
    /^financas-bot-[a-f0-9]{40}\.tar\.gz$/;

function canonicalExistingPath(value) {
    if (typeof value !== 'string' || !value || !path.isAbsolute(value)) {
        return null;
    }
    try {
        return fs.realpathSync(value);
    } catch {
        return null;
    }
}

function samePath(left, right) {
    if (!left || !right) return false;
    const resolvedLeft = path.resolve(left);
    const resolvedRight = path.resolve(right);
    return process.platform === 'win32'
        ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
        : resolvedLeft === resolvedRight;
}

const AUDITED_GIT_EXECUTABLE =
    canonicalExistingPath(process.env.EXHAUSTIVE_LOCAL_GIT_PATH);
const AUDITED_TAR_EXECUTABLE =
    canonicalExistingPath(process.env.EXHAUSTIVE_LOCAL_TAR_PATH);
const AUDITED_REPO_ROOT =
    canonicalExistingPath(process.env.EXHAUSTIVE_REPO_ROOT);
const AUDITED_TEMP_ROOT =
    canonicalExistingPath(process.env.EXHAUSTIVE_AUDIT_TEMP_ROOT);

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

function isAuditedLocalGitExecutable(command) {
    return samePath(canonicalExistingPath(command), AUDITED_GIT_EXECUTABLE);
}

function isCommitObject(value) {
    return typeof value === 'string' &&
        COMMIT_PATTERN.test(value.replace(/\^\{commit\}$/, ''));
}

function resolvedCwd(options) {
    const source = options && typeof options === 'object' ? options : {};
    return canonicalExistingPath(
        path.resolve(source.cwd || process.cwd())
    );
}

function isDirectControlledDirectory(candidate, prefix) {
    if (!AUDITED_TEMP_ROOT || !candidate) return false;
    const realCandidate = canonicalExistingPath(candidate);
    return Boolean(realCandidate) &&
        samePath(path.dirname(realCandidate), AUDITED_TEMP_ROOT) &&
        path.basename(realCandidate).startsWith(prefix);
}

function auditedGitDirectoryKind(options) {
    const cwd = resolvedCwd(options);
    if (samePath(cwd, AUDITED_REPO_ROOT)) return 'audited_repo';
    if (isDirectControlledDirectory(
        cwd,
        'financasbot-release-repo-'
    )) return 'release_fixture';
    if (isDirectControlledDirectory(
        cwd,
        'orch-watch-ignored-'
    )) return 'watcher_ignored_fixture';
    return null;
}

function controlledMissingFile(candidate, {
    directoryPrefix,
    basenamePattern
}) {
    if (!AUDITED_TEMP_ROOT || typeof candidate !== 'string' ||
        !path.isAbsolute(candidate)) return false;
    const parent = canonicalExistingPath(path.dirname(candidate));
    if (!isDirectControlledDirectory(parent, directoryPrefix)) return false;
    if (fs.existsSync(candidate) &&
        !samePath(
            canonicalExistingPath(candidate),
            path.join(parent, path.basename(candidate))
        )) return false;
    return basenamePattern.test(path.basename(candidate));
}

function isControlledGitArchiveOutput(candidate) {
    return controlledMissingFile(candidate, {
        directoryPrefix: 'financasbot-build-',
        basenamePattern: /^source\.tar$/
    });
}

function isControlledTarOutput(candidate) {
    return controlledMissingFile(candidate, {
        directoryPrefix: 'financasbot-release-output-',
        basenamePattern: RELEASE_ARTIFACT_PATTERN
    });
}

function isControlledTarSource(candidate) {
    if (!AUDITED_TEMP_ROOT || typeof candidate !== 'string' ||
        !path.isAbsolute(candidate)) return false;
    const source = canonicalExistingPath(candidate);
    if (!source || path.basename(source) !== 'tree') return false;
    return isDirectControlledDirectory(
        path.dirname(source),
        'financasbot-build-'
    );
}

function isAuditedLocalGitCommand(command, args, options) {
    if (!isAuditedLocalGitExecutable(command) || !Array.isArray(args)) return false;
    const directoryKind = auditedGitDirectoryKind(options);
    if (!directoryKind) return false;
    if (directoryKind === 'release_fixture' &&
        args.length === 2 && args[0] === 'init' &&
        args[1] === '--quiet') return true;
    if (directoryKind === 'watcher_ignored_fixture' &&
        args.length === 2 && args[0] === 'init' &&
        args[1] === '-q') return true;
    if (directoryKind === 'watcher_ignored_fixture' &&
        args.length === 2 && args[0] === 'add' &&
        args[1] === '.gitignore') return true;
    if (directoryKind === 'watcher_ignored_fixture' &&
        args.length === 9 && args[0] === '-c' &&
        args[1] === `safe.directory=${resolvedCwd(options)}` &&
        args[2] === '-C' && samePath(args[3], resolvedCwd(options)) &&
        args.slice(4).join(' ') ===
            'ls-files -z --others --ignored --exclude-standard') return true;
    if (args.length === 3 && args[0] === 'add' &&
        directoryKind === 'release_fixture' &&
        args[1] === 'index.js' && args[2] === 'package.json') return true;
    if (args.length === 5 && args[0] === 'commit' && args[1] === '--quiet' &&
        directoryKind === 'release_fixture' &&
        args[2] === '--no-verify' && args[3] === '-m' && args[4] === 'fixture') return true;
    if (args.length === 2 && args[0] === 'rev-parse' && args[1] === 'HEAD') return true;
    if (args.length === 3 && args[0] === 'rev-parse' && args[1] === '--verify' &&
        isCommitObject(args[2])) return true;
    if (args.length === 3 && args[0] === 'cat-file' && args[1] === '-e' &&
        isCommitObject(args[2])) return true;
    if (args.length === 4 && args[0] === 'merge-base' &&
        args[1] === '--is-ancestor' && COMMIT_PATTERN.test(args[2]) &&
        COMMIT_PATTERN.test(args[3])) return true;
    if (args.length === 4 && args[0] === 'ls-tree' && args[1] === '-r' &&
        args[2] === '--name-only' && COMMIT_PATTERN.test(args[3])) return true;
    if (args.length === 4 && args[0] === 'archive' && args[1] === '--format=tar' &&
        args[2].startsWith('--output=') &&
        isControlledGitArchiveOutput(
            args[2].slice('--output='.length)
        ) &&
        COMMIT_PATTERN.test(args[3])) return true;
    return false;
}

function isAuditedLocalTarCommand(command, args) {
    if (!Array.isArray(args) ||
        !samePath(
            canonicalExistingPath(command),
            AUDITED_TAR_EXECUTABLE
        )) return false;
    return args.length === 5 && args[0] === '-czf' &&
        isControlledTarOutput(args[1]) &&
        args[2] === '-C' && path.isAbsolute(args[3]) &&
        isControlledTarSource(args[3]) && args[4] === '.';
}

function protectedChildOptions(options, protectedNodeOptions, auditedGit = false) {
    const source = options && typeof options === 'object' ? options : {};
    if (source.shell) throw blockedSubprocessError();
    const sourceEnvironment = { ...(source.env || process.env) };
    sourceEnvironment.EXHAUSTIVE_LOCAL_GIT_PATH =
        AUDITED_GIT_EXECUTABLE || '';
    sourceEnvironment.EXHAUSTIVE_LOCAL_TAR_PATH =
        AUDITED_TAR_EXECUTABLE || '';
    sourceEnvironment.EXHAUSTIVE_REPO_ROOT = AUDITED_REPO_ROOT || '';
    sourceEnvironment.EXHAUSTIVE_AUDIT_TEMP_ROOT =
        AUDITED_TEMP_ROOT || '';
    if (auditedGit) {
        for (const key of Object.keys(sourceEnvironment)) {
            if (/^GIT_CONFIG_(?:COUNT|KEY_|VALUE_)/.test(key) ||
                ['GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_ASKPASS', 'GIT_PROXY_COMMAND']
                    .includes(key)) {
                delete sourceEnvironment[key];
            }
        }
        sourceEnvironment.GIT_CONFIG_NOSYSTEM = '1';
        sourceEnvironment.GIT_CONFIG_GLOBAL = process.platform === 'win32'
            ? 'NUL'
            : '/dev/null';
        sourceEnvironment.GIT_CONFIG_COUNT = '4';
        sourceEnvironment.GIT_CONFIG_KEY_0 = 'safe.directory';
        sourceEnvironment.GIT_CONFIG_VALUE_0 = path.resolve(source.cwd || process.cwd());
        sourceEnvironment.GIT_CONFIG_KEY_1 = 'core.hooksPath';
        sourceEnvironment.GIT_CONFIG_VALUE_1 = process.platform === 'win32'
            ? 'NUL'
            : '/dev/null';
        sourceEnvironment.GIT_CONFIG_KEY_2 = 'commit.gpgSign';
        sourceEnvironment.GIT_CONFIG_VALUE_2 = 'false';
        sourceEnvironment.GIT_CONFIG_KEY_3 = 'core.fsmonitor';
        sourceEnvironment.GIT_CONFIG_VALUE_3 = 'false';
        sourceEnvironment.GIT_TERMINAL_PROMPT = '0';
        sourceEnvironment.GIT_ALLOW_PROTOCOL = 'file';
    }
    return {
        ...source,
        shell: false,
        env: {
            ...sourceEnvironment,
            EXHAUSTIVE_NETWORK_TRIPWIRE_ACTIVE: 'true',
            NODE_OPTIONS: protectedNodeOptions
        }
    };
}

function installSubprocessTripwire() {
    const protectedNodeOptions = process.env.NODE_OPTIONS || '';
    const originalSpawn = childProcess.spawn.bind(childProcess);
    childProcess.spawn = function guardedSpawn(command, args, options) {
        const auditedGit = isAuditedLocalGitCommand(command, args, options);
        const auditedTar = isAuditedLocalTarCommand(command, args);
        if (!isCurrentNodeExecutable(command) && !auditedGit && !auditedTar) {
            throw blockedSubprocessError();
        }
        if (!Array.isArray(args)) {
            return originalSpawn(command, [], protectedChildOptions(args, protectedNodeOptions));
        }
        return originalSpawn(
            command,
            args,
            protectedChildOptions(options, protectedNodeOptions, auditedGit)
        );
    };

    const originalSpawnSync = childProcess.spawnSync.bind(childProcess);
    childProcess.spawnSync = function guardedSpawnSync(command, args, options) {
        const auditedGit = isAuditedLocalGitCommand(command, args, options);
        const auditedTar = isAuditedLocalTarCommand(command, args);
        if (!isCurrentNodeExecutable(command) && !auditedGit && !auditedTar) {
            throw blockedSubprocessError();
        }
        if (!Array.isArray(args)) {
            return originalSpawnSync(command, [], protectedChildOptions(args, protectedNodeOptions));
        }
        return originalSpawnSync(
            command,
            args,
            protectedChildOptions(options, protectedNodeOptions, auditedGit)
        );
    };

    const originalExecFile = childProcess.execFile.bind(childProcess);
    childProcess.execFile = function guardedExecFile(file, args, options, callback) {
        const auditedGit = isAuditedLocalGitCommand(file, args, options);
        const auditedTar = isAuditedLocalTarCommand(file, args);
        if (!isCurrentNodeExecutable(file) && !auditedGit && !auditedTar) {
            throw blockedSubprocessError();
        }
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
        return originalExecFile(
            file,
            args,
            protectedChildOptions(options, protectedNodeOptions, auditedGit),
            callback
        );
    };

    const originalExecFileSync = childProcess.execFileSync.bind(childProcess);
    childProcess.execFileSync = function guardedExecFileSync(file, args, options) {
        const auditedGit = isAuditedLocalGitCommand(file, args, options);
        const auditedTar = isAuditedLocalTarCommand(file, args);
        if (!isCurrentNodeExecutable(file) && !auditedGit && !auditedTar) {
            throw blockedSubprocessError();
        }
        if (!Array.isArray(args)) {
            options = args;
            args = [];
        }
        return originalExecFileSync(
            file,
            args,
            protectedChildOptions(options, protectedNodeOptions, auditedGit)
        );
    };

    const originalFork = childProcess.fork.bind(childProcess);
    childProcess.fork = function guardedFork(modulePath, args, options) {
        const sourceOptions = Array.isArray(args) ? options : args;
        if (sourceOptions?.execPath && !isCurrentNodeExecutable(sourceOptions.execPath)) {
            throw blockedSubprocessError();
        }
        const guardedOptions = {
            ...protectedChildOptions(sourceOptions, protectedNodeOptions),
            execPath: process.execPath
        };
        if (!Array.isArray(args)) return originalFork(modulePath, [], guardedOptions);
        return originalFork(modulePath, args, guardedOptions);
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
    isCurrentNodeExecutable,
    isAuditedLocalGitCommand,
    isAuditedLocalTarCommand
};
