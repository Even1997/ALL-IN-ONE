import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cssPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.css');
const componentPath = path.resolve(__dirname, '../../src/components/workspace/AIChatAssistantParts.tsx');

test('thinking body keeps multi-line reasoning readable behind a manual disclosure', async () => {
  const [css, componentSource] = await Promise.all([
    readFile(cssPath, 'utf8'),
    readFile(componentPath, 'utf8'),
  ]);
  const thinkingBodyRuleMatch = css.match(/\.chat-thinking-body\s*\{[\s\S]*?\n\}/);

  assert.match(css, /\.chat-thinking-summary,\s*\r?\n\.chat-thinking-summary-text\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;/);
  assert.match(css, /\.chat-thinking-summary-copy\s*\{[\s\S]*font-size:\s*11px[\s\S]*font-weight:\s*560/);
  assert.ok(thinkingBodyRuleMatch, 'expected to find .chat-thinking-body CSS rule');
  const thinkingBodyRule = thinkingBodyRuleMatch?.[0] || '';
  assert.match(thinkingBodyRule, /overflow:\s*auto;/);
  assert.match(thinkingBodyRule, /white-space:\s*pre-wrap;/);
  assert.match(thinkingBodyRule, /line-height:\s*1\.5/);
  assert.doesNotMatch(thinkingBodyRule, /text-overflow:\s*ellipsis;/);
  assert.match(componentSource, /const \[expanded, setExpanded\] = useState\(false\);/);
  assert.match(componentSource, /setExpanded\(false\);/);
  assert.match(componentSource, /<details[\s\S]*className=\{`chat-thinking-block/);
  assert.match(componentSource, /className="chat-inline-disclosure chat-thinking-summary"/);
  assert.doesNotMatch(componentSource, /previewLine\.length > 88 \? /);
  assert.doesNotMatch(componentSource, /chat-thinking-preview/);
});

test('thinking header uses plain disclosure text instead of animated chrome', async () => {
  const [css, componentSource] = await Promise.all([
    readFile(cssPath, 'utf8'),
    readFile(componentPath, 'utf8'),
  ]);

  assert.match(componentSource, /chat-thinking-summary-copy/);
  assert.match(componentSource, /chat-thinking-summary-caret/);
  assert.doesNotMatch(componentSource, /chat-thinking-pill/);
  assert.doesNotMatch(componentSource, /chat-thinking-marker/);
  assert.doesNotMatch(componentSource, /chat-thinking-pulse/);
  assert.doesNotMatch(componentSource, /chat-thinking-dots/);
  assert.match(css, /\.chat-thinking-summary-caret\s*\{/);
  assert.doesNotMatch(css, /@keyframes chat-thinking-pulse/);
  assert.doesNotMatch(css, /@keyframes chat-thinking-dot/);
});
