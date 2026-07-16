const fs = require('node:fs');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');

function readRequiredFile(file, code) {
    if (!file || !fs.existsSync(file)) throw new Error(code);
    const value = fs.readFileSync(file, 'utf8').trim();
    if (!value) throw new Error(code);
    return value;
}

function main(env = process.env) {
    if (!env.OPEN_FINANCE_OUTBOX_DB || !fs.existsSync(env.OPEN_FINANCE_OUTBOX_DB)) {
        throw new Error('open_finance_outbox_unavailable');
    }
    const secret = readRequiredFile(
        env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE,
        'open_finance_secret_unavailable'
    );
    const outbox = new OpenFinanceAlertOutbox({
        databasePath: env.OPEN_FINANCE_OUTBOX_DB,
        secret
    });
    try {
        return {
            schema_version: 1,
            generated_at: new Date().toISOString(),
            outbox: outbox.stats(),
            payloads_exposed: 0,
            financial_writes: 0,
            transport_calls: 0
        };
    } finally {
        outbox.close();
    }
}

if (require.main === module) {
    process.stdout.write(`${JSON.stringify(main(), null, 2)}\n`);
}

module.exports = { main };
