# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm run dev          # Start Vite dev server (port 1420)
npm run build        # TypeScript compile + Vite production build
npm run tauri dev    # Start Tauri desktop app
npm run package:win  # Build Windows .exe via PowerShell script
```

Tests run against pre-compiled output in `dist-test/`. To run tests:
```bash
node --test tests/<path>/<file>.test.mjs
```

## Architecture

### AI Runtime System
The AI runtime is built around several coordinated flows in `src/modules/ai/runtime/`:
- **Orchestration layer** (`runtimeWorkflowFlow.ts`, `runtimeDirectChatFlow.ts`, `runtimeLocalAgentFlow.ts`) — routes user intent to appropriate execution path
- **Turn execution** (`agentTurnRunner.ts`) — manages queued/running/completed turn lifecycle
- **Context assembly** (`buildAgentContext.ts`) — aggregates project memory, thread history, and skill prompts into a single context budget
- **Approval coordination** (`runtimeApprovalCoordinator.ts`) — gates risky operations behind human confirmation

### GN-Agent System
The gn-agent lives in `src/modules/ai/gn-agent/` and bridges AI providers (Claude, Codex) to the shell environment. Key files:
- `runtime/claude/ClaudeRuntime.ts` and `runtime/codex/CodexRuntime.ts` — provider-specific execution
- `providers/claudeRegistration.ts` / `codexRegistration.ts` — provider plugin registration
- `gnAgentShellStore.ts` — global shell state management

### Rust Backend (`src-tauri/`)
Desktop commands are implemented in Rust:
- `agent_shell/` — shell-level context, session, and settings
- `agent_runtime/` — runtime-level context, memory, thread, replay, and MCP stores
- All Rust modules communicate via Tauri commands exposed to the frontend.

### Knowledge System
The knowledge graph is in `src/features/knowledge/` with workspace UI in `src/modules/ai/knowledge/`. Proposal flow: `buildKnowledgeProposal.ts` → `executeKnowledgeProposal.ts` → `runKnowledgeOrganizeLane.ts`.

## Design System

Read `DESIGN.md` before making visual or UI decisions. Key tokens:
- Typography: 13px base, `SF Pro Text` / `SF Mono` for code
- Radius: 6px (tiny) → 16px (dialog), 10px for buttons/inputs
- Spacing: 4px base unit, workbench gutters 10-12px
- Role accents: Knowledge `#007aff`, Wiki `#0891b2`, Page `#4f46e5`, Design `#c026d3`, Develop `#059669`, Test `#ea580c`

---

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Design System

Always read `DESIGN.md` before making visual or UI decisions. The project should keep its current-density macOS workbench style unless the user explicitly asks for a new direction.

Use `DESIGN.md` for font sizes, spacing, radius, shadows, colors, navigation states, and component behavior. In UI work, flag code that drifts from those rules instead of inventing new one-off styling.
