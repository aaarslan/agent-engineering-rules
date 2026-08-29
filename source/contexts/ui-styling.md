---
scope: [context]
load_when: designing or restyling visual UI without a product design system to follow
related: [web-ui.md, ../kernel/contract.md]
---

# UI Styling

Use these defaults only without a governing design system. [Web UI](web-ui.md) owns behavior and accessibility.

## Hierarchy and layout

- Give each region one dominant purpose. Order adjacent actions strongest to weakest.
- Align elements to a grid, edge, baseline, or related element. Prefer optical alignment when mathematical centering looks wrong.
- Reflow content at narrow widths without horizontal scrolling.

## Spacing and shape

- Use a 4px scale: `4, 8, 12, 16, 24, 32, 48, 64`. Reuse a small set of gaps, radii, and control heights.
- Put related elements closer than unrelated ones. Container padding should not be smaller than gaps between child groups.
- Set nested radii from the inset: `innerRadius = max(0, outerRadius - inset)`. Do not default to pills.

## Typography

- Keep body text 16–18px, prose 60–80ch, and line height 1.45–1.65. Tighten display text, not body copy.
- Use at most two typefaces, a restrained scale, and few weights. Left-align paragraphs, forms, and dense data.

## Color and depth

- Use near-black and near-white. Tint neutrals toward one restrained hue and keep distinct lightness steps.
- Separate adjacent surfaces with one technique: lightness, border, or shadow. Do not stack them at one boundary.
- Use one elevation model. Raised dark surfaces become slightly lighter; shadows stay soft and low-opacity.

## Controls and restraint

- Make horizontal button padding about twice vertical padding. Keep targets at least 24px square and key touch controls near 44px.
- Use one loud primary action per region. Label unfamiliar icons and keep supporting icons quieter than text.
- Avoid card grids by default, decorative gradients, glass effects, giant radii, heavy shadows, invented badges or stats, and placeholder copy where the real label is known.

## Checklist

- [ ] Values come from the chosen spacing, type, and radius scales
- [ ] No boundary stacks separation effects
- [ ] Body is at least 16px; prose stays within 80ch
- [ ] Every decoration improves comprehension
