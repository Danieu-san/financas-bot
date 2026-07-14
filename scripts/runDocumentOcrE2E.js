require('dotenv').config();

const { getAllUsers } = require('../src/services/userService');
const { buildDocumentOcrPolicy, stageFinancialDocumentImport } = require('../src/services/documentOcrImportService');
const { resolveFixtureUser } = require('./runBatchMaintenanceE2E');

function buildSyntheticPdf() {
    const stream = 'BT /F1 14 Tf 50 760 Td (EXTRATO FINANCEIRO TESTE) Tj 0 -24 Td (Data: 14/07/2026) Tj 0 -24 Td (Descricao: Mercado Teste OCR) Tj 0 -24 Td (Valor: -12.34) Tj ET';
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf);
}

async function main() {
    const user = resolveFixtureUser(await getAllUsers(), process.env.FINANCIAL_DOCUMENT_OCR_E2E_USER_LOOKUP);
    const policy = buildDocumentOcrPolicy(process.env, user.user_id);
    if (!policy.allowed) throw new Error('Canario OCR real nao autorizado para o usuario E2E.');
    const pdf = buildSyntheticPdf();
    const staged = await stageFinancialDocumentImport({ mimetype: 'application/pdf', data: pdf.toString('base64') });
    if (staged.transactions.length !== 1 || staged.writesPerformed !== 0 || Math.abs(staged.transactions[0].valor - 12.34) > 0.001) {
        throw new Error('Staging OCR sintetico divergiu.');
    }
    console.log('[document-ocr-e2e] GO documents=1 rows=1 writes=zero cleanup=zero privacy=true');
}

if (require.main === module) main().catch(error => { console.error(`[document-ocr-e2e] NO_GO error=${error.message}`); process.exit(1); });
module.exports = { buildSyntheticPdf, main };
