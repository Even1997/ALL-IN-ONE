# OpenAI Built-In Dual API Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stable dual-path OpenAI built-in runtime support so the built-in GPT route can use `Responses API` for official OpenAI reasoning summaries while preserving `Chat Completions` compatibility fallback for existing openai-compatible providers.

**Architecture:** Keep the change inside the provider adapter boundary. `apps/runtime/src/nodeRuntimeProviderClient.ts` becomes the only layer that decides whether to call `/responses` or `/chat/completions`, then normalizes provider-native output into the existing `thinking` / `text` / `tool_call` / `done` runtime events. Downstream canonical events, sidecar projection, and UI rendering remain unchanged except for endpoint preview text that should explain the dual-path behavior.

**Tech Stack:** TypeScript, Node runtime fetch/SSE parsing, existing built-in runtime provider event model, Node test runner (`node --test`).

---

## File Structure

**Modify**
- `C:\Users\Even\Documents\ALL-IN-ONE\apps\runtime\src\nodeRuntimeProviderClient.ts`
  - Add OpenAI `Responses API` request/stream parsing
  - Add endpoint selection + fallback logic
  - Keep provider-native content semantics unchanged; only normalize structure
- `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\globalSettingsPageShared.ts`
  - Update endpoint preview text so OpenAI-compatible users are no longer misled into thinking the built-in runtime always calls only `/chat/completions`
- `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-provider-events.test.mjs`
  - Add failing coverage for `Responses API` reasoning summary mapping, tool mapping, and fallback behavior

**Verify / possibly touch if the preview helper is duplicated**
- `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.tsx`
  - Only modify if endpoint preview logic is duplicated here instead of solely importing from the shared helper

**Reference**
- `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\runtime\provider\runtimeProviderEvents.ts`
  - Confirms the adapter target shape stays `thinking | text | commentary_text | final_text | tool_call | usage | done`
- `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\runtime-sidecar\runtimeSidecarSessionBridge.ts`
  - Confirms downstream reasoning flow already exists and should not be semantically changed

---

### Task 1: Lock the new runtime contract with failing provider tests

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-provider-events.test.mjs`
- Reference: `C:\Users\Even\Documents\ALL-IN-ONE\apps\runtime\src\nodeRuntimeProviderClient.ts`

- [ ] **Step 1: Write the failing test for Responses API reasoning summaries**

Add a test that stubs a `text/event-stream` response from `/responses` and proves the adapter emits `thinking` from reasoning-summary events and `text` from output text events.

```javascript
test('openai official responses streaming maps reasoning summary and answer text into runtime events', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const requests = [];
  const events = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    return createSseResponse([
      toSseFrame({ type: 'response.reasoning_summary_text.delta', delta: 'Inspect files first. ' }),
      toSseFrame({ type: 'response.output_text.delta', delta: 'Done reviewing.' }),
      toSseFrame({ type: 'response.completed' }),
    ]);
  };

  try {
    const finalText = await streamRuntimeProviderTurn({
      runtimeConfig: {
        provider: 'openai-compatible',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-5',
      },
      prompt: 'Inspect the repo.',
      systemPrompt: 'You can use tools.',
      onEvent: (event) => events.push(event),
    });

    assert.equal(finalText, 'Done reviewing.');
    assert.equal(requests[0], 'https://api.openai.com/v1/responses');
    assert.deepEqual(
      events
        .filter((event) => event.kind === 'thinking' || event.kind === 'text')
        .map((event) => [event.kind, event.delta]),
      [
        ['thinking', 'Inspect files first. '],
        ['text', 'Done reviewing.'],
      ],
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
```

- [ ] **Step 2: Write the failing test for Responses API tool calls**

Add a second test that proves `Responses API` tool call items become the existing `tool_call` runtime event shape without reparsing assistant prose.

```javascript
test('openai official responses streaming maps function-call items into runtime tool events', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const events = [];

  globalThis.fetch = async () =>
    createSseResponse([
      toSseFrame({
        type: 'response.output_item.added',
        item: {
          type: 'function_call',
          call_id: 'call_resp_1',
          name: 'view',
          arguments: '{"path":"README.md"}',
        },
      }),
      toSseFrame({ type: 'response.completed' }),
    ]);

  try {
    const finalText = await streamRuntimeProviderTurn({
      runtimeConfig: {
        provider: 'openai-compatible',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-5',
      },
      prompt: 'Inspect README.',
      systemPrompt: 'You can use tools.',
      onEvent: (event) => events.push(event),
    });

    assert.equal(finalText, '');
    assert.deepEqual(
      events.filter((event) => event.kind === 'tool_call').map((event) => event.toolCall),
      [{ id: 'call_resp_1', name: 'view', input: { path: 'README.md' } }],
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
```

- [ ] **Step 3: Write the failing test for OpenAI-to-chat fallback**

Add a test that proves the built-in runtime first tries `/responses` for official OpenAI, then falls back to `/chat/completions` when the Responses endpoint is unavailable.

```javascript
test('openai official route falls back from responses to chat completions when responses is unavailable', { concurrency: false }, async () => {
  const previousFetch = globalThis.fetch;
  const requestedUrls = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url === 'https://api.openai.com/v1/responses') {
      return new Response(JSON.stringify({ error: { message: 'not found' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url === 'https://api.openai.com/v1/chat/completions') {
      return createSseResponse([
        toSseFrame({ choices: [{ delta: { content: 'Fallback answer' } }] }),
        toSseFrame('[DONE]'),
      ]);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const finalText = await streamRuntimeProviderTurn({
      runtimeConfig: {
        provider: 'openai-compatible',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        model: 'gpt-5',
      },
      prompt: 'Fallback if needed.',
      systemPrompt: 'system',
    });

    assert.equal(finalText, 'Fallback answer');
    assert.deepEqual(requestedUrls, [
      'https://api.openai.com/v1/responses',
      'https://api.openai.com/v1/chat/completions',
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
```

- [ ] **Step 4: Run the targeted provider test file and verify the new tests fail**

Run: `node --test C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-provider-events.test.mjs`

Expected:
- New tests fail because `/responses` parsing and fallback behavior are not implemented yet
- Existing runtime-provider tests continue to execute

- [ ] **Step 5: Commit the red state**

```bash
git add C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-provider-events.test.mjs
git commit -m "test: lock builtin openai dual-api runtime contract"
```

---

### Task 2: Add OpenAI Responses API support inside the built-in provider adapter

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\apps\runtime\src\nodeRuntimeProviderClient.ts`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-provider-events.test.mjs`
- Reference: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\runtime\provider\runtimeProviderEvents.ts`

- [ ] **Step 1: Add helper predicates for official OpenAI vs generic compatible providers**

Inside `nodeRuntimeProviderClient.ts`, add small helpers that keep endpoint choice explicit and local to the adapter.

```ts
const normalizeBaseUrl = (baseURL: string) => baseURL.trim().replace(/\/+$/, '');

const isOfficialOpenAIBaseUrl = (baseURL: string) => {
  const normalized = normalizeBaseUrl(baseURL).toLowerCase();
  return normalized === 'https://api.openai.com' || normalized === 'https://api.openai.com/v1';
};

const shouldPreferOpenAIResponsesApi = (config: RuntimeModelConfig) =>
  config.provider === 'openai-compatible' && isOfficialOpenAIBaseUrl(config.baseURL);
```

- [ ] **Step 2: Add Responses request body builder with structure-only normalization**

Create a helper that converts the existing normalized prompt messages into an OpenAI Responses request without rewriting model semantics.

```ts
const buildOpenAIResponsesInput = (
  systemPrompt: string,
  messages: RuntimeToolPromptMessage[],
) => [
  { role: 'system', content: systemPrompt },
  ...messages.map((message) => ({
    role: message.role,
    content: message.content,
  })),
];
```

Add the request body builder:

```ts
const buildOpenAIResponsesBody = (input: RuntimeProviderStreamInput, messages: RuntimeToolPromptMessage[]) => ({
  model: input.runtimeConfig.model,
  temperature: 0.4,
  max_output_tokens: 4096,
  stream: true,
  reasoning: {
    summary: 'auto',
  },
  tools: buildOpenAIResponsesTools(),
  input: buildOpenAIResponsesInput(input.systemPrompt, messages),
});
```

- [ ] **Step 3: Add Responses tool schema builder**

Keep tool semantics unchanged; only map existing tool definitions into the Responses API shape.

```ts
const buildOpenAIResponsesTools = () =>
  TOOLS.map((tool) => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(tool.parameters).map(([name, parameter]) => [
          name,
          {
            type: parameter.type,
            description: parameter.description,
            ...(parameter.items ? { items: parameter.items } : {}),
          },
        ]),
      ),
      required: tool.required,
    },
  }));
```

- [ ] **Step 4: Add Responses SSE parser**

Parse only provider-native structure into the existing runtime event model. Do not rewrite summary wording or assistant answer wording.

```ts
const parseOpenAIResponsesEvent = (
  payload: any,
  responseToolCalls: Map<string, RuntimeProviderToolCall>,
): RuntimeProviderEvent[] => {
  const type = typeof payload?.type === 'string' ? payload.type : '';

  if (type === 'response.reasoning_summary_text.delta') {
    return buildTextEvents('thinking', typeof payload?.delta === 'string' ? payload.delta : null);
  }

  if (type === 'response.output_text.delta') {
    return buildTextEvents('text', typeof payload?.delta === 'string' ? payload.delta : null);
  }

  if (type === 'response.output_item.added' && payload?.item?.type === 'function_call') {
    const parsed = buildRuntimeProviderToolCall({
      id: payload.item.call_id,
      name: payload.item.name,
      arguments: payload.item.arguments,
      fallbackId: payload.item.call_id || 'response_call',
    });
    if (!parsed) {
      return [];
    }
    responseToolCalls.set(parsed.id, parsed);
    return [{ kind: 'tool_call', toolCall: parsed }];
  }

  return [];
};
```

- [ ] **Step 5: Add `streamOpenAIResponsesTurn()`**

Implement a sibling to `streamOpenAICompatibleTurn()` that:
- calls `/responses`
- uses `readEventStream()`
- emits `usage` if available
- returns the accumulated answer text
- preserves tool fallback serialization when `onEvent` is absent

```ts
const streamOpenAIResponsesTurn = async (
  input: RuntimeProviderStreamInput,
): Promise<string> => {
  const messages = normalizePromptMessages(input.prompt);
  const doFetch = async () => {
    const response = await fetchOpenAICompatibleWithV1Fallback(input.runtimeConfig.baseURL, '/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.runtimeConfig.apiKey}`,
        ...parseCustomHeaders(input.runtimeConfig.customHeaders),
      },
      body: JSON.stringify(buildOpenAIResponsesBody(input, messages)),
      signal: input.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI Responses API error (${response.status}): ${await response.text()}`);
    }

    const responseToolCalls = new Map<string, RuntimeProviderToolCall>();
    const streamed = response.body && isEventStreamResponse(response)
      ? await readEventStream(response.body, input.onEvent, (data) => {
          const payload = JSON.parse(data);
          return parseOpenAIResponsesEvent(payload, responseToolCalls);
        })
      : { answer: '', thinking: '' };

    const toolCalls = [...responseToolCalls.values()];
    return input.onEvent ? streamed.answer : buildAssistantFallbackContent(streamed.answer, toolCalls);
  };

  const finalText = await withRetry(doFetch, { signal: input.signal });
  await input.onEvent?.({ kind: 'done', finalText });
  return finalText;
};
```

- [ ] **Step 6: Add bounded fallback from Responses to Chat Completions**

Implement a single fallback wrapper so official OpenAI can degrade gracefully without changing behavior for third-party compatible providers.

```ts
const shouldFallbackFromResponsesToChat = (error: unknown) => {
  const message = String(error);
  return /Responses API error \(404\)/i.test(message) || /Responses API error \(400\)/i.test(message);
};
```

Then update the export:

```ts
export const streamRuntimeProviderTurn = async (
  input: RuntimeProviderStreamInput,
): Promise<string> => {
  if (input.runtimeConfig.provider === 'anthropic') {
    return streamAnthropicTurn(input);
  }

  if (shouldPreferOpenAIResponsesApi(input.runtimeConfig)) {
    try {
      return await streamOpenAIResponsesTurn(input);
    } catch (error) {
      if (!shouldFallbackFromResponsesToChat(error)) {
        throw error;
      }
    }
  }

  return streamOpenAICompatibleTurn(input);
};
```

- [ ] **Step 7: Run the targeted provider tests and verify they pass**

Run: `node --test C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-provider-events.test.mjs`

Expected:
- The new Responses tests pass
- Existing chat-completions and anthropic tests remain green

- [ ] **Step 8: Commit the provider adapter implementation**

```bash
git add C:\Users\Even\Documents\ALL-IN-ONE\apps\runtime\src\nodeRuntimeProviderClient.ts C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-provider-events.test.mjs
git commit -m "feat: add builtin openai responses runtime path"
```

---

### Task 3: Patch settings copy so the built-in endpoint preview matches runtime reality

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\globalSettingsPageShared.ts`
- Possibly modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.tsx`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-provider-events.test.mjs` (source assertion) or a nearby settings/source test if one already covers preview text

- [ ] **Step 1: Add a source-level assertion that endpoint preview no longer hardcodes chat-completions-only messaging**

If there is no better existing settings preview test, add a small source assertion in `runtime-provider-events.test.mjs`:

```javascript
test('settings endpoint preview no longer hardcodes openai-compatible builtin routing to chat completions only', async () => {
  const source = await readFile('src/components/workspace/globalSettingsPageShared.ts', 'utf8');
  assert.doesNotMatch(source, /provider === 'anthropic' \? 'messages' : 'chat\/completions'/);
});
```

- [ ] **Step 2: Update the preview helper text**

Replace the current helper with wording that reflects actual built-in runtime routing.

```ts
export const buildProviderEndpointPreview = (provider: AIProviderType, baseURL: string) => {
  const normalized = baseURL.replace(/\/+$/, '');
  if (provider === 'anthropic') {
    return `${normalized}/messages`;
  }
  if (/^https:\/\/api\.openai\.com(?:\/v1)?$/i.test(normalized)) {
    return `${normalized}/responses (preferred) → ${normalized}/chat/completions (fallback)`;
  }
  return `${normalized}/chat/completions`;
};
```

- [ ] **Step 3: Run the focused source assertion test**

Run: `node --test C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-provider-events.test.mjs`

Expected:
- The new preview assertion passes
- No provider runtime regressions appear

- [ ] **Step 4: Commit the preview fix**

```bash
git add C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\globalSettingsPageShared.ts C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-provider-events.test.mjs
git commit -m "fix: align builtin endpoint preview with dual openai routing"
```

---

### Task 4: Run integration verification and refresh graph metadata

**Files:**
- Verify: `C:\Users\Even\Documents\ALL-IN-ONE\apps\runtime\src\nodeRuntimeProviderClient.ts`
- Verify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-provider-events.test.mjs`
- Update graph: `C:\Users\Even\Documents\ALL-IN-ONE\graphify-out\`

- [ ] **Step 1: Run the full targeted AI runtime regression set**

Run:

```bash
node --test C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-provider-events.test.mjs C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-sidecar-streaming.test.mjs C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\runtime-sidecar-session-bridge.test.mjs C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\canonical-narrative-projection.test.mjs
```

Expected:
- All tests pass
- Reasoning flow remains separated from final answer flow

- [ ] **Step 2: Run the shared AI service regression if the legacy service still mirrors provider parsing**

Run:

```bash
node --test C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\ai-service.test.mjs
```

Expected:
- Passes unchanged, or reveals any remaining mismatch between built-in runtime parsing and legacy service parsing

- [ ] **Step 3: Refresh the graph**

Run:

```bash
graphify update .
```

Expected:
- `graphify-out/GRAPH_REPORT.md` freshness reflects the new runtime provider changes

- [ ] **Step 4: Commit final verification-only updates**

```bash
git add C:\Users\Even\Documents\ALL-IN-ONE\graphify-out
git commit -m "chore: refresh graph after builtin openai dual-api runtime changes"
```

---

## Self-Review

- **Spec coverage:** The plan covers the agreed architecture boundary (provider adapter only), dual OpenAI API support, minimal structural normalization, fallback behavior, and settings/UI copy alignment.
- **Placeholder scan:** No `TODO` / `TBD` placeholders remain; every task includes concrete files, tests, commands, and expected behavior.
- **Type consistency:** All tasks continue to target the existing `RuntimeProviderEvent` shape instead of inventing a new runtime event contract.

## Execution Handoff

Plan complete and saved to `C:\Users\Even\Documents\ALL-IN-ONE\docs\superpowers\plans\2026-05-17-openai-builtin-dual-api-runtime-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
