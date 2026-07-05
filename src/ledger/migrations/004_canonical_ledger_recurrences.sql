CREATE TABLE IF NOT EXISTS canonical_ledger_recurrence_rules (
    run_id TEXT NOT NULL,
    recurrence_rule_id TEXT NOT NULL,
    household_id TEXT,
    owner_person_id TEXT,
    source_type TEXT NOT NULL,
    source_row_ref TEXT,
    rule_type TEXT NOT NULL,
    status TEXT NOT NULL,
    description TEXT,
    frequency TEXT NOT NULL,
    start_on TEXT,
    end_on TEXT,
    due_day INTEGER,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    category TEXT,
    subcategory TEXT,
    rule_json TEXT NOT NULL,
    PRIMARY KEY (run_id, recurrence_rule_id),
    FOREIGN KEY (run_id) REFERENCES canonical_ledger_projection_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_ledger_recurrence_rules_source
    ON canonical_ledger_recurrence_rules(run_id, source_type, source_row_ref);

CREATE TABLE IF NOT EXISTS canonical_ledger_recurrence_occurrences (
    run_id TEXT NOT NULL,
    recurrence_occurrence_id TEXT NOT NULL,
    recurrence_rule_id TEXT NOT NULL,
    occurrence_event_id TEXT,
    settled_event_id TEXT,
    source_type TEXT NOT NULL,
    source_row_ref TEXT,
    competence_month TEXT NOT NULL,
    due_on TEXT,
    status TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    description TEXT,
    category TEXT,
    subcategory TEXT,
    occurrence_json TEXT NOT NULL,
    PRIMARY KEY (run_id, recurrence_occurrence_id),
    FOREIGN KEY (run_id, recurrence_rule_id) REFERENCES canonical_ledger_recurrence_rules(run_id, recurrence_rule_id) ON DELETE CASCADE,
    FOREIGN KEY (run_id, occurrence_event_id) REFERENCES canonical_ledger_events(run_id, event_id) ON DELETE SET NULL,
    FOREIGN KEY (run_id, settled_event_id) REFERENCES canonical_ledger_events(run_id, event_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_canonical_ledger_recurrence_occurrences_rule
    ON canonical_ledger_recurrence_occurrences(run_id, recurrence_rule_id, competence_month);

CREATE INDEX IF NOT EXISTS idx_canonical_ledger_recurrence_occurrences_due
    ON canonical_ledger_recurrence_occurrences(run_id, due_on, status);