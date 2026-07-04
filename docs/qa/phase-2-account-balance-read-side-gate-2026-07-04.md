# Phase 2 Account Balance Read-Side Gate - 2026-07-04

## Roadmap position

- General roadmap: Phase 2 - Accounts, dates and status.
- Slice: read-side balance/account questions through FinancialQueryPlan and LangGraph.
- Out of scope: canonical writes, flag expansion, dashboard cutover and legacy removal.

## Implementation

- FinancialQueryPlan now accepts the `accounts` domain, account filters, account grouping, balance sorting and `current_state`.
- The Gemini planner prompt keeps the active planner and teaches it to use `accounts` for financial-account, caixinha and balance questions.
- LangGraph routes account-balance questions to the verified query tool, excludes card/invoice wording, preserves known household person names and composes deterministic BRL answers.
- The query tool reads only the canonical `accounts` canary, scopes by authorized person IDs and never falls back to the legacy read model for account balances.
- Specific account names prefer an exact normalized match; broad filters such as `caixinha` may still aggregate matching accounts.
- Missing accounts and disabled/unavailable canary reads fail closed.
- Public answers omit canonical IDs and other internal projection fields.
- Debt due-date formatting was also made deterministic from the injected data-source date after the full suite exposed wall-clock dependence.

## TDD evidence

RED cases reproduced:

1. the account-specific composer existed but the generic response path was used;
2. `Daniel Nubank` matched both the checking account and Nubank Caixinha;
3. a missing account was reported as a valid zero balance;
4. debt next-due formatting changed with the workstation date.

GREEN coverage verifies:

- Daniel - Nubank: R$ 262,85;
- Daniel - Nubank Caixinha: R$ 1.264,91;
- Thais - Nubank: R$ 0,00;
- Thais - Itau: R$ 133,46;
- total and named-account responses;
- disabled canary and unknown-account fail-closed behavior;
- card queries remain outside the account route;
- no internal identifiers in public results.

## Local verification

- Focused agent/read-model tests: 80/80.
- Full suite: 670/670.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: clean, with only Windows LF/CRLF notices.
- NUL scan: no matches.
- `state_store.json`: valid JSON; an unrelated pre-existing synthetic onboarding state was preserved.
- Syntax checks for changed JavaScript modules: passed.

## Decision

Local decision: GO to commit and deploy this read-side slice.

Production GO still requires remote focused tests, PM2/health/state/log checks and a manual WhatsApp smoke for total, caixinha, named Daniel account, named Thais account and card-route guard.

Flags must remain unchanged:

- `FINANCIAL_AGENT_MODE=answer`
- `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`
- `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`
- `FINANCIAL_COMMAND_PLANNER_MODE=canary`
- `INTERPRETATION_RELIABILITY_MODE=shadow`
- `CANONICAL_LEDGER_CANARY_READ_DOMAINS=transactions,transfers,accounts`
