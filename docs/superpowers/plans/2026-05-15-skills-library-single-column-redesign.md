# Skills Library Single-Column Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the settings Skills page into a compact single-column tool list with `系统 / 个人` tabs, move full details into a dialog, and support distinct `安装 / 卸载 / 删除` behavior that matches the agreed product rules.

**Architecture:** Keep the workbench shell and current Tauri skill discovery/import flow, but replace the current two-pane page with a single dominant list surface. Add a small backend source-registry layer so personal skills can survive `卸载` as re-installable entries while `删除` remains the destructive action that removes the saved source record and installed copy.

**Tech Stack:** React, TypeScript, Tauri Rust commands, CSS, Node test runner

---

## File Structure

### Backend

- Modify: `src-tauri/src/lib.rs`
  - Extend skill discovery payloads with installation/source state needed by the new IA
  - Add separate commands for personal-skill uninstall vs delete
  - Persist a lightweight source registry for imported personal skills so they remain visible after uninstall

### Frontend skill modules

- Modify: `src/modules/ai/skills/skillLibrary.ts`
  - Add invoke wrappers and frontend types for uninstall/delete and richer entry state
- Create: `src/modules/ai/skills/skillLibraryPresentation.ts`
  - Centralize `系统 / 个人` tab grouping, `推荐 / 已装` bucket logic, badge copy, and action availability

### Frontend UI

- Modify: `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
  - Replace two-pane layout with a single-column list and compact toolbar
  - Use `系统 / 个人` tabs and section buckets
  - Move detail rendering into a dialog
- Modify: `src/components/ai/gn-agent-shell/GNAgentSkillsPage.css`
  - Remove the heavy split-pane/card-wall treatment
  - Add compact list-row, tab, section, and dialog styling that follows the workbench standard

### Tests

- Create: `tests/ai/gn-agent-skills-page-ia.test.mjs`
  - Source assertions for the new IA, single-column list, tab structure, and dialog actions
- Modify: `tests/ai/ai-chat-settings-skills-mcp.test.mjs`
  - Update top-level settings assertions to match the redesigned Skills page and new backend command surface

## Product Rules To Preserve

- `系统` tab:
  - `推荐`: official recommended skills that are not currently installed
  - `已装`: built-in system skills plus recommended skills that have been installed
  - built-in system skills are not uninstallable or deletable
  - recommended skills move from `推荐` to `已装` after install
  - uninstalling a recommended skill moves it back to `推荐`

- `个人` tab:
  - supports `导入本地` and `GitHub 导入`
  - `卸载` removes the installed copy but keeps the personal entry visible for re-install
  - `删除` removes both the installed copy and the remembered personal entry

- Main page:
  - single-column list only
  - list rows show concise summary, not full metadata wall
  - detail dialog can include `安装 / 卸载 / 删除 / 使用 / 查看全文`

### Task 1: Lock the new IA and backend contract with failing tests

**Files:**
- Create: `tests/ai/gn-agent-skills-page-ia.test.mjs`
- Modify: `tests/ai/ai-chat-settings-skills-mcp.test.mjs`
- Modify: `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing source test for the new Skills IA**

```js
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx');
const cssPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentSkillsPage.css');
const backendPath = path.resolve(__dirname, '../../src-tauri/src/lib.rs');

test('skills page uses system and personal tabs with a single-column list and detail dialog', async () => {
  const [pageSource, cssSource] = await Promise.all([
    readFile(pagePath, 'utf8'),
    readFile(cssPath, 'utf8'),
  ]);

  assert.match(pageSource, /type SkillLibraryTab = 'system' \| 'personal'/);
  assert.match(pageSource, /推荐/);
  assert.match(pageSource, /已装/);
  assert.match(pageSource, /detail dialog|详情弹窗|查看详情/);
  assert.doesNotMatch(pageSource, /grid-template-columns: minmax\(0, 0\.94fr\) minmax\(0, 1\.06fr\)/);
  assert.doesNotMatch(pageSource, /gn-agent-skills-detail-panel/);
  assert.match(cssSource, /\.gn-agent-skills-tab-list/);
  assert.match(cssSource, /\.gn-agent-skills-compact-list/);
});

test('skills backend exposes uninstall and delete separately for personal skills', async () => {
  const backendSource = await readFile(backendPath, 'utf8');

  assert.match(backendSource, /fn\s+uninstall_library_skill/);
  assert.match(backendSource, /fn\s+delete_library_skill/);
  assert.match(backendSource, /SkillSourceRegistry|skill source registry|source_registry/i);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/ai/gn-agent-skills-page-ia.test.mjs tests/ai/ai-chat-settings-skills-mcp.test.mjs`

Expected: FAIL because the page still uses `all / recommended / system / personal`, still renders a split layout, and the backend still has only `delete_library_skill`.

- [ ] **Step 3: Update existing settings-shell assertions to point at the new IA**

Replace the Skills assertions in `tests/ai/ai-chat-settings-skills-mcp.test.mjs` with source checks like:

```js
assert.match(skillsSource, /type SkillLibraryTab = 'system' \| 'personal'/);
assert.match(skillsSource, /推荐/);
assert.match(skillsSource, /已装/);
assert.match(skillsSource, /卸载/);
assert.match(skillsSource, /删除/);
assert.doesNotMatch(skillsSource, /type SkillLibraryFilter = 'all'/);
assert.doesNotMatch(skillsSource, /gn-agent-skills-shell/);
```

- [ ] **Step 4: Re-run the tests and confirm they still fail for the right reason**

Run: `node --test tests/ai/gn-agent-skills-page-ia.test.mjs tests/ai/ai-chat-settings-skills-mcp.test.mjs`

Expected: FAIL with missing frontend/backend implementation, not with syntax errors in the tests.

- [ ] **Step 5: Commit**

```bash
git add tests/ai/gn-agent-skills-page-ia.test.mjs tests/ai/ai-chat-settings-skills-mcp.test.mjs
git commit -m "test: lock skills library single-column ia"
```

### Task 2: Add backend source-registry support for uninstall vs delete

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the failing backend source assertions inside the new IA test**

Add checks that discovery entries expose enough state for frontend grouping:

```js
assert.match(backendSource, /recommended/i);
assert.match(backendSource, /builtin/);
assert.match(backendSource, /imported/);
assert.match(backendSource, /remembered_source|source_registry/i);
assert.match(backendSource, /uninstall_library_skill/);
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node --test tests/ai/gn-agent-skills-page-ia.test.mjs`

Expected: FAIL because the discovery payload and uninstall command do not exist yet.

- [ ] **Step 3: Add a small source-registry model in `src-tauri/src/lib.rs`**

Introduce structs and helpers like:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillSourceRegistryEntry {
    skill_id: String,
    name: String,
    source: String,
    source_path: String,
    manifest_path: String,
}

fn get_skill_source_registry_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(GOODNIGHT_SKILLS_DIR_NAME).join("sources.json")
}
```

And read/write helpers:

```rust
fn read_skill_source_registry(app_data_dir: &Path) -> Result<Vec<SkillSourceRegistryEntry>, String> { ... }
fn write_skill_source_registry(app_data_dir: &Path, entries: &[SkillSourceRegistryEntry]) -> Result<(), String> { ... }
fn upsert_skill_source_registry_entry(app_data_dir: &Path, entry: SkillSourceRegistryEntry) -> Result<(), String> { ... }
fn remove_skill_source_registry_entry(app_data_dir: &Path, skill_id: &str) -> Result<(), String> { ... }
```

- [ ] **Step 4: Persist registry entries on local and GitHub import**

When `import_local_skill` and `import_github_skill` succeed, also upsert the remembered source:

```rust
upsert_skill_source_registry_entry(&app_data_dir, SkillSourceRegistryEntry {
    skill_id: descriptor.id.clone(),
    name: descriptor.name.clone(),
    source: "GoodNight imported".to_string(),
    source_path: display_project_storage_path(source_path.clone()),
    manifest_path: display_project_storage_path(target_dir.join(GOODNIGHT_SKILL_MANIFEST_FILE_NAME)),
})?;
```

- [ ] **Step 5: Add `uninstall_library_skill` and change `delete_library_skill` semantics**

Implement:

```rust
#[tauri::command]
fn uninstall_library_skill(
    app_handle: tauri::AppHandle,
    params: DeleteLibrarySkillParams,
) -> Result<SkillDeleteResult, String> {
    // remove installed imported copy only
    // keep remembered source registry entry
}
```

Keep `delete_library_skill` as the destructive path:

```rust
#[tauri::command]
fn delete_library_skill(
    app_handle: tauri::AppHandle,
    params: DeleteLibrarySkillParams,
) -> Result<SkillDeleteResult, String> {
    // remove installed copy if present
    // remove remembered source registry entry
}
```

- [ ] **Step 6: Merge remembered-but-uninstalled personal skills back into discovery**

Extend `collect_skill_discovery_entries` so remembered personal skills reappear even when the imported directory is gone:

```rust
for remembered in read_skill_source_registry(app_data_dir)? {
    if seen_skill_ids.contains(&remembered.skill_id) {
        continue;
    }

    entries.push(SkillDiscoveryEntry {
        id: remembered.skill_id.clone(),
        name: remembered.name.clone(),
        category: "imported".to_string(),
        source: remembered.source.clone(),
        path: remembered.source_path.clone(),
        manifest_path: remembered.manifest_path.clone(),
        imported: false,
        builtin: false,
        deletable: true,
        synced_to_codex: false,
        synced_to_claude: false,
    });
}
```

- [ ] **Step 7: Register the new command**

Add `uninstall_library_skill` to:

```rust
tauri::generate_handler![
    discover_local_skills,
    import_local_skill,
    import_github_skill,
    uninstall_library_skill,
    delete_library_skill,
]
```

- [ ] **Step 8: Re-run the backend IA test and verify GREEN**

Run: `node --test tests/ai/gn-agent-skills-page-ia.test.mjs`

Expected: PASS for backend command-surface assertions.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/lib.rs tests/ai/gn-agent-skills-page-ia.test.mjs
git commit -m "feat: separate skill uninstall and delete states"
```

### Task 3: Add frontend presentation helpers for tabs, buckets, and action rules

**Files:**
- Create: `src/modules/ai/skills/skillLibraryPresentation.ts`
- Modify: `src/modules/ai/skills/skillLibrary.ts`
- Create: `tests/ai/gn-agent-skills-page-ia.test.mjs`

- [ ] **Step 1: Add a failing source assertion for the new presentation helper**

Add to `tests/ai/gn-agent-skills-page-ia.test.mjs`:

```js
const presentationPath = path.resolve(__dirname, '../../src/modules/ai/skills/skillLibraryPresentation.ts');
const presentationSource = await readFile(presentationPath, 'utf8');

assert.match(presentationSource, /type SkillLibraryTab = 'system' \| 'personal'/);
assert.match(presentationSource, /type SystemSkillBucket = 'recommended' \| 'installed'/);
assert.match(presentationSource, /getSkillPrimaryAction/);
assert.match(presentationSource, /canDeleteSkill/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/ai/gn-agent-skills-page-ia.test.mjs`

Expected: FAIL because `skillLibraryPresentation.ts` does not exist yet.

- [ ] **Step 3: Create `skillLibraryPresentation.ts`**

Use focused helpers:

```ts
import type { SkillDiscoveryEntry } from './skillLibrary';

export type SkillLibraryTab = 'system' | 'personal';
export type SystemSkillBucket = 'recommended' | 'installed';

export const isBuiltinSystemSkill = (skill: SkillDiscoveryEntry) =>
  skill.builtin && skill.category === 'system';

export const isRecommendedSystemSkill = (skill: SkillDiscoveryEntry) =>
  skill.source === 'GoodNight recommended';

export const getSkillTab = (skill: SkillDiscoveryEntry): SkillLibraryTab =>
  isBuiltinSystemSkill(skill) || isRecommendedSystemSkill(skill) ? 'system' : 'personal';

export const getSystemSkillBucket = (skill: SkillDiscoveryEntry): SystemSkillBucket =>
  skill.imported || isBuiltinSystemSkill(skill) ? 'installed' : 'recommended';
```

And action helpers:

```ts
export const canUninstallSkill = (skill: SkillDiscoveryEntry) =>
  !isBuiltinSystemSkill(skill) && skill.imported;

export const canDeleteSkill = (skill: SkillDiscoveryEntry) =>
  getSkillTab(skill) === 'personal';
```

- [ ] **Step 4: Extend `skillLibrary.ts` with new invoke wrappers**

Add:

```ts
export const uninstallLibrarySkill = (skillId: string) => {
  if (!isTauriRuntimeAvailable()) {
    return Promise.reject(new Error('GoodNight desktop runtime is required to uninstall skills.'));
  }

  return invoke<SkillDeleteResult>('uninstall_library_skill', { params: { skillId } });
};
```

- [ ] **Step 5: Re-run the IA test and verify GREEN**

Run: `node --test tests/ai/gn-agent-skills-page-ia.test.mjs`

Expected: PASS for the presentation-module assertions.

- [ ] **Step 6: Commit**

```bash
git add src/modules/ai/skills/skillLibrary.ts src/modules/ai/skills/skillLibraryPresentation.ts tests/ai/gn-agent-skills-page-ia.test.mjs
git commit -m "refactor: add skills library presentation helpers"
```

### Task 4: Replace the split page with a compact single-column tabbed list

**Files:**
- Modify: `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentSkillsPage.css`

- [ ] **Step 1: Write the failing source assertions for single-column layout**

Add source checks like:

```js
assert.match(pageSource, /className="gn-agent-skills-tab-list"/);
assert.match(pageSource, /className="gn-agent-skills-compact-list"/);
assert.match(pageSource, /className="gn-agent-skills-section-block"/);
assert.doesNotMatch(pageSource, /gn-agent-skills-detail-panel/);
assert.doesNotMatch(pageSource, /selectedPromptContent/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/ai/gn-agent-skills-page-ia.test.mjs`

Expected: FAIL because the page still depends on selected-row detail state.

- [ ] **Step 3: Refactor `GNAgentSkillsPage.tsx` around tab state instead of split-pane state**

Replace:

```ts
const [activeFilter, setActiveFilter] = useState<SkillLibraryFilter>('all');
const [selectedSkillKey, setSelectedSkillKey] = useState<string | null>(null);
const [selectedPromptContent, setSelectedPromptContent] = useState('');
const [selectedPromptError, setSelectedPromptError] = useState<string | null>(null);
const [isSelectedPromptLoading, setIsSelectedPromptLoading] = useState(false);
```

With:

```ts
const [activeTab, setActiveTab] = useState<SkillLibraryTab>('system');
const [detailSkill, setDetailSkill] = useState<SkillDiscoveryEntry | null>(null);
```

And derive list slices with the presentation helpers:

```ts
const systemRecommendedSkills = visibleSkills.filter(
  (skill) => getSkillTab(skill) === 'system' && getSystemSkillBucket(skill) === 'recommended'
);
const systemInstalledSkills = visibleSkills.filter(
  (skill) => getSkillTab(skill) === 'system' && getSystemSkillBucket(skill) === 'installed'
);
const personalSkills = visibleSkills.filter((skill) => getSkillTab(skill) === 'personal');
```

- [ ] **Step 4: Replace the list row component with a compact row**

Use a row shape like:

```tsx
<article className="gn-agent-skills-row">
  <button type="button" className="gn-agent-skills-row-main" onClick={() => void openDetail(skill)}>
    <div className="gn-agent-skills-row-icon" aria-hidden="true">{skill.name.slice(0, 1).toUpperCase()}</div>
    <div className="gn-agent-skills-row-copy">
      <div className="gn-agent-skills-row-title">
        <strong>{skill.name}</strong>
        <span className="gn-agent-skills-row-badge">{formatSourceBadge(skill)}</span>
      </div>
      <span className="gn-agent-skills-row-summary">{buildSkillSummary(skill)}</span>
      <div className="gn-agent-skills-row-meta">
        <span>/{skill.id}</span>
        <span>{skill.source}</span>
      </div>
    </div>
  </button>
  <div className="gn-agent-skills-row-actions">{/* quick actions */}</div>
</article>
```

- [ ] **Step 5: Rewrite the CSS to a single-column, Finder-like list**

Replace the two-pane shell with styles like:

```css
.gn-agent-skills-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.gn-agent-skills-tab-list {
  display: inline-flex;
  gap: 6px;
}

.gn-agent-skills-compact-list {
  display: grid;
  gap: 6px;
}

.gn-agent-skills-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--gn-skills-border);
  border-radius: 10px;
}
```

- [ ] **Step 6: Re-run the IA tests and verify GREEN**

Run: `node --test tests/ai/gn-agent-skills-page-ia.test.mjs tests/ai/ai-chat-settings-skills-mcp.test.mjs`

Expected: PASS for the new single-column structure checks.

- [ ] **Step 7: Commit**

```bash
git add src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx src/components/ai/gn-agent-shell/GNAgentSkillsPage.css tests/ai/gn-agent-skills-page-ia.test.mjs tests/ai/ai-chat-settings-skills-mcp.test.mjs
git commit -m "feat: redesign skills page as single-column library"
```

### Task 5: Move full details and actions into the dialog

**Files:**
- Modify: `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
- Modify: `src/components/ai/gn-agent-shell/GNAgentSkillsPage.css`

- [ ] **Step 1: Add failing source assertions for dialog actions**

Extend `tests/ai/gn-agent-skills-page-ia.test.mjs`:

```js
assert.match(pageSource, /MacDialog/);
assert.match(pageSource, /安装|导入/);
assert.match(pageSource, /卸载/);
assert.match(pageSource, /删除/);
assert.match(pageSource, /查看全文/);
assert.match(pageSource, /使用/);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/ai/gn-agent-skills-page-ia.test.mjs`

Expected: FAIL because the new dialog action set is not fully implemented yet.

- [ ] **Step 3: Centralize action handlers in the dialog**

Add handlers in `GNAgentSkillsPage.tsx`:

```ts
const handleUninstallSkill = async (skill: SkillDiscoveryEntry) => {
  await runAction(
    () => uninstallLibrarySkill(skill.id),
    `${skill.name} 已卸载，仍保留在技能列表中。`
  );
};

const handleDeleteSkill = async (skill: SkillDiscoveryEntry) => {
  await runAction(
    () => deleteLibrarySkill(skill.id),
    `${skill.name} 已从个人技能库中删除。`
  );
};
```

Render button rules:

```tsx
{!skill.imported ? <button>安装</button> : null}
{canUninstallSkill(skill) ? <button>卸载</button> : null}
{canDeleteSkill(skill) ? <button className="danger">删除</button> : null}
<button>使用</button>
<button>查看全文</button>
```

- [ ] **Step 4: Replace the old selected-row preview block with dialog-only preview**

Remove the in-page `selectedPromptContent` preview card and keep:

```tsx
<MacDialog
  open={Boolean(detailSkill)}
  onOpenChange={handleDetailDialogChange}
  title={detailSkill ? `${detailSkill.name} · 技能详情` : '技能详情'}
>
  {/* detail facts + actions + SKILL.md preview */}
</MacDialog>
```

- [ ] **Step 5: Style the dialog as a calm note-like detail view**

Add CSS like:

```css
.gn-agent-skills-detail-dialog {
  display: grid;
  gap: 12px;
}

.gn-agent-skills-detail-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.gn-agent-skills-detail-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
```

- [ ] **Step 6: Re-run the IA tests and verify GREEN**

Run: `node --test tests/ai/gn-agent-skills-page-ia.test.mjs`

Expected: PASS with dialog-action coverage.

- [ ] **Step 7: Commit**

```bash
git add src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx src/components/ai/gn-agent-shell/GNAgentSkillsPage.css tests/ai/gn-agent-skills-page-ia.test.mjs
git commit -m "feat: move skills detail and actions into dialog"
```

### Task 6: Full verification and graph refresh

**Files:**
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`

- [ ] **Step 1: Run targeted Skills and settings tests**

Run: `node --test tests/ai/gn-agent-skills-page-ia.test.mjs tests/ai/ai-chat-settings-skills-mcp.test.mjs tests/ai/ai-chat-settings-workbench-ui.test.mjs`

Expected: PASS

- [ ] **Step 2: Run the full build**

Run: `npm run build`

Expected: successful build; existing chunk-size warnings are acceptable unless new errors appear.

- [ ] **Step 3: Do a manual desktop pass on the Skills tab**

Check:

```text
1. 系统 tab 默认打开
2. 推荐 / 已装 section 显示正确
3. 内置系统技能不出现卸载/删除
4. 推荐技能安装后移动到已装
5. 推荐技能卸载后回到推荐
6. 个人技能卸载后仍留在个人列表
7. 个人技能删除后从个人列表消失
8. 列表主界面只展示简介，不再出现右侧详情栏
9. 点击行可打开详情弹窗
10. 弹窗里的操作按钮和主列表状态一致
```

- [ ] **Step 4: Refresh the graph**

Run: `graphify update .`

Expected: `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` update successfully.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src/modules/ai/skills/skillLibrary.ts src/modules/ai/skills/skillLibraryPresentation.ts src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx src/components/ai/gn-agent-shell/GNAgentSkillsPage.css tests/ai/gn-agent-skills-page-ia.test.mjs tests/ai/ai-chat-settings-skills-mcp.test.mjs graphify-out/graph.json graphify-out/GRAPH_REPORT.md
git commit -m "feat: redesign skills library settings page"
```

## Self-Review

### Spec coverage

- `系统 / 个人` top-level tabs: covered in Tasks 1, 3, and 4
- `系统` split into `推荐 / 已装`: covered in Tasks 3 and 4
- built-in system skills non-removable: covered in Tasks 2 and 3
- recommended install/uninstall migration: covered in Tasks 2, 3, and 6
- personal uninstall vs delete: covered in Tasks 2, 3, 5, and 6
- single-column list with summary-only rows: covered in Task 4
- detail dialog with actions: covered in Task 5

### Placeholder scan

- No `TODO` or `TBD` placeholders remain.
- Every task names exact files and exact verification commands.

### Type consistency

- Frontend uses `SkillLibraryTab` and `SystemSkillBucket` consistently.
- Backend keeps `SkillDeleteResult` for both uninstall and delete flows to avoid introducing unnecessary payload drift.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-15-skills-library-single-column-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
