const test = require('node:test');
const assert = require('node:assert');

const {
    extractRuntimeEnvNames,
    extractDynamicEnvAccesses,
    parseEnvExample,
    checkRuntimeEnvContract
} = require('../scripts/checkRuntimeEnvContract');

test('runtime env extractor covers direct, injected, literal and approved helper access', () => {
    const names = extractRuntimeEnvNames(`
        process.env.DIRECT_NAME;
        env.INJECTED_NAME;
        process.env['LITERAL_NAME'];
        getPositiveIntegerEnv('DYNAMIC_LIMIT', 10);
        requireEnv(env, 'REQUIRED_NAME');
    `);

    assert.deepStrictEqual(names, [
        'DIRECT_NAME',
        'DYNAMIC_LIMIT',
        'INJECTED_NAME',
        'LITERAL_NAME',
        'REQUIRED_NAME'
    ]);
});

test('runtime env extractor exposes unresolved dynamic access instead of hiding it', () => {
    assert.deepStrictEqual(
        extractDynamicEnvAccesses('const value = process.env[name]; const other = env[key];', 'src/example.js'),
        ['src/example.js:process.env[name]', 'src/example.js:env[key]']
    );
});

test('env example parser rejects duplicate definitions without reading values', () => {
    const parsed = parseEnvExample('ONE=first\nTWO=\nONE=second\n');
    assert.deepStrictEqual(parsed.names, ['ONE', 'TWO']);
    assert.deepStrictEqual(parsed.duplicates, ['ONE']);
});

test('versioned env example documents every product configuration name exactly once', () => {
    const result = checkRuntimeEnvContract();

    assert.ok(result.product_file_count > 0);
    assert.ok(result.referenced_name_count > 0);
    assert.deepStrictEqual(result.undocumented_names, []);
    assert.deepStrictEqual(result.duplicate_definitions, []);
    assert.deepStrictEqual(result.unapproved_dynamic_accesses, []);
    assert.deepStrictEqual(result.dynamic_accesses, [
        'src/services/statementImportService.js:process.env[name]',
        'src/testing/whatsappE2EConfig.js:env[name]'
    ]);
    assert.ok(result.referenced_names.includes('IMPORT_MAX_FILE_BYTES'));
    assert.ok(result.referenced_names.includes('WHATSAPP_E2E_BOT_PHONE'));
});
