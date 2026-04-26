import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const cssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');

test('chat shell header renders the three direct local agent tabs', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /CHAT_AGENTS/);
  assert.match(source, /AgentIcon/);
  assert.match(source, /selectedChatAgentId/);
  assert.match(source, /className="chat-shell-agent-tabs"/);
  assert.match(source, /CHAT_AGENTS\.map\(\(agent\)/);
  assert.match(source, /agent\.id === selectedChatAgentId/);
  assert.match(source, /aria-label=\{agent\.label\}/);
  assert.match(source, /<AgentIcon agentId=\{agent\.id\} \/>/);
  assert.doesNotMatch(source, />\{agent\.label\}\s*<\/button>/);
});

test('Claude and Codex tabs run through the native local agent prompt bridge', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /invoke<LocalAgentCommandResult>\('run_local_agent_prompt'/);
  assert.match(source, /agent:\s*selectedChatAgentId/);
  assert.match(source, /getProjectDir\(currentProject\.id\)/);
  assert.match(source, /projectRoot,/);
  assert.match(source, /prompt:\s*localAgentPrompt/);
  assert.doesNotMatch(source, /invoke<LocalAgentCommandResult>\('open_local_agent_interface'/);
});

test('chat submit keeps built-in AI on the existing AI service path and branches local agents separately', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /selectedChatAgentId === 'built-in'/);
  assert.match(source, /aiService\.completeText\(/);
  assert.match(source, /selectedChatAgentId !== 'built-in'/);
});

test('chat composer css defines compact agent tabs', async () => {
  const css = await readFile(cssPath, 'utf8');

  assert.match(css, /\.chat-shell-agent-tabs\s*\{/);
  assert.match(css, /width:\s*auto;/);
  assert.match(css, /margin-left:\s*auto;/);
  assert.match(css, /\.chat-agent-tab\s*\{/);
  assert.match(css, /width:\s*32px;/);
  assert.match(css, /height:\s*32px;/);
  assert.match(css, /\.chat-agent-tab\.active\s*\{/);
  assert.match(css, /\.chat-agent-tab svg\s*\{/);
  assert.match(css, /\.chat-local-agent-pane\s*\{/);
});
