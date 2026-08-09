'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { main } = require('../scripts/runOpenFinanceHistoricalLocalReview');

const ENV = {
    OPEN_FINANCE_HISTORICAL_AMBIGUITY_REVIEW_SECRET: 'cli-local-review-secret-with-more-than-32-characters',
    OPEN_FINANCE_HISTORICAL_LOCAL_REVIEWER_ID: 'local-reviewer'
};

class StoreStub {
    constructor(options) {
        StoreStub.options = options;
    }
    prepare(input) {
        StoreStub.input = input;
        return { state: 'pending', pending_count: 3, financial_writes: 0 };
    }
    writeLocalReviewHtml(input) {
        StoreStub.input = input;
        return { state: 'pending', pending_count: 3, group_count: 2, financial_writes: 0 };
    }
    applyLocalDecision(input) {
        StoreStub.input = input;
        return { state: 'pending', pending_count: 1, applied_count: 2, financial_writes: 0 };
    }
    close() {}
}

function capture() {
    let value = '';
    return { stream: { write(chunk) { value += chunk; } }, read: () => value };
}

test('CLI requires explicit confirmation and emits only sanitized counts', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'historical-local-cli-'));
    try {
        const sealed = path.join(directory, 'sealed.txt');
        const database = path.join(directory, 'review.sqlite');
        const expected = path.join(directory, 'expected.json');
        fs.writeFileSync(sealed, 'sealed-private-payload', { mode: 0o600 });
        fs.writeFileSync(expected, JSON.stringify(['a'.repeat(32), 'b'.repeat(32)]), { mode: 0o600 });

        assert.throws(() => main(['prepare', '--database', database,
            '--sealed-state-file', sealed], { env: ENV, StoreClass: StoreStub }),
        /explicit_confirmation_required/);

        const preparedOutput = capture();
        assert.equal(main(['prepare', '--database', database, '--sealed-state-file', sealed,
            '--confirm-private-local-review'], {
            env: ENV, StoreClass: StoreStub, stdout: preparedOutput.stream
        }), 0);
        assert.equal(StoreStub.options.reviewChannel, 'local_private');
        assert.deepStrictEqual(StoreStub.options.authorizedLocalReviewerIds, ['local-reviewer']);
        assert.equal(StoreStub.input.sealedState, 'sealed-private-payload');
        assert.doesNotMatch(preparedOutput.read(), /sealed-private|local-reviewer|secret/);

        fs.writeFileSync(database, 'stub');
        const decidedOutput = capture();
        assert.equal(main(['decide', '--database', database, '--group-ref', 'c'.repeat(32),
            '--scope', 'equivalent', '--expected-items-file', expected,
            '--resolution-code', 'reserve_application', '--confirm-exact-set'], {
            env: ENV, StoreClass: StoreStub, stdout: decidedOutput.stream
        }), 0);
        assert.deepStrictEqual(StoreStub.input.expectedItemRefs, ['a'.repeat(32), 'b'.repeat(32)]);
        assert.match(decidedOutput.read(), /"applied_count":2/);
        assert.doesNotMatch(decidedOutput.read(), /reserve_application|cccccccc/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('CLI refuses private artifacts inside the repository', () => {
    const repositoryPath = path.resolve(__dirname, 'forbidden.sqlite');
    assert.throws(() => main(['prepare', '--database', repositoryPath,
        '--sealed-state-file', repositoryPath, '--confirm-private-local-review'], {
        env: ENV, StoreClass: StoreStub
    }), /path_must_be_outside_repository/);
});
