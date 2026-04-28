# GoodNight Atomic Direct Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `KnowledgeNote` the only source of truth for the knowledge workspace, demote `RequirementDoc` to a compatibility projection, and remove Atomic runtime residue from the MCP bridge.

**Architecture:** Keep the existing ProductWorkbench shell, but replace the knowledge lane's core data path with a note-native pipeline. Add a thin adapter layer only where older requirement-driven flows still need `RequirementDoc`, and keep markdown as a mirrored artifact instead of the primary store.

**Tech Stack:** React 19, TypeScript, Zustand, Tauri 2, Rust, Node `node:test`

---

## File Map

**Create**
- `src/features/knowledge/adapters/knowledgeRequirementAdapter.ts`
- `tests/knowledge-note-workspace.test.mjs`
- `tests/knowledge-requirement-adapter.test.mjs`

**Modify**
- `src/features/knowledge/model/knowledge.ts`
- `src/features/knowledge/api/knowledgeClient.ts`
- `src/features/knowledge/store/knowledgeStore.ts`
- `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- `src/components/product/ProductWorkbench.tsx`
- `src/store/projectStore.ts`
- `src/types/index.ts`
- `crates/goodnight-mcp-bridge/src/main.rs`
- `tests/product-workbench.test.mjs`
- `tests/knowledge-workspace-ui.test.mjs`

**Keep untouched unless required by failing tests**
- `src/components/product/WorkbenchShell.tsx`
- `src/components/product/PageWorkspace.tsx`
- `src-tauri/src/lib.rs`

---

### Task 1: Add the note-native adapter boundary

**Files:**
- Create: `src/features/knowledge/adapters/knowledgeRequirementAdapter.ts`
- Modify: `src/features/knowledge/model/knowledge.ts`
- Test: `tests/knowledge-requirement-adapter.test.mjs`

- [ ] **Step 1: Write the failing adapter test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('knowledge adapter projects KnowledgeNote into RequirementDoc without making it the source of truth', async () => {
  const source = await readFile(new URL('../src/features/knowledge/adapters/knowledgeRequirementAdapter.ts', import.meta.url), 'utf8');

  assert.match(source, /export const projectKnowledgeNoteToRequirementDoc =/);
  assert.match(source, /export const projectKnowledgeNotesToRequirementDocs =/);
  assert.match(source, /bodyMarkdown/);
  assert.match(source, /summary:/);
  assert.match(source, /sourceUrl/);
  assert.doesNotMatch(source, /updateRequirementDoc/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/knowledge-requirement-adapter.test.mjs`
Expected: FAIL because the adapter file does not exist yet.

- [ ] **Step 3: Implement the minimal adapter and model support**

```ts
// src/features/knowledge/adapters/knowledgeRequirementAdapter.ts
import type { RequirementDoc } from '../../../types';
import type { KnowledgeNote } from '../model/knowledge';

const summarize = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 96);

export const projectKnowledgeNoteToRequirementDoc = (note: KnowledgeNote): RequirementDoc => ({
  id: note.id,
  title: note.title,
  content: note.bodyMarkdown,
  summary: summarize(note.bodyMarkdown),
  filePath: note.sourceUrl || undefined,
  kind: note.kind === 'sketch' ? 'sketch' : note.kind === 'design' ? 'spec' : 'note',
  tags: note.tags,
  relatedIds: [],
  authorRole: '产品',
  sourceType: 'manual',
  updatedAt: note.updatedAt,
  status: 'ready',
});

export const projectKnowledgeNotesToRequirementDocs = (notes: KnowledgeNote[]) =>
  notes.map(projectKnowledgeNoteToRequirementDoc);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/knowledge-requirement-adapter.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/knowledge/adapters/knowledgeRequirementAdapter.ts src/features/knowledge/model/knowledge.ts tests/knowledge-requirement-adapter.test.mjs
git commit -m "feat: add note-to-requirement compatibility adapter"
```

---

### Task 2: Teach the knowledge client and store full note CRUD

**Files:**
- Modify: `src/features/knowledge/model/knowledge.ts`
- Modify: `src/features/knowledge/api/knowledgeClient.ts`
- Modify: `src/features/knowledge/store/knowledgeStore.ts`
- Test: `tests/product-workbench.test.mjs`

- [ ] **Step 1: Write the failing store/client test**

```js
test('knowledge store exposes note-first create and delete actions instead of filesystem-first sync only', async () => {
  const source = await readFile(new URL('../src/features/knowledge/store/knowledgeStore.ts', import.meta.url), 'utf8');

  assert.match(source, /createProjectNote:/);
  assert.match(source, /deleteProjectNote:/);
  assert.doesNotMatch(source, /syncProjectNotes: async \(projectId, sources\) => \{/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/product-workbench.test.mjs`
Expected: FAIL because the new actions are missing.

- [ ] **Step 3: Add the minimal client and store actions**

```ts
// knowledgeClient.ts
export const createProjectKnowledgeNote = async (projectId: string, source: ProjectKnowledgeSource) => {
  const databaseId = await getProjectKnowledgeDatabaseId(projectId);
  const atom = await requestKnowledgeJson<GoodnightAtomWithTags>(
    '/api/atoms',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: source.content,
        source_url: source.filePath || null,
        published_at: null,
        tag_ids: [],
        skip_if_source_exists: false,
      }),
    },
    databaseId
  );
  return mapAtomWithTagsToKnowledgeNote(atom);
};

export const deleteProjectKnowledgeNote = async (projectId: string, noteId: string) => {
  const databaseId = await getProjectKnowledgeDatabaseId(projectId);
  await deleteAtom(databaseId, noteId);
};
```

```ts
// knowledgeStore.ts
createProjectNote: async (projectId, source) => {
  const note = await createProjectKnowledgeNote(projectId, source);
  set((state) => ({ notes: [note, ...state.notes] }));
  return note;
},
deleteProjectNote: async (projectId, noteId) => {
  await deleteProjectKnowledgeNote(projectId, noteId);
  set((state) => ({
    notes: state.notes.filter((item) => item.id !== noteId),
    searchResults: state.searchResults.filter((item) => item.id !== noteId),
    similarNotes: state.similarNotes.filter((item) => item.id !== noteId),
  }));
},
```

- [ ] **Step 4: Run focused verification**

Run: `npm run build`
Expected: PASS, or only narrow type errors in files touched by this task.

- [ ] **Step 5: Commit**

```bash
git add src/features/knowledge/model/knowledge.ts src/features/knowledge/api/knowledgeClient.ts src/features/knowledge/store/knowledgeStore.ts tests/product-workbench.test.mjs
git commit -m "feat: add note-first knowledge client and store actions"
```

---

### Task 3: Replace the workspace view model with a note-native UI

**Files:**
- Modify: `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- Test: `tests/knowledge-workspace-ui.test.mjs`
- Test: `tests/knowledge-note-workspace.test.mjs`

- [ ] **Step 1: Write the failing workspace tests**

```js
test('knowledge note workspace no longer imports legacy knowledgeEntries or knowledgeTree types', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /modules\/knowledge\/knowledgeEntries/);
  assert.doesNotMatch(source, /modules\/knowledge\/knowledgeTree/);
  assert.match(source, /type KnowledgeNoteWorkspaceProps =/);
  assert.match(source, /notes: KnowledgeNote\[\]/);
  assert.match(source, /selectedNote: KnowledgeNote \| null/);
});

test('knowledge note workspace renders context panels for similar notes, relationships, and attachments', async () => {
  const source = await readFile(new URL('../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(source, /相似笔记/);
  assert.match(source, /关系网络/);
  assert.match(source, /附件资料/);
  assert.match(source, /libraryAttachments/);
  assert.match(source, /onOpenAttachment/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/knowledge-workspace-ui.test.mjs tests/knowledge-note-workspace.test.mjs`
Expected: FAIL because the component still depends on legacy knowledge tree types.

- [ ] **Step 3: Rewrite the workspace component around KnowledgeNote**

```ts
type KnowledgeNoteWorkspaceProps = {
  notes: KnowledgeNote[];
  filteredNotes: KnowledgeNote[];
  selectedNote: KnowledgeNote | null;
  editorValue: string;
  editable: boolean;
  isSaving: boolean;
  saveMessage: string;
  canSave: boolean;
  canUseForDesign: boolean;
  searchValue: string;
  isSearching: boolean;
  isSyncing: boolean;
  error: string | null;
  similarNotes: KnowledgeNote[];
  neighborhoodNotes: KnowledgeNote[];
  graphNodeCount: number;
  graphEdgeCount: number;
  attachments: KnowledgeAttachment[];
  nearbyAttachments: KnowledgeAttachment[];
  libraryAttachments: KnowledgeAttachment[];
  attachmentCategoryCounts: AttachmentCategoryCount[];
  onSearchChange: (value: string) => void;
  onSelectNote: (noteId: string) => void;
  onEditorChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onUpload: () => void;
  onImportAssets: () => void;
  onCreateNote: () => void;
  onUseForDesign: () => void;
  onOpenAttachment: (attachmentPath: string) => void;
};
```

- [ ] **Step 4: Run tests and build**

Run: `node --test tests/knowledge-workspace-ui.test.mjs tests/knowledge-note-workspace.test.mjs`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx tests/knowledge-workspace-ui.test.mjs tests/knowledge-note-workspace.test.mjs
git commit -m "feat: convert knowledge workspace to a note-first view"
```

---

### Task 4: Refactor ProductWorkbench to use note-first read/write flows

**Files:**
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/store/projectStore.ts`
- Modify: `src/types/index.ts`
- Test: `tests/product-workbench.test.mjs`
- Test: `tests/project-store.test.mjs`

- [ ] **Step 1: Write the failing ProductWorkbench and project store tests**

```js
test('product workbench drops serverBackedRequirementDocs and legacy knowledge search pipeline from the knowledge lane', async () => {
  const source = await readFile(new URL('../src/components/product/ProductWorkbench.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /const serverBackedRequirementDocs = useMemo/);
  assert.doesNotMatch(source, /buildKnowledgeEntries/);
  assert.doesNotMatch(source, /buildKnowledgeTree/);
  assert.doesNotMatch(source, /buildKnowledgeSearchIndex/);
  assert.match(source, /const selectedServerNote =/);
  assert.match(source, /createServerNote/);
  assert.match(source, /deleteServerNote/);
});

test('project store keeps RequirementDoc as compatibility state instead of driving knowledge workspace selection', async () => {
  const source = await readFile(new URL('../src/store/projectStore.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /activeKnowledgeFileId === id \? requirementDocs\[0\]\?\.id/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/product-workbench.test.mjs tests/project-store.test.mjs`
Expected: FAIL because ProductWorkbench still builds the knowledge lane from `RequirementDoc`.

- [ ] **Step 3: Implement the minimal read-path cutover**

```ts
// ProductWorkbench.tsx
const serverNotes = useKnowledgeStore((state) => state.notes);
const createServerNote = useKnowledgeStore((state) => state.createProjectNote);
const deleteServerNote = useKnowledgeStore((state) => state.deleteProjectNote);

const selectedServerNote = useMemo(
  () => serverNotes.find((note) => note.id === selectedKnowledgeNoteId) || null,
  [serverNotes, selectedKnowledgeNoteId]
);

const requirementDocsProjection = useMemo(
  () => projectKnowledgeNotesToRequirementDocs(serverNotes),
  [serverNotes]
);
```

- [ ] **Step 4: Implement the minimal write-path cutover**

```ts
const handleCreateKnowledgeNote = useCallback(async () => {
  if (!currentProject) return;

  const note = await createServerNote(currentProject.id, {
    title: '未命名笔记',
    content: '',
    filePath: '',
    updatedAt: new Date().toISOString(),
    tags: [],
  });
  setSelectedKnowledgeNoteId(note.id);
}, [createServerNote, currentProject]);

const handleDeleteKnowledgeNote = useCallback(async () => {
  if (!currentProject || !selectedServerNote) return;

  await deleteServerNote(currentProject.id, selectedServerNote.id);
  setSelectedKnowledgeNoteId(null);
}, [currentProject, deleteServerNote, selectedServerNote]);
```

- [ ] **Step 5: Run verification**

Run: `node --test tests/product-workbench.test.mjs tests/project-store.test.mjs`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/product/ProductWorkbench.tsx src/store/projectStore.ts src/types/index.ts tests/product-workbench.test.mjs tests/project-store.test.mjs
git commit -m "feat: cut product workbench over to note-first knowledge flows"
```

---

### Task 5: Remove Atomic MCP runtime residue

**Files:**
- Modify: `crates/goodnight-mcp-bridge/src/main.rs`
- Test: `cargo check -p goodnight-mcp-bridge`

- [ ] **Step 1: Write the failing source assertion test**

```js
test('goodnight mcp bridge no longer points at atomic runtime names', async () => {
  const source = await readFile(new URL('../crates/goodnight-mcp-bridge/src/main.rs', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /Atomic MCP Bridge/);
  assert.doesNotMatch(source, /ATOMIC_TOKEN|ATOMIC_PORT|ATOMIC_HOST/);
  assert.doesNotMatch(source, /com\.atomic\.app/);
  assert.match(source, /GOODNIGHT_TOKEN|GOODNIGHT_PORT|GOODNIGHT_HOST/);
  assert.match(source, /goodnight_local_server_token/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/product-workbench.test.mjs`
Expected: FAIL because the bridge still contains Atomic names.

- [ ] **Step 3: Implement the rename**

```rust
const TOKEN_FILE_NAME: &str = "goodnight_local_server_token";

fn goodnight_data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|d| d.join("com.goodnight.app"))
}

let port: u16 = env::var("GOODNIGHT_PORT")
    .ok()
    .and_then(|p| p.parse().ok())
    .unwrap_or(DEFAULT_PORT);

let host = env::var("GOODNIGHT_HOST").unwrap_or_else(|_| DEFAULT_HOST.to_string());
```

- [ ] **Step 4: Run Rust verification**

Run: `cargo check -p goodnight-mcp-bridge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/goodnight-mcp-bridge/src/main.rs tests/product-workbench.test.mjs
git commit -m "chore: remove atomic runtime residue from mcp bridge"
```

---

### Task 6: Final verification pass

**Files:**
- Test only

- [ ] **Step 1: Run focused test suite**

Run: `node --test tests/knowledge-requirement-adapter.test.mjs tests/knowledge-note-workspace.test.mjs tests/knowledge-workspace-ui.test.mjs tests/product-workbench.test.mjs tests/project-store.test.mjs`
Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Run Rust checks**

Run: `cargo check -p tauri-app`
Expected: PASS.

- [ ] **Step 4: Commit any final mechanical fixes**

```bash
git add src tests crates
git commit -m "chore: finalize direct-cutover knowledge migration"
```

## Self-Review

- Spec coverage:
  - Note-first read/write path is covered in Tasks 2 and 4.
  - `RequirementDoc` demotion to compatibility projection is covered in Tasks 1 and 4.
  - Note-first UI and visible context panels are covered in Task 3.
  - MCP bridge cleanup is covered in Task 5.
- Placeholder scan:
  - No `TODO`, `TBD`, or deferred implementation markers remain in the plan.
- Type consistency:
  - `KnowledgeNote`, `RequirementDoc`, `ProjectKnowledgeSource`, and the new `createProjectNote/deleteProjectNote` store actions are used consistently across tasks.
