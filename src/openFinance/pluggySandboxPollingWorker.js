class PluggySandboxPollingWorker {
    constructor(options = {}) {
        if (!options.store) throw new Error('staging_store_required');
        if (!options.transport) throw new Error('sandbox_transport_required');
        this.store = options.store;
        this.transport = options.transport;
        this.intervalSeconds = Math.max(21600, Number(options.intervalSeconds) || 21600);
        this.leaseSeconds = Math.min(3600, Math.max(30, Number(options.leaseSeconds) || 300));
    }

    run(itemId, options = {}) {
        const lease = this.store.acquirePollingLease(itemId, {
            now: options.now,
            leaseSeconds: this.leaseSeconds
        });
        if (!lease.acquired) return { outcome: 'skipped', reason: lease.reason, retry_at: lease.retry_at };
        try {
            const snapshot = this.transport.fetchSnapshot({
                event: 'item/updated',
                event_id: String(options.eventId || `poll-${Date.now()}`),
                item_id: itemId,
                transaction_ids: [],
                action: 'refresh_staging'
            });
            const staged = this.store.ingestSnapshot(snapshot);
            const completed = this.store.completePollingLease(itemId, lease.lease_token, {
                now: options.now,
                intervalSeconds: this.intervalSeconds
            });
            return { outcome: staged.replay ? 'replay' : (staged.blocked ? 'blocked' : 'staged'), next_allowed_at: completed.next_allowed_at, financial_writes: 0 };
        } catch (error) {
            const failure = this.store.failPollingLease(itemId, lease.lease_token, {
                now: options.now,
                retryAfterSeconds: error.retryAfterSeconds || 60
            });
            return { outcome: 'retry', reason: error.code || 'poll_failed', next_allowed_at: failure.next_allowed_at, financial_writes: 0 };
        }
    }
}

module.exports = { PluggySandboxPollingWorker };
