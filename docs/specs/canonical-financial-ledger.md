# Canonical Financial Ledger Spec

Updated: 2026-06-24

## Purpose

Define the v1 contract for the FinancasBot family financial ledger before any
real production schema change. This spec is the source for red tests, fixtures,
shadow projections and future migrations.

## Goals

- Represent financial events once, with explicit dates, status and provenance.
- Support personal and family views without exposing private internal fields.
- Preserve the current Google Sheets experience as mirror/export during the
  migration.
- Make card invoices, recurring bills, transfers, debts, goals and budgets
  queryable without double counting.
- Give the Query Engine, dashboard and Financial Agent one deterministic source
  of public financial facts.

## Non-goals

- No production database cutover in this phase.
- No dashboard v2, Open Finance, OCR/PDF or new import format.
- No broad Family Mode activation.
- No LLM-owned calculation, reconciliation or write decision.
- No removal of legacy Sheets paths before measured zero use.

## Dates

Canonical events distinguish:

- `occurred_on`: when the user says the event happened.
- `effective_on`: when cash/account balance is affected.
- `competence_month`: analytical month as `YYYY-MM`.
- `due_on`: payment deadline for expected bills, invoices, debts or receivables.
- `created_at` and `updated_at`: technical timestamps.

Adapters may translate `competence_month` to existing JavaScript zero-based
months, but storage and fixtures use `YYYY-MM`.

## Status

All financial events use one of:

- `pending`: expected, scheduled, open, not settled.
- `settled`: financially confirmed or paid.
- `cancelled`: intentionally voided.
- `uncertain`: imported or inferred item waiting for review.

Legacy labels such as `Pago`, `Pendente`, `Aberta`, `Fechada` and `Quitada`
must map to these canonical statuses at the adapter boundary.

## Event Kinds

Initial v1 kinds:

- `expense`
- `income`
- `transfer`
- `card_purchase`
- `invoice_closure`
- `invoice_payment`
- `bill_expected`
- `bill_payment`
- `debt_opening`
- `debt_payment`
- `goal_opening`
- `goal_contribution`
- `goal_withdrawal`
- `reimbursement`
- `refund`
- `adjustment`

The kind describes the economic event. Line effects describe which account,
card, category, debt or goal changed.

## Core Entities

### `households`

Family scope container.

Required fields:

- `household_id`
- `name`
- `status`
- `created_at`
- `updated_at`

### `people`

Approved members or legacy owners.

Required fields:

- `person_id`
- `household_id`
- `display_name`
- `status`
- `created_at`
- `updated_at`

Phone numbers, WhatsApp IDs and OAuth identifiers do not appear in public ledger
views. Internal identity mapping belongs to user services and sanitized adapters.

### `ledger_accounts`

Financial account, wallet, reserve, cash bucket or liability account.

Required fields:

- `account_id`
- `household_id`
- `owner_person_id`
- `type`: `cash`, `bank`, `wallet`, `reserve`, `credit_liability`, `debt`,
  `goal`, `adjustment`
- `name`
- `currency`
- `opening_balance_cents`
- `opened_on`
- `status`

### `ledger_cards`

Credit card metadata.

Required fields:

- `card_id`
- `household_id`
- `owner_person_id`
- `liability_account_id`
- `name`
- `closing_day`
- `due_day`
- `paying_account_id`
- `status`

### `ledger_categories`

Canonical category/subcategory.

Required fields:

- `category_id`
- `household_id`
- `name`
- `parent_category_id`
- `status`
- `confidence_policy`

Unknown category is represented explicitly; it is not silently converted to a
valid budget category.

### `ledger_events`

One canonical economic event.

Required fields:

- `event_id`
- `household_id`
- `owner_person_id`
- `actor_person_id`
- `kind`
- `status`
- `description`
- `amount_cents`
- `currency`
- `occurred_on`
- `effective_on`
- `competence_month`
- `due_on`
- `source_type`
- `source_id_hash`
- `source_row_hash`
- `idempotency_key`
- `created_at`
- `updated_at`

### `ledger_event_lines`

Effects of one event on accounts, categories or related objects.

Required fields:

- `line_id`
- `event_id`
- `line_type`: `cash`, `card_liability`, `category`, `debt`, `goal`,
  `budget`, `clearing`
- `account_id`
- `category_id`
- `related_event_id`
- `direction`: `inflow`, `outflow`, `neutral`
- `amount_cents`
- `currency`
- `metadata_hash`

The sum of lines is not required to model a full accounting journal in v1, but
line semantics must be enough to avoid double counting.

### `ledger_schedules`

Rules and expected future items.

Required fields:

- `schedule_id`
- `household_id`
- `owner_person_id`
- `schedule_type`: `recurrence`, `installment`, `bill`, `receivable`
- `status`
- `start_on`
- `end_on`
- `frequency`
- `amount_cents`
- `currency`
- `next_due_on`
- `source_id_hash`

### `ledger_reconciliation_links`

Links canonical events to sources and counterpart events.

Required fields:

- `link_id`
- `event_id`
- `link_type`: `source_row`, `import_item`, `invoice_item`, `payment`,
  `transfer_pair`, `goal_movement`, `refund_pair`, `import_match`,
  `correction`
- `related_event_id`
- `external_hash`
- `confidence`
- `status`
- `created_at`

## Public Projection

The public read surface must be safe for the Financial Agent and dashboard. It
must not expose:

- `user_id`, raw phone, WhatsApp ID or OAuth subject;
- spreadsheet IDs or private URLs;
- raw prompts, raw messages or tokens;
- internal row IDs that allow cross-source enumeration.

Allowed public fields are scoped, human-facing and deterministic:

- date fields;
- description;
- kind;
- status;
- amount;
- category/subcategory;
- account/card display name;
- responsible person display label;
- source family such as `whatsapp`, `sheet`, `import`, `recurrence`.

## Legacy Adapter Rules

Initial projections must cover:

- `Saídas` -> `expense` or linked `bill_payment` when it settles a known bill.
- `Entradas` -> `income`.
- `Transferências` -> `transfer`, `goal_contribution` or `goal_withdrawal`.
- `Contas` -> `bill_expected` and expected schedule data.
- `Cartões` -> `ledger_cards`.
- `Lançamentos Cartão` -> `card_purchase`.
- `Faturas` -> `invoice_closure` and `invoice_payment` links.
- `Dívidas` -> `debt_opening` plus current state adapter.
- debt payments -> `debt_payment`.
- `Metas` -> `goal_opening` plus current state adapter.
- `Movimentações Metas` -> `goal_contribution` or `goal_withdrawal`.
- `Parcelamentos` -> `ledger_schedules` with installment occurrences.

If the adapter cannot prove a link, it emits `uncertain` with a reconciliation
reason instead of inventing certainty.

## Required Fixtures

Create anonymized fixtures before implementation for:

- debit expense paid today;
- credit card purchase with competence different from payment date;
- invoice payment that does not become free expense;
- recurring bill expected and later paid;
- paid recurring bill excluded from free daily budget;
- transfer between own accounts;
- goal contribution and withdrawal;
- debt payment with principal and optional interest;
- reimbursement linked to an expense;
- imported item matched to a manual launch;
- unknown category requiring classification;
- Daniel/Thais scoped family view with no admin all-users leak.

## Red Test Targets

The first tests should fail before implementation and prove:

- one source row produces one stable canonical event on repeated projection;
- card invoice payment does not double count spending;
- internal transfer is neutral for income/expense;
- paid bill links to expected bill and does not duplicate budget spending;
- competence and due date are preserved separately;
- unknown category remains unresolved until user classification;
- public projection excludes internal identity and spreadsheet fields;
- dry-run report lists every unexplained mismatch.

## Phase 1 Exit Criteria

- ADR-006 and this spec are accepted.
- Fixture files are in the repo and contain no real sensitive data.
- Projection tests exist and fail before the projector is implemented.
- Backup/restore and retention policy are documented.
- Dry-run migration report can be generated locally without writing production
  financial data.

## Phase 1 Exit Decision

The criteria above were completed locally on 2026-06-24. Rollout flags,
production approvals, canary domains, backup retention and rollback are defined
in `docs/runbooks/canonical-ledger-dual-projection-gate.md`.

Production shadow projection is not approved by Phase 1. The first Phase 2
implementation must project verified committed transaction receipts without
changing the legacy result, then produce domain parity evidence before a new
production decision.
