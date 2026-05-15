# Implementation Plan: FinancasBot Personal Finance Operating System

## Direction Marker
Destination: personal finance operating system.

Path: reliable data-driven core first, then expand surfaces and automation.

Sources:

- `docs/decisions/ADR-001-product-direction-personal-finance-os.md`
- `docs/specs/financas-bot-general-product-spec.md`

## Overview
This plan turns the general product spec into small, verifiable tasks. The ordering intentionally favors foundation before expansion: test reliability, user/data integrity, deterministic financial logic, dashboard confidence, operations, and only then larger product surfaces.

## Architecture Decisions Carried Forward
- Keep WhatsApp as the daily capture and conversation interface.
- Keep Sheets as source/audit storage for the current stage.
- Keep SQLite as the read model until scale or operations justify Postgres.
- Use AI for parsing/fallback/language, not as the source of truth for calculations.
- Keep dashboard access tokenized and per-user for the current stage.
- Treat tests, logs, and admin commands as product infrastructure, not side work.

## Dependency Graph
```text
Direction ADR + General Spec
    |
    v
Test baseline + functional test stabilization
    |
    v
User/data integrity gates
    |
    v
Read-model correctness + deterministic calculations
    |
    +--> WhatsApp financial flows
    |
    +--> Dashboard/API confidence
    |
    v
Observability + admin safety + security hardening
    |
    v
Production shipping checklist
    |
    v
Future expansion: Postgres, richer roles, automation, dashboard editing
```

## Task List

### Phase 0: Baseline And Direction Control

#### Task 0.1: Create a project-wide baseline audit
**Type:** Core foundation

**Description:** Capture the current project state against the general spec so later work starts from facts, not memory.

**Acceptance criteria:**
- [ ] Audit lists current status for WhatsApp, Sheets, SQLite, dashboard, AI, admin, tests, logs, deploy.
- [ ] Audit identifies gaps as Core foundation, Product surface, or Future expansion.
- [ ] Audit references the direction marker from ADR-001.

**Verification:**
- [ ] Manual review of `docs/audits/`.
- [ ] `npm test`

**Dependencies:** None

**Files likely touched:**
- `docs/audits/general-project-audit.md`

**Estimated scope:** S

#### Task 0.2: Define stage gates for moving between skills
**Type:** Core foundation

**Description:** Document when we are allowed to move from planning to implementation, TDD, review, security, and shipping.

**Acceptance criteria:**
- [ ] Each gate has required evidence.
- [ ] Gates explicitly prevent skipping whole-project scope.
- [ ] Gates reference the general spec and ADR.

**Verification:**
- [ ] Manual review of gate checklist.

**Dependencies:** Task 0.1

**Files likely touched:**
- `docs/plans/agent-skill-stage-gates.md`

**Estimated scope:** S

### Checkpoint: Direction Control
- [ ] Direction marker is visible in audit and stage gates.
- [ ] No implementation has started before the plan is approved.
- [ ] Human approves next phase.

### Phase 1: Testing Foundation

#### Task 1.1: Split skipped functional smoke into focused functional tests
**Type:** Core foundation

**Description:** Replace the single large skipped functional smoke with smaller reliable tests that can run independently or in controlled mode.

**Acceptance criteria:**
- [ ] Functional tests are split by flow: consent/onboarding, expense/income, debt/goal, dashboard/admin.
- [ ] Each test has isolated setup and teardown.
- [ ] No test depends on execution order.

**Verification:**
- [ ] `npm test`
- [ ] `npm run test:functional` in controlled mode

**Dependencies:** Task 0.1

**Files likely touched:**
- `tests/functional.test.js`
- `scripts/runFunctionalTest.js`
- `scripts/resetSpreadsheetData.js`

**Estimated scope:** M

#### Task 1.2: Add user lifecycle regression tests
**Type:** Core foundation

**Description:** Cover PENDING, ACTIVE, INACTIVE, BLOCKED, DELETED, and EXPIRED behavior with small deterministic tests.

**Acceptance criteria:**
- [ ] PENDING user must see consent gate.
- [ ] BLOCKED/INACTIVE/DELETED users cannot use normal bot flows.
- [ ] ACTIVE user with current terms bypasses consent gate safely.

**Verification:**
- [ ] `node --test tests/unit.test.js`
- [ ] `npm test`

**Dependencies:** Task 1.1 can be parallel, but this task should land before security review.

**Files likely touched:**
- `tests/unit.test.js`
- `src/services/userService.js`
- `src/handlers/messageHandler.js`

**Estimated scope:** M

#### Task 1.3: Add deterministic tests for financial flow state machines
**Type:** Core foundation

**Description:** Cover the state transitions most likely to corrupt user data: payment method, credit selection, installments, batch confirmation, debt payment, deletion confirmation.

**Acceptance criteria:**
- [ ] Tests cover success and invalid input for each critical state.
- [ ] Tests assert state cleanup after successful completion.
- [ ] Tests assert records keep `user_id`.

**Verification:**
- [ ] `node --test tests/unit.test.js`
- [ ] `npm test`

**Dependencies:** Task 1.1

**Files likely touched:**
- `tests/unit.test.js`
- `src/handlers/messageHandler.js`
- `src/handlers/debtHandler.js`
- `src/handlers/deletionHandler.js`

**Estimated scope:** M

#### Task 1.4: Harden real WhatsApp E2E runbook and evidence capture
**Type:** Core foundation

**Description:** Make the real WhatsApp E2E easier to operate and diagnose by recording expected outputs, environment checks, and failure modes.

**Acceptance criteria:**
- [ ] Runbook explains setup, check, run, and recovery.
- [ ] E2E output is mapped to the production flow it validates.
- [ ] Known failure modes include QR, stale chat state, bot offline, timeout, and Sheets quota.

**Verification:**
- [ ] `npm run test:whatsapp:e2e:check`
- [ ] Manual review of runbook

**Dependencies:** Task 0.1

**Files likely touched:**
- `docs/whatsapp-real-e2e-runbook.md`
- `tests/manual_checklist.md`
- `scripts/checkWhatsappRealE2E.js`

**Estimated scope:** S

### Checkpoint: Testing Foundation
- [ ] `npm test` passes.
- [ ] Functional tests are no longer one large skipped blind spot, or there is a documented reason for any remaining skip.
- [ ] Real WhatsApp E2E remains opt-in and documented.
- [ ] Human approves moving to data integrity.

### Phase 2: User And Data Integrity

#### Task 2.1: Validate user_id enforcement at every write boundary
**Type:** Core foundation

**Description:** Audit and test every path that writes to Sheets or SQLite to ensure records cannot be created without a `user_id`.

**Acceptance criteria:**
- [ ] Expense, income, card, debt, goal, calendar/private event, dashboard data writes are covered.
- [ ] Missing `user_id` fails clearly before writing.
- [ ] Legacy handling remains explicit and does not weaken new-write rules.

**Verification:**
- [ ] `npm test`
- [ ] Targeted unit tests for write helpers

**Dependencies:** Task 1.3

**Files likely touched:**
- `src/handlers/messageHandler.js`
- `src/handlers/creationHandler.js`
- `src/handlers/debtHandler.js`
- `src/services/google.js`
- `tests/unit.test.js`

**Estimated scope:** M

#### Task 2.2: Stabilize state store semantics and recovery
**Type:** Core foundation

**Description:** Verify state TTL, atomic flush, stale onboarding cleanup, and restart recovery behavior.

**Acceptance criteria:**
- [ ] State TTL behavior is test-covered.
- [ ] Atomic flush behavior is documented/tested where practical.
- [ ] Completed onboarding clears stale onboarding state.

**Verification:**
- [ ] `node --test tests/unit.test.js`
- [ ] Manual restart smoke if state behavior changes

**Dependencies:** Task 1.2

**Files likely touched:**
- `src/state/userStateManager.js`
- `src/handlers/onboardingHandler.js`
- `tests/unit.test.js`

**Estimated scope:** M

#### Task 2.3: Define controlled test data strategy
**Type:** Core foundation

**Description:** Decide whether functional tests use production spreadsheet with reset, a dedicated test spreadsheet, or fakes. Document and implement the selected safe default.

**Acceptance criteria:**
- [ ] Strategy avoids accidental destructive production resets.
- [ ] Environment variables clearly separate production and test sheets.
- [ ] Test command fails safely if configuration is unsafe.

**Verification:**
- [ ] `npm run test:functional`
- [ ] Manual review of `.env` requirements without printing secrets

**Dependencies:** Task 1.1

**Files likely touched:**
- `scripts/runFunctionalTest.js`
- `scripts/resetSpreadsheetData.js`
- `docs/specs/financas-bot-general-product-spec.md`
- `tests/functional.test.js`

**Estimated scope:** M

### Checkpoint: User And Data Integrity
- [ ] No new financial write can occur without `user_id`.
- [ ] State recovery does not corrupt onboarding or financial flows.
- [ ] Functional test data strategy is safe and documented.

### Phase 3: Read Model And Deterministic Finance

#### Task 3.1: Audit SQLite read-model coverage against supported questions
**Type:** Core foundation

**Description:** Map every supported analytical intent to either SQLite/read-model, deterministic sheet fallback, or AI fallback.

**Acceptance criteria:**
- [ ] Matrix lists supported intents and data source.
- [ ] Any AI/raw-data fallback is justified.
- [ ] Missing common questions are identified.

**Verification:**
- [ ] Manual review of matrix.
- [ ] `npm test`

**Dependencies:** Task 2.1

**Files likely touched:**
- `docs/audits/read-model-coverage.md`
- `src/services/readModelService.js`
- `src/services/calculationOrchestrator.js`

**Estimated scope:** S

#### Task 3.2: Add read-model regression tests for common questions
**Type:** Core foundation

**Description:** Test total month, category month, list category, balance month, debts, goals, and dashboard summary using controlled SQLite data.

**Acceptance criteria:**
- [ ] Tests do not call Gemini.
- [ ] Tests do not read full Sheets tabs.
- [ ] Results are scoped by `user_id`.

**Verification:**
- [ ] `node --test tests/unit.test.js`
- [ ] `npm test`

**Dependencies:** Task 3.1

**Files likely touched:**
- `tests/unit.test.js`
- `src/services/readModelService.js`
- `src/services/sqliteReadModelService.js`

**Estimated scope:** M

#### Task 3.3: Add cost/latency routing metrics for AI vs deterministic paths
**Type:** Core foundation

**Description:** Make it visible when a message used local routing, SQLite, Sheets fallback, or Gemini.

**Acceptance criteria:**
- [ ] Logs/metrics distinguish deterministic and AI paths.
- [ ] Slow AI calls include intent/context but not private financial details.
- [ ] Metrics can support cost-reduction decisions.

**Verification:**
- [ ] `npm test`
- [ ] Manual PM2 log smoke after deploy

**Dependencies:** Task 3.1

**Files likely touched:**
- `src/handlers/messageHandler.js`
- `src/services/gemini.js`
- `src/utils/metrics.js`
- `src/utils/logger.js`

**Estimated scope:** M

### Checkpoint: Read Model
- [ ] Common questions are mapped and tested.
- [ ] `user_id` isolation is proven for read paths.
- [ ] Logs can show whether AI was used.

### Phase 4: WhatsApp Product Surface

#### Task 4.1: Normalize WhatsApp command UX
**Type:** Product surface

**Description:** Make common commands predictable: `ajuda`, `termos`, `dashboard`, `resumo`, settings, admin help, and unknown input.

**Acceptance criteria:**
- [ ] Help text reflects current capabilities.
- [ ] Unknown messages get a useful response without unnecessary AI.
- [ ] Commands are case/accent tolerant.

**Verification:**
- [ ] `npm test`
- [ ] Manual WhatsApp smoke for key commands

**Dependencies:** Task 1.2

**Files likely touched:**
- `src/handlers/messageHandler.js`
- `tests/unit.test.js`
- `tests/manual_checklist.md`

**Estimated scope:** M

#### Task 4.2: Improve onboarding resilience and re-entry
**Type:** Product surface

**Description:** Make onboarding restart/resume behavior clear for users and admins without spreadsheet editing.

**Acceptance criteria:**
- [ ] User can recover from wrong onboarding answer.
- [ ] Admin reset onboarding path remains safe.
- [ ] Onboarding parser tolerates common money formats.

**Verification:**
- [ ] `npm test`
- [ ] Manual WhatsApp onboarding smoke

**Dependencies:** Task 2.2

**Files likely touched:**
- `src/handlers/onboardingHandler.js`
- `src/handlers/messageHandler.js`
- `tests/unit.test.js`
- `tests/whatsapp-real-e2e.test.js`

**Estimated scope:** M

#### Task 4.3: Improve report and alert explainability
**Type:** Product surface

**Description:** Ensure financial health, cash radar, debt avalanche, and monthly reports include a short "why" line based on deterministic data.

**Acceptance criteria:**
- [ ] Alerts include reason/context.
- [ ] Debt recommendations show inputs used.
- [ ] Monthly report is concise enough for WhatsApp.

**Verification:**
- [ ] `npm test`
- [ ] Manual WhatsApp summary/report smoke

**Dependencies:** Task 3.2

**Files likely touched:**
- `src/services/financialHealthService.js`
- `src/services/debtAvalancheService.js`
- `src/handlers/messageHandler.js`
- `tests/unit.test.js`

**Estimated scope:** M

### Checkpoint: WhatsApp Surface
- [ ] Core WhatsApp commands feel predictable.
- [ ] Onboarding can recover from common mistakes.
- [ ] Alerts/reports explain themselves without being spammy.

### Phase 5: Dashboard Product Surface

#### Task 5.1: Verify dashboard API contracts
**Type:** Product surface

**Description:** Document and test `/kpis`, `/cashflow`, `/debts`, `/goals`, `/alerts`, and `/summary` response shapes.

**Acceptance criteria:**
- [ ] Each endpoint has expected response shape documented.
- [ ] Invalid/expired token returns safe error.
- [ ] All endpoints scope data by token user.

**Verification:**
- [ ] `npm test`
- [ ] Local `curl` smoke with valid and invalid token

**Dependencies:** Task 3.2

**Files likely touched:**
- `src/services/dashboardServer.js`
- `src/utils/dashboardAuth.js`
- `tests/unit.test.js`
- `docs/specs/financas-bot-general-product-spec.md`

**Estimated scope:** M

#### Task 5.2: Align dashboard UI with product direction
**Type:** Product surface

**Description:** Ensure the dashboard is a clear personal finance overview, not just raw charts.

**Acceptance criteria:**
- [ ] Dashboard supports user/month period selection where appropriate.
- [ ] Visual hierarchy shows saldo, fluxo, categorias, dívidas, metas, alertas.
- [ ] Empty states are useful for new users.

**Verification:**
- [ ] Manual browser check on desktop and mobile widths.
- [ ] Console has no production errors.

**Dependencies:** Task 5.1

**Files likely touched:**
- `src/services/dashboardServer.js`
- Dashboard static assets if present
- `tests/manual_checklist.md`

**Estimated scope:** M

#### Task 5.3: Keep spreadsheet dashboard as audit overview, not primary product UI
**Type:** Product surface

**Description:** Define the role of the Google Sheets dashboard versus the web dashboard to avoid duplicated product effort.

**Acceptance criteria:**
- [ ] Sheets dashboard is documented as admin/audit overview.
- [ ] Web dashboard is documented as user-facing view.
- [ ] Any Sheets formatting automation is safe and optional.

**Verification:**
- [ ] Manual review of docs.
- [ ] If scripts change: dry-run or controlled test sheet.

**Dependencies:** Task 5.2

**Files likely touched:**
- `docs/specs/financas-bot-general-product-spec.md`
- `docs/manual_checklist.md` or `tests/manual_checklist.md`
- Spreadsheet formatting scripts if retained

**Estimated scope:** S

### Checkpoint: Dashboard
- [ ] Dashboard API contracts are tested.
- [ ] Dashboard is clearly user-facing.
- [ ] Sheets dashboard role is not confused with product dashboard.

### Phase 6: Admin, Observability, And Operations

#### Task 6.1: Add admin command safety review
**Type:** Core foundation

**Description:** Review admin commands for missing confirmation, audit logs, and unsafe actions before adding more users.

**Acceptance criteria:**
- [ ] Each admin command has purpose, permissions, log fields, and risk level.
- [ ] Destructive or lifecycle-changing commands are reviewed for confirmation need.
- [ ] Admin help output matches implementation.

**Verification:**
- [ ] `npm test`
- [ ] Manual WhatsApp admin smoke

**Dependencies:** Task 1.2

**Files likely touched:**
- `src/handlers/messageHandler.js`
- `src/utils/adminCheck.js`
- `tests/unit.test.js`
- `docs/audits/admin-command-audit.md`

**Estimated scope:** M

#### Task 6.2: Add production health checklist
**Type:** Core foundation

**Description:** Create a repeatable checklist for EC2/PM2 production health after deploys and incidents.

**Acceptance criteria:**
- [ ] Checklist includes PM2 status, logs, dashboard health, read-model sync, WhatsApp ready, and E2E smoke.
- [ ] Checklist distinguishes old log noise from current failures.
- [ ] Checklist includes rollback command path.

**Verification:**
- [ ] Manual dry-run on EC2.

**Dependencies:** Task 0.2

**Files likely touched:**
- `docs/runbooks/production-health.md`
- `docs/whatsapp-real-e2e-runbook.md`

**Estimated scope:** S

#### Task 6.3: Make metrics actionable
**Type:** Core foundation

**Description:** Turn existing metrics into actionable production signals for slow AI, failed Google auth, failed read-model sync, dashboard errors, and WhatsApp readiness.

**Acceptance criteria:**
- [ ] Metrics include counters/timings for critical integrations.
- [ ] Logs include enough context without leaking financial details.
- [ ] Metrics hourly summary remains readable.

**Verification:**
- [ ] `npm test`
- [ ] PM2 log smoke after deploy

**Dependencies:** Task 3.3

**Files likely touched:**
- `src/utils/metrics.js`
- `src/utils/logger.js`
- `src/services/google.js`
- `src/services/readModelService.js`
- `src/services/dashboardServer.js`

**Estimated scope:** M

### Checkpoint: Operations
- [ ] Admin commands are auditable.
- [ ] Production health can be checked without guesswork.
- [ ] Metrics identify the likely failing integration.

### Phase 7: Security And Privacy Hardening

#### Task 7.1: Threat-model user data and dashboard access
**Type:** Core foundation

**Description:** Document risks around WhatsApp identity, dashboard token links, Sheets access, SQLite data, logs, and admin commands.

**Acceptance criteria:**
- [ ] Threat model covers assets, actors, entry points, and mitigations.
- [ ] Risks are prioritized before implementation.
- [ ] Dashboard token risk is explicitly covered.

**Verification:**
- [ ] Manual review before security implementation.

**Dependencies:** Task 5.1, Task 6.1

**Files likely touched:**
- `docs/security/threat-model.md`

**Estimated scope:** S

#### Task 7.2: Harden dashboard token and admin boundaries
**Type:** Core foundation

**Description:** Apply changes from the threat model that protect user data without changing product scope.

**Acceptance criteria:**
- [ ] Token validation rejects missing, malformed, expired, or wrong-secret tokens.
- [ ] Admin commands cannot be run by non-admin users or spoofed display names.
- [ ] Errors are safe and do not leak secrets or financial data.

**Verification:**
- [ ] `npm test`
- [ ] Token invalid/expired curl smoke

**Dependencies:** Task 7.1

**Files likely touched:**
- `src/utils/dashboardAuth.js`
- `src/services/dashboardServer.js`
- `src/utils/adminCheck.js`
- `tests/unit.test.js`

**Estimated scope:** M

#### Task 7.3: Define privacy and retention policy for beta users
**Type:** Core foundation

**Description:** Make privacy posture explicit before inviting users outside the trusted group.

**Acceptance criteria:**
- [ ] Policy explains data collected, purpose, retention, deletion/inactivation, and admin access.
- [ ] Terms versioning and reconsent path are documented.
- [ ] Policy aligns with current implementation or flags implementation gaps.

**Verification:**
- [ ] Manual review of `TERMS.md`, `PRIVACY.md`, and implementation.

**Dependencies:** Task 7.1

**Files likely touched:**
- `TERMS.md`
- `PRIVACY.md`
- `docs/security/privacy-retention.md`

**Estimated scope:** S

### Checkpoint: Security
- [ ] Threat model exists.
- [ ] Token/admin boundaries have tests.
- [ ] Privacy posture is clear enough for beta users.

### Phase 8: Shipping And Launch Readiness

#### Task 8.1: Create release checklist and rollback plan
**Type:** Core foundation

**Description:** Define exactly what must pass before production deploy and how to rollback.

**Acceptance criteria:**
- [ ] Checklist includes tests, E2E, deploy, PM2 health, dashboard health, WhatsApp smoke.
- [ ] Rollback path uses git commit/PM2 commands.
- [ ] Checklist includes when not to deploy.

**Verification:**
- [ ] Manual dry-run during next deploy.

**Dependencies:** Task 6.2, Task 7.2

**Files likely touched:**
- `docs/runbooks/release-and-rollback.md`

**Estimated scope:** S

#### Task 8.2: Define beta launch criteria
**Type:** Product surface

**Description:** Decide what must be true before adding new users beyond the current trusted set.

**Acceptance criteria:**
- [ ] Criteria include tests, admin readiness, privacy, dashboard, WhatsApp stability, cost monitoring.
- [ ] Criteria define max initial beta users.
- [ ] Criteria define how to pause onboarding if problems appear.

**Verification:**
- [ ] Manual review and approval.

**Dependencies:** Task 8.1

**Files likely touched:**
- `docs/runbooks/beta-launch.md`
- `docs/specs/financas-bot-general-product-spec.md`

**Estimated scope:** S

### Checkpoint: Launch Readiness
- [ ] Release checklist exists.
- [ ] Rollback path is clear.
- [ ] Beta launch criteria are explicit.

## Future Expansion Backlog
These items align with the destination but should not distract from the next reliable slice.

### Future 1: Postgres migration decision
**Type:** Future expansion

Trigger candidates:

- SQLite write contention.
- Multi-instance deployment.
- Data volume makes local backup/restore risky.
- Need for managed backups and query observability.

### Future 2: Rich dashboard editing
**Type:** Future expansion

Only consider if users actively need corrections from the dashboard rather than WhatsApp/admin.

### Future 3: Role-based access model
**Type:** Future expansion

Only consider when there are multiple admins, support users, or household/shared-account concepts.

### Future 4: Proactive automation
**Type:** Future expansion

Only add after opt-in behavior is validated and message frequency rules are clear.

### Future 5: Open Finance
**Type:** Future expansion

Only consider after privacy, retention, security, and core reliability are mature.

## Risks And Mitigations
| Risk | Impact | Mitigation |
|---|---:|---|
| WhatsApp Web instability | High | Real E2E smoke, runbook, QR-safe startup, manual recovery docs |
| Google Sheets quota | High | SQLite read model, reduce full-tab reads, metrics for Sheets calls |
| Functional tests remain skipped | High | Phase 1 breaks them into focused tests |
| User data leakage across users | High | `user_id` gates, read/write isolation tests, dashboard token tests |
| AI cost grows silently | Medium | Deterministic routing, metrics for AI calls, avoid raw rows |
| Admin mistakes | Medium | Audit logs, command safety review, confirmation for risky actions |
| Direction drift | Medium | ADR/spec marker in every plan, classify tasks by Core/Product/Future |
| Overbuilding future features | Medium | Future expansion backlog separated from next reliable slice |

## Parallelization Opportunities
- Task 1.2 and Task 1.4 can run in parallel after Task 0.1.
- Task 3.1 documentation can run while Task 2.2 state-store work proceeds.
- Dashboard API contract tests and admin command audit can be parallel after read-model/user lifecycle tests are stable.
- Security documentation can start before token hardening, but implementation must wait for the threat model.

## Recommended Next Implementation Slice
Start with Phase 0 and Phase 1:

1. Task 0.1: baseline audit.
2. Task 0.2: stage gates.
3. Task 1.1: split/stabilize functional tests.
4. Task 1.2: user lifecycle regression tests.

Reason: these reduce the chance of repeating the previous failure mode, where a narrow implementation looked complete but left project-wide gaps.

## Open Questions For Human Approval
- Should functional tests use a dedicated Google Spreadsheet instead of the current production spreadsheet?
- Should the web dashboard remain read-only for the next stable slice?
- Should admin lifecycle commands require confirmation before changing user status?
- What maximum monthly AI cost per active user should guide routing decisions?
- How many users should be allowed in the first beta batch?
