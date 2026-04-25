# AI Chat Codex-Like Composer Redesign

## Background

The current AI chat sidebar already supports reference-file selection, directory scope, full-scope reading, and context-index rebuilding, but the composer UI is still too panel-heavy.

Problems in the current interface:

- Too many visible text buttons compete with the message input.
- Reference controls occupy a full block above the composer and feel like a settings panel instead of a chat tool.
- The toolbar hierarchy is weak: model, skill, references, and send all look similarly important.
- The interaction does not resemble Codex-style chat products, where the composer is the visual center and secondary actions are tucked behind compact icon controls.

This redesign only changes presentation and interaction density. It does not change the approved functional boundary model:

- user-selected files remain the effective AI boundary
- `引用当前 / 引用目录 / 引用全部 / 整理索引` remain available
- selected files still drive prompt reference context
- index-first prompt delivery and `.ai/context-index.json` remain unchanged

## Goals

- Make the chat composer feel closer to Codex: compact, input-centered, tool-light.
- Replace most persistent text buttons with icon-first controls.
- Preserve a small amount of persistent state text:
  - current model name
  - context usage
  - input placeholder
  - selected file names
- Keep common chat actions discoverable without reintroducing visual noise.

## Non-Goals

- No change to prompt assembly rules.
- No change to selected-file semantics.
- No new AI capability beyond the existing scope/index system.
- No redesign of the full settings drawer.
- No large refactor of chat state management.

## Recommended Approach

Use a single-card Codex-like composer with compact icon controls and a unified `+` menu for context actions.

Why this approach:

- It solves the “too much text” problem directly.
- It keeps the input field as the primary visual anchor.
- It matches the user’s requested reference point more closely than simply shrinking the current toolbar.
- It can be implemented as a surgical React/CSS update on top of the existing chat behavior.

Rejected alternatives:

1. Thin text toolbar
   - Better than today, but still reads as a control panel.
2. Split collapsible sections
   - Preserves too much structure and keeps the UI heavy.

## Interaction Design

### Top Bar

The top bar becomes icon-first and thinner.

Persistent actions:

- history
- new chat
- settings
- collapse

Rules:

- Use icon buttons with tooltips instead of labeled pills.
- Keep only the current session title as passive text.
- Do not add a second row in the header.

### Composer Layout

The composer becomes one unified surface instead of separate stacked strips.

Structure:

1. selected-file chip row
2. main input row
3. subtle metadata row

Behavior:

- The selected-file chip row only appears when files are selected.
- The main input row contains the unified `+` entry, optional skill icon, textarea, and send button.
- The metadata row shows weak status text for model and context usage.

### Unified `+` Menu

All reference and context actions move behind a single `+` trigger at the left side of the composer.

First-level actions:

- 引用当前
- 引用目录
- 引用全部
- 整理索引

Secondary inputs inside the same popover:

- directory picker
- file picker

Rules:

- The menu should open upward from the composer, not as a full-width panel.
- Actions remain textual in the menu for clarity, but not on the main surface.
- Directory and file selection controls are only visible inside the popover.

### Skill Entry

The current `Skill` text button becomes an icon-only button.

Rules:

- Keep the existing skill menu behavior.
- Change entry affordance to icon + tooltip.
- Place it beside the `+` button as a secondary composer control.

### Selected File Chips

Selected files are shown as compact chips above the input.

Rules:

- Show file icon + file name.
- Hide long paths from default view.
- Full path is visible via tooltip.
- Each chip keeps a compact remove affordance.
- If chip count grows, prefer horizontal overflow or compact wrapping, not tall card blocks.

### Model And Context Status

Model and context budget remain visible but de-emphasized.

Rules:

- Current model name stays readable as short text.
- Context usage appears as compact numeric status.
- Do not render long explanatory labels around them.
- These elements should look informational, not actionable.

## Visual Design

### Overall Tone

The composer should feel denser, quieter, and more tool-like.

Visual direction:

- dark low-contrast panel
- fewer borders
- tighter spacing
- compact icon controls
- strong visual emphasis only on send

### Buttons

Rules:

- Use icon-first ghost buttons for secondary actions.
- Use small rounded square or circular controls.
- Remove large pill buttons from the composer area.
- Keep hover and focus states clear.

### Send Button

Rules:

- Remains the single strongest accent element.
- Slightly more compact than the current version.
- Should read as the primary action immediately.

### Typography

Rules:

- Reduce helper copy.
- Keep only minimal persistent labels.
- Avoid sentence-like UI labels in the composer.
- Tooltip copy can remain explicit even if the visible UI is terse.

## Accessibility

- Every icon-only button must have `aria-label` and `title`.
- Focus states must remain visible.
- Selected-file remove actions must remain keyboard accessible.
- The `+` popover must be operable by keyboard and readable by screen readers.
- Do not rely on color alone to distinguish active scope state.

## Implementation Boundaries

Files expected to change:

- `src/components/workspace/AIChat.tsx`
- `src/components/workspace/AIChat.css`

Optional minor updates if needed:

- `tests/ai/ai-chat-reference-ui.test.mjs`
- `tests/ai/ai-chat-view-state.test.mjs`

Expected implementation shape:

- keep current chat logic, prompt logic, and reference selection handlers
- reorganize JSX structure around a Codex-like composer shell
- replace visible text buttons with inline SVG icon buttons
- move reference controls into a popover-style menu
- retain selected chip behavior with more compact rendering

## Testing

Source-level UI tests should verify:

- icon-first controls exist for header and composer actions
- visible text buttons for reference scope are removed from the main composer surface
- unified `+` entry exists
- selected file chip UI still exists
- reference scope logic remains reachable through the new menu structure

Manual verification should confirm:

- the composer reads as one surface, not multiple stacked panels
- the UI is visibly less text-heavy
- selected file chips are compact and removable
- model/context status remain visible but visually secondary
- the interaction feels closer to Codex than the current implementation
