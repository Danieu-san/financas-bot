# Spec: FinancasBot Personal Finance Operating System

## Direction Marker
Destination: personal finance operating system.

Path: reliable data-driven core first, then expand surfaces and automation.

Source decision: `docs/decisions/ADR-001-product-direction-personal-finance-os.md`.

Every requirement in this spec is classified as:

- Core foundation: required for reliability, data quality, privacy, cost control, or scalability.
- Product surface: user/admin-facing experience built on the foundation.
- Future expansion: aligned with the destination, but not required for the next reliable slice.

## Objective
Build FinancasBot into a reliable personal finance operating system that uses WhatsApp for daily capture and conversation, a web dashboard for visual understanding, Sheets for audit/source records, SQLite for low-cost read queries, and AI only where it adds leverage.

Primary users:

- Current personal users: Daniel and trusted initial users.
- Near-future users: additional WhatsApp users invited into the system.
- Admin user: Daniel, operating user lifecycle, support, tests, and production health.

Success means:

- Users can register financial events quickly through WhatsApp.
- Users can understand their month, cashflow, debts, goals, and alerts visually through the dashboard.
- Common questions are answered deterministically from SQLite/read-model data, not by sending raw spreadsheet rows to AI.
- Multiuser isolation is reliable: no user sees or modifies another user's financial data.
- The bot can be tested locally and with real WhatsApp Web before production changes.
- Operations can be diagnosed from logs, metrics, and admin commands without manually opening the spreadsheet for every issue.

## Current Tech Stack
- Runtime: Node.js `>=18`.
- Messaging: `whatsapp-web.js` via Puppeteer/Chromium.
- AI: Gemini through `src/services/gemini.js`.
- Storage/audit: Google Sheets.
- Calendar/reminders: Google Calendar through Google APIs.
- Read model: SQLite through `better-sqlite3`.
- Dashboard: Node/Express-style local server in `src/services/dashboardServer.js`.
- Tests: Node built-in test runner (`node --test`) plus Playwright for WhatsApp Web E2E.
- Process manager: PM2 on EC2.
- Deployment target: AWS EC2.

## Dashboard Roles

The project intentionally has two dashboard surfaces with different jobs:

- Web dashboard: user-facing view opened from the WhatsApp `dashboard` command through a short-lived token link. This is the primary product UI for monthly review, cashflow, categories, debts, goals, alerts, and recent transactions.
- Google Sheets dashboard: admin/audit overview generated from the spreadsheet/read model. It exists to inspect source-of-truth data, validate formulas/sync, and support operations. It should not become the main user interface.

Do not duplicate every web dashboard feature inside Google Sheets. If a feature is for daily user understanding, prefer the web dashboard. If a feature is for auditability, data cleanup, or admin investigation, keep it in Sheets.

## Commands
Install dependencies:

```bash
npm install
```

Start locally:

```bash
npm start
```

Run full automated suite:

```bash
npm test
```

Run unit/config/driver tests only:

```bash
npm run test:unit
```

Run functional test harness:

```bash
npm run test:functional
```

This command is destructive because it resets spreadsheet data before running. It must fail safely unless the environment explicitly marks the target as a test spreadsheet:

```env
SPREADSHEET_RESET_CONFIRMATION=RESETAR_PLANILHA_TESTE
FUNCTIONAL_TEST_SPREADSHEET_ID=<same value as SPREADSHEET_ID>
# or, for a clearly temporary/local sheet only:
SPREADSHEET_IS_TEST=true
```

Production spreadsheets must not be reset by default. If a maintainer temporarily allows reset while the sheet is intentionally disposable, that decision must be explicit in the environment and not committed.

Run real WhatsApp E2E setup:

```bash
npm run test:whatsapp:e2e:setup
```

Check real WhatsApp E2E login/chat access:

```bash
npm run test:whatsapp:e2e:check
```

Run real WhatsApp E2E smoke:

```bash
npm run test:whatsapp:e2e
```

Reset spreadsheet test data:

```bash
npm run reset:spreadsheet
```

Backfill user IDs:

```bash
npm run backfill:user-id
```

Seed known users:

```bash
npm run seed:known-users
```

Finalize legacy user IDs:

```bash
npm run finalize:legacy-user-id
```

EC2 deploy/restart pattern:

```bash
cd /home/ubuntu/financas-bot
git pull origin main
npm install
pm2 restart financas-bot --update-env
pm2 logs financas-bot --lines 120 --nostream
```

## Project Structure
```text
index.js                    -> Application entry point.
src/ai/                     -> Intent classification and response generation.
src/config/                 -> Constants and static configuration.
src/handlers/               -> WhatsApp message, onboarding, creation, deletion, debt flows.
src/jobs/                   -> Scheduled jobs.
src/services/               -> Google APIs, Gemini, read-model, dashboard, financial logic.
src/state/                  -> Conversation state store.
src/testing/                -> Real WhatsApp E2E helpers and drivers.
src/utils/                  -> Shared utilities, auth, metrics, logging, cache, rate limit.
scripts/                    -> Operational and test scripts.
tests/                      -> Unit, functional, integration, and E2E tests.
docs/decisions/             -> ADRs.
docs/ideas/                 -> Product direction notes.
docs/specs/                 -> Specifications.
docs/plans/                 -> Implementation plans.
data/                       -> Local read-model/runtime data.
logs/                       -> Runtime logs when present.
```

## Code Style
Use small CommonJS modules with explicit functions and defensive validation at boundaries. Prefer deterministic logic over AI calls for calculations and routing that can be expressed locally.

Example style:

```javascript
function normalizeWhatsappId(value) {
    return String(value || '').trim();
}

async function handleDashboardCommand(msg, user, senderId) {
    const body = normalizeText(String(msg.body || '').trim());
    if (!['dashboard', 'painel', 'painel financeiro'].includes(body)) return false;

    const linkData = buildDashboardAccessLink({ userId: user.user_id });
    if (!linkData) {
        await msg.reply('Dashboard indisponível no momento.');
        logger.warn(`[dashboard] base_url_ausente sender=${senderId} user_id=${user.user_id}`);
        return true;
    }

    await msg.reply(`Seu painel está pronto:\n${linkData.url}`);
    return true;
}
```

Key conventions:

- Keep user-facing behavior deterministic when possible.
- Guard all financial records with `user_id`.
- Keep admin actions logged with structured context.
- Do not send raw spreadsheet rows to AI when a summary or SQL query can answer the question.
- Prefer clear helper functions over large inline conditionals.
- Comments should explain why, not restate what the code does.

## Functional Requirements

### Core Foundation
- Users must have lifecycle status: `PENDING`, `ACTIVE`, `INACTIVE`, `BLOCKED`, `DELETED`, `EXPIRED`.
- New users must consent before becoming active.
- Consent must be logged with timestamp, terms version, channel, and evidence.
- Onboarding must collect enough data to power financial health calculations.
- Conversation state must not depend on LLM memory.
- No new financial record may be accepted without `user_id`.
- Google Sheets remains audit/source storage for the current stage.
- SQLite read model must support common queries and dashboard reads.
- Common financial questions should use deterministic calculation/read-model first.
- AI calls must be reserved for parsing, classification fallback, transcription, and language generation where necessary.
- Admin commands must support daily operation without manually editing the spreadsheet.
- Logs and metrics must make production failures diagnosable.

### Product Surface
- WhatsApp must support:
  - consent and terms;
  - onboarding;
  - expense registration;
  - income registration;
  - debt creation/payment;
  - goal creation;
  - deletion confirmation;
  - summary questions;
  - dashboard link generation;
  - admin commands.
- Dashboard must show per-user financial overview and never leak another user's data.
- Dashboard access should remain tokenized and temporary for the current stage.
- Reports and alerts should explain why they are shown, not only state the result.
- Admin commands should be logged and safe for user lifecycle operations.

### Future Expansion
- Move from SQLite to Postgres when user count, data volume, or operations justify it.
- Add richer user roles beyond admin/user.
- Add more automation only after opt-in behavior is validated.
- Add richer dashboard editing only if read-only dashboard usage proves insufficient.
- Consider Open Finance only after core reliability, privacy, and legal posture are mature.

## Non-Functional Requirements

### Reliability
- Bot startup should fail loudly when critical integrations are unavailable.
- WhatsApp startup should avoid restart loops while waiting for QR scan.
- Google API auth should reconnect on recoverable auth errors.
- State flushing must be atomic to avoid corruption.

### Privacy And Security
- Secrets must stay in `.env`, never committed.
- Financial data must be isolated by `user_id`.
- Dashboard tokens must be signed, time-limited, and scoped to one user.
- Admin commands must require admin identity and produce audit logs.
- `BLOCKED` users must not interact with the bot.

### Cost And Performance
- Avoid reading entire Sheets tabs for common user questions.
- Avoid sending raw data to Gemini when deterministic summaries are available.
- Track slow Gemini calls and message handling latency.
- Use SQLite indexes/read model for user/month/category queries.

### Operability
- PM2 logs should show startup, WhatsApp readiness, read-model sync, admin actions, dashboard link events, and errors.
- There should be a clear EC2 deploy command sequence.
- Real WhatsApp E2E should remain opt-in and safe.

## Testing Strategy

### Unit Tests
Use `node --test` for small deterministic functions:

- parsers and normalizers;
- local question classification;
- local response formatting;
- user isolation helpers;
- dashboard auth helpers;
- onboarding guards;
- consent/lifecycle behavior.

### Functional Tests
Functional tests should cover full bot flows with mocks or controlled test Sheets:

- consent + onboarding;
- expense and income flows;
- credit card installments;
- debts and goals;
- deletion;
- dashboard command;
- admin commands.

Current known gap: `functional.test.js` is skipped by default and should be either stabilized or broken into smaller reliable tests.

### Real E2E Tests
Use Playwright + WhatsApp Web only for critical smoke paths:

- open configured bot chat;
- terms;
- expense registration;
- analytical question;
- dashboard link.

Real E2E must remain opt-in through environment variables and should not run accidentally in CI or normal `npm test`.

### Manual Smoke
After production deploys, verify:

- bot replies in WhatsApp;
- `dashboard` returns a working link;
- PM2 logs show no new fatal errors;
- read-model sync is healthy.

## Boundaries

### Always Do
- Preserve the direction marker from ADR-001 in specs and plans.
- Run relevant tests before commits.
- Keep `user_id` mandatory for new financial data.
- Keep secrets out of git.
- Log admin actions.
- Prefer deterministic calculations over AI.
- Make user-visible changes testable.

### Ask First
- Adding new dependencies.
- Changing Google Sheets schema.
- Changing dashboard authentication.
- Changing user lifecycle states.
- Migrating from SQLite to Postgres.
- Adding proactive recurring WhatsApp messages.
- Sending or deleting production data.
- Running destructive reset scripts.

### Never Do
- Commit `.env`, credentials, tokens, WhatsApp sessions, or private keys.
- Remove tests to make a suite pass.
- Let users access data without matching `user_id`.
- Use AI as the source of truth for financial calculations.
- Build broad new product surfaces without tying them to ADR-001.
- Silently ignore Google/WhatsApp/API failures in production paths.

## Success Criteria
- `npm test` passes.
- Real WhatsApp E2E smoke can pass when explicitly enabled and WhatsApp Web is authenticated.
- A new user can consent, onboard, register a transaction, ask a financial question, and open dashboard.
- An admin can inspect and manage users without opening the spreadsheet.
- Common financial questions are answered from SQLite/read-model where supported.
- Dashboard displays only the requesting user's data.
- Logs can explain failures in Google auth, WhatsApp readiness, read-model sync, admin commands, and slow AI calls.
- Any future implementation plan classifies work as Core foundation, Product surface, or Future expansion.

## Open Questions
- What exact threshold triggers a move from SQLite to Postgres?
- Should the dashboard remain read-only through the next stage?
- What is the target maximum AI cost per active user per month?
- Which privacy/retention rules are required before onboarding users outside the trusted group?
- Should admin commands that affect user status require a confirmation step?
- Should the functional test suite use a dedicated spreadsheet instead of the production spreadsheet?
