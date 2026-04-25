# Agent Orchestrator And UI Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a constrained Agent routing layer, simplify chat copy, and hide developer-only pages for now.

**Architecture:** Keep the existing chat/provider service, add a small `agent` layer that chooses internal / Claude / Codex-style execution intent, attaches skill permissions, and keeps writes behind confirmation-oriented constraints. UI changes stay surgical: shorter copy in chat and top navigation hides development/test/ops entries.

**Tech Stack:** React 19, TypeScript, Zustand, Node test runner, Vite.

---

### Task 1: Skill Registry And Agent Routing

**Files:**
- Create: `src/modules/ai/agent/skillRegistry.ts`
- Create: `src/modules/ai/agent/agentOrchestrator.ts`
- Modify: `src/modules/ai/workflow/skillRouting.ts`
- Test: `tests/ai/agent-orchestrator.test.mjs`

- [ ] **Step 1: Write failing tests**

Add tests that verify product skills prefer Claude, code-like requests prefer Codex, and writes require confirmation.

Run: `node --test tests/ai/agent-orchestrator.test.mjs`
Expected: FAIL because files do not exist.

- [ ] **Step 2: Implement registry and orchestrator**

Create skill manifests with `allowedTools`, `writePolicy`, `outputMode`, and provider preference. Implement `buildAgentRunPlan()` to return `provider`, `skill`, `constraints`, `allowedTools`, and `contextMode`.

Run: `node --test tests/ai/agent-orchestrator.test.mjs`
Expected: PASS.

### Task 2: Chat Prompt Uses Agent Plan

**Files:**
- Modify: `src/modules/ai/chat/directChatPrompt.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Test: `tests/ai/direct-chat-prompt.test.mjs`

- [ ] **Step 1: Write failing prompt tests**

Add tests that confirm prompt includes concise agent constraints and keeps writes as proposals.

Run: `node --test tests/ai/direct-chat-prompt.test.mjs`
Expected: FAIL until direct chat accepts `agentPlan`.

- [ ] **Step 2: Pass agent plan into chat prompt**

Build the agent run plan in `AIChat.tsx` and pass it to `buildDirectChatPrompt()`. Add compact `agent_plan` and `constraints` sections to the prompt.

Run: `node --test tests/ai/direct-chat-prompt.test.mjs`
Expected: PASS.

### Task 3: Shorter Chat Copy

**Files:**
- Modify: `src/components/workspace/aiChatViewState.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Test: `tests/ai/ai-chat-view-state.test.mjs`

- [ ] **Step 1: Write failing copy tests**

Assert welcome and placeholder text are short and do not mention every internal mode unless needed.

Run: `node --test tests/ai/ai-chat-view-state.test.mjs`
Expected: FAIL until copy is shortened.

- [ ] **Step 2: Simplify visible copy**

Use shorter labels such as `开始聊吧。`, `输入消息…`, `先配置 AI` and `自由聊天`.

Run: `node --test tests/ai/ai-chat-view-state.test.mjs`
Expected: PASS.

### Task 4: Hide Development Pages

**Files:**
- Create: `src/appNavigation.ts`
- Modify: `src/App.tsx`
- Test: `tests/app-navigation.test.mjs`

- [ ] **Step 1: Write failing navigation tests**

Assert visible role tabs are only `product` and `design` for now.

Run: `node --test tests/app-navigation.test.mjs`
Expected: FAIL until helper exists.

- [ ] **Step 2: Use navigation helper in App**

Render role tabs from `VISIBLE_ROLE_TABS`, leaving develop/test/operations render functions in code but unreachable from the header.

Run: `node --test tests/app-navigation.test.mjs`
Expected: PASS.

### Task 5: Final Verification

**Files:**
- All changed files

- [ ] **Step 1: Run focused tests**

Run: `node --test tests/ai/agent-orchestrator.test.mjs tests/ai/direct-chat-prompt.test.mjs tests/ai/ai-chat-view-state.test.mjs tests/app-navigation.test.mjs tests/ai/chat-context.test.mjs`
Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS. Existing Vite chunk-size warning is acceptable.
