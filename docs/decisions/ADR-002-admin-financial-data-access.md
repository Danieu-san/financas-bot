# ADR-002: Admin Financial Data Access Is Temporary For Testing Only

## Status
Accepted

## Date
2026-05-15

## Context
During beta/testing, the dashboard gained an admin-only "Todos os usuários" scope so the owner could diagnose whether data existed in the sheet/SQLite read model under a different `user_id`.

This solved a testing/debugging issue: seeded/test transactions may belong to test users, while the real WhatsApp admin account has a different `user_id`.

However, financial transactions are sensitive personal data. In a scaled multiuser product, administrators should not be able to freely browse every user's financial transactions. Even if an admin is trusted operationally, broad access increases legal, LGPD, privacy, and abuse risk.

## Decision
The current admin all-users dashboard access is a beta/testing exception only.

Before closing tests and scaling to real multiuser usage, this capability must be removed or replaced with a privacy-preserving operational model.

Required production direction:

- Admins must not have default access to all users' transaction-level financial data.
- Admin dashboards may show operational aggregates only when they cannot identify individual financial behavior.
- User-level financial views must remain accessible only to that user, unless there is explicit user consent and a logged support workflow.
- Any support impersonation/debug access must be time-bound, purpose-bound, audited, and preferably require explicit user authorization.

## Current Temporary Exception
For beta only, admin dashboard tokens may allow selecting:

- `Todos os usuários`
- A specific user

This is allowed only while test data is being validated and while the user base is not scaled.

## Mandatory Removal Gate
Before any production/multiuser scale milestone, verify:

- The dashboard no longer exposes `Todos os usuários` transaction-level data to admins.
- Admin tokens cannot request arbitrary `user` scopes for financial details.
- Tests assert that non-user financial data is not visible through admin dashboard routes.
- Release checklist confirms this ADR has been reviewed.

## Alternatives Considered

### Keep admin all-user access permanently
- Pros: Easier support/debugging.
- Cons: Excessive access to sensitive financial data; hard to justify legally and operationally.
- Rejected for production.

### Remove admin all-user access immediately
- Pros: Strongest privacy posture.
- Cons: Makes current beta debugging harder while test data may be attached to seeded users.
- Deferred until testing closes.

### Use support-mode access with consent and audit
- Pros: Operationally useful while respecting privacy.
- Cons: Requires additional workflow, consent records, expiry, and logs.
- Preferred future replacement.

## Consequences
- Any future agent or developer touching dashboard/admin scope must check this ADR.
- Admin all-users dashboard access must be treated as technical debt with a legal/privacy removal gate.
- Scaling work must include a task to remove or replace the current beta exception.
- Documentation and launch checklists must keep this gate visible.
