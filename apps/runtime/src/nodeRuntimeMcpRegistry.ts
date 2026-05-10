import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type RuntimeMcpDeleteResult,
  type RuntimeMcpServerRecord,
  type RuntimeMcpToolCallRecord,
  type RuntimeMcpToolInvokeInput,
} from '@goodnight/runtime-protocol';
import { getSystemRuntimeSkillDefinitions } from '../../../src/modules/ai/skills/skillLibrary.ts';

const MCP_STORE_FILE = 'runtime-mcp.json';
const GOODNIGHT_SKILLS_SERVER_ID = 'goodnight-skills';
const GOODNIGHT_SKILLS_TOOL_NAME = 'list-skills';

type NodeRuntimeMcpStore = {
  servers: RuntimeMcpServerRecord[];
  toolCalls: RuntimeMcpToolCallRecord[];
};

const createEmptyStore = (): NodeRuntimeMcpStore => ({
  servers: [],
  toolCalls: [],
});

const getMcpStorePath = (dataDir: string) => path.join(dataDir, MCP_STORE_FILE);

const loadStore = async (dataDir: string): Promise<NodeRuntimeMcpStore> => {
  await mkdir(dataDir, { recursive: true });
  try {
    const file = await readFile(getMcpStorePath(dataDir), 'utf8');
    const parsed = JSON.parse(file) as Partial<NodeRuntimeMcpStore>;
    return {
      servers: Array.isArray(parsed.servers) ? parsed.servers : [],
      toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls : [],
    };
  } catch {
    return createEmptyStore();
  }
};

const saveStore = async (dataDir: string, store: NodeRuntimeMcpStore) => {
  await writeFile(getMcpStorePath(dataDir), JSON.stringify(store, null, 2), 'utf8');
};

const buildDefaultServer = (): RuntimeMcpServerRecord => ({
  id: GOODNIGHT_SKILLS_SERVER_ID,
  name: 'GoodNight Skills',
  status: 'connected',
  transport: 'builtin',
  description: 'Expose GoodNight local skills as a built-in MCP server.',
  enabled: true,
  toolNames: [GOODNIGHT_SKILLS_TOOL_NAME],
  command: null,
  args: [],
  env: {},
  url: null,
  headers: {},
  headersHelper: null,
  oauth: null,
  tools: [
    {
      name: GOODNIGHT_SKILLS_TOOL_NAME,
      description: 'List the currently discoverable GoodNight skills.',
      requiresApproval: false,
    },
  ],
});

const buildSkillListPreview = () => {
  const skills = getSystemRuntimeSkillDefinitions();
  return {
    summary: `Listed ${skills.length} GoodNight skills`,
    resultPreview: skills.length > 0
      ? skills.map((skill) => `- ${skill.id} (${skill.name})`).join('\n')
      : 'No skills discovered.',
  };
};

const parseToolExecutionOutput = (
  output: string,
  fallbackSummary: string,
) => {
  const trimmed = output.trim();
  if (!trimmed) {
    return {
      summary: fallbackSummary,
      resultPreview: '',
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      summary?: unknown;
      resultPreview?: unknown;
    };
    return {
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : fallbackSummary,
      resultPreview:
        typeof parsed.resultPreview === 'string' ? parsed.resultPreview.trim() : trimmed,
    };
  } catch {
    return {
      summary: fallbackSummary,
      resultPreview: trimmed,
    };
  }
};

const parseSsePayload = (body: string) => {
  const events = body
    .split(/\r?\n\r?\n/)
    .map((chunk) =>
      chunk
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
        .trim(),
    )
    .filter(Boolean)
    .filter((value) => value !== '[DONE]');

  return events.at(-1) || '';
};

const updateStoredServerStatus = async (
  dataDir: string,
  serverId: string,
  status: RuntimeMcpServerRecord['status'],
) => {
  if (serverId === GOODNIGHT_SKILLS_SERVER_ID) {
    return;
  }

  const store = await loadStore(dataDir);
  const target = store.servers.find((server) => server.id === serverId);
  if (!target || target.status === status) {
    return;
  }

  target.status = status;
  await saveStore(dataDir, store);
};

const executeStdioTool = async (input: {
  server: RuntimeMcpServerRecord;
  toolName: string;
  argumentsText: string;
}) =>
  new Promise<{ summary: string; resultPreview: string }>((resolve, reject) => {
    if (!input.server.command) {
      reject(new Error(`Runtime MCP stdio server is missing command: ${input.server.id}`));
      return;
    }

    const child = spawn(input.server.command, input.server.args || [], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...(input.server.env || {}),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`Runtime MCP stdio tool timed out: ${input.server.id}/${input.toolName}`));
    }, 60_000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);

      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() ||
              stdout.trim() ||
              `Runtime MCP stdio tool exited with code ${String(code)}: ${input.server.id}/${input.toolName}`,
          ),
        );
        return;
      }

      const output = stdout.trim();
      resolve(parseToolExecutionOutput(output, `Completed ${input.server.id}/${input.toolName}`));
    });

    child.stdin.end(
      JSON.stringify({
        serverId: input.server.id,
        toolName: input.toolName,
        argumentsText: input.argumentsText,
      }),
    );
  });

const executeRemoteTool = async (input: {
  server: RuntimeMcpServerRecord;
  toolName: string;
  argumentsText: string;
}) => {
  if (!input.server.url) {
    throw new Error(`Runtime MCP remote server is missing url: ${input.server.id}`);
  }

  const response = await fetch(input.server.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(input.server.headers || {}),
    },
    body: JSON.stringify({
      serverId: input.server.id,
      toolName: input.toolName,
      argumentsText: input.argumentsText,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(body.trim() || `Runtime MCP remote tool failed: ${input.server.id}/${input.toolName}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('text/event-stream') ? parseSsePayload(body) : body;
  return parseToolExecutionOutput(payload, `Completed ${input.server.id}/${input.toolName}`);
};

export class NodeRuntimeMcpRegistry {
  private readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  async listServers() {
    const store = await loadStore(this.dataDir);
    return [
      buildDefaultServer(),
      ...store.servers.filter((server) => server.id !== GOODNIGHT_SKILLS_SERVER_ID),
    ];
  }

  async upsertServer(input: RuntimeMcpServerRecord) {
    if (input.id === GOODNIGHT_SKILLS_SERVER_ID) {
      return buildDefaultServer();
    }

    const store = await loadStore(this.dataDir);
    const server: RuntimeMcpServerRecord = {
      ...input,
      toolNames: [...input.toolNames],
      tools: input.tools ? input.tools.map((tool) => ({ ...tool })) : undefined,
      args: input.args ? [...input.args] : [],
      env: input.env ? { ...input.env } : {},
      headers: input.headers ? { ...input.headers } : {},
      oauth: input.oauth ? { ...input.oauth } : null,
    };
    store.servers = [...store.servers.filter((item) => item.id !== server.id), server];
    await saveStore(this.dataDir, store);
    return server;
  }

  async deleteServer(id: string): Promise<RuntimeMcpDeleteResult> {
    if (id === GOODNIGHT_SKILLS_SERVER_ID) {
      throw new Error('The built-in GoodNight Skills MCP server cannot be deleted.');
    }

    const store = await loadStore(this.dataDir);
    const nextServers = store.servers.filter((server) => server.id !== id);
    const deleted = nextServers.length !== store.servers.length;
    if (deleted) {
      store.servers = nextServers;
      await saveStore(this.dataDir, store);
    }

    return {
      id,
      deleted,
    };
  }

  async listToolCalls(threadId: string) {
    const store = await loadStore(this.dataDir);
    return store.toolCalls
      .filter((toolCall) => toolCall.threadId === threadId)
      .sort((left, right) => left.startedAt - right.startedAt);
  }

  async invokeTool(input: RuntimeMcpToolInvokeInput): Promise<RuntimeMcpToolCallRecord> {
    const servers = await this.listServers();
    const server = servers.find((item) => item.id === input.serverId) || null;
    if (!server) {
      throw new Error(`Runtime MCP server not found: ${input.serverId}`);
    }

    if (server.toolNames.length > 0 && !server.toolNames.includes(input.toolName)) {
      throw new Error(`Runtime MCP tool not found: ${input.serverId}/${input.toolName}`);
    }

    if (!server.enabled) {
      throw new Error(`Runtime MCP server is disabled: ${input.serverId}`);
    }

    let summary = '';
    let resultPreview = '';

    try {
      if (input.serverId === GOODNIGHT_SKILLS_SERVER_ID && input.toolName === GOODNIGHT_SKILLS_TOOL_NAME) {
        const preview = buildSkillListPreview();
        summary = preview.summary;
        resultPreview = preview.resultPreview;
      } else if (server.transport === 'stdio') {
        const result = await executeStdioTool({
          server,
          toolName: input.toolName,
          argumentsText: input.argumentsText || '',
        });
        summary = result.summary;
        resultPreview = result.resultPreview;
      } else if (server.transport === 'http' || server.transport === 'sse') {
        const result = await executeRemoteTool({
          server,
          toolName: input.toolName,
          argumentsText: input.argumentsText || '',
        });
        summary = result.summary;
        resultPreview = result.resultPreview;
      } else {
        throw new Error(`Runtime MCP tool is not implemented: ${input.serverId}/${input.toolName}`);
      }
    } catch (error) {
      await updateStoredServerStatus(this.dataDir, input.serverId, 'error');
      throw error;
    }

    const now = Date.now();
    const toolCall: RuntimeMcpToolCallRecord = {
      id: `mcp-call-${now}-${input.toolName}`,
      threadId: input.threadId,
      serverId: input.serverId,
      toolName: input.toolName,
      status: 'completed',
      summary,
      resultPreview,
      argumentsText: input.argumentsText || '',
      startedAt: now,
      completedAt: now,
      error: null,
    };

    const store = await loadStore(this.dataDir);
    store.toolCalls.push(toolCall);
    await saveStore(this.dataDir, store);
    await updateStoredServerStatus(this.dataDir, input.serverId, 'connected');
    return toolCall;
  }
}
