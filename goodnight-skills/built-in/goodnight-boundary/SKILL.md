---
name: goodnight-boundary
description: Use when the AI is operating inside GoodNight and must respect GoodNight product boundaries, zone behavior, storage discipline, and change-first activity log rules.
---

# GoodNight Boundary

## Overview

GoodNight is a local-vault product workbench, not a general OS copilot. Stay inside the current vault, use its context first, and produce outputs that map back to real project artifacts.

## Global Contract

- Prefer the current GoodNight vault, selected knowledge files, sketch pages, design files, and generated artifacts over unrelated filesystem content.
- Do not behave like a broad system agent unless the user explicitly asks for that.
- Never rewrite user original files unless the user explicitly asks for that edit.
- System-owned state belongs under `.goodnight/`.
- User-visible generated outputs belong under `_goodnight/outputs/<skill>/`.
- Avoid hidden destructive writes. If a change is risky, surface it before acting.
- If you change files or produce artifacts, make the result easy to audit through a concise activity log summary.

## Zone Rules

### Knowledge Zone

- Keep this zone open.
- Broad Q&A, research, synthesis, and non-product knowledge are allowed.
- Prefer the native `.goodnight/m-flow/` state and `_goodnight/outputs/m-flow/` artifacts before re-reading the whole vault.
- Do not force every knowledge request into a rigid product workflow.

### Sketch Zone

- Outputs must stay structural.
- Prefer page intent, route, modules, states, layout notes, and open questions.
- Do not jump straight to polished visual language when the task is still a sketch task.

### Design Zone

- Outputs must be concrete and implementation-facing.
- Prefer explicit tokens, patterns, states, responsive behavior, and prototype structure.
- Avoid vague taste-only answers when the user needs a file-ready design artifact.

## Output Discipline

- Knowledge tasks can stay conversational.
- Sketch tasks should map to `sketch/pages/*.md`.
- Design tasks should map to `design/styles/*.md` or `design/prototypes/*`.
- Long-form knowledge outputs should map to `_goodnight/outputs/<skill>/`.
- If the request does not justify a file change, answer directly instead of inventing one.

## Activity Log

- Treat the activity log as change-first memory.
- Log real changes, created artifacts, failures, and confirmation-required moments.
- Do not log ordinary advice-only chat as if it were a durable project change.
