# Phase 3 Plan - Recurrences, Installments, Bills and Invoices

Date: 2026-07-04
Status: started after Phase 2 exit GO

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

## Slice 3A - Invoice payoff with paying account

Reason: after Phase 2, cash movements know financial accounts, but `invoice.pay` still could register a payment transfer without asking which account paid the invoice. That prevents account balances from reflecting invoice payoff cash movement.

Implementation contract:

- When active financial accounts exist and an `invoice.pay` plan has a valid non-credit payment method, ask which account paid before final confirmation.
- The confirmation must show the paying account.
- The saved `Transferências` row uses the selected financial account as `Conta Origem` and the card/invoice as `Conta Destino`.
- Existing behavior remains when no financial account rows exist.
- Credit remains rejected as a payment method for invoice payoff.
- Operation key includes the paying account to avoid replaying a payment under a different account.

Initial local evidence:

- RED reproduced the missing account question.
- GREEN in `tests/financialStateMachine.test.js` confirms account selection, final confirmation and `Transferências` origin for `invoice.pay`.

Next gate for this slice:

- Run focused state-machine tests.
- Run full suite, audit, diff check, tracked NUL scan and state validation.
- Deploy only after local GO, then run a marker-only/manual invoice payoff smoke in production and clean it.

