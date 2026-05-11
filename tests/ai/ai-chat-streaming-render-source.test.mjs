import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assistantPartsPath = path.resolve(
  __dirname,
  '../../src/components/workspace/AIChatAssistantParts.tsx',
);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('streaming assistant text uses lightweight render path before final markdown render', async () => {
  const source = await readFile(assistantPartsPath, 'utf8');

  assert.match(source, /export const AssistantTextBlock = memo\(function AssistantTextBlock\(\{/);
  assert.match(source, /isStreaming\?: boolean/);
  assert.match(source, /isStreaming \? \(/);
  assert.match(source, /className="chat-answer-streaming-plain"/);
});

test('AIChat passes streaming state into assistant text renderer', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /<AssistantTextBlock[\s\S]*isStreaming=\{options\?\.isStreaming \?\? false\}/);
});
