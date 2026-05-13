# Agent And Wiki AI Chat Content Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one shared embedded chat content frame so the Agent shell and Wiki-side AI chat use the same width boundary for messages, thinking, tool execution, and the composer.

**Architecture:** Keep this entirely in the UI composition layer. `AIWorkspace.tsx` and `AgentChatStage.tsx` already converge on the same embedded `AIChat` shell, so the durable fix is to introduce a shared content frame in the embedded chat composition, then make message lanes and tool-trace internals size themselves relative to that frame instead of owning width independently.

**Tech Stack:** TypeScript, React, CSS, Node test runner

---

## Root Cause

The current embedded chat width is still split across multiple layers:

1. `AIWorkspace.tsx` and `AgentChatStage.tsx` both provide the correct `.gn-agent-workspace` host, so the host entry point is already shared.
2. `AIChat.css` gives the composer its own centered width via `.chat-composer-shell`.
3. `GNAgentMessageItem.tsx` gives each message its own centered width via `.chat-message-content-frame`.
4. Tool execution rows inside the compact trace still contain inner flex rows that can size to content and force overflow if they are not explicitly wrapped.

That means there is no single embedded “chat content frame” that owns the width contract for both the scroll area and the composer. The fix needs one shared frame in the embedded chat structure, then child lanes should be `width: 100%` within that frame.

## File Structure

- Modify: `src/components/workspace/AIChat.tsx`
  - Add the shared embedded chat content frame around the conversation region and composer for embedded chat.
- Modify: `src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx`
  - Add an inner message-list frame so the scroll container can remain full-height while message content is centered inside one shared lane.
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
  - Make assistant and user message content size against the shared list frame instead of being a second competing width owner.
- Modify: `src/components/workspace/AIChat.css`
  - Move width ownership to the shared embedded content frame and message-list frame; make tool-trace and composer internals shrink and wrap inside it.
- Modify: `tests/ai/agent-workbench-layout.test.mjs`
  - Lock the shared host/frame/layout contract.
- Modify: `tests/ai/gn-agent-message-item.test.mjs`
  - Lock the new message frame behavior.
- Modify: `tests/ai/ai-chat-runtime-output-flow.test.mjs`
  - Lock runtime/tool-output sizing against the shared embedded frame.

### Task 1: Add The Shared Embedded Chat Content Frame

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx`
- Test: `tests/ai/agent-workbench-layout.test.mjs`

- [ ] **Step 1: Write failing source assertions for the new shared frame**

```js
assert.match(aiChatSource, /className="chat-embedded-content-frame"/);
assert.match(messageListSource, /className="chat-message-list-frame"/);
assert.match(aiWorkspaceSource, /gn-agent-workspace/);
assert.match(agentChatStageSource, /gn-agent-workspace/);
```

- [ ] **Step 2: Run the focused layout test to verify it fails**

Run: `node --test tests/ai/agent-workbench-layout.test.mjs`
Expected: FAIL because the shared embedded frame classes do not exist yet.

- [ ] **Step 3: Add the outer embedded content frame in `AIChat.tsx`**

```tsx
{showExpandedShell ? (
  <>
    {isEmbedded ? (
      <div className="chat-embedded-content-frame">
        {agentChatContent}
        <GNAgentEmbeddedComposer
          topContent={...}
          toolbarStartContent={...}
          input={input}
          setInput={setInput}
          onInputChange={handleInputChange}
          textareaRef={textareaRef}
          onKeyDown={handleKeyDown}
          placeholder={getComposerPlaceholder(isRuntimeConfigured)}
          agentStatusLabel={isGNAgentEmbedded ? selectedAgent.label : undefined}
          selectedRuntimeLabel={selectedRuntimeConfig ? selectedRuntimeConfig.name : '未启用 AI'}
          contextUsageLabel={`${currentContextUsage.usedLabel} / ${currentContextUsage.limitLabel}`}
          contextUsageWarning={currentContextUsage.ratio >= 0.8}
          runStateLabel={isGNAgentEmbedded ? runStateLabel : undefined}
          runStateTone={isGNAgentEmbedded ? runStateTone : undefined}
          isLoading={isLoading}
          disabled={!input.trim() && !isLoading}
          onSubmit={isLoading ? handleStopGeneration : () => { void handleSubmit(); }}
          SendIcon={isLoading ? PauseIcon : SendIcon}
        />
      </div>
    ) : (
      <>
        {agentChatContent}
        <form className="chat-composer" onSubmit={handleSubmit}>...</form>
      </>
    )}
  </>
) : ...}
```

- [ ] **Step 4: Add the inner message-list frame in `GNAgentEmbeddedPieces.tsx`**

```tsx
<div ref={listRef} className="chat-message-list">
  <div className="chat-message-list-frame">
    {leadingContent}
    {shouldFold ? (
      <details className="chat-message-list-fold">...</details>
    ) : null}
    {messages.slice(foldCount).map(renderMessageItem)}
    <div ref={messagesEndRef} />
  </div>
</div>
```

- [ ] **Step 5: Run the focused layout test again**

Run: `node --test tests/ai/agent-workbench-layout.test.mjs`
Expected: PASS for the new structural frame assertions.

### Task 2: Move Width Ownership To The Shared Frame

**Files:**
- Modify: `src/components/workspace/AIChat.css`
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- Test: `tests/ai/gn-agent-message-item.test.mjs`
- Test: `tests/ai/agent-workbench-layout.test.mjs`

- [ ] **Step 1: Write failing assertions for frame-owned width**

```js
assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-embedded-content-frame\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;/);
assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-message-list-frame\s*\{[\s\S]*?width:\s*var\(--gn-agent-content-width\);[\s\S]*?margin-inline:\s*auto;/);
assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-composer-shell\s*\{[\s\S]*?width:\s*100%;/);
assert.match(messageItemSource, /className="chat-message-content-frame chat-message-content-frame-assistant"/);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `node --test tests/ai/gn-agent-message-item.test.mjs tests/ai/agent-workbench-layout.test.mjs`
Expected: FAIL because width is still split between message items and composer shell.

- [ ] **Step 3: Make the embedded frame the shared width authority in `AIChat.css`**

```css
.gn-agent-workspace .chat-shell-embedded .chat-embedded-content-frame {
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
}

.gn-agent-workspace .chat-shell-embedded .chat-message-list-frame,
.gn-agent-workspace .chat-shell-embedded .chat-composer-shell {
  width: var(--gn-agent-content-width);
  max-width: 100%;
  min-width: 0;
  margin-inline: auto;
  box-sizing: border-box;
}
```

- [ ] **Step 4: Convert message items to fill the shared frame instead of centering themselves independently**

```css
.gn-agent-workspace .chat-shell-embedded .chat-message-content-frame {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-inline: 0;
  box-sizing: border-box;
}
```

```tsx
<div className="chat-message-content-frame chat-message-content-frame-assistant">
  ...
</div>
```

Keep the frame class in `GNAgentMessageItem.tsx`, but treat it as a lane wrapper inside the shared list frame, not as the top-level width owner.

- [ ] **Step 5: Keep user bubbles, thinking, final answer, and timeline cards width-relative to the shared frame**

```css
.gn-agent-workspace .chat-shell-embedded .chat-message-process-inline,
.gn-agent-workspace .chat-shell-embedded .chat-message-thinking-lane,
.gn-agent-workspace .chat-shell-embedded .chat-message-final-answer,
.gn-agent-workspace .chat-shell-embedded .chat-message-card-lane,
.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-stream,
.gn-agent-workspace .chat-shell-embedded .chat-message.assistant .chat-message-bubble,
.gn-agent-workspace .chat-shell-embedded .chat-message.user .chat-message-bubble {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
```

- [ ] **Step 6: Run the focused tests**

Run: `node --test tests/ai/gn-agent-message-item.test.mjs tests/ai/agent-workbench-layout.test.mjs`
Expected: PASS

### Task 3: Compress Tool Execution And Composer Internals Inside The Shared Frame

**Files:**
- Modify: `src/components/workspace/AIChat.css`
- Test: `tests/ai/ai-chat-runtime-output-flow.test.mjs`
- Test: `tests/ai/agent-workbench-layout.test.mjs`

- [ ] **Step 1: Write failing assertions for overflow-prone inner rows**

```js
assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-tool-trace-inline-summary\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-tool-trace-stream\.compact\s+\.chat-tool-trace-group-main,[\s\S]*?\.chat-tool-trace-detail-line\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-composer-runtime-strip\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
assert.match(css, /\.gn-agent-workspace\s+\.chat-shell-embedded\s+\.chat-selected-reference-chips-embedded\s*\{[\s\S]*?max-width:\s*100%;/);
```

- [ ] **Step 2: Run the runtime output tests to verify they fail**

Run: `node --test tests/ai/ai-chat-runtime-output-flow.test.mjs tests/ai/agent-workbench-layout.test.mjs`
Expected: FAIL because tool trace and embedded composer internals are not fully frame-relative yet.

- [ ] **Step 3: Make tool trace internals shrink and wrap inside the shared frame**

```css
.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-inline-summary,
.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-inline-copy,
.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-stream.compact .chat-tool-trace-group-copy,
.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-stream.compact .chat-tool-trace-line-copy,
.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-stream.compact .chat-tool-trace-group-main,
.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-stream.compact .chat-tool-trace-detail-line {
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
}

.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-inline-copy strong,
.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-inline-copy span,
.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-stream.compact .chat-tool-trace-group-copy strong,
.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-stream.compact .chat-tool-trace-line-copy span {
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 4: Make embedded composer internals obey the same frame**

```css
.gn-agent-workspace .chat-shell-embedded .chat-composer-embedded-input,
.gn-agent-workspace .chat-shell-embedded .chat-selected-reference-chips-embedded,
.gn-agent-workspace .chat-shell-embedded .chat-composer-runtime-strip,
.gn-agent-workspace .chat-shell-embedded .chat-composer-embedded-toolbar,
.gn-agent-workspace .chat-shell-embedded .chat-composer-embedded-toolbar-start {
  min-width: 0;
  max-width: 100%;
}

.gn-agent-workspace .chat-shell-embedded .chat-composer-runtime-strip,
.gn-agent-workspace .chat-shell-embedded .chat-selected-reference-chips-embedded {
  flex-wrap: wrap;
}
```

- [ ] **Step 5: Constrain `pre`/code blocks without hiding content**

```css
.gn-agent-workspace .chat-shell-embedded .chat-tool-command,
.gn-agent-workspace .chat-shell-embedded .chat-tool-output,
.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-step pre,
.gn-agent-workspace .chat-shell-embedded .chat-tool-trace-member pre,
.gn-agent-workspace .chat-shell-embedded .chat-runtime-approval-pre {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  white-space: pre-wrap;
  word-break: break-word;
}
```

- [ ] **Step 6: Run the runtime output tests**

Run: `node --test tests/ai/ai-chat-runtime-output-flow.test.mjs tests/ai/agent-workbench-layout.test.mjs`
Expected: PASS

### Task 4: Full Regression Verification And Graph Refresh

**Files:**
- Modify: `tests/ai/agent-workbench-layout.test.mjs`
- Modify: `tests/ai/gn-agent-message-item.test.mjs`
- Modify: `tests/ai/ai-chat-runtime-output-flow.test.mjs`

- [ ] **Step 1: Run the targeted regression suite**

Run: `node --test tests/ai/gn-agent-message-item.test.mjs tests/ai/agent-workbench-layout.test.mjs tests/ai/assistant-message-output-model.test.mjs tests/ai/assistant-render-model.test.mjs tests/ai/gn-agent-message-flow-source.test.mjs tests/ai/ai-chat-runtime-output-flow.test.mjs`
Expected: PASS

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Refresh graphify**

Run: `graphify update .`
Expected: graph refresh completes; existing graph warnings are recorded only if they are unchanged.

## Self-Review

- **Spec coverage:** This plan fixes width ownership at the shared embedded chat frame, covers both host entries (`AIWorkspace.tsx` and `AgentChatStage.tsx`), and explicitly addresses the two recurring overflow classes: tool execution internals and embedded composer internals.
- **Placeholder scan:** No task says “adjust later” or “add appropriate styles”; each task names the files, the contract to enforce, and the commands to verify it.
- **Type consistency:** All proposed class names are used consistently across tasks: `chat-embedded-content-frame`, `chat-message-list-frame`, and `chat-message-content-frame`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-13-agent-wiki-ai-chat-content-frame-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
