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

Initial local implementation added the gate and tests, but the local Windows
sandbox blocked direct execution of the standalone runner before Node started.
The module is covered by tests and should be executed operationally through
`npm run gate:enforce:accelerated` on a shell/EC2 session that can start the
script normally.

Expected status before real E2E/rollback/log evidence is marked:

- offline acceptance: green;
- shadow critical divergences after cutoff: zero;
- final gate: `KEEP_SHADOW`;
- blockers: `real_e2e_not_verified`, `rollback_not_verified`,
  `logs_not_verified`.

## Next step

Run the real controlled E2E and rollback check, then rerun this gate with the
three verification flags. If the gate returns `READY_FOR_ALTISSIMA_AUDIT`, move
to the final manual audit before changing any production flag.
