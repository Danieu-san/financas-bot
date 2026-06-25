# ADR-006: Canonical Family Financial Ledger

## Status

Accepted; Phase 1 local implementation complete, production shadow not approved

## Date

2026-06-24

## Context

The current FinancasBot production baseline already has the read-only Financial
Agent in `answer`, Gemini planner enabled, contextual analyst in `answer`, and
Interpretation Reliability kept intentionally in `shadow` for financial writes.
Phase 1 preserves this active baseline. It does not require turning the Gemini
planner off; it only forbids expanding its scope without evidence, tests and
flag rollback.
The next product step is not another phrase fix. It is a domain contract that can
support accounts, due dates, competences, invoices, recurring bills, budgets,
family scope, reconciliation and future dashboard work without duplicating
financial meaning across tabs.

The current Google Sheets structure is valuable as a user-readable surface, but
it is not a complete source of truth for the next family finance model. It mixes
domain concepts that must become explicit:

- event date, effective date, competence and due date;
- expected, settled, cancelled and uncertain statuses;
- card purchase, invoice payment and cash movement;
- recurring rule, expected occurrence and paid transaction;
- internal transfer and net income/expense;
- source row, import item, manual command and reconciliation link.

ADR-004 keeps the read-only agent behind deterministic tools and a verifier.
The ledger must follow the same principle: LLMs may help classify or ask for
clarification, but they do not calculate final balances or silently decide
critical write fields.

## Decision

Create a canonical family financial ledger as the internal source-of-truth
contract. It will be introduced in stages:

```text
shadow contract
-> shadow projection from existing Sheets/read-model data
-> dual projection
-> canary reads by domain
-> canonical writes behind explicit flags
-> Sheets mirror/export
```

No production schema, write path or dashboard behavior changes are authorized by
this ADR alone. The first implementation step is contract, fixtures and red
tests. The ledger may be implemented locally with SQLite and versioned
migrations only after the v1 contract is covered by tests.

The canonical model uses these concepts:

- `households`: family container and scope boundary.
- `people`: approved family members or legacy owners.
- `ledger_accounts`: cash, bank, wallet, reserve and liability accounts.
- `ledger_cards`: card metadata, closing day, due day and paying account.
- `ledger_categories`: category/subcategory with status and confidence.
- `ledger_events`: one economic event with stable identity, status and dates.
- `ledger_event_lines`: account/card/category effects for the event.
- `ledger_schedules`: recurrence, installment and future expected rules.
- `ledger_reconciliation_links`: links between canonical events and source rows,
  imports, statements, invoices and manual corrections.
- `ledger_audit_log`: sanitized lifecycle trail for corrections and migrations.

Every canonical event must carry:

- stable `event_id`;
- `household_id`, `owner_person_id`, `actor_person_id` when known and allowed;
- `kind`;
- `status`;
- `currency` and integer `amount_cents`;
- `occurred_on`, `effective_on`, `competence_month` and optional `due_on`;
- source metadata: `source_type`, `source_id_hash`, `source_row_hash`;
- idempotency key;
- category/subcategory when applicable;
- account/card/invoice/schedule links when applicable;
- creation/update timestamps.

`competence_month` is stored as `YYYY-MM` in the canonical ledger. Existing
application contracts that use zero-based JavaScript months keep their own
adapter translation at the boundary.

## Required Invariants

- One economic movement is counted once in financial analysis.
- Internal transfers are neutral for income/expense and net worth changes only
  by account movement.
- Card purchases affect spending in their competence, while invoice payment
  settles a liability and must not create a second free expense.
- Recurring bills are rules plus occurrences; they are not pre-created duplicate
  transactions without provenance.
- Expected bills and paid bills are linked, not counted as two expenses.
- Reimbursements and chargebacks link to the original event and reduce the right
  category/competence.
- Goal/reserve movements change availability or plan allocation, not income.
- Debt payments reduce debt balance and cash, and only interest/fees can be
  classified as expense when represented explicitly.
- Corrections never overwrite history without an audit record.
- Every projection from a legacy row must be idempotent and reversible by source
  hash.

## Rollout Rules

The first ledger work is allowed only in shadow:

- `INTERPRETATION_RELIABILITY_MODE` remains `shadow` until a later explicit
  decision.
- `FINANCIAL_AGENT_MODE=answer`, `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true` and
  `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer` remain the accepted baseline from
  Phase 0; do not expand them to new surfaces without a separate gate.
- Family Mode remains off until Daniel/Thais allowlist is validated.
- The budget/category package remains outside the production baseline until its
  own release, smoke and rollback.
- Dashboard v2, Open Finance, OCR/PDF and new import formats wait for the ledger
  contract and parity reports.
- The read-only Financial Agent can query public projections only after the
  ledger projection has the same safety level as `financial_events_public`.

## Alternatives Considered

### Keep Google Sheets as the only source of truth

This is simple and user-readable, but keeps financial concepts spread across
tabs and makes reconciliation, invoices, due dates and family analytics fragile.
Rejected as the final architecture.

### Switch production directly to SQLite

This reduces modeling friction, but creates unnecessary migration risk before
fixtures, dry-run reports and backup/restore are proven. Rejected for Phase 1.

### Full double-entry accounting system

This is precise, but too heavy for the product and for WhatsApp-first family
finance. The accepted model borrows event lines and reconciliation without
turning the product into a full accounting ledger.

### Let Gemini normalize financial events dynamically

This would be fast to prototype, but violates the existing safety model. Gemini
can assist in classification and clarification, never own the ledger contract or
final arithmetic. Rejected.

## Consequences

- Future features must map to canonical events before they reach production.
- Existing Sheets/read-model behavior remains the compatibility layer during
  migration.
- Tests and fixtures become the gate for every domain transition.
- Production rollback remains flag-based until canonical writes are approved.
- Some short-term work is documentation and test infrastructure before visible
  product changes, but it prevents a second legacy domain from forming.

## Exit Gate For Phase 1

Phase 1 is complete only when:

- the v1 schema/spec is approved;
- fixtures cover the required invariants;
- red tests exist for projection and reconciliation;
- backup and restore strategy is documented and tested locally;
- dry-run migration reports explain every difference between Sheets, read-model
  and ledger projection;
- no unexplained production-facing schema or write change has been introduced.

The gate was closed locally on 2026-06-24. The rollout contract and the
`NO-GO` production decision are recorded in
`docs/runbooks/canonical-ledger-dual-projection-gate.md`. This completion
authorizes Phase 2 TDD work, not a production ledger deploy.
