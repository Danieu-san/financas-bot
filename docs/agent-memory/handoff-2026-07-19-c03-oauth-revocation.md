# Handoff - C-03 OAuth revocation correction - 2026-07-19

## Workspace and scope

- Current workspace: `E:\\Users\\horus\\Documents\\FinancasBot\\financas-bot`.
- Branch: `main`.
- Baseline before the correction: `bf7d291` (C-03 independent NO-GO record).
- Selective code/test correction commit: `606ae5b`.
- No push, deploy, production access, Google real access, or WhatsApp real access
  is authorized for C-03.
- Do not touch unrelated untracked artifacts. They predate or are outside this
  correction package.

## Exact C-03 state

The four adversarial RED contracts were reproduced and closed locally without
softening assertions. C-03 was published as immutable audit candidate
`6c91074138138dc6f55e7d6271708a299c087f50` and is not yet independently
approved.

Independent review confirmed that SHA and returned `NO-GO`. The blocking HIGH
is the absence of an exclusive atomic claim/lease: `pending` and
`remote_failed` can be obtained concurrently by two workers or by recovery
while the initial remote call is still in flight. Confirmed MEDIUM findings are
the runtime recomputation of retention instead of using persisted `expires_at`
and the absence of a legacy-schema migration/concurrency regression test. The
review was static and did not reproduce tests.

The NO-GO correction is implemented in commit `606ae5b`. Each
attempt receives an exclusive `lease_id`; the job is `in_progress` while the
lease is active, and only the current `user_id + revocation_id + lease_id` can
write its result. Initial revoke, retry and reconnect exclusion are serialized
with SQLite `IMMEDIATE` transactions and bounded `busy_timeout`. Active leases
cannot be recovered or expired, while stale results are discarded.

`expires_at` and `max_attempts` are persisted policy. Recovery no longer
recomputes them from current runtime values. Both the pre-versioned legacy
schema and the `6c91074` versioned schema are upgraded inside the same immediate
transaction and exercised by two concurrent Node processes.

Implemented contract:

- append-only jobs with unique `revocation_id` and monotonic `generation`;
- result writes scoped by `user_id + revocation_id + lease_id`;
- one atomic leased claim per attempt, including initial revoke and recovery;
- reconnect blocked while any job remains retryable;
- terminal lifecycle persisted and access denied even when local invalidation
  fails;
- hourly bounded recovery with persisted attempt cap and retention;
- retained encrypted token material cleared on success, expiry or exhaustion;
- sanitized logs with aggregate counts and constant error codes only.

Evidence in the current worktree: focused OAuth/lifecycle `30/30`; five directly
affected OAuth/audit harnesses `35/35`; scheduler `17/17`; updated negative
proof `4/4`. `node --check` passed for all nine touched JavaScript files and
`git diff --check` passed with only the existing LF/CRLF warnings. The standard
suite passed `1025/1025`; the hermetic runner passed `1140` with five expected
skips and zero failures while blocking external network; offline dependency
audit found zero vulnerabilities. `state_store.json` was restored without a
diff. Commit, independent review, push for immutable review and deploy remain
separate gates.

Evidence for the uncommitted NO-GO correction: adversarial RED `13/18` with the
five expected failures; focused OAuth/lifecycle GREEN `38/38`; five OAuth/audit
harnesses plus scheduler GREEN `52/52`; `node --check` for the four touched JS
files and `git diff --check` green. The recovery harness now reports
`pending_independent_review`. Full suite, hermetic runner and offline audit have
now also passed: standard suite `1033/1033`; hermetic runner `1153` total,
`1148` pass, five expected functional skips, zero failures, valid result and
external network blocked; offline audit found zero vulnerabilities. Tracked
state and logs were restored without a diff.

Next action: submit the final immutable audit head containing `606ae5b` and this
handoff to a clean Chat review. Do not deploy C-03 before independent GO.

## Files intentionally involved in the unfinished package

- `src/services/oauthTokenStore.js`
- `src/services/googleOAuthRevocationService.js` (new)
- `src/services/userService.js`
- `tests/auditGoogleNegativeProof.test.js`
- `tests/auditGoogleRevocationRecovery.test.js`
- `tests/googleOAuthService.test.js`
- `tests/userLifecycle.test.js`
- `docs/audit/correction-packets/2026-07-19-c03-oauth-revocation.md` (new)
- `docs/agent-memory/current-state.md`

## Transfer note

The portable-transfer package is under
`C:\\Users\\horus\\Documents\\FinancasBot\\Trabalho Codex no outro PC`.
It must preserve the current workspace state, but must not copy browser/session
credentials into the non-encrypted payload. Private Codex state is copied only
to the BitLocker vault after this Codex process releases its SQLite files.
