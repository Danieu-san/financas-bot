const fs = require('node:fs');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');

function main(env = process.env) {
    if (!env.OPEN_FINANCE_OUTBOX_DB || !fs.existsSync(env.OPEN_FINANCE_OUTBOX_DB)) {
        throw new Error('open_finance_outbox_unavailable');
    }
    if (!env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE || !fs.existsSync(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE)) {
        throw new Error('open_finance_secret_unavailable');
    }
    const secret = fs.readFileSync(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE, 'utf8').trim();
    const outbox = new OpenFinanceAlertOutbox({ databasePath: env.OPEN_FINANCE_OUTBOX_DB, secret });
    try {
        return {
            schema_version: 1,
            generated_at: new Date().toISOString(),
            unconfirmed: outbox.listAcceptedUnconfirmedPublic(),
            financial_values_exposed: 0,
            descriptions_exposed: 0,
            financial_writes: 0,
            transport_calls: 0
        };
    } finally { outbox.close(); }
}

if (require.main === module) process.stdout.write(`${JSON.stringify(main(), null, 2)}\n`);

module.exports = { main };
