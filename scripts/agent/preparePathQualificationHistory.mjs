// Trusted BUILD capture of already-existing synthetic historical evidence.
// Exact byte identity is not execution reuse, code review or operational GO.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { loadLocalAuthoringPackage } from './executeNextDomainInvariantMatrix.mjs';
import { buildAdmittedSchemaValidators } from './buildNextProvenanceArtifacts.mjs';
import { compileAuthoringIR } from '../../src/next/provenance/graphCompiler.js';
import { preparePathQualificationInventory, preparePathQualificationHistoricalMigration,
    verifyPathQualificationHistoricalMigration } from '../../src/next/provenance/pathQualificationV3.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'docs/audit-evidence/n02g-causal-authoring-profile/path-v3-history-20261008');
const reportPath = path.join(output, 'historical-v2-report.json');
const manifestPath = path.join(output, 'capture.json');
const sourcePath = path.resolve(root, '../n02g-host-parent-reconcile-20261001/.codex-temp/path-semantic-v2-full-20261004.json');
const sha = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
if (process.version !== 'v22.17.0' || process.argv.length !== 2
    || fs.existsSync(reportPath) || fs.existsSync(manifestPath)) throw new Error('history_capture_usage_or_duplicate');
const bytes = fs.readFileSync(sourcePath);
const source = bytes.toString('utf8');
if (!Buffer.from(source, 'utf8').equals(bytes)) throw new Error('history_capture_utf8_not_exact');
const packageReceipt = loadLocalAuthoringPackage();
const ir = compileAuthoringIR(packageReceipt, buildAdmittedSchemaValidators(packageReceipt).validators);
const preparation = preparePathQualificationInventory({ packageReceipt, ir });
const migration = preparePathQualificationHistoricalMigration({ preparation, historicalSource: source });
const integrity = verifyPathQualificationHistoricalMigration({ migration, candidate: migration });
if (!integrity.migration_integrity || !integrity.exact_old_membership
    || integrity.historical_report_sha256 !== sha(bytes)) throw new Error('history_capture_integrity');
const capture = {
    format: 'financasbot.path-qualification.historical-source-capture', version: 3,
    stage: 'exact_historical_bytes_captured_not_qualified', capture_id: randomUUID(),
    captured_at: new Date().toISOString(), node: process.version,
    source_kind: 'existing_synthetic_v2_local_report', historical_report: 'historical-v2-report.json',
    historical_report_sha256: sha(bytes), historical_bytes: bytes.length,
    target_ids_sha256: migration.target_ids_sha256, migration_rows_sha256: migration.rows_sha256,
    expected_predicates: migration.expected_predicates, method_authority: migration.method_authority,
    baseline_authority: preparation.authority_refs, baseline_raw_identity_reused: false,
    historical_report_flags: migration.historical_report_flags,
    evidence_reused_for_v3: false, qualified: false, semantic_mutation_credit: 0,
    independent_execution: false, global_g11: false, financial_receipt: false
};
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(reportPath, bytes, { flag: 'wx' });
fs.writeFileSync(manifestPath, JSON.stringify(capture, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ report_sha256: sha(bytes), capture_sha256: sha(fs.readFileSync(manifestPath)),
    expected_predicates: migration.expected_predicates, exact_old_membership: true,
    qualified: false, semantic_mutation_credit: 0, independent_execution: false }));
