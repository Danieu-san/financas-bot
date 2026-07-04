# Phase 3 Plan - Recurrences, Installments, Bills and Invoices

Date: 2026-07-04
Status: started after Phase 2 exit GO; slice 3A deployed, awaiting manual no-write production smoke

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

Evidence:

- RED reproduced the missing account question.
- GREEN in `tests/financialStateMachine.test.js` confirms account selection, final confirmation and `Transferências` origin for `invoice.pay`.
- Local focused state-machine tests passed 97/97.
- Local full suite passed 674/674.
- Local `npm audit --audit-level=high`, `git diff --check`, tracked NUL scan and JSON state validation passed.
- Commit `251ff0f` deployed to EC2; health is OK, WhatsApp is ready, flags remain stable and remote state is valid/empty.
- Remote isolated regression for `invoice.pay asks explicit paying account` passed 1/1.

Next gate for this slice:

- Run marker-only/manual invoice payoff smoke in production without saving: payment message, account selection, confirmation shows account, answer `nao`, and verify no write is created.
