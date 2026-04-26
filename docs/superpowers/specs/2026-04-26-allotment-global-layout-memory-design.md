# Allotment Global Layout Memory Design

## Summary

Standardize the app's major resizable layouts on `Allotment` and persist pane sizes globally in local storage. The first pass covers the product workbench left navigation, the workspace left and right sidebars, the workspace bottom terminal area, and the desktop right AI pane. The goal is to make the app feel like a cohesive desktop workbench with consistent splitter behavior and remembered sizes across reloads.

## Goals

- Replace hand-rolled splitter behavior in major workbench layouts with `Allotment`.
- Make product, workspace, and desktop shell pane resizing feel consistent.
- Persist pane sizes globally on the current device, not per project.
- Keep existing visual language by restyling splitters to match the app.
- Preserve responsive behavior on narrow widths.

## Non-Goals

- Do not make every card or local sub-panel resizable.
- Do not introduce saved multi-layout presets or named workspaces.
- Do not move layout persistence into the project snapshot model.
- Do not redesign the content inside panes as part of this pass.

## Library Decision

Use `Allotment` as the shared pane layout primitive.

Why this choice:

- It already fits desktop workbench layouts well.
- It supports nested horizontal and vertical splits without custom pointer plumbing.
- It lets the app keep custom pane visuals while improving splitter consistency.

Rejected alternatives:

- Direct `localStorage` plus manual pointer events: fastest for one pane, but duplicates logic and keeps behavior fragmented.
- A dedicated global Zustand layout store: more structure than needed for a small set of persisted numbers.

## Layout Preference Module

Add a small shared module, for example `src/utils/layoutPreferences.ts`.

Responsibilities:

- Define stable storage keys for all remembered layout values.
- Read persisted values with safe fallback defaults.
- Clamp values to per-pane min and max bounds before use and before write-back.
- Expose small helpers such as `readLayoutSize(key, fallback, bounds)` and `writeLayoutSize(key, value, bounds)`.

This module is intentionally narrow. It is not a general UI settings store.

## Persisted Layout Keys

Use app-level keys, not project-scoped keys.

Suggested keys:

- `layout.productWorkbench.leftNavWidth`
- `layout.workspace.sidebarWidth`
- `layout.workspace.activityWidth`
- `layout.workspace.terminalHeight`
- `layout.desktop.aiPaneWidth`

If more panes are added later, they should follow the same `layout.<area>.<pane>` pattern.

## Product Workbench

`ProductWorkbench` should replace the current fixed left-nav column plus decorative divider with an `Allotment` two-pane layout:

- Left pane: `pm-left-nav`
- Right pane: `pm-main-viewer`

Behavior:

- The left pane width initializes from `layout.productWorkbench.leftNavWidth`.
- Dragging updates the visible width immediately.
- Drag end writes the final width back to local storage.
- Width is clamped to a safe range so the navigation cannot collapse into unusable state or starve the main content.

Responsive behavior:

- On narrow breakpoints, keep the existing single-column layout.
- Stored desktop widths should not force desktop split logic onto mobile layouts.

## Workspace

`Workspace` should migrate from manual pointer-resize logic to `Allotment`.

Target structure:

- Outer horizontal split:
  - Left: file explorer sidebar
  - Center: main workspace stack
  - Right: activity rail
- Nested vertical split inside the center area:
  - Top: main content/editor area
  - Bottom: terminal area

Behavior:

- Each resizable pane reads its initial size from the layout preference module.
- Size changes persist to the matching app-level key.
- Existing layout composition and content stay the same.

The manual `pointermove` resize code in `Workspace.tsx` should be removed after the `Allotment` migration is complete.

## Desktop AI Pane

The app shell right AI pane should use the same persistence model even if its implementation remains a single horizontal split point in `App.tsx`.

Behavior:

- Initialize from `layout.desktop.aiPaneWidth`.
- Clamp to practical desktop bounds.
- Persist after drag updates.

If the shell layout already has a simple single-resizer implementation, it may remain temporarily as long as it uses the shared layout preference module. The important requirement is consistent memory and bounds. A later cleanup can migrate this shell split to `Allotment` too if that becomes simpler.

## Splitter Styling

Do not accept raw library defaults as final UI.

Required styling direction:

- Splitters should read as subtle separators first, resize handles second.
- Use a slim visual line with a wider hit area.
- On hover or active drag, increase contrast slightly to confirm affordance.
- Match the app's current glass/light/dark surface styling instead of importing a foreign IDE skin.

## Data Flow

1. Component mounts.
2. Component reads persisted pane size through the layout preference helper.
3. Helper validates and clamps the value, then returns the effective initial size.
4. `Allotment` renders panes with those initial sizes.
5. User drags a splitter.
6. Component receives the updated pane size from `Allotment`.
7. Component writes the clamped value back through the helper.

## Error Handling

- Invalid stored values should be ignored and replaced with defaults.
- Oversized or undersized stored values should be clamped, not treated as fatal.
- Missing local storage access should fail soft by using in-memory defaults for the current session.
- Responsive layouts should ignore incompatible persisted desktop sizes when the app is in a narrow-screen mode.

## Testing

Add focused coverage for:

- Product workbench renders a resizable left navigation split.
- Workspace uses split-pane layout instead of manual pointer-resize handlers.
- Persisted values are read, clamped, and written through the shared helper.
- Reloading with saved layout values restores pane sizes.
- Invalid persisted values fall back safely.
- Narrow-screen layout still collapses to the existing single-column behavior where expected.

Run the existing build and the affected UI tests after implementation.

## Implementation Sequence

1. Add `Allotment` dependency and shared layout preference helper.
2. Migrate product workbench left navigation.
3. Migrate workspace sidebars and terminal split.
4. Connect desktop AI pane persistence to the shared helper.
5. Restyle splitters for visual consistency.
6. Add and run focused tests.

## Open Decisions

- Whether the desktop AI pane should move to full `Allotment` immediately or only share persistence in this pass.
- Exact min and max bounds should be tuned against the current desktop breakpoints during implementation, but they must be explicit constants rather than magic numbers spread across components.
