# Contributing

Follow [AGENTS.md](AGENTS.md). Author contract/profile text in `kernel/`, skill
bodies in `skills/`, shared references/fragments in `source/shared/`. The controlled
renderer updates shared copies and the full payload inventory; it does not fork
engineering prose by host. Client metadata lives in `integrations/`.

```sh
npm run build
npm run release:check
```

Use Node 24.11.1 or newer. Commit source and generated resources/inventory together.
Validators are read-only; CI has no provider credentials or runner. The preserved
v5 fixture suite runs in a disposable copy and never enters the published package.
Before editing a released payload, capture its `historyRecord()` from the exact
previous package and append it to `integrations/payload-history.json`. Never
reconstruct prior hashes from modified sources. Verify old-to-new upgrade,
obsolete-file removal, modified-file refusal and uninstall in disposable consumers.
Frozen research bytes must remain unchanged. Routing and fixture baselines are
mechanical preparation, not model efficacy results. Keep the narrow study-record
schema and separate paired protocols for each authorized comparison/configuration.

For behavior expansion add paired live evidence or explicitly disclaim efficacy
in the changelog. Record material deviations and safety-invariant coverage in
[docs/decisions/](docs/decisions/README.md). Never weaken ownership assertions to
obtain green checks. Use `feature/` branches and describe behavior/evidence in PRs.
Release publication, tags, marketplace submissions, provider trials and repository
settings require a separate explicit maintainer action. See [SECURITY.md](SECURITY.md).
