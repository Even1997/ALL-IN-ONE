import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const globalSettingsPagePath = path.resolve(__dirname, '../../src/components/workspace/GlobalSettingsPage.tsx');
const aiSettingsTabPath = path.resolve(__dirname, '../../src/components/workspace/AIChatAISettingsTab.tsx');

test('global settings page lazy-loads the heavy AI settings tab instead of inlining it in App or AIChat', async () => {
  const [pageSource, tabSource] = await Promise.all([
    readFile(globalSettingsPagePath, 'utf8'),
    readFile(aiSettingsTabPath, 'utf8'),
  ]);

  assert.match(pageSource, /const LazyAIChatAISettingsTab = lazy\(async \(\) =>/);
  assert.match(pageSource, /import\('\.\/AIChatAISettingsTab'\)/);
  assert.match(pageSource, /<LazyAIChatAISettingsTab/);
  assert.doesNotMatch(pageSource, /import\('\.\.\/\.\.\/modules\/ai\/core\/AIService'\)/);
  assert.doesNotMatch(pageSource, /className="chat-settings-ai-layout"/);

  assert.match(tabSource, /export const AIChatAISettingsTab/);
  assert.match(tabSource, /chat-settings-ai-layout/);
  assert.match(tabSource, /chat-settings-provider-list/);
  assert.match(tabSource, /chat-settings-ai-stage/);
  assert.doesNotMatch(tabSource, /chat-settings-ai-companion/);
  assert.doesNotMatch(tabSource, /Current config/);
  assert.doesNotMatch(tabSource, /Custom Headers/);
  assert.doesNotMatch(tabSource, /Import AI Config JSON/);
  assert.doesNotMatch(tabSource, /View Docs/);
  assert.doesNotMatch(tabSource, /Provider details/);
  assert.doesNotMatch(tabSource, /Quick reminder/);
  assert.doesNotMatch(tabSource, /chat-settings-summary-card/);
});
