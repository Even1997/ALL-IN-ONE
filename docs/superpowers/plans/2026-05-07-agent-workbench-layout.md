# Agent Workbench Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing `Agent` role page into a Codex-like three-zone workbench while establishing one shared `AgentChatStage` as the only AI core used by both the full workbench and future collapsed AI surfaces.

**Architecture:** Keep all runtime conversation, AI chat, thread, memory, and tool state on the existing GN agent/runtime stores. Extract a shared `AgentChatStage` and session hook from the current `GNAgentChatPage.tsx`, then wrap that stage with a thin `AgentWorkbenchLayout` only in the `Agent` role page. Other AI surfaces should later reuse the same stage in a denser `stage-plus` or `stage-only` mode instead of growing a second full page shell.

**Tech Stack:** React 19, TypeScript, Zustand, existing GN agent runtime stores, existing `AIChat`, existing GN agent shell panels, Vite build, Node test runner.

---

## Scope

This plan only covers the `Agent` role workbench layout refactor.

In scope:

- replace the current `AgentShellPage` tab shell
- establish one shared chat-stage core instead of two page implementations
- add a collapsible left navigation + content sidebar
- keep the central chat area as the primary workspace
- render a floating plan/progress card over the chat stage
- add a collapsible right inspector with review/files/tools/memory/context tabs
- extract shared session/view-model logic from `GNAgentChatPage.tsx`

Out of scope:

- changing top-level app navigation
- rewriting `AIChat` runtime behavior
- redesigning the whole product shell outside the `Agent` role
- adding a new persistence model for sidebar preferences
- keeping two long-term full AI page shells alive

## Target File Structure

- Create: `src/features/agent-shell/components/AgentChatStage.tsx`
  - The single reusable AI chat stage that will be used by the full workbench and later collapsed AI surfaces.
- Create: `src/features/agent-shell/components/AgentWorkbenchLayout.tsx`
  - Layout-only component for left rail, left content panel, center stage, floating overlay slot, and right inspector slot.
- Create: `src/features/agent-shell/components/AgentWorkbenchSidebar.tsx`
  - Left rail and left content area for new chat, search, skills, plugins, automations, sessions, and settings entry.
- Create: `src/features/agent-shell/components/AgentWorkbenchInspector.tsx`
  - Right-side collapsible inspector with tab switching for review/files/tools/memory/context.
- Create: `src/features/agent-shell/components/AgentFloatingPlanCard.tsx`
  - Floating progress/plan summary card mounted over the central chat stage.
- Create: `src/features/agent-shell/components/agentWorkbench.css`
  - Shared layout and theme-aware styles for the new shell.
- Create: `src/components/ai/gn-agent-shell/useGNAgentWorkbenchSession.ts`
  - Shared hook extracted from `GNAgentChatPage.tsx` for runtime conversation state and actions.
- Modify: `src/features/agent-shell/pages/AgentShellPage.tsx`
  - Replace the current tab shell with the new workbench composition.
- Modify: `src/features/agent-shell/pages/AgentShellPage.css`
  - Reduce the old tab-shell styles to page-level glue or import the new stylesheet.
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
  - Reduce it to a compatibility wrapper around the extracted stage, or replace its remaining page-shell responsibilities.
- Add test: `tests/ai/agent-workbench-layout.test.mjs`
  - Source contract test for the new page composition and the single-stage architecture.

---

## Task 1: Lock The New Agent Page Boundary

**Files:**
- Create: `tests/ai/agent-workbench-layout.test.mjs`
- Test: `tests/ai/agent-workbench-layout.test.mjs`

- [ ] **Step 1: Write a source test that asserts `AgentShellPage` uses the new workbench shell and shared stage**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentShellPagePath = path.resolve(
  __dirname,
  '../../src/features/agent-shell/pages/AgentShellPage.tsx',
);

test('AgentShellPage composes the new workbench shell', async () => {
  const source = await readFile(agentShellPagePath, 'utf8');

  assert.match(source, /AgentWorkbenchLayout/);
  assert.match(source, /AgentChatStage/);
  assert.match(source, /AgentWorkbenchSidebar/);
  assert.match(source, /AgentWorkbenchInspector/);
  assert.match(source, /AgentFloatingPlanCard/);
});
```

- [ ] **Step 2: Add a source assertion that the old top-level tab shell is no longer the primary page structure**

```js
test('AgentShellPage no longer renders the old AGENT_WORKSPACE_TABS top-level shell', async () => {
  const source = await readFile(agentShellPagePath, 'utf8');

  assert.doesNotMatch(source, /AGENT_WORKSPACE_TABS/);
  assert.doesNotMatch(source, /agent-workspace-tabs/);
});
```

- [ ] **Step 3: Add a source assertion that the stage is the shared core instead of a second full page shell**

```js
const gnAgentChatPagePath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx',
);

test('GNAgentChatPage is no longer a competing full page shell', async () => {
  const source = await readFile(gnAgentChatPagePath, 'utf8');

  assert.match(source, /AgentChatStage|useGNAgentWorkbenchSession/);
});
```

- [ ] **Step 4: Run the test and confirm it fails before implementation**

Run: `node --test tests/ai/agent-workbench-layout.test.mjs`

Expected: FAIL because the new components do not exist yet and `AgentShellPage.tsx` still uses the old tab shell.

- [ ] **Step 5: Commit the failing test**

```bash
git add tests/ai/agent-workbench-layout.test.mjs
git commit -m "test: lock agent workbench page boundary"
```

## Task 2: Extract The Shared Session Hook And Agent Chat Stage Core

**Files:**
- Create: `src/components/ai/gn-agent-shell/useGNAgentWorkbenchSession.ts`
- Create: `src/features/agent-shell/components/AgentChatStage.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- Test: `tests/ai/agent-workbench-layout.test.mjs`

- [ ] **Step 1: Define the hook return shape around existing runtime data**

Create the shared hook contract first:

```ts
export type GNAgentWorkbenchSession = {
  activeSessionId: string | null;
  activeSession: ReturnType<typeof useRuntimeConversationGateway>['activeSession'];
  latestTurnSession: ReturnType<typeof useRuntimeConversationGateway>['latestTurnSession'];
  threads: ReturnType<typeof useRuntimeConversationGateway>['threads'];
  contextSnapshot: ReturnType<typeof useRuntimeConversationGateway>['contextSnapshot'];
  toolCalls: ReturnType<typeof useRuntimeConversationGateway>['toolCalls'];
  mcpToolCalls: ReturnType<typeof useRuntimeConversationGateway>['mcpToolCalls'];
  memoryCandidates: ReturnType<typeof useRuntimeConversationGateway>['memoryCandidates'];
  memoryEntries: ReturnType<typeof useRuntimeConversationGateway>['memoryEntries'];
  pendingApprovalCount: number;
  statusActions: {
    prefillChatPrompt: (prompt: string, autoSubmit?: boolean) => void;
    dispatchChatGuidance: (prompt: string, guidance: string) => void;
    dispatchPauseRequest: (prompt: string) => void;
    selectThread: (threadId: string) => void;
    resumeThread: (threadId: string) => void;
  };
};
```

- [ ] **Step 2: Move the conversation/store wiring out of `GNAgentChatPage.tsx` into the hook**

Implement the hook by moving the existing `useRuntimeConversationGateway`, project lookup, active session switching, and action callbacks out of `GNAgentChatPage.tsx`, while keeping memory-conflict dialog state inside the page component:

```ts
export const useGNAgentWorkbenchSession = (): GNAgentWorkbenchSession => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const conversation = useRuntimeConversationGateway({
    projectId: currentProject?.id || null,
  });

  const setActiveSession = useAIChatStore((state) => state.setActiveSession);
  const requestReplayResumeFromRecovery = useAgentRuntimeStore((state) => state.requestReplayResumeFromRecovery);

  const selectThread = (threadId: string) => {
    if (!currentProject) return;
    setActiveSession(currentProject.id, threadId);
  };

  const resumeThread = (threadId: string) => {
    const recoveryState = conversation.recoveryByThread[threadId];
    if (!currentProject || !recoveryState) return;
    setActiveSession(currentProject.id, threadId);
    requestReplayResumeFromRecovery(threadId, recoveryState);
  };

  return {
    activeSessionId: conversation.activeSessionId,
    activeSession: conversation.activeSession,
    latestTurnSession: conversation.latestTurnSession,
    threads: conversation.threads,
    contextSnapshot: conversation.contextSnapshot,
    toolCalls: conversation.toolCalls,
    mcpToolCalls: conversation.mcpToolCalls,
    memoryCandidates: conversation.memoryCandidates,
    memoryEntries: conversation.memoryEntries,
    pendingApprovalCount: conversation.pendingApprovalCount,
    statusActions: { prefillChatPrompt, dispatchChatGuidance, dispatchPauseRequest, selectThread, resumeThread },
  };
};
```

- [ ] **Step 3: Create `AgentChatStage.tsx` as the only reusable AI stage**

The stage should own:

- center header
- `AIChat` mounting
- thread-aware title/status rendering
- minimal stage actions such as inspector toggle hooks

Suggested contract:

```tsx
type AgentChatStageProps = {
  providerId: 'classic' | 'claude' | 'codex';
  mode: 'full' | 'stage-plus' | 'stage-only';
  session: GNAgentWorkbenchSession;
  onToggleInspector?: () => void;
};
```

- [ ] **Step 4: Update `GNAgentChatPage.tsx` to consume the shared hook and delegate to `AgentChatStage`**

Replace the local conversation/session wiring with the new hook and remove its ownership of a competing three-column page shell. During transition it may stay as a compatibility wrapper, but it should render the extracted stage instead of maintaining an independent layout.

- [ ] **Step 5: Re-run the boundary test**

Run: `node --test tests/ai/agent-workbench-layout.test.mjs`

Expected: still FAIL on the page-shell assertions, but no new type errors should be introduced by the hook extraction.

- [ ] **Step 6: Commit the shared stage extraction**

```bash
git add src/components/ai/gn-agent-shell/useGNAgentWorkbenchSession.ts src/features/agent-shell/components/AgentChatStage.tsx src/components/ai/gn-agent-shell/GNAgentChatPage.tsx
git commit -m "refactor: extract shared agent chat stage"
```

## Task 3: Build The Workbench Layout Shell And Left Sidebar

**Files:**
- Create: `src/features/agent-shell/components/AgentWorkbenchLayout.tsx`
- Create: `src/features/agent-shell/components/AgentWorkbenchSidebar.tsx`
- Create: `src/features/agent-shell/components/agentWorkbench.css`
- Modify: `src/features/agent-shell/pages/AgentShellPage.tsx`
- Modify: `src/features/agent-shell/pages/AgentShellPage.css`
- Test: `tests/ai/agent-workbench-layout.test.mjs`

- [ ] **Step 1: Create the layout-only shell component with named slots**

```tsx
type AgentWorkbenchLayoutProps = {
  leftRail: React.ReactNode;
  leftPanel: React.ReactNode;
  centerHeader: React.ReactNode;
  centerStage: React.ReactNode;
  floatingOverlay?: React.ReactNode;
  rightInspector?: React.ReactNode;
  sidebarCollapsed: boolean;
  leftPanelCollapsed: boolean;
  inspectorCollapsed: boolean;
};

export const AgentWorkbenchLayout: React.FC<AgentWorkbenchLayoutProps> = ({
  leftRail,
  leftPanel,
  centerHeader,
  centerStage,
  floatingOverlay,
  rightInspector,
  sidebarCollapsed,
  leftPanelCollapsed,
  inspectorCollapsed,
}) => (
  <section className="agent-workbench-shell" data-sidebar-collapsed={sidebarCollapsed} data-inspector-collapsed={inspectorCollapsed}>
    <aside className="agent-workbench-left-rail">{leftRail}</aside>
    {!leftPanelCollapsed ? <aside className="agent-workbench-left-panel">{leftPanel}</aside> : null}
    <main className="agent-workbench-center">
      <header className="agent-workbench-center-header">{centerHeader}</header>
      <div className="agent-workbench-center-body">
        {centerStage}
        {floatingOverlay ? <div className="agent-workbench-floating-overlay">{floatingOverlay}</div> : null}
      </div>
    </main>
    {!inspectorCollapsed && rightInspector ? <aside className="agent-workbench-right-panel">{rightInspector}</aside> : null}
  </section>
);
```

- [ ] **Step 2: Create the left sidebar component around the confirmed structure**

Implement a sidebar component with:

- top quick actions: `新对话`, `搜索`, `技能`, `插件`, `自动化`
- project/session section
- bottom settings button

Use a local mode union:

```ts
export type AgentSidebarMode = 'threads' | 'search' | 'skills' | 'plugins' | 'automations' | 'settings';
```

The component should accept:

- `mode`
- `onModeChange`
- `threads`
- `activeSessionId`
- `onSelectThread`
- `onNewThread`
- `collapsed`

- [ ] **Step 3: Add theme-aware shell CSS with light/dark compatibility**

The stylesheet should define:

- shell grid columns
- soft borders and panel backgrounds for both themes
- compact icon-rail behavior
- floating overlay anchor
- right inspector collapsed state

Key CSS hooks:

```css
.agent-workbench-shell {}
.agent-workbench-left-rail {}
.agent-workbench-left-panel {}
.agent-workbench-center {}
.agent-workbench-center-body {}
.agent-workbench-floating-overlay {}
.agent-workbench-right-panel {}
```

- [ ] **Step 4: Replace the current `AgentShellPage` tab shell with the new layout shell wrapped around `AgentChatStage`**

`AgentShellPage.tsx` should stop rendering:

- `AGENT_WORKSPACE_TABS`
- `chat / skills / config` top tabs

and instead hold only page-level UI state:

```ts
const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
const [sidebarMode, setSidebarMode] = useState<AgentSidebarMode>('threads');
const [inspectorTab, setInspectorTab] = useState<AgentInspectorTab>('review');
const [floatingPlanCollapsed, setFloatingPlanCollapsed] = useState(false);
```

The center of the page should now mount:

```tsx
<AgentChatStage
  providerId="classic"
  mode="full"
  session={session}
  onToggleInspector={() => setInspectorCollapsed((value) => !value)}
/>
```

- [ ] **Step 5: Re-run the source boundary test**

Run: `node --test tests/ai/agent-workbench-layout.test.mjs`

Expected: the `AgentWorkbenchLayout` and `AgentWorkbenchSidebar` assertions should now pass.

- [ ] **Step 6: Commit the shell and sidebar**

```bash
git add src/features/agent-shell/components/AgentWorkbenchLayout.tsx src/features/agent-shell/components/AgentWorkbenchSidebar.tsx src/features/agent-shell/components/agentWorkbench.css src/features/agent-shell/pages/AgentShellPage.tsx src/features/agent-shell/pages/AgentShellPage.css
git commit -m "feat: add agent workbench shell and sidebar"
```

## Task 4: Mount The Floating Plan Card On Top Of The Shared Stage

**Files:**
- Create: `src/features/agent-shell/components/AgentFloatingPlanCard.tsx`
- Modify: `src/features/agent-shell/pages/AgentShellPage.tsx`
- Modify: `src/features/agent-shell/components/agentWorkbench.css`
- Test: `tests/ai/agent-workbench-layout.test.mjs`

- [ ] **Step 1: Build the floating plan card as a summary-only overlay**

```tsx
type AgentFloatingPlanCardProps = {
  session: AgentTurnSession | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenInspector: () => void;
};

export const AgentFloatingPlanCard: React.FC<AgentFloatingPlanCardProps> = ({
  session,
  collapsed,
  onToggleCollapsed,
  onOpenInspector,
}) => {
  if (!session?.plan) {
    return null;
  }

  return (
    <section className={`agent-floating-plan-card${collapsed ? ' is-collapsed' : ''}`}>
      <header>
        <strong>进度</strong>
        <button type="button" onClick={onToggleCollapsed}>{collapsed ? '展开' : '收起'}</button>
      </header>
      {!collapsed ? (
        <>
          <p>{session.plan.summary}</p>
          <span>{session.plan.riskLevel}</span>
          <button type="button" onClick={onOpenInspector}>查看详情</button>
        </>
      ) : null}
    </section>
  );
};
```

- [ ] **Step 2: Keep `AIChat` inside `AgentChatStage`, not directly inside the page shell**

Mount `AIChat` inside `AgentChatStage` with the existing runtime settings:

```tsx
<AIChat
  variant="default"
  runtimeConfigIdOverride={runtimeConfigIdOverride}
  providerExecutionMode={providerId === 'classic' ? null : providerId}
/>
```

The stage header should show:

- active thread title
- provider/runtime status
- a few compact actions such as inspector toggle

- [ ] **Step 3: Reserve overlay-safe spacing in CSS**

Add CSS so the floating card does not permanently cover core message content:

```css
.agent-workbench-center-body {
  position: relative;
  min-height: 0;
}

.agent-workbench-floating-overlay {
  position: absolute;
  top: 16px;
  right: 16px;
  width: min(320px, calc(100% - 32px));
  pointer-events: none;
}

.agent-workbench-floating-overlay > * {
  pointer-events: auto;
}
```

- [ ] **Step 4: Extend the source test with a floating-plan assertion**

```js
assert.match(source, /AgentFloatingPlanCard/);
```

- [ ] **Step 5: Run the source test and build**

Run:

```bash
node --test tests/ai/agent-workbench-layout.test.mjs
npm run build
```

Expected:

- source test PASS
- build PASS

- [ ] **Step 6: Commit the chat-stage overlay integration**

```bash
git add src/features/agent-shell/components/AgentFloatingPlanCard.tsx src/features/agent-shell/components/agentWorkbench.css src/features/agent-shell/pages/AgentShellPage.tsx
git commit -m "feat: add floating plan card to agent workbench"
```

## Task 5: Add The Right Inspector With Review/Files/Tools/Memory/Context Tabs

**Files:**
- Create: `src/features/agent-shell/components/AgentWorkbenchInspector.tsx`
- Modify: `src/features/agent-shell/pages/AgentShellPage.tsx`
- Modify: `src/features/agent-shell/components/agentWorkbench.css`
- Test: `tests/ai/agent-workbench-layout.test.mjs`

- [ ] **Step 1: Define the inspector tab contract**

```ts
export type AgentInspectorTab = 'review' | 'files' | 'tools' | 'memory' | 'context';
```

- [ ] **Step 2: Implement the inspector shell with compact tab switching**

Use existing GN panels instead of rewriting them:

```tsx
export const AgentWorkbenchInspector: React.FC<AgentWorkbenchInspectorProps> = ({
  tab,
  onTabChange,
  latestTurnSession,
  contextSnapshot,
  toolCalls,
  mcpToolCalls,
}) => (
  <section className="agent-workbench-inspector">
    <nav className="agent-workbench-inspector-tabs">
      {/* review / files / tools / memory / context */}
    </nav>

    {tab === 'review' ? <GNAgentPlanPanel session={latestTurnSession} /> : null}
    {tab === 'tools' ? <GNAgentToolCallPanel toolCalls={toolCalls} mcpToolCalls={mcpToolCalls} /> : null}
    {tab === 'memory' ? <GNAgentMemoryPanel /> : null}
    {tab === 'context' ? <GNAgentContextPanel context={contextSnapshot} /> : null}
  </section>
);
```

For `files`, start with a minimal artifact/change list derived from the current session/tool output instead of inventing a new file browser.

- [ ] **Step 3: Add the collapse/expand control at the page level**

In `AgentShellPage.tsx`, the right panel should be toggleable from the center header. When collapsed, the center stage should reclaim the space without hiding the floating plan card.

- [ ] **Step 4: Add or extend the source test to lock the inspector tabs**

```js
assert.match(source, /'review' \| 'files' \| 'tools' \| 'memory' \| 'context'/);
```

- [ ] **Step 5: Run the source test and full build again**

Run:

```bash
node --test tests/ai/agent-workbench-layout.test.mjs
npm run build
```

Expected:

- source test PASS
- build PASS

- [ ] **Step 6: Commit the right inspector**

```bash
git add src/features/agent-shell/components/AgentWorkbenchInspector.tsx src/features/agent-shell/components/agentWorkbench.css src/features/agent-shell/pages/AgentShellPage.tsx
git commit -m "feat: add agent workbench inspector panels"
```

## Task 6: Remove Competing Shell Responsibilities And Final Verification

**Files:**
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- Modify: `src/features/agent-shell/pages/AgentShellPage.css`
- Modify: `src/features/agent-shell/components/agentWorkbench.css`
- Test: `tests/ai/agent-workbench-layout.test.mjs`

- [ ] **Step 1: Verify `GNAgentChatPage` no longer behaves as a competing full-page shell**

Keep compatibility for existing callers, but ensure the component now delegates to the shared `AgentChatStage` rather than maintaining a second full-page layout.

- [ ] **Step 2: Remove obsolete tab-shell CSS that is no longer used by `AgentShellPage`**

Delete styles tied only to:

- `.agent-workspace-hero`
- `.agent-workspace-tabs`
- `.agent-workspace-tab`

Keep only styles still referenced by the final page.

- [ ] **Step 3: Run the final verification commands**

Run:

```bash
node --test tests/ai/agent-workbench-layout.test.mjs
npm run build
```

Expected:

- all tests PASS
- build PASS

- [ ] **Step 4: Review the diff for accidental scope creep**

Check:

- no changes to top-level app navigation behavior
- no runtime rewrite inside `AIChat`
- no second AI page shell left behind
- no unrelated design-system churn
- no unused imports or dead layout state

- [ ] **Step 5: Commit the final cleanup**

```bash
git add src/components/ai/gn-agent-shell/GNAgentChatPage.tsx src/features/agent-shell/pages/AgentShellPage.css src/features/agent-shell/components/agentWorkbench.css
git commit -m "refactor: finalize agent workbench layout migration"
```
