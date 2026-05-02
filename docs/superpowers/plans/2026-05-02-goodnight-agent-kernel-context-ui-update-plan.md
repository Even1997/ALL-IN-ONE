# GoodNight Agent Kernel Context And UI Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current GoodNight AI chat/runtime into a real agent workbench by adding a context manager, unified tool loop, memory write-back, and UI surfaces that make context, tools, approvals, replay, and memory visible.

**Architecture:** Keep the existing Tauri + React + Zustand runtime spine. Add a focused `agent-kernel` layer that owns turn orchestration, context assembly, tool execution, and memory write-back, while `AIChat.tsx` becomes a submit/render shell. UI changes live in the top-level Agent workspace and reuse existing runtime panels where possible.

**Tech Stack:** React 19, TypeScript, Zustand, Tauri v2, Rust JSON persistence, existing `src/modules/ai/runtime/*`, Node test runner, `npm run build`, `cargo test --manifest-path src-tauri/Cargo.toml agent_runtime`

---

## Scope

### In Scope

- Build a real agent context manager with budgeted sections.
- Add visible context UI: selected references, retrieved files, memory, recent history, and token budget.
- Route built-in chat through a unified tool loop instead of direct one-shot completion.
- Add tool-call UI for read/search/write/bash/MCP actions with status and approval state.
- Add memory extraction and write-back for project facts, user preferences, and thread summaries.
- Extract the turn orchestration from `AIChat.tsx` into a testable `agent-kernel`.

### Not In Scope

- Replacing the whole app navigation or redesigning the desktop shell.
- Building a full MCP marketplace.
- Vector database or embeddings. Start with deterministic keyword/context selection.
- Multi-agent delegation. This plan makes one agent reliable first.

---

## File Structure

### Frontend Files To Create

- `src/modules/ai/runtime/context/agentContextTypes.ts`  
  Shared context section, budget, source, and UI view model types.
- `src/modules/ai/runtime/context/buildAgentContext.ts`  
  Main context manager. It selects history, references, memory, and project facts.
- `src/modules/ai/runtime/context/contextBudgetAllocator.ts`  
  Deterministic token budget allocation and truncation.
- `src/modules/ai/runtime/agent-kernel/agentKernelTypes.ts`  
  Turn input/output, step, tool action, and memory candidate types.
- `src/modules/ai/runtime/agent-kernel/runAgentTurn.ts`  
  Runtime orchestration entrypoint used by the UI.
- `src/modules/ai/runtime/tools/runtimeToolLoop.ts`  
  XML tool call loop for built-in model execution, backed by existing GoodNight tools.
- `src/modules/ai/runtime/memory/extractMemoryCandidates.ts`  
  Deterministic candidate extraction from user/assistant messages.
- `src/components/ai/gn-agent-shell/GNAgentContextPanel.tsx`  
  Right-rail context visibility panel.
- `src/components/ai/gn-agent-shell/GNAgentToolCallPanel.tsx`  
  Tool-call status list with action names, risk, and output preview.
- `src/components/ai/gn-agent-shell/GNAgentMemoryInbox.tsx`  
  Memory candidate review UI.

### Frontend Files To Modify

- `src/components/workspace/AIChat.tsx`  
  Replace inline runtime orchestration with `runAgentTurn`.
- `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`  
  Add context, tool-call, and memory inbox panels around the existing chat surface.
- `src/modules/ai/runtime/agentRuntimeStore.ts`  
  Store context snapshots, tool calls, and memory candidates by thread.
- `src/modules/ai/runtime/agentRuntimeTypes.ts`  
  Add exported runtime types used by the UI.
- `src/modules/ai/runtime/agentRuntimeClient.ts`  
  Reuse existing memory APIs and expose memory write-back helpers.

### Backend Files To Modify

- `src-tauri/src/agent_runtime/types.rs`  
  Add optional memory kind and thread summary fields if needed by write-back.
- `src-tauri/src/agent_runtime/memory_store.rs`  
  Keep project memory persistence, add filtering by kind if the frontend needs it.
- `src-tauri/src/agent_runtime/commands.rs`  
  Expose memory write-back commands already modeled in the frontend.

### Tests To Create Or Update

- Create: `tests/ai/agent-context-manager.test.mjs`
- Create: `tests/ai/agent-context-ui.test.mjs`
- Create: `tests/ai/runtime-tool-loop.test.mjs`
- Create: `tests/ai/agent-kernel-turn.test.mjs`
- Create: `tests/ai/agent-memory-writeback.test.mjs`
- Update: `tests/ai/agent-runtime-store.test.mjs`
- Update: `tests/ai/gn-agent-chat-structure.test.mjs`

---

### Task 1: Add Budgeted Agent Context Manager

**Files:**
- Create: `src/modules/ai/runtime/context/agentContextTypes.ts`
- Create: `src/modules/ai/runtime/context/contextBudgetAllocator.ts`
- Create: `src/modules/ai/runtime/context/buildAgentContext.ts`
- Modify: `src/modules/ai/runtime/context/buildThreadPrompt.ts`
- Test: `tests/ai/agent-context-manager.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadContext = async () =>
  import(`../../src/modules/ai/runtime/context/buildAgentContext.ts?test=${Date.now()}`);

test('buildAgentContext includes history, references, memory, and a budget report', async () => {
  const { buildAgentContext } = await loadContext();
  const context = buildAgentContext({
    projectId: 'project-1',
    projectName: 'GoodNight',
    threadId: 'thread-1',
    userInput: '继续刚才的 Agent 计划',
    contextWindowTokens: 4000,
    conversationHistory: [
      { role: 'user', content: '我们要做自己的 AI 功能。' },
      { role: 'assistant', content: '先补 context manager。' },
    ],
    instructions: ['Follow AGENTS.md'],
    referenceFiles: [
      { path: 'docs/agent.md', summary: 'Agent plan', content: 'Context manager and tool loop' },
    ],
    memoryEntries: [
      { id: 'memory-1', threadId: null, label: 'projectFact', content: 'Use Tauri for local persistence', createdAt: 1 },
    ],
    activeSkills: [],
  });

  assert.equal(context.threadId, 'thread-1');
  assert.ok(context.sections.some((section) => section.kind === 'history'));
  assert.ok(context.sections.some((section) => section.kind === 'reference'));
  assert.ok(context.sections.some((section) => section.kind === 'memory'));
  assert.ok(context.budget.usedTokens > 0);
  assert.ok(context.prompt.includes('<context_report>'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ai/agent-context-manager.test.mjs
```

Expected: FAIL because `buildAgentContext.ts` does not exist.

- [ ] **Step 3: Add shared context types**

```ts
// src/modules/ai/runtime/context/agentContextTypes.ts
import type { RuntimeSkillDefinition } from '../skills/runtimeSkillTypes';
import type { AgentMemoryEntry, AgentReferenceFile } from '../agentRuntimeTypes';

export type AgentContextSectionKind =
  | 'instructions'
  | 'skills'
  | 'history'
  | 'memory'
  | 'reference'
  | 'active-context'
  | 'user-input';

export type AgentContextSection = {
  id: string;
  kind: AgentContextSectionKind;
  title: string;
  content: string;
  sourceLabel: string;
  estimatedTokens: number;
  included: boolean;
};

export type AgentContextBudget = {
  limitTokens: number;
  usedTokens: number;
  remainingTokens: number;
};

export type AgentContextBuildInput = {
  projectId: string;
  projectName: string;
  threadId: string;
  userInput: string;
  contextWindowTokens: number;
  conversationHistory: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  instructions: string[];
  referenceFiles: AgentReferenceFile[];
  memoryEntries: AgentMemoryEntry[];
  activeSkills: RuntimeSkillDefinition[];
};

export type AgentContextSnapshot = {
  projectId: string;
  projectName: string;
  threadId: string;
  sections: AgentContextSection[];
  budget: AgentContextBudget;
  prompt: string;
};
```

- [ ] **Step 4: Add deterministic budget allocator**

```ts
// src/modules/ai/runtime/context/contextBudgetAllocator.ts
import { estimateTextTokens } from '../../chat/contextBudget';
import type { AgentContextBudget, AgentContextSection } from './agentContextTypes';

export const createContextSection = (
  section: Omit<AgentContextSection, 'estimatedTokens' | 'included'>
): AgentContextSection => ({
  ...section,
  estimatedTokens: estimateTextTokens(section.content),
  included: true,
});

export const allocateContextBudget = (
  sections: AgentContextSection[],
  limitTokens: number
): { sections: AgentContextSection[]; budget: AgentContextBudget } => {
  const safeLimit = Math.max(1000, Number.isFinite(limitTokens) ? limitTokens : 200000);
  let usedTokens = 0;
  const allocated = sections.map((section) => {
    const nextUsed = usedTokens + section.estimatedTokens;
    if (nextUsed > safeLimit) {
      return { ...section, included: false };
    }
    usedTokens = nextUsed;
    return section;
  });

  return {
    sections: allocated,
    budget: {
      limitTokens: safeLimit,
      usedTokens,
      remainingTokens: Math.max(0, safeLimit - usedTokens),
    },
  };
};
```

- [ ] **Step 5: Implement `buildAgentContext`**

```ts
// src/modules/ai/runtime/context/buildAgentContext.ts
import { buildConversationHistorySection } from '../../chat/directChatPrompt';
import { buildRuntimeSkillPrompt } from '../skills/buildRuntimeSkillPrompt';
import { allocateContextBudget, createContextSection } from './contextBudgetAllocator';
import type { AgentContextBuildInput, AgentContextSnapshot } from './agentContextTypes';

const joinLines = (items: string[]) => items.map((item) => item.trim()).filter(Boolean).join('\n');

export const buildAgentContext = (input: AgentContextBuildInput): AgentContextSnapshot => {
  const sections = [
    input.instructions.length > 0
      ? createContextSection({
          id: 'instructions',
          kind: 'instructions',
          title: 'Instructions',
          sourceLabel: 'AGENTS.md + active UI context',
          content: `<instructions>\n${input.instructions.join('\n\n')}\n</instructions>`,
        })
      : null,
    input.activeSkills.length > 0
      ? createContextSection({
          id: 'skills',
          kind: 'skills',
          title: 'Active Skills',
          sourceLabel: 'runtime skill registry',
          content: `<skills>\n${buildRuntimeSkillPrompt(input.activeSkills)}\n</skills>`,
        })
      : null,
    createContextSection({
      id: 'history',
      kind: 'history',
      title: 'Recent Conversation',
      sourceLabel: 'current chat session',
      content: `<history>\n${buildConversationHistorySection(input.conversationHistory, 8)}\n</history>`,
    }),
    input.memoryEntries.length > 0
      ? createContextSection({
          id: 'memory',
          kind: 'memory',
          title: 'Memory',
          sourceLabel: 'project memory',
          content: `<memory>\n${input.memoryEntries.map((entry) => `${entry.label}: ${entry.content}`).join('\n')}\n</memory>`,
        })
      : null,
    input.referenceFiles.length > 0
      ? createContextSection({
          id: 'references',
          kind: 'reference',
          title: 'References',
          sourceLabel: 'selected reference scope',
          content: `<references>\n${input.referenceFiles.map((file) => `${file.path}\n${file.content}`).join('\n\n')}\n</references>`,
        })
      : null,
    createContextSection({
      id: 'user-input',
      kind: 'user-input',
      title: 'User Request',
      sourceLabel: 'composer',
      content: input.userInput.trim(),
    }),
  ].filter((section): section is NonNullable<typeof section> => Boolean(section));

  const allocated = allocateContextBudget(sections, input.contextWindowTokens);
  const includedSections = allocated.sections.filter((section) => section.included);
  const contextReport = `<context_report>\nused_tokens: ${allocated.budget.usedTokens}\nlimit_tokens: ${allocated.budget.limitTokens}\nincluded: ${includedSections.map((section) => section.id).join(', ')}\nexcluded: ${allocated.sections.filter((section) => !section.included).map((section) => section.id).join(', ')}\n</context_report>`;

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    threadId: input.threadId,
    sections: allocated.sections,
    budget: allocated.budget,
    prompt: joinLines([contextReport, ...includedSections.map((section) => section.content)]),
  };
};
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
node --test tests/ai/agent-context-manager.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/ai/runtime/context/agentContextTypes.ts src/modules/ai/runtime/context/contextBudgetAllocator.ts src/modules/ai/runtime/context/buildAgentContext.ts src/modules/ai/runtime/context/buildThreadPrompt.ts tests/ai/agent-context-manager.test.mjs
git commit -m "feat: add budgeted agent context manager"
```

---

### Task 2: Add Context UI In The Agent Workspace

**Files:**
- Create: `src/components/ai/gn-agent-shell/GNAgentContextPanel.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Test: `tests/ai/agent-context-ui.test.mjs`

- [ ] **Step 1: Write the failing UI source test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('agent context panel renders context sections and budget state', async () => {
  const source = await readFile('src/components/ai/gn-agent-shell/GNAgentContextPanel.tsx', 'utf8');

  assert.match(source, /contextSections/);
  assert.match(source, /budget/);
  assert.match(source, /included/);
  assert.match(source, /excluded/);
});

test('agent chat page includes the context panel in the runtime layout', async () => {
  const source = await readFile('src/components/ai/gn-agent-shell/GNAgentChatPage.tsx', 'utf8');

  assert.match(source, /GNAgentContextPanel/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ai/agent-context-ui.test.mjs
```

Expected: FAIL because `GNAgentContextPanel.tsx` is missing.

- [ ] **Step 3: Extend runtime store with context snapshots**

```ts
// src/modules/ai/runtime/agentRuntimeStore.ts
import type { AgentContextSnapshot } from './context/agentContextTypes';

type AgentRuntimeState = {
  contextByThread: Record<string, AgentContextSnapshot>;
  setThreadContext: (threadId: string, context: AgentContextSnapshot) => void;
};

// inside create(...)
contextByThread: {},
setThreadContext: (threadId, context) =>
  set((state) => ({
    contextByThread: {
      ...state.contextByThread,
      [threadId]: context,
    },
  })),
```

- [ ] **Step 4: Add context panel**

```tsx
// src/components/ai/gn-agent-shell/GNAgentContextPanel.tsx
import React from 'react';
import type { AgentContextSnapshot } from '../../../modules/ai/runtime/context/agentContextTypes';

export const GNAgentContextPanel: React.FC<{
  context: AgentContextSnapshot | null;
}> = ({ context }) => {
  const contextSections = context?.sections || [];
  const budget = context?.budget || null;

  return (
    <section className="gn-agent-runtime-panel">
      <div className="gn-agent-runtime-panel-head">
        <strong>Context</strong>
        <span>{budget ? `${budget.usedTokens}/${budget.limitTokens}` : '0/0'}</span>
      </div>
      {contextSections.length === 0 ? (
        <p className="gn-agent-runtime-panel-empty">当前线程还没有上下文快照。</p>
      ) : (
        <div className="gn-agent-runtime-panel-list">
          {contextSections.map((section) => (
            <article key={section.id} className="gn-agent-runtime-card">
              <strong>{section.title}</strong>
              <span>{section.sourceLabel}</span>
              <code>{section.included ? 'included' : 'excluded'}</code>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
```

- [ ] **Step 5: Wire panel into `GNAgentChatPage`**

```tsx
// src/components/ai/gn-agent-shell/GNAgentChatPage.tsx
import { GNAgentContextPanel } from './GNAgentContextPanel';
import { useAgentRuntimeStore } from '../../../modules/ai/runtime/agentRuntimeStore';

const activeSessionId = useAIChatStore((state) =>
  currentProject ? state.projects[currentProject.id]?.activeSessionId || null : null
);
const contextSnapshot = useAgentRuntimeStore((state) =>
  activeSessionId ? state.contextByThread[activeSessionId] || null : null
);

<aside className="gn-agent-runtime-sidebar">
  <GNAgentContextPanel context={contextSnapshot} />
  <GNAgentMemoryPanel />
</aside>
```

- [ ] **Step 6: Run tests and build**

Run:

```bash
node --test tests/ai/agent-context-ui.test.mjs
npm run build
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ai/gn-agent-shell/GNAgentContextPanel.tsx src/components/ai/gn-agent-shell/GNAgentChatPage.tsx src/modules/ai/runtime/agentRuntimeStore.ts tests/ai/agent-context-ui.test.mjs
git commit -m "feat: show agent context in runtime UI"
```

---

### Task 3: Add Unified Runtime Tool Loop

**Files:**
- Create: `src/modules/ai/runtime/tools/runtimeToolLoop.ts`
- Create: `src/modules/ai/runtime/agent-kernel/agentKernelTypes.ts`
- Modify: `src/modules/ai/core/AIService.ts`
- Modify: `src/modules/ai/runtime/agentRuntimeClient.ts`
- Test: `tests/ai/runtime-tool-loop.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadToolLoop = async () =>
  import(`../../src/modules/ai/runtime/tools/runtimeToolLoop.ts?test=${Date.now()}`);

test('runtime tool loop executes parsed tools and returns a final answer', async () => {
  const { runRuntimeToolLoop } = await loadToolLoop();
  const calls = [];
  const result = await runRuntimeToolLoop({
    maxRounds: 2,
    initialPrompt: 'Read package.json',
    systemPrompt: 'Use tools when needed.',
    callModel: async (messages) => {
      calls.push(messages.length);
      return calls.length === 1
        ? '<tool_use><tool name="view"><tool_params>{"file_path":"package.json"}</tool_params></tool></tool_use>'
        : 'package.json was read.';
    },
    executeTool: async (call) => ({
      type: 'text',
      content: `result for ${call.name}`,
      is_error: false,
    }),
    allowedTools: ['view'],
  });

  assert.equal(result.finalContent, 'package.json was read.');
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, 'view');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ai/runtime-tool-loop.test.mjs
```

Expected: FAIL because `runtimeToolLoop.ts` does not exist.

- [ ] **Step 3: Add agent kernel types**

```ts
// src/modules/ai/runtime/agent-kernel/agentKernelTypes.ts
import type { ToolCall, ToolResult } from '../../../../components/workspace/tools';

export type RuntimeToolStep = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed' | 'blocked';
  resultPreview: string;
};

export type RuntimeToolLoopResult = {
  finalContent: string;
  transcript: string;
  toolCalls: RuntimeToolStep[];
};

export type RuntimeToolLoopOptions = {
  maxRounds: number;
  initialPrompt: string;
  systemPrompt: string;
  allowedTools: string[];
  callModel: (messages: Array<{ role: 'user' | 'assistant'; content: string }>, systemPrompt: string) => Promise<string>;
  executeTool: (call: ToolCall) => Promise<ToolResult>;
};
```

- [ ] **Step 4: Implement runtime tool loop**

```ts
// src/modules/ai/runtime/tools/runtimeToolLoop.ts
import { formatToolResult, parseToolCalls } from '../../../../components/workspace/tools';
import type { RuntimeToolLoopOptions, RuntimeToolLoopResult, RuntimeToolStep } from '../agent-kernel/agentKernelTypes';

const createToolStep = (call: { id: string; name: string; input: Record<string, unknown> }): RuntimeToolStep => ({
  id: call.id,
  name: call.name,
  input: call.input,
  status: 'running',
  resultPreview: '',
});

export const runRuntimeToolLoop = async (
  options: RuntimeToolLoopOptions
): Promise<RuntimeToolLoopResult> => {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: options.initialPrompt },
  ];
  const toolCalls: RuntimeToolStep[] = [];
  let transcript = '';
  let finalContent = '';

  for (let round = 0; round < options.maxRounds; round += 1) {
    const assistantText = await options.callModel(messages, options.systemPrompt);
    transcript += `${assistantText}\n`;
    finalContent = assistantText.trim() || finalContent;

    const parsedCalls = parseToolCalls(assistantText);
    if (parsedCalls.length === 0) {
      return { finalContent, transcript: transcript.trim(), toolCalls };
    }

    const toolResults: string[] = [];
    for (const call of parsedCalls) {
      const step = createToolStep(call);
      toolCalls.push(step);

      if (!options.allowedTools.includes(call.name)) {
        step.status = 'blocked';
        step.resultPreview = `Tool ${call.name} is not allowed.`;
        toolResults.push(step.resultPreview);
        continue;
      }

      const result = await options.executeTool(call);
      const formatted = formatToolResult(result);
      step.status = result.is_error ? 'failed' : 'completed';
      step.resultPreview = formatted.slice(0, 1000);
      toolResults.push(`Tool ${call.name} result:\n${formatted}`);
    }

    messages.push({ role: 'assistant', content: assistantText });
    messages.push({
      role: 'user',
      content: `以下是工具执行结果，请继续完成原始任务：\n\n${toolResults.join('\n\n')}`,
    });
  }

  return { finalContent, transcript: transcript.trim(), toolCalls };
};
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
node --test tests/ai/runtime-tool-loop.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/ai/runtime/tools/runtimeToolLoop.ts src/modules/ai/runtime/agent-kernel/agentKernelTypes.ts src/modules/ai/core/AIService.ts src/modules/ai/runtime/agentRuntimeClient.ts tests/ai/runtime-tool-loop.test.mjs
git commit -m "feat: add unified runtime tool loop"
```

---

### Task 4: Add Agent Kernel Turn Runner

**Files:**
- Create: `src/modules/ai/runtime/agent-kernel/runAgentTurn.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Test: `tests/ai/agent-kernel-turn.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadKernel = async () =>
  import(`../../src/modules/ai/runtime/agent-kernel/runAgentTurn.ts?test=${Date.now()}`);

test('runAgentTurn builds context, executes model flow, and returns UI-ready state', async () => {
  const { runAgentTurn } = await loadKernel();
  const result = await runAgentTurn({
    projectId: 'project-1',
    projectName: 'GoodNight',
    threadId: 'thread-1',
    userInput: '总结当前计划',
    contextWindowTokens: 4000,
    conversationHistory: [],
    instructions: ['Follow AGENTS.md'],
    referenceFiles: [],
    memoryEntries: [],
    activeSkills: [],
    executeModel: async () => '计划是先做上下文，再做工具闭环。',
    executeTool: async () => ({ type: 'text', content: 'unused', is_error: false }),
  });

  assert.equal(result.finalContent, '计划是先做上下文，再做工具闭环。');
  assert.equal(result.context.threadId, 'thread-1');
  assert.deepEqual(result.toolCalls, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ai/agent-kernel-turn.test.mjs
```

Expected: FAIL because `runAgentTurn.ts` does not exist.

- [ ] **Step 3: Implement kernel turn runner**

```ts
// src/modules/ai/runtime/agent-kernel/runAgentTurn.ts
import type { ToolCall, ToolResult } from '../../../../components/workspace/tools';
import { buildAgentContext } from '../context/buildAgentContext';
import { runRuntimeToolLoop } from '../tools/runtimeToolLoop';
import type { AgentContextBuildInput } from '../context/agentContextTypes';
import type { RuntimeToolStep } from './agentKernelTypes';

export type RunAgentTurnInput = AgentContextBuildInput & {
  executeModel: (prompt: string, systemPrompt: string) => Promise<string>;
  executeTool: (call: ToolCall) => Promise<ToolResult>;
};

export type RunAgentTurnResult = {
  finalContent: string;
  context: ReturnType<typeof buildAgentContext>;
  toolCalls: RuntimeToolStep[];
  transcript: string;
};

export const runAgentTurn = async (input: RunAgentTurnInput): Promise<RunAgentTurnResult> => {
  const context = buildAgentContext(input);
  const systemPrompt = [
    '你是 GoodNight 的本地项目 Agent。',
    '优先依据上下文回答；需要读取或修改项目时使用工具；不能声称已经执行未经工具确认的操作。',
  ].join('\n');

  const loopResult = await runRuntimeToolLoop({
    maxRounds: 4,
    initialPrompt: context.prompt,
    systemPrompt,
    allowedTools: ['glob', 'grep', 'ls', 'view', 'write', 'edit', 'bash', 'fetch'],
    callModel: async (messages, activeSystemPrompt) => {
      const latestPrompt = messages.map((message) => `${message.role}: ${message.content}`).join('\n\n');
      return input.executeModel(latestPrompt, activeSystemPrompt);
    },
    executeTool: input.executeTool,
  });

  return {
    finalContent: loopResult.finalContent,
    context,
    toolCalls: loopResult.toolCalls,
    transcript: loopResult.transcript,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/ai/agent-kernel-turn.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Replace direct built-in chat path in `AIChat.tsx`**

```ts
// src/components/workspace/AIChat.tsx
const agentTurn = await runAgentTurn({
  projectId: currentProject.id,
  projectName: currentProject.name,
  threadId: targetSessionId,
  userInput: cleanedContent,
  contextWindowTokens: selectedRuntimeConfig?.contextWindowTokens || 200000,
  conversationHistory,
  instructions: [
    contextSnapshot.primaryLabel,
    contextSnapshot.secondaryLabel,
    contextSnapshot.currentFileLabel,
    contextSnapshot.vaultLabel,
    ...explicitReferenceLabels,
  ].filter((item): item is string => Boolean(item)),
  referenceFiles: resolvedReferenceContextFiles,
  memoryEntries: projectMemoryEntries,
  activeSkills: activeSkillsForTurn,
  executeModel: async (prompt, systemPrompt) =>
    executeRuntimePrompt({
      providerId: runtimeProviderId,
      sessionId: targetSessionId,
      config: selectedRuntimeConfig,
      systemPrompt,
      prompt,
      onEvent: handleEvent,
    }),
  executeTool: async (call) => runtimeToolExecutor.execute(call),
});

setThreadContext(targetSessionId, agentTurn.context);
setThreadToolCalls(targetSessionId, agentTurn.toolCalls);
```

- [ ] **Step 6: Run focused tests and build**

Run:

```bash
node --test tests/ai/agent-kernel-turn.test.mjs tests/ai/runtime-tool-loop.test.mjs tests/ai/agent-context-manager.test.mjs
npm run build
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/ai/runtime/agent-kernel/runAgentTurn.ts src/components/workspace/AIChat.tsx src/modules/ai/runtime/agentRuntimeStore.ts tests/ai/agent-kernel-turn.test.mjs
git commit -m "feat: route chat through agent kernel"
```

---

### Task 5: Add Tool Call UI

**Files:**
- Create: `src/components/ai/gn-agent-shell/GNAgentToolCallPanel.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Test: `tests/ai/agent-context-ui.test.mjs`

- [ ] **Step 1: Extend UI test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('agent tool call panel renders tool names and statuses', async () => {
  const source = await readFile('src/components/ai/gn-agent-shell/GNAgentToolCallPanel.tsx', 'utf8');

  assert.match(source, /toolCalls/);
  assert.match(source, /completed/);
  assert.match(source, /failed/);
  assert.match(source, /blocked/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ai/agent-context-ui.test.mjs
```

Expected: FAIL because the tool-call panel is missing.

- [ ] **Step 3: Extend runtime store**

```ts
// src/modules/ai/runtime/agentRuntimeStore.ts
import type { RuntimeToolStep } from './agent-kernel/agentKernelTypes';

type AgentRuntimeState = {
  toolCallsByThread: Record<string, RuntimeToolStep[]>;
  setThreadToolCalls: (threadId: string, toolCalls: RuntimeToolStep[]) => void;
};

toolCallsByThread: {},
setThreadToolCalls: (threadId, toolCalls) =>
  set((state) => ({
    toolCallsByThread: {
      ...state.toolCallsByThread,
      [threadId]: [...toolCalls],
    },
  })),
```

- [ ] **Step 4: Add tool call panel**

```tsx
// src/components/ai/gn-agent-shell/GNAgentToolCallPanel.tsx
import React from 'react';
import type { RuntimeToolStep } from '../../../modules/ai/runtime/agent-kernel/agentKernelTypes';

export const GNAgentToolCallPanel: React.FC<{
  toolCalls: RuntimeToolStep[];
}> = ({ toolCalls }) => (
  <section className="gn-agent-runtime-panel">
    <div className="gn-agent-runtime-panel-head">
      <strong>Tools</strong>
      <span>{toolCalls.length} calls</span>
    </div>
    {toolCalls.length === 0 ? (
      <p className="gn-agent-runtime-panel-empty">当前线程还没有工具调用。</p>
    ) : (
      <div className="gn-agent-runtime-panel-list">
        {toolCalls.map((call) => (
          <article key={call.id} className="gn-agent-runtime-card">
            <strong>{call.name}</strong>
            <span>{call.resultPreview || '等待结果'}</span>
            <code>{call.status}</code>
          </article>
        ))}
      </div>
    )}
  </section>
);
```

- [ ] **Step 5: Wire into chat page inspector rail**

```tsx
// src/components/ai/gn-agent-shell/GNAgentChatPage.tsx
import { GNAgentToolCallPanel } from './GNAgentToolCallPanel';

const toolCalls = useAgentRuntimeStore((state) =>
  activeSessionId ? state.toolCallsByThread[activeSessionId] || [] : []
);

<GNAgentToolCallPanel toolCalls={toolCalls} />
```

- [ ] **Step 6: Run tests and build**

Run:

```bash
node --test tests/ai/agent-context-ui.test.mjs
npm run build
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ai/gn-agent-shell/GNAgentToolCallPanel.tsx src/components/ai/gn-agent-shell/GNAgentChatPage.tsx src/modules/ai/runtime/agentRuntimeStore.ts tests/ai/agent-context-ui.test.mjs
git commit -m "feat: show runtime tool calls in agent UI"
```

---

### Task 6: Add Memory Write-Back And Memory Inbox UI

**Files:**
- Create: `src/modules/ai/runtime/memory/extractMemoryCandidates.ts`
- Create: `src/components/ai/gn-agent-shell/GNAgentMemoryInbox.tsx`
- Modify: `src/modules/ai/runtime/agentRuntimeStore.ts`
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Test: `tests/ai/agent-memory-writeback.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadMemory = async () =>
  import(`../../src/modules/ai/runtime/memory/extractMemoryCandidates.ts?test=${Date.now()}`);

test('extractMemoryCandidates detects explicit user preferences and project facts', async () => {
  const { extractMemoryCandidates } = await loadMemory();
  const candidates = extractMemoryCandidates({
    userInput: '以后回答短一点。项目事实：Agent 要优先使用本地 Tauri 持久化。',
    assistantOutput: '收到。',
    threadId: 'thread-1',
    createdAt: 10,
  });

  assert.ok(candidates.some((item) => item.kind === 'userPreference'));
  assert.ok(candidates.some((item) => item.kind === 'projectFact'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/ai/agent-memory-writeback.test.mjs
```

Expected: FAIL because memory extraction is missing.

- [ ] **Step 3: Add memory candidate extraction**

```ts
// src/modules/ai/runtime/memory/extractMemoryCandidates.ts
export type AgentMemoryCandidate = {
  id: string;
  threadId: string;
  title: string;
  summary: string;
  content: string;
  kind: 'projectFact' | 'userPreference';
  status: 'pending' | 'saved' | 'dismissed';
  createdAt: number;
};

const createCandidateId = (kind: string, createdAt: number) =>
  `memory-candidate_${kind}_${createdAt}`;

export const extractMemoryCandidates = (input: {
  userInput: string;
  assistantOutput: string;
  threadId: string;
  createdAt: number;
}): AgentMemoryCandidate[] => {
  const text = `${input.userInput}\n${input.assistantOutput}`;
  const candidates: AgentMemoryCandidate[] = [];

  if (/以后|偏好|我喜欢|回答短一点|回答简洁/.test(text)) {
    candidates.push({
      id: createCandidateId('preference', input.createdAt),
      threadId: input.threadId,
      title: 'User preference',
      summary: '用户表达了后续交互偏好',
      content: input.userInput,
      kind: 'userPreference',
      status: 'pending',
      createdAt: input.createdAt,
    });
  }

  const projectFactMatch = text.match(/项目事实[:：]\s*(.+)/);
  if (projectFactMatch?.[1]) {
    candidates.push({
      id: createCandidateId('projectFact', input.createdAt),
      threadId: input.threadId,
      title: 'Project fact',
      summary: '用户提供了项目事实',
      content: projectFactMatch[1].trim(),
      kind: 'projectFact',
      status: 'pending',
      createdAt: input.createdAt,
    });
  }

  return candidates;
};
```

- [ ] **Step 4: Add memory candidate state**

```ts
// src/modules/ai/runtime/agentRuntimeStore.ts
import type { AgentMemoryCandidate } from './memory/extractMemoryCandidates';

type AgentRuntimeState = {
  memoryCandidatesByThread: Record<string, AgentMemoryCandidate[]>;
  setThreadMemoryCandidates: (threadId: string, candidates: AgentMemoryCandidate[]) => void;
  resolveMemoryCandidate: (threadId: string, candidateId: string, status: AgentMemoryCandidate['status']) => void;
};

memoryCandidatesByThread: {},
setThreadMemoryCandidates: (threadId, candidates) =>
  set((state) => ({
    memoryCandidatesByThread: {
      ...state.memoryCandidatesByThread,
      [threadId]: candidates,
    },
  })),
resolveMemoryCandidate: (threadId, candidateId, status) =>
  set((state) => ({
    memoryCandidatesByThread: {
      ...state.memoryCandidatesByThread,
      [threadId]: (state.memoryCandidatesByThread[threadId] || []).map((candidate) =>
        candidate.id === candidateId ? { ...candidate, status } : candidate
      ),
    },
  })),
```

- [ ] **Step 5: Add memory inbox UI**

```tsx
// src/components/ai/gn-agent-shell/GNAgentMemoryInbox.tsx
import React from 'react';
import type { AgentMemoryCandidate } from '../../../modules/ai/runtime/memory/extractMemoryCandidates';

export const GNAgentMemoryInbox: React.FC<{
  candidates: AgentMemoryCandidate[];
  onSave: (candidate: AgentMemoryCandidate) => void;
  onDismiss: (candidateId: string) => void;
}> = ({ candidates, onSave, onDismiss }) => {
  const pending = candidates.filter((candidate) => candidate.status === 'pending');

  return (
    <section className="gn-agent-runtime-panel">
      <div className="gn-agent-runtime-panel-head">
        <strong>Memory Inbox</strong>
        <span>{pending.length} pending</span>
      </div>
      {pending.length === 0 ? (
        <p className="gn-agent-runtime-panel-empty">没有待确认的新记忆。</p>
      ) : (
        <div className="gn-agent-runtime-panel-list">
          {pending.map((candidate) => (
            <article key={candidate.id} className="gn-agent-runtime-card">
              <strong>{candidate.title}</strong>
              <span>{candidate.summary}</span>
              <code>{candidate.kind}</code>
              <div className="gn-agent-runtime-card-actions">
                <button type="button" onClick={() => onSave(candidate)}>保存</button>
                <button type="button" onClick={() => onDismiss(candidate.id)}>忽略</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
```

- [ ] **Step 6: Run tests and build**

Run:

```bash
node --test tests/ai/agent-memory-writeback.test.mjs
npm run build
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/ai/runtime/memory/extractMemoryCandidates.ts src/components/ai/gn-agent-shell/GNAgentMemoryInbox.tsx src/modules/ai/runtime/agentRuntimeStore.ts src/components/ai/gn-agent-shell/GNAgentChatPage.tsx src/components/workspace/AIChat.tsx tests/ai/agent-memory-writeback.test.mjs
git commit -m "feat: add agent memory write-back inbox"
```

---

### Task 7: Final Integration And Regression Verification

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- Modify: `src/App.css`
- Test: all focused AI runtime tests

- [ ] **Step 1: Run focused AI tests**

Run:

```bash
node --test tests/ai/agent-context-manager.test.mjs tests/ai/agent-context-ui.test.mjs tests/ai/runtime-tool-loop.test.mjs tests/ai/agent-kernel-turn.test.mjs tests/ai/agent-memory-writeback.test.mjs tests/ai/agent-runtime-store.test.mjs tests/ai/runtime-mcp-flow.test.mjs tests/ai/runtime-replay-recovery.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm run build
```

Expected: PASS. Existing chunk-size warning may remain.

- [ ] **Step 3: Run backend runtime tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml agent_runtime
```

Expected: PASS.

- [ ] **Step 4: Manual UI dogfood checklist**

Open the Agent workspace and verify:

- Context panel shows recent conversation, memory, references, and included/excluded state.
- Tool panel shows read/search calls after asking the agent to inspect a file.
- Approval panel still appears for local-agent or file-write actions.
- Memory inbox proposes a preference after typing `以后回答短一点`.
- Existing legacy AI pane still opens and sends a normal message.

- [ ] **Step 5: Commit final integration**

```bash
git add src/modules/ai/runtime src/components/ai/gn-agent-shell src/components/workspace/AIChat.tsx src/App.css tests/ai
git commit -m "feat: complete agent kernel context and ui update"
```

---

## Self-Review

### Spec Coverage

- Agent context manager: Task 1.
- Context UI: Task 2.
- Tool loop: Task 3.
- Kernel extraction: Task 4.
- Tool-call UI: Task 5.
- Memory write-back and UI: Task 6.
- End-to-end verification: Task 7.

### Placeholder Scan

No placeholder markers are present. Each task names exact files, commands, and expected results.

### Type Consistency

- Context types use `AgentContextSnapshot`, `AgentContextSection`, and `AgentContextBudget`.
- Tool loop types use `RuntimeToolStep` and `RuntimeToolLoopResult`.
- Memory write-back uses `AgentMemoryCandidate`.
- UI panels consume runtime store snapshots keyed by `threadId`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-02-goodnight-agent-kernel-context-ui-update-plan.md`. Two execution options:

1. Subagent-Driven (recommended) - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
