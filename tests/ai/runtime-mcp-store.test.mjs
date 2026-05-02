import assert from 'node:assert/strict';
import test from 'node:test';

const loadStore = async () =>
  import(`../../src/modules/ai/runtime/mcp/runtimeMcpStore.ts?test=${Date.now()}`);

test('runtime mcp store tracks server state and tool call history', async () => {
  const { useRuntimeMcpStore } = await loadStore();
  const store = useRuntimeMcpStore.getState();

  store.upsertServer({
    id: 'goodnight-skills',
    name: 'GoodNight Skills',
    status: 'connected',
    transport: 'builtin',
    description: 'Expose local GoodNight skills as MCP tools.',
    enabled: true,
    toolNames: ['list-skills'],
  });
  store.setToolCalls('thread-1', [
    {
      id: 'call-0',
      threadId: 'thread-1',
      serverId: 'goodnight-skills',
      toolName: 'list-skills',
      status: 'completed',
      summary: 'Listed 4 skills',
      resultPreview: 'knowledge-organize',
      argumentsText: '',
      startedAt: 10,
      completedAt: 20,
      error: null,
    },
  ]);
  store.appendToolCall('thread-1', {
    id: 'call-1',
    threadId: 'thread-1',
    serverId: 'goodnight-skills',
    toolName: 'list-skills',
    status: 'completed',
    summary: 'Listed 5 skills',
    resultPreview: 'requirements',
    argumentsText: '',
    startedAt: 30,
    completedAt: 40,
    error: null,
  });

  assert.equal(useRuntimeMcpStore.getState().servers[0].transport, 'builtin');
  assert.deepEqual(useRuntimeMcpStore.getState().servers[0].toolNames, ['list-skills']);
  assert.equal(useRuntimeMcpStore.getState().toolCallsByThread['thread-1'].length, 2);
  assert.equal(useRuntimeMcpStore.getState().toolCallsByThread['thread-1'][1].summary, 'Listed 5 skills');
});
