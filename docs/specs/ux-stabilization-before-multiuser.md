# Spec: UX Stabilization Before Multiuser

## Objective
Improve FinancasBot's user experience before scaling beyond the current beta users. The goal is not to add new financial features; it is to make the current product understandable, recoverable, and trustworthy across WhatsApp, the web dashboard, and the spreadsheet/audit surface.

Success means a user can start, understand what the bot is doing, recover from mistakes, and verify their financial picture without admin help.

## Scope
- WhatsApp is the primary daily interface for capture, questions, onboarding, and dashboard links.
- The web dashboard is the primary user-facing visual overview.
- Google Sheets remains source/audit storage, not the primary consumer UI.
- Admin broad financial access remains a beta/testing exception only. Before real multiuser scale, follow `docs/decisions/ADR-002-admin-financial-data-access.md`.

## Commands
- Unit and integration tests: `npm test`
- Focused onboarding tests: `node --test tests/onboardingState.test.js`
- Focused WhatsApp routing tests: `node --test tests/unit.test.js`
- Production health check: `curl http://localhost:8787/dashboard/health`
- Production logs: `pm2 logs financas-bot --lines 120 --nostream`

## Project Structure
- `src/handlers/messageHandler.js` - WhatsApp command routing, help, summaries, admin commands.
- `src/handlers/onboardingHandler.js` - first-run profile collection and recovery commands.
- `src/handlers/creationHandler.js` - debt/goal creation flows.
- `src/services/dashboardServer.js` - web dashboard HTML/API.
- `src/services/google.js` - spreadsheet structure, formatting, and dashboard sheet automation.
- `tests/` - regression tests for UX-critical behavior.
- `docs/plans/ux-stabilization-before-multiuser.md` - implementation plan.

## UX Principles
- Make state visible: users should know whether they are onboarding, creating a debt, asking a question, or opening the dashboard.
- Prefer one clear next action over long menus.
- Never make financial data feel like a black box: show short "why" context when useful.
- Avoid AI for predictable commands and recovery paths.
- Keep beta/admin shortcuts from becoming accidental production UX.

## Success Criteria
- WhatsApp onboarding shows progress and recovery options.
- Debt creation completion explains what changed and what did not change.
- `ajuda`, `termos`, `dashboard`, `resumo`, and unknown messages have predictable, useful responses.
- Dashboard empty states help new users understand why values are zero.
- Spreadsheet dashboard is visually consistent and documented as audit/admin support.
- UX changes have focused tests or a manual smoke checklist.

## Boundaries
- Always: preserve `user_id` isolation, run tests before commits, keep messages concise.
- Ask first: changing financial formulas, adding dependencies, changing dashboard authentication, exposing admin financial views.
- Never: remove the ADR-002 privacy gate, commit secrets, make admin all-user financial visibility part of the multiuser default.

## Open Questions
- Should the dashboard eventually allow edits, or remain read-only?
- Should WhatsApp offer a guided "first transaction" after onboarding, or only show examples?
- Should recurring check-ins stay opt-in only, or be suggested after repeated use?
