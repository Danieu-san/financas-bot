# Phase 9C.0 - Pluggy live read-only staging readiness gate - 2026-07-15

## Verdict

`GO` for the local client and encrypted staging boundary.

`NO-GO` remains in force for a real API probe until the Client Secret has an
explicitly authorized secure destination. It also remains in force for runtime
integration, scheduling, ledger, Sheets, WhatsApp, reconciliation and paid
Pluggy resources.

## Implemented boundary

- fixed Pluggy API origin and explicit allowlist;
- the only POST is `/auth`; all data endpoints are GET-only;
- item discovery by listing is not attempted because item IDs must be retained
  by the customer;
- mappings require four distinct local aliases and owner scopes;
- Accounts, v2 Transactions, Investments and Bills are normalized separately;
- card balance, used limit and formal bill total cannot be conflated;
- an unavailable Bills endpoint remains unavailable and never becomes zero;
- raw item/account IDs and financial payloads are encrypted at rest in an
  isolated SQLite staging vault;
- revocation creates a tombstone, removes the staged payload and blocks replay;
- the probe requires both an explicit command confirmation and an opt-in
  environment flag;
- the code is not imported by the bot, PM2, cron or the WhatsApp runtime.

## Evidence

- Dedicated live-readiness tests: `5/5`.
- Combined Open Finance gate: `23/23`.
- Fixture-only polling E2E: `GO`.
- Full repository suite: `916/916`.
- Probe with live flag disabled: failed closed with
  `pluggy_live_read_disabled`.
- Real network requests, persisted Pluggy credentials and financial writes:
  `0`.

## Secret handling decision still required

The removable E: volume was observed without BitLocker. The Client Secret must
not be silently persisted there. Before the first real probe, choose one of:

1. enable BitLocker on E: and keep the untracked secret on the encrypted
   workspace volume; or
2. keep the secret in the Windows credential store on this notebook and enter
   it again on the other notebook.

The secret must never be committed, printed in logs, written to handoff files or
copied by the portable Codex package.

## Next gate

After the secret destination is authorized, capture the four item IDs without
printing them, run one explicit read-only probe, verify four isolated aliases,
Bills/Investments availability, encrypted staging, zero writes and revocation.
