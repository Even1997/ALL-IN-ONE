# Knowledge Inline Reading Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make knowledge notes editable in reading mode, remove the separate title input, and treat the first line as the title while preserving the existing save pipeline.

**Architecture:** Keep `ProductWorkbench`'s existing title/body save contract intact, but let `KnowledgeNoteWorkspace` edit a single canonical markdown document assembled from those two fields. Reading mode uses the inline markdown editor for article-style editing; code mode uses a raw markdown textarea that edits the same document and syncs title/body back through helper parsing.

**Tech Stack:** React 19, TypeScript, existing `GoodNightMarkdownEditor`, existing node-based source tests

---

### Task 1: Add unified note document parsing helpers

**Files:**
- Modify: `src/features/knowledge/workspace/knowledgeNoteMarkdown.ts`
- Test: `tests/knowledge-note-markdown.test.mjs`

- [ ] Add a helper that reads a canonical note document and returns `{ title, body }`, using the leading H1 when present and a fallback title otherwise.
- [ ] Cover the helper with tests for H1 parsing and fallback behavior.
- [ ] Keep `serializeKnowledgeNoteMarkdown` as the canonical writer so saved notes still normalize to one H1 title plus body.

### Task 2: Switch knowledge note UI to unified document editing

**Files:**
- Modify: `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- Modify: `src/App.css`
- Test: `tests/knowledge-note-workspace.test.mjs`
- Test: `tests/knowledge-workspace-ui.test.mjs`

- [ ] Replace the separate title input in the selected-note editor with a document-level editor model built from `serializeKnowledgeNoteMarkdown(titleValue, editorValue)`.
- [ ] In reading mode, render `GoodNightMarkdownEditor` against the full markdown document and split edits back into title/body with the new helper.
- [ ] In code mode, render a raw markdown textarea for the same full document and sync edits through the same helper.
- [ ] Add styling so the raw editor fits the note surface and the reading-mode hint explains “first line is title, second line onward is body”.

### Task 3: Verify source-level expectations

**Files:**
- Test: `tests/knowledge-note-markdown.test.mjs`
- Test: `tests/knowledge-note-workspace.test.mjs`
- Test: `tests/knowledge-workspace-ui.test.mjs`

- [ ] Run `node --test tests/knowledge-note-markdown.test.mjs tests/knowledge-note-workspace.test.mjs tests/knowledge-workspace-ui.test.mjs`.
- [ ] If a source assertion fails because the implementation shape changed, update the assertion to match the new unified-document behavior without broadening scope.
