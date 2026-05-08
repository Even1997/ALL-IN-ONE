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

test('agent workbench sidebar removes redundant first-level destinations and keeps recent conversations as the body', async () => {
  const source = await readFile(sidebarPath, 'utf8');

  assert.match(source, /label:\s*'新对话'/);
  assert.match(source, /label:\s*'搜索'/);
  assert.match(source, /label:\s*'技能'/);
  assert.doesNotMatch(source, /label:\s*'插件'/);
  assert.doesNotMatch(source, /label:\s*'自动化'/);
  assert.doesNotMatch(source, /label:\s*'设置'/);
  assert.doesNotMatch(source, /agent-sidebar-hero-card/);
  assert.doesNotMatch(source, /agent-sidebar-actions-grid/);
  assert.match(source, /最近对话/);
});

test('agent workbench page opens search and skills in dialogs instead of sidebar pages', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /MacDialog/);
  assert.match(source, /isSearchDialogOpen/);
  assert.match(source, /isSkillsDialogOpen/);
  assert.doesNotMatch(source, /sidebarMode/);
});

test('agent workbench inspector only keeps review, files, and memory tabs', async () => {
  const source = await readFile(inspectorPath, 'utf8');

  assert.match(source, /'review', 'files', 'memory'/);
  assert.doesNotMatch(source, /'tools'/);
  assert.doesNotMatch(source, /'context'/);
});

test('agent workbench stage removes redundant connection-state pill and keeps only core status signals', async () => {
  const source = await readFile(stagePath, 'utf8');

  assert.doesNotMatch(source, /connectionState/);
  assert.match(source, /pendingApprovalCount/);
});

test('agent workbench rail styles shrink the navigation footprint', async () => {
  const css = await readFile(cssPath, 'utf8');

  assert.match(css, /grid-template-columns:\s*72px 300px;/);
  assert.match(css, /width:\s*34px;\s*[\s\S]*height:\s*34px;/);
  assert.match(css, /width:\s*16px;\s*[\s\S]*height:\s*16px;/);
});
