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
  const message = buildWelcomeMessage();

  assert.equal(message.role, 'assistant');
  assert.equal('content' in message, false);
  assert.deepEqual(message.timeline, []);
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

  assert.match(source, /const \[internalIsCollapsed, setInternalIsCollapsed\] = useState\(false\)/);
  assert.match(source, /const isCollapsed = isControlledCollapse \? Boolean\(collapsed\) : internalIsCollapsed/);
  assert.equal(getChatShellLayoutClassName(false), 'chat-shell is-sidebar');
});

test('AIChat source keeps a compact icon-first header and composer shell', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /chat-shell-icon-btn/);
  assert.match(source, /chat-composer-meta/);
  assert.match(source, /GNAgentEmbeddedComposer/);
});

test('GN Agent team execution trace collapses to a single inline summary row by default', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /className="chat-tool-trace-card chat-tool-trace-card-inline"/);
  assert.match(source, /className="chat-tool-trace-inline-summary"/);
  assert.match(source, /className="chat-tool-trace-inline-meta"/);
  assert.doesNotMatch(source, /<details key=\{phase\.id\} className="chat-tool-trace-phase" open=\{phase\.status === 'running'\}>/);
});

test('getChatViewportClassName maps collapse state to occupancy classes', () => {
  assert.equal(getChatViewportClassName(false), 'ai-chat-sidebar-expanded');
  assert.equal(getChatViewportClassName(true), 'ai-chat-sidebar-collapsed');
});
