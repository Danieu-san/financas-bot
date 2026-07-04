# Phase 2 Exit Gate - Accounts, Dates and Status

Date: 2026-07-04
Decision: GO

## Roadmap position

General roadmap phase: Phase 2 - Accounts, dates and status.
Exit gate from the roadmap: balances and movements match across ledger, Sheets, read-model and dashboard; marker-only E2E is clean and idempotent.

## Evidence consolidated

- Real financial accounts exist in `Contas Financeiras` with explicit opening balances.
- Canonical `accounts` canary is active only as an approved read domain together with `transactions` and `transfers`.
- Current account balances use opening balance plus settled movements; pending and cancelled transfers do not affect current balance.
- Unit expenses and income outside credit capture explicit financial account before writing `Conta Financeira`.
- Unit transfers capture explicit origin and destination financial accounts, forbid same-account destination and preserve pending/settled status.
- WhatsApp account-balance reads route through verified canonical `accounts` and preserve card/fatura guards.
- SQLite read-model and dashboard now expose sanitized `financialAccounts` with account movement parity.

## Production evidence

- Account-balance WhatsApp smoke passed with exact expected values for Daniel total, caixinha, Daniel - Nubank, Thais - Itau and Nubank Thais card guard.
- Cross-surface parity deploy `ee8fe2d` passed remote focused tests 203/203.
- EC2 marker-only account-movement gate `TESTE_APAGAR_ACCOUNT_MOVEMENTS_202607041656` returned `decision=GO`, privacy OK and cleanup zero.
- Production dashboard/read-model validation rebuilt with the production `.env` and returned 4 sanitized accounts, total R$ 1.661,22 and no internal identifier leaks.
- PM2, WhatsApp, dashboard health and `state_store.json` were healthy after the gate.

## Flags

Preserved:

- `FINANCIAL_AGENT_MODE=answer`
- `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`
- `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`
- `FINANCIAL_COMMAND_PLANNER_MODE=canary`
- `INTERPRETATION_RELIABILITY_MODE=shadow`
- `CANONICAL_LEDGER_CANARY_READ_DOMAINS=transactions,transfers,accounts`

## Decision

Phase 2 exit gate is GO. This authorizes opening Phase 3. It does not authorize legacy removal, which remains Phase 8, and does not change the preserved flags.
