# Phase 2A Plan: Unified Financial Command Planner

Status: bill.pay and Step 7 canary stabilized for Daniel/Thais; no global route or new operation authorized.
Date: 2026-06-25

## Position In The Existing Roadmap

Phase 2A is a corrective gate inside Phase 2. It does not replace the canonical
ledger roadmap and does not move Phase 3 recurrence or Phase 4 category-budget
work forward.

Phase 2 cannot safely activate canonical read canaries while initial messages
can be misclassified before a verified receipt exists.

## Step 1 - Contract And RED Evidence

- Add ADR-007.
- Add the `FinancialCommandPlan` V1 spec.
- Add anonymized payment fixtures.
- Add RED tests reproducing the telephone-bill routing gap.
- Do not modify runtime routing.

Gate: focused tests fail only because the new contract/routing behavior is not
implemented.

## Step 2 - Pure Contract Module

Create a pure module with:

- operation and context-tool allowlists;
- plan normalization;
- forbidden-field detection;
- write-confirmation enforcement;
- no Gemini, Sheets, database or network calls.

Gate: contract tests green; full suite green.

Completed on 2026-06-25:

- `src/planning/financialCommandPlanContract.js` defines the V1 operation,
  write-operation and context-tool allowlists.
- Model output is treated as untrusted: normalization strips fields outside the
  public contract and validation recursively rejects internal scope, raw data
  and prototype-pollution keys.
- Write operations require explicit user confirmation.
- The module performs no Gemini, Sheets, database, filesystem or network calls.
- Focused contract tests passed `9/9`; the full suite passed `542/542`.
- The discovered telephone-bill incident remains covered by the planner fixture.
- Existing runtime routing and production flags were not changed.

## Step 3 - Planner Prompt And Offline Runner

- Build a compact Gemini prompt from the public contract.
- Add deterministic extraction alongside model output.
- Add an offline fixture runner with zero Gemini calls.
- Add live mode only with explicit hard call limits.

Gate: all fixture cases produce an acceptable normalized plan offline; live
sample has documented cost and gaps.

Completed on 2026-06-25:

- `src/planning/financialCommandPlanner.js` builds a compact prompt using only
  the current message, Sao Paulo reference date and the public V1 contract.
- Deterministic extraction runs beside Gemini for amount, date, payment method,
  operation and required context tool; conflicts block the plan.
- Dates and ambiguous multiple numbers are not accepted as monetary values.
- `scripts/runFinancialCommandPlannerBattery.js` defaults to offline mode and
  requires `--live --max-calls N`; the hard live limit is 12.
- Offline fixture battery passed `7/7`, with `0` gaps and `0` Gemini calls.
- Controlled live sample passed `4/4`, with `0` gaps and exactly `4` Gemini
  calls, covering two bill wordings, debt payment and invoice payment.
- Reports contain case IDs and sanitized decisions, never the message text.
- No handler, production flag, Sheets read, database read or financial write was
  added in this step.

## Step 4 - Scoped Context Tools

Implement one tool at a time:

1. `match_recurring_bill`;
2. `match_debt`;
3. `match_card_invoice`;
4. `resolve_category`;
5. `list_user_accounts`.

Gate for each tool: user scope is injected by trusted code, output is minimal,
and no raw row/internal identifier escapes.

Progress on 2026-06-26:

- `match_recurring_bill` implemented locally as a pure scoped context tool.
- It reuses the recurring bill matcher, filters `Contas` by trusted app scope and
  returns only public candidate labels/classification.
- It deliberately ignores model-provided scope fields and does not return
  `user_id`, notes, row indices or raw rows.
- Focused command-planner tests passed `21/21`.
- `match_debt` was added next as a pure scoped context tool. It filters active
  `Dívidas` rows by trusted app scope and returns only public labels,
  outstanding balance/installment constraints and classification.
- Focused command-planner tests after `match_debt` passed `23/23`.
- `match_card_invoice` was added from scoped `Lançamentos Cartão` rows instead
  of the unscoped summary tab `Faturas`, returning only invoice labels/status.
- Focused command-planner tests after `match_card_invoice` passed `25/25`.
- `resolve_category` was added from scoped history, recurring bill rules and
  public known categories, returning only category/subcategory/source.
- Focused command-planner tests after `resolve_category` passed `27/27`.
- `list_user_accounts` completed the scoped context-tool set, returning account
  labels and supported roles from scoped transfers, active cards and public known
  accounts.
- Focused command-planner tests after Step 4 completion passed `28/28`.
- No handler routing, production flag or financial write path changed.

## Step 5 - Shadow Comparison

- Add `FINANCIAL_COMMAND_PLANNER_MODE=off|shadow|canary|route`, default `off`.
- In `shadow`, evaluate only eligible initial messages.
- Keep current visible response unchanged.
- Record sanitized operation/action/divergence metadata.

Progress on 2026-06-26 (Step 5 local implementation):

- `src/planning/financialCommandPlannerShadow.js` adds fail-closed mode parsing for `FINANCIAL_COMMAND_PLANNER_MODE=off|shadow|canary|route`, defaulting invalid or missing values to `off`.
- In `shadow`, only initial messages without active conversation state are observed; visible legacy routing remains unchanged.
- Shadow telemetry is written to sanitized JSONL metadata only, with sender/message fingerprints and operation/divergence fields, never raw message text or internal scope.
- Telephone bill misroutes such as legacy `expense.create`/`debt.pay` versus planner `bill.pay` are marked as critical divergence for observation.
- `messageHandler` calls the runner after legacy classification and before routing, but only the legacy `structuredResponse` drives the user-visible flow.
- Focused command-planner tests passed `33/33`.

Gate:

- minimum 50 decisions over 14 days;
- at least 10 per enabled write operation;
- zero critical divergence;
- zero cross-user/internal-field leak;
- bounded calls and acceptable latency.

## Step 6 - Bill Payment Vertical Slice

- Resolve `bill.pay` before category clarification.
- Match a registered bill using trusted account context.
- Ask for missing payment method/date only.
- Confirm the resolved bill and amount.
- Commit through the existing executor.
- Project the receipt as canonical `bill_payment`.
- Keep it outside free-budget spending.

Progress on 2026-06-26 (Step 6 first local slice):

- `FINANCIAL_COMMAND_PLANNER_MODE=route` can now route a validated `bill.pay` plan before the local expense fallback.
- The first slice handles a single registered recurring bill match from trusted `Contas` scope, asks the missing payment method, asks final confirmation, then writes a `Saídas` row with `Recorrente=SIM` and the bill category/subcategory.
- The flow deliberately skips expense category clarification and does not trigger free-budget alerts for the bill payment path.
- `bill.pay` is allowlisted in Interpretation Reliability as a confirm-only/sensitive write operation.
- Still local only: production must keep the flag absent/off until shadow evidence, marker-only E2E, rollback and ledger parity gates pass.

Additional progress on 2026-06-26 (Step 6 local hardening):
- State-machine coverage now proves cancellation writes nothing and stale confirmation replay uses a stable `operationKey` without duplicating the recurring bill payment row.

Gate decision on 2026-06-26:
- Canonical ledger dry-run `LEDGER_DRY_RUN_PHASE2A_BILLPAY_20260626` passed with 15 events, 0 unexplained differences and `privacy_ok=true`; `bill_payment` remains neutral for free-budget impact.
- `NO-GO` for production `route`/canary activation: `npm run test:whatsapp:e2e:bill-pay` now exists as the bill-payment-specific marker-only E2E, but it still has to be run successfully against the real WhatsApp/bot environment before any production activation.
- A controlled canary policy is now implemented locally: `route` remains global for explicit tests, while `canary` routes only exact trusted `userId` values from `FINANCIAL_COMMAND_PLANNER_CANARY_USER_IDS`. Missing users/allowlists fail closed; non-allowlisted users stay on legacy routing with sanitized shadow observation; and the marker-only E2E accepts canary only when its resolved test user is allowlisted.

Gate: offline, state-machine and marker-only E2E pass; cancellation writes
nothing; replay is idempotent.

## Step 7 - Debt, Invoice And Expense Separation

- Route `debt.pay` only to registered debts.
- Route `invoice.pay` only to known card invoices.
- Route ordinary purchases to `expense.create`.
- Run category resolution only after payment-kind resolution.

Progress on 2026-06-27:

- `debt.pay` now matches only active scoped debts, supports numbered selection,
  asks for a missing amount, requires final confirmation and updates the debt
  with an idempotent `operationKey`.
- `invoice.pay` now matches only scoped known invoices, supports numbered
  selection and missing payment method, requires final confirmation and writes
  `Transferências` with status `Pagamento de fatura`; it never writes `Saídas`.
- Non-credit `expense.create` plans now remain distinct from debt/invoice
  payments, collect missing category/payment data and require final confirmation
  before using the existing expense executor.
- Interpretation Reliability recognizes `debt.pay` and `invoice.pay` as
  sensitive confirm-only operations. The production mode remains `shadow`.
- `FINANCIAL_COMMAND_PLANNER_ROUTE_OPERATIONS` defaults to `bill.pay`. Canary
  deploys therefore do not activate the new Step 7 routes unless each operation
  is explicitly allowlisted and reloaded through SIGHUP.
- Local evidence: state machine `77/77`, focused planner/reliability `70/70`,
  full suite `598/598`, planner offline `7/7`, audit high with zero
  vulnerabilities, ledger dry-run with 15 events, zero differences and
  `privacy_ok=true`.

Progress on 2026-06-30:

- Real canary evidence passed for `debt.pay`, `invoice.pay` and non-credit
  `expense.create` with marker `TESTE_APAGAR_PLANNER_WRITES_20260630_001`.
  Debt reduced only the scoped debt balance, invoice payment wrote only a
  `Transferências` payment movement, and ordinary `mercado` expense resolved to
  `Alimentação / SUPERMERCADO` before confirmation.
- The marker-only runner was hardened in `849e9fc` to verify and clean expenses
  whose final persisted description intentionally drops the technical marker.
  It fails closed if more than one cleaned expense matches the exact
  description/category/subcategory/value/payment/recurrence tuple.
- Remote proof on the target spreadsheet passed: `verify-cleanup` verified the
  expected final state, including a cleaned `Saídas` row, and removed all test
  rows. Local evidence: focused E2E config test 21/21, full suite 609/609,
  `git diff --check`, syntax check and `state_store.json` OK.
- Follow-up adversarial production retest on 2026-06-30 caught and closed two
  rollout gaps: `bill.pay` was restored to the production route-operation
  allowlist, and `match_card_invoice` now rejects candidates that do not contain
  explicit card terms from the user message before considering amount
  compatibility. Manual retest confirmed no-match bill payments do not become
  debt/expense, `Nubank Daniel` no longer crosses to `Thais`, and ambiguous
  apartment bills list numbered candidates.

Current gate:

- `GO` for controlled canary observation of `bill.pay`, `debt.pay`,
  `invoice.pay` and non-credit `expense.create` for Daniel/Thaís, with
  `INTERPRETATION_RELIABILITY_MODE=shadow` and Gemini planner active.
- `NO-GO` for global `route` or for adding credit-card `expense.create`,
  `income.create` or other write operations without their own gates.
- Credit-card `expense.create` and `income.create` remain on the existing legacy
  write flow in this slice.
Gate: no fixture crosses domains and no payment is double-counted.

## Step 8 - Canary And Phase 2 Resumption

Rollout order:

1. Daniel;
2. Thais;
3. approved users.

Begin with `bill.pay`, then add `debt.pay`, `invoice.pay`,
`expense.create` and `income.create`.

After routing parity:

- observe real canonical shadow receipts;
- compare Sheets, ledger, read-model and dashboard;
- enable canonical read canary for `transactions`;
- keep `accounts` disabled until `ledger_accounts`/opening balances are projected;
- then evaluate the next eligible domain (`transfers` or true account balances) with its own gate.

Status on 2026-06-30: routing parity is `GO` only for controlled Daniel/Thais
canary, but canonical read canary is still `NO-GO`. The production shadow DB was
cleaned of marker-only test residue and now has no non-marker receipts to compare.
Keep `CANONICAL_LEDGER_CANARY_READ_ENABLED=false` until new real eligible writes
produce a complete parity window.

Update on 2026-07-02: `transactions` is active in controlled canary with legacy
fallback. The previously planned `accounts` slice is explicitly blocked because
the receipt shadow can only derive movement deltas from event lines, not true
current balances; exposing those deltas as `balance_cents` would violate the
canonical ledger spec. `accounts` must remain fail-closed with reason
`canonical_accounts_opening_balances_unavailable` until the ledger projects
account identities and opening balances.

Update on 2026-07-02: the `transfers` read slice was implemented locally for
`list_recent_transactions` only. When the requested public event types are only
`transfer`, the tool now asks the canonical canary router for domain `transfers`;
mixed/all recent-transaction queries keep using `transactions`. The same legacy
fallback rules remain in place for disabled domains, empty canonical windows,
partial windows and mismatched rows.

Update on 2026-07-02: `transfers` also passed a production marker-only canary
read gate and was added to `CANONICAL_LEDGER_CANARY_READ_DOMAINS`, making the
active domain set `transactions,transfers`. The gate created one temporary
`Transferências` receipt through the real append/projection path, verified that
`list_recent_transactions` for transfer-only queries returned `source=canonical`
with the marker amount, and cleaned both Sheets and the canonical shadow run to
zero. `accounts` remains disabled and must not be activated until true account
balances/opening balances exist.

Update on 2026-07-02: the local `accounts` infrastructure slice now exists behind the same fail-closed canary policy. The shadow schema has `canonical_ledger_accounts` with mandatory `opening_balance_cents`, and the canary reader returns account balances only when explicit opening balances are present. This does not authorize production `accounts`; the active production read domains remain `transactions,transfers` until a dedicated account-balance gate passes.

## Stop Rules

Return to `off` or `shadow` immediately for:

- wrong financial domain;
- invented amount/date/account/category;
- unconfirmed write;
- scope or privacy leak;
- duplicate write;
- Gemini cost/latency outside the approved envelope;
- PM2/WhatsApp instability.
