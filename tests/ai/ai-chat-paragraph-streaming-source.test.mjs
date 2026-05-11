import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('AIChat uses paragraph streaming helpers instead of mirroring projection text directly', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /assistantParagraphStreaming/);
  assert.match(source, /finalizeParagraphStreamingState/);
  assert.match(source, /projection\.finalMessage\?\.text/);
  assert.doesNotMatch(source, /nextDraft\.streamingText = projection\.activeMessage\.text;/);
  assert.doesNotMatch(source, /finalizeParagraphStreamingState\(\s*currentParagraphState,\s*getAssistantTimelineText\(message\.timeline\),\s*\)/);
});
