# Canonical Ledger Phase 2 Gate - 2026-06-25

## Decision

- GO to prepare a joint Phase 1+2 deploy with canonical ledger flags disabled.
- NO-GO to enable production shadow projection in the same step.

The next safe operational move is a deploy with the new code inert, preserving the current production baseline. Shadow writes can be considered only after the deployed code passes production health, logs, state, and a rollback-by-flag drill.

## Baseline Preserved

Production check on 2026-06-25 confirmed:

- commit `853bdc3`;
- `FINANCIAL_AGENT_MODE=answer`;
- `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`;
- `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`;
- `INTERPRETATION_RELIABILITY_MODE=shadow`;
- PM2 `financas-bot` online;
- dashboard health `{"ok":true,"sqlite":true}`.

## Evidence

Focused ledger checks:

- `node --check src\ledger\canonicalLedgerProjector.js` passed.
- `node --check src\ledger\canonicalLedgerReceiptProjector.js` passed.
- `node --check src\ledger\canonicalLedgerCanaryRouter.js` passed.
- `node --check src\services\google.js` passed.
- `node --test tests\canonicalLedgerProjector.test.js tests\canonicalLedgerParityReport.test.js tests\canonicalLedgerShadowStore.test.js tests\canonicalLedgerRolloutPolicy.test.js tests\canonicalLedgerReceiptProjector.test.js tests\canonicalLedgerCanaryRouter.test.js` passed: 33/33.

Full local suite:

- `npm test` passed: 533/533.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `git diff --check`: no errors.
- NUL scan over `src`, `tests`, `scripts`, `docs`, `package.json` and `state_store.json`: no matches.
- `state_store.json`: `{}` after test cleanup.

Dry-run/parity with phone bill fixture:

- Run ID: `LEDGER_PHASE2_GATE_20260625`.
- Fixture: `data/qa-runs/LEDGER_PHASE2_GATE_20260625/canonical-ledger-phase2-gate-fixture.json`.
- Report: `data/qa-runs/LEDGER_PHASE2_GATE_20260625/canonical-ledger-dry-run-report.json`.
- Public projection: `data/qa-runs/LEDGER_PHASE2_GATE_20260625/canonical-ledger-public-projection.json`.
- Result: 17 events, 0 unexplained differences, `privacy_ok=true`.

Local shadow persistence:

- Run ID: `LEDGER_PHASE2_GATE_SHADOW_20260625`.
- Shadow DB: `data/qa-runs/LEDGER_PHASE2_GATE_SHADOW_20260625/canonical-ledger-shadow.sqlite`.
- Counts: 1 run, 17 events, 17 public rows.

Phone bill assertion:

- `Claro telefone` projected as `bill_payment`.
- `free_budget_eligible=false`.
- SQLite event `net_income_expense_impact=0`.

## Remaining Blockers Before Shadow Activation

1. Deploy the joint Phase 1+2 code with all canonical ledger flags disabled.
2. Confirm production health, PM2, logs and `state_store.json` after deploy.
3. Confirm canonical flags remain disabled after deploy.
4. Define and verify the production shadow DB path and backup location without printing financial data.
5. Run a rollback-by-flag drill on the deployed code, preserving the shadow DB.
6. Only then consider enabling:
   - `CANONICAL_LEDGER_PROJECTION_MODE=shadow`;
   - `CANONICAL_LEDGER_SHADOW_WRITE_ENABLED=true`;
   - `CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED=true`.

Canary reads remain out of scope until shadow writes have been observed and compared.

## Deploy Preparation With Flags Off

Deploy must preserve:

- `FINANCIAL_AGENT_MODE=answer`;
- `FINANCIAL_AGENT_LLM_PLANNER_ENABLED=true`;
- `FINANCIAL_CONTEXTUAL_ANALYST_MODE=answer`;
- `INTERPRETATION_RELIABILITY_MODE=shadow`.

Canonical ledger flags for the inert deploy:

```text
CANONICAL_LEDGER_PROJECTION_MODE=off
CANONICAL_LEDGER_SHADOW_WRITE_ENABLED=false
CANONICAL_LEDGER_PRODUCTION_SHADOW_APPROVED=false
CANONICAL_LEDGER_CANARY_READ_ENABLED=false
CANONICAL_LEDGER_CANARY_READ_APPROVED=false
CANONICAL_LEDGER_CANARY_READ_DOMAINS=
```
## Production Rollout - 2026-06-25

- Joint Phase 1+2 code deployed inert at commit `30b1bf4`.
- Inert verification passed: PM2 online, WhatsApp ready, health `{"ok":true,"sqlite":true}`, empty state and no new error-log writes.
- Production shadow path: `/home/ubuntu/financas-bot/data/canonical_ledger_shadow.sqlite`.
- Pre-shadow empty backup: `/home/ubuntu/financas-bot-backups/canonical-ledger/pre-shadow-empty-20260625-180241.sqlite`.
- Backup/restore preflight passed with 1 migration and 8 tables; the restore check used no real financial data.
- Rollback policy drill passed: shadow writes changed from allowed to denied and canary reads remained denied when the rollback environment was applied.
- Altissima review verdict: `GO` for controlled shadow writes after the inert deploy gates passed.
- Shadow activated at `2026-06-25 18:04 UTC` with projection/write/production approval enabled.
- Canary reads remain disabled with an empty domain allowlist.
- Baseline preserved: Financial Agent `answer`, Gemini Planner enabled, contextual analyst `answer`, interpretation reliability `shadow`.
- Immediate post-activation verification passed: no policy blockers, PM2 online, WhatsApp ready, health healthy, no new error-log writes and zero shadow rows before the first eligible committed write.

Rollback remains flag-only: set projection to `off`, both shadow approvals to `false`, keep canary flags `false`, restart PM2 and preserve the shadow database for audit.
