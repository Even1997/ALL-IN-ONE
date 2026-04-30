# AI Chat-First Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current fragmented AI surfaces into one chat-first PM assistant that truthfully routes between built-in AI, local agents, knowledge organization, prototype editing, and manual `变更同步`.

**Architecture:** Keep [AIChat.tsx](/C:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/AIChat.tsx) as the only primary AI entry. Add a thin orchestration layer that resolves intent lane and runtime, reuse the existing workflow package runner as an internal capability, and extend the current `requirementDocs` model with stronger doc typing so wiki docs and page sync docs can coexist safely.

**Tech Stack:** React 19, TypeScript, Zustand, Tauri 2, local Claude/Codex CLI bridge, current `aiService`, Node `--test` source-assertion tests, `npm run build`.

---

## Review Corrections

This plan was revised after an engineering review of the plan itself. The main fixes are:

- Chat-only lanes such as `knowledge-organize` and `change-sync` are no longer mixed into `AIWorkflowPackage`.
- Chat routing tests only prevent auto-navigation into the workflow panel during submit, instead of forbidding the workflow panel from existing anywhere in `AIChat`.
- Prototype sync baseline is no longer reset on every autosave, because that would erase unsynced semantic changes before review.
- The manual `变更同步` button now has a full queue-consume path into `AIChat`, instead of stopping at a store write.
- New AI lanes use guarded JSON extraction instead of raw `JSON.parse(response)`.

---

## File Structure

### Existing files to modify

- `src/types/index.ts`
  Add stable document typing for `wiki-index`, `ai-summary`, `page-sync`, and `flow-sync`, plus semantic prototype action types.
- `src/store/projectStore.ts`
  Add `upsertRequirementDoc`, owner-aware doc lookup helpers, and sync-safe normalization.
- `src/modules/knowledge/knowledgeEntries.ts`
  Preserve doc typing and owner metadata when requirement docs are projected into the knowledge tree.
- `src/modules/ai/workflow/skillRouting.ts`
  Extend explicit token routing to cover `@整理` and `@变更同步`, but keep workflow packages separate from chat-only lanes.
- `src/components/workspace/AIChat.tsx`
  Move submit logic onto the new orchestration layer, keep chat-first UX, consume queued commands, and render inline review cards.
- `src/components/product/ProductWorkbench.tsx`
  Record active page context, expose manual `变更同步`, and keep autosave separate from semantic sync.
- `src/store/previewStore.ts`
  Keep current canvas behavior, but add semantic action logging, unsynced state, and synced baseline snapshots.
- `src/modules/ai/gn-agent/runtime/claude/ClaudeRuntime.ts`
  Stop implying “local runtime” when the class is actually remote-provider execution.
- `src/modules/ai/gn-agent/runtime/codex/CodexRuntime.ts`
  Same truthfulness fix as Claude.

### New files to create

- `src/modules/ai/orchestration/types.ts`
- `src/modules/ai/orchestration/intentRouter.ts`
- `src/modules/ai/orchestration/runtimeRouter.ts`
- `src/modules/ai/orchestration/chatOrchestrator.ts`
- `src/modules/ai/orchestration/extractJSONObject.ts`
- `src/modules/ai/knowledge/runKnowledgeOrganizeLane.ts`
- `src/modules/ai/change-sync/runChangeSyncLane.ts`
- `src/modules/ai/store/aiCommandStore.ts`
- `src/modules/ai/store/aiReviewStore.ts`
- `src/components/workspace/AIInlineReviewCard.tsx`

### Tests to add or update

- `tests/ai/skill-routing.test.mjs`
- `tests/ai/chat-workflow-routing.test.mjs`
- `tests/ai/chat-runtime-registry.test.mjs`
- `tests/ai/local-agent-tabs-ui.test.mjs`
- `tests/ai/knowledge-organize-lane.test.mjs`
- `tests/ai/change-sync-lane.test.mjs`
- `tests/page-canvas-sync.test.mjs`
- `tests/knowledge-entries.test.mjs`
- `tests/project-store.test.mjs`
- `tests/product-workbench.test.mjs`

## Task 1: Strengthen the document model without breaking the current knowledge workspace

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/projectStore.ts`
- Modify: `src/modules/knowledge/knowledgeEntries.ts`
- Test: `tests/knowledge-entries.test.mjs`
- Test: `tests/project-store.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/knowledge-entries.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('knowledge entries keep docType and owner metadata for sync documents', async () => {
  const source = await readFile(new URL('../src/modules/knowledge/knowledgeEntries.ts', import.meta.url), 'utf8');
  assert.match(source, /type KnowledgeEntry = \{/);
  assert.match(source, /docType:/);
  assert.match(source, /ownerPageId:/);
  assert.match(source, /ownerFlowId:/);
});

// tests/project-store.test.mjs
test('project store exposes upsertRequirementDoc and owner lookup for derived docs', async () => {
  const source = await readFile(new URL('../src/store/projectStore.ts', import.meta.url), 'utf8');
  assert.match(source, /upsertRequirementDoc:/);
  assert.match(source, /findRequirementDocByOwner:/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/knowledge-entries.test.mjs tests/project-store.test.mjs`

Expected: FAIL because `docType`, owner metadata, and the new store methods do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/types/index.ts
export type RequirementDocKind = 'note' | 'sketch' | 'spec';
export type RequirementDocType =
  | RequirementDocKind
  | 'wiki-index'
  | 'ai-summary'
  | 'page-sync'
  | 'flow-sync';

export interface RequirementDoc {
  id: string;
  title: string;
  content: string;
  summary: string;
  filePath?: string;
  kind?: RequirementDocKind;
  docType?: RequirementDocType;
  ownerPageId?: string;
  ownerFlowId?: string;
  baselineVersion?: string;
  tags?: string[];
  relatedIds?: string[];
  authorRole: '产品' | 'UI设计' | '开发' | '测试' | '运维';
  sourceType?: 'manual' | 'upload' | 'ai';
  updatedAt: string;
  status: 'draft' | 'ready';
}
```

```ts
// src/store/projectStore.ts
type RequirementDocOwnerLookup = {
  docType: RequirementDocType;
  ownerPageId?: string;
  ownerFlowId?: string;
};

interface ProjectState {
  upsertRequirementDoc: (doc: RequirementDoc) => void;
  findRequirementDocByOwner: (input: RequirementDocOwnerLookup) => RequirementDoc | null;
}

upsertRequirementDoc: (doc) =>
  set((state) => ({
    requirementDocs: [doc, ...state.requirementDocs.filter((item) => item.id !== doc.id)],
  })),

findRequirementDocByOwner: ({ docType, ownerPageId, ownerFlowId }) => {
  const state = get();
  return (
    state.requirementDocs.find((doc) =>
      doc.docType === docType &&
      (ownerPageId ? doc.ownerPageId === ownerPageId : true) &&
      (ownerFlowId ? doc.ownerFlowId === ownerFlowId : true)
    ) || null
  );
},
```

```ts
// src/modules/knowledge/knowledgeEntries.ts
export type KnowledgeEntry = {
  id: string;
  title: string;
  summary: string;
  content: string;
  type: 'markdown' | 'html';
  source: 'requirement' | 'generated';
  filePath?: string;
  updatedAt: string;
  status: 'draft' | 'ready';
  kind?: RequirementDoc['kind'];
  docType?: RequirementDoc['docType'];
  ownerPageId?: string;
  ownerFlowId?: string;
  tags: string[];
  relatedIds: string[];
  sourceRequirementId?: string;
};
```

- [ ] **Step 4: Run verification**

Run: `node --test tests/knowledge-entries.test.mjs tests/project-store.test.mjs`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/store/projectStore.ts src/modules/knowledge/knowledgeEntries.ts tests/knowledge-entries.test.mjs tests/project-store.test.mjs
git commit -m "feat: add typed knowledge docs for ai sync lanes"
```

## Task 2: Add one orchestration layer for explicit tokens and natural-language intent routing

**Files:**
- Create: `src/modules/ai/orchestration/types.ts`
- Create: `src/modules/ai/orchestration/intentRouter.ts`
- Create: `src/modules/ai/orchestration/runtimeRouter.ts`
- Create: `src/modules/ai/orchestration/chatOrchestrator.ts`
- Modify: `src/modules/ai/workflow/skillRouting.ts`
- Test: `tests/ai/skill-routing.test.mjs`
- Test: `tests/ai/chat-workflow-routing.test.mjs`
- Test: `tests/ai/chat-runtime-registry.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/ai/skill-routing.test.mjs
test('resolveSkillIntent detects @整理 as knowledge organize', () => {
  const result = resolveSkillIntent('@整理 帮我整理当前知识库');
  assert.equal(result?.token, '@整理');
  assert.equal(result?.package, 'knowledge-organize');
});

test('resolveSkillIntent detects @变更同步 as change sync', () => {
  const result = resolveSkillIntent('@变更同步 同步当前页面');
  assert.equal(result?.token, '@变更同步');
  assert.equal(result?.package, 'change-sync');
});

// tests/ai/chat-workflow-routing.test.mjs
test('chat submit path resolves orchestration before dispatching any lane', async () => {
  const source = await readFile(chatPath, 'utf8');
  assert.match(source, /resolveChatOrchestration/);
  assert.match(source, /intent\.lane/);
  assert.doesNotMatch(source, /setActivePanel\('workflow'\)\s*;\s*await runAIWorkflowPackage/s);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ai/skill-routing.test.mjs tests/ai/chat-workflow-routing.test.mjs tests/ai/chat-runtime-registry.test.mjs`

Expected: FAIL because the new chat-only packages and orchestration files do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/modules/ai/workflow/skillRouting.ts
export type ChatSkillPackage =
  | 'requirements'
  | 'prototype'
  | 'page'
  | 'knowledge-organize'
  | 'change-sync';

export type SkillIntent = {
  package: ChatSkillPackage;
  skill: 'requirements' | 'sketch' | 'ui-design' | 'knowledge-organize' | 'change-sync';
  cleanedInput: string;
  token: '@需求' | '@草图' | '@UI' | '@整理' | '@变更同步';
};
```

```ts
// src/modules/ai/orchestration/types.ts
export type AIIntentLane =
  | 'direct-chat'
  | 'workflow-requirements'
  | 'workflow-prototype'
  | 'workflow-page'
  | 'knowledge-organize'
  | 'change-sync';

export type AIRuntimeTarget =
  | { mode: 'built-in-remote'; agent: 'built-in'; label: string }
  | { mode: 'local-agent'; agent: 'claude' | 'codex'; label: string; fallbackMessage?: string | null };

export type AIIntentResolution = {
  lane: AIIntentLane;
  token: string | null;
  cleanedInput: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'token' | 'heuristic' | 'default';
  requiresConfirmation: boolean;
};
```

```ts
// src/modules/ai/orchestration/intentRouter.ts
export const resolveIntentLane = (input: string): AIIntentResolution => {
  const explicit = resolveSkillIntent(input);
  if (explicit?.package === 'knowledge-organize') {
    return { lane: 'knowledge-organize', token: explicit.token, cleanedInput: explicit.cleanedInput, confidence: 'high', source: 'token', requiresConfirmation: false };
  }
  if (explicit?.package === 'change-sync') {
    return { lane: 'change-sync', token: explicit.token, cleanedInput: explicit.cleanedInput, confidence: 'high', source: 'token', requiresConfirmation: false };
  }
  if (explicit?.package === 'requirements') {
    return { lane: 'workflow-requirements', token: explicit.token, cleanedInput: explicit.cleanedInput, confidence: 'high', source: 'token', requiresConfirmation: false };
  }
  if (explicit?.package === 'prototype') {
    return { lane: 'workflow-prototype', token: explicit.token, cleanedInput: explicit.cleanedInput, confidence: 'high', source: 'token', requiresConfirmation: false };
  }
  if (explicit?.package === 'page') {
    return { lane: 'workflow-page', token: explicit.token, cleanedInput: explicit.cleanedInput, confidence: 'high', source: 'token', requiresConfirmation: false };
  }
  if (/(整理|归档|索引|wiki|知识库)/i.test(input)) {
    return { lane: 'knowledge-organize', token: null, cleanedInput: input.trim(), confidence: 'medium', source: 'heuristic', requiresConfirmation: false };
  }
  if (/(变更同步|同步到文档|根据草图更新文档|校准当前页面)/i.test(input)) {
    return { lane: 'change-sync', token: null, cleanedInput: input.trim(), confidence: 'medium', source: 'heuristic', requiresConfirmation: false };
  }
  return { lane: 'direct-chat', token: null, cleanedInput: input.trim(), confidence: 'low', source: 'default', requiresConfirmation: false };
};
```

- [ ] **Step 4: Run verification**

Run: `node --test tests/ai/skill-routing.test.mjs tests/ai/chat-workflow-routing.test.mjs tests/ai/chat-runtime-registry.test.mjs`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/ai/orchestration src/modules/ai/workflow/skillRouting.ts tests/ai/skill-routing.test.mjs tests/ai/chat-workflow-routing.test.mjs tests/ai/chat-runtime-registry.test.mjs
git commit -m "feat: add chat orchestration and intent routing"
```

## Task 3: Rewire AI chat to the orchestration layer and keep runtime semantics truthful

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/modules/ai/gn-agent/runtime/claude/ClaudeRuntime.ts`
- Modify: `src/modules/ai/gn-agent/runtime/codex/CodexRuntime.ts`
- Test: `tests/ai/chat-workflow-routing.test.mjs`
- Test: `tests/ai/local-agent-tabs-ui.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/ai/chat-workflow-routing.test.mjs
test('chat stays in the chat panel while dispatching workflow lanes internally', async () => {
  const source = await readFile(chatPath, 'utf8');
  assert.match(source, /resolveChatOrchestration/);
  assert.doesNotMatch(source, /setActivePanel\('workflow'\)\s*;\s*await runAIWorkflowPackage/s);
  assert.match(source, /runAIWorkflowPackage/);
});

// tests/ai/local-agent-tabs-ui.test.mjs
test('chat still calls run_local_agent_prompt when runtime target is local-agent', async () => {
  const source = await readFile(chatPath, 'utf8');
  assert.match(source, /runtimeTarget\.mode === 'local-agent'/);
  assert.match(source, /invoke<LocalAgentCommandResult>\('run_local_agent_prompt'/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ai/chat-workflow-routing.test.mjs tests/ai/local-agent-tabs-ui.test.mjs`

Expected: FAIL because `AIChat` still branches directly on `skillIntent` and still switches into the workflow panel inside submit.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/components/workspace/AIChat.tsx
const orchestration = resolveChatOrchestration({
  input: rawContent,
  selectedChatAgentId,
  workflowAvailability,
  agentAvailability,
});

const { intent, runtimeTarget } = orchestration;
const cleanedContent = intent.cleanedInput || rawContent;

if (intent.lane === 'workflow-requirements') {
  setRawRequirementInput(cleanedContent);
  await runAIWorkflowPackage('requirements');
  return;
}

if (intent.lane === 'workflow-prototype') {
  await runAIWorkflowPackage('prototype');
  return;
}

if (intent.lane === 'workflow-page') {
  await runAIWorkflowPackage('page');
  return;
}

if (runtimeTarget.mode === 'local-agent') {
  const result = await invoke<LocalAgentCommandResult>('run_local_agent_prompt', {
    params: { agent: runtimeTarget.agent, projectRoot, prompt: localAgentPrompt },
  });
} else {
  const finalContent = await aiService.completeText({
    systemPrompt: directChat.systemPrompt,
    prompt: directChat.prompt,
  });
}
```

```ts
// src/modules/ai/gn-agent/runtime/claude/ClaudeRuntime.ts
summary: 'Claude provider runtime 将使用应用内 Anthropic 配置',
```

```ts
// src/modules/ai/gn-agent/runtime/codex/CodexRuntime.ts
summary: 'Codex provider runtime 将使用应用内 OpenAI Compatible 配置',
```

- [ ] **Step 4: Run verification**

Run: `node --test tests/ai/chat-workflow-routing.test.mjs tests/ai/local-agent-tabs-ui.test.mjs`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/workspace/AIChat.tsx src/modules/ai/gn-agent/runtime/claude/ClaudeRuntime.ts src/modules/ai/gn-agent/runtime/codex/CodexRuntime.ts tests/ai/chat-workflow-routing.test.mjs tests/ai/local-agent-tabs-ui.test.mjs
git commit -m "refactor: route ai chat through unified orchestration"
```

## Task 4: Turn `@整理` into a real knowledge-organization lane instead of an index refresh

**Files:**
- Create: `src/modules/ai/orchestration/extractJSONObject.ts`
- Create: `src/modules/ai/knowledge/runKnowledgeOrganizeLane.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/store/projectStore.ts`
- Test: `tests/ai/knowledge-organize-lane.test.mjs`
- Test: `tests/ai/skill-routing.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/ai/knowledge-organize-lane.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('knowledge organize lane writes derived wiki docs instead of only rebuilding index', async () => {
  const source = await readFile(new URL('../../src/modules/ai/knowledge/runKnowledgeOrganizeLane.ts', import.meta.url), 'utf8');
  assert.match(source, /wiki-index/);
  assert.match(source, /项目总览/);
  assert.match(source, /功能清单/);
  assert.match(source, /页面清单/);
  assert.match(source, /extractJSONObject/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ai/knowledge-organize-lane.test.mjs tests/ai/skill-routing.test.mjs`

Expected: FAIL because the lane file does not exist and `@整理` only refreshes the context index.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/modules/ai/orchestration/extractJSONObject.ts
export const extractJSONObject = (value: string) => {
  const fencedMatch = value.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectStart = value.indexOf('{');
  const arrayStart = value.indexOf('[');
  const start = arrayStart === -1 ? objectStart : objectStart === -1 ? arrayStart : Math.min(arrayStart, objectStart);
  return start === -1 ? '' : value.slice(start).trim();
};
```

```ts
// src/modules/ai/knowledge/runKnowledgeOrganizeLane.ts
const DERIVED_DOC_SPECS = [
  { slug: 'project-overview', title: '项目总览.md', docType: 'wiki-index' as const },
  { slug: 'feature-inventory', title: '功能清单.md', docType: 'wiki-index' as const },
  { slug: 'page-inventory', title: '页面清单.md', docType: 'wiki-index' as const },
  { slug: 'terminology', title: '术语表.md', docType: 'ai-summary' as const },
  { slug: 'open-questions', title: '待确认问题.md', docType: 'ai-summary' as const },
];

export const runKnowledgeOrganizeLane = async ({ project, requirementDocs, generatedFiles, executeText }) => {
  const response = await executeText({
    systemPrompt: '你是产品知识库整理助手。只返回 JSON。',
    prompt: JSON.stringify({
      projectName: project.name,
      docs: requirementDocs.map((doc) => ({ title: doc.title, summary: doc.summary, content: doc.content })),
      generatedFiles: generatedFiles.map((file) => ({ path: file.path, summary: file.summary })),
    }),
  });

  const payloadText = extractJSONObject(response);
  if (!payloadText) {
    throw new Error('Knowledge organize lane did not receive valid JSON.');
  }

  const parsed = JSON.parse(payloadText);
  return DERIVED_DOC_SPECS.map((spec) => ({
    id: `ai-${spec.slug}`,
    title: spec.title,
    docType: spec.docType,
    kind: 'note' as const,
    authorRole: '产品' as const,
    sourceType: 'ai' as const,
    status: 'ready' as const,
    updatedAt: new Date().toISOString(),
    summary: parsed[spec.slug]?.summary || '',
    content: parsed[spec.slug]?.content || '',
    relatedIds: [],
    tags: ['knowledge-organize'],
  }));
};
```

```ts
// src/components/workspace/AIChat.tsx
if (intent.lane === 'knowledge-organize') {
  const docs = await runKnowledgeOrganizeLane({
    project: currentProject,
    requirementDocs,
    generatedFiles,
    executeText: ({ systemPrompt, prompt }) => aiService.completeText({ systemPrompt, prompt }),
  });

  docs.forEach((doc) => upsertRequirementDoc(doc));
  updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
    ...message,
    content: `已整理知识库，并生成 ${docs.map((doc) => `\`${doc.title}\``).join('、')}。`,
  }));
  return;
}
```

- [ ] **Step 4: Run verification**

Run: `node --test tests/ai/knowledge-organize-lane.test.mjs tests/ai/skill-routing.test.mjs`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/ai/orchestration/extractJSONObject.ts src/modules/ai/knowledge/runKnowledgeOrganizeLane.ts src/components/workspace/AIChat.tsx src/store/projectStore.ts tests/ai/knowledge-organize-lane.test.mjs tests/ai/skill-routing.test.mjs
git commit -m "feat: add ai knowledge organize lane"
```

## Task 5: Make prototype edits semantically visible without changing the current autosave loop

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/previewStore.ts`
- Modify: `src/components/product/ProductWorkbench.tsx`
- Test: `tests/page-canvas-sync.test.mjs`
- Test: `tests/product-workbench.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/page-canvas-sync.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('preview store tracks semantic wireframe actions separately from autosave dirty state', async () => {
  const source = await readFile(new URL('../src/store/previewStore.ts', import.meta.url), 'utf8');
  assert.match(source, /semanticActionLogByPageId/);
  assert.match(source, /markPageHydrated/);
  assert.match(source, /markPageSynced/);
  assert.match(source, /recordSemanticAction/);
  assert.match(source, /activePageId/);
});

// tests/product-workbench.test.mjs
test('wireframe sync bridge hydrates page baseline on page load but does not reset it on autosave', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');
  assert.match(source, /markPageHydrated/);
  assert.match(source, /setActivePreviewPageId/);
  assert.doesNotMatch(source, /markPageHydrated\(selectedPage\.id,\s*currentWireframe\?\.elements \|\| \[\]\);\s*}, \[selectedPage, currentWireframe/s);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/page-canvas-sync.test.mjs tests/product-workbench.test.mjs`

Expected: FAIL because `previewStore` only knows `isDirty` and `pendingChanges`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/types/index.ts
export type PrototypeSemanticActionType =
  | 'module_added'
  | 'module_deleted'
  | 'module_renamed'
  | 'module_reordered'
  | 'module_content_changed';

export interface PrototypeSemanticAction {
  id: string;
  pageId: string;
  type: PrototypeSemanticActionType;
  targetId: string;
  targetLabel: string;
  before?: string;
  after?: string;
  createdAt: string;
}
```

```ts
// src/store/previewStore.ts
semanticActionLogByPageId: {},
syncedBaselineByPageId: {},
activePageId: null,

markPageHydrated: (pageId, elements) =>
  set((state) => ({
    activePageId: pageId,
    syncedBaselineByPageId: { ...state.syncedBaselineByPageId, [pageId]: elements },
    semanticActionLogByPageId: { ...state.semanticActionLogByPageId, [pageId]: state.semanticActionLogByPageId[pageId] || [] },
  })),

markPageSynced: (pageId, elements) =>
  set((state) => ({
    syncedBaselineByPageId: { ...state.syncedBaselineByPageId, [pageId]: elements },
    semanticActionLogByPageId: { ...state.semanticActionLogByPageId, [pageId]: [] },
  })),

recordSemanticAction: (action) =>
  set((state) => ({
    semanticActionLogByPageId: {
      ...state.semanticActionLogByPageId,
      [action.pageId]: [...(state.semanticActionLogByPageId[action.pageId] || []), action],
    },
  })),
```

```ts
// src/store/previewStore.ts
const buildSemanticAction = ({
  pageId,
  type,
  targetId,
  targetLabel,
  before,
  after,
}: {
  pageId: string;
  type: PrototypeSemanticActionType;
  targetId: string;
  targetLabel: string;
  before?: string;
  after?: string;
}): PrototypeSemanticAction => ({
  id: `semantic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  pageId,
  type,
  targetId,
  targetLabel,
  before,
  after,
  createdAt: new Date().toISOString(),
});

// call buildSemanticAction from addElement / updateElement / deleteElement / reorderElements
// only when the semantic meaning changes:
// - add/delete
// - name change
// - content change
// - reorder
// ignore x/y/width/height-only edits
```

```ts
// src/components/product/ProductWorkbench.tsx
const markPageHydrated = usePreviewStore((state) => state.markPageHydrated);
const setActivePreviewPageId = usePreviewStore((state) => state.setActivePageId);

useEffect(() => {
  if (!selectedPage) {
    return;
  }
  setActivePreviewPageId(selectedPage.id);
}, [selectedPage?.id, setActivePreviewPageId]);

useEffect(() => {
  if (!selectedPage) {
    return;
  }
  markPageHydrated(selectedPage.id, currentWireframe?.elements || []);
}, [selectedPage?.id, markPageHydrated]);
```

- [ ] **Step 4: Run verification**

Run: `node --test tests/page-canvas-sync.test.mjs tests/product-workbench.test.mjs`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/store/previewStore.ts src/components/product/ProductWorkbench.tsx tests/page-canvas-sync.test.mjs tests/product-workbench.test.mjs
git commit -m "feat: capture semantic prototype changes for sync"
```

## Task 6: Ship page-level `变更同步` with itemized review in normal chat

**Files:**
- Create: `src/modules/ai/change-sync/runChangeSyncLane.ts`
- Create: `src/modules/ai/store/aiCommandStore.ts`
- Create: `src/modules/ai/store/aiReviewStore.ts`
- Create: `src/components/workspace/AIInlineReviewCard.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/store/projectStore.ts`
- Modify: `src/store/previewStore.ts`
- Test: `tests/ai/change-sync-lane.test.mjs`
- Test: `tests/product-workbench.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
// tests/ai/change-sync-lane.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('change sync lane builds itemized proposals and writes page-sync docs', async () => {
  const source = await readFile(new URL('../../src/modules/ai/change-sync/runChangeSyncLane.ts', import.meta.url), 'utf8');
  assert.match(source, /page-sync/);
  assert.match(source, /conflict/);
  assert.match(source, /items:/);
  assert.match(source, /extractJSONObject/);
});

test('ai chat consumes queued sync commands from the product workbench', async () => {
  const source = await readFile(new URL('../../src/components/workspace/AIChat.tsx', import.meta.url), 'utf8');
  assert.match(source, /consumeCommand/);
  assert.match(source, /autoSubmit/);
});

// tests/product-workbench.test.mjs
test('product workbench exposes manual 变更同步 through the command queue', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');
  assert.match(source, /变更同步/);
  assert.match(source, /queueCommand/);
  assert.match(source, /text:\s*'@变更同步 同步当前页面'/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/ai/change-sync-lane.test.mjs tests/product-workbench.test.mjs`

Expected: FAIL because there is no sync lane, no review store, and no queued-command consume path.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/modules/ai/store/aiCommandStore.ts
export type QueuedAICommand = {
  projectId: string;
  text: string;
  autoSubmit: boolean;
};

export const useAICommandStore = create<{
  queuedByProjectId: Record<string, QueuedAICommand | null>;
  queueCommand: (command: QueuedAICommand) => void;
  consumeCommand: (projectId: string) => QueuedAICommand | null;
}>((set, get) => ({
  queuedByProjectId: {},
  queueCommand: (command) =>
    set((state) => ({
      queuedByProjectId: { ...state.queuedByProjectId, [command.projectId]: command },
    })),
  consumeCommand: (projectId) => {
    const command = get().queuedByProjectId[projectId] || null;
    set((state) => ({
      queuedByProjectId: { ...state.queuedByProjectId, [projectId]: null },
    }));
    return command;
  },
}));
```

```ts
// src/modules/ai/change-sync/runChangeSyncLane.ts
export const runChangeSyncLane = async ({ project, page, wireframe, semanticActions, existingPageDoc, executeText }) => {
  const response = await executeText({
    systemPrompt: '你是产品变更同步助手。只返回 JSON。',
    prompt: JSON.stringify({
      projectName: project.name,
      page: { id: page.id, name: page.name, route: page.metadata.route },
      semanticActions,
      existingPageDoc: existingPageDoc ? { title: existingPageDoc.title, content: existingPageDoc.content } : null,
      wireframeSummary: wireframe.elements.map((element) => ({ id: element.id, type: element.type, props: element.props })),
    }),
  });

  const payloadText = extractJSONObject(response);
  if (!payloadText) {
    throw new Error('Change sync lane did not receive valid JSON.');
  }

  const parsed = JSON.parse(payloadText);
  return {
    proposal: parsed,
    nextDoc: {
      id: existingPageDoc?.id || `page-sync-${page.id}`,
      title: `${page.name} 页面说明.md`,
      kind: 'spec',
      docType: 'page-sync',
      ownerPageId: page.id,
      baselineVersion: String(Date.now()),
      sourceType: 'ai',
      authorRole: '产品',
      status: 'ready',
      updatedAt: new Date().toISOString(),
      summary: parsed.summary,
      content: parsed.document,
      tags: ['page-sync'],
      relatedIds: [],
    },
  };
};
```

```tsx
// src/components/product/ProductWorkbench.tsx
<button
  className="doc-action-btn secondary"
  type="button"
  onClick={() =>
    queueCommand({
      projectId: currentProject.id,
      text: '@变更同步 同步当前页面',
      autoSubmit: true,
    })
  }
>
  变更同步
</button>
```

```tsx
// src/components/workspace/AIChat.tsx
const consumeCommand = useAICommandStore((state) => state.consumeCommand);

useEffect(() => {
  if (!currentProject) {
    return;
  }

  const queued = consumeCommand(currentProject.id);
  if (!queued?.autoSubmit) {
    return;
  }

  setInput(queued.text);
  void Promise.resolve().then(() => {
    void handleSubmit();
  });
}, [consumeCommand, currentProject, handleSubmit]);
```

```tsx
// src/components/workspace/AIChat.tsx
if (intent.lane === 'change-sync') {
  const result = await runChangeSyncLane({
    project: currentProject,
    page: selectedPage,
    wireframe: currentWireframe,
    semanticActions: semanticActionLogByPageId[selectedPage.id] || [],
    existingPageDoc: findRequirementDocByOwner({ docType: 'page-sync', ownerPageId: selectedPage.id }),
    executeText: ({ systemPrompt, prompt }) => aiService.completeText({ systemPrompt, prompt }),
  });

  setPendingReview(currentProject.id, result.proposal, result.nextDoc);
  updateMessage(currentProject.id, targetSessionId, assistantMessage.id, (message) => ({
    ...message,
    content: `已整理出 ${result.proposal.items.length} 条变更，请逐条确认。`,
  }));
  return;
}
```

```tsx
// src/components/workspace/AIChat.tsx
{activePanel === 'chat' && pendingReview ? (
  <AIInlineReviewCard
    review={pendingReview}
    onApproveItem={handleApproveReviewItem}
    onRejectItem={handleRejectReviewItem}
    onApplyAll={handleApplyReviewResult}
  />
) : null}
```

- [ ] **Step 4: Run verification**

Run: `node --test tests/ai/change-sync-lane.test.mjs tests/product-workbench.test.mjs`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/ai/change-sync/runChangeSyncLane.ts src/modules/ai/store/aiCommandStore.ts src/modules/ai/store/aiReviewStore.ts src/components/workspace/AIInlineReviewCard.tsx src/components/workspace/AIChat.tsx src/components/product/ProductWorkbench.tsx src/store/projectStore.ts src/store/previewStore.ts tests/ai/change-sync-lane.test.mjs tests/product-workbench.test.mjs
git commit -m "feat: add page-level change sync inside ai chat"
```

## Release Checkpoint

- [ ] Run: `node --test tests/ai/*.test.mjs tests/*.test.mjs`
  Expected: PASS
- [ ] Run: `npm run build`
  Expected: PASS
- [ ] Smoke check in app:
  1. Built-in AI normal chat still works.
  2. Local Claude and Codex still call `run_local_agent_prompt`.
  3. `@整理` creates derived wiki docs in the knowledge tree.
  4. Editing a page wireframe creates unsynced semantic actions.
  5. Clicking `变更同步` opens an itemized chat review instead of navigating to a workflow page.
  6. Confirming the proposal creates or updates one `page-sync` doc for the current page.

## Scope Guardrails

- Keep V1 to single-page sync.
- Do not auto-push manual markdown edits back into prototypes.
- Do not restore a first-class workflow page as the primary AI entry.
- Do not make `@整理` overwrite user-authored documents in place.
- Do not record pure move/resize operations as semantic requirement changes.

## Self-Review

### Spec coverage

- Chat-first AI only: covered by Task 2 and Task 3.
- Natural language first, `@skill` as precision control: covered by Task 2.
- `@整理` becomes real knowledge organization: covered by Task 4.
- Prototype edits become AI-readable: covered by Task 5.
- Manual `变更同步` with itemized confirmation: covered by Task 6.
- No separate workflow page as product surface: covered by Task 3 and Task 6.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” markers remain.
- Every task has exact files, tests, commands, and target code blocks.

### Type consistency

- `RequirementDoc.docType` is introduced in Task 1 and reused consistently in Task 4 and Task 6.
- `ChatSkillPackage` is introduced in Task 2 so chat-only lanes do not pollute `AIWorkflowPackage`.
- `AIIntentLane` is introduced in Task 2 and reused consistently in Task 3, Task 4, and Task 6.
- `PrototypeSemanticAction` is introduced in Task 5 and consumed in Task 6.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-ai-chat-first-unification-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
