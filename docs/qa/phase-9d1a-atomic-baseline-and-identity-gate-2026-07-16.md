# Phase 9D.1a - atomic baseline and identity gate - 2026-07-16

## Verdict

`GO` for encrypted identity, lineage and silent baseline.

`NO-GO` remains for alert outbox, WhatsApp, autonomous scheduler and every
financial write.

## Incorporated adversarial conditions

- provider observation identity is separate from the stable external event;
- provider ID changes can become confirmed aliases only with a strong reference;
- weak replacements remain `possible_replacement` and create no alert;
- reconnecting a changed Item requires a new sync generation and silent baseline;
- a collection is accepted only after complete pagination, zero blocking warning
  and healthy Accounts/Transactions sources;
- baseline observations and completion timestamps commit in one SQLite
  transaction;
- `PENDING` observations are stored but never become write candidates;
- raw observations use AES-256-GCM and identifiers remain HMAC references.

## Evidence

- baseline tests `6/6`;
- live client tests `7/7`, including 2,205 rows across five pages and a blocking
  warning on an intermediate page;
- combined Open Finance gate `38/38`;
- full repository suite `931/931`;
- real baseline: 4 Items, 2,205 observations, 179 `PENDING`, zero alerts and zero
  financial writes;
- immediate real replay: zero new observations, zero replacements and zero
  alerts;
- runtime, WhatsApp, scheduler, Sheets and ledger connections `0`.

## Remaining conditions

9D.1 is not complete. The next slices must still prove lifecycle classification,
card/bill-payment semantics, retention, restore and an outbox that performs no
send. Merchant and provider category cannot be required because the free route
must remain independent of Pro features.
