# UI Subscribes To Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `AIChat.tsx` a thin UI subscriber so runtime turn orchestration, live state, replay, approvals, tool execution, and assistant timeline mutation are owned by runtime modules.

**Architecture:** Keep the current React + Zustand + TypeScript runtime, but move execution control out of `src/components/workspace/AIChat.tsx` into a non-React runtime coordinator under `src/modules/ai/runtime/orchestration/`. UI will submit an intent to the coordinator and then render state from `useRuntimeConversationGateway`; the coordinator writes to existing stores and emits the same assistant timeline/runtime events as today. This preserves the current Tauri/Rust backend and makes a later Node/Bun sidecar migration easier because the future sidecar can implement the same coordinator contract.

**Tech Stack:** React 19, TypeScript, Zustand, Tauri commands, existing AI runtime modules, Node test runner.

---

## Scope

This plan intentionally avoids a full Node.js rewrite. The first target is a runtime boundary: UI should not import or directly call the built-in agent turn loop, replay execution controller, tool executor, MCP turn executor, or runtime store mutation actions for turn execution.

Out of scope for this plan:

- Moving execution into a Node/Bun sidecar.
- Redesigning chat visuals.
- Replacing existing stores.
- Changing model/tool behavior.
- Removing legacy project-file flows unless directly required by the extraction.

## Current Boundary Problem

`src/components/workspace/AIChat.tsx` already subscribes to `useRuntimeConversationGateway`, but it still owns too much runtime work:

- creates runtime/replay execution controllers
- constructs turn/session/task/run records
- calls `executeRuntimeBuiltInAgentTurn`
- instantiates `ToolExecutor`
- handles tool approval and question waits
- writes live state and tool calls directly into `useAgentRuntimeStore`
- mutates assistant timelines during streaming/tool execution
- routes MCP/local/built-in execution inside the component

The target is:

```text
AIChat UI
  -> submitRuntimeChatTurn(request)
  -> runtime coordinator owns execution
  -> runtime/chat stores are updated
  -> useRuntimeConversationGateway projects state
  -> AIChat renders projection
```

## Target File Structure

- Create: `src/modules/ai/runtime/orchestration/runtimeChatTurnTypes.ts`
  - Defines coordinator request, dependency ports, result shape, and narrow UI callback ports.
- Create: `src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts`
  - Owns the turn lifecycle previously embedded in `AIChat.tsx`.
- Create: `src/modules/ai/runtime/orchestration/runtimeChatTurnStoreBridge.ts`
  - Centralizes writes to `useAIChatStore`, `useAgentRuntimeStore`, `useApprovalStore`, and `useRuntimeMcpStore`.
- Create: `src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts`
  - Owns streaming assembler, model event handling, live-state patches, and assistant timeline draft/finalization.
- Create: `src/modules/ai/runtime/orchestration/runtimeChatTurnTools.ts`
  - Owns built-in `ToolExecutor`, `AskUserQuestion`, nested agent tool, approval gating, and tool-call live-state updates.
- Create: `src/modules/ai/runtime/orchestration/runtimeChatTurnContext.ts`
  - Builds conversation history, project instruction references, context snapshot, memory entries, active skills, and allowed tools.
- Modify: `src/components/workspace/AIChat.tsx`
  - Becomes a subscriber/container: composer UX, menus, modals, render functions, and one call to `submitRuntimeChatTurn`.
- Modify: `src/components/workspace/tools.ts`
  - Only if needed: export tool types/executor from a runtime-owned path or re-export from a compatibility wrapper.
- Add tests under `tests/ai/`
  - Boundary/source tests first, then helper/coordinator behavior tests.

---

## Task 1: Lock The Boundary With Source Tests

**Files:**
- Create: `tests/ai/ai-chat-runtime-subscription-boundary.test.mjs`
- Test: `tests/ai/ai-chat-runtime-subscription-boundary.test.mjs`

- [ ] **Step 1: Add a boundary test for what UI may import**

Add assertions that `AIChat.tsx` keeps `useRuntimeConversationGateway` but eventually stops importing runtime execution internals:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('AIChat subscribes to runtime projection instead of owning runtime execution', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /useRuntimeConversationGateway/);
  assert.doesNotMatch(source, /executeRuntimeBuiltInAgentTurn/);
  assert.doesNotMatch(source, /executeRuntimeMcpTurn/);
  assert.doesNotMatch(source, /createRuntimeReplayExecutionController/);
  assert.doesNotMatch(source, /new ToolExecutor\(/);
});
```

- [ ] **Step 2: Add a companion test for the new coordinator ownership**

Assert the coordinator imports the execution pieces after it exists:

```js
const coordinatorPath = path.resolve(
  __dirname,
  '../../src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts',
);

test('runtime coordinator owns runtime execution dependencies', async () => {
  const source = await readFile(coordinatorPath, 'utf8');

  assert.match(source, /executeRuntimeBuiltInAgentTurn/);
  assert.match(source, /createRuntimeReplayExecutionController/);
});
```

- [ ] **Step 3: Run the boundary test and confirm it fails for the current code**

Run:

```powershell
node --test tests/ai/ai-chat-runtime-subscription-boundary.test.mjs
```

Expected before implementation: FAIL because `AIChat.tsx` still owns runtime execution.

---

## Task 2: Define The Coordinator Contract

**Files:**
- Create: `src/modules/ai/runtime/orchestration/runtimeChatTurnTypes.ts`
- Create: `tests/ai/runtime-chat-turn-types.test.mjs`

- [ ] **Step 1: Add the request and result types**

Define a narrow request shape. Keep UI-specific inputs limited to session/project/user intent; pass runtime IO through dependency ports.

```ts
import type { AgentProviderId } from '../agentRuntimeTypes';
import type { PermissionMode } from '../approval/approvalTypes';
import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes';

export type RuntimeChatTurnRequest = {
  projectId: string;
  projectName: string;
  targetSessionId: string;
  runtimeThreadId: string | null;
  providerId: AgentProviderId;
  rawUserInput: string;
  cleanedUserInput: string;
  selectedRuntimeConfigId: string | null;
  contextWindowTokens: number;
  permissionMode: PermissionMode;
  activeSkills: RuntimeSkillDefinition[];
  createdAt?: number;
};

export type RuntimeChatTurnResult = {
  runId: string;
  assistantMessageId: string;
  runtimeStoreThreadId: string;
  runtimeThreadId: string;
  finalContent: string;
};
```

- [ ] **Step 2: Add runtime dependency ports**

The dependency object makes the coordinator testable and makes later Node.js migration concrete.

```ts
export type RuntimeChatTurnPorts = {
  resolveProjectRootById: (projectId: string) => Promise<string>;
  executeRuntimePrompt: (input: {
    providerId: AgentProviderId;
    sessionId: string;
    configId: string | null;
    systemPrompt: string;
    prompt: string;
    signal?: AbortSignal;
    onEvent?: (event: { kind: 'thinking' | 'text'; delta: string }) => void;
  }) => Promise<string>;
  persistRuntimeThread: (input: {
    projectId: string;
    title: string;
    providerId: AgentProviderId;
  }) => Promise<{ id: string; title: string; providerId: AgentProviderId; createdAt: number; updatedAt: number }>;
};
```

- [ ] **Step 3: Add a type/source test**

Use a lightweight source test first because this repo already uses source-level architecture tests heavily:

```js
test('runtime chat turn types expose a sidecar-friendly coordinator contract', async () => {
  const source = await readFile(
    path.resolve(__dirname, '../../src/modules/ai/runtime/orchestration/runtimeChatTurnTypes.ts'),
    'utf8',
  );

  assert.match(source, /RuntimeChatTurnRequest/);
  assert.match(source, /RuntimeChatTurnPorts/);
  assert.match(source, /RuntimeChatTurnResult/);
});
```

- [ ] **Step 4: Run the type/source test**

Run:

```powershell
node --test tests/ai/runtime-chat-turn-types.test.mjs
```

Expected after implementation: PASS.

---

## Task 3: Extract Store Writes Into A Runtime Store Bridge

**Files:**
- Create: `src/modules/ai/runtime/orchestration/runtimeChatTurnStoreBridge.ts`
- Create: `tests/ai/runtime-chat-turn-store-bridge.test.mjs`
- Modify: `src/components/workspace/AIChat.tsx`

- [ ] **Step 1: Create bridge helpers for assistant/user message mutations**

Move the common message mutations out of `AIChat.tsx`:

```ts
export type RuntimeChatMessageBridge = {
  appendUserMessage: (content: string, runId: string) => string;
  appendAssistantMessage: (runId: string) => string;
  updateAssistantTimeline: (
    assistantMessageId: string,
    updater: (timeline: AssistantTimelineEvent[]) => AssistantTimelineEvent[],
  ) => void;
  failAssistantMessage: (assistantMessageId: string, message: string) => void;
};
```

- [ ] **Step 2: Create bridge helpers for runtime state mutations**

Move runtime writes behind a small bridge:

```ts
export type RuntimeChatStateBridge = {
  bindThread: (runtimeThreadId: string) => void;
  startTurn: (input: { turnId: string; prompt: string; createdAt: number }) => void;
  patchLiveState: (
    threadId: string,
    updater:
      | Partial<AgentRuntimeLiveState>
      | ((state: AgentRuntimeLiveState) => AgentRuntimeLiveState),
  ) => void;
  setToolCalls: (threadId: string, toolCalls: RuntimeToolStep[]) => void;
  completeTurn: (finalContent: string) => Promise<void>;
  failTurn: (message: string) => Promise<void>;
};
```

- [ ] **Step 3: Keep the first extraction behavior-preserving**

In this task, `AIChat.tsx` may still call the bridge. Do not move the whole submit function yet. The only goal is to reduce direct store mutation sprawl before moving orchestration.

- [ ] **Step 4: Run focused regression tests**

Run:

```powershell
node --test tests/ai/assistant-timeline-events.test.mjs tests/ai/ai-chat-store.test.mjs tests/ai/agent-runtime-store.test.mjs tests/ai/runtime-chat-turn-store-bridge.test.mjs
```

Expected: PASS.

---

## Task 4: Extract Streaming And Tool Event Handling

**Files:**
- Create: `src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts`
- Create: `src/modules/ai/runtime/orchestration/runtimeChatTurnTools.ts`
- Create: `tests/ai/runtime-chat-turn-streaming.test.mjs`
- Create: `tests/ai/runtime-chat-turn-tools.test.mjs`
- Modify: `src/components/workspace/AIChat.tsx`

- [ ] **Step 1: Move model event handling into `runtimeChatTurnStreaming.ts`**

Extract the code that currently:

- appends text/thinking deltas to `createRuntimeStreamingMessageAssembler`
- updates live state with `Reasoning` / `Streaming response`
- pushes streaming assistant timeline drafts
- finalizes the assistant timeline after `agentTurn.finalContent`

The exported API should be small:

```ts
export const createRuntimeChatStreamingController = (input: {
  assistantMessageId: string;
  bridge: RuntimeChatMessageBridge & Pick<RuntimeChatStateBridge, 'patchLiveState'>;
  runtimeStoreThreadId: string;
  baseTimeline: AssistantTimelineEvent[];
}) => ({
  onModelEvent(event: AITextStreamEvent): void;
  markToolBoundary(): void;
  finalize(finalContent: string, toolCalls: RuntimeToolStep[]): string;
  clear(): void;
});
```

- [ ] **Step 2: Move tool approval/question/nested-agent handling into `runtimeChatTurnTools.ts`**

Extract:

- `ToolExecutor` creation
- built-in risky tool approval checks
- `AskUserQuestion` pending question lifecycle
- nested `agent` tool execution and team-run live-state updates
- `onToolCallsChange` live-state and timeline sync

- [ ] **Step 3: Leave callback ports for UI-only pending interactions**

The coordinator may need a port for UI question/approval promises, but UI should not know how the tool loop works:

```ts
export type RuntimeChatInteractionPort = {
  waitForQuestionAnswer: (input: RuntimeQuestionPayload) => Promise<Record<string, string>>;
  waitForApproval: (input: RuntimePendingApprovalAction) => Promise<boolean>;
};
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
node --test tests/ai/runtime-streaming-assembler.test.mjs tests/ai/runtime-streaming-message-assembler.test.mjs tests/ai/runtime-chat-turn-streaming.test.mjs tests/ai/runtime-chat-turn-tools.test.mjs tests/ai/agent-approval-store.test.mjs tests/ai/agent-event-dispatch.test.mjs
```

Expected: PASS.

---

## Task 5: Move Built-In Turn Orchestration Into The Runtime Coordinator

**Files:**
- Create: `src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts`
- Create: `tests/ai/runtime-chat-turn-coordinator.test.mjs`
- Modify: `src/components/workspace/AIChat.tsx`

- [ ] **Step 1: Move the built-in runtime path from `AIChat.tsx`**

Move the code path that starts at runtime thread resolution and ends after `completeTurnSession(normalizedFinalContent)` into `submitRuntimeChatTurn`.

The coordinator should own:

- runtime thread creation/binding
- replay execution controller
- memory/context snapshot
- turn session/task/run records
- built-in runtime turn execution
- timeline and activity append
- checkpoint persistence
- error/failure handling

- [ ] **Step 2: Keep the UI call site narrow**

`AIChat.tsx` should call one coordinator method:

```ts
await submitRuntimeChatTurn({
  request,
  ports,
  interactionPort,
  abortSignal: abortControllerRef.current?.signal,
});
```

- [ ] **Step 3: Preserve stop behavior**

Keep `handleStopGeneration` in UI, but make it only abort the active coordinator run and commit/clear visible draft through the bridge.

- [ ] **Step 4: Run built-in runtime tests**

Run:

```powershell
node --test tests/ai/execute-runtime-built-in-agent-turn.test.mjs tests/ai/execute-runtime-built-in-agent-turn-standalone.test.mjs tests/ai/execute-runtime-built-in-agent-turn-grounding.test.mjs tests/ai/runtime-tool-loop.test.mjs tests/ai/runtime-chat-turn-coordinator.test.mjs
```

Expected: PASS.

---

## Task 6: Move MCP And Local Agent Turn Paths Behind The Same Coordinator

**Files:**
- Modify: `src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts`
- Modify: `src/modules/ai/runtime/orchestration/runtimeChatTurnTools.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Add or modify: `tests/ai/chat-runtime-approval-routing.test.mjs`
- Add or modify: `tests/ai/runtime-mcp-flow.test.mjs`
- Add or modify: `tests/ai/runtime-local-agent-flow.test.mjs`

- [ ] **Step 1: Move MCP command execution out of `AIChat.tsx`**

`AIChat.tsx` may parse composer text for UI menu behavior, but actual MCP turn execution should live in the coordinator and call `executeRuntimeMcpTurn`.

- [ ] **Step 2: Move local agent/team decision flow out of `AIChat.tsx`**

Extract local agent approval, execution, and timeline updates so UI only renders approval/question/runtime projection state.

- [ ] **Step 3: Normalize provider selection inside the coordinator**

The coordinator should decide among:

- built-in
- MCP
- local agent
- team/fork skill

Use existing helper behavior and do not change routing semantics.

- [ ] **Step 4: Run local/MCP focused tests**

Run:

```powershell
node --test tests/ai/chat-runtime-approval-routing.test.mjs tests/ai/chat-runtime-approval-coordinator-routing.test.mjs tests/ai/runtime-mcp-flow.test.mjs tests/ai/runtime-local-agent-flow.test.mjs tests/ai/runtime-project-file-flow.test.mjs
```

Expected: PASS.

---

## Task 7: Slim `AIChat.tsx` To A Subscriber Container

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `tests/ai/ai-chat-runtime-subscription-boundary.test.mjs`

- [ ] **Step 1: Remove execution imports from `AIChat.tsx`**

Remove direct imports of:

- `executeRuntimeBuiltInAgentTurn`
- `executeRuntimeMcpTurn`
- `createRuntimeReplayExecutionController`
- `ToolExecutor`
- direct runtime turn/session mutation helpers that only support execution

- [ ] **Step 2: Keep UI responsibilities local**

`AIChat.tsx` should still own:

- collapsed/expanded shell state
- composer text and keyboard handling
- reference search and slash command menus
- settings modal
- render functions/cards
- call into `submitRuntimeChatTurn`
- render `useRuntimeConversationGateway` projection

- [ ] **Step 3: Run the boundary test**

Run:

```powershell
node --test tests/ai/ai-chat-runtime-subscription-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Check file size trend**

Run:

```powershell
(Get-Content .\src\components\workspace\AIChat.tsx).Length
```

Expected: lower than the current ~7,100+ lines. The exact line count is not the success criterion; removing runtime execution ownership is.

---

## Task 8: Final Verification

**Files:**
- Modify: all files touched above

- [ ] **Step 1: Run the AI/runtime focused suite**

Run:

```powershell
node --test tests/ai/runtime-chat-turn-types.test.mjs tests/ai/runtime-chat-turn-store-bridge.test.mjs tests/ai/runtime-chat-turn-streaming.test.mjs tests/ai/runtime-chat-turn-tools.test.mjs tests/ai/runtime-chat-turn-coordinator.test.mjs tests/ai/ai-chat-runtime-subscription-boundary.test.mjs tests/ai/runtime-conversation-gateway.test.mjs tests/ai/agent-runtime-store.test.mjs tests/ai/assistant-timeline-events.test.mjs tests/ai/agent-event-dispatch.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run the existing runtime behavior tests most likely to regress**

Run:

```powershell
node --test tests/ai/execute-runtime-built-in-agent-turn.test.mjs tests/ai/execute-runtime-built-in-agent-turn-standalone.test.mjs tests/ai/runtime-tool-loop.test.mjs tests/ai/runtime-mcp-flow.test.mjs tests/ai/runtime-local-agent-flow.test.mjs tests/ai/runtime-project-file-flow.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs tests/ai/agent-chat-runtime-ui.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```powershell
npm run build
```

Expected: PASS.

---

## Success Criteria

- `AIChat.tsx` uses `useRuntimeConversationGateway` for runtime state reads.
- `AIChat.tsx` no longer directly imports the runtime execution loops/controllers/tools.
- Turn execution can be tested without mounting React.
- Existing assistant timeline, approvals, questions, replay, tool calls, and live status still render through existing projections.
- A future Node/Bun sidecar can replace `submitRuntimeChatTurn` behind the same request/result/event contract instead of rewriting UI.

## Recommended Execution Order

Do this in two commits at minimum:

1. Contract + bridge + streaming/tool extraction.
2. Coordinator migration + AIChat slimming + verification.

If the first commit grows too large, split it after Task 3. The important thing is that every commit keeps the app behaviorally equivalent and tests passing.
