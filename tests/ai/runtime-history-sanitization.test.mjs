import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const embeddedPiecesPath = path.resolve(__dirname, '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx');

test('assistant conversation history does not fall back to reasoning text', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /\? getAssistantTimelineText\(message\.timeline\)/);
  assert.doesNotMatch(
    source,
    /\? getAssistantTimelineText\(message\.timeline\) \|\| getAssistantTimelineReasoning\(message\.timeline\)/
  );
});

test('GN agent history preview does not fall back to reasoning text', async () => {
  const source = await readFile(embeddedPiecesPath, 'utf8');

  assert.match(source, /\? getAssistantTimelineText\(lastMessage\.timeline\)/);
  assert.doesNotMatch(
    source,
    /\? getAssistantTimelineText\(lastMessage\.timeline\) \|\| getAssistantTimelineReasoning\(lastMessage\.timeline\)/
  );
});
