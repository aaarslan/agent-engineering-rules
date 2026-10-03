# Packed installation walkthrough

The current exercised lifecycle is [INSTALL.md](../INSTALL.md). Run
`npm run test:packed` for an isolated real npm tarball install with complete
inventory checks, previews, idempotence, selection/instruction/destination moves,
collision and drift refusal, interruption/resume and consumer-preserving removal.
It also packs the exact audited v5 fixture and tests the pinned v5 exit path.

The original v5 command walkthrough is preserved as historical input in
[test/fixtures/v5/docs/installation-walkthrough.md](../test/fixtures/v5/docs/installation-walkthrough.md).
Its commands target v5, not the active v6 runtime.
