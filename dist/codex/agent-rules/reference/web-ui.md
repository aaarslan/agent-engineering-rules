# Web UI

Use [TypeScript and React](typescript-react.md) for React specifics and [UI Styling](ui-styling.md) for visual defaults when no product design system applies.

## Safe rendering

- Render user or external text with DOM text APIs or framework escaping. Never interpolate it into HTML strings.
- Trace untrusted values reaching `innerHTML`, `insertAdjacentHTML`, or `dangerouslySetInnerHTML`; exercise quotes, tags, whitespace-only input, and contractual length limits.
- Use `agent-rules/tools/slop-scan.mjs` only when supported web files and relevant risks such as unsafe sinks, timers, storage, dead exports, or TODO residue are present; inspect its categorized evidence rather than inferring quality from completion.

## Updates and focus

- Update the smallest DOM region that changed. Rebuilding a focused input loses caret, selection, and screen-reader context; refocusing does not restore them.
- When an action closes a dialog or drawer, or removes or rebuilds the focused element, move focus deliberately to the initiating control or logical neighbor. Focus falling to `<body>` strands keyboard users.

## States and recovery

- Implement only reachable loading, empty, error, success, and disabled states. Never add artificial delay or unreachable behavior to complete a checklist.
- Distinguish no data from no filter matches.
- Treat unreadable stored data as an error: show it, offer an explicit reset, and block persistence until recovery. Exercise corrupt input when persistence is in scope; an enabled write path can destroy recoverable data.

## Prompt-critical behavior

- Exercise the promised state transition, not an acknowledgement: a saved note or log becomes visible, hydration changes observable state, and search or filters change visible results when requested.
- Confirm required navigation remains reachable, keyboard activation opens the correct row, and Escape closes modal or drawer patterns and returns focus to their trigger.

## Responsive and honest controls

- Check representative desktop and narrow-mobile viewports. At the target mobile viewport compare `document.documentElement.scrollWidth` with `document.documentElement.clientWidth`; bound intentional table or component scrollers locally and treat page-level overflow as a defect.
- Preserve prompt-mandated navigation and form factors across breakpoints.
- Do not add an inert hamburger, export, navigation, or action control merely for polish. If an optional concept control is intentionally nonfunctional, label or disable it honestly.

## Resources

- For a self-contained prototype, prefer system fonts and local assets. Use remote resources only when requested or concretely justified; retain local or system fallbacks and exercise and report relevant offline behavior.

## Accessibility

- Give every pointer interaction an equivalent keyboard path.
- Give every control an accessible, item-specific name. Use meaningful alt text, `alt=""` for decoration, a document language, a valid favicon, and a live region for asynchronous outcomes.
- For faint or small semantic text, run `agent-rules/tools/contrast-check.mjs` on selected named opaque foreground/background pairs with their font size and weight; do not pass stylesheet paths or check every color token. Rerun failed pairs after editing. The result does not cover alpha, gradients, computed backgrounds, interaction states, whole-page accessibility, or general WCAG conformance.
- Preserve `:focus-visible` and honor `prefers-reduced-motion`.
