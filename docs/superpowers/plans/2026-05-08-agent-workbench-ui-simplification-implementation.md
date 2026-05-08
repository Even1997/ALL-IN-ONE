# Agent Workbench UI Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the Agent workbench so the left side only keeps `新对话 / 搜索 / 技能`, recent conversations become the main body, search and skills open in dialogs, and the right inspector only keeps `审查 / 文件 / 记忆`.

**Architecture:** Keep the existing three-column workbench shell and runtime session wiring. Remove low-value sidebar modes, reuse the existing thread/session actions for direct thread creation, and move search/skills into lightweight dialogs driven by page-level state. Keep changes scoped to the agent-shell UI components and existing project knowledge utilities.

**Tech Stack:** React 19, TypeScript, Radix Dialog, Zustand, existing Agent workbench CSS, Node `--test` string-assertion tests.

---

### Task 1: Lock the simplification behavior with failing tests

**Files:**
- Create: `tests/ai/agent-workbench-ui-simplification.test.mjs`
- Verify: `node --test tests/ai/agent-workbench-ui-simplification.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sidebarPath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentWorkbenchSidebar.tsx');
const inspectorPath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentWorkbenchInspector.tsx');
const pagePath = path.resolve(__dirname, '../../src/features/agent-shell/pages/AgentShellPage.tsx');
const stagePath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentChatStage.tsx');
const cssPath = path.resolve(__dirname, '../../src/features/agent-shell/components/agentWorkbench.css');

test('agent workbench sidebar removes redundant first-level destinations and keeps recent conversations as the body', async () => {
  const source = await readFile(sidebarPath, 'utf8');

  assert.match(source, /label:\s*'新对话'/);
  assert.match(source, /label:\s*'搜索'/);
  assert.match(source, /label:\s*'技能'/);
  assert.doesNotMatch(source, /label:\s*'插件'/);
  assert.doesNotMatch(source, /label:\s*'自动化'/);
  assert.doesNotMatch(source, /label:\s*'设置'/);
  assert.doesNotMatch(source, /agent-sidebar-hero-card/);
  assert.doesNotMatch(source, /agent-sidebar-actions-grid/);
  assert.match(source, /最近对话/);
});

test('agent workbench page opens search and skills in dialogs instead of sidebar pages', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /MacDialog/);
  assert.match(source, /isSearchDialogOpen/);
  assert.match(source, /isSkillsDialogOpen/);
  assert.doesNotMatch(source, /sidebarMode/);
});

test('agent workbench inspector only keeps review, files, and memory tabs', async () => {
  const source = await readFile(inspectorPath, 'utf8');

  assert.match(source, /'review', 'files', 'memory'/);
  assert.doesNotMatch(source, /'tools'/);
  assert.doesNotMatch(source, /'context'/);
});

test('agent workbench stage removes redundant connection-state pill and keeps only core status signals', async () => {
  const source = await readFile(stagePath, 'utf8');

  assert.doesNotMatch(source, /connectionState/);
  assert.match(source, /pendingApprovalCount/);
});

test('agent workbench rail styles shrink the navigation footprint', async () => {
  const css = await readFile(cssPath, 'utf8');

  assert.match(css, /grid-template-columns:\s*72px 300px;/);
  assert.match(css, /width:\s*34px;\s*[\s\S]*height:\s*34px;/);
  assert.match(css, /width:\s*16px;\s*[\s\S]*height:\s*16px;/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/agent-workbench-ui-simplification.test.mjs`
Expected: FAIL because sidebar still exposes removed modes, page still uses sidebar mode state, inspector still contains `tools/context`, and stage still renders the connection-state pill.

- [ ] **Step 3: Commit**

```bash
git add tests/ai/agent-workbench-ui-simplification.test.mjs
git commit -m "test: lock agent workbench simplification"
```

### Task 2: Simplify the left rail and move secondary surfaces into dialogs

**Files:**
- Modify: `src/features/agent-shell/components/AgentWorkbenchSidebar.tsx`
- Modify: `src/features/agent-shell/pages/AgentShellPage.tsx`
- Reuse: `src/components/ai/gn-agent-shell/useGNAgentWorkbenchSession.ts`
- Reuse: `src/components/ui/MacDialog.tsx`

- [ ] **Step 1: Simplify sidebar inputs and actions**

Keep only the top actions and recent thread list:

```tsx
type AgentWorkbenchSidebarProps = {
  projectName?: string | null;
  threads: AgentThreadRecord[];
  activeSessionId: string | null;
  recoveryByThread: Record<string, AgentReplayRecoveryState | undefined>;
  onSelectThread: (threadId: string) => void;
  onResumeThread: (threadId: string) => void;
  onNewThread: () => void;
  onOpenSearch: () => void;
  onOpenSkills: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};
```

- [ ] **Step 2: Change `新对话` into a direct action**

```tsx
<button
  type="button"
  className="agent-workbench-rail-item"
  onClick={() => {
    onNewThread();
    if (collapsed) {
      onToggleCollapsed();
    }
  }}
>
  <WorkbenchIcon name="plus" />
  <span>新对话</span>
</button>
```

- [ ] **Step 3: Replace sidebar pages with page-level dialogs**

```tsx
const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
const [isSkillsDialogOpen, setIsSkillsDialogOpen] = useState(false);
```

```tsx
<MacDialog
  open={isSkillsDialogOpen}
  onOpenChange={setIsSkillsDialogOpen}
  title="技能"
  description="管理当前系统里的技能。"
  contentClassName="agent-workbench-dialog agent-workbench-skills-dialog"
>
  <GNAgentSkillsPage />
</MacDialog>
```

- [ ] **Step 4: Run test to verify the new entry structure passes**

Run: `node --test tests/ai/agent-workbench-ui-simplification.test.mjs`
Expected: sidebar/page-related assertions PASS while inspector/stage/style assertions may still fail until later tasks land.

### Task 3: Implement document search dialog and shrink redundant status chrome

**Files:**
- Modify: `src/features/agent-shell/pages/AgentShellPage.tsx`
- Modify: `src/features/agent-shell/components/AgentChatStage.tsx`
- Reuse: `src/features/knowledge/store/knowledgeStore.ts`

- [ ] **Step 1: Add a minimal document search dialog bound to project knowledge notes**

```tsx
const knowledgeStore = useKnowledgeStore();

useEffect(() => {
  if (!isSearchDialogOpen || !session.currentProjectId) {
    return;
  }

  void knowledgeStore.loadNotes(session.currentProjectId);
}, [isSearchDialogOpen, knowledgeStore, session.currentProjectId]);
```

```tsx
<MacDialog
  open={isSearchDialogOpen}
  onOpenChange={setIsSearchDialogOpen}
  title="搜索"
  description="搜索当前项目里的系统文档与知识笔记。"
  contentClassName="agent-workbench-dialog"
>
  {/* query field + note results */}
</MacDialog>
```

- [ ] **Step 2: Remove the redundant connection-state pill from the stage header**

```tsx
<div className="agent-chat-stage-actions">
  <span className="agent-chat-stage-pill subtle">{runtimeLabel}</span>
  <span className="agent-chat-stage-pill">{stageStatus}</span>
  {session.pendingApprovalCount > 0 ? (
    <span className="agent-chat-stage-pill warning">approvals {session.pendingApprovalCount}</span>
  ) : null}
</div>
```

- [ ] **Step 3: Run test to verify dialog/stage behavior**

Run: `node --test tests/ai/agent-workbench-ui-simplification.test.mjs`
Expected: stage and page assertions PASS; inspector/style assertions may still fail until Task 4 completes.

### Task 4: Reduce the inspector and tighten the workbench sizing

**Files:**
- Modify: `src/features/agent-shell/components/AgentWorkbenchInspector.tsx`
- Modify: `src/features/agent-shell/components/agentWorkbench.css`

- [ ] **Step 1: Remove the `tools` and `context` tabs**

```tsx
export type AgentInspectorTab = 'review' | 'files' | 'memory';

const INSPECTOR_TABS: AgentInspectorTab[] = ['review', 'files', 'memory'];
```

- [ ] **Step 2: Tighten rail sizing and remove card-first left panel styles**

```css
.agent-workbench-sidebar {
  grid-template-columns: 72px 300px;
}

.agent-workbench-brand-mark {
  width: 34px;
  height: 34px;
}

.agent-workbench-rail-item svg {
  width: 16px;
  height: 16px;
}
```

- [ ] **Step 3: Run the focused test suite**

Run: `node --test tests/ai/agent-workbench-ui-simplification.test.mjs`
Expected: PASS

- [ ] **Step 4: Run a broader safety check**

Run: `npm run build`
Expected: exit code `0`

- [ ] **Step 5: Commit**

```bash
git add src/features/agent-shell/components/AgentWorkbenchSidebar.tsx \
  src/features/agent-shell/components/AgentWorkbenchInspector.tsx \
  src/features/agent-shell/components/AgentChatStage.tsx \
  src/features/agent-shell/components/agentWorkbench.css \
  src/features/agent-shell/pages/AgentShellPage.tsx \
  tests/ai/agent-workbench-ui-simplification.test.mjs \
  docs/superpowers/plans/2026-05-08-agent-workbench-ui-simplification-implementation.md
git commit -m "feat: simplify agent workbench ui"
```
