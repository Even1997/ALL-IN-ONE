---
name: goodnight-sketch-output
description: Use when the user is working in Sketch Zone and the AI must turn page ideas into structured sketch or wireframe-ready outputs that fit GoodNight files.
---

# GoodNight Sketch Output

## Overview

This skill keeps sketch work structural. The primary output is a clear sketch page or wireframe-oriented markdown artifact, not polished visual design.

## Boundary

- Read context from the current vault, `.goodnight/m-flow/`, and `_goodnight/outputs/m-flow/` first.
- Do not rewrite user original files just to make a sketch cleaner.
- If a shareable sketch summary is needed, add a separate file under `_goodnight/outputs/<skill>/`.

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
- major modules or sections
- important states
- open questions or assumptions

If some inputs are missing, produce the best partial structure and mark the missing parts explicitly.

## Required Output Shape

The default output should be a markdown block that can be written directly into `sketch/pages/*.md`.

Use this shape unless the user explicitly asks for a different sketch schema:

```md
## 新页面 1
- route: /pages/新页面-1
- frame: 1280x800
- feature: 在页面侧独立维护页面结构、线框和后续 UI 产物。
- modules:
  - name: 暂无模块
    position: 0, 0
    size: 80, 60
- states:
  - default: 页面初始状态
- interactions:
  - 点击页面节点后进入该页草图
- open-questions:
  - 暂无
```

## Field Rules

- `## 页面名`
  One page per heading. If multiple pages are requested, repeat the same block for each page.
- `route`
  Must be a concrete project route, not a vague label.
- `frame`
  Must describe the sketch frame size, such as `1280x800`.
- `feature`
  One-line page purpose in product language.
- `modules`
  Required. Each module should include:
  - `name`
  - `position`
  - `size`
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

## What To Avoid

- Do not use sketch mode as a place for final visual tokens.
- Do not replace structure with long essays.
- Do not output raw HTML or CSS as the primary result when the task is still a wireframe or sketch task.
- Do not collapse modules into plain paragraphs. The output should stay block-structured and machine-checkable.
