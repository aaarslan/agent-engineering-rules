# Acceptance contract

Document the existing module without changing it. parseCommand accepts exactly ['show',ID]; ID matches /^[a-z][a-z0-9-]*$/. Usage and malformed IDs raise the shown TypeError messages. showNote returns JSON id/text plus one final newline, or Error('not found'). Examples must match executable results, quoting, field order and failures. State that this fixture has no persistence, production credentials or network. Update usage.md and cite inspected source/commands; do not invent an install command or certification.
