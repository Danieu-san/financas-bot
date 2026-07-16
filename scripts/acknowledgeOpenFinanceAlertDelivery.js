const fs = require('node:fs');
const { OpenFinanceAlertOutbox } = require('../src/openFinance/openFinanceAlertOutbox');

function parseArgs(argv = []) {
    let confirmDelivered = false;
    let reference = '';
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (argument === '--confirm-delivered') {
            if (confirmDelivered) throw new Error('duplicate_confirm_delivered_argument');
            confirmDelivered = true;
            continue;
        }
        if (argument === '--reference') {
            if (reference) throw new Error('duplicate_reference_argument');
            reference = String(argv[index + 1] || '').toLowerCase();
            index += 1;
            continue;
        }
        throw new Error('unsupported_delivery_confirmation_argument');
    }
    if (!confirmDelivered) throw new Error('explicit_confirm_delivered_required');
    if (!/^[a-f0-9]{10}$/.test(reference)) throw new Error('valid_internal_reference_required');
    return { confirmDelivered, reference };
}

function readRequiredSecret(filePath) {
    if (!filePath || !fs.existsSync(filePath)) throw new Error('open_finance_secret_unavailable');
    let secret = '';
    try {
        secret = fs.readFileSync(filePath, 'utf8').trim();
    } catch (_) {
        throw new Error('open_finance_secret_unavailable');
    }
    if (!secret) throw new Error('open_finance_secret_unavailable');
    return secret;
}

function main({ argv = process.argv.slice(2), env = process.env, confirmedAt } = {}) {
    const { reference } = parseArgs(argv);
    if (!env.OPEN_FINANCE_OUTBOX_DB || !fs.existsSync(env.OPEN_FINANCE_OUTBOX_DB)) {
        throw new Error('open_finance_outbox_unavailable');
    }
    const secret = readRequiredSecret(env.OPEN_FINANCE_LIVE_STAGING_SECRET_FILE);
    const outbox = new OpenFinanceAlertOutbox({ databasePath: env.OPEN_FINANCE_OUTBOX_DB, secret });
    try {
        const result = outbox.acknowledgeUserConfirmed({
            internalReference: reference,
            ...(confirmedAt ? { confirmedAt } : {})
        });
        return {
            schema_version: 1,
            action: 'open_finance_alert_delivery_confirmation',
            status: result.delivered_confirmed ? 'delivered_confirmed' : 'not_confirmed',
            internal_reference: reference,
            financial_values_exposed: 0,
            descriptions_exposed: 0,
            private_ids_exposed: 0,
            financial_writes: 0,
            transport_calls: 0
        };
    } finally {
        outbox.close();
    }
}

function safeErrorCode(error) {
    const code = String(error && error.message || '');
    return /^[a-z0-9_]{2,64}$/.test(code)
        ? code
        : 'open_finance_delivery_confirmation_failed';
}

if (require.main === module) {
    require('dotenv').config();
    try {
        process.stdout.write(`${JSON.stringify(main(), null, 2)}\n`);
    } catch (error) {
        process.stderr.write(`${JSON.stringify({
            schema_version: 1,
            action: 'open_finance_alert_delivery_confirmation',
            status: 'failed',
            error_code: safeErrorCode(error),
            financial_writes: 0,
            transport_calls: 0
        }, null, 2)}\n`);
        process.exitCode = 1;
    }
}

module.exports = { main, parseArgs, readRequiredSecret, safeErrorCode };
