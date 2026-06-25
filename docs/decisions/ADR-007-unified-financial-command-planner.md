# ADR-007: Unified Financial Command Planner

## Status

Proposed for Phase 2A; contract and shadow evidence required before routing changes.

## Date

2026-06-25

## Context

FinancasBot was intended to interpret an initial free-form message with Gemini,
produce structured JSON, validate it in deterministic code, call only the
necessary tools and confirm financial writes before persistence.

The current implementation only partially follows that design. Local fast paths
can decide the intent before Gemini runs, and the legacy master schema maps
payments of accounts, debts and invoices to one generic `registrar_pagamento`
intent. That intent always starts the debt payment handler.

A real production interaction exposed the architectural gap:

- `Paguei 469,09 da conta de telefone` was routed to debt payment;
- `Gastei 469,09 pagando a conta de telefone` was routed as a generic expense;
- the category clarification happened before recurring-bill matching;
- the operation was cancelled before a committed receipt could reach the
  canonical ledger shadow.

The canonical ledger correctly models a known recurring bill payment as
`bill_payment`, with zero free-budget impact. The defect happens earlier, at the
message interpretation and command routing boundary.

## Decision

Introduce one allowlisted `FinancialCommandPlan` contract for initial free-form
messages. Gemini may propose the plan, but its output is untrusted and cannot
execute tools or write data directly.

The initial operation vocabulary is:

- `expense.create`;
- `income.create`;
- `bill.pay`;
- `debt.pay`;
- `invoice.pay`;
- `transfer.create`;
- `financial.query`;
- `goal.create`;
- `debt.create`;
- `reminder.create`;
- `delete.request`;
- `help`;
- `unknown`.

The planner can request only small, scoped context tools:

- `match_recurring_bill`;
- `match_debt`;
- `match_card_invoice`;
- `resolve_category`;
- `list_user_accounts`.

`financial.query` delegates to the existing read-only Financial Agent and Query
Engine. The new planner does not receive whole spreadsheets, raw rows, internal
IDs, tokens, prompts or unrestricted SQL.

For writes:

1. deterministic extraction independently checks explicit amount, date and
   payment method;
2. the plan is normalized through operation and field allowlists;
3. context tools return only scoped candidates;
4. Interpretation Reliability evaluates critical fields;
5. the user confirms the resolved operation;
6. the existing executor commits the legacy write;
7. the verified receipt projects to the canonical ledger shadow.

Active conversational states, onboarding, consent, admin commands and safety
commands remain deterministic and do not pass through the initial-message
planner.

## Rollout

The new surface uses a separate fail-closed flag:

```text
FINANCIAL_COMMAND_PLANNER_MODE=off|shadow|canary|route
```

The default is `off`. The existing
`FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true` remains active for read-only
analytical planning and is not replaced by this flag.

Rollout order:

1. contract, fixtures and RED tests;
2. pure validator and normalizer;
3. shadow comparison against current routing;
4. context tools with minimal data;
5. Daniel canary for selected operations;
6. Thais canary;
7. broader routing only after an altissima gate.

Canary reads from the canonical ledger remain disabled during this work.

## Security Boundaries

- Treat every Gemini field as untrusted input.
- Reject unknown operations, tools and fields.
- Reject `user_id`, WhatsApp IDs, spreadsheet IDs, OAuth data, tokens,
  `rawRows`, `allUsers`, `admin`, prompts and tool instructions from the model.
- Never let model confidence authorize a write.
- Never let the model choose household or user scope.
- Require user confirmation for every resolved write operation.
- Keep tool calls rate-limited, scoped and observable.
- Log only sanitized plan metadata and divergence classes.

## Alternatives Considered

### Add phrase rules for telephone bills

Rejected. It fixes one sentence and keeps the conflicting routers.

### Let Gemini write directly

Rejected. It creates excessive agency and bypasses deterministic validation,
Interpretation Reliability, idempotency and confirmation.

### Keep the analytical planner separate forever

Rejected as the only strategy. The analytical planner remains useful, but it
does not solve initial write intent classification.

## Consequences

- Phase 2 gains a corrective subphase before canonical read canaries.
- Existing fast paths become extractors, validators or fallbacks instead of the
  final authority for ambiguous initial financial commands.
- Phase 3 still owns native recurrence, installments, bills and invoices. Phase
  2A only routes and executes a compatible vertical slice correctly.
- Phase 4 still owns full category budgeting and family category management.
- No production routing change is authorized by this ADR alone.
