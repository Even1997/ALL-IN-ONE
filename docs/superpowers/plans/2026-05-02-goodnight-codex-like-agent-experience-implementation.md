# GoodNight Codex-like Agent Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade GoodNight's desktop AI experience so complex work runs as a visible, resumable Codex-like agent thread with planning, approval-then-continue, and higher-quality step feedback, while demoting old Codex CLI semantics from the main product path.

**Architecture:** Keep the current GN Agent shell and runtime primitives, but add a first-class session layer between `AIChat` and the lower runtime flows. That session layer owns one structured turn model, one status machine, one plan model, one execution-step model, and one resume snapshot model. The UI consumes those structures instead of stitching together many local branches in `AIChat.tsx`.

**Tech Stack:** React 19, TypeScript, Zustand, existing GoodNight runtime/orchestration modules, Node test runner, Tauri desktop shell

---

### Task 1: Add the Agent Session Data Model and Store Plumbing

**Files:**
- Create: `src/modules/ai/runtime/session/agentSessionTypes.ts`
- Create: `src/modules/ai/runtime/session/agentSessionSelectors.ts`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Modify: `src/modules/ai/runtime/agentRuntimeTypes.ts`
- Test: `tests/ai/agent-session-types.test.mjs`
- Test: `tests/ai/agent-runtime-store.test.mjs`

- [ ] **Step 1: Write the failing type-coverage test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadTypes = async () =>
  import(`../../src/modules/ai/runtime/session/agentSessionTypes.ts?test=${Date.now()}`);

test('agent session types expose the codex-like turn session shape', async () => {
  const module = await loadTypes();

  assert.equal(typeof module.createEmptyAgentTurnSession, 'function');
  const session = module.createEmptyAgentTurnSession({
    id: 'turn-1',
    threadId: 'thread-1',
    providerId: 'codex',
    userPrompt: 'fix the bug',
  });

  assert.equal(session.status, 'idle');
  assert.equal(session.mode, 'direct');
  assert.deepEqual(session.executionSteps, []);
  assert.equal(session.resumeSnapshot, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/agent-session-types.test.mjs`
Expected: FAIL with module/file not found or missing export errors for `agentSessionTypes.ts`

- [ ] **Step 3: Add the new session types and a minimal constructor**

```ts
import type { AgentProviderId } from '../agentRuntimeTypes';

export type AgentTurnSessionStatus =
  | 'idle'
  | 'classifying'
  | 'planning'
  | 'waiting_approval'
  | 'executing'
  | 'blocked'
  | 'resumable'
  | 'completed'
  | 'failed';

export type AgentTurnSessionMode = 'direct' | 'plan_then_execute';

export type AgentPlanStep = {
  id: string;
  title: string;
  kind: 'analysis' | 'tool' | 'file' | 'approval' | 'reply';
  summary: string;
  needsApproval: boolean;
  expectedResult: string;
};

export type AgentExecutionStep = {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  toolName: string | null;
  resultSummary: string;
  userVisibleDetail: string;
  startedAt: number | null;
  finishedAt: number | null;
};

export type AgentResumeSnapshot = {
  turnId: string;
  resumeFromStepId: string | null;
  resumeReason: string;
  blockingRequirement: string | null;
  resumeActionLabel: string | null;
  lastStableOutput: string;
};

export type AgentTurnPlan = {
  summary: string;
  reason: string;
  riskLevel: 'low' | 'medium' | 'high';
  approvalStatus: 'not-required' | 'pending' | 'approved' | 'denied';
  affectedPaths: string[];
  steps: AgentPlanStep[];
};

export type AgentTurnSession = {
  id: string;
  threadId: string;
  providerId: AgentProviderId;
  userPrompt: string;
  status: AgentTurnSessionStatus;
  mode: AgentTurnSessionMode;
  plan: AgentTurnPlan | null;
  executionSteps: AgentExecutionStep[];
  resumeSnapshot: AgentResumeSnapshot | null;
  createdAt: number;
  updatedAt: number;
};

export const createEmptyAgentTurnSession = (input: {
  id: string;
  threadId: string;
  providerId: AgentProviderId;
  userPrompt: string;
}): AgentTurnSession => {
  const now = Date.now();
  return {
    id: input.id,
    threadId: input.threadId,
    providerId: input.providerId,
    userPrompt: input.userPrompt,
    status: 'idle',
    mode: 'direct',
    plan: null,
    executionSteps: [],
    resumeSnapshot: null,
    createdAt: now,
    updatedAt: now,
  };
};
```

- [ ] **Step 4: Extend the runtime store with session state**

```ts
import type { AgentTurnSession } from './session/agentSessionTypes';

type AgentRuntimeState = {
  sessionsByThread: Record<string, AgentTurnSession[]>;
  upsertTurnSession: (threadId: string, session: AgentTurnSession) => void;
  patchTurnSession: (
    threadId: string,
    turnId: string,
    updater: (session: AgentTurnSession) => AgentTurnSession,
  ) => void;
  // existing fields...
};

upsertTurnSession: (threadId, session) =>
  set((state) => ({
    sessionsByThread: {
      ...state.sessionsByThread,
      [threadId]: [
        session,
        ...(state.sessionsByThread[threadId] || []).filter((item) => item.id !== session.id),
      ].sort((left, right) => left.createdAt - right.createdAt),
    },
  })),

patchTurnSession: (threadId, turnId, updater) =>
  set((state) => ({
    sessionsByThread: {
      ...state.sessionsByThread,
      [threadId]: (state.sessionsByThread[threadId] || []).map((item) =>
        item.id === turnId ? updater(item) : item,
      ),
    },
  })),
```

- [ ] **Step 5: Add a focused selector helper**

```ts
import type { AgentTurnSession } from './agentSessionTypes';

export const getLatestTurnSession = (
  sessions: AgentTurnSession[] | null | undefined,
): AgentTurnSession | null => {
  if (!sessions || sessions.length === 0) {
    return null;
  }

  return sessions[sessions.length - 1] || null;
};
```

- [ ] **Step 6: Extend the existing runtime store test to cover session upsert/patch**

```js
test('agent runtime store upserts and patches turn sessions by thread', async () => {
  const { useAgentRuntimeStore } = await import(
    `../../src/modules/ai/runtime/agentRuntimeStore.ts?test=${Date.now()}`
  );

  useAgentRuntimeStore.setState({ sessionsByThread: {} });
  const state = useAgentRuntimeStore.getState();

  state.upsertTurnSession('thread-1', {
    id: 'turn-1',
    threadId: 'thread-1',
    providerId: 'codex',
    userPrompt: 'fix it',
    status: 'planning',
    mode: 'plan_then_execute',
    plan: null,
    executionSteps: [],
    resumeSnapshot: null,
    createdAt: 1,
    updatedAt: 1,
  });

  state.patchTurnSession('thread-1', 'turn-1', (session) => ({
    ...session,
    status: 'waiting_approval',
  }));

  const next = useAgentRuntimeStore.getState().sessionsByThread['thread-1'];
  assert.equal(next.length, 1);
  assert.equal(next[0].status, 'waiting_approval');
});
```

- [ ] **Step 7: Run the targeted tests**

Run: `node --test tests/ai/agent-session-types.test.mjs tests/ai/agent-runtime-store.test.mjs`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/modules/ai/runtime/session/agentSessionTypes.ts src/modules/ai/runtime/session/agentSessionSelectors.ts src/modules/ai/runtime/agentRuntimeStore.ts src/modules/ai/runtime/agentRuntimeTypes.ts tests/ai/agent-session-types.test.mjs tests/ai/agent-runtime-store.test.mjs
git commit -m "feat: add agent turn session model"
```

### Task 2: Add the Session State Machine and Plan-Gating Controller

**Files:**
- Create: `src/modules/ai/runtime/session/agentSessionStateMachine.ts`
- Create: `src/modules/ai/runtime/session/agentSessionController.ts`
- Modify: `src/modules/ai/runtime/approval/riskPolicy.ts`
- Modify: `src/modules/ai/runtime/orchestration/runtimeApprovalCoordinator.ts`
- Test: `tests/ai/agent-session-state-machine.test.mjs`
- Test: `tests/ai/agent-session-controller.test.mjs`

- [ ] **Step 1: Write the failing state-machine test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadStateMachine = async () =>
  import(`../../src/modules/ai/runtime/session/agentSessionStateMachine.ts?test=${Date.now()}`);

test('session state machine transitions planning to waiting_approval and executing', async () => {
  const { reduceAgentTurnSession } = await loadStateMachine();

  const base = {
    id: 'turn-1',
    threadId: 'thread-1',
    providerId: 'codex',
    userPrompt: 'edit src/App.tsx and run tests',
    status: 'planning',
    mode: 'plan_then_execute',
    plan: null,
    executionSteps: [],
    resumeSnapshot: null,
    createdAt: 1,
    updatedAt: 1,
  };

  const waiting = reduceAgentTurnSession(base, { type: 'plan_waiting_approval' });
  const running = reduceAgentTurnSession(waiting, { type: 'approval_granted' });

  assert.equal(waiting.status, 'waiting_approval');
  assert.equal(running.status, 'executing');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/agent-session-state-machine.test.mjs`
Expected: FAIL with missing module/export errors for `agentSessionStateMachine.ts`

- [ ] **Step 3: Add a minimal reducer for user-visible session states**

```ts
import type { AgentTurnSession } from './agentSessionTypes';

type AgentTurnSessionEvent =
  | { type: 'start_classifying' }
  | { type: 'enter_planning' }
  | { type: 'plan_waiting_approval' }
  | { type: 'approval_granted' }
  | { type: 'execution_blocked'; reason: string; actionLabel: string | null }
  | { type: 'execution_completed' }
  | { type: 'execution_failed'; reason: string };

export const reduceAgentTurnSession = (
  session: AgentTurnSession,
  event: AgentTurnSessionEvent,
): AgentTurnSession => {
  const updatedAt = Date.now();

  switch (event.type) {
    case 'start_classifying':
      return { ...session, status: 'classifying', updatedAt };
    case 'enter_planning':
      return { ...session, mode: 'plan_then_execute', status: 'planning', updatedAt };
    case 'plan_waiting_approval':
      return { ...session, status: 'waiting_approval', updatedAt };
    case 'approval_granted':
      return { ...session, status: 'executing', updatedAt };
    case 'execution_blocked':
      return {
        ...session,
        status: 'resumable',
        resumeSnapshot: {
          turnId: session.id,
          resumeFromStepId: null,
          resumeReason: event.reason,
          blockingRequirement: event.reason,
          resumeActionLabel: event.actionLabel,
          lastStableOutput: '',
        },
        updatedAt,
      };
    case 'execution_completed':
      return { ...session, status: 'completed', updatedAt };
    case 'execution_failed':
      return { ...session, status: 'failed', updatedAt };
  }
};
```

- [ ] **Step 4: Write the failing controller test for plan gating**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadController = async () =>
  import(`../../src/modules/ai/runtime/session/agentSessionController.ts?test=${Date.now()}`);

test('session controller forces plan mode for risky file-and-command work', async () => {
  const { decideAgentTurnMode } = await loadController();

  const result = decideAgentTurnMode({
    prompt: 'edit src/App.tsx, package.json, then run npm test',
    suggestedPlanMode: false,
    riskyWriteDetected: true,
    bashDetected: true,
    multiStepDetected: true,
  });

  assert.equal(result.mode, 'plan_then_execute');
  assert.equal(result.reason, 'risk-rule');
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `node --test tests/ai/agent-session-controller.test.mjs`
Expected: FAIL with missing export errors for `decideAgentTurnMode`

- [ ] **Step 6: Add the session controller decision helper**

```ts
export const decideAgentTurnMode = (input: {
  prompt: string;
  suggestedPlanMode: boolean;
  riskyWriteDetected: boolean;
  bashDetected: boolean;
  multiStepDetected: boolean;
}) => {
  if (input.riskyWriteDetected || input.bashDetected) {
    return {
      mode: 'plan_then_execute' as const,
      reason: 'risk-rule' as const,
    };
  }

  if (input.suggestedPlanMode || input.multiStepDetected) {
    return {
      mode: 'plan_then_execute' as const,
      reason: 'complexity' as const,
    };
  }

  return {
    mode: 'direct' as const,
    reason: 'direct' as const,
  };
};
```

- [ ] **Step 7: Add a helper that maps plan-mode approvals back into execution continuation**

```ts
export const buildPlanApprovalContinuation = (input: {
  onApprovedExecute: () => Promise<void>;
  onDeniedBlock: () => Promise<void>;
}) => ({
  onApprove: input.onApprovedExecute,
  onDeny: input.onDeniedBlock,
});
```

- [ ] **Step 8: Run the targeted tests**

Run: `node --test tests/ai/agent-session-state-machine.test.mjs tests/ai/agent-session-controller.test.mjs`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/modules/ai/runtime/session/agentSessionStateMachine.ts src/modules/ai/runtime/session/agentSessionController.ts src/modules/ai/runtime/approval/riskPolicy.ts src/modules/ai/runtime/orchestration/runtimeApprovalCoordinator.ts tests/ai/agent-session-state-machine.test.mjs tests/ai/agent-session-controller.test.mjs
git commit -m "feat: add agent session planning controller"
```

### Task 3: Surface Plan Cards, Execution Cards, and Resume Cards in the GN Agent Shell

**Files:**
- Create: `src/components/ai/gn-agent-shell/GNAgentPlanPanel.tsx`
- Create: `src/components/ai/gn-agent-shell/GNAgentTurnSummaryCards.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentStatusPanel.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentTimelinePanel.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentToolCallPanel.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Test: `tests/ai/agent-turn-ui.test.mjs`
- Test: `tests/ai/agent-runtime-timeline.test.mjs`

- [ ] **Step 1: Write the failing UI-structure test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('GN agent shell wires turn summary cards and a plan panel into the main layout', async () => {
  const chatPageSource = await readFile(chatPagePath, 'utf8');
  const chatSource = await readFile(chatPath, 'utf8');

  assert.match(chatPageSource, /GNAgentPlanPanel/);
  assert.match(chatPageSource, /GNAgentTurnSummaryCards/);
  assert.match(chatSource, /sessionsByThread|upsertTurnSession|patchTurnSession/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/agent-turn-ui.test.mjs`
Expected: FAIL because the new UI components and store session wiring do not exist in the shell yet

- [ ] **Step 3: Add the plan panel component**

```tsx
import React from 'react';
import type { AgentTurnSession } from '../../../modules/ai/runtime/session/agentSessionTypes';

export const GNAgentPlanPanel: React.FC<{
  session: AgentTurnSession | null;
}> = ({ session }) => {
  if (!session?.plan) {
    return (
      <section className="gn-agent-runtime-panel">
        <div className="gn-agent-runtime-panel-head">
          <strong>Plan</strong>
          <span>empty</span>
        </div>
        <p className="gn-agent-runtime-panel-empty">No structured plan for the current turn yet.</p>
      </section>
    );
  }

  return (
    <section className="gn-agent-runtime-panel">
      <div className="gn-agent-runtime-panel-head">
        <strong>Plan</strong>
        <span>{session.plan.riskLevel}</span>
      </div>
      <div className="gn-agent-runtime-panel-list">
        <article className="gn-agent-runtime-card">
          <strong>{session.plan.summary}</strong>
          <span>{session.plan.reason}</span>
        </article>
        {session.plan.steps.map((step) => (
          <article key={step.id} className="gn-agent-runtime-card">
            <strong>{step.title}</strong>
            <span>{step.summary}</span>
            <code>{step.needsApproval ? 'approval' : 'auto'}</code>
          </article>
        ))}
      </div>
    </section>
  );
};
```

- [ ] **Step 4: Add the chat-stream summary cards component**

```tsx
import React from 'react';
import type { AgentTurnSession } from '../../../modules/ai/runtime/session/agentSessionTypes';

export const GNAgentTurnSummaryCards: React.FC<{
  session: AgentTurnSession | null;
}> = ({ session }) => {
  if (!session) {
    return null;
  }

  return (
    <div className="gn-agent-turn-summary-cards">
      <section className="chat-structured-card summary">
        <strong>{session.status}</strong>
        <p>{session.plan?.summary || session.userPrompt}</p>
      </section>
      {session.executionSteps.slice(-3).map((step) => (
        <section key={step.id} className="chat-structured-card next-step">
          <strong>{step.title}</strong>
          <p>{step.userVisibleDetail || step.resultSummary}</p>
        </section>
      ))}
      {session.resumeSnapshot ? (
        <section className="chat-structured-card conflict">
          <strong>{session.resumeSnapshot.resumeActionLabel || 'Resume available'}</strong>
          <p>{session.resumeSnapshot.resumeReason}</p>
        </section>
      ) : null}
    </div>
  );
};
```

- [ ] **Step 5: Wire the new components into `GNAgentChatPage.tsx`**

```tsx
import { GNAgentPlanPanel } from './GNAgentPlanPanel';
import { GNAgentTurnSummaryCards } from './GNAgentTurnSummaryCards';

const latestTurnSession = useAgentRuntimeStore((state) =>
  activeSessionId ? (state.sessionsByThread[activeSessionId] || []).slice(-1)[0] || null : null
);

<div className="gn-agent-runtime-main gn-agent-shell-chat-stack">
  <GNAgentStatusPanel />
  <GNAgentTurnSummaryCards session={latestTurnSession} />
  <AIChat
    variant={variant}
    runtimeConfigIdOverride={runtimeConfigIdOverride}
    providerExecutionMode={providerId === 'classic' ? null : providerId}
  />
</div>

<aside className="gn-agent-runtime-sidebar">
  <GNAgentPlanPanel session={latestTurnSession} />
  <GNAgentContextPanel context={contextSnapshot} />
  <GNAgentToolCallPanel toolCalls={toolCalls} />
  <GNAgentMemoryInbox ... />
  <GNAgentMemoryPanel />
</aside>
```

- [ ] **Step 6: Upgrade timeline/tool/status panels to prefer session state over loose raw counts**

```tsx
const latestTurnSession = useAgentRuntimeStore((state) =>
  activeThreadId ? (state.sessionsByThread[activeThreadId] || []).slice(-1)[0] || null : null
);

<strong>Timeline</strong>
<span>{latestTurnSession?.status || 'idle'}</span>
```

```tsx
{toolCalls.map((toolCall, index) => (
  <article key={toolCall.id} className="gn-agent-runtime-card">
    <strong>{toolCall.name}</strong>
    <span>{toolCall.resultPreview || 'Waiting for tool result...'}</span>
    <code>{index < (latestTurnSession?.executionSteps.length || 0) ? 'step-linked' : toolStatusLabels[toolCall.status]}</code>
  </article>
))}
```

- [ ] **Step 7: Run the UI-structure tests**

Run: `node --test tests/ai/agent-turn-ui.test.mjs tests/ai/agent-runtime-timeline.test.mjs`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/ai/gn-agent-shell/GNAgentPlanPanel.tsx src/components/ai/gn-agent-shell/GNAgentTurnSummaryCards.tsx src/components/ai/gn-agent-shell/GNAgentChatPage.tsx src/components/ai/gn-agent-shell/GNAgentStatusPanel.tsx src/components/ai/gn-agent-shell/GNAgentTimelinePanel.tsx src/components/ai/gn-agent-shell/GNAgentToolCallPanel.tsx src/components/workspace/AIChat.tsx tests/ai/agent-turn-ui.test.mjs tests/ai/agent-runtime-timeline.test.mjs
git commit -m "feat: surface plan and execution session UI"
```

### Task 4: Move AIChat to Session-Driven Orchestration and Remove Codex CLI Product Semantics

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/modules/ai/chat/runtimeRegistry.ts`
- Modify: `src/components/ai/workspaces/CodexWorkspace.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx`
- Delete or stop importing: `src/modules/ai/provider-sessions/codexSessionStore.ts`
- Test: `tests/ai/chat-direct-runtime-routing.test.mjs`
- Test: `tests/ai/gn-agent-runtime-scaffold.test.mjs`
- Test: `tests/ai/codex-workspace-semantics.test.mjs`

- [ ] **Step 1: Write the failing semantics test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeRegistryPath = path.resolve(__dirname, '../../src/modules/ai/chat/runtimeRegistry.ts');

test('runtime registry no longer markets codex as a CLI-only local runtime', async () => {
  const source = await readFile(runtimeRegistryPath, 'utf8');

  assert.match(source, /label: 'Codex'/);
  assert.doesNotMatch(source, /title: 'Codex CLI'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/codex-workspace-semantics.test.mjs`
Expected: FAIL because `runtimeRegistry.ts` still contains `Codex CLI`

- [ ] **Step 3: Replace the Codex runtime registry wording**

```ts
{
  id: 'codex',
  label: 'Codex',
  title: 'Codex Agent',
  runtime: 'built-in',
  pluginType: 'chat-runtime',
  source: 'built-in',
},
```

- [ ] **Step 4: Move the main submit path in `AIChat.tsx` to upsert/patch the current turn session**

```ts
const upsertTurnSession = useAgentRuntimeStore((state) => state.upsertTurnSession);
const patchTurnSession = useAgentRuntimeStore((state) => state.patchTurnSession);

const turnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

upsertTurnSession(runtimeStoreThreadId, createEmptyAgentTurnSession({
  id: turnId,
  threadId: runtimeStoreThreadId,
  providerId: runtimeProviderId,
  userPrompt: cleanedContent,
}));

patchTurnSession(runtimeStoreThreadId, turnId, (session) =>
  reduceAgentTurnSession(session, { type: 'start_classifying' }),
);
```

- [ ] **Step 5: Patch planning, approval, execution, blocked, completed, and failed states at each branch**

```ts
patchTurnSession(runtimeStoreThreadId, turnId, (session) => ({
  ...reduceAgentTurnSession(session, { type: 'enter_planning' }),
  plan: proposedPlan,
}));

patchTurnSession(runtimeStoreThreadId, turnId, (session) =>
  reduceAgentTurnSession(session, { type: 'plan_waiting_approval' }),
);

patchTurnSession(runtimeStoreThreadId, turnId, (session) =>
  reduceAgentTurnSession(session, { type: 'approval_granted' }),
);

patchTurnSession(runtimeStoreThreadId, turnId, (session) => ({
  ...session,
  executionSteps: nextExecutionSteps,
  updatedAt: Date.now(),
}));
```

- [ ] **Step 6: Remove unused Codex session-store imports and references**

```ts
// Delete the old provider-specific codex session store if no runtime path imports it.
// Replace any remaining references with the unified AI chat session + runtime session model.
```

- [ ] **Step 7: Run the targeted tests**

Run: `node --test tests/ai/chat-direct-runtime-routing.test.mjs tests/ai/gn-agent-runtime-scaffold.test.mjs tests/ai/codex-workspace-semantics.test.mjs`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/workspace/AIChat.tsx src/modules/ai/chat/runtimeRegistry.ts src/components/ai/workspaces/CodexWorkspace.tsx src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx tests/ai/chat-direct-runtime-routing.test.mjs tests/ai/gn-agent-runtime-scaffold.test.mjs tests/ai/codex-workspace-semantics.test.mjs
git commit -m "feat: shift codex experience to session-driven desktop agent"
```

### Task 5: Verify the Full Experience and Capture Remaining Follow-ups

**Files:**
- Modify: `tests/ai/agent-chat-runtime-ui.test.mjs`
- Modify: `tests/ai/runtime-replay-recovery.test.mjs`
- Modify: `tests/ai/runtime-turn-outcome-flow.test.mjs`
- Modify: `docs/superpowers/specs/2026-05-02-goodnight-codex-like-agent-experience-design.zh-CN.md`
- Test: existing targeted AI runtime test set

- [ ] **Step 1: Add an end-to-end style source test for the new turn-session wiring**

```js
test('AI chat runtime wiring includes planning, approval, execution, and resume session hooks', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /createEmptyAgentTurnSession/);
  assert.match(source, /reduceAgentTurnSession/);
  assert.match(source, /upsertTurnSession/);
  assert.match(source, /patchTurnSession/);
});
```

- [ ] **Step 2: Run the expanded targeted suite**

Run: `node --test tests/ai/agent-session-types.test.mjs tests/ai/agent-session-state-machine.test.mjs tests/ai/agent-session-controller.test.mjs tests/ai/agent-turn-ui.test.mjs tests/ai/agent-runtime-store.test.mjs tests/ai/agent-chat-runtime-ui.test.mjs tests/ai/runtime-replay-recovery.test.mjs tests/ai/runtime-turn-outcome-flow.test.mjs tests/ai/codex-workspace-semantics.test.mjs`
Expected: PASS

- [ ] **Step 3: Run the project build**

Run: `npm run build`
Expected: PASS with no TypeScript or bundling errors

- [ ] **Step 4: Record any post-plan scope follow-ups back into the spec**

```md
## Post-Implementation Follow-ups

- richer pause / retry / feed controls
- better automatic complexity detection
- optional provider-specific polish after the unified session model settles
```

- [ ] **Step 5: Commit**

```bash
git add tests/ai/agent-chat-runtime-ui.test.mjs tests/ai/runtime-replay-recovery.test.mjs tests/ai/runtime-turn-outcome-flow.test.mjs docs/superpowers/specs/2026-05-02-goodnight-codex-like-agent-experience-design.zh-CN.md
git commit -m "test: verify codex-like agent session experience"
```

## Self-Review

### Spec coverage

- `线程状态机 + 可恢复` is covered by Task 1, Task 2, and Task 5.
- `计划卡片 + 批准后继续` is covered by Task 2, Task 3, and Task 4.
- `高质量步骤回显` is covered by Task 3 and Task 4.
- `Codex CLI` 语义降级 is covered by Task 4.

### Placeholder scan

- No step says “implement later”, “add tests”, or “handle edge cases” without concrete code or commands.
- Each task includes exact file paths and exact verification commands.

### Type consistency

- The same names are used throughout: `AgentTurnSession`, `AgentTurnPlan`, `AgentExecutionStep`, `AgentResumeSnapshot`, `createEmptyAgentTurnSession`, `reduceAgentTurnSession`, `decideAgentTurnMode`, `upsertTurnSession`, and `patchTurnSession`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-02-goodnight-codex-like-agent-experience-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
