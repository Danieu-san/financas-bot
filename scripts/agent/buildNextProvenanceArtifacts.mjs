import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaDirectory = 'docs/contracts/next/provenance-v2';
const schemaNames = Object.freeze({
    claims: 'claim-contract',
    evaluator: 'evaluator-contract',
    witnesses: 'evaluator-witness-contracts',
    snapshot: 'evidence-snapshot',
    registry: 'metric-evaluator-registry',
    graphs: 'provenance-graph'
});

// Build-time only. No loadSchema hook, external resolution, coercion, removal
// of unknown fields or insertion of defaults. Schema semantics remain draft-07.
export function buildSchemaValidators() {
    const ajv = new Ajv({
        // Ratified schemas use composition across allOf/oneOf/$ref. Optional
        // authoring lints are not draft-07 semantics. Keep unknown keywords and
        // non-finite numbers forbidden; required/type/bounds still validate.
        strict: false,
        strictSchema: true,
        strictNumbers: true,
        allowUnionTypes: true,
        allErrors: true,
        ownProperties: true,
        coerceTypes: false,
        useDefaults: false,
        removeAdditional: false,
        code: { source: true, lines: true }
    });
    addFormats(ajv);
    const schemaHashes = [];
    const exports = {};
    for (const [name, stem] of Object.entries(schemaNames)) {
        const relative = `${schemaDirectory}/${stem}.schema.json`;
        const bytes = fs.readFileSync(path.join(root, relative));
        const schema = JSON.parse(bytes.toString('utf8'));
        const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        schemaHashes.push({ path: relative, sha256 });
        if (schema.$schema !== 'http://json-schema.org/draft-07/schema#') throw new Error('schema_dialect_mismatch');
        ajv.addSchema(schema);
        exports[name] = schema.$id;
    }
    const validators = Object.fromEntries(Object.entries(exports).map(([name, id]) => [name, ajv.getSchema(id)]));
    const code = standaloneCode(ajv, exports);
    return { validators, code, schemaHashes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.length !== 3 || process.argv[2] !== '--check') {
        throw new Error('usage: buildNextProvenanceArtifacts.mjs --check');
    }
    const built = buildSchemaValidators();
    // Development check only. No execution registry/root/freeze is emitted yet.
    console.log(JSON.stringify({ stage: 'schema_build_only', schemas: built.schemaHashes.length,
        generatedBytes: Buffer.byteLength(built.code),
        generatedSha256: createHash('sha256').update(built.code).digest('hex') }));
}
