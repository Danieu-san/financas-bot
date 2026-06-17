# Financial Agent Answer Rollout Runbook

Use this runbook when observing, enabling, reverting or auditing `FINANCIAL_AGENT_MODE`.

This runbook covers only the read-only LangGraph financial agent. It does not approve write flows. Financial writes remain governed by Interpretation Reliability.

## Safe Defaults

Production default:

```text
FINANCIAL_AGENT_MODE=shadow
FINANCIAL_AGENT_LLM_PLANNER_ENABLED=false
INTERPRETATION_RELIABILITY_MODE=shadow
```

`answer` must not be enabled globally until ADR-005 gates pass.

## Pre-Change Checklist

- [ ] Read `docs/decisions/ADR-004-family-langgraph-financial-agent.md`.
- [ ] Read `docs/decisions/ADR-005-financial-agent-answer-rollout-gates.md`.
- [ ] Confirm `npm test` passed for the current code.
- [ ] Confirm production health is good.
- [ ] Confirm `.env` backup path is ready.
- [ ] Confirm rollback command is ready.
- [ ] Confirm `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=false` unless separately approved.

## Check Current Production Mode

On EC2:

```bash
cd /home/ubuntu/financas-bot
grep -E '^(FINANCIAL_AGENT_MODE|FINANCIAL_AGENT_LLM_PLANNER_ENABLED|INTERPRETATION_RELIABILITY_MODE)=' .env
```

Expected during observation:

```text
FINANCIAL_AGENT_MODE=shadow
FINANCIAL_AGENT_LLM_PLANNER_ENABLED=false
INTERPRETATION_RELIABILITY_MODE=shadow
```

## Revert To Shadow

Use this when `answer` was enabled before gates, when a stop rule fires or when returning to normal observation.

```bash
cd /home/ubuntu/financas-bot
cp .env /home/ubuntu/financas-bot-backups/.env-YYYYMMDDTHHMMSS-before-financial-agent-shadow-revert
sed -i 's/^FINANCIAL_AGENT_MODE=.*/FINANCIAL_AGENT_MODE=shadow/' .env
pm2 restart financas-bot --update-env
pm2 logs financas-bot --lines 180 --nostream
curl -s http://127.0.0.1:8787/dashboard/health
```

Expected:

- PM2 process is online.
- Logs reach `Bot pronto para receber mensagens!`.
- Dashboard health returns `{"ok":true,"sqlite":true}`.
- `FINANCIAL_AGENT_MODE=shadow` appears in `.env`.

## Shadow Evidence To Collect

Collect only sanitized telemetry. Do not copy raw financial messages into docs unless explicitly needed and approved.

Track:

- tool selected;
- action (`answer`, `clarify`, `block`, `gap`);
- verifier result;
- result row count;
- whether legacy answered correctly;
- whether the agent would have been better;
- whether any stop rule fired.

Minimum evidence before global `answer`:

- 50 real sanitized shadow decisions over at least 7 calendar days;
- 10 cases for `list_recent_transactions`;
- 10 cases for `run_safe_readonly_sql`;
- 10 cases for dashboard/explain style questions after those tools exist;
- zero critical verifier, scope or privacy failures.

## Recommended Manual Smoke In Shadow

Ask from Daniel first:

```text
qual foi meu ultimo lancamento?
qual foi meu ultimo gasto?
qual foi minha ultima entrada?
em que dia foi meu ultimo lancamento?
quanto gastei esse mes?
me explica de onde veio esse total
```

Expected:

- Shadow logs show the financial agent decision.
- Legacy may still answer; do not enable global `answer` based only on these questions.
- Any generic fallback becomes a capability gap to route through the agent, not a phrase-specific patch.

## If A Manual Answer Looks Correct

Record it as evidence, but do not keep global `answer` enabled unless ADR-005 gates are met.

One successful session means:

- the tool is promising;
- the verifier likely handled that case;
- the next step is more shadow observation or scoped allowlist.

It does not mean:

- all users are covered;
- all analytical domains are covered;
- global answer mode is safe.

## Stop Rules

Revert to `shadow` immediately if:

- a value is invented or cannot be traced to tool output;
- scope is wrong;
- any internal ID, token, prompt, private URL or raw row leaks;
- prompt injection reaches a tool;
- verifier blocks a response that would otherwise have been sent;
- WhatsApp becomes unstable after the flag change.

## Post-Change Verification

Run:

```bash
pm2 status
pm2 logs financas-bot --lines 180 --nostream
curl -s http://127.0.0.1:8787/dashboard/health
```

Confirm:

- PM2 online;
- WhatsApp ready;
- health OK;
- no new repeated errors;
- no sensitive values in newly generated logs;
- `state_store.json` was not polluted by tests.
