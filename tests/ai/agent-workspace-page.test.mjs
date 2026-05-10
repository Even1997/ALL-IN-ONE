import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pagePath = path.resolve(__dirname, '../../src/features/agent-shell/pages/AgentShellPage.tsx');
const sidebarPath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentWorkbenchSidebar.tsx');
const stagePath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentChatStage.tsx');
const legacyConfigPagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentConfigPage.tsx');

test('agent workspace keeps search entry points but removes the skills management surface', async () => {
  const pageSource = await readFile(pagePath, 'utf8');
  const sidebarSource = await readFile(sidebarPath, 'utf8');

  assert.match(pageSource, /AgentWorkbenchSidebar/);
  assert.match(pageSource, /AgentChatStage/);
  assert.match(pageSource, /onOpenSearch/);
  assert.doesNotMatch(pageSource, /AgentWorkbenchInspector/);
  assert.doesNotMatch(pageSource, /GNAgentSkillsPage/);
  assert.doesNotMatch(pageSource, /isSkillsDialogOpen/);
  assert.doesNotMatch(pageSource, /title="技能"/);

  assert.match(sidebarSource, /id:\s*'newThread'/);
  assert.match(sidebarSource, /id:\s*'search'/);
  assert.doesNotMatch(sidebarSource, /id:\s*'skills'/);
  assert.doesNotMatch(sidebarSource, /onOpenSkills/);
  assert.doesNotMatch(sidebarSource, /label:\s*'技能'/);
});

test('agent workspace no longer keeps the unused legacy config page around', async () => {
  await assert.rejects(() => access(legacyConfigPagePath));
});

test('agent workspace adds a richer empty state without reviving the right-side inspector surface', async () => {
  const stageSource = await readFile(stagePath, 'utf8');

  assert.match(stageSource, /agent-chat-stage-empty/);
  assert.match(stageSource, /打开一个新对话/);
  assert.match(stageSource, /配置模型/);
  assert.match(stageSource, /继续执行/);
  assert.doesNotMatch(stageSource, /agent-chat-stage-toggle/);
  assert.doesNotMatch(stageSource, /onToggleInspector/);
});
