# GoodNight Agent Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new top-level `Agent` workspace in GoodNight that runs alongside the existing AI panel, reuses the current GN agent/runtime scaffolding where safe, and moves the product toward a `cc-haha`-style multi-session agent shell with dedicated settings, approvals, and runtime surfaces.

**Architecture:** Keep the old `AIWorkspace` intact and introduce a parallel `Agent` subsystem with its own top-level navigation entry, page shell, stores, and Tauri command namespace. Reuse existing `gn-agent-shell` React components and `agent_runtime` persistence primitives as seed assets, but avoid coupling the new page to the legacy `AIChat` panel layout. On the backend, add a parallel `agent_shell` Rust module that wraps or extends existing runtime stores and progressively exposes a cleaner session-oriented contract for the new page.

**Tech Stack:** React 19, TypeScript, Zustand, Tauri v2, Rust, local JSON persistence, existing GoodNight UI primitives (`MacPanel`, `MacButton`, `WorkbenchIcon`)

---

## File Structure

### Frontend files to create

- `src/features/agent-shell/pages/AgentShellPage.tsx`
  New full-page Agent workbench entry rendered from `src/App.tsx`.
- `src/features/agent-shell/pages/AgentSettingsPage.tsx`
  Dedicated page body for provider/runtime/settings panels, wrapping or composing existing GN settings UI.
- `src/features/agent-shell/components/AgentShellLayout.tsx`
  Primary 3-column layout shell for session list, active session, and inspector panels.
- `src/features/agent-shell/components/AgentShellSidebar.tsx`
  Left rail for sessions and page switching.
- `src/features/agent-shell/components/AgentSessionWorkspace.tsx`
  Middle chat/session surface for active conversation.
- `src/features/agent-shell/components/AgentShellInspector.tsx`
  Right rail for approvals, timeline, tool runs, memory, and previews.
- `src/features/agent-shell/store/agentShellPageStore.ts`
  Page-level state for selected sub-page, active provider mode, panel state, and selected session.
- `src/features/agent-shell/types.ts`
  Shared frontend-facing types for page sections and shell view state.

### Frontend files to modify

- `src/appNavigation.ts`
  Extend `RoleView` with `agent`.
- `src/App.tsx`
  Register the new tab, top-level render branch, and desktop navigation entry.
- `src/components/ui/WorkbenchIcon.tsx`
  Add or reuse an icon for the new `Agent` role if needed.
- `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
  Extract reusable child pieces if the new page needs full-page composition.
- `src/components/ai/gn-agent-shell/GNAgentConfigPage.tsx`
  Reuse inside the new `Agent` settings section or split shared subcomponents.
- `src/components/ai/AIWorkspace.tsx`
  Keep unchanged except for any imports that move during extraction.
- `src/App.css`
  Add `Agent` page layout styling while preserving current desktop shell.

### Backend files to create

- `src-tauri/src/agent_shell/mod.rs`
  New Tauri module namespace for agent shell.
- `src-tauri/src/agent_shell/commands.rs`
  New command layer for page-oriented session/settings APIs.
- `src-tauri/src/agent_shell/session_store.rs`
  Session persistence wrapper keyed for the new Agent shell.
- `src-tauri/src/agent_shell/settings_store.rs`
  Dedicated shell settings persistence.
- `src-tauri/src/agent_shell/types.rs`
  Request/response payloads for the Agent page contract.

### Backend files to modify

- `src-tauri/src/lib.rs`
  Register the new module and expose commands without removing existing `agent_runtime` commands.

### Test files to create or update

- `tests/ai/gn-agent-shell-state.test.mjs`
  Extend to cover the new top-level page state instead of only embedded shell state.
- `tests/ai/gn-agent-config-page.test.mjs`
  Extend to cover the dedicated Agent settings page.
- `tests/ai/gn-agent-chat-structure.test.mjs`
  Update to assert the new top-level page composition.
- `tests/ai/tauri-agent-runtime-source.test.mjs`
  Extend to check new `agent_shell` command registration.
- `tests/ai/tauri-agent-runtime-source.test.mjs`
  Also assert the old runtime path is still present.
- `tests/ai/local-agent-tabs-ui.test.mjs`
  Update for the new top-level `Agent` tab.

## Task 1: Expose Agent As A Top-Level Workbench Role

**Files:**
- Modify: `src/appNavigation.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/ui/WorkbenchIcon.tsx`
- Test: `tests/ai/local-agent-tabs-ui.test.mjs`

- [ ] **Step 1: Add a failing UI test for the new top-level Agent role**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('App navigation exposes top-level agent role', () => {
  const source = fs.readFileSync('src/appNavigation.ts', 'utf8');
  assert.match(source, /'agent'/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/local-agent-tabs-ui.test.mjs`
Expected: FAIL because `RoleView` does not yet include `agent`.

- [ ] **Step 3: Extend the role model and wire the tab into desktop navigation**

```ts
export type RoleView =
  | 'product'
  | 'knowledge'
  | 'wiki'
  | 'page'
  | 'design'
  | 'develop'
  | 'test'
  | 'operations'
  | 'agent';
```

```ts
const ROLE_TAB_ICONS: Record<RoleView, WorkbenchIconName> = {
  product: 'product',
  knowledge: 'knowledge',
  wiki: 'gitBranch',
  page: 'page',
  design: 'design',
  develop: 'files',
  test: 'bug',
  operations: 'settings',
  agent: 'sparkles',
};

const DESKTOP_WORKBENCH_ROLES = [
  { id: 'knowledge', label: '知识库', summary: '笔记与资料' },
  { id: 'page', label: '页面', summary: '结构与草图' },
  { id: 'design', label: '设计', summary: '页面与画布' },
  { id: 'agent', label: 'Agent', summary: '多会话智能体工作台' },
  { id: 'develop', label: '开发', summary: '文件与任务' },
  { id: 'test', label: '测试', summary: '计划与缺陷' },
  { id: 'operations', label: '发布', summary: '部署与流程' },
];

const DESKTOP_PRIMARY_ROLES: RoleView[] = ['knowledge', 'page', 'design', 'agent'];
```

- [ ] **Step 4: Route `currentRole === 'agent'` to a dedicated page instead of the legacy AI panel**

```tsx
const roleContent =
  currentRole === 'product' || currentRole === 'knowledge'
    ? renderProductView('knowledge')
    : currentRole === 'wiki'
      ? renderProductView('knowledge')
    : currentRole === 'page'
      ? renderProductView('page')
    : currentRole === 'design'
      ? renderDesignView()
    : currentRole === 'agent'
      ? <AgentShellPage />
    : currentRole === 'develop'
      ? renderDevelopView()
    : currentRole === 'test'
      ? renderTestView()
      : renderOperationsView();
```

- [ ] **Step 5: Run the focused UI test again**

Run: `node --test tests/ai/local-agent-tabs-ui.test.mjs`
Expected: PASS and the source assertions confirm the new role.

- [ ] **Step 6: Commit**

```bash
git add src/appNavigation.ts src/App.tsx src/components/ui/WorkbenchIcon.tsx tests/ai/local-agent-tabs-ui.test.mjs
git commit -m "feat: add top-level agent workbench role"
```

## Task 2: Create The New Agent Page Shell Using Existing GN Agent Pieces

**Files:**
- Create: `src/features/agent-shell/types.ts`
- Create: `src/features/agent-shell/store/agentShellPageStore.ts`
- Create: `src/features/agent-shell/components/AgentShellLayout.tsx`
- Create: `src/features/agent-shell/components/AgentShellSidebar.tsx`
- Create: `src/features/agent-shell/components/AgentSessionWorkspace.tsx`
- Create: `src/features/agent-shell/components/AgentShellInspector.tsx`
- Create: `src/features/agent-shell/pages/AgentShellPage.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
- Test: `tests/ai/gn-agent-chat-structure.test.mjs`
- Test: `tests/ai/gn-agent-shell-state.test.mjs`

- [ ] **Step 1: Add failing tests for the new page shell structure**

```js
test('Agent shell page is composed from sidebar, session workspace, and inspector rails', () => {
  const source = fs.readFileSync('src/features/agent-shell/pages/AgentShellPage.tsx', 'utf8');
  assert.match(source, /AgentShellSidebar/);
  assert.match(source, /AgentSessionWorkspace/);
  assert.match(source, /AgentShellInspector/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/ai/gn-agent-chat-structure.test.mjs tests/ai/gn-agent-shell-state.test.mjs`
Expected: FAIL because the page files do not exist yet.

- [ ] **Step 3: Create the page store and page types**

```ts
export type AgentShellSection = 'chat' | 'settings' | 'skills';

export type AgentShellPageState = {
  activeSection: AgentShellSection;
  activeProviderMode: 'classic' | 'claude' | 'codex';
  selectedThreadId: string | null;
  inspectorTab: 'timeline' | 'approval' | 'memory';
  setActiveSection: (section: AgentShellSection) => void;
  setActiveProviderMode: (mode: 'classic' | 'claude' | 'codex') => void;
  setSelectedThreadId: (threadId: string | null) => void;
  setInspectorTab: (tab: 'timeline' | 'approval' | 'memory') => void;
};
```

- [ ] **Step 4: Compose the new page out of reusable GN agent pieces**

```tsx
export const AgentShellPage: React.FC = () => {
  const activeSection = useAgentShellPageStore((state) => state.activeSection);

  if (activeSection === 'settings') {
    return <AgentSettingsPage />;
  }

  if (activeSection === 'skills') {
    return <GNAgentSkillsPage />;
  }

  return (
    <AgentShellLayout
      sidebar={<AgentShellSidebar />}
      main={<AgentSessionWorkspace />}
      inspector={<AgentShellInspector />}
    />
  );
};
```

- [ ] **Step 5: Keep the legacy AI panel path unchanged**

```tsx
export const AIWorkspace: React.FC<AIWorkspaceProps> = ({ collapsed, onCollapsedChange }) => {
  return (
    <section className="floating-ai-workspace">
      <div className="ai-workspace-shell">
        <div className="ai-workspace-body">
          <AIChat variant="gn-agent-embedded" collapsed={collapsed} onCollapsedChange={onCollapsedChange} />
        </div>
      </div>
    </section>
  );
};
```

- [ ] **Step 6: Re-run the focused shell tests**

Run: `node --test tests/ai/gn-agent-chat-structure.test.mjs tests/ai/gn-agent-shell-state.test.mjs`
Expected: PASS and page composition assertions match the new shell.

- [ ] **Step 7: Commit**

```bash
git add src/features/agent-shell src/components/ai/gn-agent-shell/GNAgentChatPage.tsx tests/ai/gn-agent-chat-structure.test.mjs tests/ai/gn-agent-shell-state.test.mjs
git commit -m "feat: add dedicated agent shell page scaffold"
```

## Task 3: Promote Settings And Skills Into The New Agent Workspace

**Files:**
- Create: `src/features/agent-shell/pages/AgentSettingsPage.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentConfigPage.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentModeSwitch.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
- Test: `tests/ai/gn-agent-config-page.test.mjs`
- Test: `tests/ai/gn-agent-skills-page.test.mjs`

- [ ] **Step 1: Add failing tests that require settings and skills to render inside the top-level Agent workspace**

```js
test('Agent settings page renders GN agent config content', () => {
  const source = fs.readFileSync('src/features/agent-shell/pages/AgentSettingsPage.tsx', 'utf8');
  assert.match(source, /GNAgentConfigPage/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/ai/gn-agent-config-page.test.mjs tests/ai/gn-agent-skills-page.test.mjs`
Expected: FAIL because `AgentSettingsPage.tsx` does not exist yet.

- [ ] **Step 3: Wrap the old config page in a dedicated top-level settings page**

```tsx
export const AgentSettingsPage: React.FC = () => (
  <section className="agent-settings-page">
    <GNAgentConfigPage />
  </section>
);
```

- [ ] **Step 4: Simplify mode switching so the new page owns page-level navigation**

```ts
const MODE_ITEMS = [
  { id: 'classic', label: '聊天', title: 'GN Agent 聊天' },
  { id: 'claude', label: '本地', title: 'Claude 本地运行时' },
  { id: 'codex', label: 'Codex', title: 'Codex 运行时' },
];
```

- [ ] **Step 5: Keep skills accessible from the new page store rather than only the embedded switch**

```tsx
if (activeSection === 'skills') {
  return <GNAgentSkillsPage />;
}
```

- [ ] **Step 6: Run settings and skills tests**

Run: `node --test tests/ai/gn-agent-config-page.test.mjs tests/ai/gn-agent-skills-page.test.mjs`
Expected: PASS and the page composition stays isolated from the embedded AI panel.

- [ ] **Step 7: Commit**

```bash
git add src/features/agent-shell/pages/AgentSettingsPage.tsx src/components/ai/gn-agent-shell/GNAgentConfigPage.tsx src/components/ai/gn-agent-shell/GNAgentModeSwitch.tsx src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx tests/ai/gn-agent-config-page.test.mjs tests/ai/gn-agent-skills-page.test.mjs
git commit -m "feat: move agent settings and skills into top-level workspace"
```

## Task 4: Add A Parallel Tauri Agent Shell Namespace

**Files:**
- Create: `src-tauri/src/agent_shell/mod.rs`
- Create: `src-tauri/src/agent_shell/types.rs`
- Create: `src-tauri/src/agent_shell/settings_store.rs`
- Create: `src-tauri/src/agent_shell/session_store.rs`
- Create: `src-tauri/src/agent_shell/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `tests/ai/tauri-agent-runtime-source.test.mjs`

- [ ] **Step 1: Add a failing test for `agent_shell` command registration**

```js
test('lib.rs registers agent_shell commands next to legacy agent_runtime commands', () => {
  const source = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
  assert.match(source, /mod agent_shell;/);
  assert.match(source, /agent_shell::commands::/);
});
```

- [ ] **Step 2: Run the Tauri source test to verify failure**

Run: `node --test tests/ai/tauri-agent-runtime-source.test.mjs`
Expected: FAIL because `agent_shell` is not present yet.

- [ ] **Step 3: Add a clean module that wraps existing app-data persistence patterns**

```rust
pub mod commands;
pub mod session_store;
pub mod settings_store;
pub mod types;
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentShellSessionRecord {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub provider_mode: String,
    pub created_at: u64,
    pub updated_at: u64,
}
```

- [ ] **Step 4: Register non-breaking parallel commands in `lib.rs`**

```rust
mod agent_runtime;
mod agent_shell;

use agent_shell::commands::{
    create_agent_shell_session,
    get_agent_shell_settings,
    list_agent_shell_sessions,
    update_agent_shell_settings,
};
```

```rust
.invoke_handler(tauri::generate_handler![
    tool_view,
    tool_write,
    tool_remove,
    tool_rename,
    tool_mkdir,
    tool_edit,
    tool_ls,
    tool_glob,
    tool_grep,
    tool_bash,
    create_agent_shell_session,
    list_agent_shell_sessions,
    get_agent_shell_settings,
    update_agent_shell_settings,
    create_agent_thread,
    list_agent_threads,
])
```

- [ ] **Step 5: Run the focused Tauri source test again**

Run: `node --test tests/ai/tauri-agent-runtime-source.test.mjs`
Expected: PASS and legacy command assertions remain green.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/agent_shell src-tauri/src/lib.rs tests/ai/tauri-agent-runtime-source.test.mjs
git commit -m "feat: add parallel tauri agent shell namespace"
```

## Task 5: Bridge The New Page To Persistent Sessions And Runtime Settings

**Files:**
- Modify: `src/features/agent-shell/store/agentShellPageStore.ts`
- Modify: `src/features/agent-shell/components/AgentShellSidebar.tsx`
- Modify: `src/features/agent-shell/components/AgentSessionWorkspace.tsx`
- Modify: `src/features/agent-shell/components/AgentShellInspector.tsx`
- Modify: `src/modules/ai/gn-agent/gnAgentShellStore.ts`
- Modify: `src/modules/ai/gn-agent/localConfig.ts`
- Modify: `src-tauri/src/agent_shell/commands.rs`
- Test: `tests/ai/gn-agent-shell-state.test.mjs`
- Test: `tests/ai/gn-agent-provider-lock.test.mjs`

- [ ] **Step 1: Add failing tests that require sessions to be loaded from the new shell store instead of implicit embedded chat state**

```js
test('agent shell page store tracks selected thread and active section', () => {
  const source = fs.readFileSync('src/features/agent-shell/store/agentShellPageStore.ts', 'utf8');
  assert.match(source, /selectedThreadId/);
  assert.match(source, /activeSection/);
});
```

- [ ] **Step 2: Run focused tests and verify failure if state is still incomplete**

Run: `node --test tests/ai/gn-agent-shell-state.test.mjs tests/ai/gn-agent-provider-lock.test.mjs`
Expected: FAIL until the page store and provider binding are explicit.

- [ ] **Step 3: Move thread selection and provider mode into the new page-level store**

```ts
export const useAgentShellPageStore = create<AgentShellPageState>((set) => ({
  activeSection: 'chat',
  activeProviderMode: 'classic',
  selectedThreadId: null,
  inspectorTab: 'timeline',
  setActiveSection: (activeSection) => set({ activeSection }),
  setActiveProviderMode: (activeProviderMode) => set({ activeProviderMode }),
  setSelectedThreadId: (selectedThreadId) => set({ selectedThreadId }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
}));
```

- [ ] **Step 4: Load and create sessions through the new Tauri command layer**

```ts
const sessions = await invoke<AgentShellSessionRecord[]>('list_agent_shell_sessions', {
  projectId: currentProject.id,
});
```

```rust
#[tauri::command]
pub fn list_agent_shell_sessions(
    app_handle: tauri::AppHandle,
    project_id: String,
) -> Result<Vec<AgentShellSessionRecord>, String> {
    let app_data_dir = resolve_app_data_dir(&app_handle)?;
    session_store::list_sessions(&app_data_dir, &project_id)
}
```

- [ ] **Step 5: Keep the provider lock rules compatible with existing GN provider bindings**

```ts
const runtimeConfigIdOverride = usableBoundConfig?.id || preferredConfig?.id || null;
```

- [ ] **Step 6: Run focused state tests again**

Run: `node --test tests/ai/gn-agent-shell-state.test.mjs tests/ai/gn-agent-provider-lock.test.mjs`
Expected: PASS and the new page keeps provider binding rules intact.

- [ ] **Step 7: Commit**

```bash
git add src/features/agent-shell src/modules/ai/gn-agent/gnAgentShellStore.ts src/modules/ai/gn-agent/localConfig.ts src-tauri/src/agent_shell/commands.rs tests/ai/gn-agent-shell-state.test.mjs tests/ai/gn-agent-provider-lock.test.mjs
git commit -m "feat: persist agent shell sessions and settings"
```

## Task 6: Verify End-To-End Safety And Preserve The Legacy AI Panel

**Files:**
- Modify: `src/App.css`
- Modify: any touched frontend files for final CSS or layout fixes
- Modify: any touched backend files for final compile fixes
- Test: `tests/ai/local-agent-tabs-ui.test.mjs`
- Test: `tests/ai/gn-agent-chat-structure.test.mjs`
- Test: `tests/ai/gn-agent-config-page.test.mjs`
- Test: `tests/ai/gn-agent-shell-state.test.mjs`
- Test: `tests/ai/tauri-agent-runtime-source.test.mjs`

- [ ] **Step 1: Run the focused Node tests for the new Agent workbench**

Run: `node --test tests/ai/local-agent-tabs-ui.test.mjs tests/ai/gn-agent-chat-structure.test.mjs tests/ai/gn-agent-config-page.test.mjs tests/ai/gn-agent-shell-state.test.mjs tests/ai/tauri-agent-runtime-source.test.mjs`
Expected: PASS across the new top-level page and Tauri source assertions.

- [ ] **Step 2: Run the frontend build**

Run: `npm run build`
Expected: PASS with TypeScript and Vite completing successfully.

- [ ] **Step 3: Sanity-check that the legacy `AIWorkspace` path is still present in `src/App.tsx`**

```tsx
<aside className="app-ai-activity-pane">
  <AIWorkspace collapsed={isDesktopAiCollapsed} onCollapsedChange={setIsDesktopAiCollapsed} />
</aside>
```

- [ ] **Step 4: Fix only compile or layout regressions caused by the new Agent page**

```css
.agent-shell-page {
  height: 100%;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 320px;
  gap: 16px;
}
```

- [ ] **Step 5: Create the integration commit**

```bash
git add src/App.tsx src/App.css src/features/agent-shell src-tauri/src/agent_shell tests/ai
git commit -m "feat: add first-class agent shell workspace"
```

## Spec Coverage Checklist

- New top-level `Agent` tab: covered by Task 1.
- New full-page Agent shell: covered by Task 2.
- Dedicated settings and skills surfaces: covered by Task 3.
- Parallel runtime namespace in Tauri: covered by Task 4.
- Session persistence and provider/runtime settings bridge: covered by Task 5.
- Preserve legacy AI panel during coexistence: covered by Task 6.

## Placeholder Scan

- No `TODO`, `TBD`, or “implement later” markers remain.
- Every task names exact files.
- Every verification step includes a concrete command.

## Type Consistency Check

- Frontend role key is always `agent`.
- Page section keys are always `chat | settings | skills`.
- Provider mode keys are always `classic | claude | codex`.
- Backend session record name is always `AgentShellSessionRecord`.
