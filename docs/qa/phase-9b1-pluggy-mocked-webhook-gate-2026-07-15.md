# Phase 9B.1 - Pluggy mocked webhook gate - 2026-07-15

## Verdict

`GO` for the isolated mocked data-event lifecycle.

`NO-GO` remains in force for a public webhook endpoint, real Pluggy
credentials, a Pluggy account, bank consent, paid service, financial writes or
runtime activation.

## Official behavior characterized

The implementation models only Pluggy data events. Payment events are rejected.
The contract follows the provider guidance that webhook receivers acknowledge
quickly, process after acknowledgement and tolerate repeated delivery. Rate
limits become bounded retry decisions rather than blocking sleeps.

Authentication in this POC uses a project-owned high-entropy custom webhook
header, compared in constant time. It is not presented as a provider signature.

## Implemented boundary

- allowlist for item and transaction data events;
- explicit rejection of payment or unknown events;
- strict event, item and transaction identifier validation;
- maximum of 500 transaction references per event;
- immediate isolated `202` acknowledgement before staging work;
- fixture-only mock transport, with no HTTP/fetch path;
- controlled `429` simulation and bounded `retry_after_seconds`;
- item refresh into the 9B.0 staging contract;
- transaction deletion reflected through a refreshed mock snapshot;
- item deletion mapped to the revocation cascade;
- delayed item event remains blocked after revocation.

## Evidence

- Combined isolated Open Finance tests: `10/10`.
- Dedicated webhook tests: `5/5`.
- Mocked webhook E2E: `GO`.
- Full repository suite: `903/903`.
- `git diff --check`: green.
- Network calls: `0`.
- Real credentials/accounts: `0`.
- Financial writes: `0`.

## Known limitation

The POC separates acknowledgement from processing as two calls, but does not
yet expose an HTTP route or durable inbox/queue. Therefore it does not claim
restart-safe webhook delivery. Adding a public endpoint before a durable inbox,
secret rotation, replay retention and operational monitoring would be unsafe.

## Commercial boundary

Nothing in 9B.1 changes ADR-009. The paid Pluggy Data API remains rejected.
Any future real integration must first reconfirm that Meu Pluggy plus Connector
200 remains free and sufficient. If it does not, work stops for a user decision.

## Next safe slice

`9B.2` can implement a durable local webhook inbox and deterministic worker
using only fixtures. It must remain disconnected from Express and the public
internet until external account creation and the free-product boundary receive
explicit approval.
