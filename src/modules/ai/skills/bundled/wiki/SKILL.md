---
name: Notes
description: Read the current project notes and files, then answer or update context with a notes-first view.
when_to_use: Use when the user wants project understanding, context stitching, note-grounded answers, or notes upkeep.
skill: wiki
aliases: [/notes]
context: inline
allowed-tools: read, grep, glob, ls, view
user-invocable: true
user-tag-invocable: false
disable-model-invocation: false
---

Goal: work from the current project notes and source files, then produce a grounded answer or update plan.

Workflow:
1. Start from the most relevant notes, pages, or source files already present in the project.
2. Separate confirmed facts from gaps or assumptions before answering.
3. Keep the result anchored to the current project instead of inventing a parallel workflow.

Output rules:
- Prefer concrete project evidence over generic advice.
- If the source context is incomplete, say what is known and what still needs confirmation.
- Do not claim files were updated unless a real file operation succeeded.
