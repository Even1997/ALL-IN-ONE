# Knowledge Base AI Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current requirement-first product tab into a knowledge-base-first workspace with explicit `@skill` routing and sketch-to-design derivation metadata.

**Architecture:** Reuse the current product workbench, AI shell, and workflow engine. Add lightweight knowledge metadata and context selection in the project store, upgrade the product UI to show both markdown and generated HTML assets, and extend AI prompt construction to include the selected source file plus related files.

**Tech Stack:** React 19, TypeScript, Zustand, Tauri, node:test

---

### Task 1: Add failing tests for skill routing and knowledge context helpers

**Files:**
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\skill-routing.test.mjs`
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\knowledge-context.test.mjs`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\skill-routing.test.mjs`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\knowledge-context.test.mjs`

- [ ] **Step 1: Write the failing tests**

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSkillIntent } from '../../src/modules/ai/workflow/skillRouting.ts';

test('resolveSkillIntent detects @UI设计 and strips the skill token', () => {
  const result = resolveSkillIntent('@UI设计 根据当前草图生成设计');
  assert.equal(result.package, 'page');
  assert.equal(result.skill, 'ui-design');
  assert.equal(result.cleanedInput, '根据当前草图生成设计');
});
```

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildKnowledgeContextSections } from '../../src/modules/knowledge/knowledgeContext.ts';

test('buildKnowledgeContextSections includes current file before related files', () => {
  const sections = buildKnowledgeContextSections({
    currentFile: { title: '草图.md', type: 'markdown', summary: '首页草图', content: '# 首页' },
    relatedFiles: [{ title: '风格说明.md', type: 'markdown', summary: '视觉方向', content: '卡片更轻' }],
  });

  assert.match(sections, /current_file/);
  assert.match(sections, /related_files/);
  assert.ok(sections.indexOf('草图.md') < sections.indexOf('风格说明.md'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/ai/skill-routing.test.mjs tests/ai/knowledge-context.test.mjs`

Expected: FAIL because `skillRouting.ts` and `knowledgeContext.ts` do not exist yet.

- [ ] **Step 3: Write minimal helper implementations**

Create `src/modules/ai/workflow/skillRouting.ts` and `src/modules/knowledge/knowledgeContext.ts` with the exported functions used by the tests.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/ai/skill-routing.test.mjs tests/ai/knowledge-context.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/skill-routing.test.mjs tests/ai/knowledge-context.test.mjs src/modules/ai/workflow/skillRouting.ts src/modules/knowledge/knowledgeContext.ts
git commit -m "test: add knowledge skill routing helpers"
```

### Task 2: Add lightweight knowledge metadata and active context to the project store

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\types\index.ts`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\store\projectStore.ts`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\knowledge-context.test.mjs`

- [ ] **Step 1: Extend the types with minimal knowledge metadata**

Add optional metadata to requirement docs and generated files:

```ts
kind?: 'note' | 'sketch' | 'spec';
tags?: string[];
relatedIds?: string[];
```

```ts
sourceRequirementId?: string;
relatedRequirementIds?: string[];
```

- [ ] **Step 2: Add active knowledge selection to the store**

Add state and actions for:

```ts
activeKnowledgeFileId: string | null;
selectedKnowledgeContextIds: string[];
setActiveKnowledgeFileId: (id: string | null) => void;
setSelectedKnowledgeContextIds: (ids: string[]) => void;
toggleKnowledgeContextId: (id: string) => void;
```

- [ ] **Step 3: Normalize persisted metadata**

Update the existing normalizers so persisted data keeps working even when the new fields are missing.

- [ ] **Step 4: Run tests**

Run: `node --test tests/ai/knowledge-context.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/store/projectStore.ts tests/ai/knowledge-context.test.mjs
git commit -m "feat: add lightweight knowledge metadata"
```

### Task 3: Upgrade ProductWorkbench from requirement view to knowledge-base view

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\product\ProductWorkbench.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\App.css`

- [ ] **Step 1: Replace requirement-only list with a knowledge list**

Show:

- markdown docs from `requirementDocs`
- generated html design assets from `generatedFiles`

Keep the page tab unchanged.

- [ ] **Step 2: Add context controls in the knowledge UI**

For the selected markdown entry add:

- set as active source
- include/remove from AI context
- quick action to switch to page tab for design

- [ ] **Step 3: Add HTML knowledge preview**

Render generated HTML assets in a preview panel using `iframe srcDoc`.

- [ ] **Step 4: Update labels**

Rename visible strings from requirement language to knowledge-base language where they map to the same area.

- [ ] **Step 5: Run build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/product/ProductWorkbench.tsx src/App.css
git commit -m "feat: upgrade product workspace into knowledge base"
```

### Task 4: Teach AI entry and workflow prompts about `@skills` and selected knowledge context

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\workflow\AIWorkflowService.ts`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\workflow\statusSummary.ts`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\workflow\chatWorkflowRouting.ts`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\skill-routing.test.mjs`

- [ ] **Step 1: Use the skill routing helper in AIChat**

Support:

- `@整理知识`
- `@草图`
- `@UI设计`

and route them to the correct package without forcing the raw input to be the only context.

- [ ] **Step 2: Inject selected knowledge context into workflow prompts**

Read:

- active source file
- selected context files

and add them to prompt construction in `AIWorkflowService.ts`.

- [ ] **Step 3: Include context summary in status cards**

Show the selected source and context count in the AI status rail.

- [ ] **Step 4: Run tests**

Run: `node --test tests/ai/skill-routing.test.mjs`

Expected: PASS

- [ ] **Step 5: Run build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/workspace/AIChat.tsx src/modules/ai/workflow/AIWorkflowService.ts src/modules/ai/workflow/statusSummary.ts src/modules/ai/workflow/chatWorkflowRouting.ts tests/ai/skill-routing.test.mjs
git commit -m "feat: add skill routing and knowledge-aware AI context"
```

### Task 5: Record one-way sketch-to-design derivation on generated HTML assets

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\workflow\AIWorkflowService.ts`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\product\ProductWorkbench.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\store\projectStore.ts`

- [ ] **Step 1: Attach the active markdown source to generated HTML files**

When HTML prototype files are created, populate:

```ts
sourceRequirementId: activeKnowledgeFileId
```

only if the active file is a markdown knowledge item.

- [ ] **Step 2: Surface derivation in the knowledge base UI**

Show “derived from” metadata for generated HTML assets and show related HTML derivatives on the source markdown item.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/modules/ai/workflow/AIWorkflowService.ts src/components/product/ProductWorkbench.tsx src/store/projectStore.ts
git commit -m "feat: record sketch to design derivation metadata"
```

## Self-Review

Spec coverage:

- Knowledge-base-first workspace is covered by Task 3.
- Explicit `@skills` are covered by Tasks 1 and 4.
- Selected current file plus related files are covered by Tasks 2 and 4.
- Sketch-to-design derivation is covered by Task 5.

Placeholder scan:

- No `TODO` or `TBD` placeholders remain.

Type consistency:

- The plan uses `activeKnowledgeFileId` and `selectedKnowledgeContextIds` consistently.

Plan complete and saved to `docs/superpowers/plans/2026-04-24-knowledge-base-ai-skills-implementation.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
