# Design System - GoodNight

## Product Context

- **What this is:** GoodNight is a compact desktop-style workbench for planning, knowledge, design, development, testing, release work, and AI-assisted execution.
- **Who it's for:** Builders who spend long sessions moving between project structure, documents, generated artifacts, and AI help.
- **Project type:** Tauri/Vite productivity workbench.
- **Current decision:** Keep the existing macOS-inspired workbench style and current density. Improve consistency and cleanup before introducing any new visual direction.

## Aesthetic Direction

- **Direction:** Current-density macOS workbench.
- **Mood:** Quiet, capable, compact, and native-feeling. The UI should feel like a serious desktop tool, not a marketing page or playful dashboard.
- **Decoration level:** Intentional but restrained. Use blur, translucency, borders, and soft shadows for depth; do not add decorative blobs, large gradients, or oversized hero-style areas inside the app.
- **Primary visual rule:** Keep attention on the user's work. Chrome exists to organize, not to compete.

## Typography

- **Primary UI font:** `-apple-system`, BlinkMacSystemFont, `SF Pro Text`, `SF Pro Display`, `Helvetica Neue`, Arial, sans-serif.
- **Code font:** `SF Mono`, Monaco, Menlo, Consolas, monospace.
- **Base size:** 13px for standard UI text, buttons, controls, and dense workbench content.
- **Scale:**
  - 10px: dense metadata only.
  - 11px: labels, uppercase section titles, minor status text.
  - 12px: helper text, subtitles, secondary list text.
  - 13px: default UI text.
  - 14px: compact card titles and important list labels.
  - 16px: panel headings.
  - 18px: workbench/page titles.
- **Rules:**
  - Do not use hero-scale typography inside the workbench.
  - Uppercase labels use modest tracking around `0.04em`.
  - Dense text should prefer clarity over decorative type choices.

## Color

- **Approach:** Neutral macOS surfaces with restrained role accents.
- **Light surfaces:**
  - Window: `#f5f5f7`
  - Chrome: `rgba(255, 255, 255, 0.72)`
  - Panel: `rgba(255, 255, 255, 0.82)`
  - Strong panel: `rgba(255, 255, 255, 0.94)`
  - Input: `rgba(255, 255, 255, 0.74)`
  - Primary text: `#1d1d1f`
- **Dark surfaces:**
  - Window: `#111317`
  - Chrome: `rgba(28, 31, 38, 0.82)`
  - Panel: `rgba(22, 24, 30, 0.9)`
  - Strong panel: `rgba(28, 31, 38, 0.96)`
  - Input: `rgba(255, 255, 255, 0.06)`
  - Primary text: `#f3f4f6`
- **Role accents:**
  - Knowledge: `#007aff`
  - Wiki: `#0891b2`
  - Page: `#4f46e5`
  - Design: `#c026d3`
  - Develop: `#059669`
  - Test: `#ea580c`
  - Operations: `#dc2626`
- **Rules:**
  - Role colors are accents, not broad backgrounds.
  - Use accent color for selected navigation, focus rings, key status pills, and primary actions.
  - Large surfaces should stay neutral.
  - Avoid purple/blue gradients as a generic default.

## Spacing

- **Density:** Current compact density.
- **Base unit:** 4px.
- **Scale:**
  - 4px: icon/text gaps and tiny internal spacing.
  - 6px: tight nav stacks and compact controls.
  - 8px: button groups and dense list gaps.
  - 10px: workbench shell gaps and compact panel padding.
  - 12px: standard panel/card gaps.
  - 14px: toolbar horizontal padding and card padding.
  - 16px: dialog sections and larger content groups.
- **Rules:**
  - Keep workbench gutters around 10-12px.
  - Do not increase global spacing to create a new visual direction.
  - Remove inconsistent one-off spacing before adding new layout primitives.

## Radius

- **6px:** menu items, tiny toggles, compact status blocks.
- **10px:** buttons, inputs, small action controls.
- **11px:** rail icon buttons and compact toolbar pills.
- **12px:** cards, list nodes, repeated item containers.
- **14px:** main panels, side rails, top bars, workbench panes.
- **16px:** dialogs and larger framed surfaces.
- **999px:** true pills only.
- **Rules:**
  - Avoid adding new 18px+ radii in the workbench.
  - Cards should not feel bubbly or toy-like.

## Elevation

- **Panel shadow:** `0 18px 36px rgba(31, 35, 42, 0.12)` in light mode; `0 18px 36px rgba(0, 0, 0, 0.28)` in dark mode.
- **Floating shadow:** `0 24px 56px rgba(31, 35, 42, 0.18)` in light mode; `0 24px 56px rgba(0, 0, 0, 0.4)` in dark mode.
- **Focus ring:** 3px translucent role accent.
- **Rules:**
  - Main panes, top bars, and side rails use panel elevation.
  - Menus, dialogs, and temporary overlays use floating elevation.
  - Avoid stacking multiple heavy shadows inside nested cards.

## Layout

- **Shell:** Keep the existing desktop workbench skeleton: left vertical icon rail, top toolbar, central work surface, optional right AI pane.
- **Navigation:** The primary navigation is a vertical icon rail. It should not be restyled as horizontal tabs.
- **Main pane:** Use full-height work surfaces with constrained internal panels.
- **AI pane:** Treat AI as a first-class right-side work companion, not a floating marketing assistant.
- **Rules:**
  - Do not put cards inside cards unless the nested item is a repeated record.
  - Page sections are unframed work areas; cards are for repeated items, dialogs, and concrete tools.
  - Keep dense operational screens scannable and aligned.

## Component Rules

### Buttons

- Minimum height: 32px.
- Border radius: 10px.
- Primary buttons use role accent and are reserved for the main action in the current context.
- Secondary buttons use neutral panel fill and a subtle border.
- Ghost/icon buttons are preferred for toolbar commands.
- Hover may lift by 1px and adjust border/background. Do not use large animated effects.

### Inputs

- Minimum height: 36px.
- Border radius: 10px.
- Use neutral translucent fill, subtle border, and focus ring.
- Labels use 11px uppercase text only when helpful for dense forms.

### Panels

- Main workbench panels use 14px radius, 1px border, translucent fill, blur, and panel shadow.
- Internal cards use 12px radius and lighter elevation or no elevation.
- Repeated cards should be visually quieter than containing panels.

### Primary Navigation

- Default state: transparent background and muted icon color.
- Hover state: 1px upward movement, low-opacity role accent tint, subtle border.
- Active state: hover treatment plus a 1px role-accent outer ring.
- Do not use solid role-color blocks for rail navigation.
- Top tabs and detail tabs are separate patterns and should not copy rail styling directly.

### Status Pills

- Use only for state or context.
- Prefer low-opacity accent fills and compact 11px text.
- Avoid using many pills as decoration.

## Motion

- **Approach:** Minimal-functional.
- **Duration:** 150-200ms for hover and state transitions.
- **Easing:** Standard `ease` or `ease-out`.
- **Rules:**
  - Motion confirms state changes; it should not perform.
  - Avoid large entrance choreography inside workbench surfaces.

## Cleanup Priorities

1. Normalize button, input, rail, panel, and card styling to the token ranges above.
2. Remove one-off radii, spacing, and shadows that do not serve a specific component role.
3. Reduce nested card framing where borders and spacing can express grouping.
4. Keep the current density while improving alignment and consistency.

## Decisions Log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-04-28 | Keep current density | User prefers the existing compact feel; the problem is consistency, not a new layout direction. |
| 2026-04-28 | Preserve macOS workbench aesthetic | Existing app already uses this direction and it fits a desktop productivity tool. |
| 2026-04-28 | Define vertical rail navigation states | The primary nav is a left icon rail; horizontal tab styling would be the wrong model. |
