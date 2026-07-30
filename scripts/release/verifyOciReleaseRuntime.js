async function verifyOciReleaseRuntime({
    Database = require('better-sqlite3'),
    puppeteer = require('puppeteer')
} = {}) {
    const database = new Database(':memory:');
    try {
        const row = database.prepare('SELECT 1 AS ok').get();
        if (row?.ok !== 1) throw new Error('oci_release_sqlite_preflight_failed');
    } finally {
        database.close();
    }

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    try {
        const page = await browser.newPage();
        await page.goto('about:blank');
    } finally {
        await browser.close();
    }
    return {
        sqlite: true,
        puppeteer: true,
        financial_writes: 0,
        whatsapp_session_reads: 0
    };
}

if (require.main === module) {
    verifyOciReleaseRuntime()
        .then(result => {
            process.stdout.write(`${JSON.stringify(result)}\n`);
        })
        .catch(error => {
            process.stderr.write(`${error.message}\n`);
            process.exitCode = 1;
        });
}

module.exports = { verifyOciReleaseRuntime };
