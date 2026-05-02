import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const chatPagePath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/GNAgentChatPage.tsx',
);
const memoryInboxPath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/GNAgentMemoryInbox.tsx',
);
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const runtimeStorePath = path.resolve(__dirname, '../../src/modules/ai/runtime/agentRuntimeStore.ts');

const loadExtractor = async () =>
  import(`../../src/modules/ai/runtime/memory/extractMemoryCandidates.ts?test=${Date.now()}`);
const loadRuntimeStore = async () =>
  import(`../../src/modules/ai/runtime/agentRuntimeStore.ts?test=${Date.now()}`);

test('extractMemoryCandidates extracts user preferences and project facts deterministically', async () => {
  const { extractMemoryCandidates } = await loadExtractor();

  const candidates = extractMemoryCandidates({
    threadId: 'thread-memory',
    userInput: '以后回答短一点。项目事实：Agent 要优先使用本地 Tauri 持久化。',
    assistantContent: '收到，我会记住这个项目事实和偏好。',
  });

  assert.ok(candidates.some((candidate) => candidate.kind === 'userPreference'));
  assert.ok(candidates.some((candidate) => candidate.kind === 'projectFact'));
  assert.ok(candidates.every((candidate) => candidate.threadId === 'thread-memory'));
  assert.ok(candidates.every((candidate) => candidate.status === 'pending'));
  assert.ok(candidates.every((candidate) => candidate.id && candidate.title && candidate.summary));
});

test('agent runtime store tracks memory candidates by thread and resolves status', async () => {
  const { useAgentRuntimeStore } = await loadRuntimeStore();
  const store = useAgentRuntimeStore.getState();

  store.setThreadMemoryCandidates('thread-memory', [
    {
      id: 'memory-candidate-1',
      threadId: 'thread-memory',
      title: '回答偏好',
      summary: '以后回答短一点',
      content: '以后回答短一点',
      kind: 'userPreference',
      status: 'pending',
      createdAt: 10,
    },
  ]);
  store.resolveMemoryCandidate('thread-memory', 'memory-candidate-1', 'saved');

  const candidates = useAgentRuntimeStore.getState().memoryCandidatesByThread['thread-memory'];
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].status, 'saved');
});

test('agent runtime store preserves existing pending candidates when later extraction is empty', async () => {
  const { useAgentRuntimeStore } = await loadRuntimeStore();
  const store = useAgentRuntimeStore.getState();

  store.setThreadMemoryCandidates('thread-empty-merge', [
    {
      id: 'memory-candidate-keep',
      threadId: 'thread-empty-merge',
      title: 'Preference',
      summary: 'Answer briefly',
      content: 'Answer briefly',
      kind: 'userPreference',
      status: 'pending',
      createdAt: 10,
    },
  ]);
  store.setThreadMemoryCandidates('thread-empty-merge', []);

  const candidates = useAgentRuntimeStore.getState().memoryCandidatesByThread['thread-empty-merge'];
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, 'memory-candidate-keep');
  assert.equal(candidates[0].status, 'pending');
});

test('agent runtime store upserts memory candidates without resetting resolved status', async () => {
  const { useAgentRuntimeStore } = await loadRuntimeStore();
  const store = useAgentRuntimeStore.getState();
  const candidate = {
    id: 'memory-candidate-resolved',
    threadId: 'thread-status-merge',
    title: 'Preference',
    summary: 'Answer briefly',
    content: 'Answer briefly',
    kind: 'userPreference',
    status: 'pending',
    createdAt: 10,
  };

  store.setThreadMemoryCandidates('thread-status-merge', [candidate]);
  store.resolveMemoryCandidate('thread-status-merge', candidate.id, 'dismissed');
  store.setThreadMemoryCandidates('thread-status-merge', [{ ...candidate, createdAt: 20 }]);

  const candidates = useAgentRuntimeStore.getState().memoryCandidatesByThread['thread-status-merge'];
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].status, 'dismissed');
  assert.equal(candidates[0].createdAt, 20);
});

test('extractMemoryCandidates avoids broad false positives', async () => {
  const { extractMemoryCandidates } = await loadExtractor();

  const genericFuture = extractMemoryCandidates({
    threadId: 'thread-false-positive',
    userInput: '\u8fd9\u4e2a\u4ee5\u540e\u518d\u8bf4',
    assistantContent: '',
  });
  const assistantOnlyFact = extractMemoryCandidates({
    threadId: 'thread-false-positive',
    userInput: '\u8bf7\u603b\u7ed3\u4e00\u4e0b',
    assistantContent: '\u9879\u76ee\u4e8b\u5b9e\uff1aAgent \u8981\u4f18\u5148\u4f7f\u7528 Tauri',
  });

  assert.equal(genericFuture.some((candidate) => candidate.kind === 'userPreference'), false);
  assert.equal(assistantOnlyFact.some((candidate) => candidate.kind === 'projectFact'), false);
});

test('resolveMemoryCandidate only affects the target thread', async () => {
  const { useAgentRuntimeStore } = await loadRuntimeStore();
  const store = useAgentRuntimeStore.getState();
  const candidate = {
    id: 'shared-candidate-id',
    title: 'Preference',
    summary: 'Answer briefly',
    content: 'Answer briefly',
    kind: 'userPreference',
    status: 'pending',
    createdAt: 10,
  };

  store.setThreadMemoryCandidates('thread-target', [{ ...candidate, threadId: 'thread-target' }]);
  store.setThreadMemoryCandidates('thread-other', [{ ...candidate, threadId: 'thread-other' }]);
  store.resolveMemoryCandidate('thread-target', candidate.id, 'saved');

  const state = useAgentRuntimeStore.getState();
  assert.equal(state.memoryCandidatesByThread['thread-target'][0].status, 'saved');
  assert.equal(state.memoryCandidatesByThread['thread-other'][0].status, 'pending');
});

test('GN agent memory inbox source exposes pending review actions', async () => {
  const source = await readFile(memoryInboxPath, 'utf8');

  assert.match(source, /Memory Inbox/);
  assert.match(source, /pending/);
  assert.match(source, /onSave/);
  assert.match(source, /onDismiss/);
  assert.match(source, /保存/);
  assert.match(source, /忽略/);
});

test('GN agent chat page wires memory inbox to active session candidates', async () => {
  const source = await readFile(chatPagePath, 'utf8');

  assert.match(source, /GNAgentMemoryInbox/);
  assert.match(source, /memoryCandidatesByThread\[activeSessionId\]/);
  assert.match(source, /saveProjectMemoryEntry/);
  assert.match(source, /listProjectMemoryEntries/);
  assert.match(source, /setMemoryEntries\(\s*currentProject\.id/);
  assert.match(source, /resolveMemoryCandidate\(activeSessionId/);
});

test('AI chat produces memory candidates after final assistant content', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /extractMemoryCandidates/);
  assert.match(source, /setThreadMemoryCandidates/);
  assert.match(source, /setThreadMemoryCandidates\(targetSessionId, candidates\)/);
});

test('AI chat wires built-in agent turns to the kernel and tool call store', async () => {
  const source = await readFile(aiChatPath, 'utf8');

  assert.match(source, /runAgentTurn/);
  assert.match(source, /ToolExecutor/);
  assert.match(source, /setThreadToolCalls/);
  assert.match(source, /onToolCallsChange:\s*\(toolCalls\)/);
  assert.match(source, /setThreadToolCalls\(targetSessionId, toolCalls\)/);
  assert.match(source, /allowedTools:\s*READ_ONLY_CHAT_TOOLS/);
});

test('agent runtime store exports AgentMemoryCandidate lifecycle fields', async () => {
  const source = await readFile(runtimeStorePath, 'utf8');

  assert.match(source, /AgentMemoryCandidate/);
  assert.match(source, /memoryCandidatesByThread/);
  assert.match(source, /setThreadMemoryCandidates/);
  assert.match(source, /resolveMemoryCandidate/);
  assert.match(source, /'projectFact' \| 'userPreference'/);
  assert.match(source, /'pending' \| 'saved' \| 'dismissed'/);
});
