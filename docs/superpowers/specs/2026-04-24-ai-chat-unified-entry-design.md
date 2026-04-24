# AI Chat Unified Entry Design

## Summary

This design changes the Phase 1 AI experience from an explicit AI workspace into a unified AI input pattern shared across the product. Users should only need to describe goals, requirements, revisions, and approvals through a floating input bar that matches the design workbench interaction style. The system should hide the underlying workflow stages and use the right-side workspace only to display and edit the current artifact plus the current AI status.

The implementation should also connect real external AI providers for both `openai-compatible` and `anthropic`. There should be no local fallback when credentials are missing. If AI is not configured, the product must clearly show that AI is unavailable and guide the user to configure their own provider and key.

## Goals

- Make the unified floating AI input the only primary entry point for requirement intake and ideation.
- Hide workflow terminology such as `requirements_spec`, `feature_tree`, and `wireframes` from end users.
- Preserve the existing structured Phase 1 artifact pipeline internally.
- Support real provider calls for both `openai-compatible` and `anthropic`.
- Make provider setup usable for other users by supporting connection test and model discovery without bundling any built-in key.

## Non-Goals

- No local simulation or fallback responses when no API key is configured.
- No backend proxy or key escrow in this phase.
- No new multi-page AI dashboard as a separate primary workflow.
- No Phase 2 code-generation workflow beyond the existing Phase 1 artifact scope.

## Product Principles

- Users interact with AI through one continuous input pattern.
- The system may have an internal workflow, but the workflow is not the UI.
- The floating input drives progress, confirmation, and rollback.
- The right-side workspace displays the current artifact plus lightweight AI status and result cards.
- Unconfigured AI must fail closed rather than pretending to work.

## User Experience

### Main Interaction Model

The default user experience starts in the existing work surface, with a floating AI input bar anchored at the bottom in the same style as the design workbench prompt. The user can type a natural-language project brief immediately. The AI then asks follow-up questions one at a time when required, generates structured outputs in the background, and presents concise summaries in a right-side status area rather than a long chat transcript.

Whenever an artifact is generated or revised, the adjacent workspace updates to the most relevant editor or viewer. The floating input remains the place where the user says:

- what they want to build
- what should change
- whether a result is approved
- whether the system should go back and regenerate a prior artifact

### Artifact Presentation

The right-side status area should present the current result, rationale, and the next recommended action. The full artifact should appear in the workspace panel for editing. This keeps the user in one unified interaction loop while still allowing richer editing for requirements, feature trees, page structures, wireframes, and HTML prototypes.

The right-side AI area should behave more like a workbench status column than an IM-style conversation window. It should emphasize:

- the latest instruction summary
- the current processing state
- the latest result card
- confirmation and rollback actions
- actionable error messages

It should avoid becoming a full scrolling chat history.

### Confirmation Model

The AI must pause at meaningful checkpoints and ask for confirmation through the unified input and right-side status cards before moving on. The workspace is for inspection and editing, but it does not become the primary flow controller. The user should be able to confirm with natural instructions such as `continue`, `confirm`, `go back to page structure`, or `regenerate wireframes`.

### Layout Pattern

The product should standardize on one AI layout pattern across product, design, and later work surfaces:

- a floating input bar fixed near the bottom
- a right-side AI status and result column
- the main central work area reserved for the current domain surface

This preserves a consistent interface language and prevents the AI experience from looking like a separate chat product.

## System Design

### Conversation Layer

The unified floating input becomes the primary AI interaction surface. It is responsible for:

- capturing user intent from free-form chat
- rendering assistant replies and confirmation prompts
- showing configuration-required states
- emitting high-level workflow events such as `start_project`, `confirm_stage`, `revise_stage`, and `rollback_to_stage`

This interaction layer should not directly own artifact generation logic.

### Workflow Layer

The existing workflow engine remains, but it becomes an internal orchestration layer behind chat. It is responsible for:

- resolving the current internal stage
- building prompts for the active stage
- invoking the configured provider
- validating structured outputs
- saving results into existing domain stores
- deciding when to stop and wait for user confirmation

The internal Phase 1 stages remain:

- `project_brief`
- `requirements_spec`
- `feature_tree`
- `page_structure`
- `wireframes`
- `html_prototype`

These identifiers are internal only and should not be surfaced as product-facing navigation.

### Workspace Layer

The current AI workspace should be repurposed into a contextual right-side AI status area plus artifact workspace. It should display whichever artifact the current instruction is discussing. It is not a second AI entry point. It should support editing and preview, while the floating input remains responsible for initiation and progression.

### Global AI Panel

The current `AIPanel` should no longer be treated as the core AI experience. Its Phase 1 role is configuration and diagnostics:

- provider selection
- key entry
- base URL entry
- model selection
- custom headers
- connection test
- model list fetch

It may stay accessible as a settings surface, but it should not compete with the main chat-driven path.

## Provider Requirements

### Supported Providers

Phase 1 must support:

- `openai-compatible`
- `anthropic`

Both providers must work for:

- chat requests
- workflow generation requests
- connection testing
- model list retrieval

### Missing Configuration Behavior

If there is no valid provider configuration, AI must not return mock content. Instead:

- the floating input may remain visible
- send actions should produce a clear configuration-needed response
- workflow generation should not start
- the UI should direct the user to configure a provider

This avoids hidden developer keys, fake success states, or behavior that cannot be safely shared with other users.

## Data Flow

1. User sends a natural-language instruction through the floating AI input.
2. The AI interaction layer resolves whether the message starts, continues, confirms, revises, or rolls back work.
3. Workflow service loads current project context and active artifact state.
4. Workflow service calls the configured provider for the active internal stage.
5. Output is validated and written into the relevant project stores.
6. The right-side AI area posts a human-readable summary and next-step prompt.
7. Workspace updates to the newly active artifact.
8. User edits the artifact or sends another short instruction through the floating input.

## Error Handling

- Provider errors must be shown as real actionable errors, not replaced with simulated responses.
- Schema validation failures should stop the stage and report that regeneration or manual correction is needed.
- If a provider supports neither dynamic model discovery nor a compatible model-list endpoint, the UI should clearly degrade rather than implying full support.
- Stage progress must not silently advance after a failed generation.

## Testing

Phase 1 verification should cover:

- users can start a project from the floating AI input without entering a separate AI page
- generated artifacts appear in the workspace while summaries remain in the right-side AI area
- the floating input can confirm and continue to the next internal stage
- the floating input can request rollback or regeneration of an earlier artifact
- `openai-compatible` works for chat, workflow, test connection, and model listing
- `anthropic` works for chat, workflow, test connection, and model listing
- missing configuration blocks generation and shows a clear setup-required state
- no mock response path remains active when configuration is missing

## Open Decisions Resolved

- The unified floating AI input is the single user-facing entry point.
- The right-side AI area remains a status/result surface, not a full chat transcript.
- The workspace remains the artifact editor/viewer, not an AI control surface.
- Real provider integration is required for both supported providers.
- No local fallback is allowed when keys are missing.

## Implementation Boundary

This design intentionally prefers minimal architectural change:

- keep the existing workflow concepts and domain objects
- move initiation and control into the unified floating input
- downgrade or remove the separate AI tab as the primary path
- retain the settings panel for provider configuration

The goal of this phase is to make AI feel like one continuous product conversation, not to redesign the entire codebase.
