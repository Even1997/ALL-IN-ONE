# GoodNight Native M-Flow Cutover Implementation Plan

> Status: Historical execution plan. The native `m-flow` cutover has been completed.
> Note: transitional items mentioned below, such as `systemIndexProject.ts` and `tests/system-index-project.test.mjs`, were removed after the cutover landed.

## Completion Status

This plan has been executed and landed. Read the remaining sections as the implementation record, not as pending work.

Completed work summary:

- Task 1 completed: the single-engine native `m-flow` contract was locked with source-level tests.
- Task 2 completed: the reviewed upstream `m-flow` reference tree was vendored under `docs/references/upstream/m-flow/`.
- Task 3 completed: product state and UI were cut over from multi-method retrieval to a single native `m-flow` flow.
- Task 4 completed: the native `m-flow` model and persistence layer were added.
- Task 5 completed: ingest and graph construction modules were added.
- Task 6 completed: anchor search and bundle scoring were added.
- Task 7 completed: rebuild, prompt context, and artifact rendering were wired into the app runtime.
- Task 8 completed: the old knowledge runtime files were removed.

Post-plan cleanup that also landed:

- The temporary `systemIndexProject.ts` compatibility shim was removed after callers were migrated.
- The temporary `tests/system-index-project.test.mjs` source-level compatibility test was removed with the shim.
- Built-in GoodNight skills were aligned so `m-flow` is the only visible default knowledge engine, while `llmwiki` and `rag` remain hidden compatibility skills.
- Earlier 2026-04-29 and 2026-04-30 architecture specs were marked as superseded by the 2026-05-01 native `m-flow` cutover design.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy shared `systemIndex` / multi-method knowledge runtime with a single native `m-flow` knowledge core that matches official M-flow’s model and retrieval philosophy.

**Architecture:** First lock the product cutover with tests, then vendor the upstream read-only reference files, then replace the old `base-index` / `KnowledgeRetrievalMethod` / adapter runtime with a new `src/modules/knowledge/m-flow/` core. The new runtime builds local `Episode / Facet / FacetPoint / Entity / Edge` state, performs anchor search plus bundle scoring, writes `.goodnight/m-flow/*.json`, and renders `_goodnight/outputs/m-flow/*`.

**Tech Stack:** TypeScript, React, Zustand, node:test, Vite, Tauri filesystem commands

---

## File Map

### Product and state files

- `src/types/index.ts`
  Remove multi-method knowledge mode types from the product model.
- `src/store/projectStore.ts`
  Stop persisting per-project retrieval mode and normalize older snapshots to native m-flow.
- `src/components/product/ProductWorkbench.tsx`
  Remove retrieval-mode switching and switch manual refresh to the new m-flow rebuild entrypoint.
- `src/components/workspace/AIChat.tsx`
  Replace `ensureProjectSystemIndex()` + prompt-context assembly with native m-flow runtime calls.
- `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
  Remove retrieval-method UI props and labels.

### Persistence and runtime files

- `src/utils/projectPersistence.ts`
  Replace `.goodnight/base-index/` and `.goodnight/skills/<skill>/` helpers with `.goodnight/m-flow/` helpers.
- `src/modules/knowledge/systemIndex.ts`
  Delete after cutover.
- `src/modules/knowledge/systemIndexProject.ts`
  Delete or replace with a thin cutover shim after all callers move to the new runtime.
- `src/modules/knowledge/runtime/*`
  Delete after runtime is replaced by `src/modules/knowledge/m-flow/runtime.ts`.
- `src/modules/knowledge/adapters/*`
  Delete after artifact and prompt generation move into native m-flow modules.

### New native m-flow files

- `src/modules/knowledge/m-flow/model.ts`
  Core types.
- `src/modules/knowledge/m-flow/persistence.ts`
  Paths, read/write helpers, rebuild warning helpers.
- `src/modules/knowledge/m-flow/ingest.ts`
  Vault scanning, normalization, source capture.
- `src/modules/knowledge/m-flow/buildEpisodes.ts`
  Episode derivation.
- `src/modules/knowledge/m-flow/buildFacets.ts`
  Facet derivation.
- `src/modules/knowledge/m-flow/buildFacetPoints.ts`
  FacetPoint derivation.
- `src/modules/knowledge/m-flow/buildEntities.ts`
  Entity derivation and canonicalization.
- `src/modules/knowledge/m-flow/buildEdges.ts`
  Semantic edge creation with `edgeText`.
- `src/modules/knowledge/m-flow/searchAnchors.ts`
  Multi-granularity anchor search.
- `src/modules/knowledge/m-flow/scoreBundles.ts`
  Graph projection and minimum-path bundle scoring.
- `src/modules/knowledge/m-flow/renderArtifacts.ts`
  Markdown artifact rendering.
- `src/modules/knowledge/m-flow/runtime.ts`
  Public rebuild/query/prompt-context facade.

### Reference and tests

- `docs/references/upstream/m-flow/**`
  Read-only official reference files copied from upstream.
- `tests/local-vault-knowledge-base.test.mjs`
  Product cutover assertions.
- `tests/knowledge-runtime-adapters.test.mjs`
  Replace old multi-adapter coverage with native m-flow runtime coverage.
- `tests/system-index-project.test.mjs`
  Replace old system-index artifact expectations with m-flow rebuild and artifact expectations.
- `tests/system-index.test.mjs`
  Replace with native m-flow model / search tests or delete after coverage moves.
- New:
  - `tests/m-flow-persistence.test.mjs`
  - `tests/m-flow-ingest.test.mjs`
  - `tests/m-flow-build.test.mjs`
  - `tests/m-flow-search.test.mjs`
  - `tests/m-flow-runtime.test.mjs`

---

### Task 1: Lock the cutover contract with failing tests

**Files:**
- Modify: `tests/local-vault-knowledge-base.test.mjs`
- Modify: `tests/product-workbench-knowledge-cutover.test.mjs`
- Modify: `tests/knowledge-runtime-adapters.test.mjs`
- Modify: `tests/system-index-project.test.mjs`

- [ ] **Step 1: Rewrite the source-level assertions around the new single-engine contract**

Add assertions like:

```js
assert.doesNotMatch(typesSource, /'llmwiki'/);
assert.doesNotMatch(typesSource, /'rag'/);
assert.doesNotMatch(setupSource, /检索方式/);
assert.match(persistenceSource, /\.goodnight[\\/]+m-flow/);
assert.doesNotMatch(persistenceSource, /base-index/);
assert.match(runtimeTestSource, /Episode \/ Facet \/ FacetPoint \/ Entity/);
```

Also flip the runtime and artifact tests so they expect:

- only native `m-flow`
- `.goodnight/m-flow/*.json`
- `_goodnight/outputs/m-flow/*`
- no `.goodnight/skills/*`
- no `_goodnight/outputs/llmwiki/*`
- no `_goodnight/outputs/rag/*`

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run:

```bash
node --test tests/local-vault-knowledge-base.test.mjs tests/product-workbench-knowledge-cutover.test.mjs tests/knowledge-runtime-adapters.test.mjs tests/system-index-project.test.mjs
```

Expected: FAIL because the repository still contains `KnowledgeRetrievalMethod`, `base-index`, old runtime adapters, and retrieval-mode UI wiring.

- [ ] **Step 3: Keep the failure output in the task notes before implementation starts**

Record the first failing patterns, for example:

```text
- types still export 'llmwiki' | 'rag'
- ProductWorkbench still passes knowledgeRetrievalMethod
- projectPersistence still creates .goodnight/base-index
- system-index tests still refer to system-index.md and base-index manifests
```

- [ ] **Step 4: Do not change production code in this task**

This task is complete when the new red tests accurately describe the cutover target.

### Task 2: Copy the official M-flow reference files into the repo

**Files:**
- Create: `docs/references/upstream/m-flow/README.md`
- Create: `docs/references/upstream/m-flow/docs/RETRIEVAL_ARCHITECTURE.md`
- Create: `docs/references/upstream/m-flow/m_flow/core/domain/models/Episode.py`
- Create: `docs/references/upstream/m-flow/m_flow/core/domain/models/Facet.py`
- Create: `docs/references/upstream/m-flow/m_flow/core/domain/models/FacetPoint.py`
- Create: `docs/references/upstream/m-flow/m_flow/core/domain/models/Entity.py`
- Create: `docs/references/upstream/m-flow/m_flow/knowledge/graph_ops/m_flow_graph/MemoryGraphElements.py`
- Create: `docs/references/upstream/m-flow/m_flow/retrieval/episodic/bundle_scorer.py`
- Create: `docs/references/upstream/m-flow/m_flow/memory/episodic/edge_text_generators.py`
- Create: `docs/references/upstream/m-flow/m_flow/memory/episodic/episode_builder/step35_node_edge_creation.py`
- Create: `docs/references/upstream/m-flow/SOURCE.md`
- Test: `tests/ai/goodnight-builtin-skills-source.test.mjs`

- [ ] **Step 1: Add a failing test that expects the new upstream reference tree**

Use checks like:

```js
await access(path.join(repoRoot, 'docs', 'references', 'upstream', 'm-flow', 'README.md'));
await access(path.join(repoRoot, 'docs', 'references', 'upstream', 'm-flow', 'docs', 'RETRIEVAL_ARCHITECTURE.md'));
await access(path.join(repoRoot, 'docs', 'references', 'upstream', 'm-flow', 'm_flow', 'retrieval', 'episodic', 'bundle_scorer.py'));
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```bash
node --test tests/ai/goodnight-builtin-skills-source.test.mjs
```

Expected: FAIL because `docs/references/upstream/m-flow/` does not exist yet.

- [ ] **Step 3: Copy the exact upstream reference files and add a source manifest**

Create `docs/references/upstream/m-flow/SOURCE.md` with content like:

```md
# Upstream Source

- Repository: `https://github.com/FlowElement-ai/m_flow`
- Purpose: read-only architectural reference for GoodNight native m-flow cutover
- Files copied: README, retrieval architecture, node models, graph elements, bundle scorer, edge text generators, node-edge creation logic
```

Copy the files verbatim from the already-reviewed upstream snapshot. Do not edit their internal content beyond preserving line endings that the repository accepts.

- [ ] **Step 4: Re-run the targeted test and verify it passes**

Run:

```bash
node --test tests/ai/goodnight-builtin-skills-source.test.mjs
```

Expected: PASS

### Task 3: Remove multi-method product state and old knowledge path helpers

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/store/projectStore.ts`
- Modify: `src/utils/projectPersistence.ts`
- Modify: `src/components/project/ProjectSetup.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `tests/local-vault-knowledge-base.test.mjs`
- Modify: `tests/product-workbench-knowledge-cutover.test.mjs`

- [ ] **Step 1: Implement the type-level cutover**

Replace the old type shape with a single-engine project model:

```ts
export interface ProjectConfig {
  id: string;
  name: string;
  description: string;
  vaultPath: string;
  appType: AppType;
  createdAt: string;
  updatedAt: string;
}
```

Delete:

```ts
export type KnowledgeRetrievalMethod = 'm-flow' | 'llmwiki' | 'rag';
knowledgeRetrievalMethod: KnowledgeRetrievalMethod;
```

- [ ] **Step 2: Normalize persisted projects to the new shape**

In `src/store/projectStore.ts`, replace the old normalizer with a compatibility shim that drops old retrieval-mode values:

```ts
const normalizeProject = (project: Partial<ProjectConfig> & { vaultPath?: unknown }): ProjectConfig => ({
  id: typeof project.id === 'string' ? project.id : uuidv4(),
  name: typeof project.name === 'string' ? project.name : '未命名项目',
  description: typeof project.description === 'string' ? project.description : '',
  vaultPath: typeof project.vaultPath === 'string' ? project.vaultPath.trim() : '',
  appType: project.appType === 'mobile' ? 'mobile' : 'web',
  createdAt: typeof project.createdAt === 'string' ? project.createdAt : new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
```

- [ ] **Step 3: Replace old persistence helpers with native m-flow helpers**

In `src/utils/projectPersistence.ts`, introduce:

```ts
export const getVaultMFlowDir = (vaultPath: string) => joinPath(getVaultStateDir(vaultPath), 'm-flow');
export const ensureVaultKnowledgeDirectoryStructure = async (vaultPath: string) => {
  await ensureDirectory(vaultPath);
  await ensureDirectory(getVaultStateDir(vaultPath));
  await ensureDirectory(getVaultMFlowDir(vaultPath));
  await ensureDirectory(getVaultOutputsDir(vaultPath));
  await ensureDirectory(getVaultSkillOutputsDir(vaultPath, 'm-flow'));
};
```

Delete:

```ts
const KNOWLEDGE_SKILL_IDS = ['llmwiki', 'rag', 'm-flow'] as const;
getVaultBaseIndexDir(...)
getVaultSkillStateDir(...)
removeVaultKnowledgeOutputsExcept(...)
```

- [ ] **Step 4: Remove retrieval-mode UI and switching callbacks**

Apply minimal UI removal:

```tsx
<KnowledgeNoteWorkspace
  onRefreshSystemIndex={handleRefreshMFlow}
  // no knowledgeRetrievalMethod prop
  // no onKnowledgeRetrievalMethodChange prop
/>
```

Delete copy such as:

```tsx
检索方式
默认检索方式已切换为 ...
```

- [ ] **Step 5: Run the targeted tests and verify they pass**

Run:

```bash
node --test tests/local-vault-knowledge-base.test.mjs tests/product-workbench-knowledge-cutover.test.mjs
```

Expected: PASS

### Task 4: Introduce the new native m-flow model and persistence layer

**Files:**
- Create: `src/modules/knowledge/m-flow/model.ts`
- Create: `src/modules/knowledge/m-flow/persistence.ts`
- Create: `tests/m-flow-persistence.test.mjs`

- [ ] **Step 1: Add a failing unit test for the new state layout**

Cover:

```js
assert.match(source, /export interface MFlowManifest/);
assert.match(source, /export interface MFlowEpisode/);
assert.match(source, /relationshipName: 'has_facet' \| 'has_point' \| 'involves_entity'/);
assert.match(persistenceSource, /getVaultMFlowManifestPath/);
assert.match(persistenceSource, /getVaultMFlowEpisodesPath/);
assert.match(persistenceSource, /getVaultMFlowEdgesPath/);
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```bash
node --test tests/m-flow-persistence.test.mjs
```

Expected: FAIL because the native m-flow model files do not exist yet.

- [ ] **Step 3: Write the minimal model and path helpers**

Start with a tight model surface:

```ts
export interface MFlowManifest {
  version: number;
  builtAt: string;
  fingerprint: string;
  sourceCount: number;
  episodeCount: number;
  facetCount: number;
  facetPointCount: number;
  entityCount: number;
  edgeCount: number;
}

export interface MFlowEdge {
  id: string;
  fromId: string;
  toId: string;
  relationshipName: 'has_facet' | 'has_point' | 'involves_entity';
  edgeText: string;
}
```

And the persistence helpers:

```ts
export const getVaultMFlowManifestPath = (vaultPath: string) => joinPath(getVaultMFlowDir(vaultPath), 'manifest.json');
export const getVaultMFlowEpisodesPath = (vaultPath: string) => joinPath(getVaultMFlowDir(vaultPath), 'episodes.json');
export const getVaultMFlowEdgesPath = (vaultPath: string) => joinPath(getVaultMFlowDir(vaultPath), 'edges.json');
```

- [ ] **Step 4: Re-run the targeted test and verify it passes**

Run:

```bash
node --test tests/m-flow-persistence.test.mjs
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/knowledge/m-flow/model.ts src/modules/knowledge/m-flow/persistence.ts tests/m-flow-persistence.test.mjs src/types/index.ts src/store/projectStore.ts src/utils/projectPersistence.ts src/components/project/ProjectSetup.tsx src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx src/components/product/ProductWorkbench.tsx tests/local-vault-knowledge-base.test.mjs tests/product-workbench-knowledge-cutover.test.mjs
git commit -m "refactor: cut product state over to native m-flow"
```

### Task 5: Build ingest and graph construction modules

**Files:**
- Create: `src/modules/knowledge/m-flow/ingest.ts`
- Create: `src/modules/knowledge/m-flow/buildEpisodes.ts`
- Create: `src/modules/knowledge/m-flow/buildFacets.ts`
- Create: `src/modules/knowledge/m-flow/buildFacetPoints.ts`
- Create: `src/modules/knowledge/m-flow/buildEntities.ts`
- Create: `src/modules/knowledge/m-flow/buildEdges.ts`
- Create: `tests/m-flow-ingest.test.mjs`
- Create: `tests/m-flow-build.test.mjs`

- [ ] **Step 1: Add failing tests for source ingest and graph derivation**

Cover:

```js
assert.deepEqual(ingestedSources.map((source) => source.path), ['project/prd.md', 'src/search.ts']);
assert.equal(episodes.length, 2);
assert.ok(facets.every((facet) => facet.anchorText));
assert.ok(facetPoints.some((point) => point.searchText.includes('500ms')));
assert.ok(edges.some((edge) => edge.relationshipName === 'has_point'));
assert.ok(edges.some((edge) => edge.edgeText.includes('->')));
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run:

```bash
node --test tests/m-flow-ingest.test.mjs tests/m-flow-build.test.mjs
```

Expected: FAIL because the ingest and graph builders do not exist yet.

- [ ] **Step 3: Implement minimal ingest and graph-building code**

Structure the builders so each stage consumes the previous stage’s typed output:

```ts
const sources = await ingestMFlowSources({ vaultPath, requirementDocs, generatedFiles });
const episodes = buildEpisodes(sources);
const facets = buildFacets(episodes);
const facetPoints = buildFacetPoints(facets);
const entities = buildEntities({ episodes, facets, sources });
const edges = buildEdges({ episodes, facets, facetPoints, entities });
```

Important constraints:

- ingest must ignore `.goodnight/` and `_goodnight/`
- Episode generation may start as `1 source -> 1 episode`
- Facet generation must not use `tags[0]`
- FacetPoint generation must create independent nodes, not aliases-on-facet
- `edgeText` must be concise natural-language text

- [ ] **Step 4: Re-run the targeted tests and verify they pass**

Run:

```bash
node --test tests/m-flow-ingest.test.mjs tests/m-flow-build.test.mjs
```

Expected: PASS

### Task 6: Implement anchor search and bundle scoring

**Files:**
- Create: `src/modules/knowledge/m-flow/searchAnchors.ts`
- Create: `src/modules/knowledge/m-flow/scoreBundles.ts`
- Create: `tests/m-flow-search.test.mjs`

- [ ] **Step 1: Add failing search tests that encode the official retrieval philosophy**

Cover:

```js
assert.equal(results[0].bestPath.kind, 'point');
assert.equal(results[0].episodeId, 'episode:deadline');
assert.ok(results[0].score < results[1].score);
assert.ok(results.some((result) => result.bestPath.kind === 'entity'));
assert.ok(results.every((result) => Number.isFinite(result.score)));
```

Also lock the direct-hit penalty:

```js
assert.ok(directEpisodeScore > pointRoutedScore);
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run:

```bash
node --test tests/m-flow-search.test.mjs
```

Expected: FAIL because anchor search and bundle scoring do not exist yet.

- [ ] **Step 3: Implement the minimal search runtime**

Shape the code around explicit stages:

```ts
const anchors = searchAnchors(graph, queryText);
const bundles = scoreEpisodeBundles({
  graph,
  anchors,
  hopCost: 0.15,
  directEpisodePenalty: 0.4,
  edgeMissCost: 0.9,
});
```

Required behavior:

- search across `Episode.summary`, `Facet.searchText`, `Facet.anchorText`, `FacetPoint.searchText`, `Entity.name`, `Edge.edgeText`
- support path kinds:
  - `direct_episode`
  - `facet`
  - `point`
  - `entity`
  - `facet_entity`
- rank by minimum path cost
- penalize direct episode hits

- [ ] **Step 4: Re-run the targeted tests and verify they pass**

Run:

```bash
node --test tests/m-flow-search.test.mjs
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/knowledge/m-flow/ingest.ts src/modules/knowledge/m-flow/buildEpisodes.ts src/modules/knowledge/m-flow/buildFacets.ts src/modules/knowledge/m-flow/buildFacetPoints.ts src/modules/knowledge/m-flow/buildEntities.ts src/modules/knowledge/m-flow/buildEdges.ts src/modules/knowledge/m-flow/searchAnchors.ts src/modules/knowledge/m-flow/scoreBundles.ts tests/m-flow-ingest.test.mjs tests/m-flow-build.test.mjs tests/m-flow-search.test.mjs
git commit -m "feat: add native m-flow graph build and search core"
```

### Task 7: Wire rebuild, prompt context, and artifact rendering into the app

**Files:**
- Create: `src/modules/knowledge/m-flow/renderArtifacts.ts`
- Create: `src/modules/knowledge/m-flow/runtime.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/product/ProductWorkbench.tsx`
- Create: `tests/m-flow-runtime.test.mjs`
- Modify: `tests/knowledge-runtime-adapters.test.mjs`

- [ ] **Step 1: Add failing runtime tests for rebuild and prompt-context assembly**

Cover:

```js
assert.match(runtimeSource, /rebuildProjectMFlow/);
assert.match(runtimeSource, /buildMFlowPromptContext/);
assert.ok(artifacts.some((artifact) => artifact.path.endsWith('/_goodnight/outputs/m-flow/index.md')));
assert.ok(artifacts.some((artifact) => artifact.path.endsWith('/.goodnight/m-flow/edges.json')));
assert.match(promptContext.expandedSection, /best_path:/);
assert.match(promptContext.expandedSection, /episode_bundle:/);
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run:

```bash
node --test tests/m-flow-runtime.test.mjs tests/knowledge-runtime-adapters.test.mjs
```

Expected: FAIL because the app still routes through `systemIndexProject` and adapter-based runtime code.

- [ ] **Step 3: Implement the runtime facade and connect the app**

The public surface should look like:

```ts
export const rebuildProjectMFlow = async (options: {
  projectId: string;
  projectName: string;
  vaultPath: string;
  requirementDocs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
}) => { /* build, persist, render */ };

export const buildMFlowPromptContext = (state: MFlowState, userInput: string) => ({ ... });
```

In `AIChat.tsx`, replace:

```ts
const systemIndexRefreshResult = await ensureProjectSystemIndex(...)
const systemIndexPromptContext = buildKnowledgeRuntimePromptContext(...)
```

with:

```ts
const mFlowState = await rebuildProjectMFlow(...)
const promptContext = buildMFlowPromptContext(mFlowState.state, userInput)
```

- [ ] **Step 4: Re-run the targeted tests and verify they pass**

Run:

```bash
node --test tests/m-flow-runtime.test.mjs tests/knowledge-runtime-adapters.test.mjs
```

Expected: PASS

### Task 8: Remove old knowledge runtime files and finish the cutover

**Files:**
- Delete: `src/modules/knowledge/systemIndex.ts`
- Delete: `src/modules/knowledge/systemIndexProject.ts`
- Delete: `src/modules/knowledge/runtime/knowledgeRuntime.ts`
- Delete: `src/modules/knowledge/runtime/types.ts`
- Delete: `src/modules/knowledge/runtime/skillRuntimeContracts.ts`
- Delete: `src/modules/knowledge/adapters/common.ts`
- Delete: `src/modules/knowledge/adapters/llmwiki/llmwikiAdapter.ts`
- Delete: `src/modules/knowledge/adapters/m-flow/mFlowAdapter.ts`
- Delete: `src/modules/knowledge/adapters/rag/ragAdapter.ts`
- Modify: `tests/system-index-project.test.mjs`
- Modify: `tests/system-index.test.mjs`
- Modify: `tests/local-vault-knowledge-base.test.mjs`

- [ ] **Step 1: Replace or delete the old tests that only defend removed architecture**

Convert them into native checks such as:

```js
assert.match(source, /getVaultMFlowDir/);
assert.doesNotMatch(source, /base-index/);
assert.doesNotMatch(source, /llmwiki/);
assert.doesNotMatch(source, /rag/);
```

If a test file only exists to verify deleted modules, delete it and move any still-useful assertions into:

- `tests/m-flow-persistence.test.mjs`
- `tests/m-flow-runtime.test.mjs`

- [ ] **Step 2: Delete the old production files**

Remove the legacy files only after all imports are gone:

```bash
git rm src/modules/knowledge/systemIndex.ts src/modules/knowledge/systemIndexProject.ts src/modules/knowledge/runtime/knowledgeRuntime.ts src/modules/knowledge/runtime/types.ts src/modules/knowledge/runtime/skillRuntimeContracts.ts src/modules/knowledge/adapters/common.ts src/modules/knowledge/adapters/llmwiki/llmwikiAdapter.ts src/modules/knowledge/adapters/m-flow/mFlowAdapter.ts src/modules/knowledge/adapters/rag/ragAdapter.ts
```

- [ ] **Step 3: Run the focused regression suite**

Run:

```bash
node --test tests/local-vault-knowledge-base.test.mjs tests/product-workbench-knowledge-cutover.test.mjs tests/ai/goodnight-builtin-skills-source.test.mjs tests/m-flow-persistence.test.mjs tests/m-flow-ingest.test.mjs tests/m-flow-build.test.mjs tests/m-flow-search.test.mjs tests/m-flow-runtime.test.mjs tests/knowledge-runtime-adapters.test.mjs
```

Expected: PASS

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: PASS

- [ ] **Step 5: Fix any compile or regression failures and re-run the same commands until both pass**

If anything fails, only touch the files directly involved, then repeat the exact commands above.

- [ ] **Step 6: Commit**

```bash
git add docs/references/upstream/m-flow src tests
git commit -m "refactor: cut knowledge runtime over to native m-flow"
```

## Self-Review

Spec coverage:

- Single-engine product cutover is covered by Task 1 and Task 3.
- Upstream reference copy is covered by Task 2.
- `.goodnight/m-flow/` persistence is covered by Task 4.
- Native graph model construction is covered by Task 5.
- Anchor search plus bundle scoring is covered by Task 6.
- Runtime wiring into AIChat and ProductWorkbench is covered by Task 7.
- Deleting `base-index`, legacy runtime adapters, and old system index code is covered by Task 8.

Placeholder scan:

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Every verification step names an exact command and expected result.
- Code-changing steps include concrete interfaces, function names, or code skeletons.

Type consistency:

- `MFlowManifest`, `MFlowEdge`, and the new `m-flow` module paths are introduced before later tasks rely on them.
- `rebuildProjectMFlow()` and `buildMFlowPromptContext()` are defined in Task 7 before old runtime files are deleted in Task 8.
- The plan consistently removes `KnowledgeRetrievalMethod`, `base-index`, and multi-adapter runtime wiring instead of partially preserving them.
