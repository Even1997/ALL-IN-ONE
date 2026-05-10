# AI Chat Performance Boundary Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the obvious loading, clicking, and runtime-streaming lag in `AIChat` by splitting runtime subscriptions, isolating hot render regions, and skipping no-op sidecar/store writes without changing current product behavior.

**Architecture:** Keep the existing single-kernel runtime and current interaction semantics. Replace the top-level `AIChat -> useRuntimeConversationGateway() -> big conversation object` dependency with fine-grained active-conversation hooks plus small render islands that subscribe to their own hot slices. Add only minimal no-op guards on the runtime sidecar/store hot path so repeated identical live-state writes stop invalidating the whole UI.

**Tech Stack:** React, Zustand, TypeScript, Node test runner with `--experimental-strip-types`

---

## Scope Guard

This plan is intentionally narrow.

- Do not change runtime single-kernel orchestration.
- Do not redesign AI chat behavior, approval flow, tool semantics, or message structure.
- Do not start with virtualization, throttling, or delayed rendering tricks.
- Do remove dead boundary code created by this refactor, especially top-level `AIChat` subscriptions that become obsolete.

## File Map

**Conversation selectors and projections**
- Modify: `src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts`
- Modify: `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`

**AI chat shell and render islands**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/useAIChatSidecarSessionActions.ts`
- Create: `src/components/workspace/AIChatConversationMessagesPane.tsx`
- Create: `src/components/workspace/AIChatRuntimeStatusPanel.tsx`
- Create: `src/components/workspace/AIChatRuntimeTasksPanel.tsx`

**Runtime hot-path guards**
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`

**Tests**
- Create: `tests/ai/ai-chat-performance-boundary-source.test.mjs`
- Modify: `tests/ai/runtime-conversation-gateway-store-selector.test.mjs`
- Modify: `tests/ai/ai-chat-sidecar-session-actions-hook-boundary.test.mjs`
- Modify: `tests/ai/runtime-sidecar-session-bridge-source.test.mjs`
- Reuse: `tests/ai/ai-chat-runtime-subscription-boundary.test.mjs`
- Reuse: `tests/ai/runtime-conversation-gateway.test.mjs`
- Reuse: `tests/ai/runtime-sidecar-session-bridge.test.mjs`

**Verification commands**
- `node --test --experimental-strip-types tests/ai/ai-chat-performance-boundary-source.test.mjs tests/ai/runtime-conversation-gateway-store-selector.test.mjs tests/ai/ai-chat-sidecar-session-actions-hook-boundary.test.mjs tests/ai/runtime-sidecar-session-bridge-source.test.mjs`
- `node --test --experimental-strip-types tests/ai/runtime-conversation-gateway.test.mjs tests/ai/runtime-sidecar-session-bridge.test.mjs tests/ai/ai-chat-runtime-subscription-boundary.test.mjs`
- `npm run build`

## Target End State

- `AIChat.tsx` is a stable shell, not a hot runtime projection owner.
- Message rendering, runtime status, and task/skills side panels subscribe to their own slices.
- Turn submission no longer requires `AIChat` to subscribe to `activeSession.messages` just to build `conversationHistory`.
- High-frequency sidecar events stop writing identical live-state data back into Zustand.
- Existing runtime/chat behavior remains intact.

### Task 1: Lock The Performance Boundary With Regression Tests

**Files:**
- Create: `tests/ai/ai-chat-performance-boundary-source.test.mjs`
- Modify: `tests/ai/runtime-conversation-gateway-store-selector.test.mjs`
- Modify: `tests/ai/ai-chat-sidecar-session-actions-hook-boundary.test.mjs`
- Modify: `tests/ai/runtime-sidecar-session-bridge-source.test.mjs`

- [ ] **Step 1: Write a failing source test for the new `AIChat` subscription boundary**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('AIChat uses fine-grained runtime hooks instead of a single conversation projection', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /useActiveConversationSelection/);
  assert.match(source, /AIChatConversationMessagesPane/);
  assert.match(source, /AIChatRuntimeStatusPanel/);
  assert.match(source, /AIChatRuntimeTasksPanel/);
  assert.doesNotMatch(source, /const conversation = useRuntimeConversationGateway/);
  assert.doesNotMatch(source, /const messages = conversation\.messages/);
  assert.doesNotMatch(source, /const pendingApprovals = conversation\.pendingApprovals/);
});
```

- [ ] **Step 2: Extend the gateway selector source test to require fine-grained hook exports**

```js
assert.match(source, /export const useActiveConversationSelection =/);
assert.match(source, /export const useActiveConversationMessages =/);
assert.match(source, /export const useActiveConversationLiveState =/);
assert.match(source, /export const useActiveConversationApprovals =/);
assert.match(source, /export const useActiveConversationTasks =/);
assert.match(source, /export const useActiveConversationSkillsAndRecovery =/);
```

- [ ] **Step 3: Update the sidecar session action boundary test so history is read on demand**

```js
assert.doesNotMatch(chatSource, /conversationHistory:\s*toConversationHistoryMessages\(activeSession\?\.messages \|\| \[\]\)/);
assert.match(chatSource, /getConversationHistory:\s*getConversationHistory/);
assert.match(hookSource, /getConversationHistory:\s*\(\)\s*=>\s*RuntimeConversationHistoryMessage\[\]/);
assert.match(hookSource, /conversationHistory:\s*getConversationHistory\(\)/);
```

- [ ] **Step 4: Extend the sidecar bridge source test to require guarded live-state writes**

```js
assert.match(source, /const patchLiveStateIfChanged =/);
assert.match(source, /const patchApprovalSummaryIfChanged =/);
assert.match(source, /applyRuntimeSidecarTurnDeltaEvent/);
assert.match(source, /patchLiveStateIfChanged\(sessionId,/);
```

- [ ] **Step 5: Run the focused source-boundary suite**

Run: `node --test --experimental-strip-types tests/ai/ai-chat-performance-boundary-source.test.mjs tests/ai/runtime-conversation-gateway-store-selector.test.mjs tests/ai/ai-chat-sidecar-session-actions-hook-boundary.test.mjs tests/ai/runtime-sidecar-session-bridge-source.test.mjs`

Expected: FAIL because the new hooks, render-island files, on-demand history getter, and guarded bridge helpers do not exist yet.

- [ ] **Step 6: Commit the failing tests**

```bash
git add tests/ai/ai-chat-performance-boundary-source.test.mjs tests/ai/runtime-conversation-gateway-store-selector.test.mjs tests/ai/ai-chat-sidecar-session-actions-hook-boundary.test.mjs tests/ai/runtime-sidecar-session-bridge-source.test.mjs
git commit -m "test: lock ai chat performance boundaries"
```

### Task 2: Add Fine-Grained Active-Conversation Hooks

**Files:**
- Modify: `src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts`
- Modify: `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
- Test: `tests/ai/runtime-conversation-gateway-store-selector.test.mjs`
- Test: `tests/ai/runtime-conversation-gateway.test.mjs`

- [ ] **Step 1: Introduce a shared base selector helper inside `useRuntimeConversationGateway.ts`**

```ts
const useActiveConversationBase = (input?: { projectId?: string | null }) => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const projectId = input?.projectId ?? currentProject?.id ?? null;
  const projectChatState = useAIChatStore(
    useShallow((state) => (projectId ? state.projects[projectId] || null : null)),
  );
  const sessions = projectChatState?.sessions || [];
  const activityEntries = projectChatState?.activityEntries || [];
  const selection = useMemo(
    () => resolveActiveConversationSelection({
      sessions,
      activeSessionId: projectChatState?.activeSessionId || null,
    }),
    [projectChatState?.activeSessionId, sessions],
  );
  const threadIds = useMemo(
    () => buildRuntimeConversationThreadIds(selection.activeSessionId, selection.activeSession),
    [selection.activeSessionId, selection.activeSession],
  );

  return { projectId, projectChatState, sessions, activityEntries, selection, threadIds };
};
```

- [ ] **Step 2: Export focused active-conversation hooks instead of forcing every caller through the full projection**

```ts
export const useActiveConversationSelection = (input?: { projectId?: string | null }) => {
  const base = useActiveConversationBase(input);
  return {
    projectId: base.projectId,
    projectChatState: base.projectChatState,
    sessions: base.sessions,
    activeSessionId: base.selection.activeSessionId,
    activeSession: base.selection.activeSession,
    ...base.threadIds,
  };
};

export const useActiveConversationMessages = (input?: { projectId?: string | null }) => {
  const base = useActiveConversationBase(input);
  return {
    messages: base.selection.activeSession?.messages || EMPTY_MESSAGES,
    activityEntries: base.activityEntries,
  };
};
```

- [ ] **Step 3: Add the hot runtime slice hooks needed by the render islands**

```ts
export const useActiveConversationLiveState = (input?: { projectId?: string | null }) => {
  const base = useActiveConversationBase(input);
  const latestTurnSession = useAgentRuntimeStore((state) =>
    base.selection.activeSessionId
      ? getLatestTurnSession(state.sessionsByThread[base.selection.activeSessionId]) || null
      : null,
  );
  const liveState = useAgentRuntimeStore((state) =>
    base.threadIds.liveThreadId ? state.liveStateByThread[base.threadIds.liveThreadId] || null : null,
  );
  const replayResumeRequest = useAgentRuntimeStore((state) =>
    base.selection.activeSessionId ? state.resumeRequestsByThread[base.selection.activeSessionId] || null : null,
  );

  return {
    liveThreadId: base.threadIds.liveThreadId,
    liveState,
    latestTurnSession,
    replayResumeRequest,
  };
};

export const useActiveConversationApprovals = (input?: { projectId?: string | null }) => {
  const base = useActiveConversationBase(input);
  const pendingApprovals = useApprovalStore((state) =>
    base.threadIds.approvalThreadId
      ? (state.approvalsByThread[base.threadIds.approvalThreadId] || EMPTY_APPROVALS).filter(
          (approval) => approval.status === 'pending',
        )
      : EMPTY_APPROVALS,
  );

  return {
    approvalThreadId: base.threadIds.approvalThreadId,
    pendingApprovals,
    pendingApprovalCount: pendingApprovals.length,
  };
};

export const useActiveConversationTasks = (input?: { projectId?: string | null }) => {
  const base = useActiveConversationBase(input);
  const backgroundTasks = useAgentRuntimeStore((state) =>
    base.threadIds.liveThreadId
      ? state.backgroundTasksByThread[base.threadIds.liveThreadId] || EMPTY_BACKGROUND_TASKS
      : EMPTY_BACKGROUND_TASKS,
  );
  const teamRuns = useAgentRuntimeStore((state) =>
    base.selection.activeSessionId
      ? state.teamRunsByThread[base.selection.activeSessionId] || EMPTY_TEAM_RUNS
      : EMPTY_TEAM_RUNS,
  );

  return {
    taskThreadId: base.threadIds.taskThreadId,
    backgroundTasks,
    teamRuns,
    latestTeamRun: teamRuns[0] || null,
  };
};

export const useActiveConversationSkillsAndRecovery = (input?: { projectId?: string | null }) => {
  const base = useActiveConversationBase(input);
  const activeSkills = useAgentRuntimeStore((state) =>
    base.selection.activeSessionId
      ? state.activeSkillsByThread[base.selection.activeSessionId] || EMPTY_ACTIVE_SKILLS
      : EMPTY_ACTIVE_SKILLS,
  );
  const recoveryState = useAgentRuntimeStore((state) =>
    base.selection.activeSessionId ? state.recoveryByThread[base.selection.activeSessionId] || null : null,
  );
  const replayEvents = useAgentRuntimeStore((state) =>
    base.selection.activeSession?.runtimeThreadId
      ? state.replayEventsByThread[base.selection.activeSession.runtimeThreadId] || EMPTY_REPLAY_EVENTS
      : EMPTY_REPLAY_EVENTS,
  );

  return { activeSkills, recoveryState, replayEvents };
};
```

- [ ] **Step 4: Keep the legacy `useRuntimeConversationGateway()` export as a compatibility wrapper**

```ts
export const useRuntimeConversationGateway = (input?: { projectId?: string | null }) => {
  const selection = useActiveConversationSelection(input);
  const messageSlice = useActiveConversationMessages(input);
  const liveSlice = useActiveConversationLiveState(input);
  const approvalSlice = useActiveConversationApprovals(input);
  const taskSlice = useActiveConversationTasks(input);
  const skillSlice = useActiveConversationSkillsAndRecovery(input);

  return {
    ...selection,
    ...messageSlice,
    ...liveSlice,
    ...approvalSlice,
    ...taskSlice,
    ...skillSlice,
  };
};
```

- [ ] **Step 5: Add a small gateway behavior test for the new focused hooks contract**

```js
test('runtime conversation gateway keeps active thread ids stable across focused hooks', async () => {
  const source = await readFile(gatewayHookPath, 'utf8');

  assert.match(source, /const useActiveConversationBase =/);
  assert.match(source, /approvalThreadId:/);
  assert.match(source, /liveThreadId:/);
  assert.match(source, /taskThreadId:/);
});
```

- [ ] **Step 6: Run the gateway selector and behavior suite**

Run: `node --test --experimental-strip-types tests/ai/runtime-conversation-gateway-store-selector.test.mjs tests/ai/runtime-conversation-gateway.test.mjs tests/ai/ai-chat-performance-boundary-source.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts src/modules/ai/runtime/conversation/runtimeConversationGateway.ts tests/ai/runtime-conversation-gateway-store-selector.test.mjs tests/ai/runtime-conversation-gateway.test.mjs tests/ai/ai-chat-performance-boundary-source.test.mjs
git commit -m "refactor: split runtime conversation subscriptions"
```

### Task 3: Turn `AIChat` Into A Stable Shell And Move Hot Slices Into Render Islands

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/useAIChatSidecarSessionActions.ts`
- Create: `src/components/workspace/AIChatConversationMessagesPane.tsx`
- Create: `src/components/workspace/AIChatRuntimeStatusPanel.tsx`
- Create: `src/components/workspace/AIChatRuntimeTasksPanel.tsx`
- Test: `tests/ai/ai-chat-performance-boundary-source.test.mjs`
- Test: `tests/ai/ai-chat-sidecar-session-actions-hook-boundary.test.mjs`
- Test: `tests/ai/ai-chat-runtime-subscription-boundary.test.mjs`

- [ ] **Step 1: Create the message-pane render island that owns message and approval subscriptions**

```tsx
export const AIChatConversationMessagesPane = React.memo(function AIChatConversationMessagesPane({
  projectId,
  messagesEndRef,
  messageListRef,
  onApprove,
  onDeny,
  onAnswerQuestion,
  approvalStatusLabelMap,
  approvalRiskLabelMap,
  approvalActionLabelMap,
}: AIChatConversationMessagesPaneProps) {
  const { messages, activityEntries } = useActiveConversationMessages({ projectId });
  const { approvalThreadId } = useActiveConversationApprovals({ projectId });
  const approvals = useApprovalStore((state) =>
    approvalThreadId ? state.approvalsByThread[approvalThreadId] || EMPTY_PENDING_APPROVALS : EMPTY_PENDING_APPROVALS,
  );

  return (
    <GNAgentMessageList
      messages={messages}
      activityEntries={activityEntries}
      messagesEndRef={messagesEndRef}
      messageListRef={messageListRef}
      approvals={approvals}
      onApprove={onApprove}
      onDeny={onDeny}
      onAnswerQuestion={onAnswerQuestion}
      approvalStatusLabelMap={approvalStatusLabelMap}
      approvalRiskLabelMap={approvalRiskLabelMap}
      approvalActionLabelMap={approvalActionLabelMap}
    />
  );
});
```

- [ ] **Step 2: Create a small runtime status panel that owns `liveState` and timer churn**

```tsx
export const AIChatRuntimeStatusPanel = React.memo(function AIChatRuntimeStatusPanel({
  projectId,
  patchLiveState,
}: AIChatRuntimeStatusPanelProps) {
  const { liveThreadId, liveState, latestTurnSession } = useActiveConversationLiveState({ projectId });
  const { approvalThreadId, pendingApprovals } = useActiveConversationApprovals({ projectId });

  useEffect(() => {
    if (!approvalThreadId) {
      return;
    }

    patchLiveState(approvalThreadId, (state) => {
      const nextSummary = pendingApprovals[0]?.summary || null;
      return nextSummary === state.pendingApprovalSummary && pendingApprovals.length === state.pendingPermissionCount
        ? state
        : {
            ...state,
            pendingPermissionCount: pendingApprovals.length,
            pendingApprovalSummary: nextSummary,
            statusVerb: pendingApprovals.length > 0 ? 'Waiting for approval' : state.statusVerb,
          };
    });
  }, [approvalThreadId, patchLiveState, pendingApprovals]);

  useEffect(() => {
    if (!liveThreadId || !liveState?.startedAt) {
      return;
    }

    const timer = window.setInterval(() => {
      patchLiveState(liveThreadId, (state) => {
        const elapsedSeconds = getElapsedSecondsSince(state.startedAt, state.elapsedSeconds);
        return elapsedSeconds === state.elapsedSeconds ? state : { ...state, elapsedSeconds };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [liveThreadId, liveState?.startedAt, patchLiveState]);

  return (
    <section className="ai-chat-runtime-status-panel">
      <div>{liveState?.statusVerb || latestTurnSession?.status || 'Idle'}</div>
      <div>{liveState?.connectionState || 'disconnected'}</div>
    </section>
  );
});
```

- [ ] **Step 3: Create a task/skills render island for background tasks, team runs, and recovery panels**

```tsx
export const AIChatRuntimeTasksPanel = React.memo(function AIChatRuntimeTasksPanel({
  projectId,
  turnCheckpoints,
  runDiffsByKey,
  expandedRunDiffKey,
  onToggleRunDiff,
}: AIChatRuntimeTasksPanelProps) {
  const { backgroundTasks, teamRuns, latestTeamRun } = useActiveConversationTasks({ projectId });
  const { activeSkills, recoveryState, replayEvents } = useActiveConversationSkillsAndRecovery({ projectId });

  return (
    <section className="ai-chat-runtime-tasks-panel">
      <div>{backgroundTasks.length} background tasks</div>
      <div>{teamRuns.length} team runs</div>
      <div>{activeSkills.length} active skills</div>
      <div>{replayEvents.length} replay events</div>
      <div>{latestTeamRun?.status || recoveryState?.summary || 'idle'}</div>
    </section>
  );
});
```

- [ ] **Step 4: Remove top-level `conversation` ownership from `AIChat.tsx` and keep only stable shell state**

```tsx
const {
  projectId,
  sessions,
  activeSessionId,
  activeSession,
  approvalThreadId,
  checkpointThreadId,
  taskThreadId,
  liveThreadId,
} = useActiveConversationSelection({
  projectId: currentProject?.id || null,
});

// Delete:
// const conversation = useRuntimeConversationGateway(...)
// const messages = conversation.messages ...
// const activeRuntimeLiveState = conversation.liveState ...
```

- [ ] **Step 5: Pass an on-demand history getter into the sidecar action hook so the shell no longer subscribes to `messages`**

```ts
const getConversationHistory = () => {
  if (!currentProjectId || !activeSession?.id) {
    return [];
  }

  const latestSession =
    useAIChatStore.getState().projects[currentProjectId]?.sessions.find((session) => session.id === activeSession.id) || null;

  return toConversationHistoryMessages(latestSession?.messages || []);
};

const { submitPrompt } = useAIChatSidecarSessionActions({
  currentProjectId,
  currentProjectName,
  projectRoot,
  runtimeProviderId,
  activeSession,
  permissionMode,
  getConversationHistory,
  referenceFiles: resolvedReferenceContextFiles,
  contextLabels: runtimeContextLabels,
  selectedRuntimeConfig,
  selectedChatAgentId,
  isSelectedChatAgentReady,
  setSelectedChatAgentId,
  setInput,
  setShowHistoryMenu,
  createWelcomeSession,
  upsertSession,
  setActiveSession,
});
```

- [ ] **Step 6: Render the new islands from the shell with stable callbacks only**

```tsx
<AIChatRuntimeStatusPanel
  projectId={currentProjectId}
  patchLiveState={patchLiveState}
/>
<AIChatConversationMessagesPane
  projectId={currentProjectId}
  messagesEndRef={messagesEndRef}
  messageListRef={messageListRef}
  onApprove={handleApproveRuntimeApproval}
  onDeny={handleDenyRuntimeApproval}
  onAnswerQuestion={handleAnswerRuntimeQuestion}
  approvalStatusLabelMap={approvalStatusLabelMap}
  approvalRiskLabelMap={approvalRiskLabelMap}
  approvalActionLabelMap={approvalActionLabelMap}
/>
<AIChatRuntimeTasksPanel
  projectId={currentProjectId}
  turnCheckpoints={turnCheckpoints}
  runDiffsByKey={runDiffsByKey}
  expandedRunDiffKey={expandedRunDiffKey}
  onToggleRunDiff={setExpandedRunDiffKey}
/>
```

- [ ] **Step 7: Remove dead imports and obsolete top-level derivations created by the split**

```ts
// Remove now-unused imports and locals such as:
// useRuntimeConversationGateway
// EMPTY_MESSAGES
// EMPTY_PENDING_APPROVALS
// conversation.*
```

- [ ] **Step 8: Run the AI chat boundary suite**

Run: `node --test --experimental-strip-types tests/ai/ai-chat-performance-boundary-source.test.mjs tests/ai/ai-chat-sidecar-session-actions-hook-boundary.test.mjs tests/ai/ai-chat-runtime-subscription-boundary.test.mjs tests/ai/runtime-conversation-gateway-store-selector.test.mjs`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/workspace/AIChat.tsx src/components/workspace/useAIChatSidecarSessionActions.ts src/components/workspace/AIChatConversationMessagesPane.tsx src/components/workspace/AIChatRuntimeStatusPanel.tsx src/components/workspace/AIChatRuntimeTasksPanel.tsx tests/ai/ai-chat-performance-boundary-source.test.mjs tests/ai/ai-chat-sidecar-session-actions-hook-boundary.test.mjs tests/ai/ai-chat-runtime-subscription-boundary.test.mjs
git commit -m "refactor: isolate ai chat hot render regions"
```

### Task 4: Add Minimal No-Op Guards On The Sidecar And Store Hot Path

**Files:**
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Modify: `tests/ai/runtime-sidecar-session-bridge-source.test.mjs`
- Reuse: `tests/ai/runtime-sidecar-session-bridge.test.mjs`

- [ ] **Step 1: Add a tiny bridge helper that skips identical live-state writes**

```ts
const patchLiveStateIfChanged = (
  threadId: string,
  updater: (state: AgentRuntimeLiveState) => AgentRuntimeLiveState,
) => {
  const runtimeStore = useAgentRuntimeStore.getState();
  const current = runtimeStore.liveStateByThread[threadId] || createIdleLiveState();
  const next = updater(current);

  if (
    next.connectionState === current.connectionState &&
    next.activeThinking === current.activeThinking &&
    next.activeToolName === current.activeToolName &&
    next.streamingText === current.streamingText &&
    next.streamingToolInput === current.streamingToolInput &&
    next.pendingApprovalSummary === current.pendingApprovalSummary &&
    next.pendingQuestionSummary === current.pendingQuestionSummary &&
    next.pendingPermissionCount === current.pendingPermissionCount &&
    next.statusVerb === current.statusVerb &&
    next.elapsedSeconds === current.elapsedSeconds &&
    next.tokenUsage.inputTokens === current.tokenUsage.inputTokens &&
    next.tokenUsage.outputTokens === current.tokenUsage.outputTokens
  ) {
    return;
  }

  runtimeStore.patchLiveState(threadId, next);
};
```

- [ ] **Step 2: Route the high-frequency bridge events through the guarded helper**

```ts
const applyRuntimeSidecarTurnDeltaEvent = (sessionId: string, delta: string) => {
  if (!delta) {
    return;
  }

  const runtimeStore = useAgentRuntimeStore.getState();
  runtimeStore.appendStreamDelta(sessionId, delta);
  patchLiveStateIfChanged(sessionId, (state) => ({
    ...state,
    connectionState: 'connected',
    streamingText: `${state.streamingText}${delta}`,
  }));
};
```

- [ ] **Step 3: Add narrow helpers for approvals and question summaries instead of repeating unconditional writes**

```ts
const patchApprovalSummaryIfChanged = (sessionId: string, summary: string | null, count: number) => {
  patchLiveStateIfChanged(sessionId, (state) =>
    state.pendingApprovalSummary === summary && state.pendingPermissionCount === count
      ? state
      : {
          ...state,
          pendingApprovalSummary: summary,
          pendingPermissionCount: count,
          statusVerb: count > 0 ? 'Waiting for approval' : resolvePassiveStatusVerb(state),
        },
  );
};
```

- [ ] **Step 4: Teach `agentRuntimeStore.patchLiveState()` and `appendStreamDelta()` to return the old state on no-op**

```ts
appendStreamDelta: (threadId, delta) =>
  set((state) => {
    if (!delta) {
      return state;
    }

    return {
      runStateByThread: {
        ...state.runStateByThread,
        [threadId]: {
          ...(state.runStateByThread[threadId] || createIdleRunState()),
          draft: `${state.runStateByThread[threadId]?.draft || ''}${delta}`,
        },
      },
    };
  }),

patchLiveState: (threadId, updater) =>
  set((state) => {
    const current = state.liveStateByThread[threadId] || createIdleLiveState();
    const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };

    if (next === current) {
      return state;
    }

    return {
      liveStateByThread: {
        ...state.liveStateByThread,
        [threadId]: next,
      },
    };
  }),
```

- [ ] **Step 5: Run the sidecar bridge regression suite**

Run: `node --test --experimental-strip-types tests/ai/runtime-sidecar-session-bridge-source.test.mjs tests/ai/runtime-sidecar-session-bridge.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts src/modules/ai/runtime/agentRuntimeStore.ts tests/ai/runtime-sidecar-session-bridge-source.test.mjs tests/ai/runtime-sidecar-session-bridge.test.mjs
git commit -m "perf: guard no-op runtime sidecar live-state writes"
```

### Task 5: Final Cleanup And Verification

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/useAIChatSidecarSessionActions.ts`
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Modify: `src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts`
- Reuse: `tests/ai/ai-chat-performance-boundary-source.test.mjs`
- Reuse: `tests/ai/runtime-conversation-gateway.test.mjs`
- Reuse: `tests/ai/runtime-sidecar-session-bridge.test.mjs`

- [ ] **Step 1: Remove dead boundary code left behind by the refactor**

```ts
// Remove only code made obsolete by this plan:
// - unused EMPTY_* fallbacks in AIChat
// - unused top-level conversation locals
// - obsolete imports that only supported the old big-projection path
// - any sidecar bridge helper branches replaced by the guard helpers
```

- [ ] **Step 2: Run the focused performance-boundary suite**

Run: `node --test --experimental-strip-types tests/ai/ai-chat-performance-boundary-source.test.mjs tests/ai/runtime-conversation-gateway-store-selector.test.mjs tests/ai/ai-chat-sidecar-session-actions-hook-boundary.test.mjs tests/ai/runtime-sidecar-session-bridge-source.test.mjs tests/ai/runtime-conversation-gateway.test.mjs tests/ai/runtime-sidecar-session-bridge.test.mjs tests/ai/ai-chat-runtime-subscription-boundary.test.mjs`

Expected: PASS

- [ ] **Step 3: Run the broader runtime/chat verification suite**

Run: `node --test --experimental-strip-types tests/ai/agent-runtime-store.test.mjs tests/ai/runtime-conversation-gateway.test.mjs tests/ai/runtime-sidecar-session-bridge.test.mjs tests/ai/runtime-sidecar-streaming.test.mjs tests/ai/ai-chat-runtime-subscription-boundary.test.mjs`

Expected: PASS

- [ ] **Step 4: Run the application build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/workspace/AIChat.tsx src/components/workspace/useAIChatSidecarSessionActions.ts src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts tests/ai/ai-chat-performance-boundary-source.test.mjs tests/ai/runtime-conversation-gateway-store-selector.test.mjs tests/ai/ai-chat-sidecar-session-actions-hook-boundary.test.mjs tests/ai/runtime-sidecar-session-bridge-source.test.mjs
git commit -m "chore: finish ai chat performance boundary cleanup"
```

## Rollout Notes

- Start with boundary correctness, not speculative memoization.
- Keep render-island props narrow and stable; do not pass the old big `conversation` object downward.
- If a specific panel still feels slow after this work, profile that panel separately instead of widening this refactor.

## Self-Review

**Spec coverage**
- Subscription splitting is covered by Tasks 1 and 2.
- Render isolation in `AIChat` is covered by Task 3.
- No-op sidecar/store guards are covered by Task 4.
- Cleanup and final verification are covered by Task 5.

**Placeholder scan**
- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every task names exact files, commands, and expected outcomes.

**Type consistency**
- The focused hooks consistently use the `useActiveConversation*` naming.
- The shell/render boundary consistently uses `projectId` as the selector input.
- The sidecar guard helper is consistently named `patchLiveStateIfChanged`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-10-ai-chat-performance-boundary-optimization-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
