require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { getAllUsers } = require('../src/services/userService');
const { resolveFixtureUser } = require('./runBatchMaintenanceE2E');
const { upsertEnvValue } = require('./configureBatchMaintenanceCanary');

async function main() {
    const action = String(process.env.FINANCIAL_RECEIPTS_CANARY_ACTION || 'enable').trim().toLowerCase();
    if (!['enable', 'disable'].includes(action)) throw new Error('FINANCIAL_RECEIPTS_CANARY_ACTION deve ser enable ou disable.');
    const envPath = path.resolve(process.env.FINANCIAL_RECEIPTS_CANARY_ENV_PATH || '.env');
    let content = fs.readFileSync(envPath, 'utf8');
    if (action === 'disable') {
        content = upsertEnvValue(content, 'FINANCIAL_RECEIPTS_MODE', 'off');
        content = upsertEnvValue(content, 'FINANCIAL_RECEIPTS_USER_IDS', '');
        fs.writeFileSync(envPath, content, { encoding: 'utf8', mode: 0o600 });
        fs.chmodSync(envPath, 0o600);
        console.log('[financial-receipts-canary] mode=off configured_users=0');
        return;
    }
    const user = resolveFixtureUser(await getAllUsers(), process.env.FINANCIAL_RECEIPTS_E2E_USER_LOOKUP);
    content = upsertEnvValue(content, 'FINANCIAL_RECEIPTS_MODE', 'canary');
    content = upsertEnvValue(content, 'FINANCIAL_RECEIPTS_USER_IDS', user.user_id);
    fs.writeFileSync(envPath, content, { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(envPath, 0o600);
    console.log('[financial-receipts-canary] mode=canary configured_users=1');
}

if (require.main === module) main().catch(error => { console.error(`[financial-receipts-canary] failed error=${error.message}`); process.exit(1); });
module.exports = { main };
