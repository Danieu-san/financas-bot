# Phase 1 Canonical Ledger Implementation Plan

Updated: 2026-06-24

## Scope

Phase 1 opens the canonical ledger work without changing production writes,
production schema or dashboard behavior. The goal is to finish the contract,
fixtures, red tests, dry-run projection and restore evidence needed before Phase
2 can implement the first vertical slice.

## Guardrails

- Keep `INTERPRETATION_RELIABILITY_MODE=shadow`.
- Preserve the active read-only baseline:
  `FINANCIAL_AGENT_MODE=answer`,
  `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true` and
  `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`.
- Keep Family Mode off until Daniel/Thais allowlist is validated.
- Keep budget/category production rollout separate from this phase.
- Do not start dashboard v2, Open Finance, OCR/PDF or new import formats.
- Do not let Gemini calculate ledger values or select write-critical fields.
- Do not turn off the Gemini Planner as part of Phase 1; only prevent ungated
  expansion to new write, admin or migration surfaces.
- Do not expose internal IDs in public projections.

## Work Packets

### P1.1 - Contract and fixtures

Status: initial green slice on 2026-06-24.

- Finalize ADR-006 and `docs/specs/canonical-financial-ledger.md`.
- Add anonymized fixture files under `tests/fixtures/ledger/`.
- Add red tests for event identity, dates, statuses, invoices, bills,
  transfers, categories and public projection privacy.
- Current output: RED was confirmed with missing projector, then the first
  fixture/test slice was made green.

### P1.2 - Pure projector

Status: initial green slice on 2026-06-24.

- Implement a pure in-memory projector from legacy row objects to canonical
  event objects.
- No SQLite writes and no Google writes.
- Produce stable IDs and source hashes.
- Current output: `node --test tests\canonicalLedgerProjector.test.js` passes
  6/6 for the first anonymized fixture.

### P1.3 - Dry-run parity report

Status: initial green slice on 2026-06-24.

- Add a local dry-run script that reads current safe test fixtures or sanitized
  sample rows and emits:
  - source counts;
  - canonical event counts;
  - total by kind/status/competence;
  - unexplained differences;
  - privacy scan result.
- Current output: `node scripts\runCanonicalLedgerDryRun.js --run-id LEDGER_DRY_RUN_PHASE1_20260624`
  wrote `data/qa-runs/LEDGER_DRY_RUN_PHASE1_20260624/canonical-ledger-dry-run-report.json`.
  The report was later refreshed after fixture expansion and now has 15 events,
  0 unexplained differences and `privacy_ok=true`.

Additional fixture coverage added on 2026-06-24:

- debt opening and debt payment, with principal not becoming expense;
- goal opening and withdrawal, neutral for income/expense;
- reimbursement linked to the original expense;
- imported transaction matched to a manual launch without duplicating spend.

### P1.4 - SQLite shadow schema

Status: initial green slice on 2026-06-24.

- Add versioned local migrations for shadow tables.
- Keep write path off by default.
- Add backup/restore proof for the local shadow database.
- Current output: `src/ledger/migrations/001_canonical_ledger_shadow.sql`
  creates the local shadow schema for projection runs, events, lines, schedules,
  reconciliation links, public projection and audit log. `CanonicalLedgerShadowStore`
  keeps writes disabled unless explicitly constructed with `writesEnabled: true`.
  `node --test tests\canonicalLedgerShadowStore.test.js` proves migrations,
  disabled default writes, opt-in persistence and SQLite backup/restore.
- Optional dry-run persistence is available only with explicit opt-in:
  `node scripts\runCanonicalLedgerDryRun.js --run-id LEDGER_DRY_RUN_PHASE1_20260624 --write-shadow --shadow-db data/canonical_ledger_shadow.sqlite`.

### P1.5 - Dual projection design gate

Status: complete locally on 2026-06-24.

- Define the exact flags and rollback for dual projection.
- Define canary read domains for Phase 2.
- Decide whether production can receive shadow projection.
- Current output: `src/ledger/canonicalLedgerRolloutPolicy.js` and
  `tests/canonicalLedgerRolloutPolicy.test.js` define fail-closed flags,
  production approvals, domain allowlists and the rollback environment.
- Runbook: `docs/runbooks/canonical-ledger-dual-projection-gate.md`.
- Decision: `NO-GO` for production shadow projection at the Phase 1 exit.
  Phase 2 must first add a verified-receipt adapter, parity telemetry and a new
  explicit gate. No production deploy is part of Phase 1.

## Verification Matrix

- Focused ledger tests after each packet.
- `npm test` before declaring any packet complete.
- `npm audit --audit-level=high` before production-facing work.
- `git diff --check` after documentation and code edits.
- NUL scan before handoff.
- `state_store.json` must remain `{}` unless a test intentionally writes and
  cleans it.

## Completion Gate

Phase 1 is complete only after:

- contract and fixtures are accepted;
- pure projection passes fixture tests;
- dry-run parity report explains differences;
- backup/restore proof exists;
- no production write/schema behavior changed unexpectedly;
- next Phase 2 vertical slice is small enough to implement with TDD.

## Completion Record

Phase 1 completed locally on 2026-06-24. The accepted outputs are:

- canonical contract, ADR and anonymized fixtures;
- deterministic pure projector and public projection;
- dry-run parity report with 15 events, zero unexplained differences and
  `privacy_ok=true`;
- versioned SQLite shadow schema with opt-in writes and tested backup/restore;
- executable fail-closed rollout policy;
- documented `NO-GO` for production shadow projection;
- Phase 2 first slice constrained to verified unit transaction receipts, with
  `transactions` as the first possible read canary after a later gate.
