# AI Chat Context Index And Reference Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace chat's hard-coded knowledge selection with a unified reference-file system, selected-file boundaries, and index-first context delivery.

**Architecture:** Build a normalized `ReferenceFile` layer on top of existing `requirementDocs`, `generatedFiles`, and derived design markdown. Use that layer to generate a project-local context index and drive AI chat selection state. Update prompt assembly so chat sends a compact file index first and only expands detailed content from selected files when needed.

**Tech Stack:** React 19, TypeScript, Zustand, existing AI chat modules, Node `--test` source regression tests

---

### Task 1: Lock the reference-file model with failing tests

**Files:**
- Create: `tests/ai/reference-files.test.mjs`
- Create: `tests/ai/context-index.test.mjs`
- Modify: `tests/ai/direct-chat-prompt.test.mjs`

- [ ] **Step 1: Write the failing reference-file tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const referenceFilesPath = path.resolve(__dirname, '../../src/modules/knowledge/referenceFiles.ts');

const importTsModule = async (filePath) => {
  const source = await readFile(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });

  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};

test('buildReferenceFiles includes generated markdown and generated html entries', async () => {
  const { buildReferenceFiles } = await importTsModule(referenceFilesPath);

  const result = buildReferenceFiles({
    requirementDocs: [],
    generatedFiles: [
      {
        path: 'src/generated/planning/wireframes.md',
        content: '# Wireframes',
        language: 'md',
        category: 'design',
        summary: 'Wireframe summary',
        sourceTaskIds: [],
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        path: 'prototype/login.html',
        content: '<html><body>Login</body></html>',
        language: 'html',
        category: 'design',
        summary: 'Login prototype',
        sourceTaskIds: [],
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ],
    designPages: [],
    wireframes: {},
    designStyleNodes: [],
  });

  assert.ok(result.some((file) => file.path === 'src/generated/planning/wireframes.md'));
  assert.ok(result.some((file) => file.path === 'prototype/login.html'));
});

test('buildReferenceFiles emits derived sketch and style markdown with stable paths', async () => {
  const { buildReferenceFiles } = await importTsModule(referenceFilesPath);

  const result = buildReferenceFiles({
    requirementDocs: [],
    generatedFiles: [],
    designPages: [{ id: 'page-1', name: '登录页', description: '', metadata: { route: '/login', template: 'custom' } }],
    wireframes: {
      'page-1': {
        pageId: 'page-1',
        pageName: '登录页',
        updatedAt: '2026-04-25T00:00:00.000Z',
        elements: [],
      },
    },
    designStyleNodes: [
      {
        id: 'style-1',
        title: '默认样式',
        summary: '极简',
        keywords: ['clean'],
        palette: ['#111111', '#ffffff'],
        prompt: '浅色简洁',
      },
    ],
  });

  assert.ok(result.some((file) => file.path === 'sketch/pages/page-1-login.md'));
  assert.ok(result.some((file) => file.path === 'design/styles/style-1-default.md'));
});
```

- [ ] **Step 2: Write the failing context-index tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contextIndexPath = path.resolve(__dirname, '../../src/modules/ai/chat/contextIndex.ts');

const importTsModule = async (filePath) => {
  const source = await readFile(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });

  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};

test('buildContextIndex serializes readable files and preserves related ids', async () => {
  const { buildContextIndex } = await importTsModule(contextIndexPath);

  const result = buildContextIndex([
    {
      id: 'sketch:login',
      path: 'sketch/pages/login.md',
      title: '登录页草图',
      content: '# 登录页草图',
      type: 'md',
      group: 'sketch',
      source: 'derived',
      updatedAt: '2026-04-25T00:00:00.000Z',
      readableByAI: true,
      summary: '登录结构',
      relatedIds: ['design:login-html'],
      tags: ['login'],
    },
  ]);

  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].path, 'sketch/pages/login.md');
  assert.deepEqual(result.files[0].relatedIds, ['design:login-html']);
});
```

- [ ] **Step 3: Extend the direct prompt test so it expects index-first prompt sections**

```js
test('buildDirectChatPrompt includes reference index and expanded file sections', () => {
  const result = buildDirectChatPrompt({
    userInput: '基于这些文件整理首页方案',
    currentProjectName: 'PM Workspace',
    contextWindowTokens: 200000,
    skillIntent: null,
    knowledgeSelection: {
      currentFile: null,
      relatedFiles: [],
    },
    referenceContext: {
      indexSection: '- sketch/pages/login.md | 登录页草图 | 登录结构',
      expandedSection: 'file: sketch/pages/login.md\\n# 登录页草图',
      labels: ['已选文件 / 2'],
    },
  });

  assert.match(result.prompt, /reference_index:/);
  assert.match(result.prompt, /expanded_files:/);
  assert.match(result.prompt, /sketch\\/pages\\/login\\.md/);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `node --test tests/ai/reference-files.test.mjs tests/ai/context-index.test.mjs tests/ai/direct-chat-prompt.test.mjs`

Expected: FAIL because `referenceFiles.ts`, `contextIndex.ts`, and the new prompt sections do not exist yet.

- [ ] **Step 5: Commit**

```bash
git add tests/ai/reference-files.test.mjs tests/ai/context-index.test.mjs tests/ai/direct-chat-prompt.test.mjs
git commit -m "test: lock ai reference file context behavior"
```

### Task 2: Build unified reference files and the system context index

**Files:**
- Create: `src/modules/knowledge/referenceFiles.ts`
- Create: `src/modules/ai/chat/contextIndex.ts`
- Modify: `src/modules/knowledge/knowledgeEntries.ts`
- Test: `tests/ai/reference-files.test.mjs`
- Test: `tests/ai/context-index.test.mjs`

- [ ] **Step 1: Create the reference-file module with normalization helpers**

```ts
export type ReferenceFile = {
  id: string;
  path: string;
  title: string;
  content: string;
  type: 'md' | 'html' | 'json' | 'txt';
  group: 'project' | 'sketch' | 'design';
  source: 'user' | 'ai' | 'derived';
  updatedAt: string;
  readableByAI: boolean;
  summary: string;
  relatedIds: string[];
  tags: string[];
};

export const toReferenceFileId = (path: string) => path.replace(/\\/g, '/');
export const slugifyReferencePart = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\\u4e00-\\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
```

- [ ] **Step 2: Add deterministic builders for generated, sketch, and style reference files**

```ts
export const buildReferenceFiles = (options: {
  requirementDocs: RequirementDoc[];
  generatedFiles: GeneratedFile[];
  designPages: PageStructureNode[];
  wireframes: Record<string, WireframeDocument>;
  designStyleNodes: Array<Pick<DesignStyleNode, 'id' | 'title' | 'summary' | 'keywords' | 'palette' | 'prompt'>>;
}) => {
  const requirementFiles = options.requirementDocs.map((doc) => ({
    id: doc.id,
    path: doc.filePath || doc.title,
    title: doc.title,
    content: doc.content,
    type: 'md' as const,
    group: doc.kind === 'sketch' ? 'sketch' as const : 'project' as const,
    source: 'user' as const,
    updatedAt: doc.updatedAt,
    readableByAI: true,
    summary: doc.summary,
    relatedIds: doc.relatedIds || [],
    tags: doc.tags || [],
  }));

  const generated = options.generatedFiles
    .filter((file) => file.language === 'md' || file.language === 'html')
    .map((file) => ({
      id: toReferenceFileId(file.path),
      path: file.path,
      title: file.path.split('/').pop() || file.path,
      content: file.content,
      type: file.language === 'html' ? 'html' as const : 'md' as const,
      group: file.language === 'html' ? 'design' as const : 'project' as const,
      source: 'ai' as const,
      updatedAt: file.updatedAt,
      readableByAI: true,
      summary: file.summary,
      relatedIds: file.relatedRequirementIds || [],
      tags: file.tags || [],
    }));

  return [...requirementFiles, ...generated];
};
```

- [ ] **Step 3: Add context-index serialization helpers**

```ts
import type { ReferenceFile } from '../../knowledge/referenceFiles.ts';

export type ContextIndex = {
  version: 1;
  updatedAt: string;
  groups: Array<{ id: ReferenceFile['group']; label: string }>;
  files: Array<{
    id: string;
    path: string;
    title: string;
    type: ReferenceFile['type'];
    group: ReferenceFile['group'];
    source: ReferenceFile['source'];
    summary: string;
    tags: string[];
    relatedIds: string[];
    updatedAt: string;
    readableByAI: boolean;
    sizeHint: number;
  }>;
};

export const buildContextIndex = (files: ReferenceFile[]): ContextIndex => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  groups: [
    { id: 'project', label: '项目' },
    { id: 'sketch', label: '草图' },
    { id: 'design', label: '设计' },
  ],
  files: files
    .filter((file) => file.readableByAI)
    .map((file) => ({
      id: file.id,
      path: file.path,
      title: file.title,
      type: file.type,
      group: file.group,
      source: file.source,
      summary: file.summary,
      tags: file.tags,
      relatedIds: file.relatedIds,
      updatedAt: file.updatedAt,
      readableByAI: file.readableByAI,
      sizeHint: file.content.length,
    })),
});
```

- [ ] **Step 4: Keep knowledge entries compatible by mapping from reference files where useful**

```ts
export const toKnowledgeEntries = (files: ReferenceFile[]): KnowledgeEntry[] =>
  files
    .filter((file) => file.type === 'md' || file.type === 'html')
    .map((file) => ({
      id: file.id,
      title: file.title,
      summary: file.summary,
      content: file.content,
      type: file.type === 'html' ? 'html' : 'markdown',
      source: file.source === 'ai' ? 'generated' : 'requirement',
      filePath: file.path,
      updatedAt: file.updatedAt,
      status: 'ready',
      kind: file.group === 'sketch' ? 'sketch' : 'note',
      tags: file.tags,
      relatedIds: file.relatedIds,
    }));
```

- [ ] **Step 5: Run the new tests**

Run: `node --test tests/ai/reference-files.test.mjs tests/ai/context-index.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/knowledge/referenceFiles.ts src/modules/ai/chat/contextIndex.ts src/modules/knowledge/knowledgeEntries.ts tests/ai/reference-files.test.mjs tests/ai/context-index.test.mjs
git commit -m "feat: add unified ai reference files and context index"
```

### Task 3: Move chat selection state from knowledge ids to selected reference files

**Files:**
- Modify: `src/modules/ai/store/aiContextStore.ts`
- Modify: `src/modules/ai/chat/chatContext.ts`
- Create: `tests/ai/reference-scope.test.mjs`
- Modify: `tests/ai/chat-context.test.mjs`

- [ ] **Step 1: Write the failing selected-file scope tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatContextPath = path.resolve(__dirname, '../../src/modules/ai/chat/chatContext.ts');

const importTsModule = async (filePath) => {
  const source = await readFile(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });

  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};

test('resolveReferenceFileSelection replaces selected files for current scope', async () => {
  const { resolveReferenceScopeSelection } = await importTsModule(chatContextPath);

  const files = [
    { id: 'a', path: 'docs/a.md', readableByAI: true },
    { id: 'b', path: 'docs/b.md', readableByAI: true },
  ];

  const result = resolveReferenceScopeSelection({
    mode: 'current',
    currentFileIds: ['b'],
    directoryPath: null,
    allFiles: files,
  });

  assert.deepEqual(result, ['b']);
});

test('resolveReferenceFileSelection expands full directories without per-file filtering', async () => {
  const { resolveReferenceScopeSelection } = await importTsModule(chatContextPath);

  const files = [
    { id: 'a', path: 'sketch/pages/a.md', readableByAI: true },
    { id: 'b', path: 'sketch/pages/b.md', readableByAI: true },
    { id: 'c', path: 'design/styles/c.md', readableByAI: true },
  ];

  const result = resolveReferenceScopeSelection({
    mode: 'directory',
    currentFileIds: [],
    directoryPath: 'sketch/pages',
    allFiles: files,
  });

  assert.deepEqual(result, ['a', 'b']);
});
```

- [ ] **Step 2: Extend the AI context store with selected reference file state**

```ts
type AIReferenceScopeMode = 'current' | 'directory' | 'all';

type AIContextProjectState = {
  scene: AIContextScene;
  selectedKnowledgeEntryId: string | null;
  selectedPageId: string | null;
  knowledgeMode: AIKnowledgeMode;
  selectedReferenceFileIds: string[];
  selectedReferenceDirectory: string | null;
  referenceScopeMode: AIReferenceScopeMode;
};

setSelectedReferenceFileIds: (projectId: string, ids: string[]) => void;
setReferenceScopeMode: (projectId: string, mode: AIReferenceScopeMode) => void;
setSelectedReferenceDirectory: (projectId: string, path: string | null) => void;
```

- [ ] **Step 3: Add scope-resolution helpers to chatContext**

```ts
export const resolveReferenceScopeSelection = (options: {
  mode: 'current' | 'directory' | 'all';
  currentFileIds: string[];
  directoryPath: string | null;
  allFiles: Array<Pick<ReferenceFile, 'id' | 'path' | 'readableByAI'>>;
}) => {
  if (options.mode === 'all') {
    return options.allFiles.filter((file) => file.readableByAI).map((file) => file.id);
  }

  if (options.mode === 'directory') {
    const prefix = (options.directoryPath || '').replace(/\\/g, '/').replace(/\/$/, '');
    return options.allFiles
      .filter((file) => file.readableByAI && prefix && file.path.startsWith(`${prefix}/`))
      .map((file) => file.id);
  }

  return Array.from(new Set(options.currentFileIds));
};
```

- [ ] **Step 4: Update chat-context tests to cover the new scope labels and file selection path**

```js
test('buildChatContextSnapshot prefers selected-file summary labels over knowledge-only labels', () => {
  const result = buildChatContextSnapshot({
    scene: 'knowledge',
    knowledgeLabel: '已选文件 / 3',
  });

  assert.equal(result.primaryLabel, '已选文件 / 3');
  assert.equal(result.secondaryLabel, null);
});
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/ai/reference-scope.test.mjs tests/ai/chat-context.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/ai/store/aiContextStore.ts src/modules/ai/chat/chatContext.ts tests/ai/reference-scope.test.mjs tests/ai/chat-context.test.mjs
git commit -m "feat: track selected ai reference files and scope"
```

### Task 4: Switch prompt assembly to index-first delivery with automatic expansion

**Files:**
- Modify: `src/modules/ai/chat/directChatPrompt.ts`
- Create: `src/modules/ai/chat/referencePromptContext.ts`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `tests/ai/direct-chat-prompt.test.mjs`
- Create: `tests/ai/reference-prompt-context.test.mjs`

- [ ] **Step 1: Write the failing reference prompt context tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const referencePromptContextPath = path.resolve(__dirname, '../../src/modules/ai/chat/referencePromptContext.ts');

const importTsModule = async (filePath) => {
  const source = await readFile(filePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });

  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};

test('buildReferencePromptContext emits index text and expanded content for the most relevant files', async () => {
  const { buildReferencePromptContext } = await importTsModule(referencePromptContextPath);

  const result = buildReferencePromptContext({
    selectedFiles: [
      {
        id: 'a',
        path: 'sketch/pages/login.md',
        title: '登录页草图',
        content: '# 登录页草图\\n## 模块\\n- Hero',
        type: 'md',
        group: 'sketch',
        source: 'derived',
        updatedAt: '2026-04-25T00:00:00.000Z',
        readableByAI: true,
        summary: '登录结构',
        relatedIds: [],
        tags: ['login'],
      },
    ],
    maxExpandedFiles: 1,
    maxExpandedChars: 400,
  });

  assert.match(result.indexSection, /sketch\\/pages\\/login\\.md/);
  assert.match(result.expandedSection, /file: sketch\\/pages\\/login\\.md/);
});
```

- [ ] **Step 2: Implement the prompt-context builder with index and compression helpers**

```ts
export const buildReferencePromptContext = (options: {
  selectedFiles: ReferenceFile[];
  maxExpandedFiles?: number;
  maxExpandedChars?: number;
}) => {
  const visibleFiles = options.selectedFiles.filter((file) => file.readableByAI);
  const indexSection = visibleFiles
    .map((file) => `- ${file.path} | ${file.title} | ${file.summary} | ${file.type} | ${file.updatedAt}`)
    .join('\n');

  const expandedFiles = visibleFiles.slice(0, options.maxExpandedFiles || 4).map((file) => {
    const body = file.content.length > (options.maxExpandedChars || 4000)
      ? `${file.content.slice(0, options.maxExpandedChars || 4000)}\n...[truncated]`
      : file.content;
    return `file: ${file.path}\n${body}`;
  });

  return {
    labels: [`已选文件 / ${visibleFiles.length}`],
    indexSection,
    expandedSection: expandedFiles.join('\n\n'),
  };
};
```

- [ ] **Step 3: Extend directChatPrompt to accept reference context**

```ts
export const buildDirectChatPrompt = (options: {
  userInput: string;
  currentProjectName?: string;
  contextWindowTokens?: number;
  skillIntent: SkillIntent | null;
  knowledgeSelection: KnowledgeSelection;
  contextLabels?: string[];
  referenceContext?: {
    indexSection: string;
    expandedSection: string;
    labels: string[];
  } | null;
}) => {
  // ...
  if (options.referenceContext?.indexSection) {
    promptSections.push(`reference_index:\n${options.referenceContext.indexSection}`);
  }

  if (options.referenceContext?.expandedSection) {
    promptSections.push(`expanded_files:\n${options.referenceContext.expandedSection}`);
  }
};
```

- [ ] **Step 4: Wire AIChat to build selected reference files and pass prompt context**

```ts
const referenceFiles = useMemo(
  () =>
    buildReferenceFiles({
      requirementDocs,
      generatedFiles,
      designPages,
      wireframes,
      designStyleNodes,
    }),
  [designPages, designStyleNodes, generatedFiles, requirementDocs, wireframes]
);

const selectedReferenceFiles = useMemo(
  () => referenceFiles.filter((file) => selectedReferenceFileIds.includes(file.id)),
  [referenceFiles, selectedReferenceFileIds]
);

const referencePromptContext = useMemo(
  () => buildReferencePromptContext({ selectedFiles: selectedReferenceFiles }),
  [selectedReferenceFiles]
);
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/ai/direct-chat-prompt.test.mjs tests/ai/reference-prompt-context.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/ai/chat/directChatPrompt.ts src/modules/ai/chat/referencePromptContext.ts src/components/workspace/AIChat.tsx tests/ai/direct-chat-prompt.test.mjs tests/ai/reference-prompt-context.test.mjs
git commit -m "feat: build ai chat prompts from reference indexes"
```

### Task 5: Add chat UI controls for selected files and reference-scope shortcuts

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Modify: `src/components/workspace/aiChatViewState.ts`
- Create: `tests/ai/ai-chat-reference-ui.test.mjs`

- [ ] **Step 1: Write the failing UI source assertions**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const aiChatCssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');

test('AIChat renders selected files and scope shortcut buttons', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /引用当前/);
  assert.match(source, /引用目录/);
  assert.match(source, /引用全部/);
  assert.match(source, /selectedReferenceFileIds/);
  assert.match(source, /handleApplyReferenceScope/);
});

test('AIChat stylesheet defines selected-file chip styling', async () => {
  const source = await readFile(aiChatCssPath, 'utf8');

  assert.match(source, /\.chat-reference-scope/);
  assert.match(source, /\.chat-reference-chip-list/);
  assert.match(source, /\.chat-reference-chip/);
});
```

- [ ] **Step 2: Render selected-file chips and three shortcut buttons in the composer area**

```tsx
<div className="chat-reference-scope">
  <div className="chat-reference-scope-actions">
    <button type="button" onClick={() => handleApplyReferenceScope('current')}>引用当前</button>
    <button type="button" onClick={() => handleApplyReferenceScope('directory')}>引用目录</button>
    <button type="button" onClick={() => handleApplyReferenceScope('all')}>引用全部</button>
  </div>
  <div className="chat-reference-chip-list">
    {selectedReferenceFiles.map((file) => (
      <button
        key={file.id}
        type="button"
        className="chat-reference-chip"
        onClick={() => handleRemoveReferenceFile(file.id)}
      >
        <strong>{file.title}</strong>
        <span>{file.path}</span>
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Add minimal composer styling**

```css
.chat-reference-scope {
  display: grid;
  gap: 10px;
}

.chat-reference-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chat-reference-chip {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  padding: 6px 10px;
}
```

- [ ] **Step 4: Run the UI assertions**

Run: `node --test tests/ai/ai-chat-reference-ui.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/workspace/AIChat.tsx src/components/workspace/AIChat.css src/components/workspace/aiChatViewState.ts tests/ai/ai-chat-reference-ui.test.mjs
git commit -m "feat: add ai chat reference scope controls"
```

### Task 6: Verify the full chat reference flow

**Files:**
- Verify only

- [ ] **Step 1: Run the targeted AI chat tests**

Run: `node --test tests/ai/reference-files.test.mjs tests/ai/context-index.test.mjs tests/ai/reference-scope.test.mjs tests/ai/reference-prompt-context.test.mjs tests/ai/direct-chat-prompt.test.mjs tests/ai/chat-context.test.mjs tests/ai/ai-chat-reference-ui.test.mjs`

Expected: PASS

- [ ] **Step 2: Run the broader affected test set**

Run: `node --test tests/ai/*.test.mjs tests/knowledge-tree.test.mjs tests/product-workbench.test.mjs`

Expected: PASS

- [ ] **Step 3: Run the application build**

Run: `npm run build`

Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: unify ai chat references with context index"
```
