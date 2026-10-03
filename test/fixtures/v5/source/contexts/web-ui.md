---
scope: [context]
load_when: building or modifying browser UI, with or without a framework
related: [typescript-react.md, ui-styling.md, ../quality/security.md, ../design/errors-and-side-effects.md]
---

# Web UI

Use [TypeScript and React](typescript-react.md) only for that selected stack and [UI Styling](ui-styling.md) for the requested visual design.

## Safe rendering

- Render user or external text with DOM text APIs or framework escaping. Never interpolate it into HTML strings.
- Trace untrusted values reaching `innerHTML`, `insertAdjacentHTML`, or `dangerouslySetInnerHTML`; exercise quotes, tags, whitespace-only input, and contractual length limits.
- An optional `aer verify slop` diagnostic may identify unsafe sinks or scaffold residue in supported files. Inspect findings in context; a partial scan is not evidence about the whole application.
- Establish how each implicated rendering sink is escaped, removed, or confined to trusted immutable data; report unresolved exposure. A clean heuristic scan does not establish safety or require a full-root rerun.

## Updates and focus

{{include:contexts/web-interaction.md}}

Retaining interactive DOM nodes preserves their editing and screen-reader context. Rebuilding a focused input loses caret and selection; calling `focus()` alone does not restore them.

Exercise implicated toggle, save, Cancel/Escape, removal and filter transitions. Immediately after an action, inspect the focused element and continue with the next keyboard action. Focus falling to `<body>` after an active control disappears exposes a missing transition; an unchanged screenshot or a working click does not settle it. Reuse this evidence for completion.

## States and recovery

- Implement only reachable loading, empty, error, success, and disabled states. Never add artificial delay or unreachable behavior to complete a checklist.
- Distinguish no data from no filter matches.
- Treat unreadable stored data as an error and preserve it until deliberate recovery. Exercise corruption when persistence is in scope; follow the product's recovery contract without silently resetting recoverable data.

## Prompt-critical behavior

- For each applicable requested action, name and exercise `action → named visible destination state` in the prompt's vocabulary. Exercise the promised state transition, not an acknowledgement: save note → note appears in the named notes region; submit a log → entry appears in the named log; add hydration → displayed hydration state changes; search or filter → visible results change; activate navigation → intended named destination opens.
- A toast, form reset, command exit code, or success message alone is acknowledgement, not proof of the destination state.

## Responsive and honest controls

- Check representative desktop and narrow-mobile viewports. At the target mobile viewport compare `document.documentElement.scrollWidth` with `document.documentElement.clientWidth`; record document overflow separately from intentional local table or chart scrolling, bound local scrollers to their component, and treat page-level overflow as a defect.
- At every relevant narrow breakpoint, enumerate prompt-required destination names and verify each remains discoverable, keyboard- and pointer-reachable, and activates its intended target. A containment fix that hides required navigation fails validation; a menu is evidence only when it reveals and activates every required route.
- Do not add an inert hamburger, export, navigation, or action control merely for polish. If an optional concept control is intentionally nonfunctional, label or disable it honestly.

## Resources

- Choose resources from the brief and repository. External dependencies need justification; preserve required offline and failure behavior without inventing an offline product requirement.

## Accessibility

- Use meaningful alt text, `alt=""` for decoration, a document language, and appropriate announcements for asynchronous outcomes.
- Check applicable contrast using rendered evidence or selected named color pairs. Optional `aer verify contrast` handles documented opaque pairs; it does not establish alpha, gradient, computed-background, interaction-state, whole-page accessibility, or general conformance.
- Preserve `:focus-visible` and honor `prefers-reduced-motion`.
