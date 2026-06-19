# Accelerated enforce gate - 2026-06-19

## Goal

Reduce passive waiting before considering `INTERPRETATION_RELIABILITY_MODE=enforce`
for the first write slice:

- `expense.create`
- `income.create`

This gate does not activate `enforce`. It only decides whether there is enough
active evidence to request a final high-capacity manual audit.

## Why this exists

The conservative readiness monitor requires 14 days of passive shadow telemetry.
For the current family-only use case, this can be replaced by active evidence if
the evidence is explicit, repeatable and safer than simply waiting.

## Evidence required

- Offline interpretation battery green.
- Target operations covered with enough cases.
- Adversarial cases blocked.
- Shadow telemetry cutoff configured.
- Zero critical divergence after the audited cutoff.
- Real E2E with marker verified.
- Rollback by flag verified.
- Logs reviewed and clean.

## Command

```powershell
npm run gate:enforce:accelerated
```

Optional hard gate:

```powershell
npm run gate:enforce:accelerated -- --require-ready
```

To mark active evidence after it is actually verified:

```powershell
npm run gate:enforce:accelerated -- --e2e-verified --rollback-verified --logs-verified
```

## Safety rules

- The runner never changes `INTERPRETATION_RELIABILITY_MODE`.
- The runner never writes financial data.
- The runner does not call Gemini.
- A green result means only `READY_FOR_ALTISSIMA_AUDIT`, not automatic release.
- The final activation decision still requires a manual audit in high reasoning.

## Current status

Operational execution on EC2 completed on 2026-06-19.

Evidence:

- offline acceptance: `350/350`;
- target `expense.create`: `80/80`;
- target `income.create`: `70/70`;
- adversarial blocks: `30/30`;
- shadow cutoff: `2026-06-18T00:00:00.000Z`;
- shadow critical divergences after cutoff: `0`;
- real E2E with Daniel verified using marker
  `TESTE_APAGAR_ENFORCEGATE_20260619155922`;
- marker cleanup verified: 1 expense and 1 income removed from the personal
  spreadsheet, second cleanup found zero leftovers and `financial_events_public`
  returned zero marker rows;
- rollback by flag verified on server with production still in
  `INTERPRETATION_RELIABILITY_MODE=shadow`;
- logs for the test window had no WARN/ERROR/CRITICAL and kept identifiers
  redacted.

Final production gate result:

```text
READY_FOR_ALTISSIMA_AUDIT
```

Report:

```text
/home/ubuntu/financas-bot/data/qa-runs/ACCEL_GATE_VERIFIED_20260619T190912Z/accelerated-enforce-gate-report.json
```

## Next step

Run the final high-reasoning manual audit. If approved, activate
`INTERPRETATION_RELIABILITY_MODE=enforce` only for `expense.create` and
`income.create`, with immediate rollback by flag to `shadow`.
