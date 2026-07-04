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

## First production smoke and corrective gate

Commit `f928094` passed the remote focused tests and was deployed with the existing production flags preserved. PM2, dashboard health, WhatsApp readiness and remote state were healthy, but the manual WhatsApp smoke was `NO-GO`:

- total account balance fell into the legacy monthly balance response;
- caixinha fell into the legacy reserve-transfer response;
- Daniel - Nubank and Thais - Itau were interpreted as card invoices;
- the explicit Nubank Thais card question correctly remained on the card route.

Root cause: `classifyPerguntaLocally` ran the legacy analytical inference before the request reached the Financial Agent, so a valid canonical `accounts` plan was never produced. The corrective change creates that plan at the upstream classification boundary for current financial-account balance questions, while explicitly excluding card, credit and invoice wording.

TDD evidence for the corrective change:

- RED reproduced the production failure as `saldo_do_mes` instead of `saldo_contas_financeiras`;
- GREEN covers the four account questions and negative controls for cards and recurring bills;
- focused message/agent/state-machine tests: 334/334;
- full suite: 671/671;
- audit high: zero vulnerabilities;
- syntax, diff check, NUL scan and JSON state validation: clean.

Decision remains `NO-GO` in production until the corrective commit is deployed and the same five WhatsApp questions are repeated successfully. No rollout flag is changed by this correction.

## Second production smoke and SQLite path correction

After commit `943b38f`, all four account questions reached `saldo_contas_financeiras`, while the card guard remained correct. The Financial Agent still fell back because LangGraph converted an omitted canonical database path to an empty string. Better SQLite treated that value as a temporary database and rejected `readonly` mode.

The regression test now follows the production contract: `CANONICAL_LEDGER_SHADOW_DB_PATH` is supplied through the environment and no explicit runtime path is injected. RED reproduced `In-memory/temporary databases cannot be readonly`; GREEN preserves `undefined` in LangGraph so the canonical reader resolves the configured environment path.

Corrective evidence: focused tests 334/334 and full suite 671/671. Production remains `NO-GO` until this correction is deployed and the same five-question smoke passes.

## Final production smoke and GO

Commit `3b5e0f0` was deployed with all preserved flags unchanged. Remote focused tests passed 334/334; PM2, WhatsApp readiness, dashboard health and `state_store.json` were healthy.

The five-question WhatsApp smoke passed:

1. Daniel account total: R$ 1.527,76, with both accounts itemized;
2. Nubank Caixinha: R$ 1.264,91;
3. Daniel - Nubank: R$ 262,85, without including the caixinha;
4. Thais - Itau: R$ 133,46 under family scope;
5. Nubank Thais card: R$ 737,12 and still routed to `cards`.

Sanitized production logs confirmed `source=canonical` and `verified=true` for all four account queries, with no legacy fallback. The card guard remained `domain=cards` and verified.

Decision: `GO` in production for the WhatsApp account-balance read-side slice. The next Phase 2 slice is cross-surface parity for account balances and settled/pending movements across canonical ledger, Sheets, read-model and dashboard. Legacy removal remains Phase 8.
## Cross-surface parity extension - local GO

The next Phase 2 slice was started locally and extends the read-side gate from WhatsApp-only answers to dashboard/read-model parity for financial-account balances.

Added coverage:

- SQLite read-model stores `financial_accounts` and movement account names from `Saídas`/`Entradas`.
- Current account balance equals opening balance plus settled cash movements: expenses subtract, income adds, settled transfers move funds, pending transfers do not move current balance.
- `/dashboard/api/summary` includes sanitized `financialAccounts`, and the dashboard HTML renders `Saldos por Conta`.
- Personal-sheet dashboard fallback reads the widened account columns and computes the same summary.

Evidence:

- Focused tests: `node --test tests\unit.test.js tests\readModelSqlite.test.js tests\dashboardApiContracts.test.js` passed 203/203.
- Canonical marker-only runner: `TESTE_APAGAR_ACCOUNT_MOVEMENTS_202607041647` returned `decision=GO`, expected/canonical balances matched, transfer net income/expense impact was zero, replay was idempotent, privacy was OK and cleanup left zero marker rows.

Decision: local `GO` for the cross-surface parity implementation. Production `GO` still requires full release checks, commit/deploy, remote focused tests and EC2 marker-only/dashboard validation with flags preserved.
