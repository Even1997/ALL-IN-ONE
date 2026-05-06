# Note File Tree First Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Note workspace behave more like a VS Code file tree by opening text/code/Markdown files inside the app while leaving Office and other binary files to the system opener.

**Architecture:** Keep the existing vault tree and Tauri `tool_view` read path. Rename the unmapped Markdown preview state to a generic file preview, classify extensions locally, render Markdown through `KnowledgeMarkdownViewer`, render code/text in a read-only textarea, and keep unsupported files on `onOpenAttachment`.

**Tech Stack:** React, TypeScript, Tauri invoke, existing CSS in `src/App.css`, Node source tests.

---

### Task 1: Lock File Routing Behavior

**Files:**
- Modify: `tests/knowledge-note-workspace.test.mjs`

- [ ] **Step 1: Write the failing test**

Add a test asserting that `KnowledgeNoteWorkspace.tsx` defines previewable text/code extensions, routes previewable unmapped files through an in-app preview handler, and routes Office extensions through `onOpenAttachment`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/knowledge-note-workspace.test.mjs`
Expected: FAIL because only Markdown preview is currently supported.

### Task 2: Implement Generic Text File Preview

**Files:**
- Modify: `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- Modify: `src/App.css`

- [ ] **Step 3: Write minimal implementation**

Replace the raw Markdown preview state with a generic file preview state:
- Markdown extensions render with `KnowledgeMarkdownViewer`.
- Code/text extensions render in a read-only `textarea`.
- Office/binary extensions continue to call `onOpenAttachment`.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/knowledge-note-workspace.test.mjs tests/knowledge-workspace-ui.test.mjs`
Expected: PASS.

### Task 3: Verify Build

**Files:**
- No new files.

- [ ] **Step 5: Run production build**

Run: `npm run build`
Expected: exit code 0.
