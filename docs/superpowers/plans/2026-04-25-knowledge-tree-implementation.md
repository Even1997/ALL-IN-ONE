# Knowledge Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat product knowledge list with a grouped tree for `项目 / 草图 / 设计`, and add real folder create/delete support with right-click actions.

**Architecture:** Keep persistence rooted in real project paths while introducing a UI-only grouping layer. Build grouped tree data in `src/modules/knowledge`, render it in `ProductWorkbench`, and extend the Tauri file tools with a minimal mkdir command for real folder creation.

**Tech Stack:** React 19, TypeScript, Zustand, Tauri Rust commands, Node `--test` source regression tests

---

### Task 1: Lock the tree requirements with failing tests

**Files:**
- Create: `tests/knowledge-tree.test.mjs`
- Test: `tests/product-workbench.test.mjs`

- [ ] **Step 1: Write the failing tests**

Add source-level assertions that require:

- a grouped knowledge tree model with `项目 / 草图 / 设计`
- a `protected` or equivalent system-node safeguard
- folder creation and delete handlers in `ProductWorkbench`
- a registered `tool_mkdir` Tauri command

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/knowledge-tree.test.mjs`
Expected: FAIL because the grouped tree model and mkdir command do not exist yet

### Task 2: Build grouped knowledge tree data

**Files:**
- Modify: `src/modules/knowledge/knowledgeEntries.ts`
- Create: `src/modules/knowledge/knowledgeTree.ts`
- Test: `tests/knowledge-tree.test.mjs`

- [ ] **Step 1: Write minimal grouped tree implementation**

Introduce:

- fixed group ids for `project`, `sketch`, `design`
- node types for `group`, `folder`, `file`
- classification from current knowledge entries into one of the three groups
- path splitting for real nested folders

- [ ] **Step 2: Run test to verify the tree test now covers the new model**

Run: `node --test tests/knowledge-tree.test.mjs`
Expected: still FAIL until the UI and mkdir command are wired

### Task 3: Render the grouped knowledge tree in ProductWorkbench

**Files:**
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/App.css`
- Test: `tests/knowledge-tree.test.mjs`

- [ ] **Step 1: Replace the flat knowledge list with a grouped text tree**

Render:

- three fixed top-level nodes
- expandable folders
- file selection behavior
- lightweight tree rows

- [ ] **Step 2: Add right-click menu state and handlers**

Support:

- new file
- new folder
- delete on file/folder nodes
- hidden/blocked delete on system group nodes

- [ ] **Step 3: Run test to verify the UI-oriented tree checks pass**

Run: `node --test tests/knowledge-tree.test.mjs`
Expected: only mkdir-related assertions may still fail

### Task 4: Add real folder creation support in Tauri and wire it up

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/components/product/ProductWorkbench.tsx`
- Test: `tests/knowledge-tree.test.mjs`

- [ ] **Step 1: Add `tool_mkdir` command in Rust**

Create a command that:

- creates the target directory recursively
- returns a standard `ToolResult`

- [ ] **Step 2: Register and call the command from ProductWorkbench**

Wire folder creation so:

- creating from a system group targets the project root
- creating from a real folder targets the selected folder path

- [ ] **Step 3: Run test to verify it passes**

Run: `node --test tests/knowledge-tree.test.mjs`
Expected: PASS

### Task 5: Verify build integrity

**Files:**
- Verify only

- [ ] **Step 1: Run targeted tests**

Run: `node --test tests/knowledge-tree.test.mjs tests/product-workbench.test.mjs`
Expected: PASS

- [ ] **Step 2: Run application build**

Run: `npm run build`
Expected: exit 0
