# Knowledge Truth AI Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing left-tree / center-content / right-chat workspace into a knowledge-truth-first AI workbench where assistant replies stay chat-native while supporting structured knowledge cards, session-scoped temporary content, and user-confirmed knowledge sync.

**Architecture:** Reuse the current `AIChat` shell, `KnowledgeProposal` flow, and `m-flow` context path instead of introducing a parallel AI surface. Add a small structured-card contract for assistant messages, a non-persisted session artifact store for temporary content, and thin workbench wiring so temporary content can be previewed in the center pane before it is promoted into formal project knowledge.

**Tech Stack:** React 19, TypeScript, Zustand, Node test runner, Vite build

---

### Task 1: Add Structured Chat Cards And Session Artifact State

**Files:**
- Create: `src/modules/ai/chat/chatCards.ts`
- Create: `src/features/knowledge/store/knowledgeSessionArtifactsStore.ts`
- Modify: `src/modules/ai/store/aiChatStore.ts`
- Modify: `tests/ai/ai-chat-store.test.mjs`
- Create: `tests/knowledge-session-artifacts-store.test.mjs`

- [ ] **Step 1: Write the failing store tests**

Add these assertions to [`tests/ai/ai-chat-store.test.mjs`](/c:/Users/Even/Documents/ALL-IN-ONE/tests/ai/ai-chat-store.test.mjs) and create [`tests/knowledge-session-artifacts-store.test.mjs`](/c:/Users/Even/Documents/ALL-IN-ONE/tests/knowledge-session-artifacts-store.test.mjs):

```js
test('ai chat store keeps assistant structured cards intact', async () => {
  const { useAIChatStore, createChatSession, createStoredChatMessage } = await loadStore();
  const store = useAIChatStore.getState();

  const session = createChatSession('project-cards', '知识会话');
  store.upsertSession('project-cards', session);
  store.appendMessage('project-cards', session.id, {
    ...createStoredChatMessage('assistant', '我识别到了 2 条知识变化。'),
    structuredCards: [
      {
        type: 'summary',
        title: '本轮识别结果',
        body: '新增 1 条，冲突 1 条。',
      },
      {
        type: 'next-step',
        title: '下一步建议',
        actions: [{ id: 'review-conflicts', label: '先确认冲突', prompt: '先确认冲突' }],
      },
    ],
  });

  const savedMessage = useAIChatStore.getState().projects['project-cards'].sessions[0].messages[0];
  assert.equal(savedMessage.structuredCards[0].type, 'summary');
  assert.equal(savedMessage.structuredCards[1].actions[0].label, '先确认冲突');
});
```

```js
import assert from 'node:assert/strict';
import test from 'node:test';

const loadStore = async () =>
  import(`../src/features/knowledge/store/knowledgeSessionArtifactsStore.ts?test=${Date.now()}`);

test('knowledge session artifacts store keeps temporary content per session', async () => {
  const { useKnowledgeSessionArtifactsStore } = await loadStore();
  const store = useKnowledgeSessionArtifactsStore.getState();

  store.upsertArtifact({
    id: 'artifact-1',
    projectId: 'project-1',
    sessionId: 'session-1',
    title: '影响分析',
    artifactType: 'impact-analysis',
    summary: '会员体系发生变化',
    body: '需要先确认是个人订阅还是团队订阅。',
    status: 'session',
    createdAt: 1,
  });

  const entry = useKnowledgeSessionArtifactsStore.getState().artifactsBySession['project-1:session-1'][0];
  assert.equal(entry.title, '影响分析');
  assert.equal(entry.status, 'session');
});

test('knowledge session artifacts store clears one session without touching another', async () => {
  const { useKnowledgeSessionArtifactsStore } = await loadStore();
  const store = useKnowledgeSessionArtifactsStore.getState();

  store.upsertArtifact({
    id: 'artifact-a',
    projectId: 'project-1',
    sessionId: 'session-a',
    title: 'A',
    artifactType: 'candidate-summary',
    summary: 'A',
    body: 'A',
    status: 'session',
    createdAt: 1,
  });
  store.upsertArtifact({
    id: 'artifact-b',
    projectId: 'project-1',
    sessionId: 'session-b',
    title: 'B',
    artifactType: 'candidate-summary',
    summary: 'B',
    body: 'B',
    status: 'session',
    createdAt: 2,
  });

  store.clearSessionArtifacts('project-1', 'session-a');

  assert.equal(useKnowledgeSessionArtifactsStore.getState().artifactsBySession['project-1:session-a']?.length ?? 0, 0);
  assert.equal(useKnowledgeSessionArtifactsStore.getState().artifactsBySession['project-1:session-b'].length, 1);
});
```

- [ ] **Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
node --test tests/ai/ai-chat-store.test.mjs tests/knowledge-session-artifacts-store.test.mjs
```

Expected:

```text
FAIL ... structuredCards is undefined
FAIL ... Cannot find module '../src/features/knowledge/store/knowledgeSessionArtifactsStore.ts'
```

- [ ] **Step 3: Implement the minimal card contract and temporary artifact store**

Create [`src/modules/ai/chat/chatCards.ts`](/c:/Users/Even/Documents/ALL-IN-ONE/src/modules/ai/chat/chatCards.ts):

```ts
export type ChatCardAction = {
  id: string;
  label: string;
  prompt: string;
  tone?: 'default' | 'primary' | 'danger';
};

export type ChatStructuredCard =
  | {
      type: 'summary';
      title: string;
      body: string;
    }
  | {
      type: 'conflict';
      id: string;
      title: string;
      previousLabel: string;
      nextLabel: string;
      sourceTitles: string[];
      status: 'pending' | 'confirmed' | 'dismissed';
    }
  | {
      type: 'temporary-content';
      artifactId: string;
      title: string;
      artifactType: 'impact-analysis' | 'candidate-summary' | 'candidate-structure' | 'prototype-draft' | 'design-draft';
      summary: string;
      body: string;
      status: 'session' | 'promoted' | 'discarded';
    }
  | {
      type: 'next-step';
      title: string;
      actions: ChatCardAction[];
    };
```

Create [`src/features/knowledge/store/knowledgeSessionArtifactsStore.ts`](/c:/Users/Even/Documents/ALL-IN-ONE/src/features/knowledge/store/knowledgeSessionArtifactsStore.ts):

```ts
import { create } from 'zustand';

export type KnowledgeSessionArtifact = {
  id: string;
  projectId: string;
  sessionId: string;
  title: string;
  artifactType: 'impact-analysis' | 'candidate-summary' | 'candidate-structure' | 'prototype-draft' | 'design-draft';
  summary: string;
  body: string;
  status: 'session' | 'promoted' | 'discarded';
  createdAt: number;
};

type KnowledgeSessionArtifactsState = {
  artifactsBySession: Record<string, KnowledgeSessionArtifact[]>;
  activeArtifactIdBySession: Record<string, string | null>;
  upsertArtifact: (artifact: KnowledgeSessionArtifact) => void;
  setActiveArtifact: (projectId: string, sessionId: string, artifactId: string | null) => void;
  setArtifactStatus: (
    projectId: string,
    sessionId: string,
    artifactId: string,
    status: KnowledgeSessionArtifact['status']
  ) => void;
  clearSessionArtifacts: (projectId: string, sessionId: string) => void;
};

const buildSessionKey = (projectId: string, sessionId: string) => `${projectId}:${sessionId}`;

export const useKnowledgeSessionArtifactsStore = create<KnowledgeSessionArtifactsState>((set) => ({
  artifactsBySession: {},
  activeArtifactIdBySession: {},
  upsertArtifact: (artifact) =>
    set((state) => {
      const key = buildSessionKey(artifact.projectId, artifact.sessionId);
      const existing = state.artifactsBySession[key] || [];
      return {
        artifactsBySession: {
          ...state.artifactsBySession,
          [key]: [artifact, ...existing.filter((item) => item.id !== artifact.id)].sort(
            (left, right) => right.createdAt - left.createdAt
          ),
        },
      };
    }),
  setActiveArtifact: (projectId, sessionId, artifactId) =>
    set((state) => ({
      activeArtifactIdBySession: {
        ...state.activeArtifactIdBySession,
        [buildSessionKey(projectId, sessionId)]: artifactId,
      },
    })),
  setArtifactStatus: (projectId, sessionId, artifactId, status) =>
    set((state) => {
      const key = buildSessionKey(projectId, sessionId);
      return {
        artifactsBySession: {
          ...state.artifactsBySession,
          [key]: (state.artifactsBySession[key] || []).map((artifact) =>
            artifact.id === artifactId ? { ...artifact, status } : artifact
          ),
        },
      };
    }),
  clearSessionArtifacts: (projectId, sessionId) =>
    set((state) => {
      const key = buildSessionKey(projectId, sessionId);
      const { [key]: _discard, ...restArtifacts } = state.artifactsBySession;
      const { [key]: _active, ...restActive } = state.activeArtifactIdBySession;
      return {
        artifactsBySession: restArtifacts,
        activeArtifactIdBySession: restActive,
      };
    }),
}));
```

Update [`src/modules/ai/store/aiChatStore.ts`](/c:/Users/Even/Documents/ALL-IN-ONE/src/modules/ai/store/aiChatStore.ts):

```ts
import type { ChatStructuredCard } from '../chat/chatCards';

export type StoredChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tone?: 'default' | 'error';
  structuredCards?: ChatStructuredCard[];
  knowledgeProposal?: KnowledgeProposal;
  projectFileProposal?: ProjectFileProposal;
  createdAt: number;
};
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run:

```bash
node --test tests/ai/ai-chat-store.test.mjs tests/knowledge-session-artifacts-store.test.mjs
```

Expected:

```text
ok 1 - ai chat store keeps assistant structured cards intact
ok 2 - knowledge session artifacts store keeps temporary content per session
ok 3 - knowledge session artifacts store clears one session without touching another
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/ai/chat/chatCards.ts src/features/knowledge/store/knowledgeSessionArtifactsStore.ts src/modules/ai/store/aiChatStore.ts tests/ai/ai-chat-store.test.mjs tests/knowledge-session-artifacts-store.test.mjs
git commit -m "feat: add structured chat cards and session artifact state"
```

### Task 2: Build Knowledge-Truth Reply Helpers

**Files:**
- Create: `src/modules/ai/knowledge/buildKnowledgeTruthReply.ts`
- Modify: `src/modules/ai/knowledge/buildChangeSyncProposal.ts`
- Create: `tests/ai/knowledge-truth-reply-builders.test.mjs`

- [ ] **Step 1: Write the failing reply-builder tests**

Create [`tests/ai/knowledge-truth-reply-builders.test.mjs`](/c:/Users/Even/Documents/ALL-IN-ONE/tests/ai/knowledge-truth-reply-builders.test.mjs):

```js
import assert from 'node:assert/strict';
import test from 'node:test';

test('buildKnowledgeTruthReply orders cards as summary, conflict, temporary content, then next-step', async () => {
  const { buildKnowledgeTruthReply } = await import('../../src/modules/ai/knowledge/buildKnowledgeTruthReply.ts');

  const reply = buildKnowledgeTruthReply({
    summary: '我识别到 2 条变化。',
    conflicts: [
      {
        id: 'conflict-1',
        title: '会员模型冲突',
        previousLabel: '旧知识：个人订阅',
        nextLabel: '新知识：团队订阅',
        sourceTitles: ['旧需求.md', '新需求.md'],
      },
    ],
    temporaryArtifacts: [
      {
        id: 'artifact-1',
        title: '影响分析',
        artifactType: 'impact-analysis',
        summary: '会员体系变化会影响支付和权限。',
        body: '需要同步检查定价、结算和后台权限。',
      },
    ],
    nextSteps: [{ id: 'confirm-conflict', label: '先确认冲突', prompt: '先确认冲突' }],
  });

  assert.equal(reply.content, '我识别到 2 条变化。');
  assert.deepEqual(reply.cards.map((card) => card.type), ['summary', 'conflict', 'temporary-content', 'next-step']);
});

test('buildKnowledgeTruthReply omits missing sections without changing summary-first order', async () => {
  const { buildKnowledgeTruthReply } = await import('../../src/modules/ai/knowledge/buildKnowledgeTruthReply.ts');

  const reply = buildKnowledgeTruthReply({
    summary: '这次只有候选摘要。',
    conflicts: [],
    temporaryArtifacts: [],
    nextSteps: [{ id: 'do-nothing', label: '暂不同步', prompt: '暂不同步' }],
  });

  assert.deepEqual(reply.cards.map((card) => card.type), ['summary', 'next-step']);
});
```

- [ ] **Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
node --test tests/ai/knowledge-truth-reply-builders.test.mjs
```

Expected:

```text
FAIL ... Cannot find module '../../src/modules/ai/knowledge/buildKnowledgeTruthReply.ts'
```

- [ ] **Step 3: Implement the reply builder**

Create [`src/modules/ai/knowledge/buildKnowledgeTruthReply.ts`](/c:/Users/Even/Documents/ALL-IN-ONE/src/modules/ai/knowledge/buildKnowledgeTruthReply.ts):

```ts
import type { ChatCardAction, ChatStructuredCard } from '../chat/chatCards';

type KnowledgeTruthConflict = {
  id: string;
  title: string;
  previousLabel: string;
  nextLabel: string;
  sourceTitles: string[];
};

type KnowledgeTruthTemporaryArtifact = {
  id: string;
  title: string;
  artifactType: 'impact-analysis' | 'candidate-summary' | 'candidate-structure' | 'prototype-draft' | 'design-draft';
  summary: string;
  body: string;
};

type BuildKnowledgeTruthReplyInput = {
  summary: string;
  conflicts: KnowledgeTruthConflict[];
  temporaryArtifacts: KnowledgeTruthTemporaryArtifact[];
  nextSteps: ChatCardAction[];
};

export const buildKnowledgeTruthReply = ({
  summary,
  conflicts,
  temporaryArtifacts,
  nextSteps,
}: BuildKnowledgeTruthReplyInput): { content: string; cards: ChatStructuredCard[] } => {
  const cards: ChatStructuredCard[] = [
    {
      type: 'summary',
      title: '本轮识别结果',
      body: summary,
    },
    ...conflicts.map((conflict) => ({
      type: 'conflict' as const,
      id: conflict.id,
      title: conflict.title,
      previousLabel: conflict.previousLabel,
      nextLabel: conflict.nextLabel,
      sourceTitles: conflict.sourceTitles,
      status: 'pending' as const,
    })),
    ...temporaryArtifacts.map((artifact) => ({
      type: 'temporary-content' as const,
      artifactId: artifact.id,
      title: artifact.title,
      artifactType: artifact.artifactType,
      summary: artifact.summary,
      body: artifact.body,
      status: 'session' as const,
    })),
  ];

  if (nextSteps.length > 0) {
    cards.push({
      type: 'next-step',
      title: '下一步建议',
      actions: nextSteps,
    });
  }

  return {
    content: summary,
    cards,
  };
};
```

Update [`src/modules/ai/knowledge/buildChangeSyncProposal.ts`](/c:/Users/Even/Documents/ALL-IN-ONE/src/modules/ai/knowledge/buildChangeSyncProposal.ts) to keep copy aligned with the new “knowledge first, sync second” flow:

```ts
summary: `AI 已基于最新确认知识整理出 ${docs.length} 份待确认同步内容，请确认后再写入正式知识。`,
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run:

```bash
node --test tests/ai/knowledge-truth-reply-builders.test.mjs tests/knowledge-proposal-builders.test.mjs
```

Expected:

```text
ok 1 - buildKnowledgeTruthReply orders cards as summary, conflict, temporary content, then next-step
ok 2 - buildKnowledgeTruthReply omits missing sections without changing summary-first order
ok ... - existing knowledge proposal builder tests remain green
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/ai/knowledge/buildKnowledgeTruthReply.ts src/modules/ai/knowledge/buildChangeSyncProposal.ts tests/ai/knowledge-truth-reply-builders.test.mjs
git commit -m "feat: add knowledge truth reply builder"
```

### Task 3: Render Structured Cards In The Existing Chat Flow

**Files:**
- Modify: `src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/components/workspace/AIChat.css`
- Modify: `tests/ai/knowledge-proposal-chat-ui.test.mjs`
- Create: `tests/ai/knowledge-truth-chat-ui.test.mjs`

- [ ] **Step 1: Write the failing UI source tests**

Create [`tests/ai/knowledge-truth-chat-ui.test.mjs`](/c:/Users/Even/Documents/ALL-IN-ONE/tests/ai/knowledge-truth-chat-ui.test.mjs):

```js
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const messageListPath = path.resolve(testDir, '../../src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');

test('AIChat renders structured knowledge-truth cards inside the normal chat flow', async () => {
  const chatSource = await readFile(chatPath, 'utf8');
  const messageListSource = await readFile(messageListPath, 'utf8');
  const css = await readFile(cssPath, 'utf8');

  assert.match(messageListSource, /renderStructuredCards/);
  assert.match(chatSource, /chat-structured-card/);
  assert.match(chatSource, /temporary-content/);
  assert.match(chatSource, /setActiveArtifact/);
  assert.match(chatSource, /chat-next-step-action/);
  assert.match(css, /\.chat-structured-card/);
  assert.match(css, /\.chat-structured-card\.conflict/);
  assert.match(css, /\.chat-next-step-action/);
});
```

Extend [`tests/ai/knowledge-proposal-chat-ui.test.mjs`](/c:/Users/Even/Documents/ALL-IN-ONE/tests/ai/knowledge-proposal-chat-ui.test.mjs):

```js
assert.match(chatSource, /structuredCards/);
assert.match(chatSource, /renderStructuredCards/);
```

- [ ] **Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
node --test tests/ai/knowledge-proposal-chat-ui.test.mjs tests/ai/knowledge-truth-chat-ui.test.mjs
```

Expected:

```text
FAIL ... renderStructuredCards
FAIL ... chat-structured-card
```

- [ ] **Step 3: Implement card rendering in the existing chat shell**

Update [`src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx`](/c:/Users/Even/Documents/ALL-IN-ONE/src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx):

```tsx
export const GNAgentMessageList: React.FC<{
  messages: StoredChatMessage[];
  draftContents?: Record<string, string>;
  formatTimestamp: (value: number) => string;
  parseMessageParts: MessagePartsParser;
  renderMessagePart: MessagePartRenderer;
  renderStructuredCards?: (message: StoredChatMessage) => React.ReactNode;
  renderKnowledgeProposal?: (message: StoredChatMessage) => React.ReactNode;
  renderProjectFileProposal?: (message: StoredChatMessage) => React.ReactNode;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  leadingContent?: React.ReactNode;
}> = ({ renderStructuredCards, renderKnowledgeProposal, renderProjectFileProposal, ...props }) => (
  <div className="chat-message-list">
    {props.leadingContent}
    {props.messages.map((message) => {
      const content = props.draftContents?.[message.id] ?? message.content;
      const parts = props.parseMessageParts(content);
      return (
        <article key={message.id} className={`chat-message ${message.role} ${message.tone === 'error' ? 'is-error' : ''}`}>
          <div className="chat-message-bubble">
            <div className="chat-message-content">
              {parts.map((part, index) => props.renderMessagePart(message.id, part, index))}
              {renderStructuredCards ? renderStructuredCards(message) : null}
              {renderKnowledgeProposal ? renderKnowledgeProposal(message) : null}
              {renderProjectFileProposal ? renderProjectFileProposal(message) : null}
            </div>
            <div className="chat-message-meta">{props.formatTimestamp(message.createdAt)}</div>
          </div>
        </article>
      );
    })}
    <div ref={props.messagesEndRef} />
  </div>
);
```

Add to [`src/components/workspace/AIChat.tsx`](/c:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/AIChat.tsx):

```tsx
import type { ChatStructuredCard } from '../../modules/ai/chat/chatCards';
import { useKnowledgeSessionArtifactsStore } from '../../features/knowledge/store/knowledgeSessionArtifactsStore';

const renderStructuredCards = useCallback((message: { structuredCards?: ChatStructuredCard[] }) => {
  if (!message.structuredCards || message.structuredCards.length === 0) {
    return null;
  }

  return (
    <div className="chat-structured-cards">
      {message.structuredCards.map((card, index) => {
        if (card.type === 'summary') {
          return (
            <section key={`${card.type}-${index}`} className="chat-structured-card summary">
              <strong>{card.title}</strong>
              <p>{card.body}</p>
            </section>
          );
        }

        if (card.type === 'conflict') {
          return (
            <section key={card.id} className="chat-structured-card conflict">
              <strong>{card.title}</strong>
              <p>{card.previousLabel}</p>
              <p>{card.nextLabel}</p>
              <small>{card.sourceTitles.join(' / ')}</small>
            </section>
          );
        }

        if (card.type === 'temporary-content') {
          return (
            <section key={card.artifactId} className="chat-structured-card temporary-content">
              <strong>{card.title}</strong>
              <p>{card.summary}</p>
              <button type="button" onClick={() => setActiveArtifact(currentProject.id, activeSessionId, card.artifactId)}>
                在中间查看
              </button>
            </section>
          );
        }

        return (
          <section key={`${card.type}-${index}`} className="chat-structured-card next-step">
            <strong>{card.title}</strong>
            <div className="chat-next-step-actions">
              {card.actions.map((action) => (
                <button key={action.id} type="button" className="chat-next-step-action" onClick={() => setInput(action.prompt)}>
                  {action.label}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}, [activeSessionId, currentProject?.id, setActiveArtifact, setInput]);
```

Add the corresponding classes to [`src/components/workspace/AIChat.css`](/c:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/AIChat.css):

```css
.chat-structured-cards {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.chat-structured-card {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--mode-border, rgba(255, 255, 255, 0.08));
  background: color-mix(in srgb, var(--mode-panel-alt, rgba(255, 255, 255, 0.06)) 92%, transparent);
}

.chat-structured-card.conflict {
  border-color: color-mix(in srgb, var(--mode-warning, #f59e0b) 40%, transparent);
}

.chat-next-step-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chat-next-step-action {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--mode-border, rgba(255, 255, 255, 0.1));
  background: color-mix(in srgb, var(--mode-panel, rgba(10, 14, 21, 0.96)) 78%, transparent);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run:

```bash
node --test tests/ai/knowledge-proposal-chat-ui.test.mjs tests/ai/knowledge-truth-chat-ui.test.mjs
```

Expected:

```text
ok 1 - AIChat exposes knowledge proposal controls in assistant messages
ok 2 - AIChat renders structured knowledge-truth cards inside the normal chat flow
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx src/components/workspace/AIChat.tsx src/components/workspace/AIChat.css tests/ai/knowledge-proposal-chat-ui.test.mjs tests/ai/knowledge-truth-chat-ui.test.mjs
git commit -m "feat: render structured knowledge truth cards in chat"
```

### Task 4: Wire Temporary Content Into The Center Workspace And Promotion Flow

**Files:**
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Modify: `src/modules/ai/knowledge/buildChangeSyncProposal.ts`
- Modify: `tests/knowledge-note-workspace.test.mjs`
- Create: `tests/product-workbench-knowledge-truth-ui.test.mjs`

- [ ] **Step 1: Write the failing workbench tests**

Create [`tests/product-workbench-knowledge-truth-ui.test.mjs`](/c:/Users/Even/Documents/ALL-IN-ONE/tests/product-workbench-knowledge-truth-ui.test.mjs):

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const productPath = path.resolve(__dirname, '../src/components/product/ProductWorkbench.tsx');
const noteWorkspacePath = path.resolve(__dirname, '../src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx');

test('product workbench reads active session artifacts and passes a temporary preview into the knowledge workspace', async () => {
  const productSource = await readFile(productPath, 'utf8');
  const noteSource = await readFile(noteWorkspacePath, 'utf8');

  assert.match(productSource, /useKnowledgeSessionArtifactsStore/);
  assert.match(productSource, /activeTemporaryArtifact/);
  assert.match(noteSource, /temporaryContentPreview\?:/);
  assert.match(noteSource, /gn-note-temporary-preview/);
});
```

Extend [`tests/knowledge-note-workspace.test.mjs`](/c:/Users/Even/Documents/ALL-IN-ONE/tests/knowledge-note-workspace.test.mjs):

```js
assert.match(noteSource, /temporaryContentPreview\?:/);
assert.match(noteSource, /gn-note-temporary-preview/);
assert.match(css, /\.gn-note-temporary-preview/);
```

- [ ] **Step 2: Run the targeted tests and confirm they fail**

Run:

```bash
node --test tests/knowledge-note-workspace.test.mjs tests/product-workbench-knowledge-truth-ui.test.mjs
```

Expected:

```text
FAIL ... temporaryContentPreview
FAIL ... gn-note-temporary-preview
```

- [ ] **Step 3: Implement the preview handoff and promotion hook**

Update [`src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx`](/c:/Users/Even/Documents/ALL-IN-ONE/src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx):

```tsx
type KnowledgeNoteWorkspaceProps = {
  notes: KnowledgeNote[];
  filteredNotes: KnowledgeNote[];
  diskItems: KnowledgeDiskItem[];
  selectedNote: KnowledgeNote | null;
  activeFilter: KnowledgeNoteFilter;
  projectRootPath?: string | null;
  titleValue: string;
  mirrorSourcePath?: string | null;
  editorValue: string;
  editable: boolean;
  isSaving: boolean;
  saveMessage: string;
  canSave: boolean;
  searchValue: string;
  isSearching: boolean;
  isSyncing: boolean;
  error: string | null;
  onSearchChange: (value: string) => void;
  onSelectNote: (noteId: string) => void;
  onTitleChange: (value: string) => void;
  onEditorChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onOrganizeKnowledge: () => void;
  onCreateNote: () => void;
  onCreateNoteAtPath: (relativeDirectory: string | null) => void;
  onCreateFolderAtPath: (relativeDirectory: string | null) => void;
  onRenameTreePath: (relativePath: string, isFolder: boolean) => void;
  onDeleteTreePaths: (relativePaths: string[] | string, isFolder: boolean | null) => void;
  onRefreshFilesystem: () => void;
  onFilterChange: (filter: KnowledgeNoteFilter) => void;
  onOpenAttachment: (attachmentPath: string) => void;
  temporaryContentPreview?: {
    title: string;
    artifactType: string;
    summary: string;
    body: string;
  } | null;
};
```

Render the preview above the editor column:

```tsx
{temporaryContentPreview ? (
  <section className="gn-note-temporary-preview">
    <div className="gn-note-temporary-preview-head">
      <strong>{temporaryContentPreview.title}</strong>
      <span>{temporaryContentPreview.artifactType}</span>
    </div>
    <p>{temporaryContentPreview.summary}</p>
    <pre>{temporaryContentPreview.body}</pre>
  </section>
) : null}
```

Update [`src/components/product/ProductWorkbench.tsx`](/c:/Users/Even/Documents/ALL-IN-ONE/src/components/product/ProductWorkbench.tsx):

```tsx
import { useKnowledgeSessionArtifactsStore } from '../../features/knowledge/store/knowledgeSessionArtifactsStore';

const { activeTemporaryArtifact, clearActiveTemporaryArtifact } = useMemo(() => {
  const key = currentProject && activeSessionId ? `${currentProject.id}:${activeSessionId}` : null;
  const artifacts = key ? sessionArtifactsBySession[key] || [] : [];
  const activeId = key ? activeArtifactIdBySession[key] : null;
  return {
    activeTemporaryArtifact: artifacts.find((artifact) => artifact.id === activeId) || null,
    clearActiveTemporaryArtifact: () => {
      if (currentProject && activeSessionId) {
        setActiveArtifact(currentProject.id, activeSessionId, null);
      }
    },
  };
}, [activeArtifactIdBySession, activeSessionId, currentProject, sessionArtifactsBySession, setActiveArtifact]);
```

Pass it through:

```tsx
<KnowledgeNoteWorkspace
  notes={knowledgeNotes}
  filteredNotes={filteredKnowledgeNotes}
  diskItems={knowledgeDiskItems}
  selectedNote={selectedKnowledgeNote}
  activeFilter={knowledgeNoteFilter}
  projectRootPath={projectRootDir}
  titleValue={knowledgeTitleValue}
  mirrorSourcePath={selectedKnowledgeNote?.filePath || null}
  editorValue={knowledgeEditorValue}
  editable={Boolean(currentProject)}
  isSaving={isSavingKnowledgeNote}
  saveMessage={knowledgeSaveMessage}
  canSave={canSaveKnowledgeNote}
  searchValue={knowledgeSearchValue}
  isSearching={isSearchingKnowledge}
  isSyncing={isRefreshingKnowledge}
  error={knowledgeError}
  onSearchChange={setKnowledgeSearchValue}
  onSelectNote={handleSelectKnowledgeNote}
  onTitleChange={setKnowledgeTitleValue}
  onEditorChange={setKnowledgeEditorValue}
  onSave={() => void handleSaveKnowledgeNote()}
  onDelete={() => handleRequestDeleteKnowledgeNote()}
  onOrganizeKnowledge={() => void handleOrganizeKnowledge()}
  onCreateNote={() => void handleCreateKnowledgeNote()}
  onCreateNoteAtPath={handleCreateKnowledgeNoteAtPath}
  onCreateFolderAtPath={handleCreateKnowledgeFolderAtPath}
  onRenameTreePath={handleRenameKnowledgeTreePath}
  onDeleteTreePaths={handleDeleteKnowledgeTreePaths}
  onRefreshFilesystem={() => void refreshKnowledgeFilesystem()}
  onFilterChange={setKnowledgeNoteFilter}
  onOpenAttachment={handleOpenKnowledgeAttachment}
  temporaryContentPreview={
    activeTemporaryArtifact
      ? {
          title: activeTemporaryArtifact.title,
          artifactType: activeTemporaryArtifact.artifactType,
          summary: activeTemporaryArtifact.summary,
          body: activeTemporaryArtifact.body,
        }
      : null
  }
/>
```

Update [`src/components/workspace/AIChat.tsx`](/c:/Users/Even/Documents/ALL-IN-ONE/src/components/workspace/AIChat.tsx) so “采纳为正式内容” converts the active temporary artifact into a standard `KnowledgeProposal` using the existing proposal machinery:

```tsx
const promoteTemporaryArtifact = useCallback((artifact: KnowledgeSessionArtifact) => {
  const proposal = buildKnowledgeProposal({
    projectId: currentProject.id,
    trigger: 'change-sync',
    summary: `已从会话临时内容生成待确认知识：${artifact.title}`,
    operations: [
      {
        type: 'create_note',
        targetTitle: `${artifact.title}.md`,
        reason: artifact.summary,
        evidence: [artifact.title],
        draftContent: artifact.body,
        riskLevel: 'low',
      },
    ],
  });

  appendMessage(currentProject.id, activeSessionId, {
    ...createStoredChatMessage('assistant', `我已把“${artifact.title}”转成待确认知识提案。`),
    knowledgeProposal: proposal,
  });
}, [activeSessionId, appendMessage, currentProject.id]);
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run:

```bash
node --test tests/knowledge-note-workspace.test.mjs tests/product-workbench-knowledge-truth-ui.test.mjs tests/ai/knowledge-proposal-chat-ui.test.mjs
```

Expected:

```text
All three test files finish with `ok` entries and the process exits with code 0.
```

- [ ] **Step 5: Commit**

```bash
git add src/components/product/ProductWorkbench.tsx src/features/knowledge/workspace/KnowledgeNoteWorkspace.tsx src/components/workspace/AIChat.tsx src/modules/ai/knowledge/buildChangeSyncProposal.ts tests/knowledge-note-workspace.test.mjs tests/product-workbench-knowledge-truth-ui.test.mjs
git commit -m "feat: preview and promote session temporary knowledge content"
```

### Task 5: Run Full Verification And Clean Up Scope Drift

**Files:**
- Test: `tests/ai/ai-chat-store.test.mjs`
- Test: `tests/ai/knowledge-proposal-chat-ui.test.mjs`
- Test: `tests/ai/knowledge-truth-chat-ui.test.mjs`
- Test: `tests/ai/knowledge-truth-reply-builders.test.mjs`
- Test: `tests/knowledge-session-artifacts-store.test.mjs`
- Test: `tests/knowledge-note-workspace.test.mjs`
- Test: `tests/product-workbench-knowledge-truth-ui.test.mjs`
- Test: `tests/ai/knowledge-organize-lane.test.mjs`
- Test: `tests/knowledge-proposal-builders.test.mjs`

- [ ] **Step 1: Run the focused regression suite**

Run:

```bash
node --test tests/ai/ai-chat-store.test.mjs tests/ai/knowledge-proposal-chat-ui.test.mjs tests/ai/knowledge-truth-chat-ui.test.mjs tests/ai/knowledge-truth-reply-builders.test.mjs tests/knowledge-session-artifacts-store.test.mjs tests/knowledge-note-workspace.test.mjs tests/product-workbench-knowledge-truth-ui.test.mjs tests/ai/knowledge-organize-lane.test.mjs tests/knowledge-proposal-builders.test.mjs
```

Expected:

```text
The focused regression suite prints only `ok` lines and exits with code 0.
```

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected:

```text
The build prints a `vite v` header, ends with a `built in` success line, and exits with code 0.
```

- [ ] **Step 3: Check for accidental scope drift**

Verify with:

```bash
git diff --stat
```

Expected:

```text
Only AI chat, knowledge proposal, knowledge session artifact, and workspace preview files changed.
```

- [ ] **Step 4: Commit the final verification pass**

```bash
git add .
git commit -m "test: verify knowledge truth ai workbench flow"
```

- [ ] **Step 5: Prepare execution handoff notes**

Write this summary into the task handoff or PR description:

```text
Implemented the knowledge-truth MVP on top of the existing AIChat shell.
Structured assistant cards now support summary, conflict, temporary content, and next-step messages.
Temporary content stays session-scoped until the user previews and promotes it into a normal knowledge proposal.
```
