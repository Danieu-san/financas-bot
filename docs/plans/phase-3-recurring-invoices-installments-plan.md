# Phase 3 Plan - Recurrences, Installments, Bills and Invoices

Date: 2026-07-04
Status: started after Phase 2 exit GO; slices 3A and 3B production GO

## Roadmap position

General roadmap phase: Phase 3 - Recurrences, installments, bills and invoices.

## Goal

Turn forecasting and reconciliation into native, audited capabilities without removing legacy paths yet.

## Scope from roadmap

- Versioned recurrence rules.
- Occurrences materialized on demand.
- Accounts payable/receivable.
- Installment schedule.
- Invoices and linked items.
- Invoice payoff with paying financial account.
- Linked refund/reimbursement.
- Import reconciliation versus manual entry.

## Out of scope

- Broad legacy removal, which remains Phase 8.
- Category-budget redesign, which belongs to Phase 4.
- OCR/PDF, attachments and Open Finance.
- Any Gemini-owned calculation or write execution.

## Gate of exit

No duplication when importing, paying invoice, restarting or editing recurrence rules. Evidence must include adversarial, repeatable and cleanable tests instead of passive waiting.

Detailed next slices after 3B are tracked in `docs/plans/family-financial-platform-step-by-step-roadmap.md`, starting with `3C - Regras de recorrencia e ocorrencias materializadas`.

## Slice 3C - Recurrence rules and materialized occurrences

Local status on 2026-07-05: `GO` for schema/projection, not yet deployed.

Implemented locally:

- Canonical recurrence rules projected from active `Contas` rows.
- Materialized recurrence occurrences by explicit competence window.
- Due-day clamping for short months and year-turn materialization.
- Inactive rules excluded from projection.
- Recurring bill payment linked to the expected occurrence while remaining out of free budget spend.
- SQLite shadow migration `004_canonical_ledger_recurrences.sql` and store persistence for rules/occurrences.
- Parity report recurrence counts and canonical ledger spec update.

Evidence:

- Focused ledger suite passed `47/47`.
- Full `npm test` passed `684/684`.
- `npm audit --audit-level=high` found 0 vulnerabilities.
- `git diff --check` passed.
- Control-character scan found no NUL/backspace matches.
- `state_store.json` parsed as valid JSON.

Remaining before production GO:

- Commit/push and deploy to EC2.
- Apply migration 004 in production shadow DB and verify table visibility.
- Run remote focused tests for projector/store/receipt/parity.
- Verify health, flags and `state_store.json` remotely.
- Run marker-only/manual smoke for paid and unpaid recurring bill occurrence.
- Decide production GO/NO-GO and record read-only canary scope for upcoming occurrences.

## Slice 3A - Invoice payoff with paying account

Reason: after Phase 2, cash movements know financial accounts, but `invoice.pay` still could register a payment transfer without asking which account paid the invoice. That prevents account balances from reflecting invoice payoff cash movement.

Implementation contract:

- When active financial accounts exist and an `invoice.pay` plan has a valid non-credit payment method, ask which account paid before final confirmation.
- The confirmation must show the paying account.
- The saved `Transferências` row uses the selected financial account as `Conta Origem` and the card/invoice as `Conta Destino`.
- Existing behavior remains when no financial account rows exist.
- Credit remains rejected as a payment method for invoice payoff.
- Operation key includes the paying account to avoid replaying a payment under a different account.

Evidence:

- RED reproduced the missing account question.
- GREEN in `tests/financialStateMachine.test.js` confirms account selection, final confirmation and `Transferências` origin for `invoice.pay`.
- Local focused state-machine tests passed 97/97.
- Local full suite passed 674/674.
- Local `npm audit --audit-level=high`, `git diff --check`, tracked NUL scan and JSON state validation passed.
- Commit `251ff0f` deployed to EC2; health is OK, WhatsApp is ready, flags remain stable and remote state is valid/empty.
- Remote isolated regression for `invoice.pay asks explicit paying account` passed 1/1.

Production gate:

- Manual no-write smoke passed on 2026-07-04 with the real `Nubank Thais` invoice: the bot asked for the paying financial account, accepted `Daniel - Nubank`, showed it in the final confirmation and cancelled after `nao` with `Nenhum dado foi salvo`.
- Decision: production `GO` for slice 3A. No rollout flags changed; Gemini Planner remains active and `INTERPRETATION_RELIABILITY_MODE=shadow`.

## Slice 3B - Linked invoices and items

Reason: invoice payoff now records the cash movement from an explicit account, but Phase 3 still needs a native, auditable link between each invoice, its card items and its payoff. Completing this contract next avoids building recurrence and installment behavior on top of an invoice aggregate that cannot yet prove its composition.

Initial contract:

- Represent an invoice as a stable aggregate for card, billing period and due date.
- Link each card purchase/installment to exactly one invoice competence without duplicating the consumption expense.
- Link `invoice.pay` to the invoice aggregate and paying-account transfer.
- Preserve existing Sheets and WhatsApp behavior through adapters; legacy removal remains Phase 8.
- Prove idempotency for rebuild, retry and restart, including a paid invoice.

Implementation evidence:

- The canonical projector now creates stable invoice aggregates for family card and competence, links card purchases/installments to invoice items, and links invoice payments to the same aggregate without duplicating the consumption expense.
- The shadow store migration `003_canonical_ledger_invoices.sql` persists invoice aggregates, items and payments; aggregate totals/status are query-derived instead of stored redundantly.
- The receipt projector can link card purchases and invoice payoffs across separate idempotent receipt runs, including legacy `Cartão ...` sheet names.
- A second review through the configured Gemini API flagged identity/deduplication/storage risks. The accepted fixes prefer canonical card names over opaque ids, deduplicate repeated invoice item/payment observations in one run and remove redundant invoice aggregate columns from persistence.
- Local TDD and regression coverage now includes stable invoice linkage, Daniel/Thais sharing one family invoice on the same card, opaque card id matching through canonical card name, repeated invoice link idempotency and shadow-store persistence without redundant aggregate columns.

Local gate:

- Focused ledger tests passed during development.
- Full `npm test` passed 680/680 on 2026-07-04.
- `npm audit --audit-level=high` found 0 vulnerabilities.
- `node --check` passed for `canonicalLedgerProjector.js`, `canonicalLedgerReceiptProjector.js` and `canonicalLedgerShadowStore.js`.
- `git diff --check` passed.
- Control-character scan found no NUL/backspace matches.
- `state_store.json` parsed as valid JSON.

Decision:

- Local `GO` for deploying slice 3B behind the existing canonical shadow/canary surfaces.
- Production `GO` was reached on 2026-07-05: EC2 fast-forwarded to `6a668bf`, remote focused ledger tests passed 43/43, PM2 and dashboard health were green, `state_store.json` remained valid, rollout flags were unchanged, and the production SQLite shadow schema contains `canonical_ledger_invoices`, `canonical_ledger_invoice_items` and `canonical_ledger_invoice_payments`.
