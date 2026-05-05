---
name: goodnight-sketch-output
description: Use when the user is working in Sketch Zone and the AI must turn page ideas into structured sketch or wireframe-ready outputs that fit GoodNight files.
allowed-tools: []
---

# GoodNight Sketch Output

## Overview

This skill keeps sketch work structural. The primary output is a clear sketch page or wireframe-oriented markdown artifact, not polished visual design.

## Boundary

- Read context from the current vault and visible project files first.
- Do not rewrite user original files just to make a sketch cleaner.
- If a shareable sketch summary is needed, keep it in a visible vault file only when the task calls for that output.

## Default Target

- Write or update `sketch/pages/*.md`.
- Treat each page as a structured sketch record tied to a route, page goal, and module list.

## File Naming Rules

- The default target file should be `sketch/pages/<page-slug>.md`.
- The default route should be `/pages/<page-slug>`.
- `page-slug` should be lowercase kebab-case when an English slug is needed.
- If the page already exists, update its existing sketch file instead of inventing a second variant.

## Expected Inputs

- page name
- route
- user goal
- major modules, sections, actionable controls, important compound fields, and important visible display fields
- important states
- open questions or assumptions

If some inputs are missing, produce the best partial structure and mark the missing parts explicitly.

## Required Output Shape

The default output should be a markdown block that can be written directly into `sketch/pages/*.md`.

Use this shape unless the user explicitly asks for a different sketch schema:

```md
## Page 1
- route: /pages/page-1
- frame: 1280x800
- feature: Maintain page structure, wireframe, and follow-up UI artifacts beside the page.
- modules:
  - name: Main toolbar
    type: 线框
    position: 24, 24
    size: 1232, 56
    purpose: Primary page commands and filters.
    content: 顶部主工具栏，包含搜索区、保存按钮、页面级筛选
  - name: Search area
    type: 线框
    position: 24, 32
    size: 420, 40
    purpose: Compound search control inside Main toolbar.
    content: 搜索组合区，包含范围选择、关键词输入、搜索按钮
  - name: Search scope select
    type: 线框
    position: 24, 32
    size: 96, 40
    purpose: Field inside Search area.
    actions: Switch the search scope
    content: 下拉字段，候选项为商品 / 店铺 / 订单
  - name: Search keyword input
    type: 线框
    position: 128, 32
    size: 248, 40
    purpose: Field inside Search area.
    actions: Filter visible modules
    content: 输入字段，包含关键词占位文案
  - name: Search submit button
    type: 线框
    position: 384, 32
    size: 60, 40
    purpose: Action inside Search area.
    actions: Run the current search
    priority: primary
    content: 按钮文案为搜索
  - name: Page title
    type: 文字
    position: 32, 104
    size: 220, 28
    content: 页面主标题文本
- states:
  - default: Initial page state
- interactions:
  - Click Search submit button to run the current search
- open-questions:
  - None
```

## Field Rules

- `## Page Name`
  One page per heading. If multiple pages are requested, repeat the same block for each page.
- `route`
  Must be a concrete project route, not a vague label.
- `frame`
  Must describe the sketch frame size, such as `1280x800`.
- `feature`
  One-line page purpose in product language.
- `modules`
  Required. Modules are the system-level unit for both layout regions and detailed controls.
  Each module should include:
  - `name`
  - `type`
  - `position`
  - `size`
  - `content`
  Each module may also include:
  - `purpose`
  - `actions`
  - `priority`
  Keep these fields in this exact order:
  `name`, `type`, `position`, `size`, `purpose`, `actions`, `priority`, `content`.
  Keep `name` human-readable and visually natural, such as `商品标题`, `搜索按钮`, or `价格标签`.
  Use only two module `type` values:
  - `线框`
  - `文字`
  Keep `content` for visible content, field composition, copy hints, options, placeholder text, and detail that should help later UI generation.
- `states`
  Required when the page has meaningful empty, loading, error, or variant states.
- `interactions`
  Required when the sketch implies navigation, toggles, selection, creation, deletion, or drill-down behavior.
- `open-questions`
  Use this instead of hiding ambiguity in prose.

## Position And Size Rules

- `position`
  Use `x, y`.
- `size`
  Use `width, height`.
- Use integers only for `position` and `size`.
- Treat coordinates as sketch-space values with a top-left origin.
- If exact values are unknown, still provide coarse sketch coordinates instead of omitting them.

## Module Granularity Rules

- Treat major page regions as modules.
- Use `type: 线框` for containers, cards, lists, panels, toolbars, tables, inputs, buttons, tabs, selectors, and other boxed or structural elements.
- Use `type: 文字` for standalone text-like elements that should render as lightweight text rather than a framed box, such as titles, prices, helper text, counters, short labels, and inline copy markers.
- Treat every visible actionable control as its own module, including buttons, icon buttons, inputs, selects, tabs, toggles, checkboxes, menu items, links that navigate, and primary list actions.
- Treat important visible display units as modules too when they materially affect later UI generation. This includes image slots, covers, avatars, titles, prices, original prices, ratings, badges, chips, counters, empty-state messages, helper text, and status labels.
- Treat every compound control as a parent module plus child modules for its visible fields and slots. Examples include search bars, filter bars, segmented controls, form rows, table rows with inline actions, and cards with embedded controls.
- If a search area contains a scope switcher, keyword field, clear button, submit button, or filter chip row, output each visible part as its own module instead of collapsing them into one coarse line.
- If a product card, list item, or content card contains image, title, metadata, price, badge, and actions, split those visible parts into separate modules instead of leaving one coarse `Product card` box.
- Do not hide buttons inside a parent module description. If a button exists in the sketch, output a separate module for it.
- Put user-triggered behavior in `actions`, not in a custom `action` field.
- Put extra detail in `content`, for example field composition, visible text, option sets, placeholder copy, default values, empty text, or state hints.
- Express hierarchy by module order, not by extra fields. Higher-level containers must appear earlier in the `modules` list, and their child modules must be listed later underneath them in logical reading order.
- Treat modules written earlier in the list as higher-level modules. A section should appear before the group it contains, and a group should appear before the fields and buttons it contains.
- Use `purpose` text to mention containment when needed, for example `Field inside Search area` or `Primary action inside Product card 1`.
- Use control-relative names when several controls repeat, such as `Row 1 Open button`, `Row 1 Delete button`, and `Row 2 Open button`.
- Keep the `position` and `size` values in the same top-left frame coordinate system as structural modules.
- If a control's exact placement is not known, still choose a coarse but plausible position inside its parent instead of omitting the control.
- Do not add custom fields such as `kind`, `parent`, `level`, `depth`, `action`, or `state` between `name` and `position`; the GoodNight markdown parser expects the standard module field order.

## Detail Threshold

- Aim for a sketch that another AI can use to generate a UI image without inventing the main visible pieces on its own.
- If removing a visible element would noticeably change the generated UI, that element should usually be its own module.
- Prefer overspecifying meaningful UI parts over collapsing them too early.
- Do not model purely decorative borders, shadows, or spacing guides as modules unless they carry product meaning.
- For commerce, dashboard, and content-heavy pages, default to finer granularity than you would use for a casual human-only wireframe.

## What To Avoid

- Do not use sketch mode as a place for final visual tokens.
- Do not replace structure with long essays.
- Do not output raw HTML or CSS as the primary result when the task is still a wireframe or sketch task.
- Do not collapse modules into plain paragraphs. The output should stay block-structured and machine-checkable.
- Do not create a separate top-level `buttons` or `controls` list unless the user explicitly asks for a different schema.
