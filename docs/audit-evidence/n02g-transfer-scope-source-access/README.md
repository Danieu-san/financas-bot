# Transfer scope — complete source records for independent review

Code candidate: `98de8ef46ab2e0c3ee58a326a073322367cedbdf`.
Its sole parent: `e7b78e3e94f540ed685d4d35d82aac9b6de8246a`.
This auxiliary branch adds review evidence only. Do not merge or cherry-pick
it into the product. The candidate and its existing test results are unchanged.

## Pending review question

The first independent code review confirmed the candidate, parent, seven-file
delta, causal runtime, tests, helper and saved results. It found no causal code
defect, but returned NO-GO / incomplete because its access tools could not read
the three complete records before and after the change in the large corpus.
The remaining question is whether the actual three records differ ONLY by the
six required_reads and six required_structural has entries in derivation.

The six JSON files here contain complete objects, including proof, nodes, sets,
edges and every other field. They are not projections onto the changed fields.
All values are synthetic source fixtures already present in the repository.

| Fact | Original parent record | Candidate record |
| --- | --- | --- |
| S-08#1#1 | [before](S-08-1-1.before.json) | [after](S-08-1-1.after.json) |
| M-04#1#3 | [before](M-04-1-3.before.json) | [after](M-04-1-3.after.json) |
| N-07#1#1 | [before](N-07-1-1.before.json) | [after](N-07-1-1.after.json) |

## Source identity and exact comparison

`verify-source-access.cjs --check` reads both original corpus blobs directly
with `git show` using fixed full SHAs. It checks their SHA-256 and Git blob IDs,
the candidate's sole parent, 76 unique fact_keys, and each original complete
record line. It demands exact equality of every exported file with the object
read from that immutable source; `manifest.json` includes file hashes, original
line numbers, lengths and hashes. Its pins are fixed, not calculated from a
mutable current worktree and then treated as an expected source identity.

Independently of the saved proposal or trace, it clones the full parent corpus
and appends only the following entries to each of the three named records:

- required_reads: evt_transfer_out/transfer_pair and evt_transfer_in/transfer_pair;
- required_structural: has for each of those same node/field pairs.

Both obligations must be absent in the original derivation. Deep equality with
the entire candidate corpus then proves locally that all other fields and the
other 73 graphs are preserved. The records identify the scope of this reviewed
delta; the causal reason for it remains evaluator/subject/role/presence, already
examined in the first review. This verifier is not a generic authoring engine.

The script also reads the saved candidate validation record from the immutable
candidate and checks the three recorded tested-file hashes against that same
candidate's blobs. This ties saved evidence to bytes; it does not authenticate
that the tests ran. The LOW limitation raised in the first review is retained:
saved summaries are local evidence, not signed independent CI attestations.
No execution-authenticity or new test-run claim is made by this package.

## Local checks of this evidence package

- syntax check: PASS;
- --write-new and --check: PASS;
- --self-test: four mutated bundles rejected (removed read, before/after swap,
  wrong candidate, missing record);
- six full records, 76 source graphs, exact delta +6 reads/+6 has;
- three tested-file hash matches;
- no product test or wide suite repeated.

These are local checks. The independent reviewer must examine the files and
verifier, state access limitations, and finish only the previously blocked
review question. No global N02-G, NEXT-03, deploy or production approval.
