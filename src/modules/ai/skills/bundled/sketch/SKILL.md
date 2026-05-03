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
1. Start from page goals and user tasks.
2. Break each page into business-responsibility modules.
3. Keep the output low-fidelity and focused on structure, not styling.

Output rules:
- Describe module purpose, key information, and actions.
- Avoid implementation code unless the user explicitly asks for a prototype.
