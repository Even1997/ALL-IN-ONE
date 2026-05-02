# GoodNight Agent Runtime Finish Plan

> Status refresh: updated after the latest runtime extraction and verification pass.

**Goal:** Finish the remaining Codex-like runtime gaps by hardening runtime settings persistence, extracting orchestration responsibilities out of the chat shell, and upgrading replay recovery into a more durable runtime recovery flow.

**Architecture:** Keep the current Tauri + React runtime shell, but finish the missing Phase 6-7 seams so the runtime resembles the official Codex layering more closely: policy/settings persistence in its own backend store, orchestration in dedicated runtime modules, and recovery built as a first-class replay consumer instead of just a UI-side prompt restore helper.

**Tech Stack:** Tauri, Rust, React 19, TypeScript, Zustand, Node test runner, existing GoodNight AI runtime modules, official Codex repository as implementation reference

---

## Current Status

| Finish Item | Phase | Status | Priority | Necessity | Difficulty | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Runtime settings store | Phase 7 | Completed | P0 | High | Medium | `settings_store.rs` exists and is covered by runtime source/build/Rust verification. |
| Turn orchestrator extraction | Phase 6-7 | Mostly completed | P0 | High | High | Workflow, MCP, direct-chat, local-agent, project-file, outcome shaping, and replay-aware execution helpers are extracted. `AIChat.tsx` still contains some side-effect orchestration glue. |
| Replay recovery hardening | Phase 7 | Mostly completed | P0 | High | Medium-High | Recovery state, resume-ready metadata, replay sync, and retry/resume labels exist. Remaining gap is richer UI controls beyond resume. |
| Runtime persistence tests | Phase 7 | Completed for current scope | P1 | Medium-High | Medium | Source tests and runtime verification cover settings, replay, MCP, approvals, and store flows currently implemented. |
| UI polish for runtime controls | Phase 6 | Partially completed | P1 | Medium | Medium | Thread list, timeline, memory, approvals, and resume indicators exist. `pause / retry / feed` UI is still not fully built out. |

## What Is Done

1. Runtime persistence is in place for threads, approvals, settings, memory, replay, and MCP history.
2. Context assembly, memory layering, skills, MCP invocation, approvals/sandbox, replay recovery, and runtime shell UI are all implemented.
3. `AIChat.tsx` no longer owns the core orchestration logic for:
   - workflow completion shaping
   - MCP parsing and result formatting
   - local-agent policy and prompt wrapping
   - project-file proposal gating
   - direct-chat request building and response normalization
   - execution outcome shaping
   - project-file execution tool flow
4. Verification currently passes with:
   - targeted Node runtime tests
   - `npm run build`
   - `cargo test --manifest-path src-tauri/Cargo.toml agent_runtime`

## Remaining Cleanup

1. Continue shrinking `src/components/workspace/AIChat.tsx` by moving the last side-effect coordination glue into runtime services/controllers.
2. Add richer runtime controls in the UI for `pause`, `retry`, and follow-up feed interactions.
3. Run a manual end-to-end UI dogfood pass over approvals, replay recovery, MCP, local-agent, and project-file flows.
4. Optionally address bundle-size warnings after functional work is fully settled.

## Recommended Next Order

1. Final orchestration glue cleanup in `AIChat.tsx`
2. Runtime controls UI pass
3. Manual QA pass
4. Optional performance/code-splitting cleanup
