import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiChatPath = path.resolve(__dirname, '../../src/components/workspace/AIChat.tsx');
const agentWorkbenchSessionPath = path.resolve(
  __dirname,
  '../../src/components/ai/gn-agent-shell/useGNAgentWorkbenchSession.ts',
);
const bridgePath = path.resolve(
  __dirname,
  '../../src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts',
);

test('AIChat routes bound session deletion through the runtime sidecar bridge', async () => {
  const [chatSource, bridgeSource] = await Promise.all([
    readFile(aiChatPath, 'utf8'),
    readFile(bridgePath, 'utf8'),
  ]);

  assert.match(bridgeSource, /export const deleteRuntimeSidecarSession = async/);
  assert.match(chatSource, /deleteRuntimeSidecarSession\(/);
  assert.doesNotMatch(
    chatSource,
    /onDeleteSession=\{\(sessionId\)\s*=>\s*\{[\s\S]*removeSession\(currentProject\.id,\s*sessionId\)/,
  );
});

test('GN Agent workbench deletion also routes bound sessions through the runtime sidecar bridge', async () => {
  const source = await readFile(agentWorkbenchSessionPath, 'utf8');

  assert.match(source, /deleteRuntimeSidecarSession/);
  assert.match(
    source,
    /void deleteRuntimeSidecarSession\(\{[\s\S]*projectId:\s*currentProject\.id,[\s\S]*sessionId:\s*threadId,[\s\S]*runtimeThreadId:/,
  );
  assert.doesNotMatch(
    source,
    /const deleteSession = useCallback\([\s\S]*removeSession\(currentProject\.id,\s*threadId\);[\s\S]*\[/,
  );
});

test('AIChat does not render a fake persisted "新对话" title when all sessions are deleted', async () => {
  const chatSource = await readFile(aiChatPath, 'utf8');

  assert.match(chatSource, /const activeSessionTitle =/);
  assert.match(chatSource, /暂无对话/);
  assert.match(chatSource, /暂无历史对话/);
  assert.match(chatSource, /leadingContent=\{emptyConversationLeadingContent\}/);
  assert.doesNotMatch(
    chatSource,
    /<strong>\{isCollapsed && !lockExpandedForEmbedded \? 'GN' : activeSession\?\.title \|\| '新对话'\}<\/strong>/,
  );
});
