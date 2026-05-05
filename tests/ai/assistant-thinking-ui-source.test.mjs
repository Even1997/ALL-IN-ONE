import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');
const componentPath = path.resolve(__dirname, '../../src/components/workspace/AIChatAssistantParts.tsx');

test('thinking summary preview uses a single-line ellipsis in collapsed state', async () => {
  const [css, componentSource] = await Promise.all([
    readFile(cssPath, 'utf8'),
    readFile(componentPath, 'utf8'),
  ]);
  const previewRuleMatch = css.match(/\.chat-thinking-preview\s*\{[\s\S]*?\n\}/);

  assert.match(css, /\.chat-thinking-copy\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*1fr\);/);
  assert.ok(previewRuleMatch, 'expected to find .chat-thinking-preview CSS rule');
  const previewRule = previewRuleMatch?.[0] || '';
  assert.match(previewRule, /min-width:\s*0;/);
  assert.match(previewRule, /overflow:\s*hidden;/);
  assert.match(previewRule, /text-overflow:\s*ellipsis;/);
  assert.match(previewRule, /white-space:\s*nowrap;/);
  assert.doesNotMatch(previewRule, /-webkit-line-clamp:\s*2;/);
  assert.doesNotMatch(previewRule, /white-space:\s*normal;/);
  assert.doesNotMatch(componentSource, /previewLine\.length > 88 \? /);
});
