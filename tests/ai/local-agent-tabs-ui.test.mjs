import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('GN Agent keeps local runtimes internal instead of exposing Claude/Codex as primary tabs', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /CHAT_AGENTS/);
  assert.match(source, /selectedChatAgentId/);
  assert.match(source, /getLocalAgentConfigSnapshot/);
  assert.match(source, /invoke<LocalAgentCommandResult>\('run_local_agent_prompt'/);
  assert.match(source, /agent:\s*effectiveChatAgentId/);
  assert.match(source, /projectRoot,/);
  assert.doesNotMatch(source, /className="chat-shell-agent-tabs"/);
  assert.doesNotMatch(source, /<AgentIcon agentId=\{agent\.id\} \/>/);
  assert.doesNotMatch(source, /invoke<LocalAgentCommandResult>\('open_local_agent_interface'/);
});

test('built-in AI remains the default execution path', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /useState<ChatAgentId>\('built-in'\)/);
  assert.match(source, /effectiveChatAgentId === 'built-in'/);
  assert.match(source, /aiService\.completeText\(/);
  assert.match(source, /effectiveChatAgentId !== 'built-in'/);
});
