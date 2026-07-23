const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PRODUCT_ROOT = path.join(ROOT, 'src');
const ENV_EXAMPLE_PATH = path.join(ROOT, '.env.example');
const CODE_EXTENSIONS = new Set(['.js', '.mjs']);
const APPROVED_DYNAMIC_ACCESSES = new Set([
    'src/services/statementImportService.js:process.env[name]',
    'src/testing/whatsappE2EConfig.js:env[name]'
]);

function normalizeFile(file) {
    return path.relative(ROOT, file).replace(/\\/g, '/');
}

function listCodeFiles(root, output = []) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const absolute = path.join(root, entry.name);
        if (entry.isDirectory()) listCodeFiles(absolute, output);
        else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) output.push(absolute);
    }
    return output;
}

function extractRuntimeEnvNames(source = '') {
    const names = new Set();
    const patterns = [
        /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g,
        /\benv\.([A-Z][A-Z0-9_]*)\b/g,
        /\b(?:process\.)?env\s*\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g,
        /\bgetPositiveIntegerEnv\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
        /\brequireEnv\(\s*env\s*,\s*['"]([A-Z][A-Z0-9_]*)['"]/g
    ];
    for (const pattern of patterns) {
        for (const match of String(source).matchAll(pattern)) names.add(match[1]);
    }
    return [...names].sort();
}

function extractDynamicEnvAccesses(source = '', file = '') {
    const accesses = [];
    const pattern = /\b(process\.)?env\s*\[\s*([^'"][^\]]*?)\s*\]/g;
    for (const match of String(source).matchAll(pattern)) {
        const target = `${match[1] || ''}env[${String(match[2] || '').trim()}]`;
        accesses.push(`${file}:${target}`);
    }
    return accesses;
}

function parseEnvExample(source = '') {
    const definitions = [];
    for (const line of String(source).split(/\r?\n/)) {
        const match = line.match(/^([A-Z][A-Z0-9_]*)=/);
        if (match) definitions.push(match[1]);
    }
    const counts = new Map();
    definitions.forEach(name => counts.set(name, (counts.get(name) || 0) + 1));
    return {
        names: [...counts.keys()].sort(),
        duplicates: [...counts.entries()]
            .filter(([, count]) => count > 1)
            .map(([name]) => name)
            .sort()
    };
}

function checkRuntimeEnvContract() {
    const productFiles = [path.join(ROOT, 'index.js'), ...listCodeFiles(PRODUCT_ROOT)].sort();
    const referencedNames = new Set();
    const dynamicAccesses = [];
    for (const file of productFiles) {
        const source = fs.readFileSync(file, 'utf8');
        extractRuntimeEnvNames(source).forEach(name => referencedNames.add(name));
        dynamicAccesses.push(...extractDynamicEnvAccesses(source, normalizeFile(file)));
    }

    const example = parseEnvExample(fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8'));
    const documentedNames = new Set(example.names);
    const sortedReferencedNames = [...referencedNames].sort();
    const sortedDynamicAccesses = [...new Set(dynamicAccesses)].sort();

    return {
        schema_version: 1,
        product_file_count: productFiles.length,
        referenced_name_count: sortedReferencedNames.length,
        documented_name_count: example.names.length,
        referenced_names: sortedReferencedNames,
        undocumented_names: sortedReferencedNames.filter(name => !documentedNames.has(name)),
        duplicate_definitions: example.duplicates,
        dynamic_accesses: sortedDynamicAccesses,
        unapproved_dynamic_accesses: sortedDynamicAccesses.filter(access => !APPROVED_DYNAMIC_ACCESSES.has(access))
    };
}

if (require.main === module) {
    const result = checkRuntimeEnvContract();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (
        result.undocumented_names.length > 0 ||
        result.duplicate_definitions.length > 0 ||
        result.unapproved_dynamic_accesses.length > 0
    ) {
        process.exitCode = 1;
    }
}

module.exports = {
    APPROVED_DYNAMIC_ACCESSES,
    extractRuntimeEnvNames,
    extractDynamicEnvAccesses,
    parseEnvExample,
    checkRuntimeEnvContract
};
