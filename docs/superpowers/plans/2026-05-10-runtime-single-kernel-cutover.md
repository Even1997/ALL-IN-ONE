# Runtime Single Kernel Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a single runtime kernel as the only source of truth for provider events, tool policy, and tool-loop behavior, while reducing the Node sidecar to transport, persistence, approval UI, and host execution responsibilities.

**Architecture:** Keep `runAgentTurn` and `runRuntimeToolLoop` as the only orchestration kernel. Extract shared runtime policy and shared provider event types into `src/modules/ai/runtime`, then make `apps/runtime` consume those shared contracts instead of maintaining its own allowlist and event semantics. Fix Windows command execution during the cutover and remove duplicate sidecar-only runtime policy once parity tests pass.

**Tech Stack:** TypeScript, Node.js sidecar, Tauri desktop runtime, shared runtime kernel, Node test runner with `--experimental-strip-types`

---

## Scope Guard

This plan intentionally does **not** rewrite the whole runtime from scratch. It keeps the existing kernel (`runAgentTurn` + `runRuntimeToolLoop`) and removes duplication around it. That is the smallest change that still reaches the user goal of “彻底回到单内核”.

## File Map

**Shared runtime policy and event contracts**
- Create: `src/modules/ai/runtime/provider/runtimeProviderEvents.ts`
- Create: `src/modules/ai/runtime/tools/runtimeToolPolicy.ts`
- Modify: `src/modules/ai/runtime/orchestration/runtimeChatTurnTools.ts`
- Modify: `src/utils/hostPlatform.ts`
- Modify: `src/modules/ai/runtime/agent-kernel/runAgentTurn.ts`
- Modify: `src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts`

**Node sidecar runtime**
- Modify: `apps/runtime/src/index.ts`
- Modify: `apps/runtime/src/nodeRuntimeProviderClient.ts`
- Modify: `apps/runtime/src/nodeRuntimeToolExecutor.ts`

**Shared tool execution surfaces**
- Modify: `src/modules/ai/runtime/tools/toolExecutor.ts`
- Reuse: `src/modules/ai/runtime/approval/riskPolicy.ts`

**Tests**
- Create: `tests/ai/runtime-single-kernel-policy.test.mjs`
- Create: `tests/ai/runtime-provider-events.test.mjs`
- Modify: `tests/ai/runtime-shell-routing.test.mjs`
- Modify: `tests/ai/runtime-sidecar-turn-submit.test.mjs`
- Modify: `tests/ai/runtime-tool-loop.test.mjs`

**Verification commands**
- `node --test --experimental-strip-types tests/ai/runtime-single-kernel-policy.test.mjs tests/ai/runtime-provider-events.test.mjs`
- `node --test --experimental-strip-types tests/ai/runtime-shell-routing.test.mjs tests/ai/runtime-tool-loop.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs`
- `npm run build --workspace @goodnight/runtime-sidecar`

## Target End State

- `runAgentTurn` and `runRuntimeToolLoop` remain the only agent loop.
- `apps/runtime/src/index.ts` no longer declares its own side-effect tool list.
- Provider adapters emit one shared event shape.
- Windows `bash` / `powershell` behavior is consistent across prompt, policy, and sidecar execution.
- XML tool markup remains only as a compatibility adapter, not the primary internal contract.

### Task 1: Lock Single-Kernel Invariants With Regression Tests

**Files:**
- Create: `tests/ai/runtime-single-kernel-policy.test.mjs`
- Modify: `tests/ai/runtime-shell-routing.test.mjs`
- Modify: `tests/ai/runtime-sidecar-turn-submit.test.mjs`

- [ ] **Step 1: Write a failing source-boundary test for shared tool policy ownership**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const sidecarIndexPath = path.join(repoRoot, 'apps/runtime/src/index.ts');
const runtimePolicyPath = path.join(repoRoot, 'src/modules/ai/runtime/tools/runtimeToolPolicy.ts');

test('runtime sidecar imports shared allowed-tool policy instead of declaring its own list', async () => {
  const sidecarSource = await readFile(sidecarIndexPath, 'utf8');
  assert.doesNotMatch(sidecarSource, /const SIDE_EFFECT_TOOLS\s*=/);
  assert.match(sidecarSource, /getTurnAllowedRuntimeTools/);
});

test('shared runtime tool policy file exists and exports powershell-aware command policy', async () => {
  const policySource = await readFile(runtimePolicyPath, 'utf8');
  assert.match(policySource, /powershell/);
  assert.match(policySource, /READ_ONLY_RUNTIME_TOOLS/);
  assert.match(policySource, /getTurnAllowedRuntimeTools/);
});
```

- [ ] **Step 2: Run the new policy test and verify it fails**

Run: `node --test --experimental-strip-types tests/ai/runtime-single-kernel-policy.test.mjs`

Expected: FAIL because `runtimeToolPolicy.ts` does not exist yet and `apps/runtime/src/index.ts` still contains `const SIDE_EFFECT_TOOLS = ...`.

- [ ] **Step 3: Extend the existing shell-routing test to lock Windows parity**

```js
test('node runtime sidecar treats powershell as a first-class command tool', async () => {
  const sidecarSource = await readFile(sidecarIndexPath, 'utf8');
  const executorSource = await readFile(nodeExecutorPath, 'utf8');

  assert.match(sidecarSource, /buildApprovalSummary/);
  assert.match(sidecarSource, /getTurnAllowedRuntimeTools/);
  assert.match(executorSource, /case 'powershell'/);
  assert.doesNotMatch(executorSource, /execFile\('\/bin\/zsh'/);
});
```

- [ ] **Step 4: Add a turn-submit integration assertion that the sidecar uses shared allowed tools**

```js
assert.match(sidecarSource, /allowedTools:\s*getTurnAllowedRuntimeTools/);
assert.doesNotMatch(sidecarSource, /allowedTools:\s*sandboxPolicy === 'deny' \? READ_ONLY_CHAT_TOOLS : SIDE_EFFECT_TOOLS/);
```

- [ ] **Step 5: Run the focused regression suite**

Run: `node --test --experimental-strip-types tests/ai/runtime-single-kernel-policy.test.mjs tests/ai/runtime-shell-routing.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs`

Expected: FAIL with missing shared policy file and sidecar source assertions.

- [ ] **Step 6: Commit the failing tests**

```bash
git add tests/ai/runtime-single-kernel-policy.test.mjs tests/ai/runtime-shell-routing.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs
git commit -m "test: lock runtime single-kernel invariants"
```

### Task 2: Extract Shared Runtime Tool Policy And Remove Sidecar Allowlist Drift

**Files:**
- Create: `src/modules/ai/runtime/tools/runtimeToolPolicy.ts`
- Modify: `src/modules/ai/runtime/orchestration/runtimeChatTurnTools.ts`
- Modify: `src/utils/hostPlatform.ts`
- Modify: `apps/runtime/src/index.ts`
- Modify: `src/modules/ai/runtime/agent-kernel/runAgentTurn.ts`
- Test: `tests/ai/runtime-single-kernel-policy.test.mjs`

- [ ] **Step 1: Create the shared runtime tool policy module**

```ts
export const ASK_USER_TOOL_NAME = 'AskUserQuestion';

export const READ_ONLY_RUNTIME_TOOLS = ['glob', 'grep', 'ls', 'view', ASK_USER_TOOL_NAME] as const;
export const MUTATING_RUNTIME_TOOLS = ['write', 'edit', 'bash', 'powershell', 'fetch', 'agent'] as const;
export const STREAM_SAFE_RUNTIME_TOOLS = new Set(['glob', 'grep', 'ls', 'view']);
export const RISKY_RUNTIME_TOOLS = new Set(MUTATING_RUNTIME_TOOLS);

export const getBuiltInRuntimeToolNames = (isWindows: boolean) =>
  [
    'glob',
    'grep',
    'ls',
    'view',
    'write',
    'edit',
    ...(isWindows ? ['powershell', 'bash'] : ['bash']),
    'fetch',
    'agent',
    ASK_USER_TOOL_NAME,
  ] as const;

export const getTurnAllowedRuntimeTools = (input: {
  sandboxPolicy: 'deny' | 'ask' | 'allow';
  isWindows: boolean;
}) => (input.sandboxPolicy === 'deny'
  ? [...READ_ONLY_RUNTIME_TOOLS]
  : [...getBuiltInRuntimeToolNames(input.isWindows)]);
```

- [ ] **Step 2: Re-export the shared constants from `runtimeChatTurnTools.ts`**

```ts
export {
  ASK_USER_TOOL_NAME,
  READ_ONLY_RUNTIME_TOOLS as READ_ONLY_CHAT_TOOLS,
  RISKY_RUNTIME_TOOLS as RISKY_BUILT_IN_TOOLS,
  getBuiltInRuntimeToolNames as getRuntimeChatToolNames,
} from '../tools/runtimeToolPolicy.ts';
```

- [ ] **Step 3: Stop `hostPlatform.ts` from owning runtime policy**

```ts
export const isCommandToolName = (toolName: string) =>
  toolName === 'bash' || toolName === 'powershell';

// Delete the local getBuiltInRuntimeToolNames implementation from this file.
```

- [ ] **Step 4: Import shared policy into `runAgentTurn.ts` and `apps/runtime/src/index.ts`**

```ts
import { getBuiltInRuntimeToolNames, getTurnAllowedRuntimeTools } from '../tools/runtimeToolPolicy.ts';

const AVAILABLE_RUNTIME_TOOLS = getBuiltInRuntimeToolNames(isWindowsHost());

allowedTools: getTurnAllowedRuntimeTools({
  sandboxPolicy,
  isWindows: process.platform === 'win32',
}),
```

- [ ] **Step 5: Delete the sidecar-owned tool list**

```ts
// Remove this line completely from apps/runtime/src/index.ts
const SIDE_EFFECT_TOOLS = ['glob', 'grep', 'ls', 'view', 'write', 'edit', 'bash', 'fetch', ASK_USER_TOOL_NAME];
```

- [ ] **Step 6: Run the policy regression suite**

Run: `node --test --experimental-strip-types tests/ai/runtime-single-kernel-policy.test.mjs tests/ai/runtime-shell-routing.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/modules/ai/runtime/tools/runtimeToolPolicy.ts src/modules/ai/runtime/orchestration/runtimeChatTurnTools.ts src/utils/hostPlatform.ts src/modules/ai/runtime/agent-kernel/runAgentTurn.ts apps/runtime/src/index.ts tests/ai/runtime-single-kernel-policy.test.mjs tests/ai/runtime-shell-routing.test.mjs
git commit -m "refactor: centralize runtime tool policy"
```

### Task 3: Introduce Shared Provider Event Types And Make Them Canonical

**Files:**
- Create: `src/modules/ai/runtime/provider/runtimeProviderEvents.ts`
- Modify: `apps/runtime/src/nodeRuntimeProviderClient.ts`
- Modify: `apps/runtime/src/index.ts`
- Modify: `src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts`
- Create: `tests/ai/runtime-provider-events.test.mjs`

- [ ] **Step 1: Write a failing provider-event contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('node runtime provider client imports shared runtime provider event types', async () => {
  const source = await readFile('apps/runtime/src/nodeRuntimeProviderClient.ts', 'utf8');
  assert.match(source, /from '\.\.\/\.\.\/\.\.\/src\/modules\/ai\/runtime\/provider\/runtimeProviderEvents\.ts'/);
  assert.doesNotMatch(source, /type RuntimeProviderStreamEvent =/);
});

test('openai-compatible streaming path parses native tool call deltas before XML fallback', async () => {
  const source = await readFile('apps/runtime/src/nodeRuntimeProviderClient.ts', 'utf8');
  assert.match(source, /tool_calls/);
  assert.match(source, /parseOpenAICompatibleToolCall/);
});
```

- [ ] **Step 2: Run the provider-event test and verify it fails**

Run: `node --test --experimental-strip-types tests/ai/runtime-provider-events.test.mjs`

Expected: FAIL because the shared event contract file does not exist and the sidecar still defines its own event type locally.

- [ ] **Step 3: Create the shared canonical provider event module**

```ts
export type RuntimeProviderToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type RuntimeProviderEvent =
  | { kind: 'thinking'; delta: string }
  | { kind: 'text'; delta: string }
  | { kind: 'tool_call'; toolCall: RuntimeProviderToolCall }
  | { kind: 'usage'; inputTokens: number; outputTokens: number; totalTokens?: number }
  | { kind: 'done'; finalText: string };
```

- [ ] **Step 4: Move `nodeRuntimeProviderClient.ts` onto the shared contract and prefer native tool calls**

```ts
import type { RuntimeProviderEvent, RuntimeProviderToolCall } from '../../../src/modules/ai/runtime/provider/runtimeProviderEvents.ts';

const parseOpenAICompatibleToolCall = (delta: any): RuntimeProviderToolCall[] =>
  Array.isArray(delta?.tool_calls)
    ? delta.tool_calls.flatMap((entry: any) => {
        const name = entry?.function?.name;
        const args = entry?.function?.arguments;
        if (typeof name !== 'string' || typeof args !== 'string') return [];
        try {
          const parsed = JSON.parse(args);
          return [{ id: entry.id || `call_${Date.now()}`, name, input: parsed }];
        } catch {
          return [];
        }
      })
    : [];
```

- [ ] **Step 5: Keep XML text parsing as compatibility fallback only**

```ts
const toolCalls = parseOpenAICompatibleToolCall(delta);
if (toolCalls.length > 0) {
  return toolCalls.map((toolCall) => ({ kind: 'tool_call', toolCall }));
}

return [
  ...buildTextEvents('thinking', resolveReasoningDelta(delta)),
  ...buildTextEvents('text', resolveTextDelta(delta)),
];
```

- [ ] **Step 6: Update sidecar turn submission to consume the shared event type directly**

```ts
onEvent: async (event: RuntimeProviderEvent) => {
  if (event.kind === 'thinking' || event.kind === 'text') {
    await onEvent?.(event);
    return;
  }

  if (event.kind === 'tool_call') {
    await onEvent?.({ kind: 'tool_call', delta: '', toolCall: event.toolCall });
    return;
  }
}
```

- [ ] **Step 7: Run the provider-event tests**

Run: `node --test --experimental-strip-types tests/ai/runtime-provider-events.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs tests/ai/runtime-tool-loop.test.mjs`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/modules/ai/runtime/provider/runtimeProviderEvents.ts apps/runtime/src/nodeRuntimeProviderClient.ts apps/runtime/src/index.ts src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts tests/ai/runtime-provider-events.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs tests/ai/runtime-tool-loop.test.mjs
git commit -m "refactor: unify runtime provider events"
```

### Task 4: Fix Windows Shell Execution And Align Sidecar Command Semantics

**Files:**
- Modify: `apps/runtime/src/nodeRuntimeToolExecutor.ts`
- Modify: `src/modules/ai/runtime/tools/toolExecutor.ts`
- Modify: `tests/ai/runtime-shell-routing.test.mjs`
- Modify: `tests/ai/runtime-sidecar-turn-submit.test.mjs`

- [ ] **Step 1: Add a failing unit test for Windows-aware shell selection**

```js
test('node runtime tool executor does not hardcode /bin/zsh', async () => {
  const source = await readFile('apps/runtime/src/nodeRuntimeToolExecutor.ts', 'utf8');
  assert.doesNotMatch(source, /execFile\('\/bin\/zsh'/);
  assert.match(source, /process\.platform === 'win32'/);
});
```

- [ ] **Step 2: Run the shell-routing tests and verify they fail**

Run: `node --test --experimental-strip-types tests/ai/runtime-shell-routing.test.mjs`

Expected: FAIL because the sidecar still hardcodes `/bin/zsh` and does not expose a `powershell` execution branch.

- [ ] **Step 3: Replace `runShell` with a platform-aware shell launcher**

```ts
private async runShell(command: string, cwd: string, options?: { timeout?: number; shell?: 'bash' | 'powershell' }) {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
  const shell = options?.shell ?? (process.platform === 'win32' ? 'powershell' : 'bash');

  const file =
    shell === 'powershell'
      ? 'powershell.exe'
      : process.platform === 'win32'
        ? 'powershell.exe'
        : '/bin/zsh';

  const args =
    file === 'powershell.exe'
      ? ['-NoProfile', '-Command', command]
      : ['-lc', command];

  const { stdout, stderr } = await execFile(file, args, { cwd, timeout, maxBuffer: 10 * 1024 * 1024 });
  return { stdout: String(stdout || ''), stderr: String(stderr || '') };
}
```

- [ ] **Step 4: Add explicit `powershell` support to `execute()`**

```ts
case 'powershell':
  return await this.bash({
    ...call.input,
    shell: 'powershell',
  });
```

- [ ] **Step 5: Thread `shell` through the shared tool executor command path**

```ts
type BashLikeInput = {
  command: string;
  timeout?: number;
  cwd?: string;
  shell?: 'bash' | 'powershell';
};
```

- [ ] **Step 6: Run the shell and sidecar tests**

Run: `node --test --experimental-strip-types tests/ai/runtime-shell-routing.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/runtime/src/nodeRuntimeToolExecutor.ts src/modules/ai/runtime/tools/toolExecutor.ts tests/ai/runtime-shell-routing.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs
git commit -m "fix: align sidecar command execution on windows"
```

### Task 5: Finish The Sidecar Cutover So It Acts As Host, Not A Second Runtime Brain

**Files:**
- Modify: `apps/runtime/src/index.ts`
- Modify: `src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts`
- Modify: `src/modules/ai/runtime/agent-kernel/runAgentTurn.ts`
- Modify: `tests/ai/runtime-sidecar-turn-submit.test.mjs`
- Modify: `tests/ai/runtime-tool-loop.test.mjs`

- [ ] **Step 1: Write a failing integration check that the sidecar no longer owns runtime policy**

```js
test('sidecar turn submission delegates tool-loop policy to shared runtime modules', async () => {
  const source = await readFile('apps/runtime/src/index.ts', 'utf8');
  assert.doesNotMatch(source, /READ_ONLY_CHAT_TOOLS,\s*RISKY_BUILT_IN_TOOLS,\s*SIDE_EFFECT_TOOLS/);
  assert.match(source, /getTurnAllowedRuntimeTools/);
  assert.match(source, /RISKY_RUNTIME_TOOLS/);
});
```

- [ ] **Step 2: Run the focused sidecar tests and verify they fail**

Run: `node --test --experimental-strip-types tests/ai/runtime-sidecar-turn-submit.test.mjs tests/ai/runtime-tool-loop.test.mjs`

Expected: FAIL because `apps/runtime/src/index.ts` still references the old tool-list path.

- [ ] **Step 3: Replace sidecar-owned runtime policy references with shared ones**

```ts
import {
  ASK_USER_TOOL_NAME,
  RISKY_RUNTIME_TOOLS,
  getTurnAllowedRuntimeTools,
} from '../../../src/modules/ai/runtime/tools/runtimeToolPolicy.ts';

if (call.name === ASK_USER_TOOL_NAME || !RISKY_RUNTIME_TOOLS.has(call.name)) {
  return;
}
```

- [ ] **Step 4: Keep approvals, replay, and session persistence in the sidecar**

```ts
// Keep these responsibilities in apps/runtime/src/index.ts:
// - pendingQuestions / pendingApprovals
// - replayStore.appendReplayEvent(...)
// - buildApprovalEvent / buildQuestionEvent / buildTurnUsageEvent
// - saveState(...) and broadcast(...)
```

- [ ] **Step 5: Make the tool loop the only place that decides streaming read-only execution**

```ts
// Do not add any sidecar-specific "run this tool early" branches in apps/runtime/src/index.ts.
// Streaming early execution must remain owned by src/modules/ai/runtime/tools/runtimeToolLoop.ts.
```

- [ ] **Step 6: Run the kernel and sidecar regression suite**

Run: `node --test --experimental-strip-types tests/ai/runtime-single-kernel-policy.test.mjs tests/ai/runtime-provider-events.test.mjs tests/ai/runtime-shell-routing.test.mjs tests/ai/runtime-tool-loop.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/runtime/src/index.ts src/modules/ai/runtime/orchestration/executeRuntimeBuiltInAgentTurn.ts src/modules/ai/runtime/agent-kernel/runAgentTurn.ts tests/ai/runtime-sidecar-turn-submit.test.mjs tests/ai/runtime-tool-loop.test.mjs
git commit -m "refactor: reduce sidecar to runtime host responsibilities"
```

### Task 6: Remove Dead Duplication And Run Final Verification

**Files:**
- Modify: `apps/runtime/src/index.ts`
- Modify: `apps/runtime/src/nodeRuntimeProviderClient.ts`
- Modify: `apps/runtime/src/nodeRuntimeToolExecutor.ts`
- Modify: `src/modules/ai/runtime/orchestration/runtimeChatTurnTools.ts`
- Modify: `tests/ai/runtime-shell-routing.test.mjs`
- Modify: `tests/ai/runtime-sidecar-turn-submit.test.mjs`

- [ ] **Step 1: Delete the dead duplicate policy branches and unused imports**

```ts
// Remove any imports that only existed to support SIDE_EFFECT_TOOLS.
// Remove any local type declarations replaced by RuntimeProviderEvent.
// Remove any code path that exists only to translate between duplicate sidecar policy names.
```

- [ ] **Step 2: Keep XML parsing only where it is still required as compatibility fallback**

```ts
// Allowed:
// - parse text/XML tool markup after native tool_call extraction fails
// Not allowed:
// - treat XML markup as the primary internal provider contract
```

- [ ] **Step 3: Run the full targeted runtime suite**

Run: `node --test --experimental-strip-types tests/ai/runtime-single-kernel-policy.test.mjs tests/ai/runtime-provider-events.test.mjs tests/ai/runtime-shell-routing.test.mjs tests/ai/runtime-tool-loop.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs`

Expected: PASS

- [ ] **Step 4: Run the sidecar build**

Run: `npm run build --workspace @goodnight/runtime-sidecar`

Expected: PASS with a compiled `dist/apps/runtime/src/index.js`

- [ ] **Step 5: Run one end-to-end smoke path locally**

Run: `node --test --experimental-strip-types tests/ai/runtime-sidecar-turn-submit.test.mjs`

Expected: PASS, including shared allowed-tools usage, canonical provider events, and Windows command-tool parity assertions.

- [ ] **Step 6: Commit**

```bash
git add apps/runtime/src/index.ts apps/runtime/src/nodeRuntimeProviderClient.ts apps/runtime/src/nodeRuntimeToolExecutor.ts src/modules/ai/runtime/orchestration/runtimeChatTurnTools.ts tests/ai/runtime-shell-routing.test.mjs tests/ai/runtime-sidecar-turn-submit.test.mjs
git commit -m "chore: clean runtime duplication after single-kernel cutover"
```

## Rollout Notes

- Keep the work on the built-in runtime path only. Do not mix multi-agent team refactors into this cutover.
- Do not rewrite UI projection or sidecar transport while doing this work.
- If a step exposes a second independent runtime problem, write it down and continue unless it blocks the single-kernel cutover directly.

## Self-Review

**Spec coverage**
- Single-kernel ownership is covered by Tasks 1, 2, and 5.
- Provider contract unification is covered by Task 3.
- Windows shell parity is covered by Task 4.
- Cleanup of duplicate sidecar policy is covered by Task 6.

**Placeholder scan**
- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every task has exact files, commands, and expected outcomes.

**Type consistency**
- Shared event type is consistently named `RuntimeProviderEvent`.
- Shared policy entry point is consistently named `getTurnAllowedRuntimeTools`.
- Shared risky tool set is consistently named `RISKY_RUNTIME_TOOLS`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-10-runtime-single-kernel-cutover.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
