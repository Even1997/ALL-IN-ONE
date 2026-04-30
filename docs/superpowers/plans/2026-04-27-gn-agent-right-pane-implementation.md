# GN Agent Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the right-side AI surface feel like a complete GN Agent command center rather than a hidden chat box or legacy AI shell.

**Architecture:** Keep `AIChat` as the execution owner and add a lane-based agent UI around its existing chat, context, skills, artifact, and activity state. Remove visible legacy shell language by routing the workspace through GN Agent naming while preserving existing local runtime bridges as internal execution plugins.

**Tech Stack:** React 19, TypeScript, Zustand, Vite, static Node tests, Tauri invoke bridge.

---

## Files

- Modify: `src/components/workspace/AIChat.tsx`
  - Add GN Agent lane state.
  - Render `Chat`, `Tasks`, `Artifacts`, `Context`, `Skills`, and `Activity` panels.
  - Keep the composer available at the bottom.
  - Make skill shortcuts visible and clickable.
- Modify: `src/components/workspace/AIChat.css`
  - Add stable three-layer GN Agent layout styles.
  - Add lane tab, task, artifact, context, skill, and activity panel styles.
- Modify: `src/components/ai/AIWorkspace.tsx`
  - Route the right-side workspace through GN Agent identity instead of the legacy workspace wrapper.
- Create: `src/components/ai/GNAgentWorkspace.tsx`
  - Small wrapper for the right pane using `AIChat`.
- Modify: `tests/ai/ai-chat-skills-and-activity-ui.test.mjs`
  - Assert GN Agent lanes and skill visibility.
- Modify: `tests/ai/local-agent-tabs-ui.test.mjs`
  - Stop requiring Claude/Codex as primary header tabs.

## Task 1: Add Failing GN Agent UI Tests

- [ ] **Step 1: Update static UI test expectations**

Edit `tests/ai/ai-chat-skills-and-activity-ui.test.mjs` so it requires:

```js
assert.match(source, /AgentLaneId/);
assert.match(source, /GN_AGENT_LANES/);
assert.match(source, /Tasks/);
assert.match(source, /Skills/);
assert.match(source, /Activity/);
assert.match(source, /chat-agent-lane-tabs/);
assert.match(source, /chat-agent-capability-grid/);
assert.match(source, /@变更同步|@鍙樻洿鍚屾/);
assert.doesNotMatch(source, /Legacy Workspace/);
assert.doesNotMatch(source, /Legacy Settings/);
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
node --test tests/ai/ai-chat-skills-and-activity-ui.test.mjs
```

Expected: failure because `AgentLaneId`, `GN_AGENT_LANES`, and the new lane CSS do not exist yet.

## Task 2: Implement GN Agent Lanes In `AIChat`

- [ ] **Step 1: Add lane types and definitions**

In `src/components/workspace/AIChat.tsx`, add a lane type and definitions near the existing local UI types:

```ts
type AgentLaneId = 'chat' | 'tasks' | 'artifacts' | 'context' | 'skills' | 'activity';

const GN_AGENT_LANES: Array<{ id: AgentLaneId; label: string; description: string }> = [
  { id: 'chat', label: 'Chat', description: '自然语言协作' },
  { id: 'tasks', label: 'Tasks', description: '任务与运行状态' },
  { id: 'artifacts', label: 'Artifacts', description: '产物和变更' },
  { id: 'context', label: 'Context', description: '引用与上下文' },
  { id: 'skills', label: 'Skills', description: 'GN Agent 能力' },
  { id: 'activity', label: 'Activity', description: '执行记录' },
];
```

- [ ] **Step 2: Add lane state**

Inside `AIChat`, add:

```ts
const [activeAgentLane, setActiveAgentLane] = useState<AgentLaneId>('chat');
```

- [ ] **Step 3: Render top lane tabs**

In the header, render a compact tab row:

```tsx
<nav className="chat-agent-lane-tabs" aria-label="GN Agent capabilities">
  {GN_AGENT_LANES.map((lane) => (
    <button
      key={lane.id}
      type="button"
      className={lane.id === activeAgentLane ? 'active' : ''}
      aria-pressed={lane.id === activeAgentLane}
      title={lane.description}
      onClick={() => setActiveAgentLane(lane.id)}
    >
      {lane.label}
    </button>
  ))}
</nav>
```

- [ ] **Step 4: Add lane panel rendering**

Render chat messages only when `activeAgentLane === 'chat'`. For other lanes, render dedicated panels that reuse existing computed values:

```tsx
const activeLaneContent =
  activeAgentLane === 'chat' ? (
    <GNAgentMessageList ... />
  ) : activeAgentLane === 'tasks' ? (
    <section className="chat-agent-panel chat-agent-task-panel">...</section>
  ) : activeAgentLane === 'artifacts' ? (
    <section className="chat-agent-panel chat-agent-artifact-panel">...</section>
  ) : activeAgentLane === 'context' ? (
    <section className="chat-agent-panel chat-agent-context-panel">...</section>
  ) : activeAgentLane === 'skills' ? (
    <section className="chat-agent-panel chat-agent-skills-panel">...</section>
  ) : (
    <section className="chat-agent-panel chat-agent-activity-panel">...</section>
  );
```

- [ ] **Step 5: Verify targeted test passes**

Run:

```bash
node --test tests/ai/ai-chat-skills-and-activity-ui.test.mjs
```

Expected: pass.

## Task 3: Rename The Visible Workspace Shell To GN Agent

- [ ] **Step 1: Create `GNAgentWorkspace`**

Create `src/components/ai/GNAgentWorkspace.tsx`:

```tsx
import React from 'react';
import { AIChat } from '../workspace/AIChat';

export const GNAgentWorkspace: React.FC = () => (
  <section className="gn-agent-workspace">
    <AIChat variant="gn-agent-embedded" />
  </section>
);
```

- [ ] **Step 2: Route `AIWorkspace` to `GNAgentWorkspace`**

Replace the legacy workspace import and usage in `src/components/ai/AIWorkspace.tsx` with `GNAgentWorkspace`.

- [ ] **Step 3: Verify source no longer exposes legacy shell naming as the active right-pane workspace**

Run:

```bash
Select-String -Path src\components\ai\AIWorkspace.tsx -Pattern 'GNAgentWorkspace'
```

Expected: no matches.

## Task 4: Style The Three-Layer Agent Pane

- [ ] **Step 1: Add stable lane styles**

Add styles to `src/components/workspace/AIChat.css`:

```css
.chat-agent-lane-tabs {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 4px;
}

.chat-agent-lane-tabs button {
  min-height: 32px;
  border-radius: var(--style-radius-xs);
  border: 1px solid var(--mode-border, rgba(255, 255, 255, 0.08));
  background: color-mix(in srgb, var(--mode-panel-alt, rgba(255, 255, 255, 0.06)) 92%, transparent);
  color: var(--mode-muted, rgba(255, 255, 255, 0.68));
  cursor: pointer;
}

.chat-agent-lane-tabs button.active {
  background: color-mix(in srgb, var(--mode-accent, #60a5fa) 12%, var(--mode-panel-alt, rgba(255, 255, 255, 0.08)));
  color: var(--mode-text, #f8fafc);
}
```

- [ ] **Step 2: Add panel/card styles**

Add `.chat-agent-panel`, `.chat-agent-panel-header`, `.chat-agent-capability-grid`, `.chat-agent-capability-card`, `.chat-agent-task-list`, `.chat-agent-artifact-list`, and responsive rules.

- [ ] **Step 3: Verify CSS test assertions**

Run:

```bash
node --test tests/ai/ai-chat-skills-and-activity-ui.test.mjs
```

Expected: pass.

## Task 5: Adjust Local Runtime Tests For Plugin Semantics

- [ ] **Step 1: Update local runtime test copy**

Modify `tests/ai/local-agent-tabs-ui.test.mjs` so it verifies internal runtime support still exists, but no longer requires Claude/Codex to be the primary product tabs.

- [ ] **Step 2: Run local runtime tests**

Run:

```bash
node --test tests/ai/local-agent-tabs-ui.test.mjs
```

Expected: pass.

## Task 6: Final Verification

- [ ] **Step 1: Run targeted AI tests**

Run:

```bash
node --test tests/ai/ai-chat-skills-and-activity-ui.test.mjs tests/ai/local-agent-tabs-ui.test.mjs tests/ai/chat-workflow-routing.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build complete with exit code 0.

## Self-Review

- Spec coverage: the plan covers GN Agent identity, six lanes, visible skills, context/artifacts/activity panels, and legacy shell removal.
- Placeholder scan: no `TBD` or `TODO` remains.
- Type consistency: `AgentLaneId`, `GN_AGENT_LANES`, and CSS class names are defined once and reused consistently.
