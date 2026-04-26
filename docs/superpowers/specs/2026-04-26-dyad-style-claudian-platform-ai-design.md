# Dyad Style Claudian Platform AI Design

## Goal

Rebuild the app's AI system so it feels like a complete AI product rather than a modified side panel, while preserving the existing product's left-middle-right workbench structure.

This design combines:

- `dyad` as the visual and interaction reference for product polish
- `claudian` as the provider/runtime architecture reference
- official `Claude` and `Codex` message/session flows
- a platform-owned capability layer for shared skills, context, workspace awareness, and activity

## Product Outcome

The final system must behave like this:

- the overall product visual language is unified and closer to `dyad`
- the existing product shell remains:
  - left = workbench/navigation
  - middle = display/preview/content
  - right = AI workspace
- the AI area becomes a real multi-workspace system:
  - `Claudian` = configuration and platform AI control center
  - `Claude` = Claude-native workspace
  - `Codex` = Codex-native workspace
  - `Classic` = compatibility workspace for the current AIChat flow
- `Claude`, `Codex`, and `Classic` histories are fully separated
- `Claude` and `Codex` use official provider-specific message/session flows rather than the current generic message model
- the platform still injects shared capabilities such as skills and project/workspace context

## Confirmed Constraints

- do not convert the product into `dyad`'s app-builder information architecture
- do not remove the current left-middle-right product structure
- do not unify Claude/Codex/Classic histories
- do not make Claude/Codex just themed versions of the same generic chat runtime
- do not remove the current `AIChat`; keep it only for `Classic`
- provider-native message/session structures may differ
- platform-level capabilities must still work across Claude and Codex

## Why The Existing Direction Is Insufficient

The current migration only replaced the shell around `AIChat`. That created a Claudian-looking host, but the internal AI system still has the old limitations:

- one generic chat core still dominates behavior
- Claude/Codex are not yet truly separate workspaces
- the UI looks more like an adapted tool panel than a polished AI product
- skills/context/workspace awareness are tangled with the old chat implementation

That is not enough for the desired "complete AI tool" feel.

## Architecture Decision

The new AI system will use four layers.

### 1. Product Shell Layer

Responsibility:

- preserve the existing left-middle-right product frame
- apply a unified `dyad`-inspired design system across the app
- host the AI area as a first-class right-side workspace

Key outcome:

- the app keeps its own structure
- only the visual language and internal panel behavior move closer to `dyad`

### 2. AI Workspace Shell Layer

Responsibility:

- own workspace switching between:
  - `Claudian`
  - `Claude`
  - `Codex`
  - `Classic`
- own AI host layout, provider branding, top-level state, and page routing

Target modules:

- `src/components/ai/claudian-shell/ClaudianShell.tsx`
- `src/modules/ai/claudian/claudianShellStore.ts`

### 3. Provider Workspace Layer

Responsibility:

- implement fully independent user-facing workspaces:
  - `ClaudeWorkspace`
  - `CodexWorkspace`
  - `ClassicWorkspace`

Each provider workspace owns:

- history sidebar
- session creation/selection
- message viewport
- composer/input toolbar
- runtime status area
- provider-specific message rendering

Classic remains the compatibility channel and may still reuse the current `AIChat`.

### 4. Runtime And Platform Capability Layer

Responsibility:

- keep provider-native runtime behavior independent
- inject platform-owned shared capabilities without flattening provider behavior

This layer splits into two parts:

#### Provider Runtime Layer

- `ClaudeRuntime`
- `CodexRuntime`

Responsibilities:

- official provider-specific session lifecycle
- official provider-specific message flow
- provider-specific streaming/event translation
- provider-specific persistence format

#### Platform Capability Layer

- `SkillBridge`
- `ContextBridge`
- `WorkspaceBridge`
- `ActivityBridge`

Responsibilities:

- shared skill discovery/selection/execution
- project/current file/current directory/current page context
- workspace-awareness and platform metadata injection
- unified activity log independent of provider message shape

Important rule:

- provider message/session flow is not unified
- platform capability injection is unified

## UX Direction Borrowed From Dyad

The system should borrow `dyad`'s product feel, not its app structure.

### Adopt

- clearer panel hierarchy
- stronger spacing and container consistency
- cleaner border/surface language
- stable chat header/history/message/composer layout
- more complete status feedback
- better right-panel product polish
- more intentional sidebar, tabs, cards, and empty states

### Do Not Adopt

- `dyad`'s route-first application structure
- `dyad`'s whole app-builder product model
- Electron-only assumptions
- generic multi-provider AI runtime abstraction as the primary provider core

## Global Design System Migration

The following layers should be unified across the whole product.

### Tokens

- background levels
- surface levels
- border strength
- radius scale
- spacing scale
- type scale
- icon language
- active/hover/selected states

### Containers

- workbench shell containers
- side panels
- cards
- settings sections
- overlays/dialogs

### Inputs

- buttons
- icon buttons
- segmented controls
- selects
- search fields
- chat composer
- toolbar controls

### Content States

- empty
- loading
- ready
- warning
- error
- completed

## AI Feature Goals

The rebuilt AI area must improve both look and capability.

### Core User-Facing Features

- separate history for Claude, Codex, and Classic
- provider-native chat workspaces
- better chat header and session management
- richer input toolbar
- clearer context selection controls
- better runtime state/status display
- better activity and action feedback
- better configuration and provider setup UX

### Platform Integration Features

- platform skills available from Claude and Codex
- platform workspace/file/project context available from Claude and Codex
- activity logs available independent of provider
- configuration and diagnostics available from `Claudian`

## Data And Persistence Boundaries

### Independent Stores

- `claudeSessionStore`
- `codexSessionStore`
- existing `aiChatStore` kept for `Classic`

### Independent Message Models

- `ClaudeMessage`
- `CodexMessage`
- existing `StoredChatMessage` for `Classic`

### Independent Persistence

- Claude session persistence stored separately
- Codex session persistence stored separately
- Classic remains on current persistence path

## Migration Strategy

This should not be executed as a single giant rewrite. It should be done as a controlled sequence.

### Phase 1: Global Design Foundation

- introduce shared design tokens and visual primitives inspired by `dyad`
- update shell containers and right-side AI host styling

### Phase 2: AI Workspace Refactor

- turn `ClaudianShell` into a true workspace host
- introduce `ClaudeWorkspace`, `CodexWorkspace`, `ClassicWorkspace`

### Phase 3: Independent Session Stores

- split Claude/Codex/Classic state and history

### Phase 4: Provider-Native Message Flow

- move Claude to provider-native session/message flow
- move Codex to provider-native session/message flow

### Phase 5: Platform Capability Bridges

- inject platform skills/context/activity/workspace awareness into Claude and Codex without unifying their message models

### Phase 6: Feature Completion

- improve chat controls, history UX, runtime status, and context tooling
- finish visual polish across AI and adjacent workbench areas

## Testing Requirements

- AI shell/workspace tests updated for the new host structure
- source-level tests for independent Claude/Codex/Classic routing and stores
- source-level tests for provider-specific runtime wiring
- source-level tests for platform capability bridge presence
- typecheck passes
- build passes
- Tauri check passes

## Non-Goals

- do not turn the entire product into a clone of `dyad`
- do not replace Zustand with Jotai
- do not replace the app with TanStack Router
- do not move the core runtime onto `@ai-sdk/*` if it conflicts with official Claude/Codex flow goals
- do not remove Classic compatibility in this migration

## Final Decision

The target is:

- `dyad`-style UI polish
- `claudian`-style provider/runtime layering
- provider-native Claude/Codex flows
- platform-owned shared AI capabilities
- preserved left-middle-right product identity
