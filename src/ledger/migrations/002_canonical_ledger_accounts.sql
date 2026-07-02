CREATE TABLE IF NOT EXISTS canonical_ledger_accounts (
    run_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    household_id TEXT,
    owner_person_id TEXT,
    account_type TEXT NOT NULL,
    name TEXT NOT NULL,
    currency TEXT NOT NULL,
    opening_balance_cents INTEGER NOT NULL,
    opened_on TEXT,
    status TEXT NOT NULL,
    account_json TEXT NOT NULL,
    PRIMARY KEY (run_id, account_id),
    FOREIGN KEY (run_id) REFERENCES canonical_ledger_projection_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_ledger_accounts_owner
    ON canonical_ledger_accounts(run_id, owner_person_id);
