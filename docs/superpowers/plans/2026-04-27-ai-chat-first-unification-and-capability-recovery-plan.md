# AI Chat-First Unification And Capability Recovery Plan

> Goal: Turn the current partial AI surfaces into one coherent, chat-first PM workbench where the user experiences "normal AI", while the system internally orchestrates knowledge, structure, prototype, and sync flows.

## Why This Plan Exists

The current AI system is not blocked by a total lack of code. It is blocked by fragmentation:

- direct chat works
- local Claude/Codex prompt execution works at a basic level
- structured workflow generation exists
- knowledge indexing exists
- editable wireframes exist

But these pieces do not yet form one trustworthy product loop.

Today, the user can see many AI entry points, but they do not all lead to the same place:

- some routes call remote `aiService`
- some routes call local agent CLI bridges
- workflow runs as a separate structured mode
- `@整理` mostly rebuilds index rather than organizing knowledge
- prototype edits do not produce reusable semantic feedback for AI

This plan fixes that by making **chat the only primary AI entry**, and moving workflow to an invisible orchestration layer.

## Product Rules

1. AI should feel like normal AI to the user.
2. Workflow should exist as orchestration, not as a destination page.
3. Natural language is primary; `@skill` is an advanced precision tool.
4. High-confidence intent can auto-route; low-confidence intent should confirm inline.
5. State should be visible only at important moments through inline cards, confirmations, and artifact blocks.
6. Knowledge, prototype, and sync outputs must become reusable structured context for future AI calls.

## Current System Reality

### Already Working

- Built-in direct AI chat through `aiService.completeText`
- Native local agent prompt bridge through Tauri
- Prompt-side skill routing for `@需求 / @草图 / @UI`
- Structured workflow package generation for requirements, prototype, and HTML page output
- Editable wireframe persistence
- Knowledge tree, markdown editing, and project file persistence

### Partially Working

- Claude/Codex runtime surfaces exist, but runtime semantics are mixed between remote config execution and local CLI execution
- Workflow is functional, but still exposed as an explicit tool surface rather than invisible orchestration
- Knowledge references are available to AI, but organization logic is weak
- Prototype editing is persistent, but not semantically observable

### Not Actually Working End-To-End

- "Organize knowledge base into wiki" capability
- "Use prototype edits to update project truth" capability
- unified runtime routing across built-in AI, local Claude, and local Codex
- one conversation-driven AI layer that can move between free chat, requirements, prototype, sync, and UI generation without feeling like separate products

## Target Architecture

```text
User Chat
  -> Intent Router
     -> Free Chat
     -> Knowledge Organize Lane
     -> Requirements Lane
     -> Prototype Lane
     -> Change Sync Lane
     -> UI Generation Lane
  -> Runtime Router
     -> Built-in Remote AI
     -> Local Claude CLI
     -> Local Codex CLI
  -> Inline Result Surface
     -> normal assistant text
     -> artifact cards
     -> confirmation cards
     -> conflict cards
     -> status notes at key checkpoints
```

### Core Principle

The visible surface is always `AIChat`.

The invisible engine beneath it keeps:

- intent
- current lane
- selected runtime
- required confirmations
- produced artifacts
- conflict state
- reusable context snapshots

## What Already Exists And Should Be Reused

### Reuse As-Is Or Nearly As-Is

- `src/components/workspace/AIChat.tsx`
- `src/modules/ai/workflow/skillRouting.ts`
- `src/modules/ai/workflow/AIWorkflowService.ts`
- `src/store/projectStore.ts`
- `src/store/previewStore.ts`
- `src/modules/knowledge/knowledgeEntries.ts`
- `src/modules/knowledge/referenceFiles.ts`
- `src/components/product/ProductWorkbench.tsx`
- `src-tauri/src/lib.rs`

### Reuse But Reposition

- `AIWorkflowWorkbench`
  - keep as internal diagnostics / fallback debug surface
  - stop treating it as the main user-facing workflow entry

- `ClaudeRuntime` / `CodexRuntime`
  - keep as runtime abstractions
  - stop letting them imply a product mode by themselves

## Main Gaps To Fix

1. **No unified AI intent router**
   - current skill routing only handles a few explicit tokens
   - natural-language intent to lane mapping is still thin

2. **No runtime truth model**
   - local agent path and remote provider path coexist, but user-facing semantics are muddy

3. **No real knowledge organization lane**
   - `@整理` behaves like index rebuild, not AI-powered project organization

4. **No semantic prototype feedback loop**
   - prototype edits do not become structured AI-readable changes

5. **No page/flow truth document layer**
   - requirements docs are too broad
   - wireframes are too visual
   - there is no stable per-page or per-flow explanation layer

6. **No change sync lane**
   - no dedicated orchestration path for turning prototype edits into reviewed truth updates

## Recommended Implementation Strategy

Ship this in four phases.

## Phase 1: Unify AI Entry And Runtime Truth

### Outcome

The app has one primary AI entry: chat.

Behind chat, the system can cleanly choose:

- built-in remote AI
- local Claude CLI
- local Codex CLI

without making the user think in terms of separate products.

### Work

1. Add an internal orchestration concept in the chat layer.
   - Suggested new module: `src/modules/ai/orchestration/`
   - Types:
     - `AIIntentLane`
     - `AIIntentResolution`
     - `AIRuntimeMode`
     - `AIOrchestrationResult`

2. Split "visible panel" from "execution lane".
   - `AIChat` remains visible
   - current `workflow` panel becomes optional diagnostics

3. Normalize runtime choice semantics.
   - built-in remote AI = one runtime family
   - local Claude CLI = one runtime family
   - local Codex CLI = one runtime family
   - provider-specific remote config execution should not pretend to be local runtime

4. Add confidence-based lane routing.
   - explicit `@token` = hard route
   - strong natural language match = auto route
   - weak match = inline confirm card

### Likely Files

- `src/components/workspace/AIChat.tsx`
- `src/modules/ai/workflow/skillRouting.ts`
- `src/modules/ai/gn-agent/runtime/claude/ClaudeRuntime.ts`
- `src/modules/ai/gn-agent/runtime/codex/CodexRuntime.ts`
- new `src/modules/ai/orchestration/*`

### Tests

- chat lane routing tests
- local-vs-remote runtime selection tests
- confidence fallback tests

## Phase 2: Recover Real Knowledge Intelligence

### Outcome

`整理` stops meaning "refresh index" and starts meaning:

- infer document clusters
- classify docs by role
- generate wiki/index docs
- propose feature/page lists
- create reusable knowledge structure for later AI calls

### Work

1. Add a `knowledge-organize` lane.
2. Keep file indexing, but layer AI organization on top.
3. Generate AI-authored knowledge artifacts such as:
   - project overview
   - terminology glossary
   - feature inventory
   - page inventory
   - unresolved questions
4. Store these as explicit AI documents in the knowledge system.

### Important Guardrail

Do not overwrite user docs directly on first pass.

First pass should generate or update AI-authored derived docs.

### Likely Files

- `src/modules/knowledge/knowledgeEntries.ts`
- `src/modules/knowledge/referenceFiles.ts`
- `src/store/projectStore.ts`
- new `src/modules/ai/knowledge/*`

### Tests

- organization output inclusion in knowledge tree
- generated wiki doc visibility
- related-doc linking

## Phase 3: Make Prototype Editing AI-Visible

### Outcome

The wireframe editor no longer only knows that "something changed".

It can tell AI what changed in structural terms.

### Work

1. Extend preview/editor state with structural action events.
2. Record events such as:
   - module added
   - module deleted
   - module renamed
   - module reordered
   - field added
   - field deleted
   - field renamed
   - primary action changed

3. Introduce unsynced state separate from autosave state.
4. Add a synced baseline snapshot per page.

### Important Guardrail

Do not recalculate planning artifacts on every editor action.

Capture actions lightly, then process them only when sync is requested.

### Likely Files

- `src/store/previewStore.ts`
- `src/store/projectStore.ts`
- `src/components/product/ProductWorkbench.tsx`
- possibly `src/components/canvas/Canvas.tsx`

### Tests

- structural action recording
- unsynced state lifecycle
- baseline snapshot update after successful sync

## Phase 4: Add Change Sync As An Invisible Lane

### Outcome

The user edits a prototype, clicks `变更同步` or says `@变更同步`, and the AI:

- reads structural actions plus before/after snapshots
- generates itemized semantic changes
- flags conflicts
- updates page/flow explanation docs after confirmation

### Work

1. Add a dedicated `change-sync` lane.
2. Add a new page/flow truth document layer.

Recommended shape:

- new `docType` or new dedicated model
- explicit `pageId` / `flowId`
- `baselineVersion`
- `lastSyncedAt`
- `source = ai | manual`

3. Keep V1 scope to single-page sync.
4. Treat flow sync as V1.5 unless a clean aggregation model appears.
5. Show sync through inline chat cards:
   - unsynced changes detected
   - proposal item list
   - conflict warning
   - confirm / reject
   - doc updated

### Important Guardrail

Do not put these page/flow sync docs blindly into the same undifferentiated requirement pool without extra typing.

Otherwise the planning system will start consuming sync explanations as raw requirements.

### Likely Files

- `src/types/index.ts`
- `src/store/projectStore.ts`
- `src/components/workspace/AIChat.tsx`
- `src/modules/ai/orchestration/*`
- new `src/modules/ai/change-sync/*`
- `src/modules/knowledge/knowledgeEntries.ts`

### Tests

- `@变更同步` routing
- proposal generation shape
- conflict-required confirmation
- first sync creates page doc
- later sync updates same doc

## Data Model Recommendation

Do not keep growing "everything is a requirement doc".

Recommended direction:

```text
KnowledgeDoc
  - docType: requirement | note | sketch | page-sync | flow-sync | ai-summary
  - ownerId?: pageId | flowId
  - sourceType: manual | upload | ai
  - tags
  - relatedIds
```

This can still live in a single store collection if needed, but the type system must distinguish them clearly.

## Chat UX Recommendation

### Keep

- one normal AI composer
- normal conversation flow
- advanced `@token` entry

### Add

- inline cards for:
  - intent confirmation
  - generated artifact summaries
  - proposal reviews
  - conflict confirmations
  - "doc updated" confirmations

### Reduce

- dependency on a dedicated visible workflow panel

## Not In Scope

- bidirectional doc-to-prototype auto-sync
- whole-project batch sync
- full flow sync in V1 if only page primitives exist
- pixel-level visual diff interpretation
- production-grade code generation from generated HTML prototypes

## Risks

1. Overusing existing `requirementDocs` without type separation will pollute planning.
2. Treating local Claude/Codex and remote provider configs as the same thing will keep user trust low.
3. Leaving `AIWorkflowWorkbench` as a first-class product surface will fight the new chat-first direction.
4. Building flow sync before flow-level edit ownership exists will create partial truth.

## Parallelization Strategy

### Lane A: AI orchestration and runtime truth

Modules:

- `src/components/workspace/`
- `src/modules/ai/orchestration/`
- `src/modules/ai/gn-agent/runtime/`

### Lane B: knowledge intelligence and document typing

Modules:

- `src/modules/knowledge/`
- `src/store/`
- `src/types/`

### Lane C: prototype action capture and sync state

Modules:

- `src/store/previewStore.ts`
- `src/components/product/`
- `src/components/canvas/`

Launch A + B in parallel. Start C once the data model shape in B is stable enough.

## Suggested Order

1. Phase 1 first
2. Then Phase 2 and the data-model part of Phase 4
3. Then Phase 3
4. Then user-facing Phase 4 sync

## Success Criteria

- The user can stay inside normal AI chat for most AI work.
- Local and remote runtimes feel intentionally different and truthfully labeled.
- `整理` produces useful project knowledge artifacts rather than only refreshing references.
- Prototype edits become visible to AI as structured changes.
- `变更同步` updates page truth safely through confirmation.
- The AI system feels like one product instead of several overlapping experiments.
