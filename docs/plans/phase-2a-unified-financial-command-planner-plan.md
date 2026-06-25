# Phase 2A Plan: Unified Financial Command Planner

Status: Step 3 complete; no production routing change authorized.
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

## Step 5 - Shadow Comparison

- Add `FINANCIAL_COMMAND_PLANNER_MODE=off|shadow|canary|route`, default `off`.
- In `shadow`, evaluate only eligible initial messages.
- Keep current visible response unchanged.
- Record sanitized operation/action/divergence metadata.

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

Gate: offline, state-machine and marker-only E2E pass; cancellation writes
nothing; replay is idempotent.

## Step 7 - Debt, Invoice And Expense Separation

- Route `debt.pay` only to registered debts.
- Route `invoice.pay` only to known card invoices.
- Route ordinary purchases to `expense.create`.
- Run category resolution only after payment-kind resolution.

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
- then `accounts`;
- then `transfers`.

## Stop Rules

Return to `off` or `shadow` immediately for:

- wrong financial domain;
- invented amount/date/account/category;
- unconfirmed write;
- scope or privacy leak;
- duplicate write;
- Gemini cost/latency outside the approved envelope;
- PM2/WhatsApp instability.
