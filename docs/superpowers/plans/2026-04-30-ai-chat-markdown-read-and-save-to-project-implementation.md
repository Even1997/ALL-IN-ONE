# AI Chat Markdown Read And Save To Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Markdown rendering for assistant chat answers and a one-click "save to project" action that always creates a new knowledge note plus `.md` mirror when available.

**Architecture:** Keep the current chat runtime, message parsing, and knowledge proposal flow intact. Add one small pure helper module for extracting saveable Markdown and deriving titles, extend the message list to render per-message actions, and wire the new save flow inside `AIChat.tsx` by reusing the existing knowledge note creation and mirror-writing helpers.

**Tech Stack:** React 19, TypeScript, local CSS, Zustand chat store, `react-markdown` viewer reuse, Node `--test` source assertions, Vite build

---

### Task 1: Lock the save contract and Markdown display contract with failing tests

**Files:**
- Create: `tests/ai/ai-chat-saved-document.test.mjs`
- Create: `tests/ai/ai-chat-markdown-save-ui.test.mjs`
- Test: `tests/ai/ai-chat-message-parts.test.mjs`
- Test: `tests/ai/knowledge-proposal-chat-ui.test.mjs`

- [ ] **Step 1: Create a pure helper test file for saveable Markdown extraction and title derivation**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulePath = path.resolve(__dirname, '../../src/components/workspace/aiChatSavedDocument.ts');

const loadModule = async () => {
  const source = await readFile(modulePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: pathToFileURL(modulePath).href,
  });

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled.outputText)}`);
};

test('extractSaveableAssistantMarkdown keeps only text parts and drops think/tool blocks', async () => {
  const { extractSaveableAssistantMarkdown } = await loadModule();

  assert.equal(
    extractSaveableAssistantMarkdown([
      { type: 'thinking', content: 'hidden', collapsed: true },
      { type: 'text', content: '# Project overview\n\nBody' },
      { type: 'tool', name: 'bash', title: 'Run', status: 'success', output: 'ok' },
      { type: 'text', content: '## Next steps\n- A\n- B' },
    ]),
    '# Project overview\n\nBody\n\n## Next steps\n- A\n- B'
  );
});

test('extractSaveableAssistantMarkdown returns empty text when a message has no assistant body', async () => {
  const { extractSaveableAssistantMarkdown } = await loadModule();

  assert.equal(
    extractSaveableAssistantMarkdown([
      { type: 'thinking', content: 'hidden', collapsed: false },
      { type: 'tool', name: 'terminal', title: 'Output', status: 'success', output: 'done' },
    ]),
    ''
  );
});

test('deriveSavedAssistantTitle prefers the first Markdown H1 heading', async () => {
  const { deriveSavedAssistantTitle } = await loadModule();

  assert.equal(
    deriveSavedAssistantTitle({
      markdown: '# Login flow\n\n## Steps\n- Open app',
      sessionTitle: '新对话',
      fallbackTimeLabel: '2026-04-30 14-20',
    }),
    'Login flow'
  );
});

test('deriveSavedAssistantTitle falls back to the first readable line when there is no H1', async () => {
  const { deriveSavedAssistantTitle } = await loadModule();

  assert.equal(
    deriveSavedAssistantTitle({
      markdown: '> 用户先打开 App\n\n- 再点击登录',
      sessionTitle: '登录讨论',
      fallbackTimeLabel: '2026-04-30 14-20',
    }),
    '用户先打开 App'
  );
});

test('deriveSavedAssistantTitle falls back to session title plus time label when content has no readable line', async () => {
  const { deriveSavedAssistantTitle } = await loadModule();

  assert.equal(
    deriveSavedAssistantTitle({
      markdown: '```ts\nconst demo = true;\n```',
      sessionTitle: '登录讨论',
      fallbackTimeLabel: '2026-04-30 14-20',
    }),
    '登录讨论 2026-04-30 14-20'
  );
});
```

- [ ] **Step 2: Create a source-level UI contract test for Markdown rendering and per-message save actions**

```js
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const messageListPath = path.resolve(testDir, '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx');
const helperPath = path.resolve(testDir, '../../src/components/workspace/aiChatSavedDocument.ts');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

test('AI chat renders assistant answer text with the shared markdown viewer and exposes save-to-project actions', async () => {
  const chatSource = await readFile(chatPath, 'utf8');
  const messageListSource = await readFile(messageListPath, 'utf8');
  const helperSource = await readFile(helperPath, 'utf8');
  const cssSource = await readFile(cssPath, 'utf8');

  assert.match(chatSource, /KnowledgeMarkdownViewer/);
  assert.match(chatSource, /saveAssistantMessageToProject/);
  assert.match(chatSource, /extractSaveableAssistantMarkdown/);
  assert.match(chatSource, /deriveSavedAssistantTitle/);
  assert.match(chatSource, /serializeKnowledgeNoteMarkdown/);
  assert.match(chatSource, /createProjectNote/);
  assert.match(chatSource, /保存到项目|保存中\\.\\.\\.|已保存到项目/);
  assert.match(chatSource, /tags:\s*\[\]/);

  assert.match(messageListSource, /renderMessageActions/);
  assert.match(messageListSource, /chat-message-actions/);

  assert.match(helperSource, /extractSaveableAssistantMarkdown/);
  assert.match(helperSource, /deriveSavedAssistantTitle/);

  assert.match(cssSource, /\.chat-message-actions/);
  assert.match(cssSource, /\.chat-message-save-btn/);
  assert.match(cssSource, /\.chat-answer-markdown/);
});
```

- [ ] **Step 3: Add a regression assertion that the legacy plain line-by-line answer renderer is gone**

```js
test('AI chat no longer renders assistant answers as split line divs', async () => {
  const chatSource = await readFile(chatPath, 'utf8');

  assert.doesNotMatch(chatSource, /part\.content\.split\('\\n'\)/);
  assert.doesNotMatch(chatSource, /chat-answer-text/);
});
```

- [ ] **Step 4: Run the focused tests to verify they fail before implementation**

Run: `node --test tests/ai/ai-chat-saved-document.test.mjs tests/ai/ai-chat-markdown-save-ui.test.mjs`

Expected: FAIL because `aiChatSavedDocument.ts`, `renderMessageActions`, Markdown answer rendering, and save UI do not exist yet.

- [ ] **Step 5: Commit the failing-test checkpoint**

```bash
git add tests/ai/ai-chat-saved-document.test.mjs tests/ai/ai-chat-markdown-save-ui.test.mjs
git commit -m "test: lock ai chat markdown save contract"
```

### Task 2: Implement the pure helper module for saveable Markdown and deterministic titles

**Files:**
- Create: `src/components/workspace/aiChatSavedDocument.ts`
- Test: `tests/ai/ai-chat-saved-document.test.mjs`

- [ ] **Step 1: Create the helper module with the shared title and extraction logic**

```ts
import type { AIChatMessagePart } from './aiChatMessageParts';

type DeriveSavedAssistantTitleInput = {
  markdown: string;
  sessionTitle: string;
  fallbackTimeLabel: string;
};

const MAX_TITLE_LENGTH = 60;

const truncateTitle = (value: string) =>
  value.length > MAX_TITLE_LENGTH ? `${value.slice(0, MAX_TITLE_LENGTH).trim()}...` : value;

const stripLeadingMarkdownSyntax = (value: string) =>
  value
    .trim()
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^`+/, '')
    .replace(/`+$/g, '')
    .trim();

const extractFirstMarkdownH1 = (markdown: string) => {
  const match = markdown.match(/(?:^|\r?\n)#\s+(.+?)\s*(?:\r?\n|$)/);
  return match?.[1]?.trim() || '';
};

const extractFirstReadableLine = (markdown: string) => {
  for (const rawLine of markdown.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('```')) {
      continue;
    }

    const readable = stripLeadingMarkdownSyntax(trimmed);
    if (readable) {
      return readable;
    }
  }

  return '';
};

export const extractSaveableAssistantMarkdown = (parts: AIChatMessagePart[]) =>
  parts
    .filter((part): part is Extract<AIChatMessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.content.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

export const deriveSavedAssistantTitle = ({
  markdown,
  sessionTitle,
  fallbackTimeLabel,
}: DeriveSavedAssistantTitleInput) => {
  const h1Title = extractFirstMarkdownH1(markdown);
  if (h1Title) {
    return truncateTitle(h1Title);
  }

  const firstReadableLine = extractFirstReadableLine(markdown);
  if (firstReadableLine) {
    return truncateTitle(firstReadableLine);
  }

  return truncateTitle(`${sessionTitle.trim() || '新对话'} ${fallbackTimeLabel}`.trim());
};
```

- [ ] **Step 2: Run the helper tests to verify the new module passes in isolation**

Run: `node --test tests/ai/ai-chat-saved-document.test.mjs`

Expected: PASS

- [ ] **Step 3: Commit the helper module**

```bash
git add src/components/workspace/aiChatSavedDocument.ts tests/ai/ai-chat-saved-document.test.mjs
git commit -m "feat: add ai chat saved document helpers"
```

### Task 3: Wire Markdown rendering and save-to-project actions into the chat message list

**Files:**
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx`
- Test: `tests/ai/ai-chat-markdown-save-ui.test.mjs`
- Test: `tests/ai/knowledge-proposal-chat-ui.test.mjs`

- [ ] **Step 1: Import the shared Markdown viewer and new save helpers into `AIChat.tsx`**

```tsx
import { KnowledgeMarkdownViewer } from '../../features/knowledge/workspace/KnowledgeMarkdownViewer';
import {
  deriveSavedAssistantTitle,
  extractSaveableAssistantMarkdown,
} from './aiChatSavedDocument';
```

- [ ] **Step 2: Add message-level UI state for the per-message save lifecycle**

```tsx
type MessageSaveState = {
  status: 'idle' | 'saving' | 'saved' | 'error';
  error?: string;
};

const [messageSaveStates, setMessageSaveStates] = useState<Record<string, MessageSaveState>>({});
```

- [ ] **Step 3: Update `GNAgentEmbeddedPieces.tsx` so the message list can render per-message actions**

```tsx
type MessagePartRenderer = (
  message: StoredChatMessage,
  part: AIChatMessagePart,
  index: number,
  content: string
) => React.ReactNode;

export const GNAgentMessageList: React.FC<{
  messages: StoredChatMessage[];
  draftContents?: Record<string, string>;
  formatTimestamp: (value: number) => string;
  parseMessageParts: MessagePartsParser;
  renderMessagePart: MessagePartRenderer;
  renderMessageActions?: (message: StoredChatMessage, content: string) => React.ReactNode;
  renderKnowledgeProposal?: (message: StoredChatMessage) => React.ReactNode;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  leadingContent?: React.ReactNode;
}> = ({ messages, draftContents, formatTimestamp, parseMessageParts, renderMessagePart, renderMessageActions, renderKnowledgeProposal, messagesEndRef, leadingContent }) => (
  <div className="chat-message-list">
    {leadingContent}
    {messages.map((message) => {
      const content = draftContents?.[message.id] ?? message.content;
      const parts = parseMessageParts(content);
      return (
        <article key={message.id} className={`chat-message ${message.role} ${message.tone === 'error' ? 'is-error' : ''}`}>
          <div className="chat-message-bubble">
            <div className="chat-message-content">
              {parts.map((part, index) => renderMessagePart(message, part, index, content))}
              {renderKnowledgeProposal ? renderKnowledgeProposal(message) : null}
            </div>
            {renderMessageActions ? <div className="chat-message-actions">{renderMessageActions(message, content)}</div> : null}
            <div className="chat-message-meta">{formatTimestamp(message.createdAt)}</div>
          </div>
        </article>
      );
    })}
    <div ref={messagesEndRef} />
  </div>
);
```

- [ ] **Step 4: Replace the legacy plain-text answer renderer in `AIChat.tsx` with role-aware Markdown rendering**

```tsx
const renderMessagePart = (
  message: { id: string; role: 'user' | 'assistant' | 'system' },
  part: AIChatMessagePart,
  index: number
) => {
  if (part.type === 'thinking') {
    // keep the current thinking block exactly as-is
  }

  if (part.type === 'tool') {
    // keep the current tool card exactly as-is
  }

  if (message.role === 'assistant') {
    return (
      <div className="chat-answer-markdown" key={`${message.id}-text-${index}`}>
        <KnowledgeMarkdownViewer markdown={part.content} />
      </div>
    );
  }

  return (
    <div className="chat-answer-plain" key={`${message.id}-text-${index}`}>
      {part.content.split('\n').map((line, lineIndex) => (
        <div key={`${message.id}-text-${index}-${lineIndex}`}>{line}</div>
      ))}
    </div>
  );
};
```

- [ ] **Step 5: Add the new save handler in `AIChat.tsx` and reuse the existing note-create + mirror chain**

```tsx
const buildSaveTimeLabel = (value: number) =>
  new Date(value)
    .toLocaleString('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(':', '-');

const saveAssistantMessageToProject = useCallback(
  async (message: { id: string; role: 'assistant'; createdAt: number }, content: string) => {
    if (!currentProject) {
      return;
    }

    setMessageSaveStates((current) => ({
      ...current,
      [message.id]: { status: 'saving' },
    }));

    try {
      const parts = parseAIChatMessageParts(content);
      const markdown = extractSaveableAssistantMarkdown(parts);
      if (!markdown) {
        throw new Error('这条回答没有可保存的正文内容。');
      }

      const title = deriveSavedAssistantTitle({
        markdown,
        sessionTitle: activeSession?.title || '新对话',
        fallbackTimeLabel: buildSaveTimeLabel(message.createdAt),
      });
      const normalizedContent = serializeKnowledgeNoteMarkdown(title, markdown);
      const filePath =
        isTauriRuntimeAvailable() && projectKnowledgeRootDir
          ? await resolveKnowledgeNoteMirrorPath({
              projectKnowledgeRootDir,
              title,
              content: normalizedContent,
            })
          : '';

      await createProjectNote(currentProject.id, {
        title,
        content: normalizedContent,
        filePath,
        updatedAt: new Date(message.createdAt).toISOString(),
        tags: [],
      });

      setMessageSaveStates((current) => ({
        ...current,
        [message.id]: { status: 'saved' },
      }));
      await loadKnowledgeNotes(currentProject.id);
    } catch (error) {
      setMessageSaveStates((current) => ({
        ...current,
        [message.id]: {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  },
  [activeSession?.title, createProjectNote, currentProject, loadKnowledgeNotes, projectKnowledgeRootDir]
);
```

- [ ] **Step 6: Add the per-message action renderer in `AIChat.tsx` so save is available only for completed assistant answers**

```tsx
const renderMessageActions = useCallback(
  (message: StoredChatMessage, content: string) => {
    if (message.role !== 'assistant') {
      return null;
    }

    const saveState = messageSaveStates[message.id] || { status: 'idle' as const };
    const isStreaming = Boolean(streamingDraftContents[message.id]);
    const saveableMarkdown = extractSaveableAssistantMarkdown(parseAIChatMessageParts(content));

    if (!currentProject || !saveableMarkdown) {
      return null;
    }

    return (
      <>
        <button
          type="button"
          className="chat-message-save-btn"
          disabled={saveState.status === 'saving' || isStreaming}
          onClick={() => void saveAssistantMessageToProject(message as StoredChatMessage & { role: 'assistant' }, content)}
        >
          {saveState.status === 'saving'
            ? '保存中...'
            : saveState.status === 'saved'
              ? '已保存到项目'
              : '保存到项目'}
        </button>
        {saveState.status === 'error' && saveState.error ? (
          <span className="chat-message-save-note error">{saveState.error}</span>
        ) : null}
      </>
    );
  },
  [currentProject, messageSaveStates, saveAssistantMessageToProject, streamingDraftContents]
);
```

- [ ] **Step 7: Pass the new message action renderer into `GNAgentMessageList`**

```tsx
<GNAgentMessageList
  messages={messages}
  draftContents={streamingDraftContents}
  formatTimestamp={formatTimestamp}
  parseMessageParts={parseAIChatMessageParts}
  renderMessagePart={renderMessagePart}
  renderMessageActions={renderMessageActions}
  renderKnowledgeProposal={renderKnowledgeProposal}
  messagesEndRef={messagesEndRef}
  leadingContent={launchpad}
/>
```

- [ ] **Step 8: Run the focused UI tests to verify the wiring passes**

Run: `node --test tests/ai/ai-chat-markdown-save-ui.test.mjs tests/ai/knowledge-proposal-chat-ui.test.mjs`

Expected: PASS

- [ ] **Step 9: Commit the chat wiring**

```bash
git add src/components/workspace/AIChat.tsx src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx tests/ai/ai-chat-markdown-save-ui.test.mjs tests/ai/knowledge-proposal-chat-ui.test.mjs
git commit -m "feat: wire ai chat markdown save actions"
```

### Task 4: Style the Markdown answer surface and save action row without disturbing existing cards

**Files:**
- Modify: `src/components/workspace/AIChat.css`
- Test: `tests/ai/ai-chat-markdown-save-ui.test.mjs`

- [ ] **Step 1: Replace the old `.chat-answer-text` block with Markdown-friendly wrappers**

```css
.chat-answer-markdown,
.chat-answer-plain {
  display: grid;
  gap: 8px;
}

.chat-answer-markdown .gn-markdown-viewer {
  color: inherit;
  font-size: inherit;
}

.chat-answer-markdown .gn-markdown-viewer > :first-child {
  margin-top: 0;
}

.chat-answer-markdown .gn-markdown-viewer h1,
.chat-answer-markdown .gn-markdown-viewer h2,
.chat-answer-markdown .gn-markdown-viewer h3 {
  color: inherit;
}

.chat-answer-markdown .gn-markdown-viewer p,
.chat-answer-markdown .gn-markdown-viewer li,
.chat-answer-markdown .gn-markdown-viewer blockquote {
  color: inherit;
}
```

- [ ] **Step 2: Add a compact per-message action row and save button styles**

```css
.chat-message-actions {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.chat-message-save-btn {
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--mode-border, rgba(255, 255, 255, 0.12));
  background: color-mix(in srgb, var(--mode-panel-alt, rgba(255, 255, 255, 0.06)) 92%, transparent);
  color: var(--mode-text, #f8fafc);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.chat-message-save-btn:disabled {
  cursor: default;
  opacity: 0.7;
}

.chat-message-save-note {
  color: var(--mode-muted, rgba(255, 255, 255, 0.64));
  font-size: 11px;
}

.chat-message-save-note.error {
  color: color-mix(in srgb, var(--mode-danger, #f87171) 78%, white);
}
```

- [ ] **Step 3: Run the UI contract tests again after the CSS update**

Run: `node --test tests/ai/ai-chat-markdown-save-ui.test.mjs`

Expected: PASS

- [ ] **Step 4: Commit the style update**

```bash
git add src/components/workspace/AIChat.css tests/ai/ai-chat-markdown-save-ui.test.mjs
git commit -m "style: add ai chat markdown save states"
```

### Task 5: Run regression checks and final verification

**Files:**
- Test: `tests/ai/ai-chat-saved-document.test.mjs`
- Test: `tests/ai/ai-chat-markdown-save-ui.test.mjs`
- Test: `tests/ai/ai-chat-message-parts.test.mjs`
- Test: `tests/ai/knowledge-proposal-chat-ui.test.mjs`
- Test: `tests/knowledge-note-markdown.test.mjs`

- [ ] **Step 1: Run the focused regression suite**

Run: `node --test tests/ai/ai-chat-saved-document.test.mjs tests/ai/ai-chat-markdown-save-ui.test.mjs tests/ai/ai-chat-message-parts.test.mjs tests/ai/knowledge-proposal-chat-ui.test.mjs tests/knowledge-note-markdown.test.mjs`

Expected: PASS

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: `tsc && vite build` completes successfully with no TypeScript or bundling errors.

- [ ] **Step 3: Review the final diff to confirm the scope stayed surgical**

Run: `git diff --stat HEAD~4..HEAD`

Expected: Only the helper module, chat UI files, chat CSS, and the new focused tests are included.

- [ ] **Step 4: Commit the verification checkpoint**

```bash
git add src/components/workspace/aiChatSavedDocument.ts src/components/workspace/AIChat.tsx src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx src/components/workspace/AIChat.css tests/ai/ai-chat-saved-document.test.mjs tests/ai/ai-chat-markdown-save-ui.test.mjs
git commit -m "test: verify ai chat markdown save flow"
```

## Self-Review

### Spec Coverage

- Markdown 阅读：Task 3 Step 4 switches assistant text blocks to `KnowledgeMarkdownViewer`.
- 只作用于 assistant 普通回答：Task 3 Step 4 and Step 6 keep role-aware rendering and action gating.
- 保存到项目为新建知识笔记：Task 3 Step 5 always calls `createProjectNote`, never `updateProjectNote`.
- 同步 `.md` 镜像：Task 3 Step 5 reuses `resolveKnowledgeNoteMirrorPath`.
- 不保存 thinking/tool/proposal：Task 2 helper extracts only `text` parts.
- 标题规则：Task 2 helper implements H1, first readable line, session-title fallback order.
- 不加标签：Task 3 Step 5 writes `tags: []`.
- 保持现有 proposal flow：Task 3 leaves `renderKnowledgeProposal` and proposal handlers intact.

### Placeholder Scan

- No `TODO`, `TBD`, or “handle appropriately” placeholders remain.
- Every code-changing step includes concrete code to add or change.
- Every verification step includes an exact command and an expected result.

### Type Consistency

- The helper module accepts `AIChatMessagePart[]`, matching `parseAIChatMessageParts`.
- `GNAgentMessageList` remains the single place that computes `content` and `parts`, and now passes both to render callbacks.
- The save flow reuses existing `createProjectNote`, `serializeKnowledgeNoteMarkdown`, and `resolveKnowledgeNoteMirrorPath` names exactly as they exist today.
