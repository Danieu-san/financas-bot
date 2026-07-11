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
