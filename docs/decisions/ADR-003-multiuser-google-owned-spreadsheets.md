# ADR-003: Multiuser Access Uses Manual Approval And User-Owned Google Files

## Status
Accepted

## Date
2026-05-15

## Context
FinancasBot is moving from a personal/beta bot to a controlled multiuser beta for dozens of users. Financial data is sensitive, and the product must avoid giving admins broad access to user-level financial data.

The current implementation still has a central Google spreadsheet and admin tooling from the beta phase. ADR-002 already states that admin access to all users' financial transactions is temporary and must be removed before real multiuser scale.

The desired onboarding model is:

- A user starts on WhatsApp.
- The user reads/accepts terms.
- Daniel is notified.
- Daniel approves the user manually.
- The user connects Google.
- The bot creates and uses a spreadsheet in that user's own Google Drive.
- Calendar integration is connected per user.

## Decision
Use a gated lifecycle for every new user:

1. `PENDING`: user exists but has not accepted terms.
2. `PENDING_APPROVAL`: user accepted terms and is waiting for admin approval.
3. `APPROVED_AWAITING_GOOGLE`: admin approved the user, but Google OAuth is not complete.
4. `ACTIVE`: Google connection is complete and the bot can operate.
5. Existing terminal/blocked states remain: `INACTIVE`, `BLOCKED`, `DELETED`, `EXPIRED`.

Google connection is mandatory before financial usage. An approved user without Google OAuth must not register expenses, ask financial questions, open a financial dashboard, or create calendar events.

Each real multiuser financial workspace must be user-owned:

- The bot creates the user's finance spreadsheet inside the user's own Drive after OAuth.
- The central registry stores operational metadata only, such as user lifecycle, consent, OAuth connection status, and user spreadsheet ID.
- Production admin views must not expose arbitrary user transaction-level financial data.

Importing bank statements starts with CSV and OFX only. PDF/image statement parsing is intentionally out of the MVP.

Thaís's number is no longer an admin. It can be used as a normal/test user. Existing card/spreadsheet labels containing "Thaís" may remain because they are financial/card labels, not admin permissions.

## Alternatives Considered

### Keep one central spreadsheet for all users
- Pros: simpler to implement immediately.
- Cons: weaker privacy boundary, larger blast radius, higher legal/admin access risk.
- Rejected for production multiuser.

### Auto-approve new users after consent
- Pros: smoother onboarding.
- Cons: harder to control beta access, spam, and support load.
- Rejected for current beta; can be reconsidered after monitoring.

### Support PDF/image statement import first
- Pros: convenient for users.
- Cons: higher parsing complexity and AI cost; more privacy risk from raw documents.
- Deferred until CSV/OFX import is stable.

## Consequences
- New users will not become active immediately after `ACEITO`.
- Admin approval and Google OAuth become required gates.
- The codebase needs OAuth token storage with encryption at rest.
- The dashboard/read model must become per-user-spreadsheet aware.
- Release checks must confirm `ADMIN_IDS` does not include test users such as Thaís.
- Future agents must not reintroduce broad admin financial access while building multiuser support.
