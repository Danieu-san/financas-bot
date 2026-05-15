# Implementation Plan: Multiuser Google OAuth

## Overview
Implement multiuser access in safe vertical slices. The first slice changes lifecycle behavior without touching Google OAuth yet; later slices add OAuth, user-owned spreadsheets, dynamic cards, dashboard/read-model routing, and CSV/OFX import.

## Architecture Decisions
- Manual approval is required for every new user.
- Google connection is mandatory before financial features.
- The user's finance spreadsheet lives in the user's own Google Drive.
- Central storage keeps operational metadata only.
- CSV/OFX import ships before PDF/image import.
- Thaís remains usable as a test user but is not an admin.

## Task List

### Phase 1: Lifecycle Gate Foundation

#### Task 1.1: Remove Thaís From Admin Defaults
**Description:** Ensure test defaults and deployment guidance do not grant admin privileges to Thaís.

**Acceptance criteria:**
- [x] Test `ADMIN_IDS` defaults only include Daniel.
- [x] Docs state Thaís is a normal/test user, not admin.
- [x] EC2 `.env` has `ADMIN_IDS` without `5521964270368`.

**Verification:**
- [x] `node --test tests/unit.test.js`
- [x] `npm test`
- [x] Server check: `grep ADMIN_IDS .env`

#### Task 1.2: Add `PENDING_APPROVAL`
**Description:** After `ACEITO`, users wait for admin approval instead of becoming active.

**Acceptance criteria:**
- [x] `ACEITO` appends `ConsentLog`.
- [x] User status becomes `PENDING_APPROVAL`.
- [x] Onboarding does not start.
- [x] Admin notification is attempted when WhatsApp client is available.

**Verification:**
- [x] `node --test tests/userLifecycle.test.js`

#### Task 1.3: Add `admin aprovar`
**Description:** Admin approval moves the user to `APPROVED_AWAITING_GOOGLE`.

**Acceptance criteria:**
- [x] Command appears in `admin ajuda`.
- [x] Command logs structured audit context.
- [x] Approved user still cannot use financial features before Google OAuth.

**Verification:**
- [x] `node --test tests/userLifecycle.test.js tests/unit.test.js`

### Phase 2: Google OAuth Foundation

#### Task 2.1: OAuth Connection Schema
**Description:** Add local encrypted OAuth token storage and central metadata for connection status.

**Acceptance criteria:**
- [x] Refresh tokens are encrypted before storage.
- [x] No OAuth secrets are stored in Sheets.
- [x] User can have connection metadata including `spreadsheet_id` and Calendar metadata.

**Verification:**
- [x] Unit tests for encryption/decryption and missing key behavior.

#### Task 2.2: OAuth Routes
**Description:** Add endpoints for starting and completing Google OAuth.

**Acceptance criteria:**
- [x] Approved user receives a short-lived connect link.
- [x] OAuth callback validates state token.
- [x] Successful callback creates/stores OAuth connection.

**Verification:**
- [x] Contract/unit tests for valid/invalid state.
- [x] Unit test for callback storing encrypted tokens and activating connected user.
- [ ] Manual browser smoke.

### Phase 3: User-Owned Spreadsheet

#### Task 3.1: Spreadsheet Template Creation
**Description:** Create the finance spreadsheet in the user's Drive after OAuth.

**Acceptance criteria:**
- [x] Spreadsheet is created with required tabs and headers.
- [x] `spreadsheet_id` is stored for that user after OAuth callback.
- [x] User can reopen existing spreadsheet instead of creating duplicates when metadata already has `spreadsheet_id`.

**Verification:**
- [x] Unit tests for template definition.
- [ ] Manual OAuth smoke with one test user.

#### Task 3.2: User-Scoped Google Client Routing
**Description:** Financial reads/writes use the user's Google client and spreadsheet ID.

**Acceptance criteria:**
- [ ] Financial writes for connected users go to their spreadsheet.
- [ ] Central registry does not store transaction details for production users.
- [ ] Legacy central spreadsheet remains supported only during transition.

**Verification:**
- [ ] Functional tests with mocked per-user spreadsheet IDs.

### Phase 4: Dynamic Cards

#### Task 4.1: User Card Registry
**Description:** Replace hardcoded card options for connected users with cards from their spreadsheet.

**Acceptance criteria:**
- [ ] User can register card name, bank, closing day, due day.
- [ ] Credit expense asks card only from that user's active cards.
- [ ] Existing legacy cards remain available during transition.

**Verification:**
- [ ] State-machine tests for card selection.

### Phase 5: CSV/OFX Import

#### Task 5.1: Statement Upload MVP
**Description:** Accept CSV/OFX statement files and parse transactions for review.

**Acceptance criteria:**
- [ ] PDF/image files are rejected with a clear message.
- [ ] CSV/OFX rows are parsed into proposed transactions.
- [ ] User must confirm before writes.
- [ ] Raw files are deleted after processing.

**Verification:**
- [ ] Unit tests with sample CSV/OFX fixtures.

### Phase 6: Privacy Hardening Before Scale

#### Task 6.1: Remove Admin All-Users Financial Access
**Description:** Close the ADR-002 beta exception before real multiuser scale.

**Acceptance criteria:**
- [ ] Admin dashboard cannot select `Todos os usuários` for transaction-level data.
- [ ] Admin APIs cannot query arbitrary user financial details.
- [ ] Tests prove user dashboard is isolated.

**Verification:**
- [ ] Dashboard security tests.
- [ ] Release checklist signoff.

## Risks And Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| OAuth scope too broad | Privacy/legal risk | Validate least-privilege scopes before shipping |
| Users stuck after approval | UX/support risk | Clear WhatsApp copy and admin status command |
| Token leakage | Critical security risk | Encrypt at rest; keep master key only in `.env` |
| Per-user Sheets breaks analytics | Product regression | Route read model by `spreadsheet_id` with tests |
| CSV/OFX formats vary widely | Import bugs | Start with explicit supported formats and preview/confirm |

## Checkpoints
- After Phase 1: lifecycle tests pass and Thaís is not admin.
- After Phase 2: OAuth callback works in browser and tokens are encrypted.
- After Phase 3: one real test user gets a spreadsheet in their own Drive.
- After Phase 5: import preview works without raw-file retention.
- Before multiuser launch: ADR-002 removal gate is complete.
