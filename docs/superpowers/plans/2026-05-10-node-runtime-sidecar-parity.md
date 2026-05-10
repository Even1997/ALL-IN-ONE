# Node Runtime Sidecar Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the remaining AI runtime parity gaps into the Node sidecar so the desktop frontend only submits commands and subscribes to runtime events.

**Architecture:** Extend the shared runtime protocol first, then move provider streaming, MCP, replay/checkpoint, and team-run orchestration into `apps/runtime`, and finally remove the remaining frontend-driven runtime behaviors so the bridge only projects sidecar state. Each phase keeps snapshot hydration compatible while moving live behavior to explicit sidecar events.

**Tech Stack:** Node.js sidecar, TypeScript, local HTTP + WebSocket protocol, Zustand projection stores, Tauri shell bootstrap, Node test runner

---

## File Map

**Shared protocol and client**
- Modify: `packages/runtime-protocol/src/index.ts`
- Modify: `packages/runtime-protocol/src/index.d.ts`
- Modify: `packages/runtime-client/src/index.ts`

**Node sidecar runtime**
- Modify: `apps/runtime/src/index.ts`
- Modify: `apps/runtime/src/nodeRuntimeToolExecutor.ts`
- Create: `apps/runtime/src/nodeRuntimeProviderClient.ts`
- Create: `apps/runtime/src/nodeRuntimeReplayStore.ts`
- Create: `apps/runtime/src/nodeRuntimeMcpRegistry.ts`
- Create: `apps/runtime/src/nodeRuntimeTeamRunExecutor.ts`

**Desktop bridge and projection**
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Modify: `src/modules/runtime-sidecar/desktopRuntimeSidecar.ts`
- Modify: `src/components/workspace/useAIChatRuntimeInteractionState.ts`
- Modify: `src/components/workspace/useAIChatSidecarSessionActions.ts`
- Modify: `src/components/workspace/AIChat.tsx`

**Reference runtime logic to migrate or wrap**
- Read / adapt: `src/modules/ai/core/AIService.ts`
- Read / adapt: `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
- Read / adapt: `src/modules/ai/runtime/orchestration/runtimeChatTurnCoordinator.ts`
- Read / adapt: `src/modules/ai/runtime/orchestration/executeRuntimeMcpTurn.ts`
- Read / adapt: `src/modules/ai/runtime/mcp/runtimeMcpClient.ts`
- Read / adapt: `src/modules/ai/runtime/mcp/runtimeMcpFlow.ts`
- Read / adapt: `src/modules/ai/runtime/replay/runtimeReplayClient.ts`
- Read / adapt: `src/modules/ai/runtime/replay/runtimeReplayRecovery.ts`
- Read / adapt: `src/modules/ai/runtime/teams/teamOrchestrator.ts`

**Tests**
- Modify: `tests/ai/runtime-sidecar-turn-submit.test.mjs`
- Modify: `tests/ai/runtime-sidecar-session-bridge-source.test.mjs`
- Modify: `tests/ai/runtime-sidecar-session-bridge.test.mjs`
- Create: `tests/ai/runtime-sidecar-streaming.test.mjs`
- Create: `tests/ai/runtime-sidecar-mcp.test.mjs`
- Create: `tests/ai/runtime-sidecar-replay.test.mjs`
- Create: `tests/ai/runtime-sidecar-team-run.test.mjs`
- Reuse: `tests/ai/runtime-mcp-flow.test.mjs`
- Reuse: `tests/ai/runtime-replay-recovery.test.mjs`
- Reuse: `tests/ai/runtime-streaming-assembler.test.mjs`

### Task 1: Extend The Protocol For Full Sidecar Ownership

**Files:**
- Modify: `packages/runtime-protocol/src/index.ts`
- Modify: `packages/runtime-protocol/src/index.d.ts`
- Modify: `packages/runtime-client/src/index.ts`
- Test: `tests/ai/runtime-sidecar-session-bridge-source.test.mjs`

- [ ] **Step 1: Write the failing protocol boundary test**

```js
test('runtime sidecar bridge listens for parity protocol events', async () => {
  const source = await readFile(bridgePath, 'utf8');

  assert.match(source, /event\.type === 'turn\.delta'/);
  assert.match(source, /event\.type === 'tool\.updated'/);
  assert.match(source, /event\.type === 'checkpoint\.saved'/);
  assert.match(source, /event\.type === 'background_task\.updated'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/runtime-sidecar-session-bridge-source.test.mjs`

Expected: FAIL because the bridge only listens to the currently implemented event subset.

- [ ] **Step 3: Add the missing protocol event and command types**

```ts
export type RuntimeEventEnvelope =
  | { type: 'turn.delta'; emittedAt: number; payload: { sessionId: string; messageId: string; delta: string } }
  | { type: 'tool.updated'; emittedAt: number; payload: { sessionId: string; messageId: string; toolCall: RuntimeToolCallRecord } }
  | { type: 'checkpoint.saved'; emittedAt: number; payload: { sessionId: string; checkpoint: RuntimeCheckpointRecord } }
  | { type: 'background_task.updated'; emittedAt: number; payload: { sessionId: string; task: RuntimeBackgroundTaskRecord } }
  | { type: 'team_run.updated'; emittedAt: number; payload: { sessionId: string; teamRun: RuntimeTeamRunRecord } };

export type RuntimeCheckpointRewindInput = {
  sessionId: string;
  checkpointId: string;
};
```

- [ ] **Step 4: Expose client methods for the new commands**

```ts
export class RuntimeSidecarClient {
  async rewindCheckpoint(input: RuntimeCheckpointRewindInput) {
    return this.post('/checkpoints/rewind', input);
  }

  async listCheckpoints(sessionId: string) {
    return this.get(`/sessions/${sessionId}/checkpoints`);
  }
}
```

- [ ] **Step 5: Run the boundary test to verify it passes**

Run: `node --test tests/ai/runtime-sidecar-session-bridge-source.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/runtime-protocol/src/index.ts packages/runtime-protocol/src/index.d.ts packages/runtime-client/src/index.ts tests/ai/runtime-sidecar-session-bridge-source.test.mjs
git commit -m "feat: extend runtime protocol for sidecar parity"
```

### Task 2: Move Provider-Level Streaming And Token Usage Into The Sidecar

**Files:**
- Create: `apps/runtime/src/nodeRuntimeProviderClient.ts`
- Modify: `apps/runtime/src/index.ts`
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Test: `tests/ai/runtime-sidecar-streaming.test.mjs`

- [ ] **Step 1: Write the failing streaming integration test**

```js
test('runtime sidecar streams provider deltas, reasoning, and token usage events', async () => {
  const events = await collectTurnEvents(baseUrl, authToken, async () => {
    await submitStreamingTurn(baseUrl, authToken, sessionId);
  });

  assert.ok(events.some((event) => event.type === 'turn.delta'));
  assert.ok(events.some((event) => event.type === 'turn.reasoning'));
  assert.ok(events.some((event) => event.type === 'turn.completed'));
  assert.match(JSON.stringify(events), /inputTokens|outputTokens/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/runtime-sidecar-streaming.test.mjs`

Expected: FAIL because the sidecar still performs non-streaming provider completion.

- [ ] **Step 3: Extract provider transport into a dedicated sidecar adapter**

```ts
export type RuntimeProviderStreamEvent =
  | { kind: 'text'; delta: string }
  | { kind: 'thinking'; delta: string }
  | { kind: 'usage'; inputTokens: number; outputTokens: number }
  | { kind: 'done'; finalText: string };

export async function streamRuntimeProviderTurn(input: {
  runtimeConfig: RuntimeModelConfig;
  prompt: string;
  systemPrompt: string;
  onEvent: (event: RuntimeProviderStreamEvent) => Promise<void> | void;
}): Promise<string> {
  // OpenAI-compatible SSE and Anthropic streaming handling live here.
}
```

- [ ] **Step 4: Replace one-shot sidecar model execution with streaming emission**

```ts
executeModel: (prompt, systemPrompt, onEvent) =>
  streamRuntimeProviderTurn({
    runtimeConfig,
    prompt,
    systemPrompt,
    onEvent: async (event) => {
      if (event.kind === 'text' || event.kind === 'thinking') {
        await onEvent?.(event.kind === 'thinking'
          ? { kind: 'thinking', delta: event.delta }
          : { kind: 'text', delta: event.delta });
      }

      if (event.kind === 'usage') {
        broadcast(buildTurnDeltaUsageEvent(snapshot.session.id, assistantMessageId, event));
      }
    },
  });
```

- [ ] **Step 5: Project token usage and delta events in the bridge without local inference**

```ts
if (event.type === 'turn.delta') {
  applyRuntimeSidecarTextDeltaEvent(event.payload.sessionId, event.payload.messageId, event.payload.delta);
}

if (event.type === 'turn.usage') {
  useAgentRuntimeStore.getState().patchLiveState(event.payload.sessionId, (state) => ({
    ...state,
    tokenUsage: event.payload.usage,
  }));
}
```

- [ ] **Step 6: Run the streaming tests**

Run: `node --test tests/ai/runtime-sidecar-streaming.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/runtime/src/nodeRuntimeProviderClient.ts apps/runtime/src/index.ts src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts tests/ai/runtime-sidecar-streaming.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs
git commit -m "feat: stream provider output from node runtime sidecar"
```

### Task 3: Move MCP Registry And Tool Invocation Into The Sidecar

**Files:**
- Create: `apps/runtime/src/nodeRuntimeMcpRegistry.ts`
- Modify: `apps/runtime/src/index.ts`
- Modify: `apps/runtime/src/nodeRuntimeToolExecutor.ts`
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Read / adapt: `src/modules/ai/runtime/mcp/runtimeMcpClient.ts`
- Read / adapt: `src/modules/ai/runtime/mcp/runtimeMcpFlow.ts`
- Test: `tests/ai/runtime-sidecar-mcp.test.mjs`

- [ ] **Step 1: Write the failing MCP sidecar test**

```js
test('runtime sidecar lists, upserts, and invokes MCP tools without tauri runtime commands', async () => {
  const server = await upsertMcpServer(baseUrl, authToken, mockServerInput);
  const listed = await listMcpServers(baseUrl, authToken);
  const toolCall = await invokeMcpTool(baseUrl, authToken, {
    sessionId,
    serverId: server.id,
    toolName: 'echo',
    argumentsText: '{"value":"hello"}',
  });

  assert.equal(listed.some((entry) => entry.id === server.id), true);
  assert.equal(toolCall.status, 'completed');
  assert.match(toolCall.resultPreview, /hello/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/runtime-sidecar-mcp.test.mjs`

Expected: FAIL because MCP CRUD and invocation still live behind Tauri invocations.

- [ ] **Step 3: Add a sidecar-owned MCP registry and HTTP endpoints**

```ts
export class NodeRuntimeMcpRegistry {
  async listServers(): Promise<RuntimeMcpServer[]> {}
  async upsertServer(input: RuntimeMcpServer): Promise<RuntimeMcpServer> {}
  async deleteServer(id: string): Promise<RuntimeMcpDeleteResult> {}
  async invokeTool(input: RuntimeMcpInvokeInput): Promise<RuntimeMcpToolCall> {}
}
```

- [ ] **Step 4: Wire MCP calls into the tool executor and event stream**

```ts
case 'mcp':
  return await this.invokeMcpTool(call.input);

broadcast({
  type: 'background_task.updated',
  emittedAt: Date.now(),
  payload: { sessionId, task: { id: toolCall.id, runKind: 'mcp', status: 'completed', summary } },
});
```

- [ ] **Step 5: Move the desktop bridge to runtime-client endpoints**

```ts
export const listRuntimeSidecarMcpServers = async () => client.listMcpServers();
export const invokeRuntimeSidecarMcpTool = async (input: RuntimeMcpInvokeInput) => client.invokeMcpTool(input);
```

- [ ] **Step 6: Run MCP tests and reuse existing MCP behavior tests**

Run: `node --test tests/ai/runtime-sidecar-mcp.test.mjs tests/ai/runtime-mcp-flow.test.mjs tests/ai/ai-chat-settings-skills-mcp.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/runtime/src/nodeRuntimeMcpRegistry.ts apps/runtime/src/index.ts apps/runtime/src/nodeRuntimeToolExecutor.ts src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts tests/ai/runtime-sidecar-mcp.test.mjs
git commit -m "feat: move mcp execution into node runtime sidecar"
```

### Task 4: Move Replay Logging, Checkpoint Save, And Rewind Into The Sidecar

**Files:**
- Create: `apps/runtime/src/nodeRuntimeReplayStore.ts`
- Modify: `apps/runtime/src/index.ts`
- Modify: `packages/runtime-client/src/index.ts`
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Modify: `src/components/workspace/useAIChatRuntimeInteractionState.ts`
- Read / adapt: `src/modules/ai/runtime/replay/runtimeReplayClient.ts`
- Read / adapt: `src/modules/ai/runtime/replay/runtimeReplayRecovery.ts`
- Test: `tests/ai/runtime-sidecar-replay.test.mjs`

- [ ] **Step 1: Write the failing replay/checkpoint test**

```js
test('runtime sidecar persists replay events and rewinds checkpoints from its own store', async () => {
  await submitEditingTurn(baseUrl, authToken, sessionId);

  const checkpoints = await listCheckpoints(baseUrl, authToken, sessionId);
  assert.equal(checkpoints.length > 0, true);

  const rewind = await rewindCheckpoint(baseUrl, authToken, {
    sessionId,
    checkpointId: checkpoints[0].id,
  });

  assert.equal(rewind.restored, true);
  assert.ok(events.some((event) => event.type === 'checkpoint.saved'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/runtime-sidecar-replay.test.mjs`

Expected: FAIL because replay/checkpoint persistence still lives in the desktop runtime layer.

- [ ] **Step 3: Create a sidecar replay/checkpoint store**

```ts
export class NodeRuntimeReplayStore {
  async appendReplayEvent(input: RuntimeReplayAppendInput): Promise<RuntimeReplayEvent> {}
  async listReplayEvents(sessionId: string): Promise<RuntimeReplayEvent[]> {}
  async saveCheckpoint(input: RuntimeCheckpointSaveInput): Promise<RuntimeCheckpointRecord> {}
  async listCheckpoints(sessionId: string): Promise<RuntimeCheckpointRecord[]> {}
  async rewindCheckpoint(input: RuntimeCheckpointRewindInput): Promise<RuntimeCheckpointRewindResult> {}
}
```

- [ ] **Step 4: Save checkpoints from sidecar file mutations instead of frontend orchestration**

```ts
if (toolResult.metadata?.fileChanges?.length) {
  const checkpoint = await replayStore.saveCheckpoint({
    sessionId: snapshot.session.id,
    messageId: assistantMessageId,
    summary: `Checkpoint after ${call.name}`,
    files: toolResult.metadata.fileChanges,
  });
  broadcast(buildCheckpointSavedEvent(snapshot.session.id, checkpoint));
}
```

- [ ] **Step 5: Switch the desktop rewind flow to sidecar endpoints**

```ts
export const rewindRuntimeSidecarCheckpoint = async (input: RuntimeCheckpointRewindInput) => {
  const client = await ensureDesktopRuntimeSidecar();
  return client?.rewindCheckpoint(input);
};
```

- [ ] **Step 6: Run replay and recovery tests**

Run: `node --test tests/ai/runtime-sidecar-replay.test.mjs tests/ai/runtime-replay-recovery.test.mjs tests/ai/runtime-replay-source.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/runtime/src/nodeRuntimeReplayStore.ts apps/runtime/src/index.ts packages/runtime-client/src/index.ts src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts src/components/workspace/useAIChatRuntimeInteractionState.ts tests/ai/runtime-sidecar-replay.test.mjs
git commit -m "feat: move replay and checkpoint flow into node runtime sidecar"
```

### Task 5: Move Team Run Orchestration Into The Sidecar

**Files:**
- Create: `apps/runtime/src/nodeRuntimeTeamRunExecutor.ts`
- Modify: `apps/runtime/src/index.ts`
- Modify: `packages/runtime-protocol/src/index.ts`
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Read / adapt: `src/modules/ai/runtime/teams/teamOrchestrator.ts`
- Read / adapt: `src/modules/ai/runtime/teams/teamPlanner.ts`
- Test: `tests/ai/runtime-sidecar-team-run.test.mjs`

- [ ] **Step 1: Write the failing team-run integration test**

```js
test('runtime sidecar executes team runs and streams team run updates', async () => {
  const events = await collectTurnEvents(baseUrl, authToken, async () => {
    await submitTeamTurn(baseUrl, authToken, sessionId);
  });

  assert.ok(events.some((event) => event.type === 'team_run.updated'));
  assert.match(JSON.stringify(events), /product_architecture|implementation|qa_review/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/runtime-sidecar-team-run.test.mjs`

Expected: FAIL because team orchestration still runs outside the sidecar execution boundary.

- [ ] **Step 3: Add a sidecar team-run executor around the existing planner**

```ts
export async function runNodeRuntimeTeamTurn(input: {
  projectId: string;
  sessionId: string;
  projectRoot: string;
  prompt: string;
  onUpdate: (teamRun: AgentTeamRunRecord) => void;
}): Promise<{ finalContent: string; teamRun: AgentTeamRunRecord }> {
  // Wrap buildAgentTeamPlan and runPrompt execution here.
}
```

- [ ] **Step 4: Emit team-run progress as sidecar runtime events**

```ts
onUpdate: (teamRun) => {
  broadcast({
    type: 'team_run.updated',
    emittedAt: Date.now(),
    payload: { sessionId: snapshot.session.id, teamRun },
  });
}
```

- [ ] **Step 5: Project team-run updates in the bridge only**

```ts
if (event.type === 'team_run.updated') {
  useAgentRuntimeStore.getState().upsertTeamRun(event.payload.sessionId, event.payload.teamRun);
}
```

- [ ] **Step 6: Run team-run tests**

Run: `node --test tests/ai/runtime-sidecar-team-run.test.mjs tests/ai/gn-agent-runtime-scaffold.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/runtime/src/nodeRuntimeTeamRunExecutor.ts apps/runtime/src/index.ts packages/runtime-protocol/src/index.ts src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts tests/ai/runtime-sidecar-team-run.test.mjs
git commit -m "feat: move team run orchestration into node runtime sidecar"
```

### Task 6: Remove Remaining Frontend Runtime Ownership And Keep The Bridge Subscription-Only

**Files:**
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Modify: `src/components/workspace/useAIChatRuntimeInteractionState.ts`
- Modify: `src/components/workspace/useAIChatSidecarSessionActions.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Read / adapt: `src/modules/ai/runtime/agentRuntimeClient.ts`
- Test: `tests/ai/runtime-sidecar-chat-boundary.test.mjs`

- [ ] **Step 1: Write the failing boundary test**

```js
test('AIChat sidecar path does not invoke local runtime orchestration helpers for mcp replay or team execution', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.doesNotMatch(source, /appendRuntimeReplayEvent/);
  assert.doesNotMatch(source, /invokeRuntimeMcpTool\(/);
  assert.doesNotMatch(source, /runAgentTeamTurn/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/runtime-sidecar-chat-boundary.test.mjs`

Expected: FAIL while the sidecar path still shares local runtime ownership.

- [ ] **Step 3: Route sidecar mode through runtime-client commands only**

```ts
if (isRuntimeSidecarSession(activeSession)) {
  return submitRuntimeSidecarTurn({
    projectId,
    sessionId: activeSession.id,
    prompt,
    permissionMode,
    runtimeConfig,
  });
}
```

- [ ] **Step 4: Keep projection derived from sidecar events and snapshots only**

```ts
if (event.type === 'session.snapshot') {
  applyRuntimeSidecarSnapshot(event.payload);
  return;
}

// No local replay, MCP, or team-run mutation path remains for sidecar sessions.
```

- [ ] **Step 5: Run chat boundary and bridge tests**

Run: `node --test tests/ai/runtime-sidecar-chat-boundary.test.mjs tests/ai/runtime-sidecar-session-bridge.test.mjs tests/ai/ai-chat-sidecar-session-actions-hook-boundary.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts src/components/workspace/useAIChatRuntimeInteractionState.ts src/components/workspace/useAIChatSidecarSessionActions.ts src/components/workspace/AIChat.tsx tests/ai/runtime-sidecar-chat-boundary.test.mjs
git commit -m "refactor: keep desktop sidecar flow subscription only"
```

### Task 7: Run Full Sidecar Parity Regression And Remove Obsolete Sidecar Gaps

**Files:**
- Modify: `apps/runtime/src/index.ts`
- Modify: `apps/runtime/src/nodeRuntimeToolExecutor.ts`
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Modify: any now-obsolete sidecar fallback code found during Task 2-6
- Test: all sidecar parity suites

- [ ] **Step 1: Remove any now-dead temporary fallback paths introduced during incremental cutover**

```ts
case 'agent':
  return await this.runDelegatedAgent(call.input);

// Delete the old "not available yet" placeholder once the real path exists.
```

- [ ] **Step 2: Run the focused sidecar parity suite**

Run:

```bash
node --test \
  tests/ai/runtime-sidecar-turn-submit.test.mjs \
  tests/ai/runtime-sidecar-streaming.test.mjs \
  tests/ai/runtime-sidecar-mcp.test.mjs \
  tests/ai/runtime-sidecar-replay.test.mjs \
  tests/ai/runtime-sidecar-team-run.test.mjs \
  tests/ai/runtime-sidecar-session-bridge-source.test.mjs \
  tests/ai/runtime-sidecar-session-bridge.test.mjs \
  tests/ai/runtime-sidecar-chat-boundary.test.mjs \
  tests/ai/ai-chat-sidecar-session-actions-hook-boundary.test.mjs
```

Expected: PASS

- [ ] **Step 3: Run the adjacent runtime regression suite**

Run:

```bash
node --test \
  tests/ai/runtime-mcp-flow.test.mjs \
  tests/ai/runtime-replay-recovery.test.mjs \
  tests/ai/runtime-streaming-assembler.test.mjs \
  tests/ai/runtime-chat-turn-streaming.test.mjs \
  tests/ai/gn-agent-runtime-scaffold.test.mjs
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/runtime/src/index.ts apps/runtime/src/nodeRuntimeToolExecutor.ts src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts tests/ai
git commit -m "test: verify node runtime sidecar parity regression suite"
```

## Self-Review

**Spec coverage**
- Streaming output: covered by Task 2.
- MCP: covered by Task 3.
- Rewind / replay / recovery: covered by Task 4.
- Team run: covered by Task 5.
- Frontend only subscribes and projects: covered by Task 6.

**Placeholder scan**
- No `TODO`, `TBD`, or “implement later” placeholders remain in the plan body.

**Type consistency**
- Commands are introduced before bridge/client usage.
- Sidecar events are introduced before bridge subscriptions.
- Replay/checkpoint commands are introduced before desktop rewind flow changes.

## Risks And Order Constraints

1. Task 2 must land before Tasks 4 and 5 because replay, checkpoint, and team-run progress all depend on a stable sidecar event stream.
2. Task 3 should land before Task 6 so the desktop bridge can stop calling local MCP helpers.
3. Task 4 should land before Task 7 so checkpoint dead code removal is evidence-based.
4. Task 6 should not delete local-runtime paths used outside sidecar sessions.

## Success Criteria

- Sidecar sessions can stream provider text, reasoning, and token usage without frontend-owned runtime execution.
- Sidecar sessions can list/invoke MCP servers and tools without Tauri runtime command ownership.
- Sidecar sessions can persist replay events, save checkpoints, and rewind from sidecar-owned state.
- Sidecar sessions can execute team runs and stream team-run progress from sidecar events.
- The frontend sidecar path only sends commands and projects sidecar state.
