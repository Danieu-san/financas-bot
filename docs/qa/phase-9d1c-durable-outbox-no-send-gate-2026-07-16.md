# Phase 9D.1c - durable outbox without transport gate - 2026-07-16

## Verdict

`GO` for an encrypted, idempotent alert candidate outbox with no transport.

`NO-GO` remains for an actual WhatsApp message until the one-source canary
smoke passes.

## Evidence

- outbox tests `5/5` and baseline candidate queue test `1/1`;
- real completed baseline generated zero messages;
- immediate real replay generated zero messages;
- outbox persisted zero pending/in-flight/sent rows because the provider still
  exposes exactly the 2,205 baseline transactions;
- payloads use AES-256-GCM and clear columns contain HMAC references only;
- source visibility is fail-closed: Daniel sees only Daniel sources; Thais sees
  only Thais sources, including the distinct Cristina source;
- future installments and possible replacement identities are blocked;
- transport calls `0` and financial writes `0`.

## Delivery preparation

The canary delivery component uses a durable lease, retries failed transport,
recovers expired leases and stores only a pseudonymous WhatsApp acknowledgement.
It is dependency-injected and is not connected to the bot runtime or scheduler.
At-least-once delivery can duplicate a message after an ambiguous transport
crash; each message therefore includes a stable internal reference.
