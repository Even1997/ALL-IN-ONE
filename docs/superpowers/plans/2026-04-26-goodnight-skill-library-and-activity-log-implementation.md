# GoodNight Skill Library And Activity Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working vertical slice of the GoodNight local skill library and change-first activity log: discover local skills, import them into a GoodNight-owned directory, and expose Skills plus Activity views in the AI sidebar.

**Architecture:** Add a small Tauri skill-management boundary that owns `~/.goodnight/skills`, scans known local skill directories, and imports selected skills into a canonical package skeleton. Extend the AI chat store with run-scoped activity entries, then surface both discovered/imported skills and change-first activity logs inside the existing AI sidebar without redesigning the whole workbench.

**Tech Stack:** Tauri Rust commands, React, TypeScript, Zustand, Node test runner

---

## File Structure

### Backend

- Modify: `src-tauri/src/lib.rs`
  - Add GoodNight root helpers
  - Add skill discovery/import command payloads
  - Register new commands in the Tauri handler

### Frontend skill modules

- Create: `src/modules/ai/skills/skillLibrary.ts`
  - Shared types and invoke wrappers for Tauri skill commands
- Create: `src/modules/ai/skills/activityLog.ts`
  - Shared types for run summaries and change-first activity entries

### Frontend store/UI

- Modify: `src/modules/ai/store/aiChatStore.ts`
  - Persist per-project activity log entries
  - Add append and list helpers
- Modify: `src/components/workspace/AIChat.tsx`
  - Add shell mode switch for chat, skills, activity
  - Load skill discovery data
  - Import skills
  - Write change-first activity summaries after successful changed runs
- Modify: `src/components/workspace/AIChat.css`
  - Add layout and card styles for Skills and Activity views

### Tests

- Create: `tests/ai/skill-library-source.test.mjs`
  - Source assertions for new Tauri commands and `.goodnight` directory ownership
- Modify: `tests/ai/ai-chat-store.test.mjs`
  - Add activity log persistence tests
- Create: `tests/ai/ai-chat-skills-and-activity-ui.test.mjs`
  - Source assertions for Skills and Activity views in `AIChat.tsx`

## Scope Notes

This plan intentionally implements only the first slice:

- Local discovery from known directories
- Import into GoodNight canonical package skeleton
- Built-in UI visibility
- Change-first activity log

This plan does not yet implement:

- GitHub catalog install/update
- Runtime sync to Codex or Claude directories
- Full support-matrix editing
- Deep skill review workflow

### Task 1: Lock backend skill directory and command surface with failing tests

**Files:**
- Create: `tests/ai/skill-library-source.test.mjs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing source test for GoodNight skill commands**

```js
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const libPath = path.resolve(__dirname, '../../src-tauri/src/lib.rs');

test('tauri owns a GoodNight skill root and exposes discovery plus import commands', async () => {
  const source = await readFile(libPath, 'utf8');

  assert.match(source, /join\(".*goodnight.*"\)/i);
  assert.match(source, /fn\s+discover_local_skills/);
  assert.match(source, /fn\s+import_local_skill/);
  assert.match(source, /tauri::generate_handler!\[[\s\S]*discover_local_skills/);
  assert.match(source, /tauri::generate_handler!\[[\s\S]*import_local_skill/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/ai/skill-library-source.test.mjs`

Expected: FAIL because `discover_local_skills` and `import_local_skill` are not defined yet.

- [ ] **Step 3: Implement the minimal Rust command surface**

Add Rust structs and commands in `src-tauri/src/lib.rs`:

```rust
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillDiscoveryEntry {
    id: String,
    name: String,
    source: String,
    path: String,
    manifest_path: String,
    imported: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportLocalSkillParams {
    source_path: String,
}

#[tauri::command]
fn discover_local_skills(app_handle: tauri::AppHandle) -> Result<Vec<SkillDiscoveryEntry>, String> {
    // scan ~/.codex/skills and project .claude/skills, return normalized entries
}

#[tauri::command]
fn import_local_skill(app_handle: tauri::AppHandle, params: ImportLocalSkillParams) -> Result<SkillDiscoveryEntry, String> {
    // create ~/.goodnight/skills/packages/<id>/skill.json and copy SKILL.md when present
}
```

- [ ] **Step 4: Re-run the test and verify GREEN**

Run: `node --test tests/ai/skill-library-source.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/ai/skill-library-source.test.mjs src-tauri/src/lib.rs
git commit -m "test: lock goodnight skill command surface"
```

### Task 2: Add persistent change-first activity log to the AI chat store

**Files:**
- Modify: `src/modules/ai/store/aiChatStore.ts`
- Modify: `tests/ai/ai-chat-store.test.mjs`
- Create: `src/modules/ai/skills/activityLog.ts`

- [ ] **Step 1: Write the failing activity log store test**

```js
test('ai chat store persists project activity entries separately from chat history', async () => {
  const { useAIChatStore, appendActivityEntry } = await loadStore();
  const store = useAIChatStore.getState();

  store.ensureProjectState('project-log');
  store.appendActivityEntry('project-log', {
    id: 'activity_1',
    runId: 'run_1',
    type: 'run-summary',
    summary: '更新了 knowledge/spec.md',
    changedPaths: ['knowledge/spec.md'],
    createdAt: 1,
  });

  const projectState = useAIChatStore.getState().projects['project-log'];
  assert.equal(projectState.activityEntries.length, 1);
  assert.equal(projectState.activityEntries[0].changedPaths[0], 'knowledge/spec.md');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/ai/ai-chat-store.test.mjs`

Expected: FAIL because `activityEntries` and `appendActivityEntry` do not exist yet.

- [ ] **Step 3: Add minimal shared activity types and store support**

Create `src/modules/ai/skills/activityLog.ts`:

```ts
export type ActivityEntryType =
  | 'run-summary'
  | 'document-changed'
  | 'artifact-created'
  | 'artifact-deleted'
  | 'confirmation-required'
  | 'conflict'
  | 'failed';

export type ActivityEntry = {
  id: string;
  runId: string;
  type: ActivityEntryType;
  summary: string;
  changedPaths: string[];
  runtime?: 'built-in' | 'local';
  skill?: string | null;
  createdAt: number;
};
```

Extend `src/modules/ai/store/aiChatStore.ts` so each project state contains:

```ts
type ChatProjectState = {
  activeSessionId: string | null;
  sessions: ChatSession[];
  activityEntries: ActivityEntry[];
};
```

And add:

```ts
appendActivityEntry: (projectId: string, entry: ActivityEntry) => void;
```

- [ ] **Step 4: Re-run the test and verify GREEN**

Run: `node --test tests/ai/ai-chat-store.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/ai/skills/activityLog.ts src/modules/ai/store/aiChatStore.ts tests/ai/ai-chat-store.test.mjs
git commit -m "feat: add change-first activity log store"
```

### Task 3: Add a skill library frontend module and lock the UI shell with failing tests

**Files:**
- Create: `src/modules/ai/skills/skillLibrary.ts`
- Create: `tests/ai/ai-chat-skills-and-activity-ui.test.mjs`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChat.css`

- [ ] **Step 1: Write the failing UI source test**

```js
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const cssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');

test('AIChat exposes chat, skills, and activity views in the shell', async () => {
  const source = await readFile(chatPath, 'utf8');
  const css = await readFile(cssPath, 'utf8');

  assert.match(source, /chat-shell-view-tabs/);
  assert.match(source, /Skills/);
  assert.match(source, /Activity/);
  assert.match(source, /discover_local_skills/);
  assert.match(css, /\.chat-skill-library/);
  assert.match(css, /\.chat-activity-log/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/ai/ai-chat-skills-and-activity-ui.test.mjs`

Expected: FAIL because the view tabs and new class names do not exist yet.

- [ ] **Step 3: Add the minimal frontend skill module**

Create `src/modules/ai/skills/skillLibrary.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';

export type SkillDiscoveryEntry = {
  id: string;
  name: string;
  source: string;
  path: string;
  manifestPath: string;
  imported: boolean;
};

export const discoverLocalSkills = () =>
  invoke<SkillDiscoveryEntry[]>('discover_local_skills');

export const importLocalSkill = (sourcePath: string) =>
  invoke<SkillDiscoveryEntry>('import_local_skill', { params: { sourcePath } });
```

- [ ] **Step 4: Add the Skills and Activity shell views**

Update `AIChat.tsx` to:

- add `const [activePanel, setActivePanel] = useState<'chat' | 'skills' | 'activity'>('chat');`
- render a small three-tab shell header control
- load discovery data when the `skills` view opens
- show discovered skills with `Import` buttons
- show activity entries in a dedicated `Activity Log` timeline

Minimal JSX target:

```tsx
<div className="chat-shell-view-tabs">
  <button type="button">Chat</button>
  <button type="button">Skills</button>
  <button type="button">Activity</button>
</div>
```

- [ ] **Step 5: Add the minimal CSS**

Add new blocks in `src/components/workspace/AIChat.css`:

```css
.chat-shell-view-tabs { /* compact segmented control */ }
.chat-skill-library { /* scrollable panel */ }
.chat-skill-card { /* skill item */ }
.chat-activity-log { /* timeline list */ }
.chat-activity-entry { /* summary card */ }
```

- [ ] **Step 6: Re-run the UI test and verify GREEN**

Run: `node --test tests/ai/ai-chat-skills-and-activity-ui.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/modules/ai/skills/skillLibrary.ts src/components/workspace/AIChat.tsx src/components/workspace/AIChat.css tests/ai/ai-chat-skills-and-activity-ui.test.mjs
git commit -m "feat: add skill library and activity views"
```

### Task 4: Wire run-scoped change summaries into the built-in chat flow

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/modules/ai/store/aiChatStore.ts`

- [ ] **Step 1: Add a failing store-driven behavior test if needed**

If the store tests do not yet prove append order and truncation behavior, add:

```js
test('latest activity entries are kept in reverse chronological order', async () => {
  const { useAIChatStore } = await loadStore();
  const store = useAIChatStore.getState();
  store.ensureProjectState('project-order');

  store.appendActivityEntry('project-order', {
    id: 'a1',
    runId: 'run_1',
    type: 'run-summary',
    summary: 'first',
    changedPaths: ['a.md'],
    createdAt: 1,
  });
  store.appendActivityEntry('project-order', {
    id: 'a2',
    runId: 'run_2',
    type: 'run-summary',
    summary: 'second',
    changedPaths: ['b.md'],
    createdAt: 2,
  });

  const entries = useAIChatStore.getState().projects['project-order'].activityEntries;
  assert.equal(entries[0].id, 'a2');
});
```

- [ ] **Step 2: Run the test and verify RED if added**

Run: `node --test tests/ai/ai-chat-store.test.mjs`

Expected: FAIL only if the new ordering rule is not yet implemented.

- [ ] **Step 3: Write the minimal change-first logging logic**

Inside `AIChat.tsx`, after a built-in run completes:

- compute a `runId`
- inspect the prompt context and assistant output
- if a run produced a file or artifact change signal, append a `run-summary`
- if a run is plain chat, do not append an activity entry

Keep the first version heuristic simple:

```ts
const maybeCreateActivityEntry = (content: string) => {
  const changedPaths = Array.from(content.matchAll(/`([^`]+\.(?:md|json|html|tsx|ts|css))`/g)).map((match) => match[1]);
  if (changedPaths.length === 0) {
    return null;
  }
  return {
    id: `activity_${Date.now()}`,
    runId,
    type: 'run-summary',
    summary: `更新了 ${changedPaths.join('、')}`,
    changedPaths,
    runtime: 'built-in',
    skill: skillIntent?.skill || null,
    createdAt: Date.now(),
  };
};
```

- [ ] **Step 4: Re-run the relevant tests**

Run: `node --test tests/ai/ai-chat-store.test.mjs tests/ai/ai-chat-skills-and-activity-ui.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/workspace/AIChat.tsx src/modules/ai/store/aiChatStore.ts tests/ai/ai-chat-store.test.mjs tests/ai/ai-chat-skills-and-activity-ui.test.mjs
git commit -m "feat: log change-first AI run summaries"
```

## Self-Review Checklist

- Task 1 covers the `.goodnight` root and Tauri command surface.
- Task 2 covers persistent activity storage.
- Task 3 covers the visible Skills and Activity UI.
- Task 4 covers run-scoped change logging behavior.

Placeholder scan:

- No `TBD`
- No implicit “handle appropriately”
- Every task names exact files and commands

Type consistency:

- `SkillDiscoveryEntry` is the shared backend/frontend discovery shape
- `ActivityEntry` is the shared store/UI log shape
- `appendActivityEntry()` is the only new store write API for log entries

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-26-goodnight-skill-library-and-activity-log-implementation.md`.

Per the current request, proceed with **Inline Execution** in this session against the plan’s first vertical slice.
