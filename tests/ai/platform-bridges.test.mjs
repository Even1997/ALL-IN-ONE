import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillBridgePath = path.resolve(__dirname, '../../src/modules/ai/platform-bridges/SkillBridge.ts');
const contextBridgePath = path.resolve(__dirname, '../../src/modules/ai/platform-bridges/ContextBridge.ts');
const claudeWorkspacePath = path.resolve(__dirname, '../../src/components/ai/workspaces/ClaudeWorkspace.tsx');
const codexWorkspacePath = path.resolve(__dirname, '../../src/components/ai/workspaces/CodexWorkspace.tsx');

test('platform bridges define provider-independent skill and context injection points', async () => {
  const skillSource = await readFile(skillBridgePath, 'utf8');
  const contextSource = await readFile(contextBridgePath, 'utf8');
  assert.match(skillSource, /SkillBridge/);
  assert.match(skillSource, /executeSkill/);
  assert.match(contextSource, /ContextBridge/);
  assert.match(contextSource, /buildPromptContext/);
});

test('provider workspaces expose a platform capability strip instead of embedding skills directly in the runtime core', async () => {
  const claudeSource = await readFile(claudeWorkspacePath, 'utf8');
  const codexSource = await readFile(codexWorkspacePath, 'utf8');
  assert.match(claudeSource, /PlatformCapabilityStrip/);
  assert.match(codexSource, /PlatformCapabilityStrip/);
});
