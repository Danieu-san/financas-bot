class PluggySandboxWebhookWorker {
    constructor(options = {}) {
        if (!options.processor) throw new Error('webhook_processor_required');
        if (!options.store) throw new Error('staging_store_required');
        this.processor = options.processor;
        this.store = options.store;
        this.maxAttempts = Math.max(1, Number(options.maxAttempts) || 5);
    }

    acceptAndEnqueue(headers, payload, options = {}) {
        const accepted = this.processor.accept(headers, payload);
        const queued = this.store.enqueueWebhookJob(accepted.job, options);
        return { status: 202, accepted: true, queued: queued.queued, replay: queued.replay };
    }

    runOnce(options = {}) {
        const claimed = this.store.claimNextWebhookJob(options);
        if (!claimed) return { outcome: 'idle' };
        try {
            const result = this.processor.process(claimed.job);
            if (result.outcome === 'retry') {
                if (claimed.attempts >= this.maxAttempts) {
                    this.store.failWebhookJob(claimed.event_ref, 'retry_exhausted');
                    return { outcome: 'failed', reason: 'retry_exhausted' };
                }
                this.store.retryWebhookJob(claimed.event_ref, result.retry_after_seconds, options);
                return result;
            }
            this.store.completeWebhookJob(claimed.event_ref, options);
            return result;
        } catch (error) {
            this.store.failWebhookJob(claimed.event_ref, error.code || 'processing_failed');
            return { outcome: 'failed', reason: 'processing_failed' };
        }
    }
}

module.exports = { PluggySandboxWebhookWorker };
