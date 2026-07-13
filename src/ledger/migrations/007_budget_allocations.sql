CREATE TABLE canonical_budget_allocations (
    allocation_id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('family', 'personal')),
    scope_id TEXT NOT NULL,
    cycle_start TEXT NOT NULL,
    cycle_end TEXT NOT NULL,
    category_key TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory_key TEXT NOT NULL DEFAULT '',
    subcategory TEXT NOT NULL DEFAULT '',
    planned_amount_cents INTEGER NOT NULL CHECK (planned_amount_cents >= 0),
    status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (cycle_start <= cycle_end),
    UNIQUE (
        household_id,
        scope_type,
        scope_id,
        cycle_start,
        category_key,
        subcategory_key
    )
);

CREATE INDEX idx_budget_allocations_scope_cycle
    ON canonical_budget_allocations (
        household_id,
        scope_type,
        scope_id,
        cycle_start,
        cycle_end,
        status
    );
