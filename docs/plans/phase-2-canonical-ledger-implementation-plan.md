# Phase 2 Canonical Ledger Implementation Plan

Status: production shadow writes and the `transactions,transfers` read canary domains are enabled.
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

## Controlled Transactions Read Canary Activation - 2026-07-01

By explicit operator decision, production enabled the first canonical read canary only for the `transactions` domain. The activation changed `CANONICAL_LEDGER_CANARY_READ_ENABLED=true`, `CANONICAL_LEDGER_CANARY_READ_APPROVED=true`, and `CANONICAL_LEDGER_CANARY_READ_DOMAINS=transactions`, preserving answer mode, the Gemini planner, contextual analyst, command planner canary, and interpretation reliability shadow.

Because the marker-only evidence was cleaned, the initial smoke verified the safety fallback rather than canonical replacement: `list_recent_transactions` returned `source=legacy`, `fallbackReason=canonical_empty`, and five legacy rows while the canonical shadow had `events=0` and `publicRows=0`.

## Controlled Transfers Read Canary Activation - 2026-07-02

Production now also allows the `transfers` canonical read domain. The activation preserved the existing baseline and changed only `CANONICAL_LEDGER_CANARY_READ_DOMAINS` from `transactions` to `transactions,transfers`.

The gate used a temporary marker-only transfer receipt created through `appendRowToSheet('Transferências')`, so it exercised the same post-commit receipt projection used by the bot. The Financial Agent tool `list_recent_transactions` was then called with `eventTypes=['transfer']` and returned:

- `source=canonical`;
- no fallback reason;
- one `transfer` row;
- amount `12.81`;
- source `transferencias`.

The marker was removed from Sheets and from the canonical shadow projection in the same run: `remainingSheetRows=0` and `remainingCanonicalRows=0`. `accounts` remains disabled/fail-closed because true account balances are not available yet.

## Accelerated Evidence Gate - 2026-07-02

The former passive observation window is replaced by a generated adversarial
battery. It must create controlled receipts for every currently routed command
(`bill.pay`, `debt.pay`, `invoice.pay`, `expense.create`) plus income,
reimbursement and transfer projections, then verify all affected sources before
cleaning the markers.

Required blocks:

1. correct committed receipt, cancellation and invalid confirmation for every
   routed operation;
2. unknown, ambiguous and contradictory bill/debt/invoice/card/category cases;
3. ordinary expense versus recurring bill classification and free-budget impact;
4. duplicate message, duplicate confirmation, replayed receipt and idempotent
   `operationKey`;
5. retroactive/relative dates, month boundary and `America/Sao_Paulo` rollover;
6. Gemini timeout/invalid plan, context-tool failure and deterministic fallback;
7. SQLite/read-model empty, partial, stale and unavailable scenarios, proving
   canonical read or safe legacy fallback without truncation;
8. parity of count, cents, kind, status, date, category, responsible person and
   budget eligibility across Sheets, canonical ledger, read-model and answers;
9. restart between planning/confirmation and safe recovery without double write;
10. sanitized command-planner telemetry for route, confirmation, save, cancel,
    replay and error, including latency thresholds and secret/PII scan;
11. flag rollback for command routing and canonical reads;
12. marker cleanup and post-cleanup audit of Sheets, ledger, state and backups.

The gate is `GO` only with zero unexplained parity differences, zero critical
telemetry divergence, no duplicate write, safe fallback in every degraded case,
and complete cleanup. A real-time waiting period is not required when this
matrix passes; failures become focused regression tests and keep the affected
surface at `NO-GO`.

## Accelerated Evidence Result - 2026-07-02

The generated offline, live Gemini and production marker-only batteries passed
for `bill.pay`, `debt.pay`, `invoice.pay` and `expense.create`, including save,
cancel, classification, free-budget impact, parity, privacy and cleanup. The
battery found and corrected a real audit defect where receipt projections kept
the dry-run timestamp `1970-01-01`; commit `6377747` now uses the stable commit
timestamp from the Financial Write Ledger. A post-fix production smoke recorded
the correct 2026 timestamp and was cleaned with backup.

Decision: `GO` for this accelerated evidence gate. Keep Command Planner in
`canary`, Interpretation Reliability in `shadow`, and canonical reads limited to
`transactions,transfers` while proceeding to the next planned migration slice. Evidence:
`docs/qa/accelerated-command-planner-ledger-gate-2026-07-02.md`.

## Local Accounts Opening-Balance Infrastructure - 2026-07-02

Local TDD added the first real `accounts` infrastructure without changing production flags. Migration `002_canonical_ledger_accounts.sql` creates `canonical_ledger_accounts` with mandatory `opening_balance_cents`; the shadow store now rejects projected accounts that do not provide an explicit integer opening balance.

The canary reader for domain `accounts` can now compute public balances as opening balance plus scoped event-line movement, but only when account rows exist with explicit opening balances. The public response omits internal account IDs, user IDs, source row hashes and idempotency keys. If the table is missing, empty, or lacks valid opening balances, the domain still fails closed with `canonical_accounts_opening_balances_unavailable`.

Decision: local infrastructure is `GREEN`; production activation of `accounts` remains `NO-GO` until a separate marker-only gate seeds/validates real account identities and opening balances, proves parity with Sheets/read-model answers, and cleans all fixtures.

## Accounts Marker-Only Gate Runner - 2026-07-02

A local executable gate now exists for the `accounts` domain: `npm run ledger:accounts-gate -- --confirm-marker-only --marker TESTE_APAGAR_...`. It seeds a marker-only canonical receipt-shadow projection with two explicit account opening balances, validates the `accounts` canary reader, scans the public response for internal identifiers, deletes only the marker run, and writes `canonical-ledger-accounts-canary-gate.json` under the selected report directory.

The runner uses process-local canary env values to exercise the reader; it does not edit `.env` and does not authorize production `CANONICAL_LEDGER_CANARY_READ_DOMAINS=accounts`. Production `accounts` remains `NO-GO` until this runner is deployed/executed against the EC2 shadow DB, the report is clean, and a separate operator decision enables the domain.

## Explicit Financial Accounts Source - 2026-07-02

A local TDD slice added the real input surface needed before any `accounts` activation: a separate `Contas Financeiras` sheet, distinct from recurring-bill `Contas`. The user and central spreadsheet templates include the tab with `Nome da Conta`, `Tipo`, `Saldo Inicial`, `Data de Abertura`, `Status`, `Moeda`, `Responsavel`, `user_id` and `Observacoes`.

Receipt shadow projection now reads this tab and builds `projected.accounts` only from rows that have both `user_id` and an explicit monetary opening balance. Rows without opening balance, including starter examples with blank `user_id`, are ignored so the account canary keeps failing closed unless real source data exists.

Decision: source wiring and inert deploy are `GREEN`. Local verification passed (`202/202` focused, `646/646` full suite, audit high 0), EC2 focused tests passed (`202/202`), health is OK, and the remote marker-only `accounts` gate returned `GO` with privacy OK, cleanup zerada and post-cleanup fail-closed.

Production `CANONICAL_LEDGER_CANARY_READ_DOMAINS=accounts` stays `NO-GO` because the live `Contas Financeiras` source still needs real Daniel/Thais account rows with explicit opening balances. Next step is to fill/seed those rows deliberately, run a source-backed accounts gate/parity check against the real sheet data, then decide controlled activation.

## Real Accounts Source Persistence - 2026-07-03

Daniel supplied the real family account opening balances and the central
`Contas Financeiras` sheet was cleaned of marker-only fictional rows. A temporary
source-backed gate proved the transformation, but that run was intentionally
cleaned and therefore did not leave account identities available for a production
`accounts` read canary.

A dedicated source gate now exists for this transition:
`npm run ledger:accounts-source-gate -- --confirm-real-source --persist-source --rows-json <file>`.
It projects only the explicit rows from `Contas Financeiras` into
`canonical_ledger_accounts`, validates the `accounts` canary reader, scans the
public response for internal identifiers and, with `--persist-source`, keeps the
source projection as the account opening-balance baseline.

Decision: `accounts` remains `NO-GO` for production read activation until this
source gate is deployed, run against the real EC2 sheet data with
`--persist-source`, and followed by a controlled flag change to include
`accounts` in `CANONICAL_LEDGER_CANARY_READ_DOMAINS` with rollback by `.env`
backup.

## Controlled Accounts Read Canary Activation - 2026-07-03

Production persisted the real `Contas Financeiras` source into the canonical
shadow ledger with `ACCOUNTS_SOURCE_REAL_20260703` before enabling the read
domain. The source gate returned `GO`, `privacy.ok=true`, four public account
rows and `persistentRun=true`.

The controlled activation changed only
`CANONICAL_LEDGER_CANARY_READ_DOMAINS` from `transactions,transfers` to
`transactions,transfers,accounts`. Backup files:

- SQLite shadow: `data/backups/canonical_ledger_shadow.pre-accounts-source-20260703T1220Z.sqlite`.
- `.env`: `/home/ubuntu/financas-bot-backups/.env.pre-canonical-accounts-canary-20260703T1225Z`.

Post-activation smoke with the process env returned `enabled=true` for domain
`accounts` and these opening/current balances: Daniel - Nubank R$ 262,85;
Daniel - Nubank Caixinha R$ 1.264,91; Thais - Nubank R$ 0,00; Thais - Itaú
R$ 133,46. PM2, dashboard health, WhatsApp ready and `state_store.json` were
healthy.

Decision: `accounts` read canary is `GO` for this opening-balance surface. It is
not a full account reconciliation cutover; future movements still need their own
parity evidence before account balances become the primary user-facing source.

## Account Balance Status Guard - 2026-07-03

The `accounts` canary now treats current balance as settled cash only. Event
lines linked to pending movements are ignored until the event status becomes
`settled`, so a future or pending transfer does not move either account balance
prematurely.

RED/GREEN evidence reproduced the bug: a pending transfer was reducing the
origin account and increasing the destination account. The fix filters account
movement aggregation by `e.status = 'settled'` while preserving the public
privacy contract.

Local evidence: focused ledger/canary tests passed `24/24`, full suite passed
`656/656`, audit high had zero vulnerabilities, `git diff --check` passed and
tracked NUL scan was clean. Production evidence on EC2 commit `5290612`: focused
receipt projector tests passed `14/14`, PM2/health/state were healthy, WhatsApp
was ready, and a read-only `accounts` smoke still returned the four real opening
balances.

Decision: status handling for current account balances is `GO` for the canary.
Next Phase 2 work should cover dated/settled account movements with marker-only
receipts and parity against Sheets/read-model before account balances are used
as a broad primary user-facing source.
