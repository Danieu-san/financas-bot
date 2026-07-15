const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { PluggyReadOnlyClient } = require('../src/openFinance/pluggyReadOnlyClient');
const { OpenFinanceLiveStagingVault } = require('../src/openFinance/openFinanceLiveStagingVault');

function loadMappings() {
    if (process.env.PLUGGY_ITEM_MAP_FILE) {
        const resolved = path.resolve(process.env.PLUGGY_ITEM_MAP_FILE);
        return JSON.parse(fs.readFileSync(resolved, 'utf8'));
    }
    if (process.env.PLUGGY_ITEM_MAP_JSON) return JSON.parse(process.env.PLUGGY_ITEM_MAP_JSON);
    throw new Error('pluggy_item_mapping_required');
}

async function main() {
    if (!process.argv.includes('--confirm-live-read')) throw new Error('confirm_live_read_required');
    if (process.env.PLUGGY_LIVE_READ_ENABLED !== 'true') throw new Error('pluggy_live_read_disabled');
    const databasePath = path.resolve(
        process.env.OPEN_FINANCE_LIVE_STAGING_DB || 'data/open-finance/live-staging.sqlite'
    );
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    const vault = new OpenFinanceLiveStagingVault({
        databasePath,
        secret: process.env.OPEN_FINANCE_LIVE_STAGING_SECRET
    });
    try {
        const client = new PluggyReadOnlyClient({
            clientId: process.env.PLUGGY_CLIENT_ID,
            clientSecret: process.env.PLUGGY_CLIENT_SECRET,
            itemMappings: loadMappings()
        });
        const snapshot = await client.readSnapshot({ eventId: `live-probe-${crypto.randomUUID()}` });
        const staged = vault.ingestSnapshot(snapshot);
        const availability = snapshot.items.map((item) => ({
            alias: item.alias_code,
            availability: item.availability
        }));
        process.stdout.write(`${JSON.stringify({
            gate: 'PHASE_9C_LIVE_STAGING',
            outcome: 'GO',
            staged,
            stats: vault.stats(),
            availability,
            runtime_connected: false,
            financial_writes: 0
        }, null, 2)}\n`);
    } finally {
        vault.close();
    }
}

main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
        gate: 'PHASE_9C_LIVE_STAGING',
        outcome: 'NO_GO',
        reason: error.code || error.message,
        financial_writes: 0
    })}\n`);
    process.exitCode = 1;
});
