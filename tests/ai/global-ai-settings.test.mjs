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
const appPath = path.resolve(__dirname, '../../src/App.tsx');
const globalSettingsPagePath = path.resolve(__dirname, '../../src/components/workspace/GlobalSettingsPage.tsx');
const embeddedPiecesPath = path.resolve(__dirname, '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx');
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
  assert.match(source, /className="chat-composer-runtime-strip"/);
  assert.match(source, /AIChatComposerModelSwitcher/);
  assert.match(source, /new CustomEvent\(AI_CHAT_SETTINGS_EVENT/);
});

test('global settings page owns editable saved model rows with an inline back action', async () => {
  const [appSource, chatSource, pageSource, settingsTabSource, settingsHookSource] = await Promise.all([
    readFile(appPath, 'utf8'),
    readFile(chatPath, 'utf8'),
    readFile(globalSettingsPagePath, 'utf8'),
    readFile(settingsTabPath, 'utf8'),
    readFile(settingsHookPath, 'utf8'),
  ]);

  assert.equal((settingsTabSource.match(/onClick=\{handleApplySettings\}/g) || []).length, 1);
  assert.match(appSource, /GlobalSettingsPage/);
  assert.match(pageSource, /className="chat-settings-back"/);
  assert.match(pageSource, /aria-label="退出设置"/);
  assert.match(pageSource, />\s*←\s*<\/button>/);
  assert.match(pageSource, /<LazyAIChatAISettingsTab/);
  assert.match(chatSource, /dispatchEvent\([\s\S]*?new CustomEvent\(AI_CHAT_SETTINGS_EVENT/);
  assert.doesNotMatch(chatSource, /chat-settings-drawer-embedded/);
  assert.doesNotMatch(chatSource, /chat-settings-modal-backdrop/);
  assert.doesNotMatch(chatSource, /chat-settings-close/);
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
  assert.match(source, /chat-composer-runtime-strip/);
  assert.match(source, /currentContextUsage\.usedLabel/);
  assert.match(source, /currentContextUsage\.limitLabel/);
});

test('composer runtime meta only keeps context usage and removes duplicated runtime labels', async () => {
  const [chatSource, embeddedSource] = await Promise.all([
    readFile(chatPath, 'utf8'),
    readFile(embeddedPiecesPath, 'utf8'),
  ]);

  assert.match(chatSource, /chat-composer-runtime-strip/);
  assert.match(chatSource, /currentContextUsage\.usedLabel/);
  assert.match(chatSource, /currentContextUsage\.limitLabel/);
  assert.doesNotMatch(
    chatSource,
    /selectedRuntimeConfig \? selectedRuntimeConfig\.name : '\\u672a\\u542f\\u7528 AI'/
  );

  assert.match(embeddedSource, /chat-composer-runtime-strip/);
  assert.match(embeddedSource, /contextUsageLabel/);
  assert.doesNotMatch(embeddedSource, /agentStatusLabel/);
  assert.doesNotMatch(embeddedSource, /selectedRuntimeLabel/);
  assert.doesNotMatch(embeddedSource, /runStateLabel/);
  assert.doesNotMatch(embeddedSource, /chat-composer-embedded-toolbar-stack/);
});

test('global settings page CSS fills the main stage and styles the inline back button', async () => {
  const css = await readFile(cssPath, 'utf8');
  const workspaceCss = await readFile(workspaceCssPath, 'utf8');

  assert.match(workspaceCss, /\.floating-ai-workspace\s*\{[^}]*z-index:\s*1000;/s);
  assert.match(css, /\.global-settings-page\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s);
  assert.match(css, /\.global-settings-page-body\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0;/s);
  assert.match(css, /\.chat-settings-back\s*\{[^}]*min-height:\s*32px;/s);
  assert.match(css, /\.chat-settings-back\s*\{[^}]*min-width:\s*32px;[^}]*padding:\s*0;[^}]*border-radius:\s*8px;/s);
  assert.match(css, /\.global-settings-page\s+\.chat-settings-note-surface\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
  assert.doesNotMatch(css, /\.chat-settings-modal-backdrop\s*\{/);
  assert.doesNotMatch(css, /\.chat-settings-close\s*\{/);
  assert.doesNotMatch(css, /ai-chat-settings-overlay-open/);
  assert.match(css, /\.chat-composer-runtime-strip\s*\{/);
  assert.match(css, /\.chat-composer-footer-start\s*\{/);
});
