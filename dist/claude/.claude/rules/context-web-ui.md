---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.html"
  - "**/*.css"
  - "**/*.vue"
  - "**/*.svelte"
---

# Web UI

Use TypeScript and React for React specifics and UI Styling for visual defaults when no product design system applies.

## Safe rendering

- Render user or external text with DOM text APIs or framework escaping. Never interpolate it into HTML strings or rely on a hand-rolled escaper.

## Updates and focus

- Update the smallest DOM region that changed. Rebuilding a focused input loses caret, selection, and screen-reader context; refocusing does not restore them.
- When an action removes or rebuilds the focused element—delete, edit commit or cancel, toggle, or filter—move focus deliberately to the logical neighbor or initiating control. Focus falling to `<body>` strands keyboard users.

## States and recovery

- Implement only reachable loading, empty, error, success, and disabled states. Never add artificial delay or unreachable behavior to complete a checklist.
- Distinguish no data from no filter matches.
- Treat unreadable stored data as an error: show it, offer an explicit reset, and block persistence until recovery. An enabled write path can destroy recoverable data.

## Accessibility

- Give every pointer interaction an equivalent keyboard path.
- Give every control an accessible, item-specific name. Use meaningful alt text, `alt=""` for decoration, a document language, a valid favicon, and a live region for asynchronous outcomes.
- Meet WCAG AA text contrast on the actual background. Check faint tokens with `agent-rules/tools/contrast-check.mjs`; placeholders and muted small text commonly fail.
- Preserve `:focus-visible` and honor `prefers-reduced-motion`.

## Checklist

- [ ] Trace untrusted data reaching `innerHTML`, `insertAdjacentHTML`, or `dangerouslySetInnerHTML`
- [ ] Complete the changed flow keyboard-only and record focus after mutations
- [ ] Try quotes, tags, whitespace-only input, and maximum length
- [ ] Corrupt stored data and confirm visible recovery with no overwrite path
- [ ] Remove any state or delay that exists only for appearance
