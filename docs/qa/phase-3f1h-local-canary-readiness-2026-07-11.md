# Phase 3F.1H Local Canary Readiness - 2026-07-11

## Decision

`NO-GO` for completing 3F.1H. The local increment is ready to publish and
deploy, but the production and manual WhatsApp evidence is still pending.

## Implemented

- Atomic runtime configuration for `FINANCIAL_AGENT_MODE` and the authorized
  couple allowlist.
- Canary configuration requires exactly two unique members.
- `SIGHUP` applies mode changes and rollback without process restart or data
  migration. Invalid configuration or read failure preserves the prior state.
- Runtime and daily-operations logs expose only mode and allowlisted user count.
- Unverified canary answers preserve the legacy read-only fallback.
- Planner timeout or error becomes a safe planner miss.
- The general deterministic transaction fallback runs after Command Planner;
  explicit named-card routing retains priority.

## Local Evidence

- Financial state machine: `99/99`.
- Final focused agent, runtime, operations and cost checks: `85/85`.
- Full suite: `741/741`.
- Dependency audit at high severity: `0 vulnerabilities`.
- `git diff --check`: clean.
- No production flags, Google Sheets structure or financial data changed.

## Remaining Gate Evidence

1. Push the selective commit and deploy the inert code with the current answer
   mode preserved.
2. Apply canary for the authorized couple by `SIGHUP`, prove rollback to answer,
   then reopen the canary without restarting.
3. Validate EC2 restart, source unavailable, timeout, follow-up, cancellation,
   cost envelope, PM2, dashboard health and sanitized logs.
4. Execute real WhatsApp questions for both members through planner, tool,
   SQLite/read-model, verifier and answer.
5. Compare dashboard-backed answers using the same member, period, criterion and
   value; then record the final `GO/NO-GO`.

Writing promotion remains out of scope. Phase 4 has not started.

## First Restricted Production Canary Update

This update supersedes the earlier pending-production statement above. The gate
remains `NO-GO` because the first manual E2E found defects and must be repeated
after remediation.

### Production Evidence

- Commit `41e4b39` was pushed and deployed by fast-forward.
- Remote focused agent/runtime/operations checks: `85/85`.
- Remote state, follow-up, cancellation and cost checks: `106/106`.
- The authorized shared scope resolved to exactly two members without logging
  identifiers.
- Runtime transition `canary -> answer -> canary` passed through `SIGHUP`.
- PM2, WhatsApp readiness and dashboard/SQLite health passed.

### First Manual WhatsApp E2E

Passed:

- Both authorized members reached the restricted canary.
- A pending expense was cancelled before any write.
- Personal and family scopes resolved to one and two members respectively.

Failed:

- The contextual composer treated zero-based month indexes as human month
  numbers because the tool result lacked a human period label.
- A dashboard follow-up changed domain/metric instead of changing only period.
- A structured category filter became the string `[object Object]`, producing a
  false zero.
- An unrestricted recent-expense question was narrowed to card expenses.
- Full financial debug logging was active. It was disabled immediately in
  production and health remained green.

### Local Remediation

- Monthly periods carry a canonical human label and conflicting month claims
  fail verification.
- Dashboard checkpoints preserve their public metric and follow-ups may change
  only the requested period or explicitly requested metric.
- Planner filter wrappers are safely unwrapped; unsupported objects fail closed.
- Recent expenses include ordinary and card expenses unless explicitly limited.
- Deterministic dashboard and query answers include the selected period.
- Focused agent and local-classifier checks: `265/265`.
- Full suite after remediation: `746/746`.
- Dependency audit at high severity: `0 vulnerabilities`.
- `git diff --check`: clean.

### Remaining Evidence

1. Push and deploy the remediation while preserving the restricted canary and
   disabled full debug logging.
2. Repeat the real WhatsApp questions for both members.
3. Compare dashboard-backed answers using the same member, period, criterion and
   value; audit sanitized logs and record the final `GO/NO-GO`.
