# Canonical Ledger Shadow Audit - 2026-06-30

## Scope

Sanitized production audit for Step 8 of the unified command planner and
canonical ledger rollout. No raw descriptions, phone numbers, spreadsheet IDs,
tokens or row payloads were printed.

## Evidence

- EC2 synchronized to `f998ff7`.
- Focused ledger suite before the audit: 33/33 passing.
- Canonical ledger dry-run `LEDGER_PHASE2_RESUME_20260630`: 15 events, 0
  unexplained differences, `privacy_ok=true`.
- Production flags preserved:
  - `FINANCIAL_AGENT_MODE=answer`;
  - `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`;
  - `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`;
  - `INTERPRETATION_RELIABILITY_MODE=shadow`;
  - `CANONICAL_LEDGER_PROJECTION_MODE=shadow`;
  - `CANONICAL_LEDGER_SHADOW_WRITE_ENABLED=true`;
  - `CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED=true`;
  - `CANONICAL_LEDGER_CANARY_READ_ENABLED=false`.

## Shadow Database Audit

Initial aggregate counts:

- projection runs: 6;
- events: 4;
- public projection rows: 4;
- event lines: 8.

The 4 events were all marker-only test residue:

- 3 retained explicit `TESTE_APAGAR` markers;
- 1 was the planner-write expense test whose final description had been
  intentionally sanitized to `mercado`.

A backup was created before cleanup:

- `data/backups/canonical_ledger_shadow.pre-marker-cleanup-2026-06-30T03-38-54-994Z.sqlite`.

Post-cleanup aggregate counts:

- projection runs: 2;
- events: 0;
- public projection rows: 0;
- event lines: 0;
- marker counts: 0.

## Decision

`NO-GO` for enabling canonical read canary today. The database is clean, but
there is no non-marker production parity window to compare yet.

Next gate:

1. Keep shadow writes enabled.
2. Observe real eligible receipts from normal Daniel/Thais usage.
3. Compare Sheets, canonical ledger, read-model and dashboard for
   `transactions`.
4. Only then consider `CANONICAL_LEDGER_CANARY_READ_ENABLED=true` with
   `CANONICAL_LEDGER_CANARY_READ_DOMAINS=transactions`.

## Follow-up Implementation

Local code now includes the first real `transactions` read canary consumer:
Financial Agent `list_recent_transactions`. The integration is guarded by the
canonical ledger read flags and falls back to the legacy read-model when the
canonical source is unavailable, empty or does not match the requested event type.

This does not change the production decision above: keep the read canary disabled
until non-marker shadow parity exists.