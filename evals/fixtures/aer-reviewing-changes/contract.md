# Acceptance contract

Read-only review. Base fixture-before is before.mjs; head fixture-head is app.mjs; the only changed path is app.mjs and change.diff is the complete supplied diff. Intended behavior is unchanged: listNotes returns active notes in input order, serializeNote preserves id/value including null and JSON key order, parseCursor accepts only nonnegative integers and throws TypeError('cursor') otherwise. Trace concrete regressions and falsify findings. No conversation history, live git repository or shell access is required by the packet.
