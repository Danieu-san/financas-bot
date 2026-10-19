# B4-01 — local causal correction, not independent approval

The parent056b tripwire used host.startsWith('127.'). A pure local reproduction
and the real canonical test both rejected the claim:127.example.invalid was
classified as loopback. This does not prove prior external network traffic.

Before editing, both target files were confirmed among the existing17allowed
paths. Their previous working bytes matched the published parent, with
pre-existing staged/unstaged changes preserved. No index reset/rebaseline or
permission change. Original runtime/checkers/financial code was not modified.

## Cause→control→executed evidence

- IPv4 classification:literal net.isIP(host)===4 plus127. prefix, using the
  existing builtin import. localhost/::1/empty/0.0.0.0 policies retained.
  Real test RED1FAIL/native1 preceded the classifier change; focal GREEN followed.
- HTTP input:Node URL options are merged with own-enumerable caller options;
  hostname precedes host. The former extractor ignored hostname overrides.
  Parse errors are separated from option access so getter exceptions do not
  become an empty allowed host. Object-form non-enumerable properties follow
  the same copy semantics as normal HTTP options.
- fetch input:Request is not HTTP options. Obtain its internal URL with the
  native prototype getter, ignoring an own url shadow. Otherwise capture
  String(input) once. RequestInit hostname is not an override. Forward the
  same native Request and same init without cloning/consuming body; pass the
  captured primitive for non-Request input. Empty/invalid fetch host is refused.
- Both ordinary-input gaps were durable RED before the adapter:2tests/0PASS/
  2FAIL/native1,416.0356ms. After adapter:2PASS/native0,400.9466ms.
- Final affected battery:21harness+2immutableGitBlob=23PASS/native0,8125.8066ms,
  Node22.17.0/128MiB/serial. Fixture junctions required the normal approved
  execution profile; no ACL/UAC/global configuration was changed.

The generated finite class includes96valid literal addresses and96DNS names
derived from them, including non127prefixes. It does not enumerate an allowlist
of domains. HTTPstring/URL and fetchstring/URL/Request forms, effective-host
precedence, shadowed Request.url, one-time coercion and body/init preservation
are covered. Synthetic originals in an isolated child receive allowed requests;
real network implementations are never called by these new regression cases.

Current helper:23154bytes/SHA256
5a48bcb39a01af2c41a31eca5b62c9eb2d1eb5c465b75bb5a0362cceccd41838.
Current testfile:38225bytes/SHA256
d66af1b8730d195f2be1b12710e660ad705c9960319ba1ebc77ace3e27307f2b.
The original runner remains SHA256
83c6c0729170dbb298cd4460eb471353625495c90fb6564e524eea443a7eb2bc.

## Integral evidence and uncertainty

See validation-evidence.json for the separate first RED broad, one unchanged
focal diagnostic and one finite all-green integral confirmation. The first
failure was an unchanged evaluator witness's2500ms host deadline. Its external
cause was not proven. No timeout, assertion, test selection, resource quota or
priority was changed to obtain the confirmation; the RED is not discarded.

This fix is a selected-JS-surface test guard, not universal OS/UDP/DNS/custom
agent isolation or proof about arbitrary replacement of intrinsics. No new
resolver/protocol/helper-engine/model/schema/dependency/vendor patch was added.
It is not an independent rerun, full static approval, operational TCB review,
fresh qualification or closure of S01/program/effects/12rules. All operational
qualified/credit/exec/finance/receipt/validated_parent/globalGO/NEXT03 flags
remain false/zero. The independent integrated judgment must assess the complete
candidate and retained gaps, not add component approvals.
