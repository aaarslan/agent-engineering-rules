# Contributing

Thank you for improving Agent Engineering Rules. Contributions should be bounded, evidence-backed, and compatible with the project's explicit trust boundary.

## Before opening a pull request

1. Search existing issues and pull requests.
2. Open an issue before a large behavioral, installer, schema, or host-support change.
3. Keep the universal contract compact. Put task-specific detail in the relevant skill or on-demand reference.
4. Do not add compatibility claims for an untested host.
5. Do not represent prose as a deterministic security or enforcement boundary.
6. Do not add provider calls to CI or make live evaluation automatic.

Report suspected vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## Source authority

- Edit canonical material under `source/`.
- Never edit generated `dist/claude/` or `dist/codex/` files directly.
- After changing canonical source or its manifest, run `node tools/build-distributions.mjs`.
- Commit canonical source and generated output together.
- Preserve the installer ownership model: unowned collisions, customized files, and host-owned content must not be overwritten by assumption.

## Validate

Use Node.js 24 or newer.

```bash
npm test
npm run validate
npm run validate:research
npm pack --dry-run
```

Research validation is provider-free. Do not supply provider credentials for repository validation.

## Pull requests

A pull request should:

- solve one coherent problem;
- explain the user-visible effect and trust-boundary impact;
- include or update deterministic tests for behavioral changes;
- list the exact verification commands run;
- update public documentation only when the implementation changed;
- avoid unrelated formatting or generated-file churn; and
- use signed commits when possible.

Maintainers may decline changes that add instruction weight without demonstrated value, create hidden policy, duplicate existing authority, or broaden the supported surface without reproducible evidence.
