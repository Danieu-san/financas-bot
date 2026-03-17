const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
require('dotenv').config();

const googleService = require('../src/services/google');
const { handleMessage } = require('../src/handlers/messageHandler');
const gemini = require('../src/services/gemini');
const userStateManager = require('../src/state/userStateManager');

// Mock Gemini
const originalGetStructuredResponseFromLLM = gemini.getStructuredResponseFromLLM;
const originalAskLLM = gemini.askLLM;

function mockGeminiResponse(intent, details = {}) {
    gemini.getStructuredResponseFromLLM = async () => ({
        intent,
        ...details
    });
}

function mockAskLLM(response) {
    gemini.askLLM = async () => response;
}

function restoreGemini() {
    gemini.getStructuredResponseFromLLM = originalGetStructuredResponseFromLLM;
    gemini.askLLM = originalAskLLM;
}

// Mock WhatsApp Message
function createMockMsg(body, from = '5521970112407@c.us') {
    const replies = [];
    return {
        id: { id: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` },
        type: 'chat',
        body,
        from,
        author: from,
        isStatus: false,
        fromMe: false,
        reply: async (text) => {
            console.log(`[Bot Reply]: ${text}`);
            replies.push(text);
            return { id: { id: `reply_${Date.now()}` } };
        },
        getReplies: () => replies,
        getLastReply: () => replies[replies.length - 1]
    };
}

async function deleteLastRows(sheetName, count) {
    if (count <= 0) return;
    const sheetIds = await googleService.getSheetIds();
    const sheetId = sheetIds[sheetName];
    const data = await googleService.readDataFromSheet(`${sheetName}!A:A`);
    const totalRows = data.length;

    if (totalRows <= 1) return; // Don't delete headers

    const startIndex = Math.max(1, totalRows - count);
    const endIndex = totalRows;

    if (startIndex >= endIndex) return;

    await googleService.sheets.spreadsheets.batchUpdate({
        spreadsheetId: process.env.SPREADSHEET_ID,
        resource: {
            requests: [{
                deleteDimension: {
                    range: {
                        sheetId: sheetId,
                        dimension: 'ROWS',
                        startIndex: startIndex,
                        endIndex: endIndex
                    }
                }
            }]
        }
    });
}

test.describe('Integration Tests - WhatsApp Flow to Google Sheets', { concurrency: false }, async () => {
    test.before(async () => {
        await googleService.authorizeGoogle();
        console.log('Test setup complete.');
    });

    test.after(async () => {
        console.log('Cleaning up test data...');
        // We added:
        // Flow 1: 1 row in Saídas (and Flow 4 deletes something, but let's just clear what's left)
        // Flow 2: 3 rows in Cartão Nubank - Daniel
        // Flow 3: 1 row in Entradas
        
        try {
            await deleteLastRows('Saídas', 2);
            await deleteLastRows('Entradas', 2);
            await deleteLastRows('Cartão Nubank - Daniel', 5);
        } catch (e) {
            console.error('Cleanup error:', e.message);
        }
        
        restoreGemini();
    });

    test('Flow 1: Simple expense on PIX (gastei 80 reais no ifood no pix)', async () => {
        const msg = createMockMsg('gastei 80 reais no ifood no pix');
        
        mockGeminiResponse('gasto', {
            gastoDetails: [{
                descricao: 'ifood',
                valor: 80,
                categoria: 'Alimentação',
                subcategoria: 'DELIVERY / IFOOD',
                pagamento: 'PIX',
                recorrente: 'Não'
            }]
        });

        await handleMessage(msg);
        assert.ok(msg.getLastReply().includes('Você confirma o registro'), 'Should ask for confirmation');

        const confirmMsg = createMockMsg('sim');
        await handleMessage(confirmMsg);
        assert.ok(confirmMsg.getLastReply().includes('como esses itens foram pagos?'), 'Should ask for payment method after confirmation');

        const paymentMsg = createMockMsg('pix');
        mockAskLLM('PIX');
        await handleMessage(paymentMsg);
        assert.ok(paymentMsg.getLastReply().includes('Registro finalizado'), 'Should confirm registration');

        const currentSaidas = await googleService.readDataFromSheet('Saídas!A:I');
        const lastRow = currentSaidas[currentSaidas.length - 1];
        assert.strictEqual(lastRow[1], 'ifood');
        assert.strictEqual(parseFloat(lastRow[4].replace(',', '.')), 80);
        assert.strictEqual(lastRow[6], 'PIX');
    });

    test('Flow 2: Credit card expense with installments (gastei 200 no supermercado)', async () => {
        const msg = createMockMsg('gastei 200 no supermercado');
        
        mockGeminiResponse('gasto', {
            gastoDetails: [{
                descricao: 'supermercado',
                valor: 200,
                categoria: 'Alimentação',
                subcategoria: 'SUPERMERCADO',
                pagamento: null,
                recorrente: 'Não'
            }]
        });

        await handleMessage(msg);
        assert.ok(msg.getLastReply().includes('Você confirma o registro'), 'Should ask for confirmation');

        const confirmMsg = createMockMsg('sim');
        await handleMessage(confirmMsg);
        assert.ok(confirmMsg.getLastReply().includes('como esses itens foram pagos?'), 'Should ask for payment method');

        const creditMsg = createMockMsg('crédito');
        mockAskLLM('Crédito');
        await handleMessage(creditMsg);
        assert.ok(creditMsg.getLastReply().includes('Em qual cartão?'), 'Should ask for card selection');

        const cardMsg = createMockMsg('1');
        await handleMessage(cardMsg);
        assert.ok(cardMsg.getLastReply().includes('E as parcelas?'), 'Should ask for installments');

        const installmentsMsg = createMockMsg('3');
        await handleMessage(installmentsMsg);
        assert.ok(installmentsMsg.getLastReply().includes('Lançamentos no crédito finalizados'), 'Should confirm registration');

        const currentNubank = await googleService.readDataFromSheet('Cartão Nubank - Daniel!A:F');
        const last3Rows = currentNubank.slice(-3);
        
        assert.strictEqual(last3Rows.length, 3);
        last3Rows.forEach((row, index) => {
            assert.strictEqual(row[1], 'supermercado');
            assert.strictEqual(row[4], `${index + 1}/3`);
            const val = parseFloat(row[3].replace(',', '.'));
            assert.ok(Math.abs(val - 200/3) < 0.1);
        });
    });

    test('Flow 3: Income (recebi 1500 de salário no pix)', async () => {
        const msg = createMockMsg('recebi 1500 de salário no pix');
        
        mockGeminiResponse('entrada', {
            entradaDetails: [{
                descricao: 'salário',
                valor: 1500,
                categoria: 'Salário',
                recebimento: 'PIX',
                recorrente: 'Não'
            }]
        });

        await handleMessage(msg);
        assert.ok(msg.getLastReply().includes('Você confirma o registro'), 'Should ask for confirmation for income');
        
        const confirmMsg = createMockMsg('sim');
        await handleMessage(confirmMsg);
        assert.ok(confirmMsg.getLastReply().includes('como esses itens foram pagos?') || confirmMsg.getLastReply().includes('onde você recebeu esse valor?'), 'Should ask for receipt method');

        const receiptMsg = createMockMsg('pix');
        mockAskLLM('PIX');
        await handleMessage(receiptMsg);
        assert.ok(receiptMsg.getLastReply().includes('Registro finalizado') || receiptMsg.getLastReply().includes('salvos com sucesso'), 'Should confirm registration');

        const currentEntradas = await googleService.readDataFromSheet('Entradas!A:H');
        const lastRow = currentEntradas[currentEntradas.length - 1];
        assert.ok(lastRow[1].includes('salário') || lastRow[1].includes('salario'), 'Description should match');
        assert.strictEqual(parseFloat(lastRow[3].replace(',', '.')), 1500);
        assert.strictEqual(lastRow[5], 'PIX');
    });

    test('Flow 4: Delete last expense', async () => {
        const msg = createMockMsg('apagar último gasto');
        
        mockGeminiResponse('apagar_item', {
            deleteDetails: {
                descricao: 'ultimo',
                categoria: 'gasto'
            }
        });

        await handleMessage(msg);
        assert.ok(msg.getLastReply().includes('Você tem certeza?'), 'Should ask for confirmation to delete');

        const confirmMsg = createMockMsg('sim');
        await handleMessage(confirmMsg);
        assert.ok(confirmMsg.getLastReply().includes('apagado(s) com sucesso'), 'Should confirm deletion');
    });

    test('Flow 5: Analytical question (quanto gastei este mês?)', async () => {
        const msg = createMockMsg('quanto gastei este mês?');
        
        mockGeminiResponse('pergunta', {
            question: 'quanto gastei este mês?'
        });
        
        await handleMessage(msg);
        assert.ok(msg.getLastReply().includes('Analisando seus dados'), 'Should show analysis message');
    });
});
