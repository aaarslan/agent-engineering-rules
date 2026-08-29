# Proportional Design

Choose the direct path or plan path before editing. Do not produce a design artifact merely to satisfy a ritual.

## Direct path

Proceed directly when the change is localized and reversible, desired behavior is clear, an existing pattern applies, and it does not introduce a boundary, alter a public or stored-data contract, or create a material security or external-effect decision. State the intended outcome, affected area, and verification approach; trivial mechanical edits need no written checkpoint.

## Plan path

Write a concise plan when the change crosses components or contracts, changes state or persistence, introduces a dependency or boundary, has irreversible or security-sensitive effects, carries meaningful ambiguity, or needs multiple independently verifiable increments.

Include only applicable decisions:

- evidence for current and desired behavior
- smallest complete change and existing pattern to follow
- affected boundaries, contracts, invariants, callers, and stored data
- error, security, compatibility, migration, and recovery behavior
- verification for each meaningful increment
- what deliberately stays unchanged

If the user or host already supplied a current accepted plan, validate it against repository evidence and continue from it. Do not write a second plan unless new evidence invalidates a decision. During implementation, return here only when evidence changes the chosen path or plan.
