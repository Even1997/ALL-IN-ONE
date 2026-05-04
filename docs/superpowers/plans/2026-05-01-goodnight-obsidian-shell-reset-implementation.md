# GoodNight Obsidian Shell Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn GoodNight into a vault-first Obsidian-style desktop shell that keeps only real local files, Markdown note editing, and API-backed AI chat.

**Architecture:** Collapse the product around `ProjectConfig.vaultPath` as the only user-facing vault root, remove the packaged knowledge backend and its hidden runtime state, and keep Tauri as a thin local filesystem bridge. The frontend keeps the file tree, Markdown workspace, and AI shell, but AI context must come from open files and visible vault structure instead of `m-flow`, atoms, graph, or `_goodnight/outputs`. Existing dirty user edits in `src/components/workspace/AIChat.tsx`, `src/store/projectStore.ts`, `src/modules/knowledge/m-flow/runtime.ts`, and the related tests must be merged carefully rather than overwritten.

**Tech Stack:** Tauri 2, React 19, TypeScript, Zustand, Node test runner, Cargo workspace

---

## File Map

- `Cargo.toml`
  Workspace membership. This must stop building the deleted knowledge backend crates.
- `package.json`
  Frontend/Tauri scripts. This must stop invoking the sidecar build script.
- `scripts/build-goodnight-server.js`
  Legacy sidecar build helper. Delete once Tauri no longer packages sidecars.
- `src-tauri/Cargo.toml`
  Tauri crate dependencies. Remove `goodnight-core`, `reqwest`, and any other sidecar-only deps once `lib.rs` stops using them.
- `src-tauri/tauri.conf.json`
  App build/package config. Remove `build:server` hooks and `bundle.externalBin`.
- `src-tauri/src/lib.rs`
  Tauri runtime bridge. Keep filesystem/project commands and built-in skill installation, remove local knowledge server bootstrap, token generation, and `get_local_knowledge_server_config`.
- `goodnight-skills/built-in/goodnight-boundary/*`
  Built-in shell-safety instructions. Update wording so it references only the real vault and visible project files.
- `goodnight-skills/built-in/goodnight-workspace-context/*`
  Built-in vault-context instructions. Remove `.goodnight/m-flow` and `_goodnight/outputs/*` guidance.
- `goodnight-skills/built-in/goodnight-m-flow/**`
  Delete.
- `goodnight-skills/built-in/goodnight-llmwiki/**`
  Delete.
- `goodnight-skills/built-in/goodnight-rag/**`
  Delete.
- `src/utils/projectPersistence.ts`
  Frontend vault path contract. Replace knowledge-runtime directory helpers with direct vault helpers and stop creating hidden runtime/output folders.
- `src/App.tsx`
  App shell project lifecycle. Stop auto-creating legacy knowledge directories and rename user-facing “knowledge” entry points toward vault/notes semantics.
- `src/components/product/ProductWorkbench.tsx`
  Main workspace composition. Remove organize/rebuild graph flows and make the central workspace a vault-first file-and-note editor.
- `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
  Current note workspace. Convert it into a vault-note workspace: no knowledge filters, no m-flow refresh button, no “system index/AI summary” copy.
- `src/features/knowledge/workspace/KnowledgeGraphWorkspace.tsx`
  Delete.
- `src/features/knowledge/api/**`
  Delete the knowledge-client layer that depends on `get_local_knowledge_server_config`.
- `src/components/workspace/AIChat.tsx`
  AI shell. Remove knowledge-runtime orchestration, proposal lanes tied to organize flows, and m-flow prompt context. Keep API-backed chat, project file ops, and visible vault context only. This file is already dirty; merge instead of replacing.
- `src/modules/knowledge/m-flow/**`
  Delete after all imports are removed. The file `runtime.ts` is already dirty; review current user edits before deleting or replacing references.
- `tests/obsidian-shell-stack.test.mjs`
  New regression test that locks in the removal of sidecars and backend crates.
- `tests/ai/goodnight-builtin-skills-source.test.mjs`
  Update for the reduced built-in skill set and vault-only wording.
- `tests/local-vault-knowledge-base.test.mjs`
  Rewrite to assert direct vault behavior instead of `.goodnight/m-flow` and `_goodnight/outputs`.
- `tests/knowledge-workspace-ui.test.mjs`
  Rewrite around vault-note wording and removal of organize/graph controls.
- `tests/ai/chat-context.test.mjs`
  Update expectations from `knowledge` scene labels toward `vault` / `current file` semantics.
- Legacy tests that exist only to protect deleted runtime behavior
  Delete or rewrite: `tests/m-flow-*.test.mjs`, `tests/knowledge-graph-workspace.test.mjs`, `tests/goodnight-server-branding.test.mjs`, `tests/goodnight-mcp-bridge.test.mjs`, `tests/ai/knowledge-*.test.mjs`, and any remaining assertions that require atoms, graph, sidecar, hidden outputs, or organize lanes.

## Task 1: Reset the Cargo/Tauri shell to a sidecar-free app

**Files:**
- Create: `tests/obsidian-shell-stack.test.mjs`
- Modify: `Cargo.toml`
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Delete: `scripts/build-goodnight-server.js`
- Delete: `crates/goodnight-server/**`
- Delete: `crates/goodnight-mcp-bridge/**`
- Delete: `crates/goodnight-core/**`

- [ ] **Step 1: Write the failing shell-stack regression test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('obsidian shell build no longer references packaged knowledge backend crates or sidecars', async () => {
  const cargoRoot = await readFile(new URL('../Cargo.toml', import.meta.url), 'utf8');
  const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const tauriCargo = await readFile(new URL('../src-tauri/Cargo.toml', import.meta.url), 'utf8');
  const tauriConfig = await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8');

  assert.doesNotMatch(cargoRoot, /goodnight-core/);
  assert.doesNotMatch(cargoRoot, /goodnight-server/);
  assert.doesNotMatch(cargoRoot, /goodnight-mcp-bridge/);

  assert.doesNotMatch(packageJson, /build:server/);
  assert.doesNotMatch(tauriCargo, /goodnight-core/);
  assert.doesNotMatch(tauriConfig, /goodnight-server/);
  assert.doesNotMatch(tauriConfig, /goodnight-mcp-bridge/);
  assert.doesNotMatch(tauriConfig, /beforeDevCommand\":\\s*\"npm run build:server/);
  assert.doesNotMatch(tauriConfig, /beforeBuildCommand\":\\s*\"npm run build:server/);
});
```

- [ ] **Step 2: Run the test to verify the legacy stack is still present**

Run: `node --test tests/obsidian-shell-stack.test.mjs`

Expected: FAIL because the workspace still contains `goodnight-core`, `goodnight-server`, `goodnight-mcp-bridge`, the `build:server` script, and Tauri sidecar packaging.

- [ ] **Step 3: Remove sidecar build/package wiring**

```toml
# Cargo.toml
[workspace]
resolver = "2"
members = [
  "src-tauri",
]
```

```json
// package.json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "package:win": "powershell -ExecutionPolicy Bypass -File ./scripts/package-win.ps1"
  }
}
```

```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
regex = "1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter", "fmt"] }
```

```json
// src-tauri/tauri.conf.json
{
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 4: Delete the sidecar-only files**

Run: `rg -n "goodnight-server|goodnight-mcp-bridge|goodnight-core" Cargo.toml package.json src-tauri`

Expected: Only intentional references in tests/docs remain before deleting `scripts/build-goodnight-server.js` and the three Rust crates.

- [ ] **Step 5: Re-run the shell-stack test and Cargo check**

Run: `node --test tests/obsidian-shell-stack.test.mjs`

Expected: PASS

Run: `cargo check -p tauri-app`

Expected: PASS with no dependency resolution for deleted backend crates

- [ ] **Step 6: Commit**

```bash
git add Cargo.toml package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json tests/obsidian-shell-stack.test.mjs
git rm -r scripts/build-goodnight-server.js crates/goodnight-core crates/goodnight-server crates/goodnight-mcp-bridge
git commit -m "refactor: remove packaged knowledge backend stack"
```

### Task 2: Strip Tauri runtime knowledge-sidecar logic and reduce built-in skills to vault-safe defaults

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `tests/ai/goodnight-builtin-skills-source.test.mjs`
- Modify: `goodnight-skills/built-in/goodnight-boundary/SKILL.md`
- Modify: `goodnight-skills/built-in/goodnight-workspace-context/SKILL.md`
- Delete: `goodnight-skills/built-in/goodnight-m-flow/**`
- Delete: `goodnight-skills/built-in/goodnight-llmwiki/**`
- Delete: `goodnight-skills/built-in/goodnight-rag/**`

- [ ] **Step 1: Write the failing built-in-skill regression**

```js
const skillIds = [
  'goodnight-boundary',
  'goodnight-workspace-context',
  'goodnight-sketch-output',
  'goodnight-design-output',
];

assert.doesNotMatch(libSource, /get_local_knowledge_server_config/);
assert.doesNotMatch(libSource, /bootstrap_knowledge_sidecar/);
assert.doesNotMatch(libSource, /goodnight-m-flow/);
assert.doesNotMatch(libSource, /goodnight-llmwiki/);
assert.doesNotMatch(libSource, /goodnight-rag/);
assert.doesNotMatch(boundary, /_goodnight\/outputs/);
assert.doesNotMatch(boundary, /\.goodnight\/m-flow/);
assert.doesNotMatch(workspace, /_goodnight\/outputs/);
assert.doesNotMatch(workspace, /\.goodnight\/m-flow/);
```

- [ ] **Step 2: Run the test to confirm the legacy runtime is still wired**

Run: `node --test tests/ai/goodnight-builtin-skills-source.test.mjs`

Expected: FAIL because `lib.rs` still bootstraps the sidecar and seeds `goodnight-m-flow`, `goodnight-llmwiki`, and `goodnight-rag`.

- [ ] **Step 3: Remove Tauri-side knowledge server bootstrap and keep only skill seeding + filesystem commands**

```rust
const GOODNIGHT_BUILTIN_SKILL_IDS: &[&str] = &[
    "goodnight-boundary",
    "goodnight-workspace-context",
    "goodnight-sketch-output",
    "goodnight-design-output",
];
```

```rust
// Delete these from lib.rs:
// - LocalKnowledgeServerConfig
// - KnowledgeSidecarChild / KnowledgeSidecarState
// - kill_stale_knowledge_sidecar
// - ensure_local_knowledge_token
// - get_sidecar_binary_name
// - wait_for_knowledge_sidecar
// - bootstrap_knowledge_sidecar
// - get_local_knowledge_server_config command
//
// Keep:
// - ensure_builtin_skills_installed
// - tool_view / tool_write / tool_edit / tool_remove / tool_ls / tool_mkdir
// - project storage commands
```

- [ ] **Step 4: Rewrite built-in vault instructions and delete knowledge-runtime skills**

```md
<!-- goodnight-boundary/SKILL.md -->
- Prefer the current vault and visible project files over hidden runtime state.
- Do not invent `_goodnight/outputs/*` destinations.
- Do not assume `.goodnight/m-flow/*` exists.
```

```md
<!-- goodnight-workspace-context/SKILL.md -->
- `<vault>/` is the primary context source.
- Use real vault-relative paths in explanations.
- Generated files should be written directly into the user-visible vault tree only when the task calls for file output.
```

- [ ] **Step 5: Re-run the built-in skill test**

Run: `node --test tests/ai/goodnight-builtin-skills-source.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs tests/ai/goodnight-builtin-skills-source.test.mjs goodnight-skills/built-in/goodnight-boundary/SKILL.md goodnight-skills/built-in/goodnight-workspace-context/SKILL.md
git rm -r goodnight-skills/built-in/goodnight-m-flow goodnight-skills/built-in/goodnight-llmwiki goodnight-skills/built-in/goodnight-rag
git commit -m "refactor: remove knowledge runtime from tauri shell"
```

### Task 3: Make the vault path the direct source of truth

**Files:**
- Modify: `src/utils/projectPersistence.ts`
- Modify: `src/App.tsx`
- Modify: `tests/local-vault-knowledge-base.test.mjs`

- [ ] **Step 1: Write the failing vault-contract regression**

```js
test('vault persistence now targets the real project vault root only', async () => {
  const source = await readFile(new URL('../src/utils/projectPersistence.ts', import.meta.url), 'utf8');

  assert.match(source, /getProjectVaultRootDir = \(project: Pick<ProjectConfig, 'vaultPath'>\) => project\.vaultPath/);
  assert.doesNotMatch(source, /getProjectKnowledgeRootDir/);
  assert.doesNotMatch(source, /getVaultMFlowDir/);
  assert.doesNotMatch(source, /getVaultOutputsDir/);
  assert.doesNotMatch(source, /ensureVaultKnowledgeDirectoryStructure/);
  assert.doesNotMatch(source, /ensureProjectKnowledgeDirectory/);
});
```

- [ ] **Step 2: Run the vault-contract test**

Run: `node --test tests/local-vault-knowledge-base.test.mjs`

Expected: FAIL because `projectPersistence.ts` still builds `<vault>/<project-name>/.goodnight/m-flow` and `_goodnight/outputs`.

- [ ] **Step 3: Replace knowledge-root helpers with direct vault helpers**

```ts
export const getProjectVaultRootDir = (project: Pick<ProjectConfig, 'vaultPath'>) => project.vaultPath;

export const ensureProjectVaultDirectory = async (project: Pick<ProjectConfig, 'vaultPath'>) => {
  await ensureDirectory(project.vaultPath);
  return project.vaultPath;
};
```

```ts
// Delete these from projectPersistence.ts:
// - getProjectKnowledgeRootDir
// - getVaultStateDir
// - getVaultMFlowDir
// - getVaultOutputsDir
// - getVaultMFlowOutputsDir
// - ensureVaultKnowledgeDirectoryStructure
// - ensureVaultMFlowDirectoryStructure
// - ensureProjectKnowledgeDirectory
// - getSystemIndexDir / manifest / sources / chunks / topics / doc-intents helpers
```

- [ ] **Step 4: Switch app lifecycle hooks to the direct vault helper**

```ts
// App.tsx
import {
  ensureProjectVaultDirectory,
  // ...
} from './utils/projectPersistence';

if (project.vaultPath) {
  void ensureProjectVaultDirectory(project).catch(() => undefined);
}
```

- [ ] **Step 5: Re-run the vault-contract test**

Run: `node --test tests/local-vault-knowledge-base.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/projectPersistence.ts src/App.tsx tests/local-vault-knowledge-base.test.mjs
git commit -m "refactor: make vault path the only project root"
```

### Task 4: Collapse the product workspace into file tree + Markdown notes and remove graph/organize UI

**Files:**
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- Delete: `src/features/knowledge/workspace/KnowledgeGraphWorkspace.tsx`
- Modify: `tests/knowledge-workspace-ui.test.mjs`
- Modify: `tests/product-workbench-knowledge-cutover.test.mjs`

- [ ] **Step 1: Write the failing UI regressions**

```js
assert.doesNotMatch(noteSource, /onOrganizeKnowledge:/);
assert.doesNotMatch(noteSource, /wiki-index/);
assert.doesNotMatch(noteSource, /ai-summary/);
assert.doesNotMatch(noteSource, /m-flow/);
assert.doesNotMatch(noteSource, /系统索引/);

assert.doesNotMatch(workbenchSource, /rebuildProjectMFlow/);
assert.doesNotMatch(workbenchSource, /KnowledgeGraphWorkspace/);
assert.doesNotMatch(workbenchSource, /handleOrganizeKnowledge/);
assert.match(workbenchSource, /<KnowledgeNoteWorkspace/);
```

- [ ] **Step 2: Run the two UI tests**

Run: `node --test tests/knowledge-workspace-ui.test.mjs tests/product-workbench-knowledge-cutover.test.mjs`

Expected: FAIL because the workspace still shows organize controls, knowledge-type filters, and graph/runtime imports.

- [ ] **Step 3: Simplify `KnowledgeNoteWorkspace.tsx` into a vault-note workspace**

```ts
type KnowledgeNoteWorkspaceProps = {
  notes: KnowledgeNote[];
  filteredNotes: KnowledgeNote[];
  diskItems: KnowledgeDiskItem[];
  selectedNote: KnowledgeNote | null;
  projectRootPath?: string | null;
  titleValue: string;
  editorValue: string;
  editable: boolean;
  isSaving: boolean;
  saveMessage: string;
  canSave: boolean;
  searchValue: string;
  isSearching: boolean;
  error: string | null;
  onSearchChange: (value: string) => void;
  onSelectNote: (noteId: string) => void;
  onTitleChange: (value: string) => void;
  onEditorChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onCreateNote: () => void;
  onCreateNoteAtPath: (relativeDirectory: string | null) => void;
  onCreateFolderAtPath: (relativeDirectory: string | null) => void;
  onRenameTreePath: (relativePath: string, isFolder: boolean) => void;
  onDeleteTreePaths: (relativePaths: string[] | string, isFolder: boolean | null) => void;
  onRefreshFilesystem: () => void;
  onOpenAttachment: (attachmentPath: string) => void;
};
```

```tsx
// Remove:
// - KnowledgeNoteFilter
// - FILTER_OPTIONS
// - onOrganizeKnowledge prop and button
// - docType-only UI such as "system index" and "AI summary"
// - empty-state button that refreshes m-flow
//
// Keep:
// - real file tree
// - create/rename/delete folder and note actions
// - markdown read/code toggle
// - raw markdown preview for plain vault files
```

- [ ] **Step 4: Remove graph/runtime wiring from `ProductWorkbench.tsx`**

```ts
// Delete imports:
// - rebuildProjectMFlow
// - formatMFlowRefreshSummary
// - ensureProjectKnowledgeDirectory
// - getProjectKnowledgeRootDir
// - KnowledgeGraphWorkspace
//
// Replace with:
import {
  ensureProjectVaultDirectory,
  getProjectVaultRootDir,
  // ...
} from '../../utils/projectPersistence';
```

```ts
const vaultRootDir = useMemo(
  () => (currentProject?.vaultPath ? getProjectVaultRootDir(currentProject) : null),
  [currentProject]
);
```

- [ ] **Step 5: Re-run the workspace UI tests**

Run: `node --test tests/knowledge-workspace-ui.test.mjs tests/product-workbench-knowledge-cutover.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/product/ProductWorkbench.tsx src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx tests/knowledge-workspace-ui.test.mjs tests/product-workbench-knowledge-cutover.test.mjs
git rm src/features/knowledge/workspace/KnowledgeGraphWorkspace.tsx
git commit -m "refactor: turn product workspace into vault-first note shell"
```

### Task 5: Decouple AI chat from m-flow and knowledge proposal lanes

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `tests/ai/chat-context.test.mjs`
- Delete or rewrite: `tests/ai/knowledge-*.test.mjs`
- Delete or rewrite: `tests/m-flow-*.test.mjs`

- [ ] **Step 1: Write the failing AI-context regression**

```js
assert.doesNotMatch(source, /rebuildProjectMFlow/);
assert.doesNotMatch(source, /buildMFlowPromptContext/);
assert.doesNotMatch(source, /loadMFlowPromptState/);
assert.doesNotMatch(source, /executeKnowledgeProposal/);
assert.doesNotMatch(source, /runChangeSyncLane/);
assert.doesNotMatch(source, /knowledge-organize/);
assert.doesNotMatch(source, /getProjectKnowledgeRootDir/);
assert.match(source, /readProjectTextFile/);
assert.match(source, /writeProjectTextFile/);
```

```js
const result = buildChatContextSnapshot({
  scene: 'vault',
  currentFileLabel: '当前文件 / notes/requirements.md',
});

assert.equal(result.primaryLabel, '当前文件 / notes/requirements.md');
assert.equal(result.secondaryLabel, null);
```

- [ ] **Step 2: Run the AI tests**

Run: `node --test tests/ai/chat-context.test.mjs`

Expected: FAIL because chat context and `AIChat.tsx` still reference `knowledge`, `m-flow`, and organize lanes.

- [ ] **Step 3: Remove runtime-only AI flows while preserving API-backed chat and project file operations**

```ts
// AIChat.tsx: delete imports tied to hidden knowledge runtime
// - executeKnowledgeProposal
// - buildKnowledgeOrganizeWorkflowState
// - runChangeSyncLane
// - temporaryKnowledgeFlow helpers
// - buildKnowledgeEntries
// - buildMFlowPromptContext / loadMFlowPromptState / rebuildProjectMFlow / formatMFlowRefreshSummary
// - projectKnowledgeNotesToRequirementDocs
// - getProjectKnowledgeRootDir
```

```ts
// Replace vault root resolution with direct vault path
const projectRoot = useMemo(
  () => currentProject?.vaultPath || '',
  [currentProject?.vaultPath]
);
```

```ts
// Chat context should be built from visible state only:
// - current open file
// - open tabs / selected page
// - project root
// - explicit referenced files
```

- [ ] **Step 4: Merge carefully with existing dirty user edits before saving**

Run: `git diff -- src/components/workspace/AIChat.tsx`

Expected: Review the user’s uncommitted changes first, then edit surgically so the obsidian-shell reset and the user’s local work both survive.

- [ ] **Step 5: Re-run the AI context test**

Run: `node --test tests/ai/chat-context.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/workspace/AIChat.tsx tests/ai/chat-context.test.mjs
git commit -m "refactor: make ai chat read from visible vault context"
```

### Task 6: Remove deleted knowledge-client/runtime modules and clean the frontend imports

**Files:**
- Delete: `src/features/knowledge/api/**`
- Delete: `src/modules/knowledge/m-flow/**`
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: any remaining import sites reported by `rg`

- [ ] **Step 1: Write the failing import-scan regression**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('frontend source no longer imports knowledge api or m-flow runtime modules', async () => {
  const workbench = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');
  const aiChat = await readFile(new URL('../src/components/workspace/AIChat.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(workbench, /features\/knowledge\/api/);
  assert.doesNotMatch(workbench, /modules\/knowledge\/m-flow/);
  assert.doesNotMatch(aiChat, /modules\/knowledge\/m-flow/);
});
```

- [ ] **Step 2: Run the import-scan test**

Run: `node --test tests/obsidian-shell-stack.test.mjs`

Expected: FAIL after adding the import-scan assertions to `tests/obsidian-shell-stack.test.mjs`, because `ProductWorkbench.tsx` and `AIChat.tsx` still import deleted runtime modules.

- [ ] **Step 3: Delete the modules and remove the last imports**

Run: `rg -n "features/knowledge/api|modules/knowledge/m-flow" src`

Expected: Use this list as the delete/cleanup checklist until the command prints no matches.

- [ ] **Step 4: Re-run the scan**

Run: `rg -n "features/knowledge/api|modules/knowledge/m-flow" src`

Expected: No matches

- [ ] **Step 5: Commit**

```bash
git add src/components/product/ProductWorkbench.tsx src/components/workspace/AIChat.tsx tests/obsidian-shell-stack.test.mjs
git rm -r src/features/knowledge/api src/modules/knowledge/m-flow
git commit -m "refactor: delete frontend knowledge runtime modules"
```

### Task 7: Prune legacy tests and run the final verification set

**Files:**
- Modify/Delete: legacy tests under `tests/`
- Modify/Delete: legacy AI knowledge tests under `tests/ai/`

- [ ] **Step 1: Remove tests that only validate deleted behavior**

```txt
Delete or rewrite any test whose only subject is:
- goodnight-server / goodnight-mcp-bridge
- atoms / graph / semantic search / briefings
- m-flow persistence, ingest, build, search, runtime
- organize knowledge lanes and proposal cards
- `_goodnight/outputs/*`
- `.goodnight/m-flow/*`
```

- [ ] **Step 2: Keep and adapt tests that still protect the new shell**

```txt
Retain and update tests around:
- project storage settings
- project store vault path behavior
- product workbench vault/file UI
- markdown note workspace
- AI configuration and API-backed chat shell
- project file operations
```

- [ ] **Step 3: Run the focused verification suite**

Run: `node --test tests/obsidian-shell-stack.test.mjs tests/local-vault-knowledge-base.test.mjs tests/knowledge-workspace-ui.test.mjs tests/product-workbench-knowledge-cutover.test.mjs tests/project-store-knowledge-cutover.test.mjs tests/ai/goodnight-builtin-skills-source.test.mjs tests/ai/chat-context.test.mjs`

Expected: PASS

Run: `npm run build`

Expected: PASS

Run: `cargo check -p tauri-app`

Expected: PASS

- [ ] **Step 4: Run a final source scan for forbidden legacy terms**

Run: `rg -n "goodnight-server|goodnight-mcp-bridge|goodnight-core|_goodnight/outputs|\\.goodnight/m-flow|rebuildProjectMFlow|get_local_knowledge_server_config|KnowledgeGraphWorkspace|knowledge-organize" src src-tauri goodnight-skills tests`

Expected: No matches outside intentionally preserved historical docs/specs

- [ ] **Step 5: Commit**

```bash
git add tests src src-tauri goodnight-skills
git commit -m "test: lock in obsidian shell reset"
```

## Self-Review

### Spec coverage

- Vault is the only source of truth: covered by Task 3 and Task 4.
- Remove `_goodnight/outputs/*` and `.goodnight/m-flow/*`: covered by Task 2, Task 3, Task 6, and Task 7.
- Remove atoms / graph / m-flow / rag / llmwiki runtime as product features: covered by Task 1, Task 2, Task 4, Task 5, and Task 6.
- Keep AI chat and user-supplied API providers: covered by Task 5 and Task 7.
- Remove packaged sidecars/server/backend: covered by Task 1 and Task 2.
- Align UI wording to vault/files/notes instead of knowledge backend: covered by Task 3, Task 4, and Task 5.
- Avoid trampling dirty local edits: called out in Architecture and Task 5 Step 4.

### Placeholder scan

- Searched manually for `TODO`, `TBD`, `implement later`, and `appropriate error handling`: none present.
- Every task includes exact file paths, concrete commands, and an expected outcome.

### Type consistency

- Vault helper naming is consistent: `getProjectVaultRootDir` and `ensureProjectVaultDirectory`.
- The workspace remains `KnowledgeNoteWorkspace.tsx` during the reset to avoid unnecessary file churn; wording and props are simplified instead of renaming the file mid-reset.
- AI context wording consistently moves from `knowledge` toward visible vault/current-file context.
