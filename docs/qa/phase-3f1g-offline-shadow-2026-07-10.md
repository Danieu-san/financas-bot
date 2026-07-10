# Phase 3F.1G - Offline Shadow Decision - 2026-07-10

## Decision

Offline evidence is ready. Final Gate G remains `NO-GO` until the bounded live
planner sample, blind divergence review, and Daniel read-only WhatsApp canary
are completed.

## Scope and Safety

- Synthetic SQLite fixtures only.
- Gemini calls: 0.
- Real financial writes: 0.
- Production, EC2, WhatsApp, Google Sheets, and rollout flags: unchanged.

## Evidence

- Golden corpus: 60 cases, 59 executed, 1 intentional unavailable-source fault
  injection, 0 baseline gaps, 0 Gemini calls.
- Focused agent, cost, golden, and novel-planner tests: 81/81 passed.
- Full local suite: 731/731 passed.
- Migration-gap battery: 6/6 accepted, 0 missing gaps, 0 unsafe telemetry.
- Stratified novel planner dry-run: 12/12 accepted, 0 Gemini calls.

## Corrections Validated

- A trusted dashboard or goals plan now has precedence over a generic account
  keyword heuristic.
- The golden corpus evaluates the explicit follow-up `e no mes passado?` with a
  sanitized analytical checkpoint, matching the two-message WhatsApp behavior.
- Cost telemetry remains measured while the legacy-reduction gate emits only
  sanitized unit names in its public report.

## Remaining Gate G Work

1. Run a short Gemini planner sample against synthetic fixtures with an explicit
   call cap and the configured monthly guard.
2. Review candidate-versus-baseline divergences without identifying which route
   produced each answer.
3. Confirm the approved cost and latency envelope from that sample.

## Next Gate

Gate H requires an explicit read-only deployment decision, Daniel-only canary
allowlist, and manual WhatsApp E2E. None of those actions were performed here.
