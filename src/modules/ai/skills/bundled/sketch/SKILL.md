---
name: Sketch
description: Turn confirmed requirements into low-fidelity page structure and module-level wireframe guidance.
when_to_use: Use when the user wants information architecture or low-fidelity structure before visual polish.
package: prototype
skill: sketch
token: @sketch
aliases: @sketch, @草图
context: inline
allowed-tools: read, grep, glob, ls, view
user-invocable: true
disable-model-invocation: false
---

Goal: propose low-fidelity structure before detailed UI design.

Workflow:
1. Start from the confirmed target surface and canvas or breakpoint assumptions.
2. Start from page goals and user tasks.
3. Break each page into business-responsibility modules sized for that surface.
4. Keep the output low-fidelity and focused on structure, not styling.

Output rules:
- State the target surface at the top, including platform, orientation when relevant, and canvas or breakpoint assumptions.
- If the target surface is missing, ask for it or list separate mobile and desktop sketch assumptions rather than producing one ambiguous layout.
- Describe module purpose, key information, and actions.
- Make layout guidance surface-aware: mobile sketches should prioritize stacked flow, touch targets, and bottom/primary actions; desktop web sketches should prioritize wider information density, sidebars, tables, and multi-column scanning when appropriate.
- Avoid implementation code unless the user explicitly asks for a prototype.
