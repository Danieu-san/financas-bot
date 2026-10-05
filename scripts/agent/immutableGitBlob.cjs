'use strict';
// Raw, bounded, local historical input; never a release or normative verdict.
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const MAX_BYTES = 16 * 1024 * 1024;

function immutableBlobSpecifier(commit, locator) {
    if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit) ||
        typeof locator !== 'string' || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(locator) ||
        locator.split('/').some(segment => segment === '.' || segment === '..')) {
        throw new Error('immutable_git_blob_locator');
    }
    return `${commit}:${locator}`;
}

function immutableBlobEnvironment(source = process.env) {
    const env = { ...source };
    for (const name of Object.keys(env)) {
        if (/^GIT_CONFIG(?:_|$)/i.test(name) ||
            /^(?:GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_COMMON_DIR|GIT_NAMESPACE|GIT_REPLACE_REF_BASE|GIT_SHALLOW_FILE|GIT_SSH|GIT_SSH_COMMAND|GIT_ASKPASS|GIT_PROXY_COMMAND)$/i.test(name)) {
            delete env[name];
        }
    }
    Object.assign(env, {
        GIT_NO_REPLACE_OBJECTS: '1', GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
        GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: ROOT
    });
    return env;
}

function readImmutableBlob(commit, locator) {
    const object = immutableBlobSpecifier(commit, locator);
    const bytes = execFileSync(process.env.EXHAUSTIVE_LOCAL_GIT_PATH || 'git',
        ['cat-file', 'blob', object], {
            cwd: ROOT, env: immutableBlobEnvironment(), maxBuffer: MAX_BYTES,
            windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
        });
    if (!Buffer.isBuffer(bytes) || !Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)) {
        throw new Error('immutable_git_blob_utf8');
    }
    return bytes;
}

module.exports = { immutableBlobSpecifier, immutableBlobEnvironment, readImmutableBlob };
