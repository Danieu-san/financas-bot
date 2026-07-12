CREATE TABLE IF NOT EXISTS canonical_ledger_statement_reconciliation_links (
    link_id TEXT PRIMARY KEY,
    operation_key_hash TEXT NOT NULL,
    actor_hash TEXT NOT NULL,
    source_file_hash TEXT NOT NULL,
    transaction_hash TEXT NOT NULL,
    matched_source_hash TEXT,
    decision_status TEXT NOT NULL CHECK(decision_status IN ('matched', 'new', 'possible_duplicate', 'uncertain')),
    decision_rule TEXT NOT NULL,
    confirmed_at TEXT NOT NULL,
    link_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_statement_reconciliation_status
    ON canonical_ledger_statement_reconciliation_links(decision_status, confirmed_at);

CREATE INDEX IF NOT EXISTS idx_statement_reconciliation_transaction
    ON canonical_ledger_statement_reconciliation_links(transaction_hash);
