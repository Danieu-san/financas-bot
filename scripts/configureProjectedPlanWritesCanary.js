require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const { getAllUsers } = require('../src/services/userService');
const { resolveFixtureUser } = require('./runProjectedPlanWritesE2E');

function upsertEnvValue(content, key, value) {
    const safeKey = String(key || '').trim();
    const safeValue = String(value || '').trim();
    if (!/^[A-Z][A-Z0-9_]+$/.test(safeKey) || /[\r\n]/.test(safeValue)) throw new Error('Valor de configuração inválido.');
    const line = `${safeKey}=${safeValue}`;
    const pattern = new RegExp(`^${safeKey}=.*$`, 'm');
    if (pattern.test(content)) return content.replace(pattern, line);
    const separator = content && !content.endsWith('\n') ? '\n' : '';
    return `${content}${separator}${line}\n`;
}

async function main() {
    const action = String(process.env.PROJECTED_PLAN_CANARY_ACTION || 'enable').trim().toLowerCase();
    if (!['enable', 'disable'].includes(action)) throw new Error('PROJECTED_PLAN_CANARY_ACTION deve ser enable ou disable.');
    const envPath = path.resolve(process.env.PROJECTED_PLAN_CANARY_ENV_PATH || '.env');
    if (!fs.existsSync(envPath)) throw new Error('Arquivo .env não encontrado.');
    let content = fs.readFileSync(envPath, 'utf8');

    if (action === 'disable') {
        content = upsertEnvValue(content, 'PROJECTED_PLAN_WRITES_MODE', 'off');
        fs.writeFileSync(envPath, content, { encoding: 'utf8', mode: 0o600 });
        fs.chmodSync(envPath, 0o600);
        console.log('[projected-plan-canary] mode=off configured_users=0');
        return;
    }

    const user = resolveFixtureUser(await getAllUsers(), process.env.PROJECTED_PLAN_E2E_USER_LOOKUP);
    content = upsertEnvValue(content, 'PROJECTED_PLAN_WRITES_MODE', 'shadow');
    content = upsertEnvValue(content, 'PROJECTED_PLAN_WRITES_USER_IDS', user.user_id);
    fs.writeFileSync(envPath, content, { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(envPath, 0o600);
    console.log('[projected-plan-canary] mode=shadow configured_users=1');
}

if (require.main === module) {
    main().catch(error => {
        console.error(`[projected-plan-canary] failed error=${error.message}`);
        process.exit(1);
    });
}

module.exports = { upsertEnvValue };
