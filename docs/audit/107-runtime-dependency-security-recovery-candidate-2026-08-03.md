# Runtime dependencies — security recovery candidate

Date: 2026-08-03

## Release gate discovery

The OCI preflight confirmed the current production release is healthy and still
runs `33ab7969bf9ef4190a64f103e46b1ddce9ffe4b0`. Before building the already
approved Open Finance recovery, `npm audit --audit-level=high` found two high
severity transitive vulnerabilities in dependencies shipped by the runtime:

- `brace-expansion` below the patched ranges, reachable through `archiver`;
- `js-yaml` 4.2.0, reachable through Puppeteer's `cosmiconfig` dependency.

Because the permanent OCI checklist does not permit a blocking runtime
vulnerability, the previously approved product hash was not deployed.

## Mechanical recovery

Only `package-lock.json` changed. The package graph now resolves:

- development-only `brace-expansion` 1.1.18;
- runtime `brace-expansion` 2.1.4 in both affected paths;
- runtime `js-yaml` 4.3.1.

No direct dependency, product source, flag, environment value, test or release
script changed. `npm audit fix` reported four package resolutions changed and
zero known vulnerabilities afterward.

## Local evidence

- `npm audit --audit-level=high`: zero vulnerabilities after recovery;
- `npm audit --omit=dev --audit-level=high`: covered the runtime graph before
  the recovery and established that both findings reached production packages;
- exhaustive hermetic suite: 1,432 tests, 1,427 passed, zero failed and five
  expected functional skips;
- coverage: lines 90.58%, branches 72.95%, functions 90.14%;
- agent workflow validation: green.

These counts are local Codex evidence and are not execution by the independent
auditor.

## Invariants and requested independent review

The candidate must preserve the independently approved Open Finance behavior
from `c26594f3f11cbe702acee37dd85b72f6721d686c`: prompt enabled, write mode off,
approval false and `confirm` blocked. The independent review should verify the
immutable diff from the prior documentation head, confirm the patched lockfile
resolutions and decide whether the dependency-only change invalidates any part
of the earlier causal GO.

## State

`LOCAL CANDIDATE; AWAITING INDEPENDENT AUDIT; NO-GO FOR DEPLOY`.

