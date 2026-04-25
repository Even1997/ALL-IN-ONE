# Project Filesystem Source-Of-Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch project persistence to a filesystem-first model for project docs and sketch pages while keeping the existing UI working through runtime-derived store state.

**Architecture:** Keep the current React and Zustand surfaces, but make `project/`, `sketch/pages/`, `design/styles/`, and `design/prototypes/` the durable source. `pageStructure` and `wireframes` stay in the store only as parsed runtime artifacts derived from `sketch/pages/*.md`.

**Tech Stack:** React 19, Zustand, TypeScript, Tauri file commands, Node test runner

---

### Task 1: Add File-Backed Sketch Page Serialization

**Files:**
- Create: `src/modules/knowledge/sketchPageFiles.ts`
- Modify: `src/modules/knowledge/referenceFiles.ts`
- Modify: `src/utils/projectPersistence.ts`
- Test: `tests/ai/reference-files.test.mjs`
- Test: `tests/project-persistence.test.mjs`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run the targeted tests to verify they fail**
- [ ] **Step 3: Add sketch page parse/build helpers and switch sketch file output to the new format**
- [ ] **Step 4: Run the targeted tests to verify they pass**

### Task 2: Initialize Real Project Directories On Project Creation

**Files:**
- Modify: `src/utils/projectPersistence.ts`
- Modify: `src/App.tsx`
- Test: `tests/project-persistence.test.mjs`
- Test: `tests/project-store.test.mjs`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run the targeted tests to verify they fail**
- [ ] **Step 3: Add a reusable project filesystem initializer and call it during project creation/open**
- [ ] **Step 4: Run the targeted tests to verify they pass**

### Task 3: Derive Runtime Page State From `sketch/pages/*.md`

**Files:**
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/App.tsx`
- Modify: `src/store/projectStore.ts`
- Test: `tests/product-workbench.test.mjs`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run the targeted tests to verify they fail**
- [ ] **Step 3: Load sketch markdown from disk, parse it into runtime pages/wireframes, and feed the store through `replacePageStructure` / `replaceWireframes`**
- [ ] **Step 4: Run the targeted tests to verify they pass**

### Task 4: Make Sketch Page CRUD Real File Operations

**Files:**
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/App.tsx`
- Modify: `src/utils/projectPersistence.ts`
- Test: `tests/product-workbench.test.mjs`
- Test: `tests/project-persistence.test.mjs`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run the targeted tests to verify they fail**
- [ ] **Step 3: Replace in-memory sketch page create/delete flows with file create/delete flows and refresh the runtime-derived state from disk**
- [ ] **Step 4: Run the targeted tests to verify they pass**

### Task 5: Full Verification

**Files:**
- Modify: `tests/product-workbench.test.mjs`
- Modify: `tests/project-persistence.test.mjs`
- Modify: `tests/project-store.test.mjs`

- [ ] **Step 1: Run the focused test suite**

Run: `node --test tests/project-store.test.mjs tests/project-persistence.test.mjs tests/product-workbench.test.mjs tests/knowledge-tree.test.mjs tests/knowledge-entries.test.mjs tests/ai/reference-files.test.mjs`
Expected: all tests pass

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: exit 0
