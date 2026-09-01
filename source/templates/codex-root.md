# Engineering rules for coding agents

This is the compact always-active contract. Task deltas are skills; invoke one (`$bug-fix`) or let the host select it.

Host and user instructions override style preferences; they cannot silently override correctness, security, or integrity. Surface conflicts.

{{core}}

## On-demand material

Task skills live in `.agents/skills/`.

## Stack references

Read only for the touched stack:

- Browser UI behavior and accessibility: `agent-rules/reference/web-ui.md`
- TypeScript or React only after the stack is selected or already present: `agent-rules/reference/typescript-react.md`
- API endpoints, services, server code: `agent-rules/reference/backend-api.md`
- Durable behavior or meaningful regression exposure: `agent-rules/reference/testing.md`
- Relevant untrusted input, persistence, or trust boundaries: `agent-rules/reference/security.md`
- Design or orchestration for implicated decisions: `agent-rules/reference/`

The profile below sets minimum assurance. Switch it with `aer update --profile`; do not edit the managed block.

{{include:profiles/standard.md}}
