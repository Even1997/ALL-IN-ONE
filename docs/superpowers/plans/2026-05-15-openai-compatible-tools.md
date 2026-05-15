# OpenAI Compatible Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the OpenAI-compatible provider behave like the Anthropic provider for tool-capable turns by sending tool declarations, parsing native tool calls, and preserving reasoning/tool events.

**Architecture:** Keep the fix in the provider protocol adapter layer. `AIService` covers the in-browser/direct runtime path, while `apps/runtime/src/nodeRuntimeProviderClient.ts` covers the desktop sidecar path; both should emit the existing `thinking`, `text`, and `tool_call` provider events so canonical runtime, timeline, and UI layers do not need display-specific patches.

**Tech Stack:** TypeScript, Node test runner, OpenAI-compatible `chat/completions`, existing runtime provider event protocol.

---

### Task 1: Lock OpenAI-Compatible Request Body Contract

**Files:**
- Modify: `tests/ai/ai-service.test.mjs`
- Modify: `tests/ai/runtime-provider-events.test.mjs`

- [x] **Step 1: Add failing tests for direct `AIService`**

Add a test that calls `aiService.completeText()` with `provider: 'openai-compatible'`, captures the JSON body sent to `/chat/completions`, and asserts:

```js
assert.equal(Array.isArray(lastBody.tools), true);
assert.equal(lastBody.tools.some((tool) => tool.function?.name === 'view'), true);
assert.equal(lastBody.tool_choice, 'auto');
```

- [x] **Step 2: Add failing tests for sidecar provider client**

Add a test around `streamRuntimeProviderTurn()` that captures the request body and asserts:

```js
assert.equal(Array.isArray(lastBody.tools), true);
assert.equal(lastBody.tools.some((tool) => tool.function?.name === 'view'), true);
assert.equal(lastBody.tool_choice, 'auto');
```

- [x] **Step 3: Run targeted tests and verify RED**

Run:

```bash
node --test tests/ai/ai-service.test.mjs tests/ai/runtime-provider-events.test.mjs
```

Expected: both new tests fail because `tools` and `tool_choice` are missing from OpenAI-compatible request bodies.

### Task 2: Implement OpenAI Tool Declaration Serialization

**Files:**
- Modify: `src/modules/ai/core/AIService.ts`
- Modify: `apps/runtime/src/nodeRuntimeProviderClient.ts`

- [x] **Step 1: Add OpenAI tool builders**

Create helper functions that convert existing `TOOLS` definitions into OpenAI-compatible tool declarations:

```ts
{
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: { ... },
      required: tool.required,
    },
  },
}
```

- [x] **Step 2: Include tools in OpenAI-compatible chat payloads**

Update both OpenAI-compatible request payloads to include:

```ts
tools: buildOpenAICompatibleTools(),
tool_choice: 'auto',
```

- [x] **Step 3: Run targeted tests and verify GREEN**

Run:

```bash
node --test tests/ai/ai-service.test.mjs tests/ai/runtime-provider-events.test.mjs
```

Expected: request-body tests pass.

### Task 3: Parse Native OpenAI Tool Calls In Direct Runtime

**Files:**
- Modify: `src/modules/ai/core/AIService.ts`
- Modify: `tests/ai/ai-service.test.mjs`

- [x] **Step 1: Add failing streaming tool-call test**

Add a test that streams fragmented `delta.tool_calls` events and asserts `aiService.completeText()` emits one structured `tool_call` event:

```js
{
  kind: 'tool_call',
  delta: '',
  toolCall: {
    id: 'call_1',
    name: 'view',
    input: { file_path: 'src/app.ts' },
  },
}
```

- [x] **Step 2: Implement parsing in `readOpenAICompatibleStream()`**

Accumulate partial OpenAI `tool_calls` arguments by `index`, parse completed JSON once available, emit `tool_call`, and keep text/reasoning behavior unchanged.

- [x] **Step 3: Run direct runtime tests**

Run:

```bash
node --test tests/ai/ai-service.test.mjs
```

Expected: direct runtime emits OpenAI native tool calls as existing `AITextStreamEvent` values.

### Task 4: Add Sidecar `/v1` Fallback For OpenAI-Compatible Turns

**Files:**
- Modify: `apps/runtime/src/nodeRuntimeProviderClient.ts`
- Modify: `tests/ai/runtime-provider-events.test.mjs`

- [x] **Step 1: Add failing fallback test**

Add a test where `baseURL` is `http://localhost:8080`, root `/chat/completions` returns HTML, and `/v1/chat/completions` returns valid SSE. Assert the sidecar retries `/v1`.

- [x] **Step 2: Implement sidecar fallback helper**

Mirror the direct `AIService` fallback behavior for OpenAI-compatible chat completions: retry `/v1` when the root URL returns `404` or `text/html`, and avoid duplicating `/v1` if the base URL already ends in a version segment.

- [x] **Step 3: Run sidecar provider tests**

Run:

```bash
node --test tests/ai/runtime-provider-events.test.mjs tests/ai/runtime-sidecar-streaming.test.mjs
```

Expected: fallback and existing sidecar streaming behavior pass.

### Task 5: Full Verification And Graph Refresh

**Files:**
- Update generated graph outputs if `graphify update .` succeeds.

- [x] **Step 1: Run targeted AI tests**

```bash
node --test tests/ai/ai-service.test.mjs tests/ai/runtime-provider-events.test.mjs tests/ai/runtime-sidecar-streaming.test.mjs
```

- [x] **Step 2: Run existing config regression**

```bash
node --test tests/ai/ai-config-list.test.mjs
```

- [x] **Step 3: Run build**

```bash
npm run build
```

- [x] **Step 4: Refresh graph**

```bash
graphify update .
```

Expected: tests and build pass. If graph refresh fails due to existing `graphify-out` write behavior, record the exact failure instead of treating it as an app regression.

### Execution Note

During execution, direct `AIService` also gained a non-streaming compatibility path: if an OpenAI-compatible response returns native `message.tool_calls` without text content, the adapter serializes those calls into the existing JSON tool protocol so the older agent loop can continue executing tools instead of treating the response as empty.
