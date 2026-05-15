# ADR-001: Product Direction Toward a Personal Finance Operating System

## Status
Accepted

## Date
2026-05-14

## Context
FinancasBot started as a WhatsApp finance bot for personal financial control. It now has several important building blocks:

- WhatsApp as the main interaction channel.
- Google Sheets as source/audit storage.
- SQLite read model for faster and cheaper queries.
- A per-user web dashboard with tokenized access.
- Multiuser lifecycle, consent, onboarding, admin commands, and real WhatsApp E2E testing.

The product direction discussion produced multiple possible paths:

1. Keep FinancasBot mainly as a smart transaction recorder.
2. Turn it into a lightweight financial advisor.
3. Turn it into a personal finance operating system.
4. Keep it minimal but extremely reliable.
5. Make it data-driven, with AI only as an assistant layer.

The preferred destination is path 3: a personal finance operating system. The main concern is losing that direction while implementing safer, smaller steps.

## Decision
FinancasBot will target path 3: a personal finance operating system.

The execution strategy is not to build the full operating system all at once. The implementation path will use path 5 as the foundation: a data-driven, deterministic core where AI is used only where it adds leverage.

This means:

- WhatsApp remains the daily capture and conversation interface.
- Dashboard becomes the user's main visual review surface.
- Sheets remains source/audit storage for the current stage.
- SQLite remains the read model for fast and low-cost queries.
- AI should classify, interpret, and phrase responses, but should not be the primary calculation engine.
- Future specs and plans must explicitly preserve the destination: personal finance operating system.

## Alternatives Considered

### Build the full operating system immediately
- Pros: Faster movement toward the desired end state.
- Cons: Too much surface area at once: WhatsApp Web, Sheets quota, dashboard auth, LGPD/privacy, SQLite, AI cost, admin operations, tests, and production stability.
- Rejected: High risk of building something impressive but fragile.

### Stay as a transaction recorder
- Pros: Simple, easier to stabilize, fewer moving parts.
- Cons: Lower long-term value; does not fully solve planning, financial awareness, time management, or multiuser scale.
- Rejected: Useful, but too narrow for the product ambition.

### Become a financial advisor first
- Pros: Higher perceived value and clearer financial impact.
- Cons: Advice quality depends on complete, reliable data; premature advice can feel wrong or intrusive.
- Rejected as first step: Should emerge from the reliable data core, not precede it.

### Data-driven core with AI as assistant
- Pros: Lower cost, lower latency, easier testing, more predictable answers.
- Cons: Requires careful parser/read-model work and can feel less magical than heavy AI.
- Accepted as implementation path: Best foundation for reaching the operating-system vision safely.

## Consequences
- Specs, plans, and implementation phases must label which work supports the personal finance operating system destination.
- We should prefer boring, testable financial logic over AI-heavy shortcuts.
- New features must justify whether they strengthen the core system or distract from it.
- Dashboard and admin operations are strategic, not side features.
- Postgres, richer multiuser roles, and advanced automation remain future paths, not immediate requirements.
- Tests and observability are not optional because the system is moving from personal script to product foundation.

## Direction Marker For Future Work
When applying future skills, keep this marker visible:

> Destination: personal finance operating system.
> Path: reliable data-driven core first, then expand surfaces and automation.

Every future spec and task plan should identify whether an item is:

- Core foundation: required for reliability, data quality, privacy, or cost control.
- Product surface: dashboard, reports, WhatsApp UX, admin operations.
- Future expansion: useful later, but not needed for the next reliable slice.
