# Workbench Monochrome Refinement Design

## Summary

Refine the current workbench visual system from a soft blue-glass desktop UI into a restrained monochrome tool interface. The new direction is quieter, tighter, and more premium: smaller radii, black-white-gray surfaces, lower visual noise, and stronger reliance on structure instead of colored fills.

This spec supersedes the visual direction in `2026-04-26-workbench-visual-unification-design.md` for the `workbench` style. If the two documents disagree, this document wins for color, radius, and surface treatment.

## Goals

- Replace the current gray-blue workbench look with a monochrome professional desktop-tool aesthetic.
- Tighten shared radii across the workbench so shells, cards, controls, and chat surfaces feel more precise.
- Keep both dark and light themes, but make them feel like one design system rather than two unrelated skins.
- Reduce dependence on blue accent fills for emphasis, selection, and action hierarchy.
- Make the workbench feel assembled and deliberate instead of soft and floaty.

## Non-Goals

- Do not change application logic, routing, or layout behavior.
- Do not redesign the `minimal` or `cartoon` styles in this pass.
- Do not introduce a new user-facing style mode.
- Do not redesign the design canvas node language in this pass.
- Do not add new animation concepts or motion-heavy effects.

## Approved Direction

### Overall Mood

- Professional and restrained.
- Monochrome first, functional state colors second.
- More desktop tool, less marketing glass panel.
- More structural hierarchy, less decorative glow.

### Radius System

Replace the current soft shared radius ladder with a tighter set:

- `--style-radius-xs`: `4px`
- `--style-radius-sm`: `8px`
- `--style-radius-md`: `10px`
- `--style-radius-lg`: `12px`
- `--style-radius-pill`: `999px`

Usage rules:

- Large containers and top-level shells use `12px` at most.
- Cards, panels, chat shells, and terminal shells use `10px`.
- Buttons, inputs, segmented controls, and tabs use `8px`.
- Small icon buttons and compact status surfaces use `4px`.
- Pills remain reserved for explicit chips, badges, and count tags.

The design should never read as bubbly or soft-rounded after this pass.

## Theme Tokens

### Dark Theme

The dark workbench should move away from navy-blue surfaces and use near-neutral charcoal layering.

Approved token values:

- `--mode-surface`: `#0f0f10`
- `--mode-surface-dot`: `rgba(255, 255, 255, 0.04)`
- `--mode-header-bg`: `rgba(17, 17, 17, 0.84)`
- `--mode-header-border`: `rgba(255, 255, 255, 0.08)`
- `--mode-text`: `#f5f5f4`
- `--mode-soft-text`: `rgba(245, 245, 244, 0.82)`
- `--mode-muted`: `rgba(214, 211, 209, 0.58)`
- `--mode-panel`: `rgba(24, 24, 27, 0.9)`
- `--mode-panel-alt`: `rgba(30, 30, 33, 0.94)`
- `--mode-panel-lite`: `rgba(255, 255, 255, 0.04)`
- `--mode-border`: `rgba(255, 255, 255, 0.09)`
- `--mode-chip`: `rgba(255, 255, 255, 0.05)`
- `--mode-chip-strong`: `rgba(255, 255, 255, 0.08)`
- `--mode-input`: `rgba(255, 255, 255, 0.05)`
- `--mode-button`: `#f5f5f4`
- `--mode-button-text`: `#111111`
- `--mode-accent`: `#e7e5e4`
- `--mode-accent-strong`: `#fafaf9`
- `--mode-accent-soft`: `rgba(231, 229, 228, 0.12)`

### Light Theme

The light workbench should move away from blue-white surfaces and use paper/ivory neutrals with charcoal contrast.

Approved token values:

- `--mode-surface`: `#f7f7f5`
- `--mode-surface-dot`: `rgba(28, 25, 23, 0.04)`
- `--mode-header-bg`: `rgba(255, 255, 253, 0.88)`
- `--mode-header-border`: `rgba(28, 25, 23, 0.08)`
- `--mode-text`: `#111111`
- `--mode-soft-text`: `rgba(28, 25, 23, 0.82)`
- `--mode-muted`: `rgba(87, 83, 78, 0.62)`
- `--mode-panel`: `rgba(255, 255, 253, 0.92)`
- `--mode-panel-alt`: `rgba(255, 255, 255, 0.97)`
- `--mode-panel-lite`: `rgba(28, 25, 23, 0.04)`
- `--mode-border`: `rgba(28, 25, 23, 0.1)`
- `--mode-chip`: `rgba(28, 25, 23, 0.04)`
- `--mode-chip-strong`: `rgba(28, 25, 23, 0.07)`
- `--mode-input`: `rgba(255, 255, 255, 0.96)`
- `--mode-button`: `#111111`
- `--mode-button-text`: `#fafaf9`
- `--mode-accent`: `#292524`
- `--mode-accent-strong`: `#111111`
- `--mode-accent-soft`: `rgba(41, 37, 36, 0.08)`

### Accent Responsibility

- Monochrome neutrals should carry the visual language.
- Blue should no longer be the primary branding signal inside `workbench`.
- Success, warning, and danger colors remain functional and scoped to status or validation only.
- Selection and active states should rely on neutral fills, borders, contrast, and weight before color.

## Surface and Elevation Rules

### Hierarchy Model

- Use surface contrast and borders as the primary layer separators.
- Reserve strong shadows for floating menus, drawers, and overlays only.
- Remove the impression that every section is a detached floating card.

### Shadows

Keep only two practical shadow tiers:

- `--mode-shadow-soft`: `0 10px 24px rgba(0, 0, 0, 0.16)` in dark mode and `0 10px 24px rgba(28, 25, 23, 0.08)` in light mode
- `--mode-shadow-strong`: `0 18px 40px rgba(0, 0, 0, 0.28)` in dark mode and `0 18px 40px rgba(28, 25, 23, 0.14)` in light mode

Ordinary cards and internal panels should lean on border + fill contrast instead of large blur-heavy shadows.

### Background Effects

- Reduce or remove obvious accent-colored radial glows in the workbench shell.
- Background texture can stay subtle, but it must be neutral and low contrast.
- Glassmorphism should not be the dominant reading of the interface after this pass.

## Interaction Language

### Buttons

- Primary buttons switch to monochrome contrast, not blue gradients.
- Secondary buttons use neutral fills and subtle hover changes.
- Hover feedback should be present but quiet.
- Do not use large accent-colored glows on button hover or active states.

### Selection and Active States

- Selected items should use light neutral fill changes, more explicit border contrast, and stronger text weight.
- Tabs and segmented controls should read as harder, more tool-like controls.
- Active states should not depend on saturated blue backgrounds.

### Inputs and Chips

- Inputs use neutral backgrounds and restrained borders.
- Chips, references, task items, and compact labels use grayscale hierarchy first.
- Compact controls should be visibly interactive without becoming visually loud.

## Area-Specific Adjustments

### App Header

- Keep the current shell layout, but visually flatten the top bar.
- Remove the obvious blue glow and strong gradient feeling.
- Rely on a restrained background and a subtle bottom divider.
- Make role tabs feel more like precise desktop controls than soft pills.

### Product Workbench

- Left navigation should feel like a structural tool rail rather than a floating card slab.
- Main viewer should read as the dominant work surface.
- Trees and side panels should use calmer neutral selected states.
- Splitters remain slim and subtle, with slightly stronger hover contrast only.

### Workspace

- File area, editor, terminal split, and activity rail should share the same monochrome boundary language.
- Toolbar should become flatter, denser, and more controlled.
- Task chips should become information labels, not accent-heavy tiles.

### AI Chat

- AI chat is a priority area for tightening radii and removing blue-heavy treatment.
- The chat shell, message surfaces, composer, settings, and tool chips must all move to the monochrome system.
- The send button can remain the strongest CTA, but it should switch to monochrome contrast instead of a blue gradient.

### Terminal

- Preserve terminal identity, but keep it aligned with the surrounding workbench system.
- Distinguish terminal surfaces through neutral contrast rather than decorative styling.
- Inputs and command blocks use the same smaller radius ladder and border language.

### File Explorer

- Reduce row softness and colored selection weight.
- Keep hover and active states clear but quiet.
- Prevent the sidebar from visually competing with the main content area.

## Implementation Scope

This pass should stay mostly in shared theme and CSS layers.

Primary files expected:

- `src/App.css`
- `src/components/workspace/Workspace.css`
- `src/components/workspace/AIChat.css`
- `src/components/workspace/FileExplorer.css`
- `src/components/workspace/Terminal.css`

Implementation should prefer updating shared tokens first so existing surfaces inherit the new system with minimal component-specific overrides.

## Acceptance Criteria

- The workbench no longer reads as a blue-glass UI on first impression.
- Shared radii feel materially tighter and more precise.
- Dark and light themes feel like one system with inverted luminance, not two separate aesthetics.
- Hover, active, and selected states remain obvious without relying on blue fills.
- Workspace, AI chat, terminal, file explorer, and product workbench clearly belong to the same monochrome system.
- The `workbench` style feels calmer, more expensive, and more tool-like than the current implementation.

## Testing

Add or update focused coverage for:

- Shared radius tokens reflecting the new tightened ladder.
- Workbench dark and light tokens reflecting monochrome instead of blue-led styling.
- Workspace, explorer, terminal, and AI chat continuing to consume the shared radius tokens.
- Theme toggling still working for the `workbench` style after token changes.

Run the affected test files and a production build after implementation.

## Implementation Sequence

1. Update shared radius and workbench theme tokens in `src/App.css`.
2. Remove blue-led button, chip, and selected-state treatments from the major workbench areas.
3. Tighten shells and controls in workspace, AI chat, terminal, and file explorer.
4. Tune top-level shadows and dividers so surfaces feel assembled rather than floating.
5. Update focused tests for the new token values and shared radius usage.
