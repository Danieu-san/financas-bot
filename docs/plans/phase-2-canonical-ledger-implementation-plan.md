# Phase 2 Canonical Ledger Implementation Plan

Status: production shadow writes enabled; production read canary not enabled.
Date: 2026-06-30

## Baseline To Preserve

- `FINANCIAL_AGENT_MODE=answer`.
- `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`.
- `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`.
- `INTERPRETATION_RELIABILITY_MODE=shadow`.

The Gemini planner remains a read-only planning fallback. It must not write ledger data, create categories, or bypass confirmation/reliability gates.

## Scope

Phase 2 connects the Phase 1 canonical ledger to already-committed financial receipts, still behind closed rollout flags.

Implemented surfaces:

- receipt adapter for committed appends in `Saídas`, `Entradas` and `Transferências`;
- registered bill payments such as phone bills use `Contas` as context and stay out of free budget spending;
- post-commit shadow projection hook in `appendRowToSheet`;
- idempotent persistence by `operationKey`;
- canary read domains for `transactions`, `accounts` and `transfers`;
- legacy fallback router for canary reads;
- tests in the default local suite.

Out of scope for this phase:

- statement import receipts;
- category creation writes;
- production read replacement;
- enabling canonical projection or canary reads by default.

## Rollout Flags

Shadow writes stay disabled unless all required flags allow them:

- `CANONICAL_LEDGER_PROJECTION_MODE=shadow`;
- `CANONICAL_LEDGER_SHADOW_WRITE_ENABLED=true`;
- in production only: `CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED=true`.

Canary reads stay disabled unless:

- shadow projection is authorized;
- `CANONICAL_LEDGER_CANARY_READ_ENABLED=true`;
- `CANONICAL_LEDGER_CANARY_READ_DOMAINS` includes only allowed domains;
- in production only: `CANONICAL_LEDGER_CANARY_READ_APPROVED=true`.

Rollback is flag-only: disable projection and canary reads without deleting the shadow SQLite database.

## Gate

Before any production enablement:

1. Run focused ledger tests including receipt and canary router.
2. Run `npm test`.
3. Run `npm audit --audit-level=high`.
4. Run `git diff --check`.
5. Scan for NUL bytes.
6. Confirm `state_store.json` remains `{}` or intentionally clean.
7. Confirm EC2 baseline still preserves answer mode, Gemini planner and contextual analyst flags.

If any gate fails, keep production canonical ledger flags off.

## Production Shadow Audit - 2026-06-30

Production already has the shadow writer enabled behind the approved flags, but
read canaries remain disabled.

The Step 8 resumption audit found that the shadow database only contained
marker-only planner-write test residue. A backup was created before cleanup, and
the marker-only runs were removed without touching Sheets, read-model, `.env` or
PM2. The post-cleanup shadow state is:

- `canonical_ledger_events=0`;
- `canonical_ledger_public_projection=0`;
- marker counts in events and public projection: `0`;
- remote `state_store.json`: `{}`.

Decision: `NO-GO` for enabling `CANONICAL_LEDGER_CANARY_READ_ENABLED=true` until
there is a real non-marker parity window. The next gate is to observe eligible
real receipts in shadow and compare Sheets, canonical ledger, read-model and
dashboard before opening the first read canary for `transactions`.

## Transactions Read Canary Integration - 2026-06-30

Financial Agent `list_recent_transactions` now has a real `transactions` read
canary integration behind the canonical ledger flags. When the canary domain is
approved and populated, the tool can read sanitized canonical rows. It falls back
to the legacy read-model when canonical reads are disabled, fail, return no rows,
or return no rows matching the requested event type.

This is deployment-safe while production keeps `CANONICAL_LEDGER_CANARY_READ_ENABLED=false`.
It still does not authorize enabling production read canary before the real
non-marker parity window described above.

## Partial Window Guard - 2026-07-01

The `transactions` canary reader now also falls back to the legacy read-model
when canonical rows are present but the filtered canonical window is smaller
than the requested `limit` and the legacy read-model has more matching rows.
This prevents a partially populated shadow ledger from truncating answers such
as recent transactions while Phase 2 is still accumulating coverage.

## Recurring Marker Guard - 2026-07-01

A marker-only parity run found a false canonical classification: an ordinary market expense could become `bill_payment` when a registered bill had a similar category/value. The projector now treats `Saidas` rows as bill payments only when the committed legacy row is explicitly marked recurring (`Recorrente=SIM` or equivalent). Non-recurring expenses remain `expense`, keep `free_budget_eligible=true`, and keep their normal net expense impact even when a `Contas` rule matches.

This keeps the production writer contract aligned with `bill.pay`, which writes recurring account payments with `Recorrente=SIM`. After deploy, repeat cleanup/parity before enabling any production read canary.

## Production Marker-Only Post-Fix Evidence - 2026-07-01

Commit `fd20b49` was deployed with canonical read canary still disabled. A production marker-only run validated the corrected receipt projection: ordinary market expense was projected as `expense` with `free_budget_eligible=true`, while the recurring phone bill row marked `Recorrente=SIM` was projected as `bill_payment` with `free_budget_eligible=false`. Invoice payment, reimbursement and Uber expense also projected to the expected kinds.

All marker-only Sheets rows and the five corresponding shadow runs were cleaned after verification, with SQLite backups created before deleting runs. This is a GO for the recurring marker fix itself, but still not a GO to enable production canary reads without the separate parity-window decision.