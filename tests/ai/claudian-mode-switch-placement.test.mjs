import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('ai chat renders a claudian entry area above the composer action strip', async () => {
  const source = await readFile(aiChatPath, 'utf8');
  assert.match(source, /ClaudianModeSwitch/);
  assert.match(source, /entrySwitch=\{<ClaudianModeSwitch compact \/>\}/);
});
