# AI Chat History Lifecycle Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 AI Chat 历史记录的生命周期问题，确保会话不会因本地兜底和 sidecar 双轨而重复残留，删除会真正删除，刷新后不会把“已删历史”重新拉回。

**Architecture:** 保持现有分层不变：`runtime sidecar -> snapshot / canonical events -> desktop bridge -> chat/runtime stores -> UI`。只修会话历史生命周期本身，不把更大的 `localStorage` 解耦和流式性能重构打包进这次改动。先锁回归，再补 sidecar 删除接口，最后把现有的会话去重/清理逻辑真正接入 bootstrap。

**Tech Stack:** React, Zustand, TypeScript, Node runtime sidecar, Node test runner with `--experimental-strip-types`

---

## Scope Guard

- 这次不改 tool/runtime truth，不改 canonical event 语义，不改 timeline 展示协议。
- 这次不做完整的 AI chat storage decoupling，只修历史重复、删除失效、刷新回魂。
- 这次优先复用已有逻辑，尤其是 `reconcileRuntimeThreadsWithSessions()`，避免新造第二套去重规则。

## Success Criteria

- 新建会话后，刷新不会凭空多出一条重复历史。
- sidecar 不可用时创建的本地兜底会话，在 sidecar 恢复并 bootstrap 后会被正确折叠或清理。
- 从历史菜单删除一个 sidecar 会话后：
  - 当前 UI 立即消失；
  - `GET /sessions` 不再返回该会话；
  - 刷新后不会重新出现。
- 删除一个仅本地存在、未绑定 `runtimeThreadId` 的兜底会话时，仍然只走本地删除。
- 会话清理不会破坏现有 turn replay、checkpoint、background task、MCP tool call 的其他线程数据。

## File Map

**Runtime protocol / client**
- Modify: `packages/runtime-protocol/src/index.ts`
- Modify: `packages/runtime-protocol/src/index.d.ts`
- Modify: `packages/runtime-client/src/index.ts`

**Node runtime sidecar**
- Modify: `apps/runtime/src/index.ts`
- Modify: `apps/runtime/src/nodeRuntimeReplayStore.ts`

**Desktop bridge and stores**
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Modify: `src/modules/ai/store/aiChatStore.ts`
- Modify: `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Modify: `src/modules/ai/runtime/approval/approvalStore.ts`
- Modify: `src/modules/ai/runtime/mcp/runtimeMcpStore.ts`

**UI**
- Modify: `src/components/workspace/AIChat.tsx`

**Tests**
- Create: `tests/ai/ai-chat-history-delete-source.test.mjs`
- Modify: `tests/ai/runtime-sidecar-turn-submit.test.mjs`
- Modify: `tests/ai/runtime-sidecar-session-bridge-source.test.mjs`
- Modify: `tests/ai/runtime-conversation-gateway.test.mjs`

---

### Task 1: Lock The History Lifecycle Regressions

**Files:**
- Create: `tests/ai/ai-chat-history-delete-source.test.mjs`
- Modify: `tests/ai/runtime-sidecar-turn-submit.test.mjs`
- Modify: `tests/ai/runtime-sidecar-session-bridge-source.test.mjs`
- Modify: `tests/ai/runtime-conversation-gateway.test.mjs`

- [ ] **Step 1: Add a source test that forbids raw local-only deletion for bound runtime sessions**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const bridgePath = path.resolve(
  __dirname,
  '../../src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts',
);

test('AIChat routes bound session deletion through the runtime sidecar bridge', async () => {
  const [chatSource, bridgeSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(bridgePath, 'utf8'),
  ]);

  assert.match(bridgeSource, /export const deleteRuntimeSidecarSession = async/);
  assert.match(chatSource, /deleteRuntimeSidecarSession\(/);
  assert.doesNotMatch(
    chatSource,
    /onDeleteSession=\{\(sessionId\)\s*=>\s*\{[\s\S]*removeSession\(currentProject\.id,\s*sessionId\)/,
  );
});
```

- [ ] **Step 2: Add a failing sidecar integration test for delete persistence**

```js
test('runtime sidecar delete removes a session from persisted listings and snapshots', async () => {
  const createResponse = await fetch(`${baseUrl}/sessions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${authToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      projectId: 'project-delete',
      providerId: 'built-in',
      title: 'Delete me',
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  const deleteResponse = await fetch(`${baseUrl}/sessions/delete`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${authToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sessionId: created.session.id }),
  });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), {
    sessionId: created.session.id,
    deleted: true,
  });

  const listResponse = await fetch(`${baseUrl}/sessions?projectId=project-delete`, {
    headers: { authorization: `Bearer ${authToken}` },
  });
  const listed = await listResponse.json();
  assert.deepEqual(listed.sessions, []);

  const openResponse = await fetch(`${baseUrl}/sessions/${created.session.id}`, {
    headers: { authorization: `Bearer ${authToken}` },
  });
  assert.equal(openResponse.status, 404);
});
```

- [ ] **Step 3: Extend the bridge source test to require bootstrap reconciliation and delete helper wiring**

```js
assert.match(source, /reconcileRuntimeThreadsWithSessions/);
assert.match(source, /removedSessionIds/);
assert.match(source, /replaceProjectSessions/);
assert.match(source, /deleteRuntimeSidecarSession/);
```

- [ ] **Step 4: Extend the gateway test to require a replaceable reconciliation result**

```js
const result = reconcileRuntimeThreadsWithSessions({
  projectId: 'project-1',
  sessions: [
    {
      id: 'local-fallback',
      projectId: 'project-1',
      title: '新对话',
      providerId: 'built-in',
      runtimeThreadId: null,
      messages: [],
      replayEvents: [],
      recoveryState: null,
      eventLog: [],
      createdAt: 10,
      updatedAt: 10,
    },
  ],
  runtimeThreads: [
    {
      id: 'thread-real',
      providerId: 'built-in',
      title: '新对话',
      createdAt: 20,
      updatedAt: 20,
    },
  ],
});

assert.equal(result.sessions.some((session) => session.id === 'local-fallback'), false);
assert.equal(result.sessions.some((session) => session.runtimeThreadId === 'thread-real'), true);
assert.deepEqual(result.removedSessionIds, ['local-fallback']);
```

- [ ] **Step 5: Run the focused regression suite**

Run: `node --test --experimental-strip-types tests/ai/ai-chat-history-delete-source.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs tests/ai/runtime-sidecar-session-bridge-source.test.mjs tests/ai/runtime-conversation-gateway.test.mjs`

Expected: FAIL because delete routing and bootstrap reconciliation are not wired yet.

- [ ] **Step 6: Commit the failing tests**

```bash
git add tests/ai/ai-chat-history-delete-source.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs tests/ai/runtime-sidecar-session-bridge-source.test.mjs tests/ai/runtime-conversation-gateway.test.mjs
git commit -m "test: lock ai chat history lifecycle regressions"
```

### Task 2: Add A Real Runtime Session Delete API

**Files:**
- Modify: `packages/runtime-protocol/src/index.ts`
- Modify: `packages/runtime-protocol/src/index.d.ts`
- Modify: `packages/runtime-client/src/index.ts`
- Modify: `apps/runtime/src/index.ts`
- Modify: `apps/runtime/src/nodeRuntimeReplayStore.ts`
- Test: `tests/ai/runtime-sidecar-turn-submit.test.mjs`

- [ ] **Step 1: Define a minimal delete result type in the runtime protocol**

```ts
export type RuntimeSessionDeleteResult = {
  sessionId: string;
  deleted: boolean;
};
```

- [ ] **Step 2: Expose a client method that matches the existing POST-style sidecar API**

```ts
async deleteSession(sessionId: string) {
  return this.post<RuntimeSessionDeleteResult>('/sessions/delete', { sessionId });
}
```

- [ ] **Step 3: Add replay-store cleanup for a deleted session**

```ts
async deleteSessionArtifacts(sessionId: string): Promise<void> {
  const store = await this.loadStore();
  store.replayEvents = store.replayEvents.filter((event) => event.sessionId !== sessionId);
  store.checkpoints = store.checkpoints.filter((checkpoint) => checkpoint.sessionId !== sessionId);
  store.fileChanges = store.fileChanges.filter((change) => change.sessionId !== sessionId);
  await this.saveStore(store);
}
```

- [ ] **Step 4: Add a sidecar route that deletes the session, its background tasks, and replay artifacts**

```ts
if (url.pathname === '/sessions/delete' && request.method === 'POST') {
  const body = await readBody<{ sessionId: string }>(request);
  const existing = matchSession(state, body.sessionId);
  if (!existing) {
    await send(json(404, { error: 'Session not found' }));
    return;
  }

  state.sessions = state.sessions.filter((entry) => entry.session.id !== body.sessionId);
  delete state.backgroundTasksBySession[body.sessionId];
  await replayStore.deleteSessionArtifacts(body.sessionId);
  await saveState(config, state);
  await send(json(200, { sessionId: body.sessionId, deleted: true }));
  return;
}
```

- [ ] **Step 5: Verify the runtime delete route**

Run: `node --test --experimental-strip-types tests/ai/runtime-sidecar-turn-submit.test.mjs`

Expected: PASS, including the new delete lifecycle test.

- [ ] **Step 6: Commit the sidecar delete API**

```bash
git add packages/runtime-protocol/src/index.ts packages/runtime-protocol/src/index.d.ts packages/runtime-client/src/index.ts apps/runtime/src/index.ts apps/runtime/src/nodeRuntimeReplayStore.ts tests/ai/runtime-sidecar-turn-submit.test.mjs
git commit -m "feat: add runtime sidecar session deletion"
```

### Task 3: Route Desktop History Deletion Through The Sidecar And Clear Local Projections

**Files:**
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Modify: `src/modules/ai/runtime/approval/approvalStore.ts`
- Modify: `src/modules/ai/runtime/mcp/runtimeMcpStore.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Test: `tests/ai/ai-chat-history-delete-source.test.mjs`
- Test: `tests/ai/runtime-sidecar-session-bridge-source.test.mjs`

- [ ] **Step 1: Add focused store cleanup helpers instead of mutating unrelated state**

```ts
removeThreadState: (projectId, threadId) =>
  set((state) => ({
    threadsByProject: {
      ...state.threadsByProject,
      [projectId]: (state.threadsByProject[projectId] || []).filter((thread) => thread.id !== threadId),
    },
    timelineByThread: Object.fromEntries(
      Object.entries(state.timelineByThread).filter(([key]) => key !== threadId),
    ),
    sessionsByThread: Object.fromEntries(
      Object.entries(state.sessionsByThread).filter(([key]) => key !== threadId),
    ),
    replayEventsByThread: Object.fromEntries(
      Object.entries(state.replayEventsByThread).filter(([key]) => key !== threadId),
    ),
    recoveryByThread: Object.fromEntries(
      Object.entries(state.recoveryByThread).filter(([key]) => key !== threadId),
    ),
  }))
```

- [ ] **Step 2: Add matching per-thread clear helpers for approvals and MCP tool calls**

```ts
clearThreadApprovals: (threadId) =>
  set((state) => ({
    approvalsByThread: Object.fromEntries(
      Object.entries(state.approvalsByThread).filter(([key]) => key !== threadId),
    ),
  }))
```

```ts
clearThreadToolCalls: (threadId) =>
  set((state) => ({
    toolCallsByThread: Object.fromEntries(
      Object.entries(state.toolCallsByThread).filter(([key]) => key !== threadId),
    ),
  }))
```

- [ ] **Step 3: Add a bridge helper that deletes through sidecar when possible and falls back to local-only removal when not bound**

```ts
export const deleteRuntimeSidecarSession = async (input: {
  projectId: string;
  sessionId: string;
  runtimeThreadId: string | null;
}) => {
  if (!input.runtimeThreadId) {
    useAIChatStore.getState().removeSession(input.projectId, input.sessionId);
    return { sessionId: input.sessionId, deleted: true };
  }

  const client = await ensureDesktopRuntimeSidecar();
  if (!client) {
    return { sessionId: input.sessionId, deleted: false };
  }

  const result = await client.deleteSession(input.runtimeThreadId);
  if (!result.deleted) {
    return result;
  }

  useAIChatStore.getState().removeSession(input.projectId, input.sessionId);
  useAgentRuntimeStore.getState().removeThreadState(input.projectId, input.runtimeThreadId);
  useApprovalStore.getState().clearThreadApprovals(input.runtimeThreadId);
  useRuntimeMcpStore.getState().clearThreadToolCalls(input.runtimeThreadId);
  return result;
}
```

- [ ] **Step 4: Update the history menu deletion callback to call the bridge helper instead of raw store removal**

```ts
onDeleteSession={(sessionId) => {
  if (!currentProject) {
    return;
  }

  const session = sessions.find((entry) => entry.id === sessionId) || null;
  if (!session) {
    return;
  }

  void deleteRuntimeSidecarSession({
    projectId: currentProject.id,
    sessionId: session.id,
    runtimeThreadId: session.runtimeThreadId,
  });
}}
```

- [ ] **Step 5: Verify source-level deletion wiring**

Run: `node --test --experimental-strip-types tests/ai/ai-chat-history-delete-source.test.mjs tests/ai/runtime-sidecar-session-bridge-source.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit the desktop delete wiring**

```bash
git add src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts src/modules/ai/runtime/agentRuntimeStore.ts src/modules/ai/runtime/approval/approvalStore.ts src/modules/ai/runtime/mcp/runtimeMcpStore.ts src/components/workspace/AIChat.tsx tests/ai/ai-chat-history-delete-source.test.mjs tests/ai/runtime-sidecar-session-bridge-source.test.mjs
git commit -m "fix: route ai chat history deletion through sidecar"
```

### Task 4: Apply Existing Session Reconciliation During Bootstrap

**Files:**
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Modify: `src/modules/ai/store/aiChatStore.ts`
- Modify: `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`
- Test: `tests/ai/runtime-conversation-gateway.test.mjs`
- Test: `tests/ai/runtime-sidecar-session-bridge-source.test.mjs`

- [ ] **Step 1: Add a project-level replace helper to the chat store so bootstrap can apply one reconciled session set**

```ts
replaceProjectSessions: (projectId, sessions, activeSessionId) =>
  set((state) => ({
    projects: {
      ...state.projects,
      [projectId]: {
        ...(state.projects[projectId] || createProjectState()),
        activeSessionId: activeSessionId ?? sessions[0]?.id ?? null,
        sessions: sortSessions(sessions.map(normalizeChatSession)),
      },
    },
  }))
```

- [ ] **Step 2: Reuse the existing reconciliation helper in sidecar bootstrap after snapshots are loaded**

```ts
const runtimeThreads = summaries.map((session) => ({
  id: session.id,
  providerId: session.providerId,
  title: session.title,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
}));

const currentProjectState = chatStore.projects[projectId] || null;
const reconciled = reconcileRuntimeThreadsWithSessions({
  projectId,
  sessions: currentProjectState?.sessions || [],
  runtimeThreads,
});

chatStore.replaceProjectSessions(
  projectId,
  reconciled.sessions,
  currentProjectState?.activeSessionId && reconciled.sessions.some(
    (session) => session.id === currentProjectState.activeSessionId,
  )
    ? currentProjectState.activeSessionId
    : reconciled.sessions[0]?.id || null,
);
```

- [ ] **Step 3: Keep the reconciliation surgical: use `removedSessionIds` for observability, not a second delete path**

```ts
if (reconciled.removedSessionIds.length > 0) {
  console.info('[ai-chat] removed stale or duplicate sessions during bootstrap', {
    projectId,
    removedSessionIds: reconciled.removedSessionIds,
  });
}
```

- [ ] **Step 4: Verify reconciliation behavior**

Run: `node --test --experimental-strip-types tests/ai/runtime-conversation-gateway.test.mjs`

Expected: PASS, including duplicate placeholder and stale empty-session cleanup coverage.

- [ ] **Step 5: Commit bootstrap reconciliation**

```bash
git add src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts src/modules/ai/store/aiChatStore.ts src/modules/ai/runtime/conversation/runtimeConversationGateway.ts tests/ai/runtime-conversation-gateway.test.mjs tests/ai/runtime-sidecar-session-bridge-source.test.mjs
git commit -m "fix: reconcile ai chat sessions during sidecar bootstrap"
```

### Task 5: Run The Focused Verification And Do A Manual Smoke Check

**Files:**
- Reuse: `tests/ai/ai-chat-history-delete-source.test.mjs`
- Reuse: `tests/ai/runtime-sidecar-turn-submit.test.mjs`
- Reuse: `tests/ai/runtime-sidecar-session-bridge-source.test.mjs`
- Reuse: `tests/ai/runtime-conversation-gateway.test.mjs`

- [ ] **Step 1: Run the focused automated suite**

Run: `node --test --experimental-strip-types tests/ai/ai-chat-history-delete-source.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs tests/ai/runtime-sidecar-session-bridge-source.test.mjs tests/ai/runtime-conversation-gateway.test.mjs`

Expected: PASS

- [ ] **Step 2: Run the broader chat/runtime guardrail suite**

Run: `node --test --experimental-strip-types tests/ai/ai-chat-store.test.mjs tests/ai/runtime-sidecar-session-bridge.test.mjs tests/ai/ai-chat-sidecar-session-actions-hook-boundary.test.mjs`

Expected: PASS

- [ ] **Step 3: Run a build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 4: Do a manual smoke test in the desktop app**

```text
1. 启动桌面 app 和 runtime sidecar。
2. 新建一个会话，不发送消息，刷新页面。
3. 确认没有多出第二条“新对话”。
4. 发送一轮消息，删除该会话。
5. 刷新页面，确认该会话没有重新出现。
6. 在 sidecar 不可用时创建本地兜底会话，恢复 sidecar 后刷新。
7. 确认本地兜底没有和真实 runtime 会话并存。
```

- [ ] **Step 5: Commit the verification pass**

```bash
git add tests/ai/ai-chat-history-delete-source.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs tests/ai/runtime-sidecar-session-bridge-source.test.mjs tests/ai/runtime-conversation-gateway.test.mjs src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts src/modules/ai/store/aiChatStore.ts src/modules/ai/runtime/conversation/runtimeConversationGateway.ts src/modules/ai/runtime/agentRuntimeStore.ts src/modules/ai/runtime/approval/approvalStore.ts src/modules/ai/runtime/mcp/runtimeMcpStore.ts src/components/workspace/AIChat.tsx packages/runtime-protocol/src/index.ts packages/runtime-protocol/src/index.d.ts packages/runtime-client/src/index.ts apps/runtime/src/index.ts apps/runtime/src/nodeRuntimeReplayStore.ts
git commit -m "fix: stabilize ai chat history lifecycle"
```

---

## Self-Review

### Spec coverage

- “新对话会不会生成多个历史记录”：
  - Task 4 把现有 `reconcileRuntimeThreadsWithSessions()` 真正接到 bootstrap。
- “刷新会不会再生成”：
  - Task 4 处理 bootstrap 恢复期的占位/重复/脏绑定会话。
- “历史记录无法被删除”：
  - Task 2 和 Task 3 打通 runtime delete API 与桌面端删除动作。
- “是不是卡顿的主要原因”：
  - 这份计划只修历史生命周期问题，避免和更大的 storage decoupling 混在一起。
  - 这能减少历史列表和持久化脏数据累积，但不声称单独解决全部流式卡顿。

### Placeholder scan

- 本计划没有 `TODO` / `TBD` / “类似前面” 这类占位语句。
- 每个代码步骤都给了目标片段或接口签名。
- 每个验证步骤都给了实际命令和预期结果。

### Type consistency

- 删除接口统一使用 `sessionId`。
- 绑定侧统一区分 `session.id` 与 `runtimeThreadId`。
- 桌面端删除 helper 显式接收 `{ projectId, sessionId, runtimeThreadId }`，避免再走隐式查找。

---

Plan complete and saved to `docs/superpowers/plans/2026-05-12-ai-chat-history-lifecycle-fix-plan.zh-CN.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
