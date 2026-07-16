# Phase 9D.0 - Open Finance shadow preview gate - 2026-07-15

## Verdict

`GO` for deterministic shadow previews.

`NO-GO` for automatic matching, canonical writes, import or user-facing rollout.

## Evidence

- reconciler tests `5/5`;
- combined Open Finance gate `27/27`;
- full repository suite `921/921`;
- real preview examined 2,205 provider transactions against 17 local read-model
  candidates;
- 135 provider transactions fell inside the local canonical date window;
- one transaction was classified as `possible_duplicate` and zero as an
  automatic match;
- all 2,205 decisions were compatible with the Phase 3G reconciliation-link
  contract;
- output exposed only aggregate counts and HMAC references;
- runtime connections and financial writes `0`.

## Decision intelligence

The provider history is much broader than the local read-model. Therefore an
unmatched provider transaction is not evidence that the bot should import it.
It may predate the bot, be outside the household scope or use a different manual
description.

Exact amount, date, direction and strong text agreement may become `matched`.
Amount and date with different text remain only `possible_duplicate`. No
classification writes to ledger or Sheets.

## Next gate

Phase 9D.1 must add an encrypted, reviewable preview for the overlapping time
window and prove duplicate handling against manual imports. Phase 9E remains
blocked until read-only query behavior and rollback are tested behind an off-by-
default flag.
