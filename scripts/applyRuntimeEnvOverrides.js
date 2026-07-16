const fs = require('node:fs');
const path = require('node:path');

const ALLOWED_KEYS = new Set([
    'APP_COMMIT_SHA',
    'LEGACY_RETIREMENT_TRIPWIRE_ENABLED',
    'LEGACY_RETIREMENT_SOFT_DISABLED_CANDIDATES',
    'OPEN_FINANCE_ALERT_CANARY_ALIAS',
    'OPEN_FINANCE_ALERT_CANARY_ALIASES',
    'OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON',
    'OPEN_FINANCE_ALERT_MAX_PER_RUN',
    'FINANCIAL_AGENT_MODE',
    'FINANCIAL_FILE_IO_MODE',
    'FINANCIAL_RECEIPTS_MODE',
    'FINANCIAL_DOCUMENT_OCR_MODE',
    'BATCH_MAINTENANCE_MODE',
    'BATCH_MAINTENANCE_USER_IDS'
]);

const MODES = Object.freeze({
    FINANCIAL_AGENT_MODE: new Set(['off', 'shadow', 'answer', 'canary']),
    FINANCIAL_FILE_IO_MODE: new Set(['off', 'canary', 'on']),
    FINANCIAL_RECEIPTS_MODE: new Set(['off', 'canary', 'on']),
    FINANCIAL_DOCUMENT_OCR_MODE: new Set(['off', 'canary', 'on']),
    BATCH_MAINTENANCE_MODE: new Set(['off', 'canary', 'on'])
});

function validateOverride(key, value) {
    if (MODES[key] && !MODES[key].has(String(value).toLowerCase())) {
        throw new Error('runtime_env_mode_invalid');
    }
    if (key === 'OPEN_FINANCE_ALERT_MAX_PER_RUN' &&
        (!/^\d+$/.test(String(value)) || Number(value) < 1 || Number(value) > 5)) {
        throw new Error('open_finance_alert_limit_invalid');
    }
    if (key === 'BATCH_MAINTENANCE_USER_IDS') {
        const ids = String(value).split(',').map(item => item.trim()).filter(Boolean);
        if (!ids.length || ids.length > 4 || new Set(ids).size !== ids.length ||
            ids.some(id => !/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(id))) {
            throw new Error('batch_maintenance_user_ids_invalid');
        }
    }
}

function parseArguments(argv) {
    const args = [...argv];
    let envFile = '.env';
    if (args[0] === '--env-file') {
        envFile = args[1];
        args.splice(0, 2);
    }
    const overrides = new Map();
    if (args[0] === '--activate-open-finance-canary') {
        const aliases = String(args[1] || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
        const timestamp = String(args[2] || '');
        if (!aliases.length || aliases.length > 4 || new Set(aliases).size !== aliases.length ||
            aliases.some(alias => !/^[a-z0-9_-]{2,48}$/.test(alias)) || !Number.isFinite(Date.parse(timestamp))) {
            throw new Error('open_finance_canary_activation_invalid');
        }
        const activation = new Date(timestamp).toISOString();
        overrides.set('OPEN_FINANCE_ALERT_CANARY_ALIAS', '');
        overrides.set('OPEN_FINANCE_ALERT_CANARY_ALIASES', aliases.join(','));
        overrides.set('OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON', JSON.stringify(
            Object.fromEntries(aliases.map(alias => [alias, activation]))
        ));
        args.splice(0, 3);
    } else if (args[0] === '--single-open-finance-canary') {
        const alias = String(args[1] || '').trim().toLowerCase();
        if (!/^[a-z0-9_-]{2,48}$/.test(alias)) throw new Error('open_finance_single_canary_invalid');
        overrides.set('OPEN_FINANCE_ALERT_CANARY_ALIAS', alias);
        overrides.set('OPEN_FINANCE_ALERT_CANARY_ALIASES', '');
        overrides.set('OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON', '');
        args.splice(0, 2);
    }
    if (!envFile || (!args.length && !overrides.size)) throw new Error('runtime_env_overrides_required');
    for (const argument of args) {
        const separator = argument.indexOf('=');
        const key = separator > 0 ? argument.slice(0, separator) : '';
        const value = separator > 0 ? argument.slice(separator + 1) : '';
        if (!ALLOWED_KEYS.has(key)) throw new Error('runtime_env_key_forbidden');
        if (/\r|\n/.test(value)) throw new Error('runtime_env_value_invalid');
        validateOverride(key, value);
        overrides.set(key, value);
    }
    return { envFile: path.resolve(envFile), overrides };
}

function applyOverrides({ envFile, overrides }) {
    if (!fs.existsSync(envFile)) throw new Error('runtime_env_file_unavailable');
    const stat = fs.statSync(envFile);
    const original = fs.readFileSync(envFile, 'utf8');
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    const trailingNewline = original.endsWith('\n');
    const seen = new Set();
    const lines = original.split(/\r?\n/).map(line => {
        const match = line.match(/^([A-Z0-9_]+)=/);
        if (!match || !overrides.has(match[1])) return line;
        seen.add(match[1]);
        return `${match[1]}=${overrides.get(match[1])}`;
    });
    while (lines.length > 1 && lines.at(-1) === '') lines.pop();
    for (const [key, value] of overrides) {
        if (!seen.has(key)) lines.push(`${key}=${value}`);
    }
    const output = `${lines.join(newline)}${trailingNewline ? newline : ''}`;
    const temporary = `${envFile}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, output, { mode: stat.mode });
    fs.renameSync(temporary, envFile);
    fs.chmodSync(envFile, stat.mode);
    return { updated_keys: [...overrides.keys()].sort(), values_exposed: 0 };
}

function main(argv = process.argv.slice(2)) {
    return applyOverrides(parseArguments(argv));
}

if (require.main === module) {
    process.stdout.write(`${JSON.stringify(main())}\n`);
}

module.exports = { ALLOWED_KEYS, MODES, validateOverride, parseArguments, applyOverrides, main };
