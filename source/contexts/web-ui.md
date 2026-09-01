---
scope: [context]
load_when: building or modifying browser UI, with or without a framework
related: [typescript-react.md, ui-styling.md, ../quality/security.md, ../design/errors-and-side-effects.md]
---

# Web UI

Use [TypeScript and React](typescript-react.md) for React specifics and [UI Styling](ui-styling.md) for visual defaults when no product design system applies.

## Safe rendering

- Render user or external text with DOM text APIs or framework escaping. Never interpolate it into HTML strings.
- Trace untrusted values reaching `innerHTML`, `insertAdjacentHTML`, or `dangerouslySetInnerHTML`; exercise quotes, tags, whitespace-only input, and contractual length limits.
- Use `tools/slop-scan.mjs` only when supported web files and relevant risks such as unsafe sinks, timers, storage, dead exports, or TODO residue are present. A partial-selector result is advisory for that selection, not a whole-app or clean result.
- Completion after a scan requires either a clean applicable full-root rerun or an explicit disposition for every residual finding fingerprint. Classify each remaining rendering sink as removed (absent on rerun), safely escaped by a named mechanism, trusted static data inside a defined immutable boundary that never receives user, server, or external data, or unresolved. An unresolved sink blocks a clean claim.

## Updates and focus

- Update the smallest DOM region that changed. Rebuilding a focused input loses caret, selection, and screen-reader context; refocusing does not restore them.
- When an action closes a dialog or drawer, or removes or rebuilds the focused element, move focus deliberately to the initiating control or logical neighbor. Focus falling to `<body>` strands keyboard users.

## States and recovery

- Implement only reachable loading, empty, error, success, and disabled states. Never add artificial delay or unreachable behavior to complete a checklist.
- Distinguish no data from no filter matches.
- Treat unreadable stored data as an error: show it, offer an explicit reset, and block persistence until recovery. Exercise corrupt input when persistence is in scope; an enabled write path can destroy recoverable data.

## Prompt-critical behavior

- For each applicable requested action, name and exercise `action → named visible destination state` in the prompt's vocabulary. Exercise the promised state transition, not an acknowledgement: save note → note appears in the named notes region; submit a log → entry appears in the named log; add hydration → displayed hydration state changes; search or filter → visible results change; activate navigation → intended named destination opens.
- A toast, form reset, command exit code, or success message alone is acknowledgement, not proof of the destination state.
- Confirm keyboard activation opens the correct row, and Escape closes modal or drawer patterns and returns focus to their trigger.

## Responsive and honest controls

- Check representative desktop and narrow-mobile viewports. At the target mobile viewport compare `document.documentElement.scrollWidth` with `document.documentElement.clientWidth`; record document overflow separately from intentional local table or chart scrolling, bound local scrollers to their component, and treat page-level overflow as a defect.
- At every relevant narrow breakpoint, enumerate prompt-required destination names and verify each remains discoverable, keyboard- and pointer-reachable, and activates its intended target. A containment fix that hides required navigation fails validation; a menu is evidence only when it reveals and activates every required route.
- Do not add an inert hamburger, export, navigation, or action control merely for polish. If an optional concept control is intentionally nonfunctional, label or disable it honestly.

## Resources

- For a self-contained prototype, prefer system fonts and local assets. Use remote resources only when requested or concretely justified; retain local or system fallbacks and exercise and report relevant offline behavior.

## Accessibility

- Give every pointer interaction an equivalent keyboard path.
- Give every control an accessible, item-specific name. Use meaningful alt text, `alt=""` for decoration, a document language, a valid favicon, and a live region for asynchronous outcomes.
- For faint or small semantic text, run `tools/contrast-check.mjs` on selected named opaque foreground/background pairs with their font size and weight; do not pass stylesheet paths or check every color token. Rerun failed pairs after editing. The result does not cover alpha, gradients, computed backgrounds, interaction states, whole-page accessibility, or general WCAG conformance.
- Preserve `:focus-visible` and honor `prefers-reduced-motion`.
