import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildWelcomeMessage,
  getChatShellLayoutClassName,
  getChatViewportClassName,
  getComposerPlaceholder,
} from '../../src/components/workspace/aiChatViewState.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('buildWelcomeMessage creates a plain assistant welcome message', () => {
  const message = buildWelcomeMessage('DevFlow');

  assert.equal(message.role, 'assistant');
  assert.equal(message.content, 'DevFlow 已就绪。直接说需求。');
  assert.ok(message.content.length <= 24);
});

test('getComposerPlaceholder switches copy based on AI configuration state', () => {
  assert.equal(getComposerPlaceholder(true), '输入消息…');
  assert.equal(getComposerPlaceholder(false), '先配置 AI');
});

test('getChatShellLayoutClassName uses right sidebar layout', () => {
  assert.equal(getChatShellLayoutClassName(false), 'chat-shell is-sidebar');
  assert.equal(getChatShellLayoutClassName(true), 'chat-shell is-sidebar is-collapsed');
});

test('chat shell starts expanded as a fixed right sidebar', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /const \[isCollapsed, setIsCollapsed\] = useState\(false\)/);
  assert.equal(getChatShellLayoutClassName(false), 'chat-shell is-sidebar');
});

test('AIChat source keeps a compact icon-first header and composer shell', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /chat-shell-icon-btn/);
  assert.match(source, /chat-composer-meta/);
  assert.match(source, /chat-selected-reference-chips/);
});

test('getChatViewportClassName maps collapse state to occupancy classes', () => {
  assert.equal(getChatViewportClassName(false), 'ai-chat-sidebar-expanded');
  assert.equal(getChatViewportClassName(true), 'ai-chat-sidebar-collapsed');
});
