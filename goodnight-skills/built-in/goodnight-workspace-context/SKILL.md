---
name: goodnight-workspace-context
description: Use when the AI needs GoodNight project directory conventions, artifact locations, and where sketch, design, and project files should be read or written.
---

# GoodNight Workspace Context

## Overview

Use GoodNight's local vault filesystem as the default working map. Prefer real vault-relative paths over abstract descriptions.

## Vault Directories

- `<vault>/`
  The user-owned knowledge root. User documents stay here and remain the source of truth.
- `sketch/pages/`
  Structured sketch pages derived from page structure and wireframe intent.
- `design/styles/`
  Style packs, design language docs, and reusable visual direction files.
- `design/prototypes/`
  HTML prototypes and related prototype manifests.
- `.goodnight/base-index/`
  Shared system index for the current vault.
- `.goodnight/skills/<skill>/`
  Skill-specific retrieval caches and internal state.
- `_goodnight/outputs/<skill>/`
  User-visible AI outputs produced for a retrieval skill.

## Write Rules

- Write sketch artifacts to `sketch/pages/*.md`.
- Write design language or system guidance to `design/styles/*.md`.
- Write rendered prototype artifacts to `design/prototypes/*`.
- Keep internal state files under `.goodnight/` as system-owned unless the task is specifically about them.
- If the user asks for a generated knowledge document, write it to `_goodnight/outputs/<skill>/`.

## Derived And Generated Artifacts

- The vault is the primary context source.
- The system index is `.goodnight/base-index/`, not a visible wiki tree.
- Generated outputs should still resolve into visible vault paths the user can inspect.
- When explaining changes, reference the final vault-relative path the user can inspect.

## Practical Rule

If you are unsure where an output belongs, choose the narrowest valid location:

- knowledge or notes: the user-owned vault path
- generated knowledge deliverable: `_goodnight/outputs/<skill>/`
- sketch structure: `sketch/pages/`
- visual system: `design/styles/`
- clickable prototype: `design/prototypes/`
