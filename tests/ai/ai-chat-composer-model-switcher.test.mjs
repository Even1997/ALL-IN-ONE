import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const switcherPath = path.resolve(__dirname, '../../src/components/workspace/AIChatComposerModelSwitcher.tsx');
const switcherStatePath = path.resolve(__dirname, '../../src/components/workspace/useAIChatComposerModelSwitcherState.ts');

test('AI chat composer renders a dedicated runtime model switcher trigger and menu', async () => {
  const [source, switcherSource, switcherStateSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(switcherPath, 'utf8'),
    readFile(switcherStatePath, 'utf8'),
  ]);

  assert.match(source, /AIChatComposerModelSwitcher/);
  assert.match(source, /useAIChatComposerModelSwitcherState/);
  assert.match(source, /className="chat-composer-footer-start"/);
  assert.match(switcherSource, /chat-model-switcher-trigger/);
  assert.match(switcherSource, /chat-model-switcher-trigger-brand/);
  assert.match(switcherSource, /chat-model-switcher-menu/);
  assert.match(switcherSource, /chat-model-switcher-provider-rail/);
  assert.match(switcherSource, /chat-model-switcher-model-panel/);
  assert.match(switcherStateSource, /enabledRuntimeConfigs/);
});

test('the composer switcher supports both config selection and model selection in default chat', async () => {
  const source = await readFile(switcherStatePath, 'utf8');

  assert.match(source, /handleSelectRuntimeConfig/);
  assert.match(source, /handleSelectRuntimeModel/);
  assert.match(source, /enabledRuntimeConfigs/);
  assert.match(source, /runtimeModelOptions/);
  assert.match(source, /savedModels/);
});

test('the composer switcher exposes provider nav cards and model detail metadata', async () => {
  const switcherSource = await readFile(switcherPath, 'utf8');

  assert.match(switcherSource, /Switch model \(\$\{activeModelLabel\}\)/);
  assert.match(switcherSource, /chat-model-switcher-provider-avatar/);
  assert.match(switcherSource, /chat-model-switcher-trigger-brand/);
  assert.match(switcherSource, /chat-model-switcher-provider-icon/);
  assert.match(switcherSource, /chat-model-switcher-model-meta/);
  assert.doesNotMatch(switcherSource, /chat-model-switcher-model-panel-header/);
  assert.doesNotMatch(switcherSource, /chat-model-switcher-provider-mark/);
  assert.doesNotMatch(switcherSource, /chat-model-switcher-provider-meta/);
  assert.doesNotMatch(switcherSource, /style=\{buildProviderToneStyle\(config\.provider\)\}/);
  assert.doesNotMatch(switcherSource, />AGENT</);
  assert.doesNotMatch(switcherSource, />MODEL</);
  assert.doesNotMatch(switcherSource, /Current selection/);
  assert.doesNotMatch(switcherSource, /Saved in settings/);
});
