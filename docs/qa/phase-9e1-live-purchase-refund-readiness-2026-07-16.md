# Phase 9E.1 - live purchase/refund canary readiness - 2026-07-16

## Verdict

`GO` for a one-source production canary deploy.

The gate is not complete until Daniel receives the two real WhatsApp alerts and
restart/replay proves that neither is sent twice.

## Real evidence

- Daniel created and then received a refund for one low-value Nubank credit-card
  purchase;
- before a manual Meu Pluggy refresh, the API remained at 2,205 transactions;
- after the refresh, the API exposed 2,207 transactions and the baseline found
  three new observations;
- sanitized classification: one `purchase/PENDING`, one `refund/PENDING` and one
  unrelated `income_candidate/POSTED`, all scoped to `daniel_nubank`;
- the outbox kept purchase and refund pending and moved the unrelated income to
  `blocked`;
- staging, ledger, Sheets and financial writes remained zero.

## Runtime controls

- runtime starts only with `OPEN_FINANCE_ALERT_MODE=canary`;
- exactly one source alias is permitted;
- polling is read-only and cannot run more often than every six hours;
- polling never calls Pluggy Update Item and therefore cannot refresh the bank;
- only `purchase` and `refund` are alertable in the first canary;
- source owner resolves to exactly one WhatsApp recipient or fails closed;
- encrypted baseline/outbox state is required before canary startup;
- transport uses a durable lease, at-least-once retry and pseudonymous ack;
- every message says that nothing was saved automatically.

## Evidence

- runtime focused gate `2/2`;
- combined Open Finance gate `64/64`;
- full repository suite `957/957`;
- pre-gates 6A `17/17`, 6B `41/41`, 6C `8/8`, 6D `5/5`, 6E `5/5`;
- local mock delivered exactly purchase and refund and quarantined the unrelated
  income with zero financial writes.

## Free-route limitation

Official Pluggy documentation states that new transactions appear only after an
Item update and that Open Finance data can take up to 24 hours. Automatic update
intervals are tied to Production applications and plans. The current personal
free route must therefore assume a manual Meu Pluggy refresh when immediate data
is desired. FinancasBot polling only reads already refreshed data.
