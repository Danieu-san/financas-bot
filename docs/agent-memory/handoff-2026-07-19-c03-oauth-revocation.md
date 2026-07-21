# Handoff - C-03 OAuth revocation correction - 2026-07-19

## Workspace and scope

- Current workspace: `C:\\Users\\horus\\Documents\\FinancasBot\\financas-bot`.
- Branch: `main`.
- Latest committed checkpoints: `f4c1606` (C-01) and `c03f7d4` (C-02).
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

Implemented contract:

- append-only jobs with unique `revocation_id` and monotonic `generation`;
- result writes scoped by `user_id + revocation_id`;
- reconnect blocked while any job remains retryable;
- terminal lifecycle persisted and access denied even when local invalidation
  fails;
- hourly bounded recovery with exponential backoff, attempt cap and retention;
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

Next action: with `Codex -> Sol -> Extra Alto`, add an atomic leased claim tied
to result writes, use persisted `expires_at`, configure bounded SQLite waiting,
cover legacy migration and add concurrent `Promise.all`/two-worker tests. Then
repeat the complete local gates and submit a new immutable commit to a clean
Chat review. Do not deploy C-03 before local GO.

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
