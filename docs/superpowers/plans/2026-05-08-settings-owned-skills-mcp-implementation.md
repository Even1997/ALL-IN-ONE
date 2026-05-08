# Settings-Owned Skills And MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Skills and MCP management into the existing AI settings drawer and remove the agent-owned management entry points.

**Architecture:** Reuse the current AIChat settings drawer as the single management surface by adding internal tabs for AI, Skills, and MCP. Keep runtime skill and MCP consumption unchanged, but route all human-facing management through settings and remove the dedicated Agent skills dialog.

**Tech Stack:** React, TypeScript, Zustand, Tauri commands, node:test

---

### Task 1: Lock The New UX In Tests

**Files:**
- Modify: `tests/ai/agent-workspace-page.test.mjs`
- Modify: `tests/ai/gn-agent-mode-switch-placement.test.mjs`
- Add: `tests/ai/ai-chat-settings-skills-mcp.test.mjs`

- [ ] **Step 1: Write the failing assertions for removed Agent skills entry points**
- [ ] **Step 2: Run the targeted tests and confirm they fail for the old behavior**
Run: `node --test tests/ai/agent-workspace-page.test.mjs tests/ai/gn-agent-mode-switch-placement.test.mjs tests/ai/ai-chat-settings-skills-mcp.test.mjs`
Expected: FAIL because Agent still opens the skills dialog and AIChat settings do not yet expose Skills/MCP tabs.

### Task 2: Move Skills Management Into Settings

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Reuse: `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
- Modify: `src/components/workspace/AIChat.css`

- [ ] **Step 1: Add settings-drawer tab state for `ai`, `skills`, and `mcp`**
- [ ] **Step 2: Render `GNAgentSkillsPage` inside the settings drawer when the Skills tab is active**
- [ ] **Step 3: Remove the embedded skills modal state and trigger button from AIChat**

### Task 3: Add A Settings-Owned MCP Management Page

**Files:**
- Add: `src/components/workspace/RuntimeMcpSettingsPage.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Modify: `src/modules/ai/runtime/mcp/runtimeMcpClient.ts`
- Modify: `src/modules/ai/runtime/mcp/runtimeMcpTypes.ts`
- Modify: `src/modules/ai/runtime/mcp/runtimeMcpStore.ts`
- Modify: `src-tauri/src/agent_runtime/types.rs`
- Modify: `src-tauri/src/agent_runtime/mcp_store.rs`
- Modify: `src-tauri/src/agent_runtime/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the MCP page component with list, select, create/edit, enable/disable, refresh, and delete actions**
- [ ] **Step 2: Extend the runtime MCP client/backend shape only as far as needed to persist editable custom server metadata**
- [ ] **Step 3: Keep the built-in `goodnight-skills` server protected from destructive edits while allowing it to remain visible in settings**

### Task 4: Remove Agent-Owned Management Entrypoints

**Files:**
- Modify: `src/features/agent-shell/pages/AgentShellPage.tsx`
- Modify: `src/features/agent-shell/components/AgentWorkbenchSidebar.tsx`

- [ ] **Step 1: Remove the Agent skills dialog and related state**
- [ ] **Step 2: Remove the sidebar skills action and associated props**
- [ ] **Step 3: Leave runtime Skills/MCP indicators intact so Agent still consumes configured capabilities**

### Task 5: Verify The Final Flow

**Files:**
- Modify as needed based on test feedback

- [ ] **Step 1: Re-run focused tests**
Run: `node --test tests/ai/agent-workspace-page.test.mjs tests/ai/gn-agent-mode-switch-placement.test.mjs tests/ai/ai-chat-settings-skills-mcp.test.mjs tests/ai/runtime-mcp-store.test.mjs tests/ai/runtime-mcp-flow.test.mjs`
Expected: PASS

- [ ] **Step 2: Run a broader regression slice**
Run: `node --test tests/ai/gn-agent-skills-page.test.mjs tests/ai/skill-library-source.test.mjs tests/ai/agent-runtime-skill-ui.test.mjs`
Expected: PASS
