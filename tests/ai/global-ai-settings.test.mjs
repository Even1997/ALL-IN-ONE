import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');
const workspaceCssPath = path.resolve(__dirname, '../../src/components/ai/AIWorkspace.css');
const storePath = path.resolve(__dirname, '../../src/modules/ai/store/globalAIStore.ts');
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const settingsTabPath = path.resolve(__dirname, '../../src/components/workspace/AIChatAISettingsTab.tsx');
const settingsHookPath = path.resolve(__dirname, '../../src/components/workspace/useAIChatSettingsState.ts');

test('global ai settings store persists config lists and selected config state', async () => {
  const source = await readFile(storePath, 'utf8');

  assert.match(source, /persist\s*\(/);
  assert.match(source, /name:\s*'goodnight-ai-store'/);
  assert.match(source, /storage:\s*createJSONStorage\(\(\) => localStorage\)/);
  assert.match(source, /aiConfigs:\s*buildDefaultAIConfigEntries\(\)/);
  assert.match(source, /mergePresetAIConfigEntries\(/);
  assert.match(source, /selectedConfigId:\s*string \| null/);
  assert.match(source, /addConfig:\s*\(seed\)/);
  assert.match(source, /setConfigEnabled:\s*\(configId, enabled\)/);
  assert.match(source, /selectConfig:\s*\(configId\)/);
  assert.match(source, /resolveSelectedAIConfigId/);
  assert.match(source, /contextWindowTokens/);
});

test('ai config state builds disabled entries from provider presets', async () => {
  const source = await readFile(path.resolve(__dirname, '../../src/modules/ai/store/aiConfigState.ts'), 'utf8');

  assert.match(source, /buildPresetAIConfigEntry/);
  assert.match(source, /id:\s*`preset-\$\{preset\.id\}`/);
  assert.match(source, /name:\s*preset\.label/);
  assert.match(source, /baseURL:\s*preset\.baseURL/);
  assert.match(source, /model:\s*preset\.models\[0\] \|\| ''/);
  assert.match(source, /enabled:\s*false/);
});

test('ai config state persists one active model plus saved model candidates per config', async () => {
  const source = await readFile(path.resolve(__dirname, '../../src/modules/ai/store/aiConfigState.ts'), 'utf8');

  assert.match(source, /savedModels:\s*string\[\]/);
  assert.match(source, /const savedModels = normalizeSavedModels/);
  assert.match(source, /model:\s*resolveActiveModel/);
});

test('ai chat keeps context usage meta and adds quick model switching near the composer', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.doesNotMatch(source, /className="chat-ai-select"/);
  assert.match(source, /className="chat-composer-meta"/);
  assert.match(source, /AIChatComposerModelSwitcher/);
  assert.match(source, /selectedRuntimeConfig \? selectedRuntimeConfig\.name : '\\u672a\\u542f\\u7528 AI'/);
  assert.match(source, /handleToggleEnabled/);
});

test('ai settings modal exposes editable saved model rows and an active model selector', async () => {
  const [chatSource, settingsTabSource, settingsHookSource] = await Promise.all([
    readFile(chatPath, 'utf8'),
    readFile(settingsTabPath, 'utf8'),
    readFile(settingsHookPath, 'utf8'),
  ]);

  assert.equal((settingsTabSource.match(/onClick=\{handleApplySettings\}/g) || []).length, 1);
  assert.match(chatSource, /createPortal/);
  assert.match(chatSource, /document\.body/);
  assert.match(chatSource, /chat-settings-modal-backdrop/);
  assert.match(
    chatSource,
    /<div className="chat-settings-modal-backdrop" onClick=\{closeSettings\}>\s*<section\s+className="chat-settings-drawer open"[\s\S]*?onClick=\{\(event\) => event\.stopPropagation\(\)\}/
  );
  assert.match(chatSource, /role="dialog"/);
  assert.match(settingsTabSource, /savedModels/);
  assert.match(settingsTabSource, /handleAddSavedModel/);
  assert.match(settingsTabSource, /handleRemoveSavedModel/);
  assert.match(settingsTabSource, /handleSelectActiveModel/);
  assert.match(settingsHookSource, /savedModels:\s*normalizedSavedModels/);
  assert.match(chatSource, /contextWindowTokens:\s*config\?\.contextWindowTokens\s*\|\|\s*258000/);
  assert.match(settingsTabSource, /value=\{Math\.round\(settingsDraft\.contextWindowTokens \/ 1000\)\}/);
  assert.match(settingsTabSource, /contextWindowTokens:\s*Math\.max\(1000,\s*Number\.isFinite\(nextValue\)\s*\?\s*nextValue\s*:\s*258000\)/);
});

test('ai chat exposes direct new-session entry and context budget indicator near the composer', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /onClick=\{handleCreateSession\}/);
  assert.match(source, /chat-composer-meta/);
  assert.match(source, /currentContextUsage\.usedLabel/);
  assert.match(source, /currentContextUsage\.limitLabel/);
});

test('ai settings modal CSS keeps dialog centered and close button above content', async () => {
  const css = await readFile(cssPath, 'utf8');
  const workspaceCss = await readFile(workspaceCssPath, 'utf8');

  assert.match(workspaceCss, /\.floating-ai-workspace\s*\{[^}]*z-index:\s*1000;/s);
  assert.match(css, /\.chat-settings-modal-backdrop\s*\{[^}]*place-items:\s*center;/s);
  assert.match(css, /\.chat-settings-drawer\s*\{[^}]*position:\s*relative;/s);
  assert.match(css, /\.chat-settings-drawer\s*\{[^}]*z-index:\s*1002;/s);
  assert.match(css, /width:\s*min\(920px, calc\(100vw - 48px\)\);/);
  assert.match(css, /max-height:\s*min\(820px, calc\(100dvh - 48px\)\);/);
  assert.match(css, /\.chat-settings-close\s*\{[^}]*position:\s*relative;/s);
  assert.match(css, /\.chat-settings-close\s*\{[^}]*z-index:\s*2;/s);
  assert.match(css, /\.chat-settings-close\s*\{[^}]*flex-shrink:\s*0;/s);
  assert.match(css, /\.chat-composer-meta\s*\{/);
});
