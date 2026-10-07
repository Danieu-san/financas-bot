# Negative execution reference for independent review

Cold BUILD capture, not approval or an independently replayed BUILD. No native
C/M/S invocation or financial handle was opened while creating these files.

`review-snapshot.json` pins the complete negative freeze, ten-file manifest,
precommit, compiler/adjudicator/ticket roots and 146 BUILD source fingerprints.
The ten manifest leaves are the exact captured UTF-8 bytes, including closed
bundles and their inherited project/vendor dependencies. They are not raw
runtime logs, authentication or financial data. Source and dependency semantics
remain subject to the explicitly scoped immutable code audit.

Snapshot SHA256:
`c706906b8d3b0a594765a0faef024178cea85941031f094c4af30115d9b6f030`.
Negative root SHA256:
`58958e8b65ae8587eef1ce275075d9da991714f72f31554735dc4d74287269c5`.

Publish these captured files without CRLF/LF normalization. The scoped
`.gitattributes` rule preserves their exact bytes. Normal source publication
and raw measured source fingerprints remain separately identified; changing
the sources or native executable invalidates this reference, even if a new
candidate is otherwise equivalent. This is not a portable-platform claim.

The sibling verifier checks construction/byte linkage only, without importing
the compiler, evaluator, guest, qualification or financial code. Its success
does not supply review authority, a semantic credit or a financial GO.

Operational use requires the new complete code plus this reference to pass
independent immutable review and local confrontation. Only then may the trusted
bootstrap supply the externally pinned snapshot SHA to the private qualifier.
Never derive that expectation from the candidate under admission or pass it
through the guest request. Guest input remains solely `mutation_id`.

Until that review and a fresh own invocation, operational credit remains zero.
Historic UNSAT rows and the ordinary period+trace diagnosis are not rewritten.
