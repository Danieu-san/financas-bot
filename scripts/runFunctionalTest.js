const { spawnSync } = require('child_process');
const { assertSpreadsheetResetAllowed } = require('./resetSpreadsheetData');

try {
    assertSpreadsheetResetAllowed();
} catch (error) {
    console.error(`Teste funcional bloqueado: ${error.message}`);
    process.exit(1);
}

const result = spawnSync(
    process.execPath,
    ['--test', '--test-concurrency=1', 'tests/functional.test.js'],
    {
        stdio: 'inherit',
        env: {
            ...process.env,
            RUN_FUNCTIONAL_TESTS: 'true'
        }
    }
);

process.exit(result.status ?? 1);
