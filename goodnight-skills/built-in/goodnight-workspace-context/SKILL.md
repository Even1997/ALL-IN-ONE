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

## Write Rules

- Write sketch artifacts to `sketch/pages/*.md`.
- Write design language or system guidance to `design/styles/*.md`.
- Write rendered prototype artifacts to `design/prototypes/*`.
- Use real vault-relative paths in explanations.
- Generated files should be written directly into the user-visible vault tree only when the task calls for file output.

## Derived And Generated Artifacts

- `<vault>/` is the primary context source.
- Generated outputs should resolve into visible vault paths the user can inspect.
- When explaining changes, reference the final vault-relative path the user can inspect.

## Practical Rule

If you are unsure where an output belongs, choose the narrowest valid location:

- knowledge or notes: the user-owned vault path
- sketch structure: `sketch/pages/`
- visual system: `design/styles/`
- clickable prototype: `design/prototypes/`
