import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const aiChatCssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');
const mcpPagePath = path.resolve(__dirname, '../../src/components/workspace/RuntimeMcpSettingsPage.tsx');
const mcpClientPath = path.resolve(__dirname, '../../src/modules/ai/runtime/mcp/runtimeMcpClient.ts');

test('ai chat settings drawer exposes ai, skills, and mcp tabs', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /const SETTINGS_TABS/);
  assert.match(source, /id:\s*'ai'/);
  assert.match(source, /id:\s*'permissions'/);
  assert.match(source, /id:\s*'general'/);
  assert.match(source, /id:\s*'adapters'/);
  assert.match(source, /id:\s*'terminal'/);
  assert.match(source, /id:\s*'skills'/);
  assert.match(source, /id:\s*'mcp'/);
  assert.match(source, /id:\s*'agents'/);
  assert.match(source, /id:\s*'plugins'/);
  assert.match(source, /id:\s*'computerUse'/);
  assert.match(source, /id:\s*'diagnostics'/);
  assert.match(source, /id:\s*'about'/);
  assert.match(source, /activeSettingsTab === 'ai'/);
  assert.match(source, /activeSettingsTab === 'skills'/);
  assert.match(source, /activeSettingsTab === 'mcp'/);
  assert.match(source, /renderSettingsPlaceholder/);
  assert.match(source, /chat-settings-placeholder-card/);
  assert.match(source, /<GNAgentSkillsPage \/>/);
  assert.match(source, /<RuntimeMcpSettingsPage/);
});

test('ai chat settings can be opened from an external settings event and target a specific tab', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /AI_CHAT_SETTINGS_EVENT/);
  assert.match(source, /window\.addEventListener\(AI_CHAT_SETTINGS_EVENT/);
  assert.match(source, /setIsSettingsOpen\(true\)/);
  assert.match(source, /resolveSettingsTabId\(detail\.tab\)/);
  assert.doesNotMatch(source, /setActiveSettingsTab\(detail\.tab \|\| SETTINGS_TABS\[0\]\.id\)/);
});

test('ai chat settings drawer keeps desktop and mobile content scrollable', async () => {
  const css = await readFile(aiChatCssPath, 'utf8');

  assert.match(css, /\.chat-settings-drawer\s*\{[^}]*height:\s*min\(820px, calc\(100dvh - 48px\)\);/s);
  assert.match(css, /\.chat-settings-drawer-body\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.chat-settings-sidebar\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.chat-settings-tab-list\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s);
  assert.match(css, /\.chat-settings-ai-layout\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s);
  assert.match(css, /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.chat-settings-drawer-body\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);/s);
  assert.match(css, /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.chat-settings-tab-list\s*\{[^}]*display:\s*flex;[^}]*overflow-x:\s*auto;/s);
  assert.match(css, /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.chat-settings-tab\s*\{[^}]*flex:\s*0 0 auto;[^}]*width:\s*auto;/s);
  assert.doesNotMatch(css, /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\.chat-settings-drawer-header,\s*\.chat-settings-detail-header,\s*\.chat-settings-inline,\s*\.chat-settings-actions\s*\{[\s\S]*?flex-direction:\s*column;/s);
});

test('runtime mcp settings page owns CRUD-style management hooks', async () => {
  const pageSource = await readFile(mcpPagePath, 'utf8');
  const clientSource = await readFile(mcpClientPath, 'utf8');

  assert.match(pageSource, /listRuntimeMcpServers/);
  assert.match(pageSource, /upsertRuntimeMcpServer/);
  assert.match(pageSource, /deleteRuntimeMcpServer/);
  assert.match(pageSource, /chat-settings-mcp-toolbar-bar/);
  assert.match(pageSource, /chat-settings-mcp-panel-header/);
  assert.match(pageSource, /chat-settings-mcp-list-meta/);
  assert.match(pageSource, /chat-settings-mcp-detail-section/);
  assert.match(pageSource, /chat-settings-mcp-kv/);
  assert.match(pageSource, /启用/);
  assert.match(pageSource, /停用/);
  assert.match(pageSource, /删除/);
  assert.match(pageSource, /新建服务器/);
  assert.match(pageSource, /刷新列表/);
  assert.match(pageSource, /SSE/);
  assert.match(pageSource, /环境变量/);
  assert.match(pageSource, /请求头/);
  assert.match(pageSource, /OAuth Client ID/);
  assert.match(pageSource, /Headers Helper/);
  assert.doesNotMatch(pageSource, /chat-settings-mcp-hero/);
  assert.doesNotMatch(pageSource, /chat-settings-mcp-summary/);

  assert.match(clientSource, /deleteRuntimeMcpServer/);
});
