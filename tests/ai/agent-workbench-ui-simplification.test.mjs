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

  assert.match(source, /label:\s*'新对话'/);
  assert.match(source, /label:\s*'搜索'/);
  assert.match(source, /label:\s*'技能'/);
  assert.doesNotMatch(source, /label:\s*'插件'/);
  assert.doesNotMatch(source, /label:\s*'自动化'/);
  assert.doesNotMatch(source, /label:\s*'设置'/);
  assert.doesNotMatch(source, /agent-sidebar-hero-card/);
  assert.doesNotMatch(source, /agent-sidebar-actions-grid/);
  assert.match(source, /对话历史/);
  assert.doesNotMatch(source, /最近对话/);
});

test('agent workbench page opens search and skills in dialogs instead of sidebar pages', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /MacDialog/);
  assert.match(source, /isSearchDialogOpen/);
  assert.match(source, /isSkillsDialogOpen/);
  assert.doesNotMatch(source, /sidebarMode/);
});

test('agent workbench inspector keeps review focused on changed documents and content', async () => {
  const source = await readFile(inspectorPath, 'utf8');

  assert.match(source, /'review', 'memory'/);
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
  assert.doesNotMatch(source, /label:\s*'文件'/);
  assert.doesNotMatch(source, /'tools'/);
  assert.doesNotMatch(source, /'context'/);
  assert.doesNotMatch(source, /GNAgentPlanPanel/);
  assert.doesNotMatch(source, /GNAgentTimelinePanel/);
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
  assert.match(source, /审查和记忆面板/);
  assert.doesNotMatch(source, /审查、文件和记忆面板/);
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
