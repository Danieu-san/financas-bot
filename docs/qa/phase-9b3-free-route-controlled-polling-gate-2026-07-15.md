# Phase 9B.3 - free-route controlled polling gate - 2026-07-15

## Verdict

`GO` for a fixture-only polling policy aligned with the limitations of the free
Connector 200 route.

`NO-GO` remains in force for real credentials, external account creation,
consent, a production trial, a paid plan, runtime scheduling or financial
writes.

## Decision intelligence

Official Pluggy pricing says personal API access can remain free through Meu
Pluggy plus Connector 200, but that route lacks webhooks and commercial
guarantees. Therefore polling, not webhook delivery, is the correct technical
model for this project's zero-cost requirement.

The local policy permits at most one poll every six hours per item. This
corresponds to no more than four scheduled reads per day and avoids overlapping
executions. It is a conservative project policy, not a promise about the
provider's future quota.

## Implemented boundary

- HMAC item references in the polling state;
- lease token ownership to prevent overlapping executions;
- six-hour minimum interval;
- exponential failure backoff capped at six hours;
- provider rate-limit response converted to a scheduled retry;
- stale/wrong lease token cannot release another execution;
- successful polls write only to isolated staging;
- revoked item remains blocked.

## Evidence

- Dedicated polling tests: `4/4`.
- Combined isolated Open Finance gate: `18/18`.
- Fixture-only polling E2E: `GO`.
- Full repository suite: `911/911`.
- Network calls, credentials, real accounts and financial writes: `0`.

## Runtime status

The worker is not imported by the bot and is not registered in cron or PM2.
Deploying these files cannot initiate a Pluggy request.

## Remaining external decision

All useful local preparation for 9B is complete. The next meaningful step is
creating or using a Meu Pluggy/Dashboard account and confirming Connector 200
with an actual sandbox/consent flow. That changes external state and must not be
started automatically. Before approval, verify again that the personal route is
still free and does not silently enroll the project in the 14-day production
trial or a paid plan.
