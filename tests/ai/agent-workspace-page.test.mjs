import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pagePath = path.resolve(__dirname, '../../src/features/agent-shell/pages/AgentShellPage.tsx');
const sidebarPath = path.resolve(__dirname, '../../src/features/agent-shell/components/AgentWorkbenchSidebar.tsx');

test('agent workspace keeps search entry points but removes the skills management surface', async () => {
  const pageSource = await readFile(pagePath, 'utf8');
  const sidebarSource = await readFile(sidebarPath, 'utf8');

  assert.match(pageSource, /AgentWorkbenchSidebar/);
  assert.match(pageSource, /AgentChatStage/);
  assert.match(pageSource, /AgentWorkbenchInspector/);
  assert.match(pageSource, /onOpenSearch/);
  assert.doesNotMatch(pageSource, /GNAgentSkillsPage/);
  assert.doesNotMatch(pageSource, /isSkillsDialogOpen/);
  assert.doesNotMatch(pageSource, /title="技能"/);

  assert.match(sidebarSource, /id:\s*'newThread'/);
  assert.match(sidebarSource, /id:\s*'search'/);
  assert.doesNotMatch(sidebarSource, /id:\s*'skills'/);
  assert.doesNotMatch(sidebarSource, /onOpenSkills/);
  assert.doesNotMatch(sidebarSource, /label:\s*'技能'/);
});
