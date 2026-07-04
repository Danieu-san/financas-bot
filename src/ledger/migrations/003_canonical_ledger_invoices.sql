CREATE TABLE IF NOT EXISTS canonical_ledger_invoices (
    run_id TEXT NOT NULL,
    invoice_id TEXT NOT NULL,
    household_id TEXT,
    owner_person_id TEXT,
    card_key TEXT NOT NULL,
    card_name TEXT,
    competence_month TEXT NOT NULL,
    due_on TEXT,
    currency TEXT NOT NULL,
    invoice_json TEXT NOT NULL,
    PRIMARY KEY (run_id, invoice_id),
    FOREIGN KEY (run_id) REFERENCES canonical_ledger_projection_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_ledger_invoices_identity
    ON canonical_ledger_invoices(invoice_id, competence_month, card_key);

CREATE TABLE IF NOT EXISTS canonical_ledger_invoice_items (
    run_id TEXT NOT NULL,
    invoice_item_id TEXT NOT NULL,
    invoice_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    item_json TEXT NOT NULL,
    PRIMARY KEY (run_id, invoice_item_id),
    FOREIGN KEY (run_id, invoice_id) REFERENCES canonical_ledger_invoices(run_id, invoice_id) ON DELETE CASCADE,
    FOREIGN KEY (run_id, event_id) REFERENCES canonical_ledger_events(run_id, event_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_ledger_invoice_items_invoice
    ON canonical_ledger_invoice_items(invoice_id, event_id);

CREATE TABLE IF NOT EXISTS canonical_ledger_invoice_payments (
    run_id TEXT NOT NULL,
    invoice_payment_id TEXT NOT NULL,
    invoice_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    payment_json TEXT NOT NULL,
    PRIMARY KEY (run_id, invoice_payment_id),
    FOREIGN KEY (run_id, invoice_id) REFERENCES canonical_ledger_invoices(run_id, invoice_id) ON DELETE CASCADE,
    FOREIGN KEY (run_id, event_id) REFERENCES canonical_ledger_events(run_id, event_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_ledger_invoice_payments_invoice
    ON canonical_ledger_invoice_payments(invoice_id, event_id);
