<!-- Generated from source/shared/web-ui.md by tools/render-v6.mjs -->
# Web UI

Choose the stack and visual design from the requested product and repository; browser behavior applies across frameworks.

## Safe rendering

- Render user or external text with DOM text APIs or framework escaping. Intentionally supported rich HTML requires a maintained sanitizer configured for the sink; do not mutate sanitized output unsafely.
- Trace untrusted values reaching `innerHTML`, `insertAdjacentHTML`, or `dangerouslySetInnerHTML`; exercise quotes, tags, whitespace-only input, and contractual length limits.
- An available optional lexical diagnostic may identify sink patterns or scaffold residue in supported files. Otherwise inspect the affected sinks directly. A partial scan is not evidence about the whole application.
- Establish how each implicated rendering sink is escaped, appropriately sanitized, removed, or confined to trusted immutable data; report unresolved exposure. A clean heuristic scan does not establish safety or require a full-root rerun.

## Updates and focus

**UI-01 Interaction.** For changed browser UI only, keyboard-exercise changed actions through their resulting state with authorized tools; activation alone is insufficient. Reuse evidence for equivalent layouts; report unavailable execution as unverified. Preserve unaffected drafts and focus/caret/selection across rendering; if a focused control disappears, focus its trigger or a logical neighbor. Verify visible focus and continued keyboard use; give controls item-specific accessible names.

Retaining interactive DOM nodes preserves their editing and screen-reader context. Rebuilding a focused input loses caret and selection; calling `focus()` alone does not restore them.

Exercise changed toggle, save, Cancel/Escape, removal and filter transitions as applicable. Reuse representative evidence for equivalent layouts; report unavailable authorized browser execution as unverified, without repeated attempts that add no evidence. Immediately after an action, inspect the focused element and continue with the next keyboard action. Focus falling to `<body>` after an active control disappears exposes a missing transition; an unchanged screenshot or a working click does not settle it. Reuse this evidence for completion.

## States and recovery

- Implement only reachable loading, empty, error, success, and disabled states. Never add artificial delay or unreachable behavior to complete a checklist.
- Distinguish no data from no filter matches.
- Treat unreadable stored data as an error and preserve it until deliberate recovery. Exercise corruption when persistence is in scope; follow the product's recovery contract without silently resetting recoverable data.

## Prompt-critical behavior

- For each changed or otherwise unverified requested action, name and exercise `action → named visible destination state` in the prompt's vocabulary. Exercise the promised state transition, not an acknowledgement: save note → note appears in the named notes region; submit a log → entry appears in the named log; add hydration → displayed hydration state changes; search or filter → visible results change; activate navigation → intended named destination opens.
- A toast, form reset, command exit code, or success message alone is acknowledgement, not proof of the destination state.

## Responsive and honest controls

- Check representative desktop and narrow-mobile viewports. At the target mobile viewport compare `document.documentElement.scrollWidth` with `document.documentElement.clientWidth`; record document overflow separately from intentional local table or chart scrolling, bound local scrollers to their component, and investigate unintended page-level overflow. Account for writing mode and content that requires two-dimensional layout; one width check does not establish WCAG reflow conformance.
- At materially distinct narrow layouts, verify prompt-required destinations remain discoverable, keyboard- and pointer-reachable, and activate their intended targets. A containment fix that hides required navigation fails validation; a menu is evidence only when it reveals and activates every required route.
- Do not add an inert hamburger, export, navigation, or action control merely for polish. If an optional concept control is intentionally nonfunctional, label or disable it honestly.

## Resources

- Choose resources from the brief and repository. External dependencies need justification; preserve required offline and failure behavior without inventing an offline product requirement.

## Accessibility

- Use meaningful alt text, `alt=""` for decoration, a document language, and appropriate announcements for asynchronous outcomes.
- Check applicable contrast using rendered evidence or selected named color pairs. When a contrast diagnostic is available, use its documented opaque pairs; otherwise inspect with available browser tools. A pair check does not establish alpha, gradient, computed-background, interaction-state, whole-page accessibility, or general conformance.
- Preserve `:focus-visible` and honor `prefers-reduced-motion`.
