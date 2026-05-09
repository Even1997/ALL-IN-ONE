import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sidebarPath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentWorkbenchSidebar.tsx');
const inspectorPath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentWorkbenchInspector.tsx');
const pagePath = path.resolve(__dirname, '../../src/features/agent-shell/pages/AgentShellPage.tsx');
const stagePath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentChatStage.tsx');
const cssPath = path.resolve(__dirname, '../../src/features/agent-shell/components/agentWorkbench.css');

test('agent workbench sidebar removes redundant first-level destinations and keeps conversation history as the body', async () => {
  const source = await readFile(sidebarPath, 'utf8');
  const pageSource = await readFile(pagePath, 'utf8');

  assert.match(source, /label:\s*'新对话'/);
  assert.match(source, /label:\s*'搜索'/);
  assert.doesNotMatch(source, /label:\s*'插件'/);
  assert.doesNotMatch(source, /label:\s*'自动化'/);
  assert.doesNotMatch(source, /label:\s*'设置'/);
  assert.doesNotMatch(source, /agent-sidebar-hero-card/);
  assert.doesNotMatch(source, /agent-sidebar-actions-grid/);
  assert.match(source, /对话历史/);
  assert.doesNotMatch(source, /最近对话/);
  assert.match(pageSource, /sessions=\{session\.sessions\}/);
  assert.match(pageSource, /onDeleteSession=\{session\.statusActions\.deleteSession\}/);
});

test('agent workbench page opens search in a dialog instead of reviving sidebar mode routing', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /MacDialog/);
  assert.match(source, /isSearchDialogOpen/);
  assert.doesNotMatch(source, /sidebarMode/);
  assert.doesNotMatch(source, /isSkillsDialogOpen/);
});

test('agent workbench inspector keeps review focused on changed documents while exposing runtime tabs', async () => {
  const source = await readFile(inspectorPath, 'utf8');

  assert.match(source, /type AgentInspectorTab = 'review' \| 'tool' \| 'timeline' \| 'approval' \| 'memory'/);
  assert.doesNotMatch(source, /'files'/);
  assert.match(source, /查看本轮文档改动与内容/);
  assert.match(source, /变更内容/);
  assert.match(source, /buildReviewDiff/);
  assert.match(source, /agent-workbench-review-diff/);
  assert.match(source, /diff-removed/);
  assert.match(source, /diff-added/);
  assert.match(source, /diff-context/);
  assert.doesNotMatch(source, /变更前/);
  assert.doesNotMatch(source, /变更后/);
  assert.doesNotMatch(source, /agent-workbench-review-section is-removed/);
  assert.doesNotMatch(source, /agent-workbench-review-section is-added/);
  assert.match(source, /label:\s*'工具'/);
  assert.match(source, /label:\s*'时间线'/);
  assert.match(source, /label:\s*'审批'/);
  assert.doesNotMatch(source, /label:\s*'文件'/);
  assert.doesNotMatch(source, /'context'/);
});

test('agent workbench inspector keeps memory tab minimal and removes inbox placeholder', async () => {
  const source = await readFile(inspectorPath, 'utf8');

  assert.match(source, /GNAgentMemoryPanel/);
  assert.doesNotMatch(source, /记忆收件箱/);
  assert.doesNotMatch(source, /待保存记忆/);
  assert.doesNotMatch(source, /pendingMemoryCount/);
});

test('agent workbench stage removes redundant connection-state pill and keeps only core status signals', async () => {
  const source = await readFile(stagePath, 'utf8');

  assert.doesNotMatch(source, /connectionState/);
  assert.match(source, /pendingApprovalCount/);
  assert.match(source, /收起右侧面板/);
  assert.match(source, /展开右侧面板/);
  assert.doesNotMatch(source, /审查、文件和记忆面板/);
});

test('agent workbench conversation history uses session entries with direct actions and readable Chinese labels', async () => {
  const listPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentThreadList.tsx');
  const source = await readFile(listPath, 'utf8');
  const chatSource = await readFile(path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx'), 'utf8');
  const embeddedSource = await readFile(
    path.resolve(__dirname, '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx'),
    'utf8',
  );

  assert.match(source, /ChatSession/);
  assert.match(source, /空会话/);
  assert.match(source, /right\.createdAt - left\.createdAt/);
  assert.match(source, /formatThreadTime\(session\.createdAt\)/);
  assert.match(source, /placeholder="搜索对话历史"/);
  assert.match(source, /aria-label="搜索对话历史"/);
  assert.match(source, /session\.title\.toLowerCase\(\)\.includes\(normalizedQuery\)/);
  assert.match(source, /preview\.toLowerCase\(\)\.includes\(normalizedQuery\)/);
  assert.match(source, /没有匹配的对话/);
  assert.match(source, /className="gn-agent-thread-title"/);
  assert.match(source, /className="gn-agent-thread-preview"/);
  assert.match(source, /gn-agent-runtime-card-delete/);
  assert.match(source, /删除/);
  assert.doesNotMatch(source, /查看/);
  assert.doesNotMatch(source, /继续回复/);
  assert.match(chatSource, /title="历史会话"/);
  assert.match(chatSource, /title="新对话"/);
  assert.match(chatSource, /title="设置"/);
  assert.doesNotMatch(chatSource, /title="\\u5386\\u53f2\\u4f1a\\u8bdd"/);
  assert.doesNotMatch(chatSource, /title="\\u65b0\\u5bf9\\u8bdd"/);
  assert.doesNotMatch(chatSource, /title="\\u8bbe\\u7f6e"/);
  assert.match(embeddedSource, /新建对话/);
  assert.match(embeddedSource, /删除对话/);
  assert.doesNotMatch(embeddedSource, /\\u65b0\\u5efa\\u5bf9\\u8bdd/);
});

test('agent workbench rail styles shrink the navigation footprint', async () => {
  const css = await readFile(cssPath, 'utf8');

  assert.match(css, /grid-template-columns:\s*72px 300px;/);
  assert.match(css, /width:\s*34px;\s*[\s\S]*height:\s*34px;/);
  assert.match(css, /width:\s*16px;\s*[\s\S]*height:\s*16px;/);
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(css, /\.agent-workbench-review-diff/);
  assert.match(css, /\.agent-workbench-review-diff \.diff-added/);
  assert.match(css, /\.agent-workbench-review-diff \.diff-removed/);
});

test('agent workbench thread cards keep history entries at a fixed height with single-line previews', async () => {
  const css = await readFile(cssPath, 'utf8');

  assert.match(
    css,
    /\.agent-sidebar-panel-body-threads \.gn-agent-runtime-card\s*\{[\s\S]*height:\s*88px;[\s\S]*overflow:\s*hidden;/
  );
  assert.match(
    css,
    /\.agent-sidebar-panel-body-threads \.gn-agent-thread-preview\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/
  );
});
