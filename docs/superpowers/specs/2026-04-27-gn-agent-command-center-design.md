# GN Agent Command Center Design

Date: 2026-04-27

## Goal

Turn the current right-side AI chat into GN Agent: a visible agent command center that makes project AI capabilities discoverable, inspectable, and actionable without exposing the old Claudian product shell.

## Assumptions

- GN Agent is the product identity. Claude, Codex, or other runtimes may remain internal execution plugins, but they are not primary product modes.
- The first implementation is frontend-complete and backend-reuse: existing chat, workflow, knowledge organize, context, skills, activity, and model configuration paths should be reused where they exist.
- Capabilities that are not fully backend-complete yet should appear as honest frontend lanes with clear pending/empty states, not fake success.
- The right pane is a productivity workbench surface, so it should be dense, stable, and scannable rather than decorative.

## Product Model

GN Agent has six visible capability lanes:

1. Chat: the default natural-language agent conversation.
2. Tasks: current and recent agent runs, queued work, waiting confirmations, failures, and completed runs.
3. Artifacts: generated or changed docs, wiki entries, prototypes, UI output, and file paths.
4. Context: what GN Agent can currently read, including project, references, open knowledge docs, selected files, and token budget.
5. Skills: discoverable project skills such as organize, requirements, sketch, UI design, and change sync.
6. Activity: durable execution log for changed paths, runtime, skill, and timestamps.

## Layout

The right-side pane has three vertical layers:

- Top: agent identity, status, model/context pills, and lane tabs.
- Middle: active lane content.
- Bottom: Codex-like composer with context attach, skill shortcuts, model/context status, and send/stop controls.

The composer stays available across lanes so the user can issue follow-up instructions from any inspection view.

## Interaction Rules

- Chat is the default lane for new sessions.
- Clicking a skill should prefill the composer with its `@token` prompt.
- Clicking Context should expose the existing reference menu and context budget information.
- Clicking Tasks, Artifacts, or Activity should not navigate away from the agent; these are plugin-like panes inside the right rail.
- Runtime names can appear as technical details only where needed, but Claudian must not appear as a visible product label.

## Existing Code To Reuse

- `src/components/workspace/AIChat.tsx`: main conversation, model settings, context selection, workflow dispatch, local runtime dispatch.
- `src/components/workspace/AIChat.css`: right-pane styling.
- `src/modules/ai/workflow/skillRouting.ts`: explicit `@skill` routing.
- `src/modules/ai/workflow/AIWorkflowService.ts`: requirements/prototype/page workflow execution.
- `src/modules/ai/knowledge/runKnowledgeOrganizeLane.ts`: knowledge organize lane.
- `src/modules/ai/skills/activityLog.ts`: activity entry shape.
- `src/modules/ai/store/*`: chat, global config, context, and workflow state.

## Out Of Scope For This Pass

- A real multi-agent scheduler.
- True background worker isolation.
- Full change-sync backend implementation.
- Plugin marketplace or remote skill installation UX.
- Deleting all internal runtime abstractions in one sweep.

## Success Criteria

- The right pane identifies itself as GN Agent.
- The main agent lanes `Chat`, `Tasks`, `Artifacts`, `Context`, `Skills`, and `Activity` are visible and accessible.
- Existing chat messages and composer still work in the Chat lane.
- Skills are visible as first-class capabilities, not hidden in helper text.
- Artifacts and activity data already available in the chat layer are surfaced in dedicated panes.
- User-facing Claudian product labels are removed from the right-pane workspace.
- Targeted tests and `npm run build` pass after implementation.
