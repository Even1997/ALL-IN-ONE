import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');

test('app keeps AI in the shared right pane instead of a dedicated Claude route', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.doesNotMatch(source, /import\s+\{\s*ClaudePage\s*\}\s+from\s+'\.\/components\/ai\/ClaudePage';/);
  assert.doesNotMatch(source, /<ClaudePage\s*\/>/);
  assert.doesNotMatch(source, /currentRole === 'ai'/);
  assert.doesNotMatch(source, /isAIPage/);
  assert.match(source, /<AIWorkspace collapsed=\{isDesktopAiCollapsed\} onCollapsedChange=\{setIsDesktopAiCollapsed\} \/>/);
  assert.match(source, /<main className="app-main app-main-desktop">\{appDesktopContent\}<\/main>/);
  assert.match(source, /<aside className="app-ai-activity-pane">\s*<AIWorkspace \/>\s*<\/aside>/);
  assert.match(source, /\{currentRole !== 'design' \? <AIWorkspace \/> : null\}/);
});

test('ai chat no longer exposes a dedicated claude full-page variant', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.doesNotMatch(source, /gn-agent-full-page/);
});

