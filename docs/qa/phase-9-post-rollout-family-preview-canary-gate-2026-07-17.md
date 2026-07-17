# Post-Phase 9 - family preview canary gate - 2026-07-17

## Verdict

`GO` for persistent encrypted family preview in canary mode.

Remote preview read/review, `salvar <referencia>` and every Open Finance
financial write remain `NO-GO`.

## Operational revocation proof

- The operational caller resolves staging, baseline, outbox, journal and
  preview from the environment.
- Canary mode requires every database to exist before any store is opened.
- Missing preview fails before a revocation can be recorded.
- The integration revokes only the restored copy and uses a journal inside the
  temporary restore directory.
- Stores close once in reverse order; a close failure does not prevent the
  remaining stores from closing.
- No provider consent was revoked and the real journal remained unchanged.

## Evidence

- Local commit `c902bc5`; EC2 commit `a05b250` applied with `format-patch/git am`.
- Common tree: `ae101dc4aa121c631cb9ac0c54f40cf3676e588e`.
- Syntax checks passed for the runtime, operational gate and focused test.
- Focused gate tests: `2/2` local.
- Directly affected Open Finance tests: `14/14` local and `14/14` on EC2.
- Backup v3: four databases, parity true, 30-day retention, secret absent,
  revocation integration true and temporary restore cleanup true.
- Private preview directory mode `0700`; database mode `0600`.
- Two `.env` rollback backups exist with mode `0600`.

## First persistent cycle

- Flags: preview `canary`, reconciliation `canary`, financial writes `off`.
- Runtime: `GO`, nine new observations, four accepted-unconfirmed alerts, zero
  retries and zero financial writes.
- Private preview: one pending encrypted case and zero reviewed cases.
- Real revocation journal: zero revocations.
- Outbox: three pending and zero in-flight. No extra cycle was forced, avoiding
  additional WhatsApp deliveries during the gate.
- PM2 online, WhatsApp ready and health `ok=true/sqlite=true`.

Accepted-unconfirmed alerts belong to the pre-existing read-only alert channel;
they do not expose private preview read or review. No handler or remote endpoint
was enabled for the preview store.

## Rollback

Set `OPEN_FINANCE_SHADOW_PREVIEW_MODE=off` and restart `financas-bot`. Keep the
private database and protected `.env` backups for diagnosis or restore. The
rollback does not require enabling writes or deleting financial state.

## Next gate

Observe the next natural polling cycle without forcing delivery. Confirm health,
zero financial writes, journal integrity and preview retention. Any remote review
surface or `salvar <referencia>` requires a separate explicit gate.
