const crypto = require('node:crypto');
const fs = require('node:fs');
const { PluggyReadOnlyClient } = require('./pluggyReadOnlyClient');
const { OpenFinanceLiveStagingVault } = require('./openFinanceLiveStagingVault');
const { OpenFinanceBaselineStore } = require('./openFinanceBaselineStore');
const { classifyOpenFinanceLifecycle } = require('./openFinanceLifecycleClassifier');
const { OpenFinanceAlertOutbox } = require('./openFinanceAlertOutbox');
const { buildOpenFinanceRolloutPolicy } = require('./openFinanceRolloutPolicy');
const { deliverOneOpenFinanceCanary } = require('./openFinanceWhatsappCanaryDelivery');
const { getActiveUsers } = require('../services/userService');

function readJson(file, reason) {
    if (!file || !fs.existsSync(file)) throw new Error(reason);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizePerson(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function resolveWhatsAppRecipient(owner, users = []) {
    const expected = normalizePerson(owner);
    const matches = (users || []).filter(user => normalizePerson(user.display_name).split(' ')[0] === expected && user.whatsapp_id);
    if (matches.length !== 1) throw new Error('open_finance_recipient_scope_unavailable');
    return matches[0].whatsapp_id;
}

async function runOpenFinanceCanaryCycle({ client, env = process.env, dependencies = {} } = {}) {
    if (!client || typeof client.sendMessage !== 'function') throw new Error('whatsapp_client_required');
    const evidence = readJson(env.OPEN_FINANCE_COMMERCIAL_EVIDENCE_FILE, 'commercial_evidence_unavailable');
    const mappings = readJson(env.PLUGGY_ITEM_MAP_FILE, 'item_mapping_unavailable');
    const policies = readJson(env.OPEN_FINANCE_VISIBILITY_POLICY_FILE, 'visibility_policy_unavailable');
    const credentials = readJson(env.PLUGGY_CREDENTIALS_FILE, 'pluggy_credentials_unavailable');
    if (!env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE || !fs.existsSync(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE)) {
        throw new Error('open_finance_secret_unavailable');
    }
    const secret = fs.readFileSync(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE, 'utf8').trim();
    const requiredState = [env.OPEN_FINANCE_LIVE_STAGING_DB, env.OPEN_FINANCE_BASELINE_DB, env.OPEN_FINANCE_OUTBOX_DB];
    const vaultAvailable = requiredState.every(file => file && fs.existsSync(file));
    const policy = buildOpenFinanceRolloutPolicy({ env, evidence, mappings, vaultAvailable });
    if (!policy.enabled) return { outcome: 'blocked', blockers: policy.blockers, transport_calls: 0, financial_writes: 0 };
    if (policy.mode === 'canary' && !vaultAvailable) throw new Error('canary_state_unavailable');

    const ApiClient = dependencies.PluggyReadOnlyClient || PluggyReadOnlyClient;
    const vault = new OpenFinanceLiveStagingVault({ databasePath: env.OPEN_FINANCE_LIVE_STAGING_DB, secret });
    const baseline = new OpenFinanceBaselineStore({ databasePath: env.OPEN_FINANCE_BASELINE_DB, secret });
    const outbox = new OpenFinanceAlertOutbox({ databasePath: env.OPEN_FINANCE_OUTBOX_DB, secret });
    try {
        const api = new ApiClient({ clientId: credentials.clientId, clientSecret: credentials.clientSecret, itemMappings: mappings });
        const snapshot = await api.readSnapshot({ eventId: `runtime-${crypto.randomUUID()}` });
        const staged = vault.ingestSnapshot(snapshot);
        const observed = baseline.ingestSnapshot(snapshot);
        const items = mappings.map(mapping => vault.readItemByAlias(mapping.alias)).filter(Boolean);
        const lifecycle = classifyOpenFinanceLifecycle({ items, secret });
        const queued = outbox.enqueue({ candidates: baseline.listCandidates(), lifecycleDecisions: lifecycle.decisions,
            items, policies, baselineComplete: baseline.stats().completed_baselines === mappings.length });
        const quarantined = outbox.quarantineNonAlertable();
        const deliveries = [];
        if (policy.can_send_whatsapp) {
            const activeUsers = await (dependencies.getActiveUsers || getActiveUsers)();
            const max = Math.min(5, Math.max(1, Number(env.OPEN_FINANCE_ALERT_MAX_PER_RUN) || 2));
            for (let index = 0; index < max; index += 1) {
                const delivery = await deliverOneOpenFinanceCanary({ policy, outbox,
                    transport: { sendMessage: (to, text) => client.sendMessage(to, text) },
                    recipientResolver: owner => resolveWhatsAppRecipient(owner, activeUsers),
                    sourceLabels: { daniel_nubank: 'Nubank Daniel', thais_nubank: 'Nubank Thais',
                        cristina_nubank: 'Nubank Cristina', thais_itau: 'Itau Thais' } });
                deliveries.push(delivery.outcome);
                if (delivery.outcome === 'idle' || delivery.outcome === 'blocked') break;
            }
        }
        return { outcome: 'GO', staged_items: staged.staged_items, new_observations: observed.new_observations,
            queued, quarantined, outbox: outbox.stats(), deliveries,
            transport_calls: deliveries.filter(value => value === 'sent' || value === 'retry').length, financial_writes: 0 };
    } finally { outbox.close(); baseline.close(); vault.close(); }
}

function initializeOpenFinanceCanaryRuntime({ client, logger = console, env = process.env, runCycle = runOpenFinanceCanaryCycle } = {}) {
    const mode = String(env.OPEN_FINANCE_ALERT_MODE || 'off').toLowerCase();
    if (mode === 'off') return { enabled: false };
    const intervalMs = Math.max(6 * 60 * 60 * 1000, Number(env.OPEN_FINANCE_POLL_INTERVAL_MS) || 6 * 60 * 60 * 1000);
    const startupDelayMs = Math.max(0, Number(env.OPEN_FINANCE_STARTUP_DELAY_MS) || 5000);
    let running = false;
    const execute = async () => {
        if (running) return;
        running = true;
        try {
            const result = await runCycle({ client, env });
            logger.info(`[open-finance] cycle=${result.outcome} new=${result.new_observations || 0} sent=${result.outbox?.sent || 0} writes=0`);
        } catch (error) {
            logger.warn(`[open-finance] cycle=NO_GO reason=${String(error.message || 'unknown').replace(/[^a-z0-9_-]/gi, '_').slice(0, 64)} writes=0`);
        } finally { running = false; }
    };
    const startup = setTimeout(() => { void execute(); }, startupDelayMs);
    const interval = setInterval(() => { void execute(); }, intervalMs);
    startup.unref?.(); interval.unref?.();
    return { enabled: true, intervalMs, execute, stop: () => { clearTimeout(startup); clearInterval(interval); } };
}

module.exports = { runOpenFinanceCanaryCycle, initializeOpenFinanceCanaryRuntime, resolveWhatsAppRecipient };
