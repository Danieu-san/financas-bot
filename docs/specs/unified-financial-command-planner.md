# Spec: Unified Financial Command Planner

## Objective

Provide one structured, validated interpretation boundary for initial
WhatsApp messages while preserving deterministic calculations, scoped reads,
user confirmation and the canonical-ledger rollout.

Success means that semantically different payments are not collapsed:

- recurring bill payment -> `bill.pay`;
- debt payment -> `debt.pay`;
- card invoice payment -> `invoice.pay`;
- new consumption -> `expense.create`.

## Baseline To Preserve

- `FINANCIAL_AGENT_MODE=answer`.
- `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`.
- `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`.
- `INTERPRETATION_RELIABILITY_MODE=shadow`.
- Canonical ledger shadow writes enabled.
- Canonical ledger canary reads disabled.
- Existing onboarding, consent, admin and active-state routing.

## FinancialCommandPlan V1

```json
{
  "schemaVersion": "financial-command-plan-v1",
  "operation": "bill.pay",
  "entities": {
    "description": "conta de telefone",
    "amount": 469.09,
    "date": null,
    "paymentMethod": null
  },
  "fieldEvidence": {
    "description": "explicit",
    "amount": "explicit",
    "date": "missing",
    "paymentMethod": "missing"
  },
  "contextRequests": [
    {
      "tool": "match_recurring_bill",
      "query": "conta de telefone"
    }
  ],
  "missingFields": ["paymentMethod"],
  "requiresConfirmation": true
}
```

The LLM may omit optional fields. Deterministic code supplies defaults only
when the existing reliability contract permits them.

## Allowed Operations

| Operation | Purpose | Write |
|---|---|---|
| `expense.create` | New expense/consumption | yes |
| `income.create` | New income | yes |
| `bill.pay` | Settle a registered recurring bill | yes |
| `debt.pay` | Reduce a registered debt | yes |
| `invoice.pay` | Settle a card invoice/liability | yes |
| `transfer.create` | Move value between accounts/people | yes |
| `financial.query` | Delegate to read-only Financial Agent | no |
| `goal.create` | Start the existing goal flow | yes |
| `debt.create` | Start the existing debt flow | yes |
| `reminder.create` | Start the existing Calendar flow | yes |
| `delete.request` | Start the existing deletion confirmation | yes |
| `help` | Display help | no |
| `unknown` | Safe fallback | no |

## Context Tools

Tools receive scope from trusted application context, never from the model.

| Tool | Minimal result |
|---|---|
| `match_recurring_bill` | zero or more bill candidate labels and classification; no `user_id`, notes, row index or raw row |
| `match_debt` | zero or more debt candidate labels and payment constraints; no `user_id`, notes, row index or raw row |
| `match_card_invoice` | zero or more card/invoice candidate labels and status |
| `resolve_category` | known category candidates only |
| `list_user_accounts` | display labels and supported payment roles |

No tool returns an entire sheet or raw source rows.

## Resolution Rules

### Bill payment

- One compatible registered bill: inherit its category/subcategory and ask only
  for missing critical fields.
- Multiple compatible bills: ask the user to select one.
- No compatible bill: ask whether to register a normal expense or start a future
  bill-registration flow.
- Never route to `debt.pay` only because the message contains `paguei`.

### Debt payment

Requires a registered debt candidate. If none exists, clarify instead of
falling back to a bill or expense.

### Invoice payment

Requires a known card/invoice candidate. It settles liability and must not
create a second expense.

### Expense

Category resolution happens only after bill, debt, invoice and transfer
resolution. Unknown category remains unresolved until confirmed.

## Validation

The normalizer must:

- accept only V1 operations and context tools;
- strip unknown fields;
- reject internal identity/scope fields;
- reject write plans with `requiresConfirmation=false`;
- reject context requests with arbitrary arguments or instructions;
- compare critical fields against deterministic extraction;
- convert unsafe or conflicting plans to `clarify` or `block`, never execute.

## Privacy And Cost

- Gemini receives the current user message, current date and public contract.
- It does not receive spreadsheets, raw rows or broad financial history.
- Context is fetched after planning through small deterministic tools.
- Results sent back to Gemini, when necessary, contain only candidate labels and
  non-sensitive attributes needed for disambiguation.
- Each initial message has a bounded planner-call budget.
- Active multi-step state replies do not trigger a new planner call.

## Testing Strategy

- Fixture contract tests for the operation vocabulary and required incidents.
- Pure unit tests for normalization, allowlists and forbidden fields.
- Shadow comparison tests for planner versus legacy routing.
- State-machine tests proving confirmation before writes.
- Receipt/ledger tests proving `bill_payment` and zero free-budget impact.
- Live Gemini tests only after offline coverage, with a hard call limit.

## Commands

```text
node --test tests/financialCommandPlanContract.test.js tests/financialCommandPlanner.test.js tests/financialCommandPlannerRunner.test.js
npm run test:financial-command-planner
npm test
npm audit --audit-level=high
git diff --check
```

## Boundaries

Always:

- validate model output;
- preserve trusted scope outside the plan;
- confirm writes;
- use TDD and sanitized telemetry.

Ask first:

- adding a dependency;
- changing canonical schema;
- enabling production canary or route mode;
- expanding tools or operations.

Never:

- send full Sheets data to Gemini;
- execute arbitrary model-provided tools or SQL;
- let model confidence authorize a financial write;
- bypass Interpretation Reliability or idempotency;
- expose internal identifiers in logs or public projections.

## Phase 2A Exit Criteria

- ADR and spec accepted.
- Incident fixtures and neighboring payment cases covered.
- Validator/normalizer tests green.
- Shadow planner compares initial messages without changing replies.
- Zero critical privacy or scope divergence.
- Rollback flag tested.
- Daniel canary approved before any broad routing.
