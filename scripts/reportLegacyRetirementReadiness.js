const fs = require('node:fs');
const path = require('node:path');
const { evaluateLegacyRetirementCandidate } = require('../src/reliability/legacyRetirementPolicy');

function readArg(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] || '' : '';
}

function main() {
    const inputPath = readArg('--input') || String(process.argv[2] || '');
    if (!inputPath) throw new Error('Informe --input com um snapshot JSON sanitizado.');
    const absolutePath = path.resolve(process.cwd(), inputPath);
    const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    const report = {
        schema_version: 1,
        generated_at: new Date().toISOString(),
        evidence_as_of: String(parsed.evidence_as_of || ''),
        candidates: candidates.map(evaluateLegacyRetirementCandidate)
    };
    report.summary = {
        total: report.candidates.length,
        soft_disable_candidates: report.candidates.filter(item => item.soft_disable.verdict === 'CANDIDATE').length,
        physical_delete_candidates: report.candidates.filter(item => item.physical_delete.verdict === 'CANDIDATE').length
    };
    console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(JSON.stringify({ verdict: 'INVALID_EVIDENCE', reason: error.message }));
        process.exitCode = 1;
    }
}

module.exports = { main, readArg };
