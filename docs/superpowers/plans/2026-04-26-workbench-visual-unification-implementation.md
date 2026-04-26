# Workbench Visual Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the workbench light and dark themes into a colder blue desktop tool aesthetic with tighter, shared radii and more consistent shell styling.

**Architecture:** Keep the current component structure and behavior intact while tightening the shared visual system. Update the workbench theme tokens in `src/App.css`, then align the main workspace, explorer, terminal, and AI chat CSS to consume the same radius and surface rules.

**Tech Stack:** React, TypeScript, CSS, Node test runner

---

### Task 1: Lock the visual contract in source tests

**Files:**
- Modify: `tests/app-theme.test.mjs`

- [ ] Add failing assertions for the new workbench theme tokens.
- [ ] Add failing assertions for the shared radius ladder.
- [ ] Add failing assertions that workspace, explorer, terminal, and AI chat use the shared radius tokens.
- [ ] Run `node --test tests/app-theme.test.mjs` and confirm the new assertions fail before CSS changes.

### Task 2: Update shared workbench theme tokens

**Files:**
- Modify: `src/App.css`

- [ ] Add the shared radius variables used by the workbench refresh.
- [ ] Replace the current refreshed workbench light tokens with colder whites and deep blue emphasis.
- [ ] Replace the current refreshed workbench dark tokens with navy surfaces and cool blue emphasis.
- [ ] Keep theme usage scoped to the current refreshed root theme block instead of rewriting unrelated earlier CSS history.

### Task 3: Unify workspace shell surfaces

**Files:**
- Modify: `src/components/workspace/Workspace.css`

- [ ] Tighten shell, toolbar, task strip, editor, buttons, and inline note radii to the shared ladder.
- [ ] Reduce pill usage where controls should feel more tool-like.
- [ ] Move desktop workspace surfaces toward the new light/dark panel system without changing layout behavior.
- [ ] Keep splitter affordances intact and aligned to the new accent color.

### Task 4: Align explorer and terminal surfaces

**Files:**
- Modify: `src/components/workspace/FileExplorer.css`
- Modify: `src/components/workspace/Terminal.css`

- [ ] Tighten file row, context menu, icon button, and terminal action/input radii to the shared ladder.
- [ ] Keep spacing on the 8px rhythm.
- [ ] Ensure light mode stays clean and dark mode still reads as a coherent workbench.

### Task 5: Align AI chat shell and supporting surfaces

**Files:**
- Modify: `src/components/workspace/AIChat.css`

- [ ] Reduce oversized shell and drawer rounding.
- [ ] Apply the shared radius ladder to header controls, message bubbles, history rows, composer shell, tool cards, and settings cards.
- [ ] Tone down floating softness while preserving hierarchy and readability.

### Task 6: Verify

**Files:**
- Modify: none

- [ ] Run `node --test tests/app-theme.test.mjs`.
- [ ] Run `node --test tests/desktop-workbench-ui.test.mjs`.
- [ ] Run `npm run build`.
- [ ] Review failures and fix them before claiming completion.
