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
const loadRenderModel = async () =>
  import(`../../src/components/workspace/assistantRenderModel.ts?test=${Date.now()}`);

const buildAssistantMessage = (timeline = []) => ({
  id: 'assistant-1',
  role: 'assistant',
  timeline,
  createdAt: 1,
});

const buildDraftState = (timeline, overrides = {}) => ({ timeline, ...overrides });

test('streaming assistant text keeps a dedicated streaming mode and lifecycle hooks before final markdown render', async () => {
  const source = await readFile(assistantPartsPath, 'utf8');

  assert.doesNotMatch(source, /createStreamingTextRevealController/);
  assert.doesNotMatch(source, /displayedContent/);
  assert.doesNotMatch(source, /chat-answer-streaming-caret/);
  assert.match(source, /isStreaming\?: boolean/);
  assert.match(source, /onFirstVisibleChar\?: \(\) => void/);
  assert.match(source, /onFinalVisibleDone\?: \(\) => void/);
  assert.match(source, /isStreaming[\s\S]*ReactMarkdown/);
  assert.match(source, /onFirstVisibleChar\?\.\(\)/);
  assert.match(source, /onFinalVisibleDone\?\.\(\)/);
});

test('AIChat passes streaming state into assistant text rendering options', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /AssistantTextBlock/);
  assert.match(source, /isStreaming:\s*options\?\.isStreaming \?\? false/);
});

test('assistant render model prefers the shared draft timeline text while streaming', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const message = buildAssistantMessage([
    { id: 'text-message', kind: 'text', content: 'persisted final text', createdAt: 3 },
  ]);
  const draftState = buildDraftState([
    { id: 'text-draft', kind: 'text', content: 'slower rebuilt draft text', createdAt: 2 },
  ]);

  const model = buildAssistantRenderModel(
    message,
    {
      ...draftState,
      isStreaming: true,
    },
    0,
  );

  assert.equal(model.content, 'slower rebuilt draft text');
  assert.equal(model.copyText, 'slower rebuilt draft text');
  assert.deepEqual(
    model.items.filter((item) => item.part.type === 'text').map((item) => item.part.content),
    ['slower rebuilt draft text'],
  );
});

test('assistant render model falls back to rebuilt timeline text when no fast projection text exists', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const draftState = buildDraftState([
    { id: 'text-draft', kind: 'text', content: 'rebuilt timeline text', createdAt: 2 },
  ]);

  const model = buildAssistantRenderModel(
    buildAssistantMessage(),
    {
      ...draftState,
      isStreaming: true,
    },
    0,
  );

  assert.equal(model.content, 'rebuilt timeline text');
  assert.equal(model.copyText, 'rebuilt timeline text');
});

test('assistant render model reverts to persisted timeline text after streaming finishes', async () => {
  const { buildAssistantRenderModel } = await loadRenderModel();
  const message = buildAssistantMessage([
    { id: 'text-final', kind: 'text', content: 'final persisted answer', createdAt: 4 },
  ]);
  const draftState = buildDraftState([
    { id: 'text-draft', kind: 'text', content: 'stale streaming draft', createdAt: 2 },
  ]);

  const model = buildAssistantRenderModel(
    message,
    {
      ...draftState,
      isStreaming: false,
    },
    0,
  );

  assert.equal(model.content, 'final persisted answer');
  assert.equal(model.copyText, 'final persisted answer');
});

test('thinking duration label uses whole-second display instead of fractional jitter', async () => {
  const source = await readFile(assistantPartsPath, 'utf8');

  assert.doesNotMatch(source, /toFixed\(1\)\}s/);
  assert.match(source, /Math\.floor\(Math\.max\(0, elapsedSeconds\)\)/);
});

test('assistant thinking active state is not extended by answer streaming', async () => {
  const source = await readFile(assistantPartsPath, 'utf8');

  assert.match(source, /const isThinkingActive = part\.status === 'streaming';/);
  assert.doesNotMatch(source, /isStreaming && part\.status !== 'completed'/);
});

test('assistant thinking render keeps reasoning content visible while preserving live status', async () => {
  const source = await readFile(assistantPartsPath, 'utf8');

  assert.match(source, /const hasVisibleContent = part\.content\.trim\(\)\.length > 0;/);
  assert.doesNotMatch(source, /if \(part\.status !== 'streaming'\) \{\s*return null;\s*\}/);
  assert.match(source, /const \[expanded, setExpanded\] = useState\(false\);/);
  assert.match(source, /setExpanded\(false\);/);
  assert.match(source, /className="chat-inline-disclosure chat-thinking-summary"/);
  assert.match(source, /className="chat-thinking-body"/);
  assert.match(source, /className="chat-thinking-summary-copy"/);
  assert.doesNotMatch(source, /chat-thinking-pill/);
  assert.doesNotMatch(source, /className="chat-thinking-toggle"/);
  assert.doesNotMatch(source, /chat-thinking-preview/);
  assert.match(source, /<pre className="chat-thinking-body">/);
});
