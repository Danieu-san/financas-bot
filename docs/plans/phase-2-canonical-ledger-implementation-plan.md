# Phase 2 Canonical Ledger Implementation Plan

Status: local implementation ready for verification, production canary not enabled.
Date: 2026-06-25

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
