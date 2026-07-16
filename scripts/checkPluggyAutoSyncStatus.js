const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_ORIGIN = 'https://api.pluggy.ai';

function readJson(filePath, errorCode) {
    if (!filePath) throw new Error(errorCode);
    return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function loadCredentials() {
    if (process.env.PLUGGY_CREDENTIALS_FILE) {
        return readJson(process.env.PLUGGY_CREDENTIALS_FILE, 'pluggy_credentials_file_required');
    }
    return {
        clientId: process.env.PLUGGY_CLIENT_ID,
        clientSecret: process.env.PLUGGY_CLIENT_SECRET
    };
}

function loadMappings() {
    if (process.env.PLUGGY_ITEM_MAP_FILE) {
        return readJson(process.env.PLUGGY_ITEM_MAP_FILE, 'pluggy_item_map_file_required');
    }
    if (process.env.PLUGGY_ITEM_MAP_JSON) return JSON.parse(process.env.PLUGGY_ITEM_MAP_JSON);
    throw new Error('pluggy_item_mapping_required');
}

async function request(url, options) {
    const response = await fetch(url, { ...options, redirect: 'error' });
    if (!response.ok) throw new Error(`pluggy_http_${response.status}`);
    return response.json();
}

async function main() {
    const credentials = loadCredentials();
    if (!credentials.clientId || !credentials.clientSecret) throw new Error('pluggy_credentials_required');

    const auth = await request(`${API_ORIGIN}/auth`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: credentials.clientId, clientSecret: credentials.clientSecret })
    });
    if (!auth.apiKey) throw new Error('pluggy_api_key_missing');

    const statuses = [];
    for (const mapping of loadMappings()) {
        const payload = await request(`${API_ORIGIN}/items/${encodeURIComponent(mapping.itemId)}`, {
            method: 'GET',
            headers: { accept: 'application/json', 'x-api-key': auth.apiKey }
        });
        const item = payload.data || payload;
        statuses.push({
            alias: String(mapping.alias || 'unknown'),
            status: item.status || null,
            execution_status: item.executionStatus || null,
            updated_at: item.updatedAt || null,
            last_updated_at: item.lastUpdatedAt || null,
            next_auto_sync_at: item.nextAutoSyncAt || null,
            connector_name: item.connector?.name || null,
            connector_id: item.connector?.id || null
        });
    }

    process.stdout.write(`${JSON.stringify({
        gate: 'PLUGGY_AUTO_SYNC_STATUS',
        outcome: 'GO',
        checked_at: new Date().toISOString(),
        items: statuses,
        financial_writes: 0,
        item_updates_triggered: 0
    }, null, 2)}\n`);
}

main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
        gate: 'PLUGGY_AUTO_SYNC_STATUS',
        outcome: 'NO_GO',
        reason: error.message,
        financial_writes: 0,
        item_updates_triggered: 0
    })}\n`);
    process.exitCode = 1;
});
