const fs = require('node:fs');
const path = require('node:path');

const ALLOWED_KEYS = new Set([
    'APP_COMMIT_SHA',
    'LEGACY_RETIREMENT_TRIPWIRE_ENABLED',
    'LEGACY_RETIREMENT_SOFT_DISABLED_CANDIDATES',
    'OPEN_FINANCE_ALERT_CANARY_ALIAS',
    'OPEN_FINANCE_ALERT_CANARY_ALIASES',
    'OPEN_FINANCE_ALERT_CANARY_ACTIVATIONS_JSON'
]);

function parseArguments(argv) {
    const args = [...argv];
    let envFile = '.env';
    if (args[0] === '--env-file') {
        envFile = args[1];
        args.splice(0, 2);
    }
    if (!envFile || !args.length) throw new Error('runtime_env_overrides_required');
    const overrides = new Map();
    for (const argument of args) {
        const separator = argument.indexOf('=');
        const key = separator > 0 ? argument.slice(0, separator) : '';
        const value = separator > 0 ? argument.slice(separator + 1) : '';
        if (!ALLOWED_KEYS.has(key)) throw new Error('runtime_env_key_forbidden');
        if (/\r|\n/.test(value)) throw new Error('runtime_env_value_invalid');
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

module.exports = { ALLOWED_KEYS, parseArguments, applyOverrides, main };
