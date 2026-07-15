const fs = require('fs');
const path = require('path');
const { normalizePluggySandboxSnapshot } = require('./pluggySandboxContract');

class PluggySandboxAdapter {
    constructor(options = {}) {
        if (!options.fixturePath) throw new Error('pluggy_sandbox_fixture_required');
        this.fixturePath = path.resolve(options.fixturePath);
    }

    readSnapshot() {
        const payload = JSON.parse(fs.readFileSync(this.fixturePath, 'utf8'));
        return normalizePluggySandboxSnapshot(payload);
    }
}

module.exports = { PluggySandboxAdapter };
