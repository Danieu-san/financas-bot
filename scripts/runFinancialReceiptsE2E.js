require('dotenv').config();

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getAllUsers } = require('../src/services/userService');
const { FinancialReceiptStore } = require('../src/receipts/financialReceiptService');
const { uploadFinancialReceipt, deleteFinancialReceipt } = require('../src/receipts/financialReceiptDriveService');
const { handleFinancialReceiptMessage, __test__ } = require('../src/handlers/financialReceiptHandler');
const { resolveFixtureUser } = require('./runBatchMaintenanceE2E');

async function main() {
    const user = resolveFixtureUser(await getAllUsers(), process.env.FINANCIAL_RECEIPTS_E2E_USER_LOOKUP);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-receipts-6c-'));
    const dbPath = path.join(tempDir, 'receipts.sqlite');
    const store = new FinancialReceiptStore({ dbPath });
    const states = new Map();
    const replies = [];
    const uploadedIds = [];
    let uploadFailure = '';
    const pdf = Buffer.from('%PDF-1.7\n% FinancasBot synthetic receipt 6C\n%%EOF');
    const stateManager = { getState: key => states.get(key), setState: (key, value) => states.set(key, value), deleteState: key => states.delete(key) };
    const deps = {
        stateManager,
        getStore: () => store,
        uploadReceipt: async input => {
            try {
                const result = await uploadFinancialReceipt(input);
                uploadedIds.push(result.driveFileId);
                return result;
            } catch (error) {
                const safeMessage = /^RECEIPT_[A-Z_]+$/.test(String(error?.message || '')) ? error.message : '';
                uploadFailure = String(error?.code || error?.response?.status || safeMessage || error?.name || 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
                throw error;
            }
        },
        createMessageMedia: input => input
    };
    const msg = (body, media = null) => ({
        body, from: String(user.whatsapp_id || 'receipt-e2e'), hasMedia: Boolean(media),
        downloadMedia: async () => media,
        reply: async (...args) => replies.push(args)
    });
    let cleanupError;
    try {
        const started = await handleFinancialReceiptMessage(msg('anexar comprovante ao último gasto'), user, deps);
        const pendingAfterStart = states.get(String(user.whatsapp_id || 'receipt-e2e'))?.action === 'awaiting_financial_receipt_media';
        const attached = await handleFinancialReceiptMessage(msg('', {
            mimetype: 'application/pdf', data: pdf.toString('base64'), filename: 'synthetic.pdf'
        }), user, deps);
        const fetched = await handleFinancialReceiptMessage(msg('mostrar comprovante do último gasto'), user, deps);
        const downloaded = replies.find(reply => Buffer.isBuffer(reply?.[0]?.buffer))?.[0]?.buffer;
        if (!started || !attached || !fetched || uploadedIds.length !== 1 || !Buffer.isBuffer(downloaded) || !downloaded.equals(pdf)) {
            throw new Error(`Fluxo anexar/baixar divergiu started=${Boolean(started)} pending=${pendingAfterStart} attached=${Boolean(attached)} fetched=${Boolean(fetched)} uploads=${uploadedIds.length} upload_error=${uploadFailure || 'none'} downloaded=${Buffer.isBuffer(downloaded)} bytes_equal=${Buffer.isBuffer(downloaded) && downloaded.equals(pdf)}`);
        }
    } finally {
        for (const driveFileId of uploadedIds) {
            try { await deleteFinancialReceipt({ userId: user.user_id, driveFileId }); }
            catch (error) { cleanupError = error; }
        }
        store.close();
        __test__.clearPendingReceipts();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (cleanupError || fs.existsSync(tempDir)) throw cleanupError || new Error('Cleanup local incompleto.');
    console.log('[financial-receipts-e2e] GO uploads=1 downloads=1 writes=zero cleanup=zero privacy=true');
}

if (require.main === module) main().catch(error => { console.error(`[financial-receipts-e2e] NO_GO error=${error.message}`); process.exit(1); });
module.exports = { main };
