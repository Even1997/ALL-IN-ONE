# Knowledge Reading Mode And Obsidian Citations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real Markdown reading mode plus Obsidian-compatible internal/external citation rules across the knowledge UI and AI-generated wiki pages.

**Architecture:** Keep the existing Markdown editor and note serialization flow, then layer a focused reading component and a small Markdown compatibility helper on top. AI generation keeps using proposal metadata, but the prompt and execution path move away from legacy `## 引用来源` lists toward `[[...]]` links and Markdown footnotes.

**Tech Stack:** React 19, TypeScript, node:test, Vite, react-markdown, remark-gfm

---

### Task 1: Lock the markdown compatibility behavior with failing tests

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-note-markdown.test.mjs`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-proposal-builders.test.mjs`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\knowledge-organize-lane.test.mjs`

- [ ] **Step 1: Add failing tests for Obsidian-compatible references**

Cover:

- internal source fallback becomes `[[Title]]` links instead of `## 引用来源`
- legacy reference section parsing still works
- organize-lane prompt explicitly mentions `[[...]]` and `[^1]`

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run: `node --test tests/knowledge-note-markdown.test.mjs tests/knowledge-proposal-builders.test.mjs tests/ai/knowledge-organize-lane.test.mjs`

Expected: FAIL because the repository still emits legacy reference sections and the AI prompt does not yet require Obsidian-compatible citations.

- [ ] **Step 3: Implement the minimal helper changes needed to satisfy the tests**

Touch:

- `C:\Users\Even\Documents\ALL-IN-ONE\src\features\knowledge\workspace\knowledgeNoteMarkdown.ts`
- `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\knowledge\executeKnowledgeProposal.ts`
- `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\knowledge\runKnowledgeOrganizeLane.ts`

- [ ] **Step 4: Re-run the targeted tests and verify they pass**

Run: `node --test tests/knowledge-note-markdown.test.mjs tests/knowledge-proposal-builders.test.mjs tests/ai/knowledge-organize-lane.test.mjs`

Expected: PASS

### Task 2: Add a focused Markdown reading component

**Files:**
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\features\knowledge\workspace\KnowledgeMarkdownViewer.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\package.json`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\package-lock.json`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-workspace-ui.test.mjs`

- [ ] **Step 1: Add a failing source-level UI test**

Verify:

- knowledge note workspace imports the new viewer
- a read/code mode state exists
- the source still keeps `GoodNightMarkdownEditor`

- [ ] **Step 2: Run the UI test and verify it fails**

Run: `node --test tests/knowledge-workspace-ui.test.mjs`

Expected: FAIL because the workspace still has editor-only rendering.

- [ ] **Step 3: Add the minimal reading component**

Implement:

- GFM Markdown rendering
- Obsidian `[[...]]` preprocessing
- internal-link click handling via callback
- external links opening normally

- [ ] **Step 4: Re-run the UI test and verify it passes**

Run: `node --test tests/knowledge-workspace-ui.test.mjs`

Expected: PASS

### Task 3: Wire reading/code mode into the knowledge workspace

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\features\knowledge\workspace\KnowledgeNoteWorkspace.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\product\ProductWorkbench.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-note-workspace.test.mjs`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-note-ui-migration.test.mjs`

- [ ] **Step 1: Add failing source checks for read/code mode**

Verify:

- mode toggle copy exists
- reading mode is defaulted on note selection
- ProductWorkbench still passes the editor body and title separately

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run: `node --test tests/knowledge-note-workspace.test.mjs tests/knowledge-note-ui-migration.test.mjs`

Expected: FAIL because the workspace still renders a single editor surface.

- [ ] **Step 3: Implement minimal dual-mode rendering**

Behavior:

- default to `阅读`
- render serialized note markdown in viewer mode
- switch to editor mode for Markdown source editing
- keep current save/delete wiring intact

- [ ] **Step 4: Re-run the targeted tests and verify they pass**

Run: `node --test tests/knowledge-note-workspace.test.mjs tests/knowledge-note-ui-migration.test.mjs`

Expected: PASS

### Task 4: Style the reading surface so it feels like a document, not code

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\App.css`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-workspace-ui.test.mjs`

- [ ] **Step 1: Extend the existing UI test with reading-surface class checks**

Verify CSS/source references for:

- reading surface wrapper
- mode toggle buttons
- article typography blocks
- footnote styling hooks

- [ ] **Step 2: Run the UI test and verify it fails**

Run: `node --test tests/knowledge-workspace-ui.test.mjs`

Expected: FAIL because the new reading-surface classes do not exist yet.

- [ ] **Step 3: Implement the minimal reading styles**

Style:

- headings
- paragraph spacing
- lists
- blockquotes
- tables
- code blocks
- footnotes
- mode toggle chrome

- [ ] **Step 4: Re-run the UI test and verify it passes**

Run: `node --test tests/knowledge-workspace-ui.test.mjs`

Expected: PASS

### Task 5: Verify end-to-end behavior with tests and a production build

**Files:**
- No new files required

- [ ] **Step 1: Run the focused regression suite**

Run: `node --test tests/knowledge-note-markdown.test.mjs tests/knowledge-proposal-builders.test.mjs tests/ai/knowledge-organize-lane.test.mjs tests/knowledge-workspace-ui.test.mjs tests/knowledge-note-workspace.test.mjs tests/knowledge-note-ui-migration.test.mjs`

Expected: PASS

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 3: Fix any compile or test regressions and re-run the same commands**

If either command fails, update only the files directly involved, then repeat the verification commands until both pass.

## Self-Review

Spec coverage:

- Reading/code dual mode is covered by Task 2 and Task 3.
- Obsidian-compatible references and legacy compatibility are covered by Task 1.
- AI prompt enforcement is covered by Task 1.
- Reading typography and interaction polish are covered by Task 4.
- Final verification is covered by Task 5.

Placeholder scan:

- No `TODO`, `TBD`, or deferred pseudo-steps remain.
- Every verification step names an exact command and expected outcome.

Type consistency:

- `KnowledgeMarkdownViewer` is introduced before the workspace integrates it.
- Markdown helper changes land before AI prompt and execution flow rely on the new reference behavior.
