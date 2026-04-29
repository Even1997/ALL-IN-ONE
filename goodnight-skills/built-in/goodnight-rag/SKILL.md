---
name: goodnight-rag
description: Use when GoodNight should answer from the vault with RAG-style chunk retrieval, evidence-first grounding, and user-visible outputs separated from originals.
---

# GoodNight RAG

## Overview

Use `rag` when the user wants conventional retrieval over chunked vault content with grounded evidence selection.

## Working Contract

- Start from `.goodnight/base-index/` and the current `.goodnight/skills/rag/` state.
- Split large source material into chunk-oriented retrieval units when needed.
- Prefer explicit evidence and short retrieval chains over broad synthesis.
- Write optional generated deliverables to `_goodnight/outputs/rag/`.

## Retrieval Style

- Retrieval should surface the most relevant chunk before broadening scope.
- Keep answers tied to the underlying files so the user can verify them.
- Use chunk boundaries that preserve meaning rather than arbitrary line slices.

## What To Avoid

- Do not treat `rag` as a full wiki authoring workflow.
- Do not ignore the current vault structure when building chunk sets.
- Do not overwrite user originals to store retrieval artifacts.
