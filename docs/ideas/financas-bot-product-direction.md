# FinancasBot Product Direction

## Problem Statement
How might we turn FinancasBot from a useful WhatsApp finance bot into a reliable personal finance operating system that remains simple, testable, low-cost, and scalable to more users?

## Recommended Direction
The target direction is a personal finance operating system: WhatsApp for capture and conversation, a dashboard for visual understanding, Sheets for audit/source records, SQLite for fast read queries, and AI only where it adds leverage.

The important nuance is sequencing. Building the full operating system all at once would be risky because it increases the surface area across WhatsApp Web, Google Sheets, dashboard auth, user lifecycle, privacy, and AI costs. The safer path is to start with a data-driven core and expand into the broader system once the core is boringly reliable.

In practice: keep WhatsApp as the daily interface, make deterministic calculations and SQLite the default for answers, keep the dashboard as the user's main visual view, and use AI as an assistant for classification, phrasing, and edge cases rather than as the main source of truth.

## Key Assumptions to Validate
- [ ] Users will consistently log expenses and income via WhatsApp if the flow stays short and forgiving.
- [ ] The dashboard will be used for review and planning, not for day-to-day data entry.
- [ ] SQLite is enough for the next stage before Postgres is justified.
- [ ] WhatsApp Web is acceptable for MVP/beta, despite operational fragility.
- [ ] Most recurring user questions can be answered by deterministic code and SQL, reducing AI cost and latency.
- [ ] Admin operations through WhatsApp remain manageable while the user base is small.

## MVP Scope
The next stable product slice should include:

- Consent and onboarding that are resilient and test-covered.
- User lifecycle statuses: PENDING, ACTIVE, INACTIVE, BLOCKED, DELETED, EXPIRED.
- WhatsApp flows for expenses, income, goals, debts, reports, dashboard links, and admin commands.
- SQLite read model for common questions and dashboard data.
- Dashboard web per user with tokenized access.
- Regression tests for known bugs.
- Real WhatsApp E2E smoke test.
- Logs and metrics sufficient to diagnose production problems.

## Not Doing (and Why)
- Full Postgres migration now - SQLite gives most of the benefit with far less operational cost.
- Gamification - it adds product complexity without proving financial impact.
- Open Finance integration - high regulatory and technical cost before the core product is mature.
- Heavy proactive messaging - too easy to become spammy and reduce trust.
- AI over raw spreadsheet rows - expensive, slow, and less reliable than deterministic summaries.
- Traditional login for the dashboard - WhatsApp-issued temporary links are simpler for the current stage.
- Multi-tenant enterprise features - useful later, distracting now.

## Open Questions
- What is the threshold for moving from SQLite to Postgres: number of users, data volume, or operational pain?
- Should the dashboard eventually allow edits, or remain read-only?
- What privacy/retention policy is required before inviting users outside the initial trusted group?
- Which admin actions should require explicit confirmation or audit notes?
- What is the acceptable monthly AI cost per active user?

## Product Bet
FinancasBot should become a personal finance operating system, but the winning path is not to build every surface immediately. The winning path is to make the core financial memory reliable first, then expand the experience around it.
