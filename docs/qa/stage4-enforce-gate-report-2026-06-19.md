# Stage 4 enforce gate report - 2026-06-19

## Context

This report records the post-hotfix status of the safe migration plan toward
`INTERPRETATION_RELIABILITY_MODE=enforce`.

The system must remain in `shadow` until the readiness gates are met. This
report does not authorize `enforce`.

## What was validated before this report

- Stage 4 recut used Daniel on WhatsApp with marker
  `TESTE_APAGAR_STAGE4_RECENT_20260619T125005Z`.
- The verified `list_recent_transactions` tool answered the latest transaction
  question using insertion order as same-day tie-breaker.
- Cleanup confirmed zero marker residue in the user sheet, central sheet and
  SQLite public read model.
- Production remained with `FINANCIAL_AGENT_MODE=shadow` and
  `FINANCIAL_AGENT_SHADOW_RECENT_ANSWER_ENABLED=true`.

## Shadow telemetry interpretation

The readiness monitor found historical critical divergences from 2026-06-16.
Those divergences are evidence and must not be deleted.

However, the root cause was corrected later by preserving deterministic
provenance for critical write fields. After that fix, the gate needs a way to
evaluate a clearly documented post-fix observation window while keeping the old
telemetry available for audit.

## Change introduced

The readiness monitor now accepts an optional `since` timestamp:

```text
INTERPRETATION_RELIABILITY_READINESS_SINCE=2026-06-18T00:00:00.000Z
npm run report:interpretation-readiness
```

or:

```text
node scripts/reportInterpretationEnforceReadiness.js --since 2026-06-18T00:00:00.000Z
```

When `since` is configured:

- shadow telemetry before the timestamp remains stored;
- old entries are excluded only from the readiness gate;
- the report prints how many older shadow decisions were ignored for the gate;
- an invalid timestamp becomes a blocker.

## Current gate status

The correct operational status is still `KEEP_SHADOW`.

Known blockers before considering `enforce`:

- not enough post-fix shadow decisions;
- observation window is still shorter than the required window;
- operation coverage still needs enough clean examples for both
  `expense.create` and `income.create`;
- any remaining important/unknown divergence must be classified before manual
  review.

## Verification

Fresh local verification on 2026-06-19:

- `node --check` on changed JavaScript files passed.
- Focused reliability/daily-ops tests passed: 35/35.
- `npm test` passed: 454/454.
- `git diff --check` passed with only LF/CRLF warnings from Windows.
- NUL scan found no matches.
- `state_store.json` was restored to `{}` after tests.

The local sandbox blocked direct execution of the report script in this
session, so the post-deploy verification must run the report on the EC2 or in a
shell where the script can start normally.

## Next step

Deploy this monitor/report improvement without changing runtime flags. After
deploy, run the readiness report on production with the audited cutoff and keep
`enforce` disabled.

Do not activate `INTERPRETATION_RELIABILITY_MODE=enforce` until the readiness
report reaches manual review with the required post-fix sample and a human
review confirms the remaining telemetry.
