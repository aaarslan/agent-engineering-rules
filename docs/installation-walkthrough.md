# Inspect an installation, refusal, and recovery

This walkthrough was exercised locally on September 12, 2026 with the v5 source
CLI and a disposable target. It establishes the observed installer behavior,
not whether a model loads or follows the contract. The executable regression is
[`tools/install-walkthrough.test.mjs`](../tools/install-walkthrough.test.mjs).
See [INSTALL.md](../INSTALL.md) for the full ownership contract.

Run the commands from an AER source checkout with Node 24+. Replace `<project>`
with one selected test repository. In an installed CLI, replace
`node tools/aer.mjs` with `aer`. Never use this walkthrough to overwrite a real
project's instructions or security notes.

## Preview the actual change

Start with consumer-owned `AGENTS.md` content, for example:

```markdown
# Project instructions

Keep the project-specific release checklist.
```

Commit the target's existing work first so its before/after diff is inspectable.
Then run:

```bash
node tools/aer.mjs init --host codex --target <project> --dry-run
node tools/aer.mjs init --host codex --target <project>
git -C <project> diff -- AGENTS.md
git -C <project> status --short --untracked-files=all
node tools/aer.mjs doctor --target <project> --json
```

In the exercised default Codex/standard installation, preview reported **45
writes, zero removals** and left the target unchanged. The actual install
preserved the original text and appended one managed block. Its opening diff is:

```diff
 # Project instructions

 Keep the project-specific release checklist.
+
+<!-- agent-engineering-rules:start -->
+## Agent Engineering Contract
+
+Target: complete AND simple. Diff size is neutral.
```

This is an excerpt: inspect the entire block, `.agents/skills/`, `agent-rules/`,
and `.agent-engineering-rules-state.json`. `git diff` alone omits newly created
untracked files, which is why the status command is included. The complete
generated payload is available in [`dist/codex/`](../dist/codex/).

The observed doctor result had `status: "current"`. It checked inventory, hashes,
managed root boundaries, and the ledger; it did not run the application, start an
agent, check provider behavior, or certify model adherence.

## An unowned collision is a refusal

The fixture first contained consumer-owned text at
`agent-rules/reference/security.md`, a destination AER wanted to create. Running
the same `init --dry-run` returned exit **1**, preserved that file and `AGENTS.md`,
and created no ownership ledger. Byte similarity would not establish ownership.

Read the named collision. Decide where the project's own material belongs, move
it deliberately, and update its consumers. In the disposable walkthrough it was
renamed to `consumer-security-notes.md`; nothing was deleted. The next preview
and install succeeded. There is no force-adopt command, and editing a ledger to
make the collision disappear is not a recovery procedure.

## A managed-file edit is drift, not permission to overwrite

After installation, the walkthrough saved the exact owned version of
`agent-rules/reference/security.md`, then appended a local edit. These commands
exposed the drift:

```bash
node tools/aer.mjs doctor --target <project> --json
node tools/aer.mjs update --target <project> --dry-run
```

Doctor reported `status: "drift"` and left the edited bytes unchanged. Update
preview refused with exit **1**. Preserve the edit separately and inspect the
difference. Move project-specific obligations into consumer-owned instructions
outside the managed markers, or use supported profile/context selection. Only
after that decision, restore the exact previously owned file from the project's
known-good commit or saved copy. Do not restore an arbitrary newer distribution
file or edit the ownership hash to match the local modification.

```bash
node tools/aer.mjs update --target <project> --dry-run
node tools/aer.mjs update --target <project>
node tools/aer.mjs doctor --target <project> --json
```

The exercised recovery saved the modified bytes, restored the prior owned bytes,
and obtained a zero-write, zero-removal update followed by `status: "current"`.
The saved consumer edit remained intact.

For an **interrupted update**, preserve the pending journal and rerun `update`
after inspecting the diagnostic. Uninstall is refused until recovery succeeds.
The existing installer regression uses deliberate fault injection to exercise
this case; this walkthrough did not kill a process or manufacture a live crash.
If a lock or recovery guard is reported, follow its filename-specific diagnostic
and establish that no installer is running before removing anything. Doctor
does not repair journals or locks.

## Inspect removal

```bash
node tools/aer.mjs uninstall --target <project> --dry-run
node tools/aer.mjs uninstall --target <project>
```

In the exercised target, preview reported **43 removals and one write**.
Uninstall restored the exact original `AGENTS.md`, removed the owned payload and
ledger, and preserved the relocated consumer notes and saved edit. These counts
describe this selected host/profile and initial state; they are not fixed API
guarantees for every installation.

Reproduce the complete provider-free scenario:

```bash
node --test tools/install-walkthrough.test.mjs
```
