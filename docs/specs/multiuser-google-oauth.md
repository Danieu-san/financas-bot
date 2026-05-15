# Spec: Multiuser Google OAuth And User-Owned Spreadsheets

## Objective
Turn FinancasBot into a controlled multiuser beta for dozens of users while keeping financial data private by default.

Success means:

- Every new user accepts terms before any record is created beyond lifecycle/consent metadata.
- Every new user requires manual admin approval.
- Every approved user must connect Google before using financial features.
- Each user's financial data is stored in a spreadsheet created in that user's own Google Drive.
- Admins operate lifecycle/support metadata without broad transaction-level financial access.
- Bank statement import starts with CSV/OFX only.

## Tech Stack
- Runtime: Node.js.
- WhatsApp: `whatsapp-web.js`.
- Google APIs: `googleapis`.
- Current source of truth during transition: central Google Sheet + SQLite read model.
- Target multiuser model: central operational registry + per-user Google spreadsheet + local read model keyed by `user_id`.
- OAuth token storage: encrypted local SQLite for beta, with a clear future path to Postgres/Secrets Manager if scale grows.
- Default Google OAuth scopes:
  - `https://www.googleapis.com/auth/drive.file`
  - `https://www.googleapis.com/auth/calendar.events.owned`

## Commands
- Run tests: `npm test`
- Unit/lifecycle subset: `node --test tests/userLifecycle.test.js tests/unit.test.js`
- Functional tests: `npm run test:functional`
- Start locally: `npm start`
- Deploy on EC2 after push: `git pull origin main && npm install && pm2 restart financas-bot --update-env`
- Health check: `curl http://localhost:8787/dashboard/health`

## Project Structure
- `src/services/userService.js`: user lifecycle, consent, approval, profile/settings lookup.
- `src/handlers/messageHandler.js`: WhatsApp routing, admin commands, lifecycle gates.
- `src/services/google.js`: existing central Sheets/Calendar integration; must evolve toward user-scoped Google clients.
- `src/services/sqliteReadModelService.js`: local indexed read model.
- `docs/decisions/ADR-002-admin-financial-data-access.md`: mandatory privacy gate.
- `docs/decisions/ADR-003-multiuser-google-owned-spreadsheets.md`: accepted multiuser/OAuth direction.
- `docs/plans/multiuser-google-oauth.md`: implementation task breakdown.

## Code Style
Prefer explicit lifecycle gates and deterministic checks before AI.

```js
if (user.status === USER_STATUS.APPROVED_AWAITING_GOOGLE) {
    return {
        allowed: false,
        user,
        reply: 'Seu cadastro foi aprovado. Agora falta conectar sua conta Google para ativar o bot.'
    };
}
```

## Testing Strategy
- Unit tests cover lifecycle transitions and admin checks.
- Functional tests may simulate Google OAuth completion by moving a test user to `ACTIVE`.
- Security tests must prove users cannot access another user's financial data.
- Release smoke must include:
  - new user `ACEITO` -> `PENDING_APPROVAL`;
  - `admin aprovar` -> `APPROVED_AWAITING_GOOGLE`;
  - approved user without Google cannot use financial commands;
  - Google-connected user can onboard and use dashboard.

## Boundaries
- Always:
  - Keep Thaís out of `ADMIN_IDS`.
  - Keep financial writes requiring `user_id`.
  - Keep admin financial broad access marked as beta-only until removed.
  - Encrypt OAuth refresh tokens at rest.
- Ask first:
  - Adding a new database service.
  - Starting PDF/image statement parsing.
  - Changing Google OAuth scopes.
  - Removing existing card labels/legacy sheet tabs.
- Never:
  - Store refresh tokens in Google Sheets.
  - Commit secrets or `.env`.
  - Activate a real new user before Google OAuth is complete.
  - Give admins production access to arbitrary user transaction-level financial data.

## Success Criteria
- `PENDING_APPROVAL` exists and is used after consent.
- `admin aprovar <telefone>` exists and is audited.
- `APPROVED_AWAITING_GOOGLE` blocks normal bot usage.
- OAuth tokens are encrypted at rest in local SQLite.
- OAuth callback creates a user-owned spreadsheet template before activation.
- `.env` on production has `ADMIN_IDS` without Thaís.
- Multiuser OAuth tasks are planned before implementation of per-user sheets.
- CSV/OFX import is planned before PDF/image import.

## Open Questions
- Which exact Google OAuth scopes will be accepted for Calendar after testing least-privilege behavior?
- Should OAuth token storage remain SQLite-only for dozens of users, or move to Postgres before public beta?
- What retention policy should apply to uploaded CSV/OFX raw files after import?
