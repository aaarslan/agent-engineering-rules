---
name: feature
description: Implement bounded product behavior through its real entrypoint.
---

# Feature

- Establish the requested product outcome and real entrypoint from repository evidence.
- Choose direct work or a plan according to ambiguity, contracts, persistence, security, irreversibility, and architectural reach.
- Trace the vertical effect and update every affected consumer, state transition, generated artifact, configuration path, and user-facing contract.
- Keep one owner for each rule; remove only paths the feature supersedes or makes unreachable in the affected surface.
- Stabilize behavior before adding durable tests. Exercise the real state change and its material failure before repository gates.
- `git diff` and `git diff --check` cover tracked content only; do not cite them as validating generated code unless those files are tracked or the check explicitly enumerates untracked authored or generated files.
- For greenfield output, enumerate and validate every authored file directly; do not stage or mutate files merely to obtain evidence.
- In an empty single-screen prototype, prefer platform-native HTML/CSS/JS unless the prompt, repository contract, durable state, reuse, test strategy, or expected extension gives a concrete framework benefit. If adding one, state that benefit once and keep scaffolding minimal; never add it merely to appear production-grade.

Finish when the requested behavior works end to end, affected artifacts agree, checks have usable results, and remaining assumptions or risk are explicit.
