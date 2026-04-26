# Obsidian Workbench Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前产品工作台改造成统一的桌面 workbench 外壳，并在不破坏现有画布行为的前提下，把知识区升级为 Obsidian 风格的本地 Markdown 工作区。

**Architecture:** 继续沿用当前 `Tauri + React + Zustand + Allotment` 架构，不引入外部 workbench 壳。先从 [ProductWorkbench.tsx](/abs/path/c:/Users/Even/Documents/ALL-IN-ONE/src/components/product/ProductWorkbench.tsx) 中抽出 `WorkbenchShell`、`KnowledgeWorkspace`、`PageWorkspace` 边界，再把 `Milkdown` 和 `FlexSearch` 接进知识区，最后统一 AI 上下文边界和 monochrome 样式。

**Tech Stack:** React 19、TypeScript、Tauri 2、Zustand、Allotment、Milkdown、FlexSearch、Node `--test`

---

## File Map

**Existing files to modify**
- `package.json`
- `package-lock.json`
- `src/App.css`
- `src/components/product/ProductWorkbench.tsx`
- `src/components/workspace/AIChat.tsx`
- `src/modules/knowledge/knowledgeEntries.ts`
- `tests/desktop-workbench-ui.test.mjs`
- `tests/product-workbench.test.mjs`

**New files to create**
- `src/components/product/WorkbenchShell.tsx`
- `src/components/product/KnowledgeWorkspace.tsx`
- `src/components/product/PageWorkspace.tsx`
- `src/components/product/MilkdownEditor.tsx`
- `src/modules/knowledge/knowledgeSearch.ts`
- `tests/knowledge-search.test.mjs`
- `tests/knowledge-workspace-ui.test.mjs`

**Responsibility split**
- `WorkbenchShell.tsx`: 左中右三栏壳体、split、共享 chrome
- `KnowledgeWorkspace.tsx`: 知识树联动、tabs、搜索、编辑器容器、自动保存
- `PageWorkspace.tsx`: 现有页面/画布工作流的搬运与壳层接线，不改核心行为
- `MilkdownEditor.tsx`: Markdown WYSIWYG 包装层
- `knowledgeSearch.ts`: 本地全文索引与查询

### Task 1: 安装依赖并锁定新边界

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/desktop-workbench-ui.test.mjs`
- Test: `tests/knowledge-workspace-ui.test.mjs`

- [ ] **Step 1: 先写一个失败的 UI 边界测试**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');

test('product workbench delegates shell and workspace responsibilities to focused child components', async () => {
  const source = await readFile(productPath, 'utf8');

  assert.match(source, /import\s+\{\s*WorkbenchShell\s*\}\s+from '\.\/WorkbenchShell'/);
  assert.match(source, /import\s+\{\s*KnowledgeWorkspace\s*\}\s+from '\.\/KnowledgeWorkspace'/);
  assert.match(source, /import\s+\{\s*PageWorkspace\s*\}\s+from '\.\/PageWorkspace'/);
  assert.match(source, /<WorkbenchShell/);
  assert.match(source, /<KnowledgeWorkspace/);
  assert.match(source, /<PageWorkspace/);
});
```

- [ ] **Step 2: 运行测试，确认当前还没通过**

Run: `node --test tests/knowledge-workspace-ui.test.mjs`  
Expected: FAIL，报 `WorkbenchShell` 或 `KnowledgeWorkspace` 相关断言不匹配

- [ ] **Step 3: 安装知识编辑和搜索依赖**

```bash
npm install @milkdown/kit @milkdown/react @milkdown/theme-nord flexsearch
```

同时把 `package.json` 依赖更新为：

```json
{
  "dependencies": {
    "@milkdown/kit": "^7",
    "@milkdown/react": "^7",
    "@milkdown/theme-nord": "^7",
    "flexsearch": "^0.8.212"
  }
}
```

- [ ] **Step 4: 补一个桌面 workbench 边界测试**

在 `tests/desktop-workbench-ui.test.mjs` 追加：

```js
test('desktop product workbench uses dedicated shell and workspace files', async () => {
  const productSource = await readFile(productPath, 'utf8');

  assert.match(productSource, /WorkbenchShell/);
  assert.match(productSource, /KnowledgeWorkspace/);
  assert.match(productSource, /PageWorkspace/);
});
```

- [ ] **Step 5: 再次运行 UI 测试，依然允许失败，但依赖安装应成功**

Run: `node --test tests/desktop-workbench-ui.test.mjs tests/knowledge-workspace-ui.test.mjs`  
Expected: FAIL，且错误只来自未实现的新结构断言；`npm install` 已完成

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tests/desktop-workbench-ui.test.mjs tests/knowledge-workspace-ui.test.mjs
git commit -m "chore: add workbench knowledge editor dependencies"
```

### Task 2: 抽出 WorkbenchShell，不改变现有业务行为

**Files:**
- Create: `src/components/product/WorkbenchShell.tsx`
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/App.css`
- Test: `tests/knowledge-workspace-ui.test.mjs`

- [ ] **Step 1: 写失败测试，锁定 shell API**

在 `tests/knowledge-workspace-ui.test.mjs` 追加：

```js
const shellPath = path.resolve(__dirname, '../src/components/product/WorkbenchShell.tsx');
const appCssPath = path.resolve(__dirname, '../src/App.css');

test('workbench shell owns left center right layout and chrome classes', async () => {
  const source = await readFile(shellPath, 'utf8');
  const css = await readFile(appCssPath, 'utf8');

  assert.match(source, /type WorkbenchShellProps =/);
  assert.match(source, /leftPane: ReactNode/);
  assert.match(source, /centerPane: ReactNode/);
  assert.match(source, /rightPane: ReactNode/);
  assert.match(source, /<Allotment/);
  assert.match(css, /\.pm-workbench-shell\s*\{/);
  assert.match(css, /\.pm-workbench-sidebar\s*\{/);
  assert.match(css, /\.pm-workbench-main\s*\{/);
  assert.match(css, /\.pm-workbench-ai-pane\s*\{/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/knowledge-workspace-ui.test.mjs`  
Expected: FAIL，提示 `WorkbenchShell.tsx` 不存在或类名未找到

- [ ] **Step 3: 创建最小 WorkbenchShell 组件**

在 `src/components/product/WorkbenchShell.tsx` 写入：

```tsx
import type { ReactNode } from 'react';
import { Allotment } from 'allotment';

type WorkbenchShellProps = {
  leftPane: ReactNode;
  centerPane: ReactNode;
  rightPane: ReactNode;
  leftSize: number;
  rightSize: number;
  onLeftSizeChange: (sizes: number[]) => void;
};

export const WorkbenchShell = ({
  leftPane,
  centerPane,
  rightPane,
  leftSize,
  rightSize,
  onLeftSizeChange,
}: WorkbenchShellProps) => (
  <section className="pm-workbench-shell">
    <Allotment className="pm-workbench-shell-allotment" onChange={onLeftSizeChange}>
      <Allotment.Pane preferredSize={leftSize} minSize={220}>
        <aside className="pm-workbench-sidebar">{leftPane}</aside>
      </Allotment.Pane>
      <Allotment.Pane minSize={640}>
        <div className="pm-workbench-main-with-ai">
          <main className="pm-workbench-main">{centerPane}</main>
          <aside className="pm-workbench-ai-pane" style={{ width: rightSize }}>
            {rightPane}
          </aside>
        </div>
      </Allotment.Pane>
    </Allotment>
  </section>
);
```

- [ ] **Step 4: 在 ProductWorkbench 中先只替换外壳，不拆内部逻辑**

在 `src/components/product/ProductWorkbench.tsx` 先做到：

```tsx
import { WorkbenchShell } from './WorkbenchShell';

// 先继续复用现有 left nav、viewer stack、AI pane JSX，
// 只是把它们塞进新的 WorkbenchShell。
return (
  <WorkbenchShell
    leftPane={leftNav}
    centerPane={viewerPane}
    rightPane={aiPane}
    leftSize={productWorkbenchLeftNavWidth}
    rightSize={desktopAiPaneWidth}
    onLeftSizeChange={handleProductWorkbenchLayoutChange}
  />
);
```

- [ ] **Step 5: 加最小样式，让三栏壳体成立**

在 `src/App.css` 增加：

```css
.pm-workbench-shell {
  display: flex;
  min-height: 0;
  height: 100%;
}

.pm-workbench-sidebar,
.pm-workbench-main,
.pm-workbench-ai-pane {
  min-height: 0;
}

.pm-workbench-main-with-ai {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  height: 100%;
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `node --test tests/desktop-workbench-ui.test.mjs tests/knowledge-workspace-ui.test.mjs`  
Expected: PASS，新 shell 相关断言通过；旧桌面 workbench 断言不回退

- [ ] **Step 7: Commit**

```bash
git add src/components/product/WorkbenchShell.tsx src/components/product/ProductWorkbench.tsx src/App.css tests/desktop-workbench-ui.test.mjs tests/knowledge-workspace-ui.test.mjs
git commit -m "refactor: extract product workbench shell"
```

### Task 3: 抽出 PageWorkspace，保护画布行为

**Files:**
- Create: `src/components/product/PageWorkspace.tsx`
- Modify: `src/components/product/ProductWorkbench.tsx`
- Test: `tests/product-workbench.test.mjs`
- Test: `tests/knowledge-workspace-ui.test.mjs`

- [ ] **Step 1: 写失败测试，锁定画布仍走原有依赖**

在 `tests/product-workbench.test.mjs` 追加：

```js
const pageWorkspacePath = path.resolve(__dirname, '../src/components/product/PageWorkspace.tsx');

test('page workspace preserves current canvas and sketch persistence hooks', async () => {
  const source = await readFile(pageWorkspacePath, 'utf8');

  assert.match(source, /Canvas/);
  assert.match(source, /writeSketchPageFile/);
  assert.match(source, /deleteSketchPageFile/);
  assert.match(source, /loadSketchPageArtifactsFromProjectDir/);
  assert.doesNotMatch(source, /Milkdown/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/product-workbench.test.mjs`  
Expected: FAIL，提示 `PageWorkspace.tsx` 尚不存在

- [ ] **Step 3: 创建 PageWorkspace，先做原样搬运**

在 `src/components/product/PageWorkspace.tsx` 建一个薄包装：

```tsx
type PageWorkspaceProps = {
  pagePane: ReactNode;
};

export const PageWorkspace = ({ pagePane }: PageWorkspaceProps) => {
  return <section className="pm-page-workspace-shell">{pagePane}</section>;
};
```

然后把 [ProductWorkbench.tsx](/abs/path/c:/Users/Even/Documents/ALL-IN-ONE/src/components/product/ProductWorkbench.tsx) 里原本页面/画布相关 JSX 收口成：

```tsx
import { PageWorkspace } from './PageWorkspace';

const pageWorkspacePane = <PageWorkspace pagePane={existingPagePane} />;
```

- [ ] **Step 4: 把画布 persistence 逻辑留在 ProductWorkbench，不提前搬家**

保持这些调用还留在 `ProductWorkbench.tsx`：

```tsx
await writeSketchPageFile(currentProject.id, nextPage, null);
await deleteSketchPageFile(currentProject.id, pageId);
const sketchArtifacts = await loadSketchPageArtifactsFromProjectDir(currentProject.id);
```

这是保护画布的关键：先抽显示边界，不抽数据链路。

- [ ] **Step 5: 运行回归测试，确认画布行为相关断言仍通过**

Run: `node --test tests/product-workbench.test.mjs`  
Expected: PASS，`writeSketchPageFile` / `deleteSketchPageFile` / `loadSketchPageArtifactsFromProjectDir` 相关断言保留

- [ ] **Step 6: Commit**

```bash
git add src/components/product/PageWorkspace.tsx src/components/product/ProductWorkbench.tsx tests/product-workbench.test.mjs tests/knowledge-workspace-ui.test.mjs
git commit -m "refactor: isolate page workspace shell"
```

### Task 4: 抽出 KnowledgeWorkspace 和本地搜索模型

**Files:**
- Create: `src/components/product/KnowledgeWorkspace.tsx`
- Create: `src/modules/knowledge/knowledgeSearch.ts`
- Modify: `src/components/product/ProductWorkbench.tsx`
- Test: `tests/knowledge-search.test.mjs`
- Test: `tests/knowledge-workspace-ui.test.mjs`

- [ ] **Step 1: 先写搜索模块失败测试**

创建 `tests/knowledge-search.test.mjs`：

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildKnowledgeSearchIndex, searchKnowledgeEntries } from '../src/modules/knowledge/knowledgeSearch.ts';

test('knowledge search matches title and content with deterministic ordering', () => {
  const entries = [
    { id: 'a', title: '产品需求', content: '支持 Markdown 编辑与搜索', summary: '产品摘要' },
    { id: 'b', title: '设计草图', content: '页面画布与结构', summary: '设计摘要' },
  ];

  const index = buildKnowledgeSearchIndex(entries);
  const results = searchKnowledgeEntries(index, 'Markdown');

  assert.deepEqual(results.map((entry) => entry.id), ['a']);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/knowledge-search.test.mjs`  
Expected: FAIL，报找不到 `knowledgeSearch.ts`

- [ ] **Step 3: 实现最小搜索模块**

在 `src/modules/knowledge/knowledgeSearch.ts` 写入：

```ts
import FlexSearch from 'flexsearch';

type SearchableKnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  summary?: string;
};

export const buildKnowledgeSearchIndex = (entries: SearchableKnowledgeEntry[]) => {
  const index = new FlexSearch.Document({
    document: {
      id: 'id',
      index: ['title', 'content', 'summary'],
      store: ['id', 'title', 'content', 'summary'],
    },
    tokenize: 'forward',
  });

  entries.forEach((entry) => index.add(entry));
  return { index, entries };
};

export const searchKnowledgeEntries = (
  state: ReturnType<typeof buildKnowledgeSearchIndex>,
  query: string
) => {
  const keyword = query.trim();
  if (!keyword) {
    return state.entries;
  }

  const ids = new Set(
    state.index.search(keyword, { enrich: true }).flatMap((group) => group.result.map((item) => item.id))
  );

  return state.entries.filter((entry) => ids.has(entry.id));
};
```

- [ ] **Step 4: 创建 KnowledgeWorkspace 薄边界**

在 `src/components/product/KnowledgeWorkspace.tsx` 写：

```tsx
type KnowledgeWorkspaceProps = {
  tabs: ReactNode;
  content: ReactNode;
  searchValue: string;
  onSearchChange: (value: string) => void;
};

export const KnowledgeWorkspace = ({
  tabs,
  content,
  searchValue,
  onSearchChange,
}: KnowledgeWorkspaceProps) => (
  <section className="pm-knowledge-workspace">
    <header className="pm-knowledge-workspace-toolbar">
      <input
        className="product-input pm-knowledge-workspace-search"
        placeholder="搜索知识库"
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
      />
    </header>
    <div className="pm-knowledge-workspace-tabs">{tabs}</div>
    <div className="pm-knowledge-workspace-content">{content}</div>
  </section>
);
```

- [ ] **Step 5: 在 ProductWorkbench 中接入 KnowledgeWorkspace 和搜索结果**

在 `ProductWorkbench.tsx`：

```tsx
import { buildKnowledgeSearchIndex, searchKnowledgeEntries } from '../../modules/knowledge/knowledgeSearch';
import { KnowledgeWorkspace } from './KnowledgeWorkspace';

const knowledgeSearchState = useMemo(
  () => buildKnowledgeSearchIndex(knowledgeEntries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    content: entry.content,
    summary: entry.summary,
  }))),
  [knowledgeEntries]
);

const searchedKnowledgeEntries = useMemo(
  () => searchKnowledgeEntries(knowledgeSearchState, knowledgeSearch),
  [knowledgeSearchState, knowledgeSearch]
);
```

- [ ] **Step 6: 运行搜索与 UI 测试**

Run: `node --test tests/knowledge-search.test.mjs tests/knowledge-workspace-ui.test.mjs tests/product-workbench.test.mjs`  
Expected: PASS，搜索模块可用；知识工作区边界断言通过；现有知识区测试不回退

- [ ] **Step 7: Commit**

```bash
git add src/components/product/KnowledgeWorkspace.tsx src/modules/knowledge/knowledgeSearch.ts src/components/product/ProductWorkbench.tsx tests/knowledge-search.test.mjs tests/knowledge-workspace-ui.test.mjs tests/product-workbench.test.mjs
git commit -m "feat: add knowledge workspace shell and local search"
```

### Task 5: 接入 Milkdown，替换知识详情编辑器

**Files:**
- Create: `src/components/product/MilkdownEditor.tsx`
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/App.css`
- Test: `tests/knowledge-workspace-ui.test.mjs`

- [ ] **Step 1: 先写失败测试，锁定编辑器替换**

在 `tests/knowledge-workspace-ui.test.mjs` 追加：

```js
const editorPath = path.resolve(__dirname, '../src/components/product/MilkdownEditor.tsx');

test('knowledge workspace uses Milkdown editor instead of textarea-only reading view', async () => {
  const editorSource = await readFile(editorPath, 'utf8');
  const productSource = await readFile(productPath, 'utf8');

  assert.match(editorSource, /@milkdown\/react/);
  assert.match(editorSource, /MilkdownProvider/);
  assert.match(editorSource, /defaultValue/);
  assert.match(editorSource, /onChange/);
  assert.match(productSource, /<MilkdownEditor/);
  assert.doesNotMatch(productSource, /requirement-markdown-preview/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/knowledge-workspace-ui.test.mjs`  
Expected: FAIL，`MilkdownEditor.tsx` 未创建

- [ ] **Step 3: 创建最小 MilkdownEditor 包装层**

在 `src/components/product/MilkdownEditor.tsx` 写入：

```tsx
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { nord } from '@milkdown/theme-nord';

type MilkdownEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
};

const MilkdownEditorInner = ({ value, onChange }: MilkdownEditorProps) => {
  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, value);
      })
      .config(nord)
      .use(commonmark)
  );

  return <Milkdown />;
};

export const MilkdownEditor = ({ value, onChange }: MilkdownEditorProps) => (
  <MilkdownProvider>
    <MilkdownEditorInner value={value} onChange={onChange} />
  </MilkdownProvider>
);
```

- [ ] **Step 4: 在 ProductWorkbench 中把知识详情区切到 MilkdownEditor**

替换原本 markdown 预览/编辑区域为：

```tsx
import { MilkdownEditor } from './MilkdownEditor';

<KnowledgeWorkspace
  tabs={knowledgeTabs}
  searchValue={knowledgeSearch}
  onSearchChange={setKnowledgeSearch}
  content={
    selectedKnowledgeEntry ? (
      <MilkdownEditor
        value={selectedKnowledgeEntry.content}
        onChange={(nextValue) => {
          void handleSaveKnowledgeContent(selectedKnowledgeEntry, nextValue);
        }}
      />
    ) : (
      <div className="pm-knowledge-empty-state">选择一个文档开始编辑</div>
    )
  }
/>
```

- [ ] **Step 5: 先做最小自动保存策略**

在 `ProductWorkbench.tsx` 保持最小实现，不引入复杂 debounce store：

```tsx
const handleSaveKnowledgeContent = useCallback(
  async (entry: KnowledgeEntry, nextContent: string) => {
    if (!entry.filePath) {
      return;
    }

    await writeRequirementFile(entry.filePath, nextContent);
    await refreshKnowledgeFilesystem();
  },
  [refreshKnowledgeFilesystem, writeRequirementFile]
);
```

- [ ] **Step 6: 添加编辑器样式**

在 `src/App.css` 添加：

```css
.pm-knowledge-workspace-content .milkdown {
  height: 100%;
  background: var(--mode-panel-alt);
  color: var(--mode-text);
}

.pm-knowledge-workspace-content .ProseMirror {
  min-height: 100%;
  padding: 24px 28px;
  outline: none;
}
```

- [ ] **Step 7: 运行测试和构建**

Run: `node --test tests/knowledge-workspace-ui.test.mjs tests/product-workbench.test.mjs`  
Expected: PASS  

Run: `npm run build`  
Expected: PASS，TypeScript 和 Vite 构建成功

- [ ] **Step 8: Commit**

```bash
git add src/components/product/MilkdownEditor.tsx src/components/product/ProductWorkbench.tsx src/App.css tests/knowledge-workspace-ui.test.mjs
git commit -m "feat: replace knowledge detail editor with milkdown"
```

### Task 6: 收口知识 tabs、AI 引用范围和当前文档边界

**Files:**
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/modules/knowledge/knowledgeEntries.ts`
- Test: `tests/product-workbench.test.mjs`

- [ ] **Step 1: 写失败测试，锁定 AI 新引用范围**

在 `tests/product-workbench.test.mjs` 追加：

```js
const chatPath = path.resolve(__dirname, '../src/components/workspace/AIChat.tsx');

test('ai chat supports opened document scope in knowledge mode', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /已打开文档/);
  assert.match(source, /referenceScopeMode === 'open-tabs'/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/product-workbench.test.mjs`  
Expected: FAIL，当前没有 `open-tabs` 范围

- [ ] **Step 3: 在 ProductWorkbench 明确暴露已打开标签上下文**

把已打开知识标签数据收口成：

```tsx
const openedKnowledgeEntries = useMemo(
  () =>
    openKnowledgeTabIds
      .map((id) => findKnowledgeEntry(knowledgeEntries, id))
      .filter((entry): entry is KnowledgeEntry => Boolean(entry)),
  [knowledgeEntries, openKnowledgeTabIds]
);
```

然后把它传给 AI 上下文层：

```tsx
<AIChat openedKnowledgeEntries={openedKnowledgeEntries} />
```

- [ ] **Step 4: 在 AIChat 中增加 `open-tabs` 选项**

在 `src/components/workspace/AIChat.tsx`：

```tsx
type ReferenceScopeMode = 'current' | 'directory' | 'all' | 'open-tabs';

{ label: '已打开文档', value: 'open-tabs' }

if (referenceScopeMode === 'open-tabs') {
  return openedKnowledgeEntries.map((entry) => ({
    id: entry.id,
    path: entry.filePath || entry.title,
    title: entry.title,
    content: entry.content,
  }));
}
```

- [ ] **Step 5: 保持当前文档和当前目录行为不变**

不要删除已有逻辑，最终行为应是：

```tsx
current -> 当前文档
directory -> 当前目录
open-tabs -> 已打开标签
all -> 全部知识
```

这样是增量扩展，不是重写引用模型。

- [ ] **Step 6: 运行 AI/知识回归测试**

Run: `node --test tests/product-workbench.test.mjs tests/desktop-workbench-ui.test.mjs`  
Expected: PASS，知识 tabs 仍稳定，AI 范围新增 `已打开文档`

- [ ] **Step 7: Commit**

```bash
git add src/components/product/ProductWorkbench.tsx src/components/workspace/AIChat.tsx src/modules/knowledge/knowledgeEntries.ts tests/product-workbench.test.mjs
git commit -m "feat: add opened document knowledge scope for ai"
```

### Task 7: 统一 monochrome workbench 视觉，不回退画布

**Files:**
- Modify: `src/App.css`
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Test: `tests/desktop-workbench-ui.test.mjs`
- Test: `tests/product-workbench.test.mjs`

- [ ] **Step 1: 写失败测试，锁定知识区和画布区进入同一视觉系统**

在 `tests/desktop-workbench-ui.test.mjs` 追加：

```js
test('knowledge and page workspaces share monochrome workbench shell classes', async () => {
  const css = await readFile(appCssPath, 'utf8');

  assert.match(css, /\.pm-knowledge-workspace\s*\{/);
  assert.match(css, /\.pm-page-workspace-shell\s*\{/);
  assert.match(css, /background:\s*var\(--mode-panel-alt\)/);
  assert.match(css, /border:\s*1px solid var\(--mode-border\)/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/desktop-workbench-ui.test.mjs`  
Expected: FAIL，新的工作区样式类还不完整

- [ ] **Step 3: 把知识区压进 monochrome token**

在 `src/App.css` 为知识区补齐：

```css
.pm-knowledge-workspace,
.pm-page-workspace-shell,
.pm-workbench-ai-pane {
  background: var(--mode-panel);
  border: 1px solid var(--mode-border);
  border-radius: var(--style-radius-md);
}

.pm-knowledge-workspace-toolbar,
.pm-knowledge-workspace-tabs {
  background: var(--mode-panel-alt);
  border-bottom: 1px solid var(--mode-border);
}
```

- [ ] **Step 4: 只做画布壳层视觉，不碰画布行为**

在 `src/components/product/ProductWorkbench.tsx` 中，只给页面工作区容器加类名，不改画布交互代码：

```tsx
<PageWorkspace pagePane={<div className="pm-page-workspace-frame">{existingPagePane}</div>} />
```

不要修改：

```tsx
Canvas
writeSketchPageFile
deleteSketchPageFile
loadSketchPageArtifactsFromProjectDir
```

- [ ] **Step 5: 把右侧 AI 区收进同一套表面语言**

在 `src/components/workspace/AIChat.css` 中确认：

```css
body.desktop-workbench-mode .chat-shell {
  background: var(--mode-panel);
  border-left: 1px solid var(--mode-border);
  border-radius: 0;
  box-shadow: none;
}
```

- [ ] **Step 6: 跑最终测试矩阵**

Run: `node --test tests/desktop-workbench-ui.test.mjs tests/product-workbench.test.mjs tests/knowledge-search.test.mjs tests/knowledge-workspace-ui.test.mjs`  
Expected: PASS  

Run: `npm run build`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/App.css src/components/product/ProductWorkbench.tsx src/components/workspace/AIChat.css tests/desktop-workbench-ui.test.mjs tests/product-workbench.test.mjs
git commit -m "style: unify workbench shell visuals"
```

### Task 8: 最终验收与文档同步

**Files:**
- Modify: `docs/superpowers/specs/2026-04-26-obsidian-workbench-shell-design.zh-CN.md`（仅当实现边界有偏差）
- Modify: `docs/superpowers/plans/2026-04-26-obsidian-workbench-shell-implementation.md`
- Test: `tests/desktop-workbench-ui.test.mjs`
- Test: `tests/product-workbench.test.mjs`
- Test: `tests/knowledge-search.test.mjs`
- Test: `tests/knowledge-workspace-ui.test.mjs`

- [ ] **Step 1: 跑完整验证**

Run: `node --test tests/desktop-workbench-ui.test.mjs tests/product-workbench.test.mjs tests/knowledge-search.test.mjs tests/knowledge-workspace-ui.test.mjs`  
Expected: PASS

Run: `npm run build`  
Expected: PASS

- [ ] **Step 2: 做人工验收清单**

手动确认以下结果：

```md
- 左中右三栏稳定成立
- 不依赖底部 panel
- 知识区可打开 Markdown 文件
- Milkdown 可编辑并保存
- tabs 可切换
- 搜索可命中标题和正文
- AI 可按当前文档 / 当前目录 / 已打开文档 / 全部知识取上下文
- 画布行为未退化
- 深浅色主题仍属于同一 monochrome 系统
```

- [ ] **Step 3: 仅在实现与 spec 偏离时更新文档**

如果实现中做了必要收缩，例如 `Milkdown` 第一版只先接保存不接复杂快捷键，就把差异写回：

```md
## 实现注记

- 第一版采用最小自动保存
- 第一版不提供源码模式切换
- 第一版搜索索引基于当前项目内存快照重建
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-26-obsidian-workbench-shell-design.zh-CN.md docs/superpowers/plans/2026-04-26-obsidian-workbench-shell-implementation.md
git commit -m "docs: finalize workbench implementation plan"
```
