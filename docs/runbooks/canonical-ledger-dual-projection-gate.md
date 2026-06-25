# Canonical Ledger Dual Projection Gate

Updated: 2026-06-24

## Decision

Phase 1 is complete as a local contract and shadow implementation.

Production shadow projection is `NO-GO` at the Phase 1 exit. The projector,
SQLite store and rollout policy are intentionally not connected to the
production message/write path. Phase 2 must first implement one small adapter
from verified transaction receipts, add parity telemetry and repeat the gate.

This decision does not disable or change the accepted baseline:

- `FINANCIAL_AGENT_MODE=answer`;
- `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`;
- `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`;
- `INTERPRETATION_RELIABILITY_MODE=shadow`.

## Rollout Flags

All ledger rollout flags fail closed.

| Flag | Safe default | Purpose |
|---|---|---|
| `CANONICAL_LEDGER_PROJECTION_MODE` | `off` | Accepts only `off` or `shadow`. Invalid values become `off`. |
| `CANONICAL_LEDGER_SHADOW_WRITE_ENABLED` | `false` | Explicit consent to persist a shadow projection. |
| `CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED` | `false` | Separate manual approval required for shadow writes when `NODE_ENV=production`. |
| `CANONICAL_LEDGER_CANARY_READ_ENABLED` | `false` | Master switch for canonical read canaries. |
| `CANONICAL_LEDGER_CANARY_READ_APPROVED` | `false` | Separate manual approval required for canary reads in production. |
| `CANONICAL_LEDGER_CANARY_READ_DOMAINS` | empty | Comma-separated allowlist of known read domains. |

`src/ledger/canonicalLedgerRolloutPolicy.js` is the executable contract for
these rules. It is not a production integration by itself.
Canary reads are allowed only while an authorized shadow projection is active;
read approval alone is insufficient.

## Canary Order

Phase 2 may introduce read canaries one domain at a time:

1. `transactions`: unit expense/income events, dates, status and amount.
2. `accounts`: account identity and opening/current balance projections.
3. `transfers`: paired movements with neutral income/expense impact.

Later phases may use `bills`, `cards`, `debts` and `goals` only after their own
fixtures, parity evidence and acceptance gate exist.

Broad dashboard totals, free-budget totals and Financial Agent answers must not
switch to canonical reads as a single global canary.

## Gate To Production Shadow

Production shadow projection remains blocked until all items are true:

- a receipt adapter projects only already-verified committed writes;
- retries reuse the original idempotency key and do not duplicate events;
- focused and full tests pass;
- dry-run parity has zero unexplained differences for the selected domain;
- public projection privacy scan passes;
- backup and restore are tested with the production-compatible database path;
- storage growth, retention and failure telemetry are defined;
- shadow projection failure cannot fail the legacy committed write;
- rollback drill is completed without deleting the shadow database;
- a new explicit altissima-capacity review records `GO`.

## Gate To Canary Reads

Canary reads require:

- production shadow projection already accepted and observed;
- at least one complete parity window for the selected domain;
- domain-specific counts, totals, dates and statuses match the legacy source;
- zero cross-user scope leak;
- deterministic fallback to the legacy read path;
- one domain in the allowlist for the first canary;
- Daniel canary before Thais and family scope;
- separate explicit approval through the canary flags.

## Rollback

Set:

```text
CANONICAL_LEDGER_PROJECTION_MODE=off
CANONICAL_LEDGER_SHADOW_WRITE_ENABLED=false
CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED=false
CANONICAL_LEDGER_CANARY_READ_ENABLED=false
CANONICAL_LEDGER_CANARY_READ_APPROVED=false
CANONICAL_LEDGER_CANARY_READ_DOMAINS=
```

Then restart the process and verify the legacy read/write path, PM2, WhatsApp,
health, logs and `state_store.json`.

Do not delete the shadow database during rollback. Preserve it for audit and
parity diagnosis. Restore is used only for corruption or disaster recovery, not
as the normal flag rollback.

## Backup, Retention And Privacy

- Local Phase 1 artifacts use synthetic fixtures and may be regenerated.
- A production-compatible shadow database must be backed up before migrations.
- Keep at least one pre-migration backup and the most recent verified restore
  point until the domain finishes its canary window.
- Retention beyond the canary window requires a separate operational decision;
  do not accumulate indefinite copies of financial data.
- Backups and database files must stay outside Git and must not be printed in
  logs or responses.
- Public projections must remain free of raw phone numbers, WhatsApp IDs,
  OAuth identifiers, spreadsheet IDs, tokens, prompts and raw source rows.
