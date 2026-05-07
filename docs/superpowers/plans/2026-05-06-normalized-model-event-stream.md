# Normalized Model Event Stream Plan

> **For agentic workers:** Implement tier-by-tier. Each tier is independently deployable. Use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate regex-based tool protocol cleaning from the visible text path. Replace with per-provider event normalization so text events never contain protocol markers.

**Problem:** The current system uses a text-only `AITextStreamEvent` type (`'thinking' | 'text'`). All model output (visible text + XML tool protocol) arrives as `'text'` events. Downstream consumers must regex-clean the text to separate protocol from visible content. Two different regex sets (`agentEvents.ts` conservative vs `aiChatMessageParts.ts` aggressive) cause inconsistent cleaning.

**Solution:** Add a `'tool_call'` event kind. Each provider normalizer converts its native output into structured events. Text events contain only visible text. Tool call events carry parsed tool invocation data.

```
Current:   model text (visible + <tool_use>...</tool_use>) → regex cleanup → visible text
Target:    model text → provider normalizer → {text} events + {tool_call} events → no regex needed
```

**Tech Stack:** TypeScript, existing AIService provider implementations, Node test runner

**Existing files referenced:**
- `src/modules/ai/core/AIService.ts` — provider stream readers
- `src/modules/ai/runtime/tools/runtimeToolLoop.ts` — tool loop with streaming events
- `src/modules/ai/runtime/orchestration/agentTurnRunner.ts` — streaming assembler
- `src/modules/ai/runtime/dispatch/agentEvents.ts` — sanitizeAgentVisibleText (current regex approach)
- `src/components/workspace/aiChatMessageParts.ts` — extractAssistantMessageContent (post-processing regex)
- `src/components/workspace/tools.ts` — `createStreamingToolDetector`, `parseToolCalls`
- `src/modules/ai/runtime/agent-kernel/agentKernelTypes.ts` — `RuntimeToolLoopOptions`

---

## Tier 1: Streaming Protocol Filter (immediate fix)

Add a streaming-aware state machine that separates tool protocol from visible text in real-time. Applied in the tool loop's `streamAwareOnEvent` wrapper so protocol text never reaches the streaming assembler.

**Files:**
- Modify: `src/modules/ai/runtime/dispatch/agentEvents.ts`
- Modify: `src/modules/ai/runtime/tools/runtimeToolLoop.ts`

### Step 1.1: Add streaming protocol splitter to agentEvents.ts

Add a new function `createStreamingTextSplitter` and a helper `splitTextStream` beside the existing `sanitizeAgentVisibleText`.

The splitter is a state machine with two modes:
- `'text'` — accumulating visible text until a protocol marker starts
- `'protocol'` — buffering protocol content until the block closes, then parsing it

```typescript
// Add to agentEvents.ts after existing RAW_* patterns and sanitizeAgentVisibleText

export type StreamTextEvent = { kind: 'text'; delta: string };
export type StreamToolCallEvent = {
  kind: 'tool_call';
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type StreamSplitEvent = StreamTextEvent | StreamToolCallEvent;

/**
 * Streaming protocol state machine.
 * Reads text deltas, emits either clean text events or parsed tool call events.
 * Protocol blocks (<tool_use>...</tool_use>) are detected during streaming
 * and removed from the text stream before emission.
 */
export const createStreamingTextSplitter = () => {
  let buffer = '';
  // 'idle' = normal text; 'protocol' = inside <tool_use> block
  let mode: 'idle' | 'protocol' = 'idle';
  let insideToolUse = false;
  let toolUseDepth = 0; // track nesting of <tool_use>

  const detectProtocolStart = (text: string): number => {
    // <tool_use> can span multiple deltas, so we look for the opening tag
    const idx = text.indexOf('<tool_use>');
    if (idx !== -1) return idx;
    // Also check for partial match at buffer boundaries
    const combined = buffer + text;
    // Only trigger on complete <tool_use> tag
    if (combined.includes('<tool_use>')) {
      // Find position in the combined text, relative to buffer length
      const pos = combined.indexOf('<tool_use>');
      if (pos < buffer.length) {
        // Opening tag was already in buffer but we missed it because
        // it wasn't complete yet — flush buffer up to the tag
        return -2; // special signal: need to re-process
      }
      return pos - buffer.length;
    }
    return -1;
  };

  return {
    /**
     * Feed a text delta. Returns array of events.
     * Text up to the protocol start is emitted as { kind: 'text' }.
     * Protocol blocks are parsed and emitted as { kind: 'tool_call' }.
     */
    feed: (delta: string): StreamSplitEvent[] => {
      const events: StreamSplitEvent[] = [];
      let remaining = delta;

      while (remaining.length > 0) {
        if (mode === 'idle') {
          // Look for start of tool protocol
          const protocolIdx = remaining.indexOf('<tool_use>');

          if (protocolIdx === -1) {
            // Check if we have a partial match at the end
            // If buffer ends with a partial <tool_use tag, hold it
            const partialCheck = (buffer + remaining).includes('<tool_use>');
            if (!partialCheck) {
              // No protocol marker anywhere — emit all as text
              events.push({ kind: 'text', delta: remaining });
              buffer = '';
              remaining = '';
            } else {
              // There's a <tool_use> somewhere in combined buffer+remaining
              const combined = buffer + remaining;
              const tagPos = combined.indexOf('<tool_use>');
              if (tagPos >= 0) {
                // Emit text before the tag
                const textBefore = combined.slice(0, tagPos);
                if (textBefore) {
                  events.push({ kind: 'text', delta: textBefore });
                }
                // Enter protocol mode with content after the tag
                const afterTag = combined.slice(tagPos + '<tool_use>'.length);
                buffer = '';
                mode = 'protocol';
                toolUseDepth = 1;
                remaining = afterTag;
              } else {
                // Partial match only at buffer boundary — keep in buffer
                buffer += remaining;
                remaining = '';
              }
            }
          } else {
            // Found <tool_use> in this delta
            if (protocolIdx > 0) {
              events.push({ kind: 'text', delta: remaining.slice(0, protocolIdx) });
            }
            mode = 'protocol';
            toolUseDepth = 1;
            remaining = remaining.slice(protocolIdx + '<tool_use>'.length);
          }
        } else {
          // mode === 'protocol' — accumulate until </tool_use>
          // Track depth to handle nested tool_use blocks
          const searchTarget = remaining;
          let pos = 0;
          let closed = false;

          while (pos < searchTarget.length) {
            const openIdx = searchTarget.indexOf('<tool_use>', pos);
            const closeIdx = searchTarget.indexOf('</tool_use>', pos);

            if (closeIdx !== -1 && (openIdx === -1 || closeIdx < openIdx)) {
              // Closing tag comes first
              toolUseDepth -= 1;
              buffer += searchTarget.slice(pos, closeIdx);
              pos = closeIdx + '</tool_use>'.length;

              if (toolUseDepth === 0) {
                // Protocol block complete — parse it
                const toolCallEvents = parseToolCallFromProtocolBuffer(buffer);
                events.push(...toolCallEvents);
                buffer = '';
                mode = 'idle';
                closed = true;
                remaining = searchTarget.slice(pos);
                break;
              }
            } else if (openIdx !== -1) {
              // Opening tag inside protocol — increase depth
              toolUseDepth += 1;
              buffer += searchTarget.slice(pos, openIdx + '<tool_use>'.length);
              pos = openIdx + '<tool_use>'.length;
            } else {
              // No tags in remaining portion
              buffer += searchTarget.slice(pos);
              pos = searchTarget.length;
            }
          }

          if (!closed) {
            remaining = '';
          }
        }
      }

      return events;
    },

    flush: (): StreamSplitEvent[] => {
      // Emit any remaining buffer as text (if not in protocol mode)
      if (mode === 'idle' && buffer) {
        const events: StreamSplitEvent[] = [{ kind: 'text', delta: buffer }];
        buffer = '';
        return events;
      }
      // If still in protocol mode, the block was truncated — discard the buffer
      if (mode === 'protocol') {
        buffer = '';
        mode = 'idle';
      }
      return [];
    },

    reset: () => {
      buffer = '';
      mode = 'idle';
      toolUseDepth = 0;
    },
  };
};

/**
 * Parse a protocol buffer (content between <tool_use> and </tool_use>)
 * into tool call events.
 */
const parseToolCallFromProtocolBuffer = (protocolContent: string): StreamToolCallEvent[] => {
  const events: StreamToolCallEvent[] = [];
  // Match <tool name="xxx">...<tool_params>...</tool_params>...</tool>
  const toolRegex = /<tool\s+name="(\w+)">\s*(?:<tool_params>(.*?)<\/tool_params>)?/gs;
  let match: RegExpExecArray | null;

  while ((match = toolRegex.exec(protocolContent)) !== null) {
    const name = match[1];
    const paramsStr = match[2];

    if (!paramsStr) continue;

    try {
      const input = JSON.parse(paramsStr);
      if (input && typeof input === 'object' && !Array.isArray(input)) {
        events.push({
          kind: 'tool_call',
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name,
          input: input as Record<string, unknown>,
        });
      }
    } catch {
      // Skip malformed params
    }
  }

  return events;
};
```

### Step 1.2: Apply the splitter in runtimeToolLoop.ts

**Current** (`runtimeToolLoop.ts` lines 298-316):
```typescript
const streamAwareOnEvent = wrapped
  ? (event: AITextStreamEvent) => {
      wrapped(event);
      if (event.kind === 'text' && event.delta) {
        const detectedCalls = streamDetector.feed(event.delta);
        for (const call of detectedCalls) {
          if (!STREAM_EXECUTION_TOOLS.has(call.name)) { continue; }
          // ... execute stream-detected tool
        }
      }
    }
  : undefined;
```

**Replace with:**
```typescript
const streamAwareOnEvent = wrapped
  ? (event: AITextStreamEvent) => {
      if (event.kind === 'text' && event.delta) {
        // Use streaming splitter to separate text from tool protocol
        const splitEvents = streamSplitter.feed(event.delta);
        for (const splitEvent of splitEvents) {
          if (splitEvent.kind === 'text') {
            wrapped({ kind: 'text', delta: splitEvent.delta });
            // Also feed to streamDetector for backward compatibility
            const detectedCalls = streamDetector.feed(splitEvent.delta);
            for (const call of detectedCalls) {
              if (!STREAM_EXECUTION_TOOLS.has(call.name)) { continue; }
              const promise = executeSingleTool(call).then(({ step, result }) => {
                streamExecutedResults.push({ call, step, result });
                toolCalls.push(step);
                emitToolCallsChange(options, toolCalls);
              });
              streamExecutionPromises.push(promise);
            }
          } else if (splitEvent.kind === 'tool_call') {
            // Tool call detected from streaming protocol — execute if fast-track eligible
            if (STREAM_EXECUTION_TOOLS.has(splitEvent.name)) {
              const detectedCalls = streamDetector.feed(
                `<tool_use><tool name="${splitEvent.name}"><tool_params>${JSON.stringify(splitEvent.input)}</tool_params></tool></tool_use>`
              );
              for (const call of detectedCalls) {
                // Hmm, this is awkward. Better to just execute directly.
              }
            }
          }
        }
      } else {
        wrapped(event);
      }
    }
  : undefined;
```

Actually, this is getting complex with the dual `streamDetector` + `streamSplitter` coexistence during migration. Let me simplify.

The simpler approach during Tier 1: **just filter the text, don't replace the tool detector yet**.

```typescript
// Add near imports at top of runtimeToolLoop.ts:
import { createStreamingTextSplitter } from '../dispatch/agentEvents.ts';

// In the tool loop function, before the round loop, add:
const streamSplitter = createStreamingTextSplitter();

// Replace streamAwareOnEvent (lines 298-316):
const streamAwareOnEvent = wrapped
  ? (event: AITextStreamEvent) => {
      if (event.kind === 'text' && event.delta) {
        // Filter protocol from text stream in real-time
        const splitEvents = streamSplitter.feed(event.delta);
        for (const splitEvent of splitEvents) {
          if (splitEvent.kind === 'text') {
            wrapped({ kind: 'text', delta: splitEvent.delta });
          }
          // tool_call events from splitter are logged but not executed yet — 
          // tool calls still come from parseToolCalls on the full response
        }
        // Continue existing stream tool detection on the raw delta
        // (the stream detector needs the raw protocol text to detect calls)
        const rawCalls = streamDetector.feed(event.delta);
        for (const call of rawCalls) {
          if (!STREAM_EXECUTION_TOOLS.has(call.name)) continue;
          const promise = executeSingleTool(call).then(({ step, result }) => {
            streamExecutedResults.push({ call, step, result });
            toolCalls.push(step);
            emitToolCallsChange(options, toolCalls);
          });
          streamExecutionPromises.push(promise);
        }
      } else {
        wrapped(event);
      }
    }
  : undefined;
```

Also add `streamSplitter.reset()` and `streamSplitter.flush()` at appropriate lifecycle points:
- `streamSplitter.reset()` at the start of each round (when `streamDetector.reset()` would be called — though the detector isn't explicitly reset in the current code; it's created fresh each round)
- `streamSplitter.flush()` after the model call completes, to emit any remaining text

### Step 1.3: Remove streaming sanitizer from buildDraft

Once the streaming splitter prevents protocol text from reaching `onModelEvent`, the streaming assembler's `buildDraft` no longer needs to sanitize.

**File**: `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`

**Current** (line 284):
```typescript
const sanitizeStreamingVisibleText = sanitizeAgentVisibleText;
```

**Current** (lines 334-350):
```typescript
const buildDraft = (completeThinking: boolean): RuntimeStreamingAssistantDraft => {
  const visibleAnswerContent = sanitizeStreamingVisibleText(answerContentRaw);
  const visibleThinkingContent = sanitizeStreamingThinkingText(thinkingContent);
  const visibleParts = assistantParts
    .map((part) => {
      const content =
        part.type === 'thinking'
          ? sanitizeStreamingThinkingText(part.content)
          : sanitizeStreamingVisibleText(part.content);
      // ...
    })
    // ...
};
```

**Tier 1 change:** Remove the sanitize calls. The text entering the assembler is already clean.
```typescript
const buildDraft = (completeThinking: boolean): RuntimeStreamingAssistantDraft => {
  const visibleAnswerContent = answerContentRaw;          // already clean
  const visibleThinkingContent = thinkingContent;          // already clean
  const visibleParts = assistantParts
    .map((part) => {
      const content = part.content;                        // already clean
      return content ? { ...part, content } : null;
    })
    .filter((part): part is RuntimeStreamingAssistantDraft['assistantParts'][number] => Boolean(part));
  // ... rest stays the same
};
```

Also remove the `sanitizeStreamingVisibleText` and `sanitizeStreamingThinkingText` aliases at line 284.

### Step 1.4: Build `buildFinal` without fallback to raw response

**Current** (lines 393-414):
```typescript
buildFinal: (response: string): RuntimeStreamingAssistantDraft => {
  if (state === 'initial') { flushPendingText('answer'); state = 'answer'; }
  const draft = buildDraft(true);
  const sanitizedResponse = sanitizeStreamingVisibleText(response);
  let answerContent = draft.answerContent;
  let finalParts = draft.assistantParts;
  if (sanitizedResponse && sanitizedResponse !== answerContent) {
    answerContent = sanitizedResponse;
    finalParts = [
      ...draft.assistantParts.filter((part) => part.type === 'thinking'),
      { type: 'text', content: sanitizedResponse, createdAt: Date.now() },
    ];
  }
  // ...
```

**Tier 1 change:** The `response` is the raw model response which still contains protocol. Keep the sanitize but add a comment marking this as Tier-3 TODO.

Actually, `buildFinal` receives the full model response from the tool loop (`agentTurn.finalContent` in AIChat.tsx line 6257). This is the already-sanitized visible text from the tool loop (see line 371: `const roundVisibleText = sanitizeAgentVisibleText(assistantContent)`). So the sanitize in `buildFinal` is redundant when coming from the tool loop path.

But `buildFinal` might be called with unsanitized text from other paths (direct chat flow). So we should keep the sanitize guard but simplify it.

Leave `buildFinal` as-is for now; it will be cleaned up in Tier 3.

### Step 1.5: Enable streaming tool execution from splitter events

In the tool loop, when the splitter emits a `tool_call` event, execute it immediately if it's a fast-track tool. This makes the streaming splitter replace `createStreamingToolDetector` for tool detection.

```typescript
// In streamAwareOnEvent:
if (splitEvent.kind === 'tool_call') {
  if (STREAM_EXECUTION_TOOLS.has(splitEvent.name)) {
    const call: ToolCall = {
      id: splitEvent.id,
      name: splitEvent.name,
      input: splitEvent.input,
    };
    const promise = executeSingleTool(call).then(({ step, result }) => {
      streamExecutedResults.push({ call, step, result });
      toolCalls.push(step);
      emitToolCallsChange(options, toolCalls);
    });
    streamExecutionPromises.push(promise);
  }
}
```

### Verification (Tier 1)

```bash
# Existing tests must still pass
node --test tests/ai/runtime-tool-loop.test.mjs
node --test tests/ai/agent-event-dispatch.test.mjs

# Manual: start dev server and verify streaming text no longer shows tool protocol
npm run dev
```

---

## Tier 2: Extend AITextStreamEvent with tool_call kind

Add `tool_call` as a proper event kind in `AITextStreamEvent`. Anthropic provider emits structured `tool_call` events from SSE content blocks. The streaming splitter from Tier 1 is promoted to the normalizer for text-only providers.

**Files:**
- Modify: `src/modules/ai/core/AIService.ts`
- Modify: `src/components/workspace/tools.ts` (optional, splitter import)
- Modify: `src/modules/ai/runtime/tools/runtimeToolLoop.ts`

### Step 2.1: Extend AITextStreamEvent type

**File**: `src/modules/ai/core/AIService.ts` line 100-104

**Current:**
```typescript
export type AITextStreamEvent = {
  kind: 'thinking' | 'text';
  delta: string;
  finishReason?: 'stop' | 'length' | 'tool_use' | 'content_filter';
};
```

**Change to:**
```typescript
export type AITextStreamEvent = {
  kind: 'thinking' | 'text' | 'tool_call';
  delta: string;
  toolCall?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
  finishReason?: 'stop' | 'length' | 'tool_use' | 'content_filter';
};
```

### Step 2.2: Anthropic reader emits tool_call events

**File**: `src/modules/ai/core/AIService.ts` — `readAnthropicStream` method (line 751-785)

Add handling for Anthropic SSE `content_block_start` events with type `tool_use`:

```typescript
private async readAnthropicStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: AITextStreamEvent) => void
): Promise<string> {
  const text = await this.readEventStream(body, onEvent, (data) => {
    const json = JSON.parse(data);
    const type = json?.type as string | undefined;

    // message_delta carries stop_reason
    if (type === 'message_delta') {
      const stopReason = json?.delta?.stop_reason as string | undefined;
      if (stopReason && stopReason !== 'end_turn') {
        onEvent({ kind: 'text', delta: '', finishReason: stopReason as AITextStreamEvent['finishReason'] });
      }
      return [];
    }

    // content_block_start with tool_use — emit tool_call event
    if (type === 'content_block_start') {
      const block = json?.content_block;
      if (block?.type === 'tool_use' && block.id && block.name) {
        onEvent({
          kind: 'tool_call',
          delta: '',
          toolCall: {
            id: block.id,
            name: block.name,
            input: block.input || {},
          },
        });
      }
      return [];
    }

    // content_block_delta for input_json — accumulate tool call input
    if (type === 'content_block_delta') {
      const delta = json?.delta;
      if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        // We don't emit per-delta events; the full input is in content_block_start
        return [];
      }
    }

    const delta = json?.delta;
    if (!delta || typeof delta !== 'object') {
      return [];
    }

    if (delta.type === 'thinking_delta') {
      return this.buildEventList('thinking', typeof delta.thinking === 'string' ? delta.thinking : '');
    }

    if (delta.type === 'text_delta') {
      return this.buildEventList('text', typeof delta.text === 'string' ? delta.text : '');
    }

    return [];
  });

  return text.answer;
}
```

Note: This requires Anthropic API calls to include the `tools` parameter. Otherwise the API won't return structured `tool_use` blocks.

**To enable structured tool calls for Anthropic**, the `callAnthropic` method must pass tool definitions:

```typescript
body: JSON.stringify({
  model: this.config.model,
  max_tokens: this.config.maxTokens,
  temperature: this.config.temperature,
  system: systemPrompt,
  stream: Boolean(onEvent),
  messages: anthropicMessages,
  // Add tools parameter when tools are configured
  tools: this.buildAnthropicTools(),
}),
```

Add a helper method to `AIService`:
```typescript
private buildAnthropicTools(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  // Convert internal tool definitions to Anthropic format
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(tool.parameters).map(([key, param]) => [
          key,
          { type: param.type, description: param.description },
        ])
      ),
      required: tool.required,
    },
  }));
}
```

This is a bigger change because it affects the prompt format: the system prompt no longer needs XML tool protocol instructions when using native tool calls.

### Step 2.3: Use tool_call events in the tool loop

**File**: `src/modules/ai/runtime/tools/runtimeToolLoop.ts`

When `onModelEvent` receives a `tool_call` event and the provider is Anthropic (or any provider emitting structured tool calls), the tool loop should:
1. Not call `parseToolCalls()` on the response — tool calls already arrived via events
2. For text-only providers, fall back to `parseToolCalls()` as before

```typescript
// In the tool loop, track received tool calls from events:
const eventToolCalls: ToolCall[] = [];

// In streamAwareOnEvent:
if (event.kind === 'tool_call' && event.toolCall) {
  eventToolCalls.push({
    id: event.toolCall.id,
    name: event.toolCall.name,
    input: event.toolCall.input,
  });
  // Execute if fast-track eligible
  if (STREAM_EXECUTION_TOOLS.has(event.toolCall.name)) {
    const promise = executeSingleTool({
      id: event.toolCall.id,
      name: event.toolCall.name,
      input: event.toolCall.input,
    }).then(({ step, result }) => { /* same as current stream execution */ });
    streamExecutionPromises.push(promise);
  }
}
```

After `callModel` completes, determine tool calls from either source:
```typescript
// Tool calls: prefer event-emitted (Anthropic structured), fall back to text parsing
const parsedCalls = eventToolCalls.length > 0
  ? eventToolCalls
  : parseToolCalls(assistantContent);
```

### Verification (Tier 2)

```bash
node --test tests/ai/runtime-tool-loop.test.mjs
node --test tests/ai/agent-event-dispatch.test.mjs

# Start dev server and test with both Anthropic and OpenAI-compatible providers
npm run dev
```

---

## Tier 3: Remove regex cleaning from text path

With Tiers 1 and 2 ensuring no protocol text enters the text stream, remove the regex cleaning code.

**Files:**
- Modify: `src/modules/ai/runtime/dispatch/agentEvents.ts`
- Modify: `src/components/workspace/aiChatMessageParts.ts`
- Modify: `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`

### Step 3.1: Simplify sanitizeAgentVisibleText

**File**: `src/modules/ai/runtime/dispatch/agentEvents.ts`

Either remove `sanitizeAgentVisibleText` entirely (if all callers are cleaned up) or reduce it to a no-op identity function:

```typescript
// Before removal, verify all callers:
// 1. runtimeToolLoop.ts line 371 — sanitizeAgentVisibleText(assistantContent)
// 2. agentTurnRunner.ts line 284 — sanitizeStreamingVisibleText alias
// 3. aiChatMessageParts.ts line 53 — called by cleanVisibleAssistantText

// If Tier 1+2 make (1) and (2) redundant, but (3) is still needed for
// direct-chat and embedded prompts that bypass the tool loop:
export const sanitizeAgentVisibleText = (value: string) => {
  // Minimal cleaning: only trim whitespace and collapse blank lines
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
```

### Step 3.2: Remove RAW_INTERNAL_PROTOCOL_LINE_PATTERN

**File**: `src/components/workspace/aiChatMessageParts.ts`

Remove the aggressive `RAW_INTERNAL_PROTOCOL_LINE_PATTERN` (lines 45-46) and simplify `cleanVisibleAssistantText`:

```typescript
// Remove:
const RAW_INTERNAL_PROTOCOL_LINE_PATTERN =
  /^.*(?:DSML|tool_calls>|invoke name=|parameter name=|string="true"|string="false"|<tool name=|<\/tool>|<tool_params>|<\/tool_params>|<bash>|<\/bash>|<cmd>|<\/cmd>).*\s*$/gim;

// Simplify cleanVisibleAssistantText:
export const cleanVisibleAssistantText = (content: string) =>
  sanitizeAgentVisibleText(
    content
      .replace(RAW_DSML_TOOL_BLOCK_PATTERN, '')
      .replace(RAW_APPLY_SKILL_BLOCK_PATTERN, '')
      .replace(RAW_BARE_TOOL_BLOCK_PATTERN, '')
      .replace(RAW_LEGACY_BASH_BLOCK_PATTERN, '')
      .replace(RAW_INTERNAL_SKILL_LINE_PATTERN, '')
      // RAW_INTERNAL_PROTOCOL_LINE_PATTERN removed — no longer needed
  );
```

### Step 3.3: Clean up streaming assembler

**File**: `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`

- Remove line 284: `const sanitizeStreamingVisibleText = sanitizeAgentVisibleText;`
- Remove line 285: `const sanitizeStreamingThinkingText = sanitizeAgentVisibleText;`
- In `buildDraft`: remove sanitize calls (already done in Step 1.3)
- In `buildFinal`: remove the `sanitizedResponse` comparison/fallback logic, since the draft's answerContent is already the same as the final content

### Verification (Tier 3)

```bash
# Full test suite
node --test tests/ai/*.test.mjs

# Full build
npm run build
```

---

## Summary

| Tier | Change | Risk | Effect |
|---|---|---|---|
| 1 | Add streaming splitter, apply in tool loop | Low | Fixes current bug fast, no API changes |
| 2 | Extend AITextStreamEvent, Anthropic native tool calls | Medium | Future-proof, provider-specific optimization |
| 3 | Remove regex cleaning code | Medium | Final cleanup, eliminates dual-regex inconsistency |

The tiers are ordered by risk and deployability. Tier 1 alone fixes the reported bug. Tier 2+3 are architectural improvements that make the regex removal safe.
