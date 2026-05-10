import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sidebarPath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentWorkbenchSidebar.tsx');
const pagePath = path.resolve(__dirname, '../../src/features/agent-shell/pages/AgentShellPage.tsx');
const stagePath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentChatStage.tsx');
const floatingPlanPath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentFloatingPlanCard.tsx');
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
  assert.doesNotMatch(source, /AgentWorkbenchInspector/);
});

test('agent workbench stage removes the right-side inspector toggle so runtime events stay in the chat stream', async () => {
  const source = await readFile(stagePath, 'utf8');

  assert.doesNotMatch(source, /connectionState/);
  assert.doesNotMatch(source, /pendingApprovalCount/);
  assert.doesNotMatch(source, /agent-chat-stage-toggle/);
  assert.doesNotMatch(source, /onToggleInspector/);
  assert.doesNotMatch(source, /inspectorOpen/);
});

test('floating plan card no longer routes users back to a detached inspector panel', async () => {
  const source = await readFile(floatingPlanPath, 'utf8');

  assert.doesNotMatch(source, /onOpenInspector/);
  assert.doesNotMatch(source, /agent-floating-plan-action/);
  assert.doesNotMatch(source, /查看完整详情/);
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

test('agent workbench rail styles shrink the navigation footprint without keeping inspector-specific controls alive', async () => {
  const css = await readFile(cssPath, 'utf8');

  assert.match(css, /grid-template-columns:\s*72px 300px;/);
  assert.match(css, /width:\s*34px;\s*[\s\S]*height:\s*34px;/);
  assert.match(css, /width:\s*16px;\s*[\s\S]*height:\s*16px;/);
  assert.match(css, /\.agent-workbench-review-diff/);
  assert.match(css, /\.agent-workbench-review-diff \.diff-added/);
  assert.match(css, /\.agent-workbench-review-diff \.diff-removed/);
  assert.doesNotMatch(css, /\.agent-workbench-inspector/);
  assert.doesNotMatch(css, /\.agent-chat-stage-toggle/);
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
