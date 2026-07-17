# Post-Phase 9 - family preview hardening gate - 2026-07-17

## Verdict

`GO` for dark deployment with `OPEN_FINANCE_SHADOW_PREVIEW_MODE=off`.

`GO` local for the encrypted family persistence contract. Canary activation
still requires an EC2 database/backup v3 operational gate. `salvar <referencia>`
and every Open Finance financial write remain `NO-GO`.

## Family contract

- Daniel and Thais share one authorized family financial scope.
- Card or account ownership never determines who made a purchase.
- List, private read and review require one of their authorized WhatsApp IDs.
- A preview reference alone or a third WhatsApp cannot read or classify a case.
- `not_duplicate` is a classification only and grants no write permission.

## Safeguards

- Pending payloads refresh without extending the original 30-day retention.
- Reads, reviews, statistics and cleanup use the store clock, not caller time.
- Observations over five minutes in the future fail closed.
- Revoked generations are removed and delayed replay is rejected.
- The manual script persists only in canary mode with an available journal.
- Active-canary revocation fails if the preview store is unavailable.
- Reviewed cases stay closed and no longer count as reviewable on replay.

## Backup

- V2 remains compatible with exactly three databases.
- V3 adds `shadow-preview.sqlite` and reapplies revocation and retention.
- Backup SQLite copies are checkpointed and packaged without WAL/SHM sidecars.
- Undeclared physical files invalidate the package.

## Evidence

- changed-surface tests: `30/30`;
- complete Open Finance suite: `201/201`;
- final focused additions: `12/12`;
- EC2 changed-surface tests: `37/37`;
- production commits: `3e8fc7a` and `1489f9b`;
- health `ok=true/sqlite=true` and WhatsApp ready;
- preview mode `off` by default, preview DB unset and write mode `off`;
- first post-restart cycle: `new=4`, `accepted_unconfirmed=4`, `writes=0`;
- sanitized outbox: pending `0`, in-flight `0`, payloads exposed `0`;
- financial writes: `0`;
- production flags changed: none.

## Next gate

Provision the private preview database, prove backup v3 and exercise the real
revocation caller with canary mode before any preview activation. No remote
review and no financial write are enabled.

Completed by
`docs/qa/phase-9-post-rollout-family-preview-canary-gate-2026-07-17.md`.
