# ADR-004: Family Financial Agent Uses LangGraphJS As Final Orchestration Runtime

## Status

Accepted

## Date

2026-06-14

## Context

The product direction changed from broad multi-user beta to a private family assistant for Daniel and Thais. The previous Financial Query Engine migration made calculations deterministic, but the WhatsApp experience still exposed a weakness: natural questions that were not explicitly mapped could fall into legacy routes or generic fallback. This created the exact loop we wanted to avoid: fixing one phrase at a time.

The new target is a conversational financial assistant that can plan, call safe tools, verify results and respond naturally. The assistant must still avoid silent financial errors. Gemini can plan and write, but final values must come from deterministic tools.

Official LangGraphJS package documentation and local type definitions describe `StateGraph`, `Annotation`, `START` and `END` as the graph runtime primitives used to compose stateful workflows. The project keeps its CommonJS codebase stable by isolating LangGraphJS behind an ESM boundary.

## Decision

Use LangGraphJS as the final orchestration runtime for read-only financial analysis.

The architecture is:

```text
WhatsApp
-> Security Gate
-> LangGraph Financial Agent
-> Planner
-> Tool Router
-> Query Engine or SQL Sandbox or Dashboard Snapshot
-> Result Verifier
-> Conversational Composer
-> WhatsApp
```

The Query Engine remains valuable, but becomes a trusted tool, not the whole brain. A new `financial_events_public` SQLite view/table exposes only public, scoped fields for flexible read-only analysis. The SQL sandbox can answer new questions that the Query Engine does not yet cover, but only through validated `SELECT` queries over allowlisted public data.

Financial writes stay outside the read-only agent:

```text
Mensagem de escrita
-> Security Gate
-> Interpretation Reliability
-> confirmacao/esclarecimento
-> executor idempotente
-> recibo
```

## Alternatives Considered

### Keep expanding local intents only

Pros:

- Lowest dependency risk.
- Keeps all behavior deterministic.

Cons:

- Continues the phrase-by-phrase repair loop.
- Does not meet the target conversational experience.

Rejected as final architecture.

### Let Gemini read the whole sheet and answer directly

Pros:

- Most conversational in the short term.
- Handles unexpected questions with less code.

Cons:

- High risk of hallucinated totals, wrong filters, hidden prompt injection and uncontrolled cost.
- Hard to verify and audit.

Rejected.

### LangGraphJS plus deterministic tools and verifier

Pros:

- Allows flexible planning while preserving deterministic calculation.
- Gives us a durable runtime for future multi-step analysis.
- Keeps unsafe tools out of the read-only agent.

Cons:

- Adds dependency and orchestration complexity.
- Requires strict tool contracts and verification.

Accepted.

## Consequences

- `@langchain/langgraph` becomes a production dependency.
- LangGraph runs behind `src/agent/langGraphRuntime.mjs`; CommonJS files call it through `src/agent/financialAgent.js`.
- `FINANCIAL_AGENT_MODE=off|shadow|answer` controls rollout. `enforce` is accepted as an alias for `answer`.
- Default remains `off` until shadow data and tests justify enabling answer mode.
- The read-only agent must never expose `user_id`, `sheet_id`, tokens, OAuth data, prompts, raw rows or private URLs.
- The read-only agent must never execute writes, admin actions, OAuth actions, shell commands or unvalidated messages.
- Any response containing numbers must be verifiable against tool results before it is sent.

## Rollout

1. Land the agent in `off` by default.
2. Enable `shadow` locally and then in production to collect sanitized gaps.
3. Enable `answer` only for read-only analytical questions after verification.
4. Keep writes under Interpretation Reliability until a separate ADR decides otherwise.

## Sources

- LangGraphJS package README installed with `@langchain/langgraph@1.4.2`.
- LangGraphJS type definitions for `StateGraph`, `Annotation`, `START` and `END` in `node_modules/@langchain/langgraph/dist`.
