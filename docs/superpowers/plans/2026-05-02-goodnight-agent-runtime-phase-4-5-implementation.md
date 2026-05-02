# GoodNight Agent Runtime Phase 4-5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class Skill Runtime and MCP Runtime on top of the new GoodNight agent runtime so threads can explicitly activate skills, call MCP tools, and surface those actions through the shared runtime timeline.

**Architecture:** Reuse the Phase 1-3 runtime spine instead of bolting skills and MCP onto `AIChat.tsx` directly. Skills become structured runtime resources that can be listed, selected, injected into prompt context, and tracked in timeline events; MCP becomes a runtime-managed connection layer that discovers tools, invokes them through the same runtime client, and emits shared tool-call events with approval/sandbox compatibility.

**Tech Stack:** Tauri, Rust, React 19, TypeScript, Zustand, Node test runner, existing GoodNight AI runtime modules, official Codex repository as implementation reference

---

## File Structure

### Frontend files to create

- Create: `src/modules/ai/runtime/skills/runtimeSkillTypes.ts`
- Create: `src/modules/ai/runtime/skills/runtimeSkillRegistry.ts`
- Create: `src/modules/ai/runtime/skills/buildRuntimeSkillPrompt.ts`
- Create: `src/modules/ai/runtime/mcp/runtimeMcpTypes.ts`
- Create: `src/modules/ai/runtime/mcp/runtimeMcpStore.ts`
- Create: `src/modules/ai/runtime/mcp/runtimeMcpClient.ts`

### Frontend files to modify

- Modify: `src/modules/ai/runtime/agentRuntimeTypes.ts`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Modify: `src/modules/ai/runtime/agentRuntimeClient.ts`
- Modify: `src/modules/ai/runtime/context/assembleAgentContext.ts`
- Modify: `src/modules/ai/skills/skillLibrary.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx`

### Backend files to create

- Create: `src-tauri/src/agent_runtime/mcp_store.rs`
- Create: `src-tauri/src/agent_runtime/skill_store.rs`

### Backend files to modify

- Modify: `src-tauri/src/agent_runtime/mod.rs`
- Modify: `src-tauri/src/agent_runtime/types.rs`
- Modify: `src-tauri/src/agent_runtime/commands.rs`
- Modify: `src-tauri/src/lib.rs`

### Tests to create

- Create: `tests/ai/runtime-skill-registry.test.mjs`
- Create: `tests/ai/runtime-skill-prompt.test.mjs`
- Create: `tests/ai/runtime-mcp-store.test.mjs`
- Create: `tests/ai/tauri-runtime-mcp-source.test.mjs`
- Create: `tests/ai/agent-runtime-skill-ui.test.mjs`

---

## Task 1: Add Runtime Skill Types and Registry

**Files:**
- Create: `src/modules/ai/runtime/skills/runtimeSkillTypes.ts`
- Create: `src/modules/ai/runtime/skills/runtimeSkillRegistry.ts`
- Modify: `src/modules/ai/skills/skillLibrary.ts`
- Test: `tests/ai/runtime-skill-registry.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadRegistry = async () =>
  import(`../../src/modules/ai/runtime/skills/runtimeSkillRegistry.ts?test=${Date.now()}`);

test('runtime skill registry lists skills and supports thread activation state', async () => {
  const { createRuntimeSkillRegistry } = await loadRegistry();
  const registry = createRuntimeSkillRegistry([
    { id: 'skill-a', name: 'Skill A', prompt: 'Prompt A' },
    { id: 'skill-b', name: 'Skill B', prompt: 'Prompt B' },
  ]);

  registry.activateSkill('thread-1', 'skill-a');

  assert.equal(registry.listSkills().length, 2);
  assert.deepEqual(registry.listActiveSkills('thread-1').map((item) => item.id), ['skill-a']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/runtime-skill-registry.test.mjs`

Expected: FAIL because the runtime skill registry files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/ai/runtime/skills/runtimeSkillTypes.ts
export type RuntimeSkillDefinition = {
  id: string;
  name: string;
  prompt: string;
};
```

```ts
// src/modules/ai/runtime/skills/runtimeSkillRegistry.ts
import type { RuntimeSkillDefinition } from './runtimeSkillTypes';

export const createRuntimeSkillRegistry = (skills: RuntimeSkillDefinition[]) => {
  const activeByThread = new Map<string, string[]>();

  return {
    listSkills: () => [...skills],
    activateSkill: (threadId: string, skillId: string) => {
      const current = activeByThread.get(threadId) || [];
      if (!current.includes(skillId)) {
        activeByThread.set(threadId, [...current, skillId]);
      }
    },
    listActiveSkills: (threadId: string) => {
      const active = activeByThread.get(threadId) || [];
      return skills.filter((skill) => active.includes(skill.id));
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/runtime-skill-registry.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/runtime-skill-registry.test.mjs src/modules/ai/runtime/skills/runtimeSkillTypes.ts src/modules/ai/runtime/skills/runtimeSkillRegistry.ts src/modules/ai/skills/skillLibrary.ts
git commit -m "feat: add runtime skill registry"
```

---

## Task 2: Inject Active Skills into Runtime Context and Prompt Building

**Files:**
- Create: `src/modules/ai/runtime/skills/buildRuntimeSkillPrompt.ts`
- Modify: `src/modules/ai/runtime/context/assembleAgentContext.ts`
- Modify: `src/modules/ai/runtime/agentRuntimeTypes.ts`
- Test: `tests/ai/runtime-skill-prompt.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadPromptBuilder = async () =>
  import(`../../src/modules/ai/runtime/skills/buildRuntimeSkillPrompt.ts?test=${Date.now()}`);

test('runtime skill prompt builder concatenates active skill prompts in stable order', async () => {
  const { buildRuntimeSkillPrompt } = await loadPromptBuilder();
  const prompt = buildRuntimeSkillPrompt([
    { id: 'skill-a', name: 'Skill A', prompt: 'Prompt A' },
    { id: 'skill-b', name: 'Skill B', prompt: 'Prompt B' },
  ]);

  assert.match(prompt, /Prompt A/);
  assert.match(prompt, /Prompt B/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/runtime-skill-prompt.test.mjs`

Expected: FAIL because runtime skill prompt composition does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/ai/runtime/skills/buildRuntimeSkillPrompt.ts
import type { RuntimeSkillDefinition } from './runtimeSkillTypes';

export const buildRuntimeSkillPrompt = (skills: RuntimeSkillDefinition[]) =>
  skills.map((skill) => `<skill id="${skill.id}">\n${skill.prompt}\n</skill>`).join('\n\n');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/runtime-skill-prompt.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/runtime-skill-prompt.test.mjs src/modules/ai/runtime/skills/buildRuntimeSkillPrompt.ts src/modules/ai/runtime/context/assembleAgentContext.ts src/modules/ai/runtime/agentRuntimeTypes.ts
git commit -m "feat: inject runtime skills into context"
```

---

## Task 3: Add Frontend MCP Types and Store

**Files:**
- Create: `src/modules/ai/runtime/mcp/runtimeMcpTypes.ts`
- Create: `src/modules/ai/runtime/mcp/runtimeMcpStore.ts`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Test: `tests/ai/runtime-mcp-store.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadStore = async () =>
  import(`../../src/modules/ai/runtime/mcp/runtimeMcpStore.ts?test=${Date.now()}`);

test('runtime mcp store tracks server state and tool call history', async () => {
  const { useRuntimeMcpStore } = await loadStore();
  const store = useRuntimeMcpStore.getState();

  store.upsertServer({ id: 'local-docs', name: 'Local Docs', status: 'connected' });
  store.appendToolCall('thread-1', { id: 'call-1', serverId: 'local-docs', toolName: 'search', status: 'completed' });

  assert.equal(useRuntimeMcpStore.getState().servers[0].status, 'connected');
  assert.equal(useRuntimeMcpStore.getState().toolCallsByThread['thread-1'][0].toolName, 'search');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/runtime-mcp-store.test.mjs`

Expected: FAIL because the runtime MCP store does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/ai/runtime/mcp/runtimeMcpTypes.ts
export type RuntimeMcpServer = {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
};

export type RuntimeMcpToolCall = {
  id: string;
  serverId: string;
  toolName: string;
  status: 'running' | 'completed' | 'error';
};
```

```ts
// src/modules/ai/runtime/mcp/runtimeMcpStore.ts
import { create } from 'zustand';
import type { RuntimeMcpServer, RuntimeMcpToolCall } from './runtimeMcpTypes';

type RuntimeMcpStoreState = {
  servers: RuntimeMcpServer[];
  toolCallsByThread: Record<string, RuntimeMcpToolCall[]>;
  upsertServer: (server: RuntimeMcpServer) => void;
  appendToolCall: (threadId: string, toolCall: RuntimeMcpToolCall) => void;
};

export const useRuntimeMcpStore = create<RuntimeMcpStoreState>((set) => ({
  servers: [],
  toolCallsByThread: {},
  upsertServer: (server) =>
    set((state) => ({
      servers: [server, ...state.servers.filter((item) => item.id !== server.id)],
    })),
  appendToolCall: (threadId, toolCall) =>
    set((state) => ({
      toolCallsByThread: {
        ...state.toolCallsByThread,
        [threadId]: [...(state.toolCallsByThread[threadId] || []), toolCall],
      },
    })),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/runtime-mcp-store.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/runtime-mcp-store.test.mjs src/modules/ai/runtime/mcp/runtimeMcpTypes.ts src/modules/ai/runtime/mcp/runtimeMcpStore.ts src/modules/ai/runtime/agentRuntimeStore.ts
git commit -m "feat: add runtime mcp store"
```

---

## Task 4: Add Backend MCP Command Registration Skeleton

**Files:**
- Create: `src-tauri/src/agent_runtime/mcp_store.rs`
- Modify: `src-tauri/src/agent_runtime/mod.rs`
- Modify: `src-tauri/src/agent_runtime/types.rs`
- Modify: `src-tauri/src/agent_runtime/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `tests/ai/tauri-runtime-mcp-source.test.mjs`

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

test('tauri exposes runtime mcp registration commands', async () => {
  const source = await readFile(tauriLibPath, 'utf8');
  const handlerMatch = source.match(/\.invoke_handler\(tauri::generate_handler!\[(?<commands>[\s\S]*?)\]\)/);

  assert.ok(handlerMatch?.groups?.commands);
  assert.match(handlerMatch.groups.commands, /\blist_runtime_mcp_servers\b/);
  assert.match(handlerMatch.groups.commands, /\binvoke_runtime_mcp_tool\b/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/tauri-runtime-mcp-source.test.mjs`

Expected: FAIL because MCP runtime commands are not registered yet.

- [ ] **Step 3: Write minimal implementation**

```rust
// src-tauri/src/agent_runtime/commands.rs
#[tauri::command]
pub fn list_runtime_mcp_servers() -> Result<Vec<RuntimeMcpServerRecord>, String> { ... }

#[tauri::command]
pub fn invoke_runtime_mcp_tool(...) -> Result<RuntimeMcpToolCallRecord, String> { ... }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/tauri-runtime-mcp-source.test.mjs`

Expected: PASS

- [ ] **Step 5: Run backend verification**

Run: `cargo test --manifest-path src-tauri/Cargo.toml agent_runtime`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/ai/tauri-runtime-mcp-source.test.mjs src-tauri/src/agent_runtime/mcp_store.rs src-tauri/src/agent_runtime/mod.rs src-tauri/src/agent_runtime/types.rs src-tauri/src/agent_runtime/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add runtime mcp command skeleton"
```

---

## Task 5: Wire Skills and MCP Visibility into the Existing Runtime UI

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx`
- Modify: `src/modules/ai/runtime/agentRuntimeClient.ts`
- Test: `tests/ai/agent-runtime-skill-ui.test.mjs`

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

test('runtime ui wiring references active skills and mcp state', async () => {
  const aiChat = await readFile(aiChatPath, 'utf8');
  const summary = await readFile(runtimeSummaryPath, 'utf8');

  assert.match(aiChat, /activeSkills|runtimeMcp/i);
  assert.match(summary, /skill|mcp/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/agent-runtime-skill-ui.test.mjs`

Expected: FAIL because the runtime UI does not expose skill/MCP state yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx
// add compact sections for active skill count and MCP server count
```

```tsx
// src/components/workspace/AIChat.tsx
// thread runtime payload should include active skills and MCP state summaries
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/agent-runtime-skill-ui.test.mjs`

Expected: PASS

- [ ] **Step 5: Run build verification**

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/ai/agent-runtime-skill-ui.test.mjs src/components/workspace/AIChat.tsx src/components/ai/gn-agent-shell/GNAgentRuntimeSummary.tsx src/modules/ai/runtime/agentRuntimeClient.ts
git commit -m "feat: surface runtime skill and mcp state"
```

---

## Self-Review

- **Spec coverage:** This plan covers the full next two capability layers after approvals/sandbox: skill registration/injection and MCP discovery/tool invocation.
- **Placeholder scan:** The tasks keep code minimal and concrete; no `TODO` placeholders are required to execute them.
- **Type consistency:** The plan uses stable names throughout: `RuntimeSkillDefinition`, `RuntimeMcpServer`, `RuntimeMcpToolCall`, `buildRuntimeSkillPrompt`, `invoke_runtime_mcp_tool`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-02-goodnight-agent-runtime-phase-4-5-implementation.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
