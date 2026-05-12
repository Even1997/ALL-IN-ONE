import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('AIChat streams assistant output as direct blocks instead of paragraph buffering', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.doesNotMatch(source, /assistantParagraphStreaming/);
  assert.doesNotMatch(source, /ParagraphStreamingState/);
  assert.doesNotMatch(source, /scheduleParagraphStreamingTimeout/);
  assert.match(source, /projectAssistantStreamingDraft/);
  assert.match(source, /const projectedDraft = projectAssistantStreamingDraft\(/);
});
