const fs = require('fs');
const path = require('path');
const { normalizePluggySandboxSnapshot } = require('./pluggySandboxContract');

class PluggySandboxMockTransport {
    constructor(options = {}) {
        if (!options.fixturePath) throw new Error('pluggy_sandbox_fixture_required');
        this.fixturePath = path.resolve(options.fixturePath);
        this.failuresRemaining = Math.max(0, Number(options.failuresBeforeSuccess) || 0);
        this.retryAfterSeconds = Math.max(1, Number(options.retryAfterSeconds) || 60);
        this.calls = 0;
    }

    fetchSnapshot(job) {
        this.calls += 1;
        if (this.failuresRemaining > 0) {
            this.failuresRemaining -= 1;
            const error = new Error('sandbox_rate_limited');
            error.code = 'rate_limited';
            error.retryAfterSeconds = this.retryAfterSeconds;
            throw error;
        }
        const payload = JSON.parse(fs.readFileSync(this.fixturePath, 'utf8'));
        if (payload.item.id !== job.item_id) throw new Error('sandbox_item_mismatch');
        payload.eventId = job.event_id;
        payload.observedAt = new Date().toISOString();
        if (job.event === 'transactions/deleted') {
            const deleted = new Set(job.transaction_ids);
            payload.transactions = payload.transactions.map((transaction) => ({
                ...transaction,
                deleted: deleted.has(transaction.id)
            }));
        }
        return normalizePluggySandboxSnapshot(payload);
    }
}

module.exports = { PluggySandboxMockTransport };
