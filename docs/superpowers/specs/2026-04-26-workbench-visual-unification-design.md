# Workbench Visual Unification Design

## Summary

Polish the current blue-and-white workbench into a cleaner desktop tool aesthetic. The app should feel colder, sharper, and more consistent: less gray wash, less over-rounded glass, stronger blue emphasis, and a shared spacing and radius system across the workbench shell, explorer, terminal, and AI chat surfaces.

## Goals

- Make the light workbench style feel colder and clearer instead of gray-blue.
- Keep the main work areas predominantly light while preserving enough contrast for editing surfaces.
- Adapt the same visual logic to dark mode instead of only inverting colors.
- Unify key shell surfaces around one radius ladder and one 8px spacing rhythm.
- Reduce floating-card softness in the workspace and AI chat.

## Non-Goals

- Do not redesign the design canvas experience in this pass.
- Do not change application routing or data flow.
- Do not introduce new theme modes or user-facing theme settings.
- Do not restyle every legacy page and panel in the app.

## Visual Direction

- Base palette: cold white and slate surfaces with deep blue as the primary accent.
- Light mode: crisp light backgrounds, more solid panels, restrained glass, stronger blue focus states.
- Dark mode: navy-toned surfaces, cool blue borders and highlights, no green tint and no pure black voids.
- Tool feeling: precise, professional, desktop-oriented rather than soft marketing-card UI.

## System Rules

### Color

- Light mode should use cold whites such as `#f3f7fc` and stronger blue accents around `#1d4ed8`.
- Dark mode should use navy surfaces around `#0b1220` with brighter blue accents for contrast.
- Accent responsibility belongs to blue only in the workbench theme. Avoid the current teal drift.
- Panel layers should be visibly separated with border and fill changes instead of heavy foggy gradients.

### Radius

Use a shared radius ladder:

- `--style-radius-xs`: `8px`
- `--style-radius-sm`: `12px`
- `--style-radius-md`: `16px`
- `--style-radius-lg`: `20px`
- `--style-radius-pill`: `999px`

Apply pills only to explicit chips and badges. Buttons, toggles, tabs, cards, and shells should step down to the smaller shared radii.

### Spacing

Use an 8px-derived scale throughout the edited surfaces:

- `4px`, `8px`, `12px`, `16px`, `24px`, `32px`

Toolbar, list item, and form control padding should align to this scale.

## Component Adjustments

### Workspace Shell

- Keep the desktop workbench edge-to-edge layout.
- Move the shell toward light layered surfaces in light mode.
- Tighten toolbar, task strip, editor shell, and activity rail radii and spacing.
- Preserve splitter behavior while making hover feedback use the refined blue accent.

### File Explorer

- Use a lighter pane surface in light mode.
- Reduce oversized rounding in list rows and menus.
- Keep selection clear through subtle blue-tinted panel fills and borders, not large saturated blocks.

### Terminal

- Keep the terminal slightly denser and higher-contrast than surrounding panels.
- Match header, input, and action controls to the same radius and border system as the workspace.

### AI Chat

- Reduce oversized floating radii and shadow intensity.
- Unify message bubbles, composer shell, settings surfaces, and list items around the shared radius ladder.
- Keep the docked desktop pane feeling like part of the workbench, not a separate widget.

## Testing

Add or update focused source-level tests for:

- Workbench light and dark theme tokens.
- Shared radius variables for the workbench refresh.
- Workspace, explorer, terminal, and AI chat consuming the shared radius tokens.

Run focused tests and a full production build after the CSS updates.
