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

test('9P.1 terminal journal is authenticated, monotonic and sanitized', () => {
    const journal = new OpenFinanceRevocationJournal({ secret });
    const entry = {
        proposal_ref: 'a'.repeat(32),
        terminal_state: 'accepted',
        confirmation_ref_hash: 'b'.repeat(32),
        confirmation_actor_ref: 'c'.repeat(32),
        confirmation_ready_at: '2026-07-23T12:00:00.000Z',
        confirmation_expires_at: '2026-07-23T13:00:00.000Z',
        confirmation_decided_at: '2026-07-23T12:05:00.000Z',
        resolved_by_ref: null
    };
    try {
        assert.deepEqual(journal.recordSaveProposalTerminal(entry), {
            recorded: true,
            replay: false,
            terminal_state: 'accepted',
            financial_writes: 0
        });
        assert.equal(journal.recordSaveProposalTerminal(entry).replay, true);
        assert.deepEqual(journal.getSaveProposalTerminal(entry.proposal_ref), entry);
        assert.throws(() => journal.recordSaveProposalTerminal({
            ...entry,
            terminal_state: 'declined'
        }), /save_proposal_terminal_journal_conflict/);
        journal.db.prepare(`UPDATE open_finance_save_proposal_terminal_journal
            SET terminal_state='declined' WHERE proposal_ref=?`).run(entry.proposal_ref);
        assert.throws(() => journal.listSaveProposalTerminals(),
            /save_proposal_terminal_journal_metadata_mismatch/);
    } finally {
        journal.close();
    }
});
