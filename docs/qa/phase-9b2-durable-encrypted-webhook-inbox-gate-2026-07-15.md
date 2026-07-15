# Phase 9B.2 - durable encrypted webhook inbox gate - 2026-07-15

## Verdict

`GO` for the isolated single-worker sandbox inbox.

This is a reliability characterization, not the planned production transport
for the free Connector 200 route. Official pricing states that Connector 200
does not provide webhooks, so the zero-cost path must use controlled read-only
polling instead.

## Implemented boundary

- durable SQLite webhook inbox;
- AES-256-GCM encrypted job payloads;
- provider item/event identifiers absent from cleartext inbox columns;
- HMAC item/event references for deduplication and lookup;
- immediate acknowledgement followed by durable processing;
- duplicate delivery suppression;
- bounded rate-limit retry with future availability time;
- claimed job recovery after process restart;
- successful jobs discard their encrypted payload;
- failed jobs discard their encrypted payload and retain an abstract reason.

## Evidence

- Dedicated inbox tests: `4/4`.
- Combined isolated Open Finance gate: `14/14`.
- Disposable restart E2E: `GO`.
- Full repository suite: `907/907`.
- Network, real credentials, real accounts and financial writes: `0`.

## Limitations

- single worker only; opening multiple concurrent store instances is not an
  approved deployment mode;
- no public route, HTTPS configuration or provider secret exists;
- no external Pluggy account or sandbox credential was created;
- this inbox is not required by Connector 200 because that free route lacks
  webhook delivery.

## Commercial decision

The paid Data API remains `NO-GO`. Connector 200 is technically available for
free personal API access, but lacks webhook, SLA, categorization and portable
history. The next implementation slice must therefore characterize polling and
cannot assume webhook availability.

## Next safe slice

`9B.3` should implement a fixture-only polling scheduler contract with token
reuse, rate-limit/backoff policy, overlap prevention and staging-only writes.
Real credentials remain blocked until the user explicitly approves creating an
external account after the free route is reconfirmed.
