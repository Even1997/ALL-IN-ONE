import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const claudeRuntimePath = path.resolve(__dirname, '../../src/modules/ai/claudian/runtime/claude/ClaudeRuntime.ts');
const codexRuntimePath = path.resolve(__dirname, '../../src/modules/ai/claudian/runtime/codex/CodexRuntime.ts');
const runtimeSummaryPath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianRuntimeSummary.tsx');
const runtimeBindingPath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianRuntimeBinding.tsx');
const chatPagePath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianChatPage.tsx');
const configPagePath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianConfigPage.tsx');
const shellPath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianShell.tsx');

test('claude runtime resolves a runtime status from selected config and local snapshot', async () => {
  const source = await readFile(claudeRuntimePath, 'utf8');
  assert.match(source, /getStatus/);
  assert.match(source, /getMatchingConfigs/);
  assert.match(source, /resolvePreferredConfig/);
  assert.match(source, /selectedConfig/);
  assert.match(source, /localSnapshot/);
  assert.match(source, /source: 'app-config'/);
});

test('claude runtime keeps local-only status visible without claiming ready', async () => {
  const source = await readFile(claudeRuntimePath, 'utf8');
  assert.match(source, /if \(hasClaudeSettings\) \{[\s\S]*ready: false[\s\S]*source: 'local-config'/);
});

test('codex runtime resolves a runtime status from selected config and local snapshot', async () => {
  const source = await readFile(codexRuntimePath, 'utf8');
  assert.match(source, /getStatus/);
  assert.match(source, /getMatchingConfigs/);
  assert.match(source, /resolvePreferredConfig/);
  assert.match(source, /selectedConfig/);
  assert.match(source, /localSnapshot/);
  assert.match(source, /source: 'app-config'/);
});

test('codex runtime keeps local-only status visible without claiming ready', async () => {
  const source = await readFile(codexRuntimePath, 'utf8');
  assert.match(source, /if \(hasCodexHome\) \{[\s\S]*ready: false[\s\S]*source: 'local-config'/);
});

test('runtime summary renders runtime status inside claudian chat pages', async () => {
  const source = await readFile(runtimeSummaryPath, 'utf8');
  assert.match(source, /ClaudeRuntime/);
  assert.match(source, /CodexRuntime/);
  assert.match(source, /status\.summary/);
  assert.match(source, /hasUsableAIConfigEntry/);
  assert.match(source, /boundConfig\.enabled/);
});

test('runtime binding exposes provider-specific config binding controls', async () => {
  const source = await readFile(runtimeBindingPath, 'utf8');
  assert.match(source, /setConfigEnabled/);
  assert.match(source, /setProviderConfigId/);
  assert.match(source, /getMatchingConfigs/);
});

test('claudian chat page falls back from an unusable bound config to a preferred runtime config', async () => {
  const source = await readFile(chatPagePath, 'utf8');
  assert.match(source, /hasUsableAIConfigEntry/);
  assert.match(source, /boundConfig\.enabled/);
  assert.match(source, /usableBoundConfig\?\.id \|\| preferredConfig\?\.id \|\| null/);
});

test('claudian shell loads local agent config snapshot for provider pages', async () => {
  const source = await readFile(shellPath, 'utf8');
  assert.match(source, /getLocalAgentConfigSnapshot/);
  assert.match(source, /localSnapshot/);
});

test('claudian config page does not render local claude settings content', async () => {
  const source = await readFile(configPagePath, 'utf8');
  assert.doesNotMatch(source, /claudeSettings\.content/);
  assert.match(source, /不展示本地设置内容/);
});
