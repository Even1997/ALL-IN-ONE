# Agent Timeline Event Protocol Design

Date: 2026-05-10
Status: Proposed
Owner: AI chat / runtime

## Summary

This design replaces the current mixed "assistant text + reasoning lane + runtime tool cards" rendering path with a canonical event architecture that is stable across providers, efficient for streaming, and suitable for a timeline-first assistant UX.

The goal is not to make logs prettier. The goal is to make agent output structurally stable:

- providers emit provider-specific events
- adapters normalize them into canonical events
- a timeline composer derives phase cards and message state
- the UI renders a fixed timeline model instead of raw mixed output

This project already contains strong foundations for the migration:

- runtime protocol package: `packages/runtime-protocol/src/index.ts`
- persisted chat store and timeline model: `src/modules/ai/store/aiChatStore.ts`
- assistant timeline state: `src/modules/ai/store/assistantTimeline.ts`
- runtime event render model: `src/components/workspace/runtimeEventRenderModel.ts`
- runtime interaction cards: `src/components/workspace/AIChatRuntimeInteractionCards.tsx`

The recommended end state is a protocol-first architecture:

1. provider/runtime emits raw events
2. adapter maps raw events to canonical events
3. canonical events are appended to an event log
4. composer incrementally builds a timeline projection
5. UI renders the projection with fixed rules

## Why Change

Current behavior mixes several concerns into the same visible stream:

- user-facing explanation
- internal reasoning/thinking
- tool execution detail
- tool failures and raw stderr
- final assistant answer

That causes four product problems:

1. the user sees multiple voices at once
2. the same failure is repeated in different forms
3. presentation stability depends too much on model phrasing
4. different providers and tools create inconsistent output shapes

For this app, that instability is already visible in the current type system:

- `RuntimeAssistantTimelineEvent` mixes `text`, `reasoning`, `tool_use`, `tool_result`, `approval`, `question`, and `error`
- `AssistantRenderModel` and `RuntimeEventRenderModel` split that mixed structure in the UI
- grouping logic currently happens close to rendering instead of at a dedicated semantic layer

The new design separates semantic events from UI composition.

## Product Goals

This design must satisfy all of the following:

1. support all agent conversations, not just coding sessions
2. preserve an assistant-like feel instead of a terminal/log feel
3. show timeline progress in chronological order
4. handle multiple providers and runtimes through adapters
5. stay efficient during streaming
6. support replay and persistence
7. let the UI render stable cards even if upstream payloads vary
8. allow AI-driven implementation with clear contracts and acceptance criteria

## Non-Goals

This design does not attempt to:

- expose raw chain-of-thought
- replay every token as a visible timeline node
- preserve old message rendering semantics exactly
- solve all team-run / multi-agent visual design in the first cut
- fully redesign approval and question UX beyond the new event model

## High-Level Architecture

The system is split into four permanent layers.

### 1. Runtime Layer

Responsible for generating raw activity:

- model stream events
- tool start / update / finish
- provider errors
- approval requests
- question requests
- retries
- run lifecycle

This layer does not decide how the UI should look.

### 2. Canonical Event Protocol

Responsible for normalizing all raw inputs into one internal event language.

This is the key abstraction boundary.

Rules:

- every provider or runtime must map into canonical events
- canonical events must be append-only
- canonical events must be provider-agnostic
- UI-specific display details must not leak into the protocol

### 3. Timeline Composer

Responsible for building an incremental projection:

- phase cards
- message stream state
- user-visible progress text
- tool detail references
- failure and retry summaries

The composer consumes canonical events and emits a render model. It does not render HTML/React directly.

### 4. UI Renderer

Responsible for showing:

- timeline cards
- assistant result area
- collapsible detail drawers
- approvals/questions
- error and retry states

The UI should consume the projection, not raw provider output.

## Canonical Event Protocol

### Design Principles

1. append-only
2. deterministic ordering within a turn
3. provider-agnostic core fields
4. optional provider metadata for debugging
5. no UI style fields
6. high-frequency events stay small
7. message records remain the conversation unit; canonical events become the process source of truth

### Core Event Shape

```ts
export type CanonicalEvent = {
  eventId: string
  runId: string
  turnId: string
  sessionId: string

  messageId?: string | null
  parentEventId?: string | null
  correlationId?: string | null

  type: CanonicalEventType
  ts: number
  seq: number
  status?: EventStatus

  source: EventSource
  payload: CanonicalEventPayload

  providerMeta?: Record<string, unknown>
}

export type EventStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked"

export type EventSource = {
  kind: "user" | "model" | "tool" | "system" | "runtime"
  provider?: string
  name?: string
}
```

`seq` ownership must be explicit. The writer that appends canonical events to the session event log is responsible for assigning a strictly increasing `seq` per `runId`. Adapters may suggest sequence order through raw arrival order, but they do not own durable sequencing.

### Canonical Event Types

```ts
export type CanonicalEventType =
  | "run.started"
  | "run.completed"
  | "message.started"
  | "message.delta"
  | "message.completed"
  | "progress.updated"
  | "tool.started"
  | "tool.stdout"
  | "tool.stderr"
  | "tool.completed"
  | "approval.requested"
  | "approval.resolved"
  | "question.requested"
  | "question.answered"
  | "retry.scheduled"
  | "warning.raised"
  | "error.raised"
```

### Event Payloads

```ts
export type CanonicalEventPayload =
  | RunStartedPayload
  | RunCompletedPayload
  | MessageStartedPayload
  | MessageDeltaPayload
  | MessageCompletedPayload
  | ProgressUpdatedPayload
  | ToolStartedPayload
  | ToolStreamPayload
  | ToolCompletedPayload
  | ApprovalRequestedPayload
  | ApprovalResolvedPayload
  | QuestionRequestedPayload
  | QuestionAnsweredPayload
  | RetryScheduledPayload
  | WarningRaisedPayload
  | ErrorRaisedPayload

export type RunStartedPayload = {
  providerId: string
  threadId?: string | null
  parentRunId?: string | null
  mode?: "chat" | "agent" | "team"
}

export type RunCompletedPayload = {
  outcome: "success" | "failed" | "cancelled"
  summary?: string
  tokenUsage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

export type MessageStartedPayload = {
  role: "assistant"
}

export type MessageDeltaPayload = {
  textChunk: string
}

export type MessageCompletedPayload = {
  finalText: string
}

export type ProgressUpdatedPayload = {
  label: string
  detail?: string
  scope?: "system" | "phase" | "tool"
  importance?: "low" | "normal" | "high"
}

export type ToolStartedPayload = {
  toolCallId: string
  parentToolCallId?: string | null
  toolName: string
  displayName?: string
  inputSummary?: string
  input?: Record<string, unknown>
}

export type ToolStreamPayload = {
  toolCallId: string
  chunk: string
}

export type ToolCompletedPayload = {
  toolCallId: string
  ok: boolean
  exitCode?: number | null
  durationMs?: number
  summary?: string
  outputText?: string
  fileChanges?: Array<{
    path: string
    operation?: "write" | "edit" | "delete"
    beforeContent: string | null
    afterContent: string | null
    verified?: boolean
  }>
}

export type ApprovalRequestedPayload = {
  approvalId: string
  toolCallId?: string | null
  actionType: string
  riskLevel: "low" | "medium" | "high"
  summary: string
  display?: {
    toolName?: string | null
    command?: string | null
    filePath?: string | null
    oldString?: string | null
    newString?: string | null
    content?: string | null
    inputJson?: string | null
  }
}

export type ApprovalResolvedPayload = {
  approvalId: string
  resolution: "approved" | "denied"
}

export type QuestionRequestedPayload = {
  questionId: string
  toolCallId?: string | null
  questions: Array<{
    id?: string
    header?: string
    question: string
    options?: Array<{
      label: string
      description?: string
    }>
  }>
}

export type QuestionAnsweredPayload = {
  questionId: string
  answers: Record<string, string>
}

export type RetryScheduledPayload = {
  attempt: number
  reason: string
  targetType?: "tool" | "provider" | "run"
  targetId?: string | null
}

export type WarningRaisedPayload = {
  code: string
  summary: string
}

export type ErrorRaisedPayload = {
  code: string
  summary: string
  retryable?: boolean
  source?: "runtime" | "tool" | "provider"
  detail?: string
}
```

### Reasoning Handling

The current app already has `reasoning_delta` style runtime output. The canonical protocol must not expose free-form reasoning content as a first-class visible stream.

Rules:

1. adapters must not map provider reasoning text into visible `message.delta`
2. adapters may convert coarse reasoning state into `progress.updated`
3. adapters may preserve raw reasoning metadata in `providerMeta` for diagnostics
4. the UI may show a generic running state even when no visible progress label exists

This keeps the "assistant is working" feeling without turning hidden reasoning into unstable product copy.

## Event Invariants

The implementation must preserve these invariants:

1. `eventId` is globally unique within the app
2. events for a single `runId` are totally ordered by `seq`
3. `ts` is milliseconds since epoch
4. `message.delta` events never appear before `message.started`
5. `tool.stdout`, `tool.stderr`, and `tool.completed` must reference an existing `toolCallId`
6. `tool.completed` is terminal for that tool call
7. approvals and questions are immutable requests plus separate resolution events
8. `run.completed` is terminal for the run
9. canonical events are never mutated after append

## Provider Adapter Contract

Each provider/runtime adapter must implement:

```ts
export type CanonicalEventEmitter = (event: CanonicalEvent) => void

export interface RuntimeEventAdapter<RawEvent> {
  onEvent(raw: RawEvent, emit: CanonicalEventEmitter): void
  onError(error: unknown, emit: CanonicalEventEmitter): void
  onComplete?(emit: CanonicalEventEmitter): void
}
```

Adapter rules:

1. adapters may buffer provider chunks only when necessary to produce valid canonical events
2. adapters must not produce UI-specific summaries other than lightweight event summaries in payloads
3. adapters must preserve provider-specific diagnostics in `providerMeta`
4. adapters must not merge unrelated tool calls
5. adapters must keep message and tool streams independent
6. adapters must not expose raw reasoning text as canonical user-facing content
7. adapters should avoid emitting empty `message.started` events before the first visible assistant output unless the run is known to produce an assistant message

## Timeline Composer

### Responsibility

The composer translates canonical events into stable UI view data. It is the only layer allowed to decide:

- when a new timeline card should be created
- when events should be merged into the current card
- how a failure is summarized once
- when details should remain collapsed

### Output View Model

```ts
export type TimelineProjection = {
  runId: string
  status: "running" | "completed" | "failed" | "cancelled"
  cards: TimelineCard[]
  activeMessage: ActiveAssistantMessage | null
  finalMessage: FinalAssistantMessage | null
}

export type TimelineCard = {
  cardId: string
  phase: TimelinePhase
  title: string
  summary: string
  status: "running" | "completed" | "failed" | "blocked"
  startedAt: number
  endedAt?: number

  toolCount: number
  retryCount: number
  warningCount: number
  errorCount: number

  detailRefs: string[]
  interactionRefs: string[]
  progressLabel?: string
  longRunning?: boolean
}

export type TimelinePhase =
  | "intake"
  | "analysis"
  | "tooling"
  | "approval"
  | "question"
  | "response"
  | "error"

export type ActiveAssistantMessage = {
  messageId: string
  text: string
  startedAt: number
  updatedAt: number
  isStreaming: boolean
}

export type FinalAssistantMessage = {
  messageId: string
  text: string
  completedAt: number
}
```

### Composer State

The composer should be implemented as an incremental state machine, not a full recompute on every event.

Recommended internal state:

```ts
type TimelineComposerState = {
  runId: string
  status: "running" | "completed" | "failed" | "cancelled"

  cards: TimelineCard[]
  activeCardId: string | null

  activeMessage: ActiveAssistantMessage | null
  finalMessage: FinalAssistantMessage | null

  toolByCallId: Map<string, {
    toolCallId: string
    toolName: string
    startedAt: number
    status: "running" | "completed" | "failed" | "blocked"
    stdout: string[]
    stderr: string[]
  }>

  approvalsById: Map<string, "pending" | "approved" | "denied">
  questionsById: Map<string, "pending" | "answered">
  emittedErrorKeys: Set<string>
}
```

### Composer Rules

1. `message.delta` updates only `activeMessage`; it does not create new cards by itself
2. `progress.updated` may create or update the current phase card
3. `tool.started` creates or joins a tooling card
4. `tool.stdout` and `tool.stderr` only update detail buffers
5. `tool.completed` updates status, file counts, and summary
6. `approval.requested` creates or joins an approval card
7. `question.requested` creates or joins a question card
8. `retry.scheduled` increments retry count on the relevant active card
9. repeated identical errors within the same active card are suppressed in the user-facing summary
10. `message.completed` moves `activeMessage` into `finalMessage`
11. `run.completed` finalizes any open card
12. approval and question cards must preserve actionable references through `interactionRefs`

### Phase Heuristics

Phase assignment should follow deterministic rules:

- first `progress.updated` before tools: `analysis`
- active tool work: `tooling`
- pending approval: `approval`
- pending question: `question`
- active final text stream: `response`
- terminal failure without active tool: `error`

Do not derive phases from model free-form wording.

## UI Rendering Contract

The UI should render the projection with fixed rules.

### Primary Layout

1. timeline column
2. final assistant answer area
3. collapsible detail drawers attached to cards

### Display Rules

1. the main timeline shows only user-facing summaries
2. tool inputs, stdout, stderr, raw paths, and raw errors are hidden behind details
3. the final assistant answer is separate from timeline progress
4. one failure should have one user-facing summary in the visible timeline
5. streaming text updates should not cause timeline card jitter

### Assistant-Facing Tone

The visible text should sound like a product assistant, not a shell transcript.

Good:

- "正在检查项目结构"
- "命令在当前 shell 中失败，已切换方案继续"
- "已读取关键文件，正在整理结果"

Bad:

- raw stderr in the main lane
- repeated `Command failed`
- full command output mixed into the answer
- exposed internal chain-of-thought as a first-class lane

### Detail Drawer Rules

Details may contain:

- command text
- tool input summary
- stdout
- stderr
- diff preview
- affected files
- timing metadata

Details should use code blocks and monospaced formatting. The primary timeline should not.

### Message Record Integration

This app already uses `StoredChatMessage` as the primary conversation unit. That should remain true.

Integration rules:

1. a user turn still creates a user `StoredChatMessage`
2. an assistant run still maps to one assistant `StoredChatMessage`
3. canonical events are stored alongside the session and linked by `runId` and `messageId`
4. the assistant message body displayed in the main answer area comes from `message.completed.finalText`
5. timeline cards are derived from canonical events, not persisted as authored text blocks

This allows migration without rewriting the entire conversation model at once.

## Persistence Model

Persist canonical events and build projection from them.

### Persisted

- canonical event log
- session and run identifiers
- final assistant message
- approval and question state
- checkpoint references

### In-Memory Only

- unflushed `message.delta` accumulation buffers
- transient tool stream chunk buffers if already folded into tool detail state
- card expansion state
- animation and hover state

### Recommendation

Add canonical event log persistence beside or inside the current session event log flow in `src/modules/ai/store/aiChatStore.ts`.

Do not persist UI-specific projections as the source of truth.

### High-Frequency Event Coalescing

Persisting every tiny chunk as its own durable event can create avoidable storage and replay cost.

Recommended rule:

1. `message.delta`, `tool.stdout`, and `tool.stderr` may be coalesced into short append windows before durable write
2. coalescing must preserve order and correlation
3. coalescing windows must stay small enough to keep streaming responsive
4. `message.completed` and `tool.completed` remain authoritative terminal events

This means the canonical event protocol stays append-only, but the durable writer may batch high-frequency fragments before commit.

## Performance Requirements

The protocol conversion itself is not the main risk. The main risk is recomputing too much or rerendering too often.

### Hard Requirements

1. appending a new canonical event must be `O(1)` amortized
2. composer updates must touch only the active run and affected card
3. `message.delta` updates must be throttled before they trigger visible rerenders
4. detail bodies must not mount until expanded
5. long conversations must support list virtualization

### Suggested Thresholds

- message and progress render throttle: 50 to 100 ms
- tool stream append batching: 50 to 100 ms
- durable chunk coalescing window: 50 to 100 ms
- long-running card marker: 4 s
- stale active phase warning: 12 s

### Anti-Patterns to Avoid

- rebuilding the full timeline from scratch on each token
- concatenating full transcript strings for every event
- syntax-highlighting all tool logs eagerly
- letting every provider chunk become a visible card

## Compatibility With Current Code

This design maps directly onto the current codebase.

### Keep

- `packages/runtime-protocol`
- chat session persistence
- approval and question concepts
- tool result file change handling
- existing runtime/client split
- `StoredChatMessage` as the top-level conversation item during migration

### Replace or Refactor

- current mixed `RuntimeAssistantTimelineEvent` shape as the long-term UI source of truth
- direct UI grouping logic in `runtimeEventRenderModel.ts`
- visible "thinking lane" as a general-purpose default output channel

### New Modules to Introduce

Recommended file layout:

```text
packages/runtime-protocol/src/
  canonicalEvents.ts
  canonicalEventSchemas.ts
  canonicalEventValidators.ts

src/modules/ai/runtime/
  adapters/
    openaiAdapter.ts
    anthropicAdapter.ts
    builtinRuntimeAdapter.ts
  composer/
    timelineComposer.ts
    timelineComposerTypes.ts
    timelineComposerRules.ts

src/components/workspace/
  timeline/
    TimelineView.tsx
    TimelineCard.tsx
    TimelineDetailDrawer.tsx
```

## Migration Plan

This system is not live yet, so we should move directly toward the target architecture without preserving accidental legacy shapes forever.

### Phase 1: Canonical Protocol

Deliverables:

- define canonical event types in `packages/runtime-protocol`
- add runtime validation helpers
- document invariants in code comments

Acceptance criteria:

- TypeScript types compile
- tests cover event shape validation
- current runtime can emit at least `run`, `message`, `progress`, `tool`, `error`, and `approval/question` events

### Phase 2: Adapters

Deliverables:

- implement adapter interface for built-in runtime first
- add adapter test fixtures for representative streams

Acceptance criteria:

- raw provider/runtime streams are converted to canonical events
- event ordering is deterministic
- adapters preserve provider diagnostics in `providerMeta`

### Phase 3: Composer

Deliverables:

- implement incremental composer state machine
- implement card merge and dedupe rules
- implement projection tests

Acceptance criteria:

- mixed event streams produce stable cards
- identical repeated errors are summarized once
- tool stdout/stderr stay out of the main timeline
- `message.delta` updates do not create duplicate timeline nodes
- approvals/questions remain actionable through projection references

### Phase 4: UI

Deliverables:

- add timeline components based on projection
- keep detail drawers collapsed by default
- separate final answer from process cards

Acceptance criteria:

- tool-heavy conversations no longer interleave raw logs with final answer
- failures appear once in the main lane and with details in the drawer
- streaming remains visually stable

### Phase 5: Store and Replay Integration

Deliverables:

- persist canonical events
- rebuild projections from persisted logs on session restore
- connect checkpoints if needed

Acceptance criteria:

- reloading the app reproduces the same timeline
- replay order matches live order
- assistant message records still restore correctly in chat history

### Phase 6: Cleanup

Deliverables:

- remove obsolete mixed render paths
- reduce or eliminate default visible reasoning lane
- retire temporary compatibility mapping

Acceptance criteria:

- only canonical events drive timeline rendering
- old mixed rendering code is no longer on the critical path

## Test Plan

### Unit Tests

- canonical event validation
- adapter event mapping
- composer state transitions
- error dedupe logic
- retry counting
- card merge behavior

### Integration Tests

- simple Q&A without tools
- tool-heavy coding turn
- approval-gated edit flow
- question/request flow
- tool failure then retry then success
- provider stream interruption

### Performance Tests

- 2,000 `message.delta` events in one run
- 500 tool stream chunk events
- 100-card conversation restore
- repeated expand/collapse of heavy detail drawers

## Real Implementation Sequence For AI

The following task list is intended to be directly executable by an AI coding agent.

### Task 1: Introduce canonical event types

Files:

- `packages/runtime-protocol/src/canonicalEvents.ts`
- `packages/runtime-protocol/src/index.ts`

Requirements:

- export all canonical event types
- export payload types
- export helper type guards where useful
- keep the schema provider-agnostic

Definition of done:

- builds successfully
- existing consumers still compile after index export changes

### Task 2: Add canonical event validator and test fixtures

Files:

- `packages/runtime-protocol/src/canonicalEventValidators.ts`
- `packages/runtime-protocol/src/__tests__/*`

Requirements:

- validate required fields per event type
- reject impossible status/type combinations
- include representative fixtures

Definition of done:

- tests pass
- invalid events fail predictably

### Task 3: Build built-in runtime adapter

Files:

- `src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts`

Inputs:

- current built-in runtime/provider stream shape

Requirements:

- map raw runtime activity to canonical events
- preserve provider-specific raw fields in `providerMeta`
- emit deterministic `seq`
- map reasoning activity to coarse progress or metadata, not visible reasoning text

Definition of done:

- representative runtime transcripts map cleanly
- no UI code depends on raw runtime events directly in the new path

### Task 4: Implement timeline composer

Files:

- `src/modules/ai/runtime/composer/timelineComposer.ts`
- `src/modules/ai/runtime/composer/timelineComposerTypes.ts`
- `src/modules/ai/runtime/composer/timelineComposerRules.ts`

Requirements:

- support incremental append
- keep active message separate from cards
- dedupe repeated errors in the same card
- maintain tool detail references

Definition of done:

- composer tests cover all core event types
- card creation and closure rules are deterministic

### Task 5: Store canonical event log

Files:

- `src/modules/ai/store/aiChatStore.ts`
- related session event log files

Requirements:

- add canonical event log persistence
- restore projection from canonical event log on session load
- keep old message content available during migration if needed
- keep assistant `StoredChatMessage` creation/update semantics explicit and deterministic

Definition of done:

- reload preserves timeline state
- canonical events are the source of truth for process rendering

### Task 6: Add new timeline UI components

Files:

- `src/components/workspace/timeline/TimelineView.tsx`
- `src/components/workspace/timeline/TimelineCard.tsx`
- `src/components/workspace/timeline/TimelineDetailDrawer.tsx`

Requirements:

- render summary-first assistant timeline
- keep details collapsed by default
- keep final answer visually separate
- show approval and question states clearly

Definition of done:

- tool output no longer dominates the visible conversation
- detail drawers show raw command/log content when requested

### Task 7: Migrate existing screens

Files:

- `src/components/workspace/AIChatConversationMessagesPane.tsx`
- `src/components/workspace/AIChatRuntimeInteractionCards.tsx`
- `src/components/workspace/runtimeEventRenderModel.ts`
- related message rendering files

Requirements:

- switch primary process rendering to the new projection
- keep any remaining compatibility adapters local and temporary

Definition of done:

- main conversation view uses the projection end-to-end
- old mixed render model is no longer the primary path

## Acceptance Criteria

The feature is complete when all of the following are true:

1. a tool-heavy conversation renders as a clean timeline plus final answer
2. raw stderr is not shown in the main lane by default
3. repeated failures are summarized once in visible UI
4. final answer text is visually independent from process updates
5. switching providers does not require changing timeline UI code
6. restoring a saved session reproduces the same timeline
7. streaming remains smooth under high event volume

## Risks and Mitigations

### Risk: Scope grows because old and new models coexist too long

Mitigation:

- keep compatibility shims narrow
- make canonical events the only new source of truth

### Risk: Composer rules become UI-specific and fragile

Mitigation:

- keep projection semantic
- leave colors, spacing, and animations to the renderer

### Risk: Message content and timeline process content drift apart

Mitigation:

- treat `message.completed` as the canonical final answer boundary
- keep process cards and final message in the same run projection
- keep one assistant `StoredChatMessage` per assistant run unless product requirements explicitly change

### Risk: Raw provider streams are inconsistent

Mitigation:

- adapters own that inconsistency
- preserve raw provider data in `providerMeta`

## Recommendation

Proceed with this as the default architecture for the not-yet-launched system.

Do not ship a timeline that is driven by mixed assistant text, visible reasoning, and raw runtime logs. The canonical event protocol plus composer architecture is the correct long-term boundary for this product.

## Spec Self-Review

This spec was self-reviewed against the current repository before planning. The main issues checked and resolved were:

1. sequencing ambiguity
   Resolved by assigning durable `seq` ownership to the event-log writer instead of individual adapters.

2. current reasoning stream compatibility
   Resolved by explicitly mapping free-form reasoning away from visible user-facing timeline content.

3. migration fit with the existing chat model
   Resolved by preserving `StoredChatMessage` as the top-level conversation unit while making canonical events the process source of truth.

4. storage and replay cost of tiny chunk events
   Resolved by allowing short-window coalescing for high-frequency deltas before durable write.

5. approval/question actionability after projection
   Resolved by adding `interactionRefs` to projected timeline cards.
