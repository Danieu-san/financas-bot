# Phase 3F.1G - Offline Shadow Decision - 2026-07-10

## Decision

Gate G is `GO` locally. Gate 3F.1H remains `NO-GO`: it still requires an explicit
read-only deployment decision, authorized-couple canary allowlist, and manual
WhatsApp E2E.

## Scope and Safety

- Synthetic SQLite fixtures only.
- Initial offline evidence used 0 Gemini calls. The subsequent bounded live
  evidence used synthetic SQLite fixtures only.
- Real financial writes: 0.
- Production, EC2, WhatsApp, Google Sheets, and rollout flags: unchanged.

## Evidence

- Golden corpus: 60 cases, 59 executed, 1 intentional unavailable-source fault
  injection, 0 baseline gaps, 0 Gemini calls.
- Focused agent, cost, golden, and novel-planner tests: 81/81 passed.
- Full local suite: 731/731 passed.
- Migration-gap battery: 6/6 accepted, 0 missing gaps, 0 unsafe telemetry.
- Stratified novel planner dry-run: 12/12 accepted, 0 Gemini calls.

## Bounded Live Evidence

- Stratified live planner sample:
  `data/qa-runs/FAGENT_NOVEL_20260710114630/financial-agent-novel-planner-report.json`.
  It accepted 6/6 synthetic cases with 0 gaps, 4 real model calls, 3,574 input
  tokens, 184 output tokens, estimated cost USD 0.0015322, p50 1,200 ms and
  p95 3,478 ms.
- Critical follow-up cases: budget passed deterministically in
  `FAGENT_NOVEL_20260710115315`; the final named-goal case passed
  deterministically in `FAGENT_NOVEL_20260710120418`.
- Across the Gate G live investigation, six model calls were bounded by the
  per-question cap and cost an estimated USD 0.0023413. The persistent monthly
  guard ended at 13/240 reserved calls, including pre-telemetry attempts.

## Blind Divergence Review

- Eight synthetic records were reviewed against their expected action, safe
  tool family, verifier outcome, scope isolation and no-write rule without
  labeling deterministic versus model-planned routes. The final reviewed set
  accepted 8/8 with no unexplained divergence.
- `REL-001` initially appeared as a gap only because the battery accepted SQL
  but not the equivalent verified `query_financial_plan` route. The contract
  now accepts both safe routes.
- `NOVEL-016` initially failed closed twice as `invalid_financial_query_plan`.
  The failure produced no answer or write. Regression coverage added goal-plan
  normalization and a deterministic named-goal fallback; the final run passed
  with zero model calls.

## Corrections Validated

- A trusted dashboard or goals plan now has precedence over a generic account
  keyword heuristic.
- The golden corpus evaluates the explicit follow-up `e no mes passado?` with a
  sanitized analytical checkpoint, matching the two-message WhatsApp behavior.
- Cost telemetry remains measured while the legacy-reduction gate emits only
  sanitized unit names in its public report.

## Next Gate 3F.1H

Gate 3F.1H requires an explicit read-only deployment decision, authorized-couple canary
allowlist, and manual WhatsApp E2E. None of those actions were performed here.
