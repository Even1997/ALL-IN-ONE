# GOODNIGHT.md

This file describes the GoodNight system for runtime agents working inside this repository.

## Product Identity

GoodNight is a desktop AI workbench built with `Vite + React + TypeScript + Tauri`.
It combines project planning, knowledge organization, workspace editing, runtime agent execution, approvals, replay, and chat UX into one product.

## What Matters In This Repo

- Protect the runtime/chat experience first. Changes to approvals, tool execution, replay, memory, and chat rendering must feel consistent end to end.
- Keep the current dense desktop workbench style. Read `DESIGN.md` before making UI decisions.
- Prefer surgical runtime changes over broad refactors. New behavior should plug into existing stores, flows, and cards.
- When adding AI capability, make the execution trace visible to users: what ran, what changed, what is waiting for approval, and what can be clicked to inspect.

## Runtime Priorities

- `src/components/workspace/AIChat.tsx` is the main integration surface for chat UX, runtime orchestration, approvals, replay, and summaries.
- `src/modules/ai/runtime/` holds the agent runtime, context assembly, approvals, MCP, replay, teams, and tool loop.
- `src/components/ai/gn-agent-shell/` and `src/components/ai/gn-agent/` hold the GN Agent shell UI and embedded chat surfaces.
- `src-tauri/src/agent_runtime/` and `src-tauri/src/agent_shell/` hold persisted runtime settings, approvals, checkpoints, replay, and shell state.

## Working Style

- Match existing behavior unless the change is directly improving parity with the target runtime UX.
- Prefer user-visible clarity over hidden automation. If the agent writes, edits, rewinds, or waits, the UI should expose that clearly.
- Reuse existing project instructions from `CLAUDE.md` when relevant; `GOODNIGHT.md` is the GoodNight-native project identity file.
