import assert from 'node:assert/strict';
import test from 'node:test';

const loadMcpFlow = async () =>
  import(`../../src/modules/ai/runtime/mcp/runtimeMcpFlow.ts?test=${Date.now()}`);

test('runtime mcp flow parses commands, validates targets, and formats results', async () => {
  const {
    DEFAULT_RUNTIME_MCP_SERVER_ID,
    parseRuntimeMcpCommand,
    formatRuntimeMcpToolCallResult,
    buildRuntimeMcpReplayPayload,
    executeRuntimeMcpCommand,
  } = await loadMcpFlow();

  const servers = [
    {
      id: 'goodnight-skills',
      name: 'GoodNight Skills',
      status: 'connected',
      transport: 'builtin',
      description: 'Built-in MCP server',
      enabled: true,
      toolNames: ['list-skills'],
    },
    {
      id: 'custom-server',
      name: 'Custom Server',
      status: 'connected',
      transport: 'stdio',
      description: 'External MCP server',
      enabled: true,
      toolNames: ['inspect'],
    },
  ];

  assert.equal(DEFAULT_RUNTIME_MCP_SERVER_ID, 'goodnight-skills');
  assert.deepEqual(parseRuntimeMcpCommand('@mcp', servers), {
    serverId: 'goodnight-skills',
    toolName: 'list-skills',
    argumentsText: '',
  });
  assert.deepEqual(parseRuntimeMcpCommand('@mcp inspect src', servers), {
    serverId: 'goodnight-skills',
    toolName: 'inspect',
    argumentsText: 'src',
  });
  assert.deepEqual(parseRuntimeMcpCommand('@mcp custom-server inspect src', servers), {
    serverId: 'custom-server',
    toolName: 'inspect',
    argumentsText: 'src',
  });
  assert.equal(parseRuntimeMcpCommand('hello', servers), null);

  const missingServer = await executeRuntimeMcpCommand({
    command: {
      serverId: 'missing',
      toolName: 'list-skills',
      argumentsText: '',
    },
    servers,
    threadId: 'thread-1',
    invokeTool: async () => {
      throw new Error('should not execute');
    },
  });
  assert.deepEqual(missingServer, {
    status: 'failed',
    message: 'MCP server 不存在：missing',
  });

  const missingTool = await executeRuntimeMcpCommand({
    command: {
      serverId: 'custom-server',
      toolName: 'list-skills',
      argumentsText: '',
    },
    servers,
    threadId: 'thread-1',
    invokeTool: async () => {
      throw new Error('should not execute');
    },
  });
  assert.deepEqual(missingTool, {
    status: 'failed',
    message: 'MCP tool 不存在：custom-server/list-skills',
  });

  const success = await executeRuntimeMcpCommand({
    command: {
      serverId: 'goodnight-skills',
      toolName: 'list-skills',
      argumentsText: '',
    },
    servers,
    threadId: 'thread-2',
    invokeTool: async ({ threadId, serverId, toolName, argumentsText }) => ({
      id: 'call-1',
      threadId,
      serverId,
      toolName,
      status: 'completed',
      summary: 'Listed 3 skills',
      resultPreview: 'requirements\nprototype\npage',
      argumentsText: argumentsText || '',
      startedAt: 10,
      completedAt: 11,
      error: null,
    }),
  });

  assert.equal(success.status, 'completed');
  if (success.status === 'completed' || success.status === 'error') {
    assert.equal(
      formatRuntimeMcpToolCallResult(success.toolCall),
      'MCP goodnight-skills/list-skills\n\nListed 3 skills\n\nrequirements\nprototype\npage',
    );
    assert.equal(buildRuntimeMcpReplayPayload(success.toolCall), 'goodnight-skills/list-skills: Listed 3 skills');
  }
});
