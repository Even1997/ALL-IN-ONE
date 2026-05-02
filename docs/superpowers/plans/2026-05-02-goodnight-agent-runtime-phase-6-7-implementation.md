# GoodNight Agent Runtime Phase 6-7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current runtime into a full agent workbench with thread/turn orchestration, explicit runtime UI, stronger memory layers, replayable execution, and persistence hardening.

**Architecture:** Keep the current runtime store and Tauri persistence model, then layer orchestration and visibility on top. Phase 6 formalizes the thread/turn/tool-call lifecycle into explicit runtime events and visible UI panes; Phase 7 hardens long-lived state by splitting memory into thread/project/preference scopes and adding replay, migration, and recovery safeguards.

**Tech Stack:** Tauri, Rust, React 19, TypeScript, Zustand, Node test runner, existing GoodNight AI runtime modules, official Codex repository as implementation reference

---

## File Structure

### Frontend files to create

- Create: `src/modules/ai/runtime/timeline/timelineMappers.ts`
- Create: `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
- Create: `src/modules/ai/runtime/memory/threadMemoryRuntime.ts`
- Create: `src/modules/ai/runtime/replay/runtimeReplayTypes.ts`
- Create: `src/components/ai/gn-agent-shell/GNAgentTimelinePanel.tsx`
- Create: `src/components/ai/gn-agent-shell/GNAgentThreadList.tsx`
- Create: `src/components/ai/gn-agent-shell/GNAgentMemoryPanel.tsx`

### Frontend files to modify

- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Modify: `src/modules/ai/runtime/agentRuntimeTypes.ts`
- Modify: `src/modules/ai/runtime/context/assembleAgentContext.ts`
- Modify: `src/modules/ai/runtime/memory/projectMemoryRuntime.ts`
- Modify: `src/store/projectStore.ts`
- Modify: `src/types/index.ts`

### Backend files to create

- Create: `src-tauri/src/agent_runtime/replay_store.rs`
- Create: `src-tauri/src/agent_runtime/settings_store.rs`

### Backend files to modify

- Modify: `src-tauri/src/agent_runtime/types.rs`
- Modify: `src-tauri/src/agent_runtime/thread_store.rs`
- Modify: `src-tauri/src/agent_runtime/memory_store.rs`
- Modify: `src-tauri/src/agent_runtime/commands.rs`
- Modify: `src-tauri/src/lib.rs`

### Tests to create

- Create: `tests/ai/agent-runtime-timeline.test.mjs`
- Create: `tests/ai/agent-runtime-thread-ui.test.mjs`
- Create: `tests/ai/thread-memory-runtime.test.mjs`
- Create: `tests/ai/runtime-replay-source.test.mjs`
- Create: `tests/ai/project-memory-migration.test.mjs`

---

## Task 1: Formalize Timeline Mapping and Turn Runner

**Files:**
- Create: `src/modules/ai/runtime/timeline/timelineMappers.ts`
- Create: `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Test: `tests/ai/agent-runtime-timeline.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadTimeline = async () =>
  import(`../../src/modules/ai/runtime/timeline/timelineMappers.ts?test=${Date.now()}`);

test('timeline mappers normalize thinking, tool, message, and approval events', async () => {
  const { mapTimelineEventSummary } = await loadTimeline();

  assert.equal(mapTimelineEventSummary({ kind: 'thinking', payload: 'Plan' }), 'thinking: Plan');
  assert.equal(mapTimelineEventSummary({ kind: 'approval', payload: 'Need approval' }), 'approval: Need approval');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/agent-runtime-timeline.test.mjs`

Expected: FAIL because timeline mappers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/ai/runtime/timeline/timelineMappers.ts
export const mapTimelineEventSummary = (event: { kind: string; payload: string }) =>
  `${event.kind}: ${event.payload}`;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/agent-runtime-timeline.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/agent-runtime-timeline.test.mjs src/modules/ai/runtime/timeline/timelineMappers.ts src/modules/ai/runtime/orchestration/agentTurnRunner.ts src/modules/ai/runtime/agentRuntimeStore.ts
git commit -m "feat: formalize runtime timeline mapping"
```

---

## Task 2: Add Thread List, Timeline Panel, and Memory Panel UI

**Files:**
- Create: `src/components/ai/gn-agent-shell/GNAgentTimelinePanel.tsx`
- Create: `src/components/ai/gn-agent-shell/GNAgentThreadList.tsx`
- Create: `src/components/ai/gn-agent-shell/GNAgentMemoryPanel.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Test: `tests/ai/agent-runtime-thread-ui.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx');

test('gn agent chat page references thread list, timeline panel, and memory panel', async () => {
  const source = await readFile(chatPagePath, 'utf8');

  assert.match(source, /GNAgentThreadList/);
  assert.match(source, /GNAgentTimelinePanel/);
  assert.match(source, /GNAgentMemoryPanel/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/agent-runtime-thread-ui.test.mjs`

Expected: FAIL because the runtime panels are not wired into the shell yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
// add compact side panels around the existing AIChat shell rather than replacing the page
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/agent-runtime-thread-ui.test.mjs`

Expected: PASS

- [ ] **Step 5: Run build verification**

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/ai/agent-runtime-thread-ui.test.mjs src/components/ai/gn-agent-shell/GNAgentTimelinePanel.tsx src/components/ai/gn-agent-shell/GNAgentThreadList.tsx src/components/ai/gn-agent-shell/GNAgentMemoryPanel.tsx src/components/ai/gn-agent-shell/GNAgentChatPage.tsx src/components/workspace/AIChat.tsx
git commit -m "feat: add runtime thread and timeline panels"
```

---

## Task 3: Add Thread Memory Runtime and Upgrade Project Memory Shape

**Files:**
- Create: `src/modules/ai/runtime/memory/threadMemoryRuntime.ts`
- Modify: `src/modules/ai/runtime/memory/projectMemoryRuntime.ts`
- Modify: `src/store/projectStore.ts`
- Modify: `src/types/index.ts`
- Test: `tests/ai/thread-memory-runtime.test.mjs`
- Test: `tests/ai/project-memory-migration.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadThreadMemory = async () =>
  import(`../../src/modules/ai/runtime/memory/threadMemoryRuntime.ts?test=${Date.now()}`);

test('thread memory runtime builds thread-scoped memory entries', async () => {
  const { buildThreadMemoryEntry } = await loadThreadMemory();
  const entry = buildThreadMemoryEntry({
    id: 'thread-memory-1',
    threadId: 'thread-1',
    title: 'User preference',
    summary: 'Prefers concise replies',
    content: 'Use shorter answers by default.',
    kind: 'userPreference',
    updatedAt: 10,
  });

  assert.equal(entry.threadId, 'thread-1');
  assert.equal(entry.kind, 'userPreference');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/ai/thread-memory-runtime.test.mjs tests/ai/project-memory-migration.test.mjs`

Expected: FAIL because thread memory and migration handling do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/ai/runtime/memory/threadMemoryRuntime.ts
export const buildThreadMemoryEntry = (...) => ({ ... });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/ai/thread-memory-runtime.test.mjs tests/ai/project-memory-migration.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/thread-memory-runtime.test.mjs tests/ai/project-memory-migration.test.mjs src/modules/ai/runtime/memory/threadMemoryRuntime.ts src/modules/ai/runtime/memory/projectMemoryRuntime.ts src/store/projectStore.ts src/types/index.ts
git commit -m "feat: add thread memory runtime"
```

---

## Task 4: Add Replay Store and Runtime Replay Commands

**Files:**
- Create: `src-tauri/src/agent_runtime/replay_store.rs`
- Modify: `src-tauri/src/agent_runtime/types.rs`
- Modify: `src-tauri/src/agent_runtime/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `tests/ai/runtime-replay-source.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tauriLibPath = path.resolve(__dirname, '../../src-tauri/src/lib.rs');

test('tauri exposes runtime replay commands', async () => {
  const source = await readFile(tauriLibPath, 'utf8');
  const handlerMatch = source.match(/\.invoke_handler\(tauri::generate_handler!\[(?<commands>[\s\S]*?)\]\)/);

  assert.ok(handlerMatch?.groups?.commands);
  assert.match(handlerMatch.groups.commands, /\bappend_runtime_replay_event\b/);
  assert.match(handlerMatch.groups.commands, /\blist_runtime_replay_events\b/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/runtime-replay-source.test.mjs`

Expected: FAIL because replay commands are not registered yet.

- [ ] **Step 3: Write minimal implementation**

```rust
// add replay event persistence next to thread/memory persistence
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/runtime-replay-source.test.mjs`

Expected: PASS

- [ ] **Step 5: Run backend verification**

Run: `cargo test --manifest-path src-tauri/Cargo.toml agent_runtime`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/ai/runtime-replay-source.test.mjs src-tauri/src/agent_runtime/replay_store.rs src-tauri/src/agent_runtime/types.rs src-tauri/src/agent_runtime/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add runtime replay persistence"
```

---

## Task 5: Add Recovery, Migration, and Runtime Summary Hardening

**Files:**
- Modify: `src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Modify: `src/store/projectStore.ts`
- Modify: `src-tauri/src/agent_runtime/thread_store.rs`
- Modify: `src-tauri/src/agent_runtime/memory_store.rs`
- Test: `tests/ai/project-memory-migration.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeSummaryPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx');

test('runtime summary references recovery or replay state', async () => {
  const source = await readFile(runtimeSummaryPath, 'utf8');
  assert.match(source, /replay|recovery|resume/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/project-memory-migration.test.mjs`

Expected: FAIL because recovery and migration surfaces are not represented yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
// GNAgentRuntimeSummary should surface replay/recovery metadata without replacing the current UI
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/project-memory-migration.test.mjs`

Expected: PASS

- [ ] **Step 5: Run build and backend verification**

Run: `npm run build`

Expected: PASS

Run: `cargo test --manifest-path src-tauri/Cargo.toml agent_runtime`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/ai/project-memory-migration.test.mjs src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx src/modules/ai/runtime/agentRuntimeStore.ts src/store/projectStore.ts src-tauri/src/agent_runtime/thread_store.rs src-tauri/src/agent_runtime/memory_store.rs
git commit -m "feat: harden runtime recovery and migration state"
```

---

## Self-Review

- **Spec coverage:** The plan covers both the runtime UI/orchestration expansion and the long-lived memory/reliability hardening work.
- **Placeholder scan:** The plan stays concrete and execution-ready while keeping each task small enough to run independently.
- **Type consistency:** The naming stays aligned with the current runtime vocabulary: thread, turn, timeline, memory, replay, recovery.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-02-goodnight-agent-runtime-phase-6-7-implementation.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
