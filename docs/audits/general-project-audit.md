# General Project Audit

## Direction Marker
Destination: personal finance operating system.

Path: reliable data-driven core first, then expand surfaces and automation.

Sources:

- `docs/decisions/ADR-001-product-direction-personal-finance-os.md`
- `docs/specs/financas-bot-general-product-spec.md`
- `docs/plans/financas-bot-general-implementation-plan.md`

## Audit Date
2026-05-14

## Purpose
Capture the current state of FinancasBot against the general product spec before continuing implementation. This audit exists to prevent narrow progress that leaves important parts of the project outside the plan.

## Executive Summary
FinancasBot has moved beyond a simple WhatsApp bot. It already has multiuser lifecycle, consent, onboarding, Google Sheets storage, SQLite read model, dashboard links, admin commands, structured logs, metrics, and a real WhatsApp E2E smoke path.

The strongest current foundation is the direction: data-driven core first, AI as assistant, dashboard as product surface, Sheets as audit/source storage. The biggest current gaps are testing completeness, functional test reliability, full write-boundary enforcement, security hardening, and production runbooks.

Recommended next move remains Phase 0 and Phase 1 from the implementation plan: keep direction control in place, then stabilize the testing foundation before adding product breadth.

## Component Status

### WhatsApp And Puppeteer
**Classification:** Product surface / Core foundation

**Current state:**
- WhatsApp is the main interface through `whatsapp-web.js`.
- QR/auth lifecycle has caused operational friction before.
- Startup logging and watchdog behavior have been improved.
- Real WhatsApp E2E exists and has passed for terms, expense registration, analytical question, and dashboard link.

**Strengths:**
- Real E2E path validates the actual WhatsApp Web surface.
- `src/testing/whatsappWebDriver.js` gives repeatable browser automation.
- Run scripts exist for setup, check, and smoke.

**Gaps:**
- WhatsApp Web remains operationally fragile.
- Real E2E depends on local browser session and manual QR/auth state.
- Runbook can be improved with failure-mode evidence and recovery steps.

**Next actions:**
- Task 1.4: harden E2E runbook and evidence capture.
- Later: production health checklist should include WhatsApp readiness and stale QR recovery.

### Users, Consent, And Lifecycle
**Classification:** Core foundation

**Current state:**
- Lifecycle statuses exist: `PENDING`, `ACTIVE`, `INACTIVE`, `BLOCKED`, `DELETED`, `EXPIRED`.
- Consent gate and `ConsentLog` exist.
- `ACEITO` behavior for active users was hardened after a real E2E bug.
- Terms versioning exists.

**Strengths:**
- Consent before activation is implemented.
- Active users with current terms do not need to reconsent.
- Admin commands can manage lifecycle.

**Gaps:**
- Lifecycle behavior is not yet comprehensively covered across all statuses.
- Admin lifecycle actions may need confirmation before scale.
- Privacy/retention policy needs a beta-ready review.

**Next actions:**
- Task 1.2: add lifecycle regression tests.
- Task 6.1: admin command safety review.
- Task 7.3: define privacy and retention policy.

### Onboarding
**Classification:** Core foundation / Product surface

**Current state:**
- Onboarding collects display name, income, fixed expenses, debt status, and goal.
- Parser handles common monetary formats.
- Regression guard prevents command-like text from becoming a display name.
- Admin reset onboarding exists.

**Strengths:**
- Onboarding feeds financial health and settings from day one.
- Recovery from stale state has been partly addressed.

**Gaps:**
- Re-entry UX is still basic.
- Invalid answers and resume behavior need broader tests.
- It should be clear to users how to correct a wrong onboarding answer.

**Next actions:**
- Task 2.2: stabilize state store semantics and recovery.
- Task 4.2: improve onboarding resilience and re-entry.

### Financial Records
**Classification:** Core foundation

**Current state:**
- Expenses, income, card installments, debts, goals, and deletions are supported.
- Most new schemas include `user_id`.
- Previous multiuser leakage risks were fixed in several paths.

**Strengths:**
- Core financial flows exist and are useful.
- Several `user_id` isolation tests exist.
- Real WhatsApp E2E validates expense registration.

**Gaps:**
- Need explicit audit that every write boundary rejects missing `user_id`.
- State-machine transitions for payments/installments/deletions need broader deterministic coverage.
- Legacy data handling must not weaken new-write rules.

**Next actions:**
- Task 1.3: financial flow state-machine tests.
- Task 2.1: validate `user_id` enforcement at every write boundary.

### Google Sheets
**Classification:** Core foundation

**Current state:**
- Sheets remains source/audit storage.
- Structure management exists.
- OAuth reconnection was improved.
- Quota issues have appeared in logs during heavy/repeated operations.

**Strengths:**
- Easy manual audit and debugging.
- Existing spreadsheet structure supports current product data.

**Gaps:**
- Sheets quota remains a real operational risk.
- Functional tests using real Sheets need safer isolation.
- Sheets should not be used as the primary read path for common questions.

**Next actions:**
- Task 2.3: controlled test data strategy.
- Task 3.1: read-model coverage audit.
- Task 3.3: metrics for deterministic vs AI/Sheets paths.

### SQLite Read Model
**Classification:** Core foundation

**Current state:**
- SQLite read model exists and syncs from Sheets.
- Dashboard APIs can use SQLite.
- Common analytical paths have been moved toward deterministic reads.

**Strengths:**
- Reduces cost and latency compared with full Sheets reads and AI.
- Aligns with ADR-001 path.

**Gaps:**
- Need a matrix mapping analytical intents to SQLite, deterministic fallback, or AI fallback.
- Need more tests proving `user_id` isolation and query correctness.
- Need metrics showing when SQLite is used versus AI/Sheets.

**Next actions:**
- Task 3.1: read-model coverage audit.
- Task 3.2: read-model regression tests.
- Task 3.3: routing metrics.

### AI / Gemini
**Classification:** Core foundation / Product surface

**Current state:**
- Gemini is used for structured parsing, classification fallback, language generation, and audio transcription.
- Logs include slow Gemini warnings/perf data.
- Some question paths now use local classification/read-model.

**Strengths:**
- AI gives natural WhatsApp UX.
- Local routing reduces unnecessary calls for common questions.

**Gaps:**
- Need stronger visibility into cost-driving paths.
- Need to keep raw financial rows out of AI prompts whenever deterministic summaries are enough.
- Need tests around local routing so AI is not called accidentally for common questions.

**Next actions:**
- Task 3.3: cost/latency routing metrics.
- Task 3.2: deterministic question tests.

### Dashboard Web
**Classification:** Product surface

**Current state:**
- Per-user dashboard link exists with tokenized access.
- Health endpoint works.
- API endpoints exist for key summary data.
- User successfully opened a dashboard link from WhatsApp.

**Strengths:**
- Dashboard is the right product surface for visual understanding.
- Tokenized access avoids traditional login complexity for current stage.

**Gaps:**
- API response contracts need explicit tests.
- Dashboard token boundaries need security review.
- Need clarify relationship between web dashboard and spreadsheet dashboard.
- Browser/runtime visual verification should be formalized later.

**Next actions:**
- Task 5.1: dashboard API contract tests.
- Task 5.2: align dashboard UI with product direction.
- Task 5.3: define spreadsheet dashboard role.
- Task 7.1 and 7.2: dashboard token threat model and hardening.

### Admin Commands
**Classification:** Core foundation / Product surface

**Current state:**
- Admin commands exist for listing, status, logs, status changes, reset onboarding, messaging, stats, and expiring pending users.
- Structured logging for admin actions exists.

**Strengths:**
- Daily operation can happen without opening the spreadsheet.
- Logs are already useful for auditing.

**Gaps:**
- Risk level per command is not documented.
- Some lifecycle-changing commands may need confirmation before scale.
- Admin identity model should be security-reviewed, especially WhatsApp `@lid` handling.

**Next actions:**
- Task 6.1: admin command safety review.
- Task 7.2: admin boundary hardening.

### Tests
**Classification:** Core foundation

**Current state:**
- `npm test` passes.
- Unit tests cover helpers, user isolation helpers, dashboard/E2E config, and recent regressions.
- Real WhatsApp E2E exists and has passed.
- `functional.test.js` is skipped by default.

**Strengths:**
- Project has meaningful test infrastructure.
- Recent regressions from real E2E are now protected.
- E2E is opt-in, which is appropriate.

**Gaps:**
- Functional test remains the biggest blind spot.
- Need smaller deterministic functional tests by flow.
- Need broader lifecycle and state-machine coverage.

**Next actions:**
- Task 1.1: split skipped functional smoke.
- Task 1.2: lifecycle regression tests.
- Task 1.3: financial state-machine tests.

### Logs, Metrics, And Operability
**Classification:** Core foundation

**Current state:**
- Logger and metrics utilities exist.
- PM2 logs show startup, read-model sync, admin actions, dashboard links, slow calls, and errors.
- Dashboard health endpoint exists.

**Strengths:**
- Production issues can often be diagnosed from PM2 logs.
- Structured admin logs are already valuable.

**Gaps:**
- Old log noise can obscure current failures.
- Production health checklist is not yet formalized.
- Metrics are useful but not yet fully actionable for incident triage.

**Next actions:**
- Task 6.2: production health checklist.
- Task 6.3: make metrics actionable.

### Deploy / AWS / PM2
**Classification:** Core foundation

**Current state:**
- EC2 and PM2 are used for production.
- Deploy sequence is known and documented in the general spec.
- Dashboard port and security group issues were previously resolved.

**Strengths:**
- Manual deploy path works.
- PM2 restart and logs are familiar operational tools.

**Gaps:**
- Release checklist and rollback plan need formalization.
- No automated CI/CD gate is currently documented as required.
- Need clear criteria for when not to deploy.

**Next actions:**
- Task 8.1: release checklist and rollback plan.
- Future: CI/CD automation after tests are more stable.

## Gap Register

| Gap | Classification | Priority | Suggested task |
|---|---|---:|---|
| Functional test suite is skipped by default | Core foundation | High | Task 1.1 |
| Lifecycle statuses need broader test coverage | Core foundation | High | Task 1.2 |
| Financial state machines need deterministic tests | Core foundation | High | Task 1.3 |
| Every write boundary needs explicit `user_id` enforcement audit | Core foundation | High | Task 2.1 |
| Test data strategy can still touch real Sheets | Core foundation | High | Task 2.3 |
| Read-model coverage matrix is missing | Core foundation | Medium | Task 3.1 |
| AI cost/routing visibility is incomplete | Core foundation | Medium | Task 3.3 |
| Dashboard API contracts need tests | Product surface | Medium | Task 5.1 |
| Admin command risk levels are undocumented | Core foundation | Medium | Task 6.1 |
| Production health checklist is not formalized | Core foundation | Medium | Task 6.2 |
| Dashboard token and data threat model is missing | Core foundation | Medium | Task 7.1 |
| Privacy/retention policy needs beta review | Core foundation | Medium | Task 7.3 |
| Postgres migration criteria undefined | Future expansion | Low | Future 1 |
| Dashboard editing role undecided | Future expansion | Low | Future 2 |

## Immediate Recommendation
Do not add broad new product features yet. Complete the direction-control and testing-foundation tasks first:

1. Task 0.2: stage gates.
2. Task 1.1: split/stabilize functional tests.
3. Task 1.2: lifecycle regression tests.
4. Task 1.3: financial state-machine tests.

This order directly addresses the previous failure mode: progress in one area appearing complete while project-wide gaps remain.

## Verification
- [x] Audit lists current status for WhatsApp, Sheets, SQLite, dashboard, AI, admin, tests, logs, deploy.
- [x] Audit identifies gaps as Core foundation, Product surface, or Future expansion.
- [x] Audit references the direction marker from ADR-001.
