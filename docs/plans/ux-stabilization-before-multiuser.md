# Implementation Plan: UX Stabilization Before Multiuser

## Overview
This plan stabilizes the current user experience before multiuser expansion. It focuses on clarity, recovery, explainability, and visual consistency without expanding admin access or changing financial rules.

## Architecture Decisions
- Keep WhatsApp as the conversational entry point.
- Keep the web dashboard as the user-facing visual product.
- Keep Sheets as audit/source storage and support dashboard.
- Keep AI out of predictable UX paths whenever deterministic handling is enough.
- Treat admin all-users dashboard scope as beta-only technical debt per ADR-002.

## Task List

### Phase 1: WhatsApp Clarity

#### Task 1.1: Add onboarding progress and recovery cues
**Description:** Make each onboarding question show where the user is in the flow, and keep recovery commands discoverable.

**Acceptance criteria:**
- [ ] Onboarding questions show progress like `1/5`.
- [ ] Existing `voltar`, `recomeçar`, and `ajuda` behavior still works.
- [ ] Existing tests cover command-looking names and onboarding menu behavior.

**Verification:**
- [ ] `node --test tests/onboardingState.test.js`
- [ ] `npm test`

**Files likely touched:**
- `src/handlers/onboardingHandler.js`
- `tests/onboardingState.test.js`

**Estimated scope:** S

#### Task 1.2: Clarify debt creation completion
**Description:** After registering a debt, explain that it appears in debts/dashboard but is not counted as a monthly expense until a payment is recorded.

**Acceptance criteria:**
- [ ] Success message includes the debt name.
- [ ] Success message gives next actions: dashboard and registering a payment.
- [ ] Message avoids implying debt creation is a spending transaction.

**Verification:**
- [ ] `node --test tests/unit.test.js`
- [ ] `npm test`

**Files likely touched:**
- `src/handlers/creationHandler.js`
- `tests/unit.test.js` or a focused creation test

**Estimated scope:** S

#### Task 1.3: Normalize help and unknown-message UX
**Description:** Make `ajuda`, greetings, low-signal messages, and unknown messages predictable, short, and current.

**Acceptance criteria:**
- [ ] `Oi` returns a menu-like greeting without AI.
- [ ] `ajuda` reflects current commands.
- [ ] Low-signal messages do not silently disappear.

**Verification:**
- [ ] `node --test tests/unit.test.js`
- [ ] Manual WhatsApp smoke: `Oi`, `ajuda`, `teste`, `dashboard`

**Files likely touched:**
- `src/handlers/messageHandler.js`
- `tests/unit.test.js`

**Estimated scope:** M

### Checkpoint: WhatsApp UX
- [ ] Common WhatsApp flows are understandable without reading documentation.
- [ ] Manual smoke confirms bot responds after deploy.

### Phase 2: Dashboard Clarity

#### Task 2.1: Improve zero/empty states
**Description:** Make the dashboard explain why sections are empty, especially for new users.

**Acceptance criteria:**
- [ ] Empty spending, debt, goal, and alert sections include useful next actions.
- [ ] Debt totals appear separately from monthly spending.
- [ ] Dashboard remains mobile-first.

**Verification:**
- [ ] Browser/manual check on mobile and desktop widths.
- [ ] `npm test`

**Files likely touched:**
- `src/services/dashboardServer.js`
- Dashboard contract tests if shape changes

**Estimated scope:** M

#### Task 2.2: Improve dashboard WhatsApp link copy
**Description:** Keep the token warning, but make the message easier to scan inside WhatsApp.

**Acceptance criteria:**
- [ ] Link message is short.
- [ ] Security warning remains visible.
- [ ] Expiration is clear.

**Verification:**
- [ ] `npm test`
- [ ] Manual WhatsApp smoke: `dashboard`

**Files likely touched:**
- `src/handlers/messageHandler.js`

**Estimated scope:** S

### Checkpoint: Dashboard UX
- [ ] User can tell what is missing because no data exists versus because something broke.
- [ ] Dashboard still passes auth/security tests.

### Phase 3: Spreadsheet Visual Consistency

#### Task 3.1: Define Sheets role and visual standard
**Description:** Keep the spreadsheet useful as audit/support storage with consistent colors, headers, frozen rows, and date/currency formats.

**Acceptance criteria:**
- [ ] Sheets dashboard role is documented as audit/admin support, not primary user UI.
- [ ] Core tabs share a consistent visual identity.
- [ ] Date columns render as dates, not serial numbers.

**Verification:**
- [ ] Manual spreadsheet check.
- [ ] `npm test` for formatting helpers.

**Files likely touched:**
- `src/services/google.js`
- `docs/specs/ux-stabilization-before-multiuser.md`

**Estimated scope:** M

### Checkpoint: Spreadsheet UX
- [ ] Sheets are readable enough for audit/debugging.
- [ ] Web dashboard remains the user-facing product.

### Phase 4: Pre-Multiuser UX Gate

#### Task 4.1: Add UX smoke checklist to release flow
**Description:** Before multiuser work, define a short smoke script that validates first-run, question, debt, dashboard, and admin basics.

**Acceptance criteria:**
- [ ] Checklist includes WhatsApp commands and expected outputs.
- [ ] Checklist includes dashboard and spreadsheet checks.
- [ ] Checklist includes ADR-002 admin privacy gate.

**Verification:**
- [ ] Manual review.
- [ ] Release checklist references the UX gate.

**Files likely touched:**
- `docs/runbooks/release-checklist.md`
- `docs/plans/ux-stabilization-before-multiuser.md`

**Estimated scope:** S

## Risks And Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Over-polishing before scale | Delays foundational work | Keep tasks small and tied to observed friction |
| Admin beta visibility leaks into product | Legal/privacy risk | Keep ADR-002 gate explicit in specs and release checklist |
| Dashboard and Sheets compete as product UI | Confusing direction | Web dashboard is user-facing; Sheets is audit/support |
| WhatsApp Web instability masks UX issues | False negatives in manual tests | Check PM2 readiness before UX smoke |
