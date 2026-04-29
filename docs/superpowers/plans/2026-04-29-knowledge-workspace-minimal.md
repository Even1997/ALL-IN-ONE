# Knowledge Workspace Minimal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the knowledge workspace to a minimal file-tree-and-editor experience while keeping retrieval-method switching and manual index refresh.

**Architecture:** Remove wiki/graph/activity/attachment/design-assist UI from the knowledge lane, simplify `KnowledgeNoteWorkspace` props and rendering, and trim `ProductWorkbench` wiring to only pass the retained capabilities. Lock the new scope with targeted source-assertion tests plus the existing regression/build checks.

**Tech Stack:** React, TypeScript, Zustand, Node test runner, Vite build

---

### Task 1: Lock the Reduced Surface Area

**Files:**
- Modify: `tests/knowledge-note-workspace.test.mjs`
- Modify: `tests/product-workbench-knowledge-cutover.test.mjs`

- [ ] Add failing assertions that the knowledge workspace no longer exposes wiki graph, activity, attachment, upload/import, or design-assist hooks.
- [ ] Keep assertions that the retrieval-method switch, file tree, context menu actions, manual refresh, and note editor remain wired.
- [ ] Run targeted tests and confirm they fail for the expected removed-surface assertions.

### Task 2: Simplify the Knowledge Workspace Component

**Files:**
- Modify: `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`

- [ ] Remove props and rendering paths for wiki graph, similar notes, neighborhood notes, attachment panels, document activity, upload/import buttons, and design-assist actions.
- [ ] Keep the retrieval-method select, search/filter controls, tree actions, editor, save/delete actions, and manual index refresh button.
- [ ] Collapse helper code that becomes unused after the UI removal.

### Task 3: Trim Product Workbench Wiring

**Files:**
- Modify: `src/components/product/ProductWorkbench.tsx`

- [ ] Remove knowledge-lane state, imports, derived data, and callbacks that only serve the deleted auxiliary panels and wiki tab.
- [ ] Keep file-tree management, note CRUD, retrieval method switching, manual index refresh, and knowledge-root scoping.
- [ ] Ensure the remaining `KnowledgeNoteWorkspace` props match the reduced component contract.

### Task 4: Verify the Cutover

**Files:**
- Test: `tests/local-vault-knowledge-base.test.mjs`
- Test: `tests/product-workbench-knowledge-cutover.test.mjs`
- Test: `tests/knowledge-note-workspace.test.mjs`
- Test: `tests/ai/knowledge-organize-lane.test.mjs`

- [ ] Run targeted tests first and make them pass.
- [ ] Run the broader regression set covering vault knowledge behavior.
- [ ] Run `npm run build` and confirm TypeScript + production build still succeed.
