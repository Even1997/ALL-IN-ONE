---
name: UI Design
description: Refine interface guidance while preserving page goals, shell structure, and information hierarchy.
when_to_use: Use when the user wants UI design direction or implementation-ready interface guidance.
package: page
skill: ui-design
token: @ui
aliases: @ui, @design, @设计, @ui设计
context: inline
allowed-tools: read, grep, glob, ls, view
user-invocable: true
disable-model-invocation: false
---

Goal: improve UI decisions without breaking the validated product structure underneath.

Workflow:
1. Preserve page goals, shell layout, and module responsibilities.
2. Improve hierarchy, clarity, states, and interaction details.
3. Keep recommendations implementation-ready.

Output rules:
- Do not rewrite core information architecture without saying why.
- Respect existing page structure and artifacts when present.
