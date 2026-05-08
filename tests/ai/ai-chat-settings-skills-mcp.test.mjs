import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const mcpPagePath = path.resolve(__dirname, '../../src/components/workspace/RuntimeMcpSettingsPage.tsx');
const mcpClientPath = path.resolve(__dirname, '../../src/modules/ai/runtime/mcp/runtimeMcpClient.ts');

test('ai chat settings drawer exposes ai, skills, and mcp tabs', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /const SETTINGS_TABS/);
  assert.match(source, /id:\s*'ai'/);
  assert.match(source, /id:\s*'skills'/);
  assert.match(source, /id:\s*'mcp'/);
  assert.match(source, /activeSettingsTab === 'ai'/);
  assert.match(source, /activeSettingsTab === 'skills'/);
  assert.match(source, /activeSettingsTab === 'mcp'/);
  assert.match(source, /<GNAgentSkillsPage \/>/);
  assert.match(source, /<RuntimeMcpSettingsPage/);
});

test('ai chat settings can be opened from an external settings event and target a specific tab', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /AI_CHAT_SETTINGS_EVENT/);
  assert.match(source, /window\.addEventListener\(AI_CHAT_SETTINGS_EVENT/);
  assert.match(source, /setIsSettingsOpen\(true\)/);
  assert.match(source, /setActiveSettingsTab\(detail\.tab \|\| SETTINGS_TABS\[0\]\.id\)/);
});

test('runtime mcp settings page owns CRUD-style management hooks', async () => {
  const pageSource = await readFile(mcpPagePath, 'utf8');
  const clientSource = await readFile(mcpClientPath, 'utf8');

  assert.match(pageSource, /listRuntimeMcpServers/);
  assert.match(pageSource, /upsertRuntimeMcpServer/);
  assert.match(pageSource, /deleteRuntimeMcpServer/);
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

  assert.match(clientSource, /deleteRuntimeMcpServer/);
});
