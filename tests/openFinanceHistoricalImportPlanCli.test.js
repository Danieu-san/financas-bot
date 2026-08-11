const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function writeJson(directory, name, value) {
    const filePath = path.join(directory, name);
    fs.writeFileSync(filePath, JSON.stringify(value));
    return filePath;
}

test('CLI writes only to an external private path and reports aggregates', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-plan-'));
    const pluggyPath = writeJson(directory, 'pluggy.json', {
        observed_at: '2026-01-31T00:00:00.000Z',
        items: [{
            id: 'item',
            accounts: [{ id: 'account', type: 'BANK' }],
            transactions: [{
                id: 'transaction', item_id: 'item', account_id: 'account',
                provider_id: 'provider', description: 'DADO PRIVADO SINTETICO',
                amount_cents: -1000, currency: 'BRL', date: '2026-01-10',
                status: 'POSTED', type: 'DEBIT'
            }]
        }]
    });
    const sheetPath = writeJson(directory, 'sheet.json', {
        ranges: {
            'Saídas!A:K': [[
                'Data', 'Descrição', 'Categoria', 'Subcategoria', 'Valor',
                'Responsável', 'Pagamento', 'Recorrente', 'Observações',
                'user_id', 'Conta Financeira'
            ]]
        }
    });
    const configPath = writeJson(directory, 'config.json', {
        historyStartDate: '2025-07-01',
        historyEndDate: '2026-12-31',
        sourceObservedAt: '2026-01-31T00:00:00.000Z',
        coverageComplete: false,
        accountBindings: {
            account: {
                kind: 'bank', ownerUserId: 'person', ownerLabel: 'Pessoa',
                financialAccount: 'Conta', paymentMethod: 'Débito'
            }
        },
        merchantRules: [{
            match: { mode: 'exact', value: 'DADO PRIVADO SINTETICO' },
            classification: 'expense', category: 'Outros', subcategory: ''
        }]
    });
    const outputPath = path.join(directory, 'plan.json');
    const result = spawnSync(process.execPath, [
        path.resolve(__dirname, '../scripts/runOpenFinanceHistoricalImportPlan.js'),
        '--confirm-read-only', '--confirm-private-output',
        '--pluggy-snapshot', pluggyPath,
        '--sheet-snapshot', sheetPath,
        '--config', configPath,
        '--output', outputPath
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(outputPath), true);
    assert.equal(result.stdout.includes('DADO PRIVADO SINTETICO'), false);
    const stdout = JSON.parse(result.stdout);
    const stored = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(stdout.financial_writes, 0);
    assert.equal(stdout.plan_status, 'PARTIAL_NO_GO');
    assert.equal(stdout.coverage_complete, false);
    assert.equal(stored.entries.length, 1);
    assert.equal(stored.writable, false);
    assert.equal(stored.source_observed_at, '2026-01-31T00:00:00.000Z');
});

test('CLI refuses to place a private plan inside the repository', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-plan-'));
    const empty = writeJson(directory, 'empty.json', {});
    const result = spawnSync(process.execPath, [
        path.resolve(__dirname, '../scripts/runOpenFinanceHistoricalImportPlan.js'),
        '--confirm-read-only', '--confirm-private-output',
        '--pluggy-snapshot', empty,
        '--sheet-snapshot', empty,
        '--config', empty,
        '--output', path.resolve(__dirname, '../private-plan.json')
    ], { encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /output_must_stay_outside_repository/);
    assert.equal(fs.existsSync(path.resolve(__dirname, '../private-plan.json')), false);
});

test('CLI ignores a stale positive coverage claim and recomputes from its input snapshot', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-plan-'));
    const pluggyPath = writeJson(directory, 'pluggy.json', {
        observed_at: '2026-01-15T00:00:00.000Z', items: []
    });
    const sheetPath = writeJson(directory, 'sheet.json', { ranges: {} });
    const configPath = writeJson(directory, 'config.json', {
        historyStartDate: '2025-07-01', historyEndDate: '2026-01-31',
        sourceObservedAt: '2026-02-01T00:00:00.000Z', coverageComplete: true,
        accountBindings: {}, merchantRules: [], decisionOverrides: {}
    });
    const outputPath = path.join(directory, 'plan.json');
    const result = spawnSync(process.execPath, [
        path.resolve(__dirname, '../scripts/runOpenFinanceHistoricalImportPlan.js'),
        '--confirm-read-only', '--confirm-private-output',
        '--pluggy-snapshot', pluggyPath, '--sheet-snapshot', sheetPath,
        '--config', configPath, '--output', outputPath
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).plan_status, 'PARTIAL_NO_GO');
    assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).coverage_complete, false);
});

test('path guard resolves symbolic ancestors before allowing private output', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-root-'));
    const privateDirectory = path.join(root, 'private');
    const externalDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-link-'));
    fs.mkdirSync(privateDirectory);
    const link = path.join(externalDirectory, 'linked-private');
    try {
        fs.symlinkSync(privateDirectory, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
        t.skip(`symbolic link unavailable: ${error.code || error.message}`);
        return;
    }
    const { isInside } = require('../scripts/runOpenFinanceHistoricalImportPlan');
    assert.equal(isInside(root, path.join(link, 'plan.json')), true);
});
