# ADR-005: Financial Agent Answer Mode Requires Evidence-Gated Rollout

## Status

Accepted

## Date

2026-06-16

## Context

ADR-004 made LangGraphJS the final orchestration runtime for read-only financial analysis. The first production rollout intentionally used `FINANCIAL_AGENT_MODE=shadow`: the agent observes, plans, calls safe read-only tools, verifies the result and logs sanitized telemetry, but the legacy path still sends the WhatsApp answer.

On 2026-06-16, Daniel asked natural questions such as "qual foi o meu ultimo lancamento?" and the legacy analytical path returned the generic fallback. The shadow agent had already produced a verified read-only answer with `list_recent_transactions`, which showed that the new agent can cover this gap. `FINANCIAL_AGENT_MODE=answer` was temporarily enabled to validate the user-facing answer for Daniel.

That manual success is useful evidence, but it is not enough to enable `answer` globally. Only Daniel sent messages during this observation window. No evidence was collected from Thais or other active users, and the planned shadow gates were not yet complete.

## Decision

Production default remains:

```text
FINANCIAL_AGENT_MODE=shadow
FINANCIAL_AGENT_LLM_PLANNER_ENABLED=false
INTERPRETATION_RELIABILITY_MODE=shadow
```

Do not enable global `FINANCIAL_AGENT_MODE=answer` only because one manual session worked. Answer mode is read-only, but it is still user-facing behavior and must be rolled out with explicit evidence gates.

The next acceptable step is controlled observation in `shadow`. If we need a narrower user-facing rollout before full `answer`, implement a scoped allowlist mode instead of changing the global flag.

## Definitions

`FINANCIAL_AGENT_MODE=shadow`:

- The read-only agent evaluates analytical messages.
- It may call safe read-only tools.
- It logs sanitized telemetry.
- It does not replace the WhatsApp response.

`FINANCIAL_AGENT_MODE=answer`:

- The read-only agent may replace the WhatsApp analytical response when the verifier approves.
- It must never write financial data, run admin actions, perform OAuth actions or call shell/network tools outside its allowlisted tool surface.

`INTERPRETATION_RELIABILITY_MODE=shadow|enforce`:

- Separate rollout for financial writes.
- Must not be conflated with the read-only financial agent answer rollout.

## Gates Before Global Answer Mode

Global `answer` requires all of the following:

- `npm test` passes.
- Financial Agent acceptance battery passes for the relevant tool set.
- No critical verifier failures in shadow telemetry.
- No cross-user scope leak, internal ID leak, prompt leak, token leak or raw row leak.
- At least 50 real sanitized shadow decisions over at least 7 calendar days, unless a documented emergency exception is approved.
- At least 10 real or replayed cases for `list_recent_transactions`.
- At least 10 real or replayed cases for `run_safe_readonly_sql`.
- At least 10 real or replayed cases for dashboard/explain style analytical questions, after those tools exist.
- Manual review of representative shadow gaps and answers.
- Production config backup and rollback command prepared before changing the flag.
- `FINANCIAL_AGENT_LLM_PLANNER_ENABLED` remains false unless a separate gate approves live LLM planning.

## Rollout Stages

1. Keep `shadow` in production and observe sanitized telemetry.
2. Implement more read-only tools needed by the plan, especially Query Engine wrapper, dashboard snapshot and explain metric.
3. Run the agentic acceptance battery and fix capability gaps, not phrase-by-phrase bugs.
4. If needed, add a scoped user/tool allowlist for answer mode, starting with Daniel and `list_recent_transactions`.
5. Enable global `answer` only after gates pass.
6. Keep financial writes under Interpretation Reliability; do not route writes through the read-only agent.

## Stop Rules

Immediately revert to `shadow` if any of these occur:

- Invented amount, date, category, person or account.
- Wrong scope or cross-user data exposure.
- Prompt injection reaches a tool.
- Internal fields appear in a response or log.
- Verifier rejects a response that would otherwise be sent.
- WhatsApp/PM2 instability appears after the flag change.
- Gemini planner is accidentally enabled in production without its own gate.

## Operational Rule For Agents

If production is found with `FINANCIAL_AGENT_MODE=answer` before the gates are satisfied, the correct default action is to:

1. Back up `.env`.
2. Revert `FINANCIAL_AGENT_MODE=shadow`.
3. Restart PM2 with `--update-env`.
4. Verify WhatsApp ready, dashboard health and logs.
5. Record the reason and evidence in the runbook or current state.

Do not treat a single successful manual answer as permission to keep global `answer` enabled.

## Consequences

- We preserve the benefit of the shadow evidence without turning one good interaction into an uncontrolled rollout.
- The bot can still answer through legacy deterministic routes while the agent gathers data.
- User trust is protected: read-only mistakes are less dangerous than write mistakes, but wrong financial answers still matter.
- Future agents have an explicit gate and do not need to rediscover this trade-off.
