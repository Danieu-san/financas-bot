# Phase 9B.0 - Pluggy sandbox staging gate - 2026-07-15

## Verdict

`GO` for an isolated local sandbox foundation.

This gate does not authorize a real Pluggy account, API credential, bank
consent, paid plan, network call, ledger write, Sheets write or WhatsApp
rollout.

## Commercial boundary

- The paid Pluggy Data API remains `NO-GO` for this project.
- Meu Pluggy plus Connector 200 remains only a candidate for free personal
  family usage, under ADR-009.
- Before any real consent, the project must confirm again that the free path
  is still available and supplies the minimum required read-only data.
- If free usage is unavailable, insufficient, requires a shared account or
  changes to a paid plan, implementation stops for a new product decision.
- No purchase or paid trial is implied by this gate.

## Implemented boundary

- Pluggy-shaped sandbox contract with strict `mode=sandbox` enforcement.
- Integer-cent normalization for balances, transactions and bills.
- Fixture-only adapter with no HTTP client and no network dependency.
- Dedicated SQLite staging database, not imported by the application runtime.
- HMAC references for provider identifiers; the HMAC secret is required and is
  not persisted by the store.
- Idempotent event replay and update/delete handling for transactions.
- Consent revocation cascade for staged items, accounts, transactions, bills
  and event references.
- Durable sanitized revocation tombstone that blocks delayed replay from
  repopulating a revoked item.
- Public staging statistics expose aggregate counts only.

## Evidence

- Focused contract/store tests: `5/5`.
- Disposable local E2E: `GO`.
- Full repository suite after the final replay protection: `898/898`.
- `git diff --check`: green.

E2E assertions:

- initial staging: one fictitious item, two fictitious accounts, two
  fictitious transactions and one fictitious bill;
- identical replay: idempotent;
- inconsistent account reference: rejected before staging;
- revocation: complete cascade;
- delayed replay after revocation: blocked;
- network calls: `0`;
- real accounts: `0`;
- financial writes: `0`;
- persisted secrets: `0`.

## Privacy and authority

The fixture contains invented sandbox data only. Raw descriptions may exist
inside the disposable staging database because future reconciliation requires
them, but no raw value is emitted by the public statistics or E2E report.
Staging has no authority over the ledger, Sheets, dashboard or WhatsApp.

## Rollback

The new modules are not connected to runtime configuration. Rollback is removal
or non-use of the isolated files. No production data migration is needed.

## Next safe slice

`9B.1` may add a mocked provider transport and webhook lifecycle behind the
same sandbox-only boundary. A real Pluggy sandbox credential or external
account requires a separate explicit decision because it creates external
state, even when no fee is charged.
