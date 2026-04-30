import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillBridgePath = path.resolve(__dirname, '../../src/modules/ai/platform-bridges/SkillBridge.ts');
const contextBridgePath = path.resolve(__dirname, '../../src/modules/ai/platform-bridges/ContextBridge.ts');
test('platform bridges define provider-independent skill and context injection points', async () => {
  const skillSource = await readFile(skillBridgePath, 'utf8');
  const contextSource = await readFile(contextBridgePath, 'utf8');
  assert.match(skillSource, /SkillBridge/);
  assert.match(skillSource, /executeSkill/);
  assert.match(contextSource, /ContextBridge/);
  assert.match(contextSource, /buildPromptContext/);
});
