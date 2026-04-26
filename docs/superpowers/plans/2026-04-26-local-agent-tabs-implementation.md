# Local Agent Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct Claude, Codex, and built-in AI tabs to the chat shell, with Claude/Codex opening their native local CLI interfaces.

**Architecture:** Keep existing HTTP AI provider behavior unchanged for the built-in AI tab. Add a small chat agent module for tab metadata, then add a Tauri command that launches trusted local agent CLIs from the active project directory. The chat component stores the selected tab as UI state and shows a native-interface launcher for Claude/Codex.

**Tech Stack:** React, Zustand-backed chat state, TypeScript, Tauri v2 Rust commands, Node test runner.

---

### Task 1: Agent Metadata and Result Helpers

**Files:**
- Create: `src/modules/ai/chat/chatAgents.ts`
- Test: `tests/ai/local-agent-tabs.test.mjs`

- [ ] **Step 1: Write failing tests for three direct agents and local result mapping**

Create `tests/ai/local-agent-tabs.test.mjs` with assertions that `CHAT_AGENTS` exposes exactly `claude`, `codex`, and `built-in`, and that `normalizeLocalAgentResult` maps success, failure, and empty output.

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test tests/ai/local-agent-tabs.test.mjs`
Expected: FAIL because `src/modules/ai/chat/chatAgents.ts` does not exist.

- [ ] **Step 3: Implement the minimal module**

Create `src/modules/ai/chat/chatAgents.ts` with `ChatAgentId`, `CHAT_AGENTS`, `LocalAgentCommandResult`, and `normalizeLocalAgentResult`.

- [ ] **Step 4: Run the test to verify GREEN**

Run: `node --test tests/ai/local-agent-tabs.test.mjs`
Expected: PASS.

### Task 2: Tauri Local Agent Interface Launcher

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Test: `tests/ai/local-agent-runtime-source.test.mjs`

- [ ] **Step 1: Write failing source tests for the Tauri command**

Create `tests/ai/local-agent-runtime-source.test.mjs` asserting `open_local_agent_interface`, `LocalAgentParams`, `LocalAgentResult`, trusted agent matching, project-root current directory execution, and command registration.

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test tests/ai/local-agent-runtime-source.test.mjs`
Expected: FAIL because the Tauri command does not exist.

- [ ] **Step 3: Implement the Rust command**

Add `LocalAgentParams`, `LocalAgentResult`, `build_local_agent_interface_command`, and `open_local_agent_interface`. Support only `claude` and `codex`, launch a visible terminal from `project_root`, and register the command.

- [ ] **Step 4: Run the test to verify GREEN**

Run: `node --test tests/ai/local-agent-runtime-source.test.mjs`
Expected: PASS.

### Task 3: Chat Top Tabs and Native Interface

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Test: `tests/ai/local-agent-tabs-ui.test.mjs`

- [ ] **Step 1: Write failing source tests for UI tabs and native interface launch**

Create `tests/ai/local-agent-tabs-ui.test.mjs` asserting the chat component imports `CHAT_AGENTS`, renders top `chat-shell-agent-tabs`, calls `open_local_agent_interface` for Claude/Codex, and keeps `aiService.completeText` for `built-in`.

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test tests/ai/local-agent-tabs-ui.test.mjs`
Expected: FAIL because the UI has no top agent tabs.

- [ ] **Step 3: Implement minimal UI and routing**

Add selected agent state, render three tab buttons above the chat body, show a native-interface launcher for Claude/Codex, and leave the built-in AI chat flow unchanged.

- [ ] **Step 4: Add compact CSS**

Add stable, compact tab styles near the composer without changing the settings drawer.

- [ ] **Step 5: Run the UI test to verify GREEN**

Run: `node --test tests/ai/local-agent-tabs-ui.test.mjs`
Expected: PASS.

### Task 4: Verification

**Files:**
- Existing tests only

- [ ] **Step 1: Run focused AI tests**

Run: `node --test tests/ai/local-agent-tabs.test.mjs tests/ai/local-agent-runtime-source.test.mjs tests/ai/local-agent-tabs-ui.test.mjs tests/ai/ai-service.test.mjs`
Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS.
