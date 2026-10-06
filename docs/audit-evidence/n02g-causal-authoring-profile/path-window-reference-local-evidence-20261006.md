# Authored window reference — local causal evidence, 2026-10-06

Reviewed base: `3e56122a2f445cebb56d0b6113d7019a559eb1c1`.
This is executor-local evidence, not independent code approval.

## Scope and invariant review

Measured delta against the reviewed base consists only of:
- `src/next/provenance/pathSemanticReference.js`: resolves admitted authored
  month/range windows from frozen claim, literal or primary snapshot scalars.
- `tests/next/provenance/pathSemanticV2.cases.js`: adds reference-only case 012;
  prior D/P cases and assertions remain unchanged.

The resolver checks exact window shape, civil validity, range order and boolean
inclusivity; bound selection is only start/end of a valid range. It does not
recurse into windows from scalar bindings, read parent/derived material, use
guest/runtime/IR/actual as expected, introduce locators, or change the schema,
registry, compiler, capture, matcher, claim, oracle, trace rules or mutation IDs.
Existing private candidate authority and baseline/one-patch restoration remain
required before reference resolution. Cloned capabilities remain rejected.
Unsupported forms stay unavailable, not SKIP or satisfied.
Source review performed against the exact reviewed reference and test blobs.
This is bounded static review, not an independent auditor rerun.

## Local tests and preserved failures

Syntax 2 PASS; causal reference-only RED 1 FAIL at F-03/calendar_close_day,
followed by focal 1 PASS with source measurements unchanged per phase.
37 reference/type/API affected titles PASS with exact title accounting.

Two attempts used an inappropriate 120-second wrapper budget and remain RED:
- Aggregate39 report `f5c8d4bf3dadc14732c08d76ce8e443e6ed68fac9b1cd80cd3a4d18d9e758c7d`,
  ETIMEDOUT/status null, incomplete TAP.
- Sharded report `96967370bc3937bdec8d8b3976c3c9d9e0dde422e0cc1ec94f547109d4abdf15`:
  part1 37 PASS, part2 test002 timed out, part3 test006 not run; incomplete.

The previously GREEN scoped broad already measured test002 at 222082.9869 ms
and test006 at 175803.3448 ms, both exceeding that wrapper budget. This proves
the selected budget was inadequate; it does not prove a runtime defect or
explain historical cancellations. Readonly M01/F01 comparison found no increase
in COUNT of independently discriminating alternatives, report
`d0355d8ce626cdb2dfb14787817447216a54f441ee926934ee611ea9dd818b73`;
it does not establish exact candidate equivalence.

A separate exact-two-title affected run used the original hermetic runner,
same aggregate, coverage, network tripwire, seriality and native D/P limits.
The original runner has no overall timeout; no limit was increased.
Completed 08:58:37.200Z: 2 PASS / 0 fail,cancel,skip,todo, exit0; exact titles,
capture complete, output hashes/bytes verified, 19 retained valid coverage JSONs
with hashes verified, measured765 sources unchanged.
Report `f9557231d243cdb7c8cfa08422b81815112d146a9aa13d6262fb01b811868efa`.
The original runner `valid=false`, reason `unexpected_skipped_tests`, is retained
because this exact subset has no global expected SKIPs.
`affected_scope_valid=true` is not a global broad green.

## Newly resolved scope only

Scope derives from the five previously unavailable rows with authored
alternatives in frozen census
`72a25240a657d8b5085d3b09c9c7eee61af01f0fd78a700c78518802cdf349e5`.
Previously GREEN five civil IDs were not rerun in this qualification batch.

New readonly census: 5 IDs, 13 alternatives, 5 discriminating rows, DP0/matched0,
report `c6575ba00a21de8b09cb592a5b6451862c02a9309f638cff0a9986530c6c653a`.
Whole-compiler preflight: 13/13 admitted candidates, IDs/candidates unique,
accounting complete, sources intact, DP0/matched0,
report `54f0236e5ebf16f90cdb24f5d8cebdf7cae6a1cde269f1c373bb12c09ebd8ab5`.

Real scoped D/P completed 09:06:33.321Z, expected/generated/executed/matched
5/5/5/5, unique IDs/invocations 5/5, 5 baselines, zero unsatisfied in this report,
accounting/scope valid, sources intact.
Report `2e0359a2cdec3e2b2cd2fc5bfd998b1f35f32aabfbaf2f10b79ecc70855fb28d`.
Rows: F-03#2#1, M-05#1#1, S-05#1#1/calendar_close_day; and
M-13#1#3, M-13#1#6/calendar_budget_bounds.
Each row preserves independently sealed expected, whole compiler admission,
real D/P, target false, proof false, exact period violation, outside-target
observations, phase coverage and positive oracle. No financial receipt or
graph acceptance; no normalization of mutated locator back to original.
Five civil rows without alternatives remain required/UNSAT.

Full scalar authored expected remains2419;2414 outside THIS scoped report is
not a consolidated global balance. No sum with historic387 matched or the
monthly profile; historical reports and IDs are unchanged.
Measured765 source hash:
`f1576690ab9b9e3e008d6049b2ebd1f8b50d854ba9c0334263d7d9480c73664d`.

## Next gate

The final stable broad completed10:02:03.012Z:2638tests/2628PASS/zeroFAILcancel/
10exactSKIP/exit0, coverage92.52 lines/80.67 branches/92.83 functions,
valid/capture/matrix_green=true,765sources unchanged. Report
`f1707bb2c3c9b921335ce191957dc89535e0068620d599720a83dfd1d930823d`.
Readonly verifier reparsed TAP/coverage/expectedSKIPs, output bytes/hashes,
718retained valid coverageJSONs/manifest, source delta and D/P row invariants.
The verifier only reconciles captures; it never executes compiler or D/P.
Its first documentary snapshot check found one extra terminal newline in the
census snapshot; only that snapshot was corrected to exact bytes, with no
measured-source change or repeated test. Final reconciliation passed.

Next: a new sanitized
immutable candidate based on3e56122a and independent Chat audit. Raw logs,
coverage and runtime outputs remain local; hashes/verifiers do not establish
independent execution. No code GO yet, semantic_mutation_credit0,
no activation/receipt/validated_parent/global G11/N02-G/NEXT-02/NEXT-03,
deployment, production or real data. Product original HEAD98e3d6a/WIP preserved.
