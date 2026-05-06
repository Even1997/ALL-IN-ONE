# Tool-First Agent Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace natural-language regex routing for project file actions with a cc-haha-style tool-first agent architecture.

**Architecture:** User free text should enter the model/session first. The model decides whether to call a structured tool; the runtime validates, authorizes, executes, records, and feeds tool results back into the loop. UI commands and buttons may create explicit structured actions, but ordinary chat text must not directly trigger save/read/write flows through regex.

**Tech Stack:** React, TypeScript, Tauri tool commands, existing runtime agent kernel, existing approval/risk policy, existing AIService `chatWithTools`.

---

## cc-haha Core Architecture Summary

cc-haha's important pattern is not a specific file operation implementation. The key is the direction of control:

1. Entrypoints/adapters forward user messages into a session. They do not infer save/read/write intent from arbitrary text.
2. `src/query.ts` owns the agent loop: prepare context, call the model with tools, collect assistant content and `tool_use`, execute tools, append `tool_result`, repeat until final text.
3. `src/Tool.ts` defines tools as first-class capabilities: name, schema, prompt, validation, permission check, concurrency/read-only metadata, execution, and render helpers.
4. `src/tools.ts` is the tool registry. Tools are discovered from this central source, not scattered UI branches.
5. `src/services/tools/toolOrchestration.ts` partitions tool calls: concurrency-safe read tools may run in batches; write/destructive tools run serially.
6. `src/services/tools/toolExecution.ts` is the execution gate: find tool, schema-parse input, validate input, check permissions/hooks, call tool, return structured result.
7. `src/tools/FileWriteTool/FileWriteTool.ts` teaches the most important file safety rule: existing files must be read before write, denied paths are blocked, permissions are checked per tool call, and the result carries structured output/diff.
8. `src/bridge/sessionRunner.ts` and `src/bridge/bridgePermissionCallbacks.ts` treat permission as `toolName + input + toolUseId`, not "the user said a save-like word".

The main lesson for ALL-IN-ONE: intent belongs to the model plus explicit tool protocol; safety belongs to runtime validation and permissions. Regex can parse protocols/paths, but it should not decide semantic user intent.

## Current ALL-IN-ONE Problem

Current high-risk flow:

1. `src/components/workspace/AIChat.tsx` calls `resolveProjectFileRequestKind(...)` before the normal agent tool loop.
2. `src/modules/ai/chat/projectFileOperations.ts` uses language regexes like write/read/task intent patterns to return `read`, `write`, or `none`.
3. A user question such as "为什么保存不了" can be incorrectly interpreted as save/write intent because the router is looking for words, not meaning.
4. `src/modules/ai/chat/directChatPrompt.ts` has another semantic regex bridge for short confirmations after save-like assistant questions.

Existing good pieces we should keep and strengthen:

1. `src/modules/ai/runtime/tools/runtimeToolLoop.ts` already performs a model-tool-result loop.
2. `src/components/workspace/tools.ts` already contains built-in tools and a `ToolExecutor`.
3. `src/modules/ai/runtime/approval/riskPolicy.ts` already classifies risky actions.
4. `src/components/workspace/tools.ts` already verifies write/edit mutations before marking tool calls successful.
5. `src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts` already guards unverified mutation claims.

## Target Architecture

All normal chat should go through this path:

```text
User text
  -> AIChat submit
  -> executeRuntimeBuiltInAgentTurn / runAgentTurn
  -> runRuntimeToolLoop
  -> model receives tool instructions
  -> model may emit structured tool_use
  -> runtime checks allowed tools, schema, permissions, approval
  -> ToolExecutor executes
  -> verified tool_result is appended
  -> model returns final user-facing answer
```

Disallowed target behavior:

```text
User text
  -> regex says "write"
  -> project_file_plan/project_file_flow executes before model chooses a tool
```

Allowed direct execution exceptions:

1. Slash commands with explicit structured semantics.
2. UI buttons such as "Apply", "Approve", "Save this proposal".
3. A pending approval/proposal action selected by ID.

Short affirmative replies should only operate on an explicit pending action:

```text
Assistant creates pendingActionId=abc for a concrete proposal
User clicks approve or says a response that is attached to pendingActionId=abc
Runtime executes proposal abc
```

They should not be inferred from "previous assistant text looked like a save question".

---

### Task 1: Add Regression Tests For Free Text Not Routing To Project File Flow

**Files:**
- Modify: `tests/ai/ai-chat-file-ops-ui.test.mjs`
- Modify: `tests/ai/project-file-operations.test.mjs`

- [ ] **Step 1: Add a source-level guard test for AIChat**

Add a test that fails while `AIChat.tsx` still calls `resolveProjectFileRequestKind` in the main submit path.

```js
test('AIChat does not pre-route free text through project file intent regex', async () => {
  const source = await readFile(
    path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx'),
    'utf8'
  );

  assert.doesNotMatch(
    source,
    /const\s+projectFileRequestKind\s*=\s*resolveProjectFileRequestKind\(/,
    'free text should enter the runtime tool loop; project file intent must be model/tool driven'
  );
});
```

- [ ] **Step 2: Keep the current bug regression until the old router is deleted**

Ensure `tests/ai/project-file-operations.test.mjs` has this case:

```js
assert.equal(
  resolveProjectFileRequestKind({
    rawInput: '为什么保存不了',
    cleanedInput: '为什么保存不了',
    conversationHistory: [],
  }),
  'none'
);
```

- [ ] **Step 3: Run tests and verify failure shape**

Run:

```powershell
npm test -- tests/ai/ai-chat-file-ops-ui.test.mjs tests/ai/project-file-operations.test.mjs
```

Expected before implementation: the new `AIChat` source-level guard fails because the old pre-router still exists.

### Task 2: Remove Free-Text Project File Routing From AIChat

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`

- [ ] **Step 1: Delete the pre-routing branch**

Remove the block that:

```ts
const projectFileRequestKind = resolveProjectFileRequestKind({
  rawInput: rawContent,
  cleanedInput: cleanedContent,
  conversationHistory,
});
```

and the following `if (projectFileRequestKind === 'read')` and `if (projectFileRequestKind === 'write')` branches.

- [ ] **Step 2: Preserve explicit proposal execution**

Keep `handleExecuteProjectFileProposal(...)`, approval handling, and UI-driven apply/deny flows. Those are structured actions and should remain.

- [ ] **Step 3: Ensure the normal path reaches runtime agent turn**

The fallthrough path should call the existing runtime/built-in agent turn path that uses:

```ts
executeRuntimeBuiltInAgentTurn(...)
```

The user text should arrive as `userInput/rawUserInput`, not as a synthetic project file flow.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm test -- tests/ai/ai-chat-file-ops-ui.test.mjs tests/ai/runtime-tool-loop.test.mjs tests/ai/execute-runtime-built-in-agent-turn.test.mjs
```

Expected: no direct project-file-flow source route remains; runtime tool loop tests still pass.

### Task 3: Promote Project File Operations To Real Runtime Tools Only

**Files:**
- Modify: `src/components/workspace/tools.ts`
- Modify: `src/modules/ai/runtime/agent-kernel/runAgentTurn.ts`
- Modify: `tests/ai/runtime-tool-loop.test.mjs`
- Modify: `tests/ai/tool-result-text.test.mjs`

- [ ] **Step 1: Teach write/edit tools the cc-haha safety contract**

Strengthen tool descriptions in `TOOLS`:

```ts
{
  name: 'write',
  description: `File writing tool that creates or overwrites files.

WHEN TO USE THIS TOOL:
- Use only when the user asked to create, save, or fully rewrite a concrete file.
- For existing files, read the file first with view before writing.
- Prefer edit for targeted changes.
- Never create documentation files (*.md) or README files unless explicitly requested by the user.
- Do not use this tool to answer questions about saving problems; answer those normally unless a concrete file write is needed.
`,
  ...
}
```

For `edit`, add:

```ts
- Use only after you have enough exact context to provide old_string.
- Prefer view first when editing an existing file.
- Do not use this tool merely because the user mentioned "save" or "保存" in a question.
```

- [ ] **Step 2: Update the agent kernel prompt**

In `GOODNIGHT_AGENT_SYSTEM_PROMPT`, keep tool-use instructions but add a tool-choice rule:

```ts
'Free text is not authorization by keyword. Decide whether a tool is needed from the user meaning and current state.',
'If the user asks why something cannot be saved, explain or inspect as needed; do not call write/edit unless the user asks to create or change a concrete file.',
'A file mutation is successful only after a write/edit tool result reports success and verification.',
```

- [ ] **Step 3: Add model-loop regression tests**

In `tests/ai/runtime-tool-loop.test.mjs`, add a fake model case:

```js
test('save problem question can complete without write tool', async () => {
  const result = await runRuntimeToolLoop({
    maxRounds: 4,
    initialPrompt: '为什么保存不了',
    systemPrompt: 'Use tools only when needed.',
    allowedTools: ['view', 'write', 'edit'],
    callModel: async () => '这听起来像保存失败问题，我需要先了解具体报错或路径。',
    executeTool: async () => {
      throw new Error('executeTool should not run');
    },
  });

  assert.equal(result.toolCalls.length, 0);
  assert.match(result.finalContent, /保存失败|保存/);
});
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm test -- tests/ai/runtime-tool-loop.test.mjs tests/ai/tool-result-text.test.mjs
```

Expected: model-loop behavior allows natural answers without mutation tools.

### Task 4: Replace Pending Save Confirmation Regex With Structured Pending Actions

**Files:**
- Modify: `src/modules/ai/chat/directChatPrompt.ts`
- Modify: `src/modules/ai/chat/projectFileOperations.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `tests/ai/project-file-operations.test.mjs`
- Add or modify: `tests/ai/runtime-pending-actions.test.mjs`

- [ ] **Step 1: Define a structured pending action shape**

Use the existing proposal/action data where possible:

```ts
type RuntimePendingAction = {
  id: string;
  kind: 'project_file_proposal' | 'approval';
  messageId: string;
  toolCallId?: string | null;
  summary: string;
  status: 'pending' | 'approved' | 'denied' | 'executed' | 'expired';
};
```

- [ ] **Step 2: Stop adding pending confirmation text to prompts**

Remove or bypass `buildPendingConfirmationSection(...)` in `directChatPrompt.ts` for save/write/create/update confirmations.

Delete these semantic regex constants after no callers remain:

```ts
SAVE_LIKE_ACTION_PATTERN
CONFIRMATION_QUESTION_PATTERN
SHORT_AFFIRMATIVE_PATTERN
SHORT_NEGATIVE_PATTERN
```

- [ ] **Step 3: Keep only explicit pending proposal resolution**

In `projectFileOperations.ts`, keep `findLatestPendingProjectFileProposalAction(...)` and short yes/no helpers only if they are called with an already-known pending proposal. Do not use prior assistant prose as the pending action source.

- [ ] **Step 4: Add tests**

Add cases:

```js
test('short affirmative without pending action does not authorize save', () => {
  assert.equal(resolvePendingActionReply({
    userInput: '好的',
    pendingActions: [],
  }), null);
});

test('short affirmative can approve explicit pending action', () => {
  assert.equal(resolvePendingActionReply({
    userInput: '好的',
    pendingActions: [{ id: 'proposal-1', kind: 'project_file_proposal', status: 'pending' }],
  })?.id, 'proposal-1');
});
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm test -- tests/ai/runtime-pending-actions.test.mjs tests/ai/project-file-operations.test.mjs
```

Expected: short replies are safe unless bound to structured pending state.

### Task 5: Add A cc-haha-Style Runtime Tool Gate

**Files:**
- Add: `src/modules/ai/runtime/tools/runtimeToolRegistry.ts`
- Add: `src/modules/ai/runtime/tools/runtimeToolPermissions.ts`
- Modify: `src/modules/ai/runtime/tools/runtimeToolLoop.ts`
- Modify: `src/components/workspace/tools.ts`
- Modify: `src/modules/ai/runtime/approval/riskPolicy.ts`
- Add: `tests/ai/runtime-tool-permissions.test.mjs`

- [ ] **Step 1: Create tool metadata near runtime**

Add `runtimeToolRegistry.ts`:

```ts
export type RuntimeToolKind = 'read' | 'write' | 'shell' | 'network' | 'question';

export type RuntimeToolMetadata = {
  name: string;
  kind: RuntimeToolKind;
  readOnly: boolean;
  concurrencySafe: boolean;
  riskyActionType: string;
  required: string[];
};

export const RUNTIME_TOOL_METADATA: Record<string, RuntimeToolMetadata> = {
  glob: { name: 'glob', kind: 'read', readOnly: true, concurrencySafe: true, riskyActionType: 'tool_glob', required: ['pattern'] },
  grep: { name: 'grep', kind: 'read', readOnly: true, concurrencySafe: true, riskyActionType: 'tool_grep', required: ['pattern'] },
  ls: { name: 'ls', kind: 'read', readOnly: true, concurrencySafe: true, riskyActionType: 'tool_ls', required: ['path'] },
  view: { name: 'view', kind: 'read', readOnly: true, concurrencySafe: true, riskyActionType: 'tool_view', required: ['file_path'] },
  write: { name: 'write', kind: 'write', readOnly: false, concurrencySafe: false, riskyActionType: 'tool_write', required: ['file_path', 'content'] },
  edit: { name: 'edit', kind: 'write', readOnly: false, concurrencySafe: false, riskyActionType: 'tool_edit', required: ['file_path', 'old_string', 'new_string'] },
  bash: { name: 'bash', kind: 'shell', readOnly: false, concurrencySafe: false, riskyActionType: 'tool_bash', required: ['command'] },
  powershell: { name: 'powershell', kind: 'shell', readOnly: false, concurrencySafe: false, riskyActionType: 'tool_powershell', required: ['command'] },
  fetch: { name: 'fetch', kind: 'network', readOnly: false, concurrencySafe: false, riskyActionType: 'tool_fetch', required: ['url'] },
  AskUserQuestion: { name: 'AskUserQuestion', kind: 'question', readOnly: true, concurrencySafe: false, riskyActionType: 'ask_user_question', required: [] },
};
```

- [ ] **Step 2: Validate required inputs before approval hooks**

Add `runtimeToolPermissions.ts`:

```ts
export const validateRuntimeToolInput = (
  toolName: string,
  input: Record<string, unknown>,
) => {
  const metadata = RUNTIME_TOOL_METADATA[toolName];
  if (!metadata) return `Unknown tool: ${toolName}`;

  const missing = metadata.required.filter((key) => {
    const value = input[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  return missing.length > 0 ? `Tool "${toolName}" missing required input: ${missing.join(', ')}` : null;
};
```

- [ ] **Step 3: Use metadata in `runtimeToolLoop.ts`**

Replace hard-coded read-only set:

```ts
const READ_ONLY_TOOLS = new Set(['glob', 'grep', 'ls', 'view']);
```

with metadata checks:

```ts
const isRuntimeToolConcurrencySafe = (name: string) =>
  RUNTIME_TOOL_METADATA[name]?.concurrencySafe === true;
```

Before `beforeToolCall`, call `validateRuntimeToolInput`. If invalid, mark the step `blocked` and do not execute the tool.

- [ ] **Step 4: Add tests**

Add tests that prove:

```js
assert.equal(writeWithoutContent.status, 'blocked');
assert.equal(executeToolCallCount, 0);
assert.equal(beforeToolCallCount, 0);
```

And:

```js
assert.deepEqual(readOnlyBatchStatuses, ['completed', 'completed']);
assert.equal(writeRunsAfterReadOnlyBatch, true);
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm test -- tests/ai/runtime-tool-loop.test.mjs tests/ai/runtime-tool-permissions.test.mjs
```

Expected: blocked invalid tools never reach executor or approval hooks.

### Task 6: Delete Or Downgrade Semantic Regex Utilities

**Files:**
- Modify: `src/modules/ai/chat/projectFileOperations.ts`
- Modify: `src/modules/ai/chat/directChatPrompt.ts`
- Modify: `src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts`
- Modify: `src/components/workspace/aiChatMessageParts.ts`

- [ ] **Step 1: Delete project file intent regexes**

After `AIChat.tsx` no longer imports `resolveProjectFileRequestKind`, remove:

```ts
WRITE_INTENT_PATTERN
READ_INTENT_PATTERN
TASK_WRITE_VERB_PATTERN
TASK_WRITE_TARGET_PATTERN
QUESTION_ONLY_PATTERN
ANALYSIS_ONLY_PATTERN
FILE_MANAGEMENT_WRITE_PATTERN
FILE_SAVE_TARGET_PATTERN
EXPLICIT_FILE_READ_PATTERN
resolveProjectFileRequestKind
detectTaskAuthorizedProjectWriteIntent
```

Keep path normalization, proposal parsing, operation construction, and explicit proposal action helpers.

- [ ] **Step 2: Remove pending save semantic regexes**

Delete direct-chat prompt save-confirmation inference described in Task 4.

- [ ] **Step 3: Reclassify remaining regexes**

Keep regexes that parse syntax or transport:

1. Tool XML protocol parsing.
2. JSON/fenced JSON extraction.
3. File paths and extensions.
4. Glob/grep/search syntax.
5. Markdown/wiki link parsing.
6. Display-only cleanup if it cannot trigger actions.

Convert regexes that make semantic decisions into either:

1. Model instruction.
2. Runtime tool validation.
3. Explicit UI state.
4. Post-result guard.

- [ ] **Step 4: Treat existing retry heuristics as temporary**

`executeRuntimeBuiltInAgentTurn.ts` currently has artifact/project-fact retry regexes. These are less dangerous because they do not mutate files, but they still encode semantic routing. Keep them temporarily, then replace with model/tool policy tests after file mutation routing is fixed.

- [ ] **Step 5: Run broad AI tests**

Run:

```powershell
npm test -- tests/ai
```

Expected: file mutation behavior is tool-driven; display and parsing regexes still work.

### Task 7: End-To-End Safety Tests

**Files:**
- Add or modify: `tests/ai/built-in-ai-file-ops-safety.test.mjs`
- Modify: `scripts/test-builtin-ai-file-ops.cjs` if a smoke script already exists

- [ ] **Step 1: Add scenario matrix**

Cover:

```js
[
  { input: '为什么保存不了', expectWrite: false },
  { input: '保存到 PRD.md', expectWrite: true, requiresConcreteContent: true },
  { input: '把上面的内容保存到 docs/plan.md', expectWrite: true },
  { input: 'PRD.md', expectWrite: false, unlessPendingAction: true },
  { input: '好的', expectWrite: false, unlessPendingAction: true },
  { input: '修改 package.json 里的 scripts', expectApproval: true },
]
```

- [ ] **Step 2: Assert no success claim without verified mutation**

For failed write/edit tool results, assert final text does not contain "已保存", "已写入", or "已修改" unless `fileChanges[].verified === true`.

- [ ] **Step 3: Run smoke tests**

Run:

```powershell
npm test -- tests/ai/built-in-ai-file-ops-safety.test.mjs
```

Expected: accidental save/write flows are impossible from free-text keyword matches.

---

## Migration Order

1. First remove the `AIChat.tsx` pre-router. This fixes the dangerous architecture edge.
2. Then strengthen tool prompts and runtime validation. This teaches the model and protects execution.
3. Then replace pending confirmation regex with pending action IDs.
4. Then delete old semantic regex code.
5. Finally reduce lower-risk retry/display regexes once the mutation path is stable.

## Non-Goals

1. Do not rewrite the whole UI into cc-haha's desktop shell.
2. Do not copy cc-haha's entire permission subsystem before using the existing approval/risk policy.
3. Do not remove protocol/path regexes. Regex is fine for syntax, not for intent.
4. Do not make file writes automatic just because the model emits a tool call; schema, path boundary, permission, and verification still gate execution.

## Success Criteria

1. `"为什么保存不了"` never creates a project file proposal and never calls `write` or `edit`.
2. Free chat always reaches the runtime/model loop unless it is an explicit UI/slash action.
3. File mutation happens only through structured `tool_use` plus runtime approval/verification.
4. Short confirmations only act on explicit pending action state.
5. The assistant cannot claim a file was saved unless a verified write/edit result exists.
