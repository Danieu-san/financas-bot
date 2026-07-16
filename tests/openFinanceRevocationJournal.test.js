const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { OpenFinanceRevocationJournal } = require('../src/openFinance/openFinanceRevocationJournal');

const secret = 'open-finance-revocation-test-secret-32-bytes';

test('9F revocation journal is append-only, generation-aware and contains no raw alias', () => {
    const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'finbot-revocation-journal-')), 'journal.sqlite');
    const journal = new OpenFinanceRevocationJournal({ databasePath, secret });
    try {
        const first = journal.recordRevocation({ alias: 'daniel_nubank', generation: 1,
            revokedAt: '2026-07-16T12:00:00.000Z' });
        const replay = journal.recordRevocation({ alias: 'daniel_nubank', generation: 1,
            revokedAt: '2026-07-16T13:00:00.000Z' });
        assert.equal(first.recorded, true); assert.equal(replay.replay, true);
        assert.equal(journal.isGenerationRevoked('daniel_nubank', 1), true);
        assert.equal(journal.isGenerationRevoked('daniel_nubank', 2), false);
        assert.deepEqual(journal.checkpoint(), { schema: 'open-finance-revocation-journal-v1',
            entries: 1, sequence: 1, latest_revoked_at: '2026-07-16T12:00:00.000Z', financial_writes: 0 });
    } finally { journal.close(); }
    const bytes = fs.readFileSync(databasePath).toString('latin1');
    assert.equal(bytes.includes('daniel_nubank'), false);
    assert.equal(bytes.includes(secret), false);
});
