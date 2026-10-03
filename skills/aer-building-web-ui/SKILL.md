---
name: "aer-building-web-ui"
description: "Build or change browser interfaces, interaction states and accessible styling. Use for browser UI work; load stack details only for the actual stack and preserve focus and drafts."
---

<!-- aer:shared-safety:start -->
Honor the requested scope and applicable repository/client instructions. Preserve unrelated work, protect secrets and require authority for consequential external effects. Use available evidence honestly; unavailable checks are limitations. This skill works without an AER kernel or other skill.
<!-- aer:shared-safety:end -->

# UI Styling

Follow the repository's design system and tokens when they exist; do not overlay a second visual language.

Evaluate these independent dimensions without a prescribed report layout:

1. **Composition and form factor:** requested composition, hierarchy, and form-factor fidelity.
2. **Functional and responsive behavior:** real requested workflows, state transitions, navigation, and breakpoint behavior.
3. **Engineering, accessibility, and safety:** semantics, keyboard/focus, motion, contrast, safe rendering, and recovery.

State the strongest demonstrated results and material defects. Framework choice, file count, LOC, ARIA quantity, and validation volume are not quality verdicts. Report honestly when one dimension improves while another regresses.

Read `references/ui-styling.md` and `references/web-ui.md` only for an actual UI surface. Report usable evidence for each applicable dimension; heuristic output is review input, not proof.

<!-- aer:ui:start -->
**UI-01 Interaction.** For changed browser UI only, MUST keyboard-exercise changed UI actions through their resulting state; activation alone is insufficient. Preserve unaffected drafts and focus/caret/selection across rendering; if a focused control disappears, focus its trigger or a logical neighbor. Verify visible focus and continued keyboard use; give controls item-specific accessible names.
<!-- aer:ui:end -->

Load relevant local detail only:
- [web-ui](references/web-ui.md)
- [typescript-react](references/typescript-react.md)
- [ui-styling](references/ui-styling.md)

Optional scripts require an available Node 24 runtime. Resolve paths from the loaded skill’s actual root and quote paths with spaces. From that root, run only a relevant `node "scripts/contrast-check.mjs" --help` to inspect its input contract. Without Node, use repository tools or manual evidence and report the limitation. Scripts never run on discovery or installation.
