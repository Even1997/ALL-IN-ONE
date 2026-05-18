import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sidebarPath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentWorkbenchSidebar.tsx');
const pagePath = path.resolve(__dirname, '../../src/features/agent-shell/pages/AgentShellPage.tsx');
const stagePath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentChatStage.tsx');
const utilitySidebarPath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentUtilitySidebar.tsx');
const cssPath = path.resolve(__dirname, '../../src/features/agent-shell/components/agentWorkbench.css');

test('agent workbench sidebar removes redundant first-level destinations and keeps conversation history as the body', async () => {
  const source = await readFile(sidebarPath, 'utf8');
  const pageSource = await readFile(pagePath, 'utf8');

  assert.match(source, /onNewThread/);
  assert.match(source, /onOpenSearch/);
  assert.doesNotMatch(source, /agent-sidebar-hero-card/);
  assert.doesNotMatch(source, /agent-sidebar-actions-grid/);
  assert.match(pageSource, /sessions=\{session\.sessions\}/);
  assert.match(pageSource, /onDeleteSession=\{session\.statusActions\.deleteSession\}/);
});

test('agent workbench page opens search in a dialog instead of reviving sidebar mode routing', async () => {
  const source = await readFile(pagePath, 'utf8');

  assert.match(source, /MacDialog/);
  assert.match(source, /isSearchDialogOpen/);
  assert.doesNotMatch(source, /sidebarMode/);
  assert.doesNotMatch(source, /AgentWorkbenchInspector/);
});

test('agent workbench stage removes the right-side inspector toggle so runtime events stay in the chat stream', async () => {
  const source = await readFile(stagePath, 'utf8');

  assert.doesNotMatch(source, /connectionState/);
  assert.doesNotMatch(source, /pendingApprovalCount/);
  assert.doesNotMatch(source, /agent-chat-stage-toggle/);
  assert.doesNotMatch(source, /onToggleInspector/);
  assert.doesNotMatch(source, /inspectorOpen/);
  assert.doesNotMatch(source, /providerId/);
});

test('utility sidebar now owns review context instead of a detached floating plan card', async () => {
  const source = await readFile(utilitySidebarPath, 'utf8');

  assert.match(source, /latestTurn\?\.plan/);
  assert.match(source, /pendingApprovalCount/);
  assert.match(source, /affectedPaths/);
  assert.doesNotMatch(source, /onOpenInspector/);
  assert.doesNotMatch(source, /agent-floating-plan-action/);
});

test('agent workbench rail styles keep the simplified shell without inspector-specific controls', async () => {
  const css = await readFile(cssPath, 'utf8');

  assert.match(css, /\.agent-workbench-review-diff/);
  assert.match(css, /\.agent-workbench-review-diff \.diff-added/);
  assert.match(css, /\.agent-workbench-review-diff \.diff-removed/);
  assert.doesNotMatch(css, /\.agent-workbench-inspector/);
  assert.doesNotMatch(css, /\.agent-chat-stage-toggle/);
});
