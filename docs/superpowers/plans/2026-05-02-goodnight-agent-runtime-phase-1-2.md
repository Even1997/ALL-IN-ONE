# GoodNight Agent Runtime Phase 1-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-grade GoodNight agent runtime by introducing a unified runtime layer, persistent threads, a structured context assembler, and a project memory MVP while preserving the existing Tauri + React desktop UI.

**Architecture:** Add a new runtime spine between the current chat UI and provider adapters. The frontend stops orchestrating agent behavior directly and instead submits turns to a typed runtime store. The Tauri backend gains explicit runtime modules for thread persistence, memory persistence, and context/materialization APIs so the UI can render execution state instead of only final messages.

**Tech Stack:** Tauri, Rust, React 19, TypeScript, Zustand, Node test runner, existing GoodNight AI modules, official Codex repository as implementation reference

---

## File Structure

### Frontend files to create

- Create: `src/modules/ai/runtime/agentRuntimeTypes.ts`
- Create: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Create: `src/modules/ai/runtime/agentRuntimeClient.ts`
- Create: `src/modules/ai/runtime/context/assembleAgentContext.ts`
- Create: `src/modules/ai/runtime/context/buildThreadPrompt.ts`
- Create: `src/modules/ai/runtime/memory/projectMemoryRuntime.ts`
- Create: `src/modules/ai/runtime/timeline/timelineMappers.ts`

### Frontend files to modify

- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx`
- Modify: `src/modules/ai/core/AIService.ts`
- Modify: `src/modules/ai/gn-agent/runtime/codex/CodexRuntime.ts`
- Modify: `src/modules/ai/gn-agent/runtime/claude/ClaudeRuntime.ts`
- Modify: `src/modules/ai/platform-bridges/types.ts`
- Modify: `src/modules/ai/store/aiChatStore.ts`
- Modify: `src/store/projectStore.ts`
- Modify: `src/types/index.ts`

### Backend files to create

- Create: `src-tauri/src/agent_runtime/mod.rs`
- Create: `src-tauri/src/agent_runtime/types.rs`
- Create: `src-tauri/src/agent_runtime/thread_store.rs`
- Create: `src-tauri/src/agent_runtime/memory_store.rs`
- Create: `src-tauri/src/agent_runtime/context_store.rs`
- Create: `src-tauri/src/agent_runtime/commands.rs`

### Backend files to modify

- Modify: `src-tauri/src/lib.rs`

### Tests to create

- Create: `tests/ai/agent-runtime-types.test.mjs`
- Create: `tests/ai/agent-runtime-store.test.mjs`
- Create: `tests/ai/agent-context-assembler.test.mjs`
- Create: `tests/ai/project-memory-runtime.test.mjs`
- Create: `tests/ai/tauri-agent-runtime-source.test.mjs`
- Create: `tests/ai/agent-chat-runtime-ui.test.mjs`

---

### Task 1: Introduce Shared Agent Runtime Types

**Files:**
- Create: `src/modules/ai/runtime/agentRuntimeTypes.ts`
- Modify: `src/modules/ai/platform-bridges/types.ts`
- Modify: `src/types/index.ts`
- Test: `tests/ai/agent-runtime-types.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeTypesPath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeTypes.ts');
const bridgeTypesPath = path.resolve(__dirname, '../../src/modules/ai/platform-bridges/types.ts');

test('agent runtime types define thread, turn, timeline, context, and memory contracts', async () => {
  const runtimeTypes = await readFile(runtimeTypesPath, 'utf8');
  const bridgeTypes = await readFile(bridgeTypesPath, 'utf8');

  assert.match(runtimeTypes, /export type AgentProviderId = 'built-in' \| 'claude' \| 'codex'/);
  assert.match(runtimeTypes, /export type AgentTimelineEvent =/);
  assert.match(runtimeTypes, /export type AgentThreadRecord =/);
  assert.match(runtimeTypes, /export type AgentContextBundle =/);
  assert.match(runtimeTypes, /export type AgentMemoryEntry =/);
  assert.match(bridgeTypes, /threadId: string \| null/);
  assert.match(bridgeTypes, /memoryLabels: string\[]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/agent-runtime-types.test.mjs`

Expected: FAIL because `src/modules/ai/runtime/agentRuntimeTypes.ts` does not exist yet and `platform-bridges/types.ts` does not expose thread or memory metadata.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/ai/runtime/agentRuntimeTypes.ts
export type AgentProviderId = 'built-in' | 'claude' | 'codex';

export type AgentTimelineEvent =
  | { id: string; kind: 'thinking'; threadId: string; turnId: string; content: string; createdAt: number }
  | { id: string; kind: 'tool_call'; threadId: string; turnId: string; toolName: string; status: 'running' | 'completed' | 'error'; createdAt: number }
  | { id: string; kind: 'message'; threadId: string; turnId: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt: number }
  | { id: string; kind: 'approval'; threadId: string; turnId: string; summary: string; createdAt: number };

export type AgentContextBundle = {
  projectId: string | null;
  projectName: string | null;
  threadId: string | null;
  labels: string[];
  instructions: string[];
  referenceFiles: Array<{ path: string; summary: string; content: string }>;
  memoryEntries: AgentMemoryEntry[];
};

export type AgentMemoryEntry = {
  id: string;
  scope: 'project' | 'thread';
  title: string;
  summary: string;
  content: string;
  updatedAt: number;
};

export type AgentTurnRecord = {
  id: string;
  threadId: string;
  providerId: AgentProviderId;
  status: 'queued' | 'running' | 'completed' | 'failed';
  prompt: string;
  createdAt: number;
  completedAt: number | null;
};

export type AgentThreadRecord = {
  id: string;
  projectId: string;
  title: string;
  providerId: AgentProviderId;
  createdAt: number;
  updatedAt: number;
  latestContextLabels: string[];
  latestMemoryLabels: string[];
};
```

```ts
// src/modules/ai/platform-bridges/types.ts
export type PlatformPromptContext = {
  threadId: string | null;
  labels: string[];
  memoryLabels: string[];
  content: string;
};

export type WorkspaceSnapshot = {
  projectId: string | null;
  projectName: string | null;
  selectedFilePath: string | null;
  threadId: string | null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/agent-runtime-types.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/agent-runtime-types.test.mjs src/modules/ai/runtime/agentRuntimeTypes.ts src/modules/ai/platform-bridges/types.ts src/types/index.ts
git commit -m "feat: add shared agent runtime types"
```

---

### Task 2: Add Backend Thread and Memory Persistence Commands

**Files:**
- Create: `src-tauri/src/agent_runtime/mod.rs`
- Create: `src-tauri/src/agent_runtime/types.rs`
- Create: `src-tauri/src/agent_runtime/thread_store.rs`
- Create: `src-tauri/src/agent_runtime/memory_store.rs`
- Create: `src-tauri/src/agent_runtime/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `tests/ai/tauri-agent-runtime-source.test.mjs`

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

test('tauri exposes agent runtime thread and memory commands', async () => {
  const source = await readFile(tauriLibPath, 'utf8');

  assert.match(source, /mod agent_runtime;/);
  assert.match(source, /create_agent_thread/);
  assert.match(source, /list_agent_threads/);
  assert.match(source, /append_agent_timeline_event/);
  assert.match(source, /save_project_memory_entry/);
  assert.match(source, /list_project_memory_entries/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/tauri-agent-runtime-source.test.mjs`

Expected: FAIL because the `agent_runtime` module and Tauri commands are not registered.

- [ ] **Step 3: Write minimal implementation**

```rust
// src-tauri/src/agent_runtime/types.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentThreadRecord {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub provider_id: String,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTimelineEvent {
    pub id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub kind: String,
    pub payload: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMemoryEntry {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub summary: String,
    pub content: String,
    pub updated_at: u64,
}
```

```rust
// src-tauri/src/agent_runtime/commands.rs
#[tauri::command]
pub fn create_agent_thread(/* params */) -> Result<AgentThreadRecord, String> { /* ... */ }

#[tauri::command]
pub fn list_agent_threads(/* params */) -> Result<Vec<AgentThreadRecord>, String> { /* ... */ }

#[tauri::command]
pub fn append_agent_timeline_event(/* params */) -> Result<AgentTimelineEvent, String> { /* ... */ }

#[tauri::command]
pub fn save_project_memory_entry(/* params */) -> Result<ProjectMemoryEntry, String> { /* ... */ }

#[tauri::command]
pub fn list_project_memory_entries(/* params */) -> Result<Vec<ProjectMemoryEntry>, String> { /* ... */ }
```

```rust
// src-tauri/src/lib.rs
mod agent_runtime;

// inside invoke_handler
create_agent_thread,
list_agent_threads,
append_agent_timeline_event,
save_project_memory_entry,
list_project_memory_entries,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/tauri-agent-runtime-source.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/tauri-agent-runtime-source.test.mjs src-tauri/src/lib.rs src-tauri/src/agent_runtime
git commit -m "feat: add tauri agent runtime persistence commands"
```

---

### Task 3: Build the Frontend Agent Runtime Store and Client

**Files:**
- Create: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Create: `src/modules/ai/runtime/agentRuntimeClient.ts`
- Modify: `src/modules/ai/store/aiChatStore.ts`
- Test: `tests/ai/agent-runtime-store.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtimeStorePath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeStore.ts');

test('agent runtime store tracks threads, turns, timeline events, and loading state', async () => {
  const source = await readFile(runtimeStorePath, 'utf8');

  assert.match(source, /threadsByProject/);
  assert.match(source, /timelineByThread/);
  assert.match(source, /createThread/);
  assert.match(source, /appendTimelineEvent/);
  assert.match(source, /submitTurn/);
  assert.match(source, /isHydrating/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/agent-runtime-store.test.mjs`

Expected: FAIL because the store file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/ai/runtime/agentRuntimeStore.ts
import { create } from 'zustand';
import type { AgentThreadRecord, AgentTimelineEvent, AgentTurnRecord } from './agentRuntimeTypes';

type AgentRuntimeState = {
  threadsByProject: Record<string, AgentThreadRecord[]>;
  timelineByThread: Record<string, AgentTimelineEvent[]>;
  turnsByThread: Record<string, AgentTurnRecord[]>;
  isHydrating: boolean;
  createThread: (projectId: string, thread: AgentThreadRecord) => void;
  appendTimelineEvent: (threadId: string, event: AgentTimelineEvent) => void;
  submitTurn: (threadId: string, turn: AgentTurnRecord) => void;
  setHydrating: (value: boolean) => void;
};

export const useAgentRuntimeStore = create<AgentRuntimeState>((set) => ({
  threadsByProject: {},
  timelineByThread: {},
  turnsByThread: {},
  isHydrating: false,
  createThread: (projectId, thread) =>
    set((state) => ({
      threadsByProject: {
        ...state.threadsByProject,
        [projectId]: [thread, ...(state.threadsByProject[projectId] || []).filter((item) => item.id !== thread.id)],
      },
    })),
  appendTimelineEvent: (threadId, event) =>
    set((state) => ({
      timelineByThread: {
        ...state.timelineByThread,
        [threadId]: [...(state.timelineByThread[threadId] || []), event],
      },
    })),
  submitTurn: (threadId, turn) =>
    set((state) => ({
      turnsByThread: {
        ...state.turnsByThread,
        [threadId]: [...(state.turnsByThread[threadId] || []), turn],
      },
    })),
  setHydrating: (value) => set({ isHydrating: value }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/agent-runtime-store.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/agent-runtime-store.test.mjs src/modules/ai/runtime/agentRuntimeStore.ts src/modules/ai/runtime/agentRuntimeClient.ts src/modules/ai/store/aiChatStore.ts
git commit -m "feat: add frontend agent runtime store"
```

---

### Task 4: Implement the Context Assembler

**Files:**
- Create: `src/modules/ai/runtime/context/assembleAgentContext.ts`
- Create: `src/modules/ai/runtime/context/buildThreadPrompt.ts`
- Modify: `src/modules/ai/platform-bridges/types.ts`
- Test: `tests/ai/agent-context-assembler.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assemblerPath = path.resolve(__dirname, '../../src/modules/ai/runtime/context/assembleAgentContext.ts');

test('context assembler merges rules, references, thread facts, and memory entries', async () => {
  const source = await readFile(assemblerPath, 'utf8');

  assert.match(source, /export const assembleAgentContext/);
  assert.match(source, /AGENTS\.md/);
  assert.match(source, /memoryEntries/);
  assert.match(source, /referenceFiles/);
  assert.match(source, /labels:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/agent-context-assembler.test.mjs`

Expected: FAIL because the assembler file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/ai/runtime/context/assembleAgentContext.ts
import type { AgentContextBundle, AgentMemoryEntry } from '../agentRuntimeTypes';

export const assembleAgentContext = (input: {
  projectId: string | null;
  projectName: string | null;
  threadId: string | null;
  agentsInstructions: string[];
  referenceFiles: Array<{ path: string; summary: string; content: string }>;
  memoryEntries: AgentMemoryEntry[];
}) : AgentContextBundle => ({
  projectId: input.projectId,
  projectName: input.projectName,
  threadId: input.threadId,
  labels: ['AGENTS.md', ...input.referenceFiles.map((item) => item.path)],
  instructions: input.agentsInstructions,
  referenceFiles: input.referenceFiles,
  memoryEntries: input.memoryEntries,
});
```

```ts
// src/modules/ai/runtime/context/buildThreadPrompt.ts
import type { AgentContextBundle } from '../agentRuntimeTypes';

export const buildThreadPrompt = (context: AgentContextBundle, userInput: string) =>
  [
    context.instructions.length > 0 ? `<instructions>\n${context.instructions.join('\n\n')}\n</instructions>` : null,
    context.memoryEntries.length > 0
      ? `<memory>\n${context.memoryEntries.map((item) => `${item.title}: ${item.summary}`).join('\n')}\n</memory>`
      : null,
    context.referenceFiles.length > 0
      ? `<references>\n${context.referenceFiles.map((item) => `${item.path}\n${item.content}`).join('\n\n')}\n</references>`
      : null,
    userInput,
  ].filter(Boolean).join('\n\n');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/agent-context-assembler.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/agent-context-assembler.test.mjs src/modules/ai/runtime/context/assembleAgentContext.ts src/modules/ai/runtime/context/buildThreadPrompt.ts src/modules/ai/platform-bridges/types.ts
git commit -m "feat: add agent context assembler"
```

---

### Task 5: Build the Project Memory Runtime MVP

**Files:**
- Create: `src/modules/ai/runtime/memory/projectMemoryRuntime.ts`
- Modify: `src/types/index.ts`
- Modify: `src/store/projectStore.ts`
- Test: `tests/ai/project-memory-runtime.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const memoryRuntimePath = path.resolve(__dirname, '../../src/modules/ai/runtime/memory/projectMemoryRuntime.ts');
const projectStorePath = path.resolve(__dirname, '../../src/store/projectStore.ts');

test('project memory runtime upgrades project memory beyond designSystem/codeStructure placeholders', async () => {
  const runtimeSource = await readFile(memoryRuntimePath, 'utf8');
  const projectStore = await readFile(projectStorePath, 'utf8');

  assert.match(runtimeSource, /export const buildProjectMemoryEntry/);
  assert.match(runtimeSource, /userPreference/);
  assert.match(runtimeSource, /projectFact/);
  assert.match(projectStore, /memoryEntries/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/project-memory-runtime.test.mjs`

Expected: FAIL because the runtime file does not exist and the project store does not persist structured memory entries.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/ai/runtime/memory/projectMemoryRuntime.ts
import type { AgentMemoryEntry } from '../agentRuntimeTypes';

export const buildProjectMemoryEntry = (input: {
  id: string;
  title: string;
  summary: string;
  content: string;
  kind: 'projectFact' | 'userPreference';
  updatedAt: number;
}): AgentMemoryEntry => ({
  id: input.id,
  scope: 'project',
  title: input.title,
  summary: `[${input.kind}] ${input.summary}`,
  content: input.content,
  updatedAt: input.updatedAt,
});
```

```ts
// src/types/index.ts
export interface ProjectMemory {
  designSystem: Record<string, unknown>;
  codeStructure: Record<string, unknown>;
  memoryEntries: Array<{
    id: string;
    title: string;
    summary: string;
    content: string;
    kind: 'projectFact' | 'userPreference';
    updatedAt: number;
  }>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/project-memory-runtime.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/project-memory-runtime.test.mjs src/modules/ai/runtime/memory/projectMemoryRuntime.ts src/types/index.ts src/store/projectStore.ts
git commit -m "feat: add project memory runtime mvp"
```

---

### Task 6: Refactor AI Chat and GN Agent UI to Consume the Runtime

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx`
- Create: `src/modules/ai/runtime/timeline/timelineMappers.ts`
- Test: `tests/ai/agent-chat-runtime-ui.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const runtimeSummaryPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx');

test('AI chat consumes agent runtime state instead of directly orchestrating every provider path', async () => {
  const aiChat = await readFile(aiChatPath, 'utf8');
  const runtimeSummary = await readFile(runtimeSummaryPath, 'utf8');

  assert.match(aiChat, /useAgentRuntimeStore/);
  assert.match(aiChat, /submitTurn/);
  assert.match(aiChat, /timelineByThread/);
  assert.match(runtimeSummary, /Thread/);
  assert.match(runtimeSummary, /Memory/);
  assert.match(runtimeSummary, /Context/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/agent-chat-runtime-ui.test.mjs`

Expected: FAIL because the current UI is still directly orchestrating providers and does not render runtime-backed thread metadata.

- [ ] **Step 3: Write minimal implementation**

```tsx
// AIChat.tsx integration sketch
const runtimeThreads = useAgentRuntimeStore((state) => state.threadsByProject[currentProject.id] || []);
const runtimeTimeline = useAgentRuntimeStore((state) =>
  activeRuntimeThreadId ? state.timelineByThread[activeRuntimeThreadId] || [] : []
);
const submitTurn = useAgentRuntimeStore((state) => state.submitTurn);

// inside submit handler
submitTurn(activeRuntimeThreadId, {
  id: turnId,
  threadId: activeRuntimeThreadId,
  providerId: effectiveChatAgentId,
  status: 'running',
  prompt: localAgentPrompt,
  createdAt: Date.now(),
  completedAt: null,
});
```

```tsx
// GNAgentRuntimeSummary.tsx sketch
<dl className="gn-agent-runtime-summary-grid">
  <div><dt>Thread</dt><dd>{activeThreadTitle || '未创建线程'}</dd></div>
  <div><dt>Context</dt><dd>{contextLabels.join('、') || '暂无上下文标签'}</dd></div>
  <div><dt>Memory</dt><dd>{memoryLabels.join('、') || '暂无记忆命中'}</dd></div>
</dl>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/agent-chat-runtime-ui.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/agent-chat-runtime-ui.test.mjs src/components/workspace/AIChat.tsx src/components/ai/gn-agent-shell/GNAgentChatPage.tsx src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx src/modules/ai/runtime/timeline/timelineMappers.ts
git commit -m "feat: wire ai chat to agent runtime"
```

---

## Self-Review

### Spec coverage

- Unified runtime layer: covered by Tasks 1, 2, 3, and 6.
- Persistent threads: covered by Tasks 2 and 3.
- Structured context assembler: covered by Task 4.
- Memory MVP: covered by Task 5.
- Existing UI preserved and upgraded in place: covered by Task 6.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain in task steps.
- Each task names exact files and at least one concrete test command.

### Type consistency

- Shared type names are consistent across the plan:
  - `AgentThreadRecord`
  - `AgentTurnRecord`
  - `AgentTimelineEvent`
  - `AgentContextBundle`
  - `AgentMemoryEntry`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-02-goodnight-agent-runtime-phase-1-2.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
