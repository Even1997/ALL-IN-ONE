# Claudian SDK Migration Design

## Goal

Replace the current "Claudian-style shell" approximation with a real Claudian-derived architecture inside the AI area:

- keep the existing `AIChat` as a fallback/classic view
- add a Claudian-driven shell inside the AI experience
- add entry icons above the composer action area for:
  - `Claudian` configuration
  - `Claude` page
  - `Codex` page
- implement Claude and Codex using Claudian-style provider/runtime layering rather than ad hoc panel logic

## Why This Change

The current implementation only reuses Claudian-like styling and a few extracted UI fragments. It does not reproduce Claudian's real view architecture:

- no view-level shell equivalent to `ClaudianView`
- no tab manager equivalent to `TabManager`
- no provider registry equivalent to `providers/index.ts`
- no Claude/Codex runtime parity with Claudian's provider/runtime model

As a result, the UI still behaves like the original app with a modified chat surface, which does not satisfy the product goal.

## Required Outcome

The migrated AI area must behave as a Claudian-derived workspace, not a themed `AIChat`:

- `Claudian` icon opens a Claudian configuration page
- `Claude` icon opens a Claude workspace page
- `Codex` icon opens a Codex workspace page
- the visual structure follows Claudian's shell, header, tab badge, message area, status panel, and input toolbar patterns
- Claude and Codex are routed through explicit provider/runtime layers
- every migrated area has a traceable source mapping back to `claudian`

## Constraints

- do not remove the existing `AIChat`
- do not break the existing product/design/develop/test/operations workbench pages
- do not force the full app into a Claudian-only layout
- keep the current `AI` top-level role entry
- implement incrementally so the app remains testable after each phase

## Source-To-Target Mapping

### View / Shell

Claudian source:

- `claudian/src/features/chat/ClaudianView.ts`

Target:

- `src/components/ai/claudian-shell/ClaudianShell.tsx`
- `src/components/ai/claudian-shell/ClaudianShell.css`

Responsibility:

- outer AI shell for Claudian mode
- header region
- title slot
- page routing between config / Claude / Codex sub-pages
- mode-specific layout for panel/full-page integration

### Tab State / Navigation

Claudian source:

- `claudian/src/features/chat/tabs/TabManager.ts`
- `claudian/src/features/chat/tabs/TabBar.ts`
- `claudian/src/style/components/tabs.css`

Target:

- `src/components/ai/claudian-shell/ClaudianTabBadges.tsx`
- `src/modules/ai/claudian/claudianTabState.ts`
- `src/modules/ai/claudian/claudianShellStore.ts`

Responsibility:

- numbered session badges
- active provider page selection
- per-provider session selection
- future support for independent Claude/Codex tab/session state

### Input Toolbar / Action Strip

Claudian source:

- `claudian/src/features/chat/ui/InputToolbar.ts`
- `claudian/src/style/components/input.css`

Target:

- `src/components/ai/claudian-shell/ClaudianInputToolbar.tsx`

Responsibility:

- composer wrapper
- context chips
- action strip above the composer
- new icon entry buttons for `Claudian`, `Claude`, `Codex`

### Status Panel

Claudian source:

- `claudian/src/features/chat/ui/StatusPanel.ts`
- `claudian/src/style/components/status-panel.css`

Target:

- `src/components/ai/claudian-shell/ClaudianStatusPanel.tsx`

Responsibility:

- tool/status/todo area between messages and composer
- structured run status for Claude/Codex sessions

### Navigation Sidebar

Claudian source:

- `claudian/src/features/chat/ui/NavigationSidebar.ts`
- `claudian/src/style/components/nav-sidebar.css`

Target:

- `src/components/ai/claudian-shell/ClaudianNavSidebar.tsx`

Responsibility:

- optional session/history jump navigation for long conversations

### Messages / History UI

Claudian source:

- `claudian/src/style/components/messages.css`
- `claudian/src/style/components/history.css`

Target:

- `src/components/ai/claudian-shell/ClaudianMessageList.tsx`
- `src/components/ai/claudian-shell/ClaudianHistoryMenu.tsx`

Responsibility:

- render assistant/user messages in Claudian layout
- surface session history in Claudian structure instead of the current improvised embedded pieces

### Provider Registry

Claudian source:

- `claudian/src/providers/index.ts`
- `claudian/src/providers/claude/registration.ts`
- `claudian/src/providers/codex/registration.ts`

Target:

- `src/modules/ai/claudian/providers/index.ts`
- `src/modules/ai/claudian/providers/types.ts`
- `src/modules/ai/claudian/providers/claudeRegistration.ts`
- `src/modules/ai/claudian/providers/codexRegistration.ts`

Responsibility:

- provider registration
- enablement rules
- runtime factory
- UI metadata for Claude/Codex pages

### Claude Runtime

Claudian source:

- `claudian/src/providers/claude/runtime/ClaudeChatRuntime.ts`
- `claudian/src/providers/claude/runtime/ClaudeQueryOptionsBuilder.ts`
- `claudian/src/providers/claude/runtime/ClaudeCliResolver.ts`
- `claudian/src/providers/claude/runtime/claudeColdStartQuery.ts`

Target:

- `src/modules/ai/claudian/runtime/claude/ClaudeRuntime.ts`
- `src/modules/ai/claudian/runtime/claude/ClaudeCliResolver.ts`
- `src/modules/ai/claudian/runtime/claude/ClaudeQueryOptionsBuilder.ts`

Responsibility:

- SDK-backed Claude runtime
- local CLI path resolution
- query/session lifecycle
- streaming into the migrated Claudian UI

### Codex Runtime

Claudian source:

- `claudian/src/providers/codex/runtime/CodexChatRuntime.ts`
- `claudian/src/providers/codex/runtime/CodexCliResolver.ts`
- `claudian/src/providers/codex/runtime/CodexAppServerProcess.ts`
- `claudian/src/providers/codex/runtime/CodexRpcTransport.ts`

Target:

- `src/modules/ai/claudian/runtime/codex/CodexRuntime.ts`
- `src/modules/ai/claudian/runtime/codex/CodexCliResolver.ts`
- `src/modules/ai/claudian/runtime/codex/CodexAppServerProcess.ts`
- `src/modules/ai/claudian/runtime/codex/CodexRpcTransport.ts`

Responsibility:

- Codex process/app-server lifecycle
- Codex runtime event transport
- session lifecycle and UI updates

### Settings / Config Page

Claudian source:

- `claudian/src/providers/claude/ui/ClaudeSettingsTab.ts`
- `claudian/src/providers/codex/ui/CodexSettingsTab.ts`
- `claudian/src/style/settings/*.css`

Target:

- `src/components/ai/claudian-shell/ClaudianConfigPage.tsx`
- `src/components/ai/claudian-shell/ClaudianProviderSettings.tsx`

Responsibility:

- Claudian configuration page reached from the `Claudian` icon
- Claude/Codex runtime settings sections
- CLI path, enablement, provider-specific settings

## Integration Plan In The Existing App

### Existing Files Kept

- `src/components/workspace/AIChat.tsx`
- `src/components/workspace/AIChat.css`
- `src/components/ai/ClaudePage.tsx`
- `src/App.tsx`

### Existing Files To Rework

- `src/components/ai/ClaudePage.tsx`
  - stop being a thin wrapper around the fake Claudian workspace
  - become the full-page host for `ClaudianShell`

- `src/components/ai/ClaudianWorkspace.tsx`
  - stop owning the fake top-level architecture
  - become either:
    - a compatibility wrapper that mounts `ClaudianShell`, or
    - a smaller panel-mode host around the new shell

- `src/components/ai/claudian/ClaudianEmbeddedPieces.tsx`
  - transitional only
  - migrate useful fragments into the new shell components
  - remove duplicated fake-shell behavior after parity is reached

### App-Level Behavior

- the existing `AI` role remains a top-level tab in `App.tsx`
- the dedicated `AI` page continues to render in the main workbench area
- the panel AI workspace remains available for non-AI roles, but should eventually use the same Claudian shell in compact mode

## Phases

### Phase 1: Shell Replacement

- add `ClaudianShell`
- add shell-level mode state for:
  - config
  - Claude
  - Codex
  - classic
- add icon entry strip above the composer action area
- mount the new shell into the existing AI page

### Phase 2: Claudian UI Parity

- migrate Claudian header/tabs/input/status/message layout
- import or adapt Claudian CSS modules
- remove fake Claudian layout duplication from the old embedded path

### Phase 3: Provider Registry

- add provider registration/model
- register `claude` and `codex`
- route page mode to provider metadata and runtime factory

### Phase 4: Claude SDK Runtime

- wire a dedicated Claude runtime layer modeled on Claudian
- stream messages into the new shell
- support settings/config used by the runtime

### Phase 5: Codex Runtime

- wire a dedicated Codex runtime layer modeled on Claudian
- support Codex process/app-server lifecycle
- surface messages and status in the same shell

### Phase 6: Cleanup / Compatibility

- reduce the old faux Claudian surface to compatibility mode only
- keep `AIChat` available as classic fallback
- make all visible Claude/Codex entry points land in the migrated Claudian shell

## Testing Requirements

- source-level tests for:
  - Claudian shell presence
  - icon switch actions
  - config / Claude / Codex page routing
  - provider registration
  - runtime scaffolding presence
- typecheck must pass
- existing AI shell tests must be updated to reflect the new shell host

## Non-Goals

- do not reproduce Obsidian-specific `ItemView` behavior literally
- do not embed a web version of Claude or Codex
- do not rewrite unrelated workbench pages
- do not remove the current app navigation model

## Final Architecture Decision

This migration will follow Claudian's architecture, not just its visual style:

- bottom layer: provider/runtime (`claude`, `codex`)
- middle layer: shell/session/tab/status/message/input state
- top layer: Claudian UI pages and config view

The implementation must preserve a one-to-one mapping between Claudian source modules and the new project modules wherever feasible.
