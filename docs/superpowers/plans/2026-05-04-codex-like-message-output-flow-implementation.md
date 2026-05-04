# Codex-like Message Output Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the assistant message runtime trace so execution appears as a lightweight Codex-like step stream with collapsed-by-default details and dark/light theme support.

**Architecture:** Keep the existing runtime event model and helper functions, but change how `runtimeEventRenderModel`, `AIChatRuntimeToolExecutionCard`, and `AIChatRuntimeToolBlocks` summarize and display those events. The UI should show a compact step spine first, with one-step-at-a-time expansion for technical details, approvals, questions, and file changes.

**Tech Stack:** React 19, TypeScript, existing AI chat runtime helpers, CSS in `AIChat.css`, Node test runner

---

### Task 1: Lock the behavior with failing tests

**Files:**
- Create: `tests/ai/ai-chat-runtime-output-flow.test.mjs`
- Modify: `tests/ai/ai-chat-file-ops-ui.test.mjs`
- Test: `tests/ai/ai-chat-runtime-output-flow.test.mjs`

- [ ] **Step 1: Add a failing render-model grouping test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadRenderModel = async () =>
  import(`../../src/components/workspace/runtimeEventRenderModel.ts?test=${Date.now()}`);

test('runtime event render model groups repeated read operations into a compact label', async () => {
  const { buildRuntimeToolStreamModel } = await loadRenderModel();
  const model = buildRuntimeToolStreamModel([
    { id: '1', kind: 'tool_use', toolCallId: 'call-1', parentToolCallId: null, toolName: 'view', input: { file_path: 'src/App.tsx' }, status: 'completed' },
    { id: '2', kind: 'tool_use', toolCallId: 'call-2', parentToolCallId: null, toolName: 'grep', input: { pattern: 'chat-tool-trace' }, status: 'completed' },
    { id: '3', kind: 'tool_use', toolCallId: 'call-3', parentToolCallId: null, toolName: 'ls', input: { path: 'src/components/workspace' }, status: 'completed' },
  ]);

  assert.equal(model.items[0]?.kind, 'tool_group');
  assert.equal(model.items[0]?.groupLabel, '读取 3 个步骤');
});
```

- [ ] **Step 2: Add a failing source-level UI structure test**

```js
test('runtime tool blocks use compact step flow markup with explicit expandable detail regions', async () => {
  const [cardSource, blocksSource, cssSource] = await Promise.all([
    readFile(cardPath, 'utf8'),
    readFile(blocksPath, 'utf8'),
    readFile(cssPath, 'utf8'),
  ]);

  assert.match(cardSource, /chat-tool-trace-stream compact/);
  assert.match(blocksSource, /chat-tool-step-shell/);
  assert.match(blocksSource, /data-has-details/);
  assert.match(cssSource, /\.chat-tool-step-shell/);
  assert.match(cssSource, /\.chat-tool-step-detail/);
});
```

- [ ] **Step 3: Run the targeted test file and confirm it fails**

Run: `node --test tests/ai/ai-chat-runtime-output-flow.test.mjs`
Expected: FAIL because the new compact labels/classes/markup do not exist yet.

### Task 2: Implement the compact step stream

**Files:**
- Modify: `src/components/workspace/runtimeEventRenderModel.ts`
- Modify: `src/components/workspace/AIChatRuntimeToolExecutionCard.tsx`
- Modify: `src/components/workspace/AIChatRuntimeToolBlocks.tsx`

- [ ] **Step 1: Adjust event grouping labels to be product-facing**

```ts
const READ_TOOL_NAMES = new Set(['view', 'glob', 'grep', 'ls']);
const SEARCH_TOOL_NAMES = new Set(['grep', 'glob']);
const WRITE_TOOL_NAMES = new Set(['write', 'edit']);

const buildToolGroupLabel = (toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>) => {
  if (toolUses.length <= 1) {
    return undefined;
  }
  if (toolUses.every((toolUse) => READ_TOOL_NAMES.has(toolUse.toolName))) {
    return `读取 ${toolUses.length} 个步骤`;
  }
  if (toolUses.every((toolUse) => SEARCH_TOOL_NAMES.has(toolUse.toolName))) {
    return `搜索代码 ${toolUses.length} 次`;
  }
  if (toolUses.every((toolUse) => WRITE_TOOL_NAMES.has(toolUse.toolName))) {
    return `编辑 ${toolUses.length} 个文件`;
  }
  return `执行 ${toolUses.length} 个步骤`;
};
```

- [ ] **Step 2: Change the runtime trace container to advertise compact mode**

```tsx
return (
  <div className="chat-tool-trace-stream compact" data-runtime-trace="compact">
    {renderModel.items.map(...)}
  </div>
);
```

- [ ] **Step 3: Rebuild step/group/result blocks around a lightweight shell**

```tsx
<details
  className={`chat-tool-trace-step ${effectiveStatus}`}
  data-has-details={hasDetails ? 'true' : 'false'}
  open={isOpen}
>
  <summary className="chat-tool-step-shell">
    <span className={`chat-tool-step-dot ${effectiveStatus}`} aria-hidden="true" />
    <div className="chat-tool-trace-summary-copy">
      <strong>{headline}</strong>
      {previewText ? <span>{previewText}</span> : null}
    </div>
  </summary>
  {hasDetails ? <div className="chat-tool-step-detail">...</div> : null}
</details>
```

- [ ] **Step 4: Keep the technical details real, but deeper**

```tsx
{helpers.shouldShowRuntimeToolTechnicalDetails(...) ? (
  <details className="chat-tool-trace-detail-toggle">
    <summary>更多细节</summary>
    {Object.keys(toolUse.input).length > 0 ? <pre>{JSON.stringify(toolUse.input, null, 2)}</pre> : null}
    {resultEvent?.output?.trim() ? <pre className="chat-tool-trace-result">{resultEvent.output}</pre> : null}
  </details>
) : null}
```

- [ ] **Step 5: Run the targeted test file again**

Run: `node --test tests/ai/ai-chat-runtime-output-flow.test.mjs`
Expected: PASS

### Task 3: Restyle the message flow for dark and light themes

**Files:**
- Modify: `src/components/workspace/AIChat.css`
- Test: `tests/ai/ai-chat-runtime-output-flow.test.mjs`

- [ ] **Step 1: Add compact step flow styles without refactoring unrelated CSS**

```css
.chat-tool-trace-stream.compact {
  display: grid;
  gap: 6px;
}

.chat-tool-step-shell {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.chat-tool-step-dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--gn-agent-muted);
}

.chat-tool-step-detail {
  margin-left: 18px;
  display: grid;
  gap: 8px;
}
```

- [ ] **Step 2: Add light/dark token-aware status treatments**

```css
.chat-tool-step-dot.running {
  background: color-mix(in srgb, var(--gn-agent-text, #e8eaed) 72%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--gn-agent-text, #e8eaed) 10%, transparent);
}

.chat-tool-step-dot.failed,
.chat-tool-step-dot.blocked {
  background: #d65d5d;
}
```

- [ ] **Step 3: Verify the structure test still passes and run one existing regression check**

Run: `node --test tests/ai/ai-chat-runtime-output-flow.test.mjs tests/ai/ai-chat-file-ops-ui.test.mjs`
Expected: PASS
