# Family LangGraph Financial Agent

## Goal

Turn FinancasBot into a private family financial assistant for Daniel and Thais, using LangGraphJS as the final runtime for read-only financial analysis.

The goal is not to make Gemini calculate. The goal is to let Gemini/local planning choose the right safe tool, then let code calculate and verify.

## Non-Goals

- No broad multi-user launch in this phase.
- No writes through the read-only agent.
- No raw spreadsheet dump to Gemini.
- No automatic model switch.
- No removal of the existing Query Engine.

## Runtime Boundary

The project remains CommonJS. LangGraphJS is isolated in:

- `src/agent/langGraphRuntime.mjs`

CommonJS code calls:

- `src/agent/financialAgent.js`

This prevents a whole-project ESM migration.

Runtime requirement:

- Node.js `>=20.0.0`.
- Production EC2 was checked during implementation and reported Node `v22.17.1`.

## Modes

`FINANCIAL_AGENT_MODE`:

- `off`: default. The agent does not run.
- `shadow`: the agent runs after scope resolution, logs sanitized telemetry and legacy still answers.
- `answer`: the agent may answer read-only questions if the verifier approves.
- `enforce`: accepted as an alias for `answer`.

Planner gaps do not hijack the legacy flow. In `answer` mode, a planner gap falls back to the existing route until the agent gains that capability.

## Family Mode

`FAMILY_MODE_ENABLED` controls whether normal bot access is restricted to an explicit family allowlist.

Allowed identifiers:

- `FAMILY_MODE_USER_IDS`
- `FAMILY_MODE_WHATSAPP_IDS`

Behavior:

- Default is disabled.
- If enabled without an allowlist, access is closed and the bot asks Daniel to fix configuration.
- If enabled with an allowlist, only allowlisted users can continue into normal financial flows.
- Admin commands that run before normal access remain governed by admin checks.
- Family Mode does not delete users or financial data. Any status changes for old beta users must be handled as a separate reversible admin/data-maintenance step with backup.

## Public Data Surface

SQLite now exposes a safe public event table:

`financial_events_public`

Allowed public fields:

- `date`
- `iso_date`
- `year`
- `month`
- `weekday`
- `event_type`
- `amount`
- `description`
- `category`
- `subcategory`
- `person`
- `payment_method`
- `card`
- `billing_month`
- `due_date`
- `source`

Blocked fields:

- `user_id`
- `sheet_id`
- `spreadsheet_id`
- phones
- tokens
- OAuth data
- prompts
- raw rows
- owner hashes
- private URLs

The public table stores owner hashes internally for filtering, but exported agent rows do not include them.

## Tools

Implemented tools:

- `query_financial_plan`
- `list_recent_transactions`
- `run_safe_readonly_sql`
- `get_dashboard_snapshot`
- `explain_metric`

Routing-only actions:

- `ask_clarification`
- `block_unsafe_request`

Forbidden tools:

- `append_sheet_row`
- `update_sheet_row`
- `delete_sheet_row`
- `admin_action`
- `oauth_action`
- `send_unvalidated_message`
- `execute_shell`

## SQL Sandbox Rules

- Only `SELECT`.
- Only allowlisted public table: `financial_events_public`.
- `LIMIT` is required.
- Blocks write commands, DDL, PRAGMA, ATTACH, transactions and comments.
- Blocks sensitive identifiers.
- Uses an in-memory database loaded with scoped public rows.
- Returns limited rows only.

## Planner Gemini

The graph has a Gemini planner adapter, but it is disabled by default:

- `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=false` or unset: no planner call.
- `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`: Gemini may propose a tool call.

The planner receives only:

- the user question;
- the current reference date for relative periods;
- the public table contract;
- allowed tools;
- safety rules.

It does not receive spreadsheet rows, raw results, user IDs, sheet IDs, tokens, OAuth data or private URLs.

Planner output is untrusted. It must pass `normalizePlannerPlan`. SQL plans must also pass `validateSafeReadonlySql` before execution.

Relative periods such as `hoje`, `ontem`, `este mes` and `do mes` must be interpreted from the reference date supplied by code in `America/Sao_Paulo`, not guessed by the model or derived from the server UTC day. Generic words such as `lancamento`, `movimento` and `transacao` mean public financial events unless the user restricts the event type.

## Verifier Rules

The verifier blocks:

- Empty answer.
- Internal identifiers or sensitive terms.
- Currency values not present in tool results.
- Percentages not present in tool results.
- Invalid percentage math for percentage and comparison results.
- Unsupported row-count claims.
- "Latest" answers that do not reference the first row from a descending recent-transaction result.
- Trend/ranking labels presented in a different order than the tool result.

Verifier expansion still required before broad conversational composition should check:

- oldest-specific wording when the planner starts producing oldest queries;
- richer claim contracts for future Gemini-written prose;
- source/citation references if the composer becomes LLM-based.

## Current Slice

Implemented:

- LangGraphJS dependency and ESM runtime boundary.
- Family Mode access gate behind `FAMILY_MODE_ENABLED`.
- Gemini planner adapter behind `FINANCIAL_AGENT_LLM_PLANNER_ENABLED`, disabled by default.
- `financial_events_public`.
- Safe SQL validator and in-memory sandbox.
- Recent transactions tool.
- Query Engine tool fed only by an already validated `FinancialQueryPlan`.
- Dashboard snapshot and metric explanation tools.
- Result verifier.
- Strong verifier checks for percentages, row-count claims, latest ordering and trend/ranking label order.
- WhatsApp integration behind `FINANCIAL_AGENT_MODE`.
- Official Financial Query Acceptance battery executed through the agent with 265/265 accepted, 23 security blocks, 238 verified answers and zero Gemini calls.
- Novel planner dry-run battery with safe sample plans and live mode gated by explicit `--live --max-calls N`.
- Novel planner live battery supports `--case <ID>` for targeted gap revalidation with minimal Gemini calls.
- Tests for public rows, SQL sandbox, tools, verifier, runtime and activation gate.

Not yet implemented:

- Production activation of the Gemini planner; the adapter exists but remains disabled.
- A broad live novel free-form battery focused specifically on Gemini-planned SQL/tool calls. The first short live check used 6 calls total and only validates the initial gate, not production `answer`.
- Production deployment of the expanded tool set in this slice.
- Deactivation workflow for non-family users.

## Acceptance For This Slice

- Default mode is `off`.
- `shadow` cannot change user-facing answer.
- `answer` cannot use planner-gap clarification to bypass the legacy route.
- Agent rows do not expose internal IDs.
- Agent tool results do not expose internal IDs.
- SQL sandbox rejects non-public tables and unsafe commands.
- A latest-gasto question can be answered through LangGraph with verified output.
- All official Financial Query Acceptance cases pass through the graph without Gemini.
