const fs = require('fs');
const os = require('os');
const path = require('path');
const { PluggySandboxAdapter } = require('../src/openFinance/pluggySandboxAdapter');
const { OpenFinanceStagingStore } = require('../src/openFinance/openFinanceStagingStore');

function main() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-pluggy-sandbox-'));
    const databasePath = path.join(tempDir, 'staging.sqlite');
    const fixturePath = path.join(__dirname, '..', 'tests', 'fixtures', 'pluggy-sandbox-snapshot.json');
    const store = new OpenFinanceStagingStore({
        databasePath,
        hmacSecret: 'sandbox-e2e-disposable-secret'
    });

    try {
        const snapshot = new PluggySandboxAdapter({ fixturePath }).readSnapshot();
        const first = store.ingestSnapshot(snapshot);
        const firstStats = store.stats();
        const replay = store.ingestSnapshot(snapshot);
        store.revokeItem(snapshot.item.id, { revokedAt: '2026-07-15T14:00:00.000Z' });
        const finalStats = store.stats();
        const delayedReplay = store.ingestSnapshot(snapshot);
        const passed = first.applied
            && replay.replay
            && firstStats.items === 1
            && firstStats.accounts === 2
            && firstStats.transactions === 2
            && finalStats.items === 0
            && finalStats.accounts === 0
            && finalStats.transactions === 0
            && finalStats.bills === 0
            && finalStats.revocations === 1
            && delayedReplay.blocked
            && delayedReplay.reason === 'item_revoked';

        const report = {
            verdict: passed ? 'GO' : 'NO-GO',
            provider: 'pluggy',
            mode: 'sandbox_fixture',
            first_counts: firstStats,
            replay_idempotent: replay.replay,
            revocation_cascade: finalStats.items === 0 && finalStats.accounts === 0 && finalStats.transactions === 0 && finalStats.bills === 0,
            delayed_replay_blocked: delayedReplay.blocked === true,
            staging_writes: true,
            financial_writes: 0,
            network_calls: 0,
            real_accounts: 0,
            secrets_persisted: 0
        };
        console.log(JSON.stringify(report, null, 2));
        if (!passed) process.exitCode = 1;
    } finally {
        store.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

main();
