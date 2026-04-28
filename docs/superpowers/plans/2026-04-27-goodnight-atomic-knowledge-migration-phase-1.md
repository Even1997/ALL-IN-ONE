# GoodNight Atomic Knowledge Migration Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Atomic's core knowledge crates into GoodNight, rename them to `goodnight-*`, and wire the Tauri shell to launch a local knowledge sidecar with a minimal note API path ready for the frontend.

**Architecture:** Keep the existing GoodNight React workbench and project shell intact while adding a Rust workspace at the repo root. Phase 1 only brings in the Atomic knowledge backend and a thin frontend connection layer; it does not yet replace the editor, knowledge UI, or requirement-driven workflows.

**Tech Stack:** Tauri 2, Rust workspace crates, React 19, TypeScript, Vite, Zustand, PowerShell, Git

---

## File Map

**Create**
- `Cargo.toml`
- `crates/goodnight-core/**`
- `crates/goodnight-server/**`
- `crates/goodnight-mcp-bridge/**`
- `src/features/knowledge/api/knowledgeClient.ts`
- `src/features/knowledge/model/knowledge.ts`
- `src/features/knowledge/store/knowledgeStore.ts`

**Modify**
- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/src/lib.rs`
- `src/components/product/ProductWorkbench.tsx`
- `src/components/product/KnowledgeWorkspace.tsx`

**Keep unchanged in Phase 1**
- `src/components/product/MilkdownEditor.tsx`
- `src/modules/knowledge/knowledgeSearch.ts`
- `src/store/projectStore.ts`
- `src/App.tsx`

## Milestone Map

- Phase 1: Rust workspace + renamed crates + sidecar boot + minimal frontend client
- Phase 2: knowledge data source migration from filesystem scanning to server-backed notes
- Phase 3: CodeMirror editor swap and note-first knowledge UI
- Phase 4: chat, wiki, graph, and external asset association

### Task 1: Re-import Atomic locally and prepare the migration workspace

**Files:**
- Create: `.tmp/atomic/**` (temporary only)
- Test: `git status --short`

- [ ] **Step 1: Re-clone the Atomic repository into a temporary directory**

Run: `git clone --depth 1 https://github.com/kenforthewin/atomic.git .tmp/atomic`
Expected: `.tmp/atomic` contains `Cargo.toml`, `crates/`, `src-tauri/`, and `src/`.

- [ ] **Step 2: Verify the source crates we intend to import**

Run: `Get-ChildItem .tmp/atomic/crates`
Expected: output includes `atomic-core`, `atomic-server`, and `mcp-bridge`.

- [ ] **Step 3: Commit**

This task is exploratory only. Do not commit the temporary clone.

### Task 2: Create the GoodNight Rust workspace and import renamed crates

**Files:**
- Create: `Cargo.toml`
- Create: `crates/goodnight-core/**`
- Create: `crates/goodnight-server/**`
- Create: `crates/goodnight-mcp-bridge/**`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Copy only the required Atomic crates into `crates/`**

Copy:
- `.tmp/atomic/crates/atomic-core` -> `crates/goodnight-core`
- `.tmp/atomic/crates/atomic-server` -> `crates/goodnight-server`
- `.tmp/atomic/crates/mcp-bridge` -> `crates/goodnight-mcp-bridge`

- [ ] **Step 2: Add the repo-root Rust workspace**

Create `Cargo.toml` with:

```toml
[workspace]
resolver = "2"
members = [
  "src-tauri",
  "crates/goodnight-core",
  "crates/goodnight-server",
  "crates/goodnight-mcp-bridge",
]
```

- [ ] **Step 3: Rename the imported crate package names**

Update the imported crate manifests so their package names become:

```toml
[package]
name = "goodnight-core"
```

```toml
[package]
name = "goodnight-server"
```

```toml
[package]
name = "goodnight-mcp-bridge"
```

- [ ] **Step 4: Update local path dependencies across the imported Rust crates**

Search and replace references from:
- `atomic-core` -> `goodnight-core`
- `atomic-server` -> `goodnight-server`
- `mcp-bridge` -> `goodnight-mcp-bridge`

Only change crate references and binary names needed for compilation.

- [ ] **Step 5: Point the existing Tauri app at the new workspace crates**

Update `src-tauri/Cargo.toml` to depend on:

```toml
goodnight-core = { path = "../crates/goodnight-core" }
goodnight-server = { path = "../crates/goodnight-server" }
```

Keep the current Tauri dependencies in place.

- [ ] **Step 6: Run Rust metadata validation**

Run: `cargo metadata --no-deps`
Expected: PASS and workspace lists `src-tauri`, `goodnight-core`, `goodnight-server`, `goodnight-mcp-bridge`.

- [ ] **Step 7: Commit**

```bash
git add Cargo.toml crates src-tauri/Cargo.toml
git commit -m "feat: import goodnight knowledge workspace crates"
```

### Task 3: Wire the Tauri shell to launch the local GoodNight sidecar

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/main.rs`

- [ ] **Step 1: Preserve the existing file utility commands**

Do not remove the current GoodNight commands for file operations, project storage, or local agent integration.

- [ ] **Step 2: Add a local server config command**

Add a command that returns:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalKnowledgeServerConfig {
    pub base_url: String,
    pub auth_token: String,
}
```

Expose it as a Tauri command so the frontend can request the connection details.

- [ ] **Step 3: Add sidecar lifecycle management**

Bring in the minimal sidecar boot flow from Atomic:
- app data dir discovery
- token bootstrap
- server child process launch
- stale child cleanup on restart

Keep names GoodNight-specific:
- binary: `goodnight-server`
- token file: `goodnight_local_server_token`

- [ ] **Step 4: Register the sidecar setup inside `run()` without breaking existing setup**

Extend `tauri::Builder::default()` so:
- the current GoodNight behavior remains
- local server config is managed
- sidecar startup happens during app setup

- [ ] **Step 5: Run Rust compile verification**

Run: `cargo check -p tauri-app`
Expected: PASS or a narrow set of import/rename errors only inside the new GoodNight crates.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: launch local goodnight knowledge sidecar"
```

### Task 4: Add a minimal frontend knowledge client

**Files:**
- Create: `src/features/knowledge/api/knowledgeClient.ts`
- Create: `src/features/knowledge/model/knowledge.ts`
- Create: `src/features/knowledge/store/knowledgeStore.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add only the dependencies required for the imported Atomic frontend bridge**

If missing after crate import planning, add:
- `react-router-dom`
- `sonner`

Do not add the full Atomic frontend dependency set yet.

- [ ] **Step 2: Define the minimal note model**

Create `src/features/knowledge/model/knowledge.ts` with:

```ts
export type KnowledgeNote = {
  id: string;
  title: string;
  bodyMarkdown: string;
  updatedAt: string;
  tags: string[];
};

export type LocalKnowledgeServerConfig = {
  baseUrl: string;
  authToken: string;
};
```

- [ ] **Step 3: Add a minimal Tauri-backed knowledge client**

Create `src/features/knowledge/api/knowledgeClient.ts` that:
- requests the local server config via Tauri `invoke`
- exports helper functions for:
  - `getLocalKnowledgeServerConfig`
  - `listKnowledgeNotes`

If note-list API routes are not fully renamed yet, stub `listKnowledgeNotes` behind a single implementation point and keep the return type stable.

- [ ] **Step 4: Add a focused Zustand store**

Create `src/features/knowledge/store/knowledgeStore.ts` with:
- `notes`
- `isLoading`
- `error`
- `loadNotes()`

Keep it independent from `projectStore` in Phase 1.

- [ ] **Step 5: Run TypeScript validation**

Run: `npm run build`
Expected: PASS or a narrow set of known integration failures limited to unfinished ProductWorkbench wiring.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/features/knowledge
git commit -m "feat: add frontend knowledge sidecar client"
```

### Task 5: Hook the existing knowledge workspace to the new server-backed client

**Files:**
- Modify: `src/components/product/KnowledgeWorkspace.tsx`
- Modify: `src/components/product/ProductWorkbench.tsx`

- [ ] **Step 1: Keep the current visual shell and swap only the data source**

Do not introduce the Atomic layout yet. Keep the current knowledge workspace shell but load note data from `knowledgeStore`.

- [ ] **Step 2: Add the thinnest possible connection in ProductWorkbench**

Trigger `loadNotes()` when the project workbench enters the knowledge view and a project is active.

- [ ] **Step 3: Render a minimal server-backed note list state**

Show:
- loading state
- empty state
- note title list

Do not replace the editor yet.

- [ ] **Step 4: Verify the app build still works**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/product/KnowledgeWorkspace.tsx src/components/product/ProductWorkbench.tsx
git commit -m "feat: connect knowledge workspace to sidecar note list"
```

## Self-Review

- Spec coverage:
  - Phase 1 crate import, rename, sidecar boot, and minimal frontend client are covered.
  - Phase 2-4 are intentionally deferred to milestone map and not implemented in this plan.
- Placeholder scan:
  - No `TODO`, `TBD`, or “handle appropriately” placeholders remain.
- Type consistency:
  - Phase 1 frontend uses `KnowledgeNote` and `LocalKnowledgeServerConfig` consistently.
