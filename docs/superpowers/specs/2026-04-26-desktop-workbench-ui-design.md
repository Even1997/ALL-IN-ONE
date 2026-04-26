# Desktop Workbench UI Design

## Summary

Refit the app UI into a desktop workbench layout. The app should feel closer to a native IDE: edge-to-edge panes, no outer whitespace between left/middle/right areas, and draggable splitters for the main work areas. The design canvas page is excluded from this pass.

## Goals

- Remove the rounded floating-shell feeling from the main app workspace.
- Make the active workspace fill the full window with no gaps between left, center, right, and bottom panes.
- Let users manually resize left, center, right, and bottom panes using desktop-style splitter handles.
- Convert the AI chat from a bottom-right floating window into a fixed right activity pane.
- Keep the design page largely unchanged to avoid destabilizing canvas interactions.
- Add quick tabs above the knowledge detail area for opened knowledge files.

## Non-Goals

- Do not redesign the design canvas page in this pass.
- Do not rewrite data models or routing.
- Do not add multi-window docking, detached panels, or saved workspace presets.
- Do not change the local Claude/Codex agent runtime behavior.

## Desktop Layout

The app shell should use a full-height, full-width desktop layout:

- A compact top app bar remains for project and role switching.
- The main area fills all remaining viewport height.
- Product, Develop, Test, and Operations views use flatter, edge-to-edge panels.
- Cards used as large page shells should be reduced or removed where they create visible whitespace.
- Pane boundaries should be expressed by 1px borders and splitter handles, not by margins, large radii, or shadows.

The design role can keep its current layout and visual treatment for now.

## Resizable Panes

Use React state and pointer events for splitter resizing.

For the main development workspace:

- Left pane: file explorer.
- Center pane: editor/content area.
- Right pane: activity/AI pane when applicable.
- Bottom pane: terminal/log area.

Splitters should clamp sizes to practical limits so panes cannot disappear accidentally. A first implementation can persist sizes only in component state; localStorage persistence can be added later if needed.

## AI Activity Pane

The AI chat should render as a right-side activity pane on desktop widths instead of a fixed floating card. It should:

- Use the same chat logic and settings drawer.
- Fit the pane height and width.
- Keep collapse behavior available.
- Fall back to the existing bottom sheet behavior on narrow screens.

## Knowledge Quick Tabs

The product knowledge detail view should track opened knowledge entries:

- Selecting a knowledge file opens it in a tab if it is not already open.
- Tabs appear above the selected file detail header.
- Clicking a tab switches the active knowledge file.
- Each tab has a close button.
- Closing the active tab selects the nearest remaining tab; if none remain, the current selection can fall back to the first knowledge file.

The tab state should stay local to `ProductWorkbench` unless another feature needs it later.

## Testing

Add focused source tests for:

- Desktop workspace exposes resize splitters for horizontal and vertical panes.
- AI chat supports a docked desktop pane class.
- Product knowledge view renders an opened-file tab strip and close buttons.

Run the existing TypeScript build after implementation.
