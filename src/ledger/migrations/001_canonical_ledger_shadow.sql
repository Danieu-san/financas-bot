CREATE TABLE IF NOT EXISTS canonical_ledger_projection_runs (
    run_id TEXT PRIMARY KEY,
    report_type TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    synthetic_fixture_only INTEGER NOT NULL CHECK(synthetic_fixture_only IN (0, 1)),
    report_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_ledger_events (
    run_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    household_id TEXT,
    owner_person_id TEXT,
    actor_person_id TEXT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    description TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    occurred_on TEXT,
    effective_on TEXT,
    competence_month TEXT,
    due_on TEXT,
    category TEXT,
    subcategory TEXT,
    category_status TEXT,
    free_budget_eligible INTEGER NOT NULL CHECK(free_budget_eligible IN (0, 1)),
    net_income_expense_impact INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    source_row_ref TEXT,
    source_id_hash TEXT NOT NULL,
    source_row_hash TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    event_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (run_id, event_id),
    FOREIGN KEY (run_id) REFERENCES canonical_ledger_projection_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_ledger_events_kind
    ON canonical_ledger_events(run_id, kind);
CREATE INDEX IF NOT EXISTS idx_canonical_ledger_events_competence
    ON canonical_ledger_events(run_id, competence_month);
CREATE INDEX IF NOT EXISTS idx_canonical_ledger_events_source
    ON canonical_ledger_events(run_id, source_type, source_id_hash);

CREATE TABLE IF NOT EXISTS canonical_ledger_event_lines (
    run_id TEXT NOT NULL,
    line_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    line_type TEXT NOT NULL,
    account_id TEXT,
    category_id TEXT,
    related_event_id TEXT,
    direction TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    metadata_hash TEXT NOT NULL,
    line_json TEXT NOT NULL,
    PRIMARY KEY (run_id, line_id),
    FOREIGN KEY (run_id, event_id) REFERENCES canonical_ledger_events(run_id, event_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_ledger_lines_event
    ON canonical_ledger_event_lines(run_id, event_id);

CREATE TABLE IF NOT EXISTS canonical_ledger_schedules (
    run_id TEXT NOT NULL,
    schedule_id TEXT NOT NULL,
    household_id TEXT,
    owner_person_id TEXT,
    schedule_type TEXT NOT NULL,
    status TEXT NOT NULL,
    start_on TEXT,
    end_on TEXT,
    frequency TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    next_due_on TEXT,
    source_id_hash TEXT,
    schedule_json TEXT NOT NULL,
    PRIMARY KEY (run_id, schedule_id),
    FOREIGN KEY (run_id) REFERENCES canonical_ledger_projection_runs(run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS canonical_ledger_reconciliation_links (
    run_id TEXT NOT NULL,
    link_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    link_type TEXT NOT NULL,
    related_event_id TEXT,
    external_hash TEXT NOT NULL,
    confidence TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    link_json TEXT NOT NULL,
    PRIMARY KEY (run_id, link_id),
    FOREIGN KEY (run_id, event_id) REFERENCES canonical_ledger_events(run_id, event_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_ledger_links_event
    ON canonical_ledger_reconciliation_links(run_id, event_id);

CREATE TABLE IF NOT EXISTS canonical_ledger_public_projection (
    run_id TEXT NOT NULL,
    row_index INTEGER NOT NULL,
    date TEXT,
    effective_on TEXT,
    competence_month TEXT,
    due_on TEXT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    description TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    category TEXT,
    subcategory TEXT,
    category_status TEXT,
    responsible TEXT,
    source TEXT,
    free_budget_eligible INTEGER NOT NULL CHECK(free_budget_eligible IN (0, 1)),
    row_json TEXT NOT NULL,
    PRIMARY KEY (run_id, row_index),
    FOREIGN KEY (run_id) REFERENCES canonical_ledger_projection_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_ledger_public_projection_kind
    ON canonical_ledger_public_projection(run_id, kind);

CREATE TABLE IF NOT EXISTS canonical_ledger_audit_log (
    audit_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    action TEXT NOT NULL,
    detail_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES canonical_ledger_projection_runs(run_id) ON DELETE CASCADE
);
