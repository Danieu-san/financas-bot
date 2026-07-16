# Phase 9E.0 - fail-closed rollout readiness gate - 2026-07-16

## Verdict

`GO` for local `shadow` readiness.

`NO-GO` for production activation and actual WhatsApp delivery until the 9E.1
one-source smoke passes.

## Required route and controls

- route must be `Meu Pluggy -> Connector 200 -> FinancasBot read-only`;
- observed cost must be zero and no payment method may be registered;
- Pluggy Pro merchant/category data cannot be required;
- categorization remains local in FinancasBot;
- Update Item and every financial write remain forbidden;
- encrypted vault must be mounted;
- `shadow` cannot select a recipient;
- `canary` must select exactly one known source alias;
- modes other than `off`, `shadow` and `canary` fail closed.

Official product pages consulted for the commercial boundary:

- https://www.pluggy.ai/meu-pluggy
- https://www.pluggy.ai/precos

The repository evidence file is a sanitized policy example, not proof of the
current Dashboard billing state. Actual canary activation must confirm that
account state again and persist the evidence only in the encrypted private
vault.

## Evidence

- rollout policy tests `5/5`;
- canary delivery tests `5/5`;
- focused outbox/rollout/delivery gate `15/15` after lease coverage;
- combined Open Finance gate `61/61`;
- full repository suite `954/954` plus pre-gates 6A `17/17`, 6B `41/41`, 6C
  `8/8`, 6D `5/5` and 6E `5/5`;
- real shadow readiness: vault available, read/outbox permitted, WhatsApp
  disabled, Update Item disabled, Pro disabled and writes disabled;
- production, PM2, scheduler, WhatsApp, Sheets and ledger unchanged.

## 9E.1 smoke gate

1. Confirm the Dashboard still has no payment method and the active path is
   Connector 200.
2. Select only `daniel_nubank` as canary.
3. Create one new low-value transaction in that source.
4. Refresh/synchronize it through Meu Pluggy without calling Update Item.
5. Run one read-only poll and prove exactly one new candidate.
6. Deliver exactly one WhatsApp alert to Daniel.
7. Confirm message source, type, value, date and the explicit no-write notice.
8. Replay and restart: no second alert for the same milestone.
9. Confirm zero ledger, Sheets and movement writes.
