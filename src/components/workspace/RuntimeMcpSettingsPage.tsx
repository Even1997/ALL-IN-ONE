import React, { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  deleteRuntimeSidecarMcpServer,
  initializeRuntimeSidecarMcpServers,
  invokeRuntimeSidecarMcpTool,
  upsertRuntimeSidecarMcpServer,
} from '../../modules/runtime-sidecar/runtimeSidecarSessionBridge.ts';
import { useRuntimeMcpStore } from '../../modules/ai/runtime/mcp/runtimeMcpStore';
import type {
  RuntimeMcpServer,
  RuntimeMcpToolDefinition,
  RuntimeMcpTransport,
} from '../../modules/ai/runtime/mcp/runtimeMcpTypes';

const BUILTIN_SERVER_ID = 'goodnight-skills';
const NEW_SERVER_ID = '__new__';

type RuntimeMcpSettingsPageProps = {
  threadId?: string | null;
};

type StringRow = {
  id: string;
  value: string;
};

type KeyValueRow = {
  id: string;
  key: string;
  value: string;
};

type McpDraft = {
  id: string;
  name: string;
  transport: RuntimeMcpTransport;
  description: string;
  enabled: boolean;
  toolNamesText: string;
  command: string;
  args: StringRow[];
  env: KeyValueRow[];
  url: string;
  headers: KeyValueRow[];
  headersHelper: string;
  oauthClientId: string;
  oauthCallbackPort: string;
};

const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createStringRow = (value = ''): StringRow => ({ id: createId(), value });
const createKeyValueRow = (key = '', value = ''): KeyValueRow => ({ id: createId(), key, value });

const EMPTY_DRAFT: McpDraft = {
  id: '',
  name: '',
  transport: 'stdio',
  description: '',
  enabled: true,
  toolNamesText: '',
  command: '',
  args: [createStringRow('')],
  env: [createKeyValueRow()],
  url: '',
  headers: [createKeyValueRow()],
  headersHelper: '',
  oauthClientId: '',
  oauthCallbackPort: '',
};

const parseLineList = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const rowsToList = (rows: StringRow[]) => rows.map((row) => row.value.trim()).filter(Boolean);

const rowsToRecord = (rows: KeyValueRow[]) =>
  Object.fromEntries(
    rows
      .map((row) => [row.key.trim(), row.value] as const)
      .filter(([key]) => key),
  );

const buildRowsFromList = (values?: string[]) =>
  values && values.length > 0 ? values.map((value) => createStringRow(value)) : [createStringRow('')];

const buildRowsFromRecord = (record?: Record<string, string>) => {
  const entries = Object.entries(record || {});
  return entries.length > 0 ? entries.map(([key, value]) => createKeyValueRow(key, value)) : [createKeyValueRow()];
};

const createDraftFromServer = (server: RuntimeMcpServer): McpDraft => ({
  id: server.id,
  name: server.name,
  transport: server.transport,
  description: server.description,
  enabled: server.enabled,
  toolNamesText: server.toolNames.join('\n'),
  command: server.command || '',
  args: buildRowsFromList(server.args),
  env: buildRowsFromRecord(server.env),
  url: server.url || '',
  headers: buildRowsFromRecord(server.headers),
  headersHelper: server.headersHelper || '',
  oauthClientId: server.oauth?.clientId || '',
  oauthCallbackPort:
    typeof server.oauth?.callbackPort === 'number' ? String(server.oauth.callbackPort) : '',
});

const buildServerTools = (
  toolNames: string[],
  currentServer: RuntimeMcpServer | null,
): RuntimeMcpToolDefinition[] =>
  toolNames.map((name) => {
    const existingTool = currentServer?.tools?.find((tool) => tool.name === name);
    return (
      existingTool || {
        name,
        description: `${name} tool`,
        requiresApproval: false,
      }
    );
  });

const buildServerFromDraft = (
  draft: McpDraft,
  currentServer: RuntimeMcpServer | null,
): RuntimeMcpServer => {
  const toolNames = parseLineList(draft.toolNamesText);
  const oauthCallbackPort = Number.parseInt(draft.oauthCallbackPort.trim(), 10);
  const shouldUseRemoteConfig = draft.transport === 'http' || draft.transport === 'sse';
  const oauth =
    shouldUseRemoteConfig && (draft.oauthClientId.trim() || Number.isFinite(oauthCallbackPort))
      ? {
          clientId: draft.oauthClientId.trim() || null,
          callbackPort: Number.isFinite(oauthCallbackPort) ? oauthCallbackPort : null,
        }
      : null;

  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    status: currentServer?.status || (draft.enabled ? 'disconnected' : 'error'),
    transport: draft.transport,
    description: draft.description.trim(),
    enabled: draft.enabled,
    toolNames,
    command: draft.transport === 'stdio' ? draft.command.trim() || null : null,
    args: draft.transport === 'stdio' ? rowsToList(draft.args) : [],
    env: draft.transport === 'stdio' ? rowsToRecord(draft.env) : {},
    url: shouldUseRemoteConfig ? draft.url.trim() || null : null,
    headers: shouldUseRemoteConfig ? rowsToRecord(draft.headers) : {},
    headersHelper: shouldUseRemoteConfig ? draft.headersHelper.trim() || null : null,
    oauth,
    tools: buildServerTools(toolNames, currentServer),
  };
};

const transportLabel = (transport: RuntimeMcpTransport) => {
  switch (transport) {
    case 'stdio':
      return 'STDIO';
    case 'http':
      return 'HTTP';
    case 'sse':
      return 'SSE';
    default:
      return 'Built-in';
  }
};

export const RuntimeMcpSettingsPage: React.FC<RuntimeMcpSettingsPageProps> = ({
  threadId = null,
}) => {
  const { servers, toolCallsByThread } = useRuntimeMcpStore(
    useShallow((state) => ({
      servers: state.servers,
      toolCallsByThread: state.toolCallsByThread,
    })),
  );
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [draft, setDraft] = useState<McpDraft>(EMPTY_DRAFT);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  const loadServers = async (preferredServerId?: string | null) => {
    await initializeRuntimeSidecarMcpServers();
    const nextServers = useRuntimeMcpStore.getState().servers;
    const nextSelectedServerId =
      preferredServerId === NEW_SERVER_ID
        ? NEW_SERVER_ID
        : preferredServerId && nextServers.some((server) => server.id === preferredServerId)
          ? preferredServerId
          : nextServers[0]?.id || null;

    setSelectedServerId(nextSelectedServerId);

    if (nextSelectedServerId === NEW_SERVER_ID) {
      setDraft(EMPTY_DRAFT);
      return;
    }

    const nextServer =
      nextServers.find((server) => server.id === nextSelectedServerId) || null;
    setDraft(nextServer ? createDraftFromServer(nextServer) : EMPTY_DRAFT);
  };

  useEffect(() => {
    void loadServers(selectedServerId);
    // selectedServerId is intentionally excluded so initial load does not loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId) || null,
    [selectedServerId, servers],
  );
  const isCreating = selectedServerId === NEW_SERVER_ID;
  const isBuiltinServer = selectedServer?.id === BUILTIN_SERVER_ID;
  const isRemoteTransport = draft.transport === 'http' || draft.transport === 'sse';
  const activeToolCalls = useMemo(() => {
    if (!threadId || !selectedServer) {
      return [];
    }

    return (toolCallsByThread[threadId] || [])
      .filter((toolCall) => toolCall.serverId === selectedServer.id)
      .slice(-6)
      .reverse();
  }, [selectedServer, threadId, toolCallsByThread]);
  const enabledServerCount = useMemo(
    () => servers.filter((server) => server.enabled).length,
    [servers],
  );
  const customServerCount = useMemo(
    () => servers.filter((server) => server.id !== BUILTIN_SERVER_ID).length,
    [servers],
  );
  const remoteServerCount = useMemo(
    () => servers.filter((server) => server.transport === 'http' || server.transport === 'sse').length,
    [servers],
  );

  const handleSelectServer = (server: RuntimeMcpServer) => {
    setSelectedServerId(server.id);
    setDraft(createDraftFromServer(server));
    setStatusMessage('');
    setErrorMessage('');
  };

  const handleCreateServer = () => {
    setSelectedServerId(NEW_SERVER_ID);
    setDraft(EMPTY_DRAFT);
    setStatusMessage('');
    setErrorMessage('');
  };

  const handleRefresh = async () => {
    setIsWorking(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      await loadServers(selectedServerId);
      setStatusMessage('刷新列表完成。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  };

  const handleSave = async () => {
    if (!draft.id.trim() || !draft.name.trim()) {
      setErrorMessage('请先填写 MCP server 的 ID 和名称。');
      return;
    }

    if (draft.transport === 'stdio' && !draft.command.trim()) {
      setErrorMessage('STDIO server 需要 command。');
      return;
    }

    if ((draft.transport === 'http' || draft.transport === 'sse') && !draft.url.trim()) {
      setErrorMessage(`${transportLabel(draft.transport)} server 需要 URL。`);
      return;
    }

    setIsWorking(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      const savedServer = await upsertRuntimeSidecarMcpServer(
        buildServerFromDraft(draft, isCreating ? null : selectedServer),
      );
      if (!savedServer) {
        throw new Error('Node runtime sidecar 未启动，无法保存 MCP server。');
      }
      await loadServers(savedServer.id);
      setStatusMessage(isCreating ? 'MCP server 已创建。' : 'MCP server 已更新。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!selectedServer || isBuiltinServer) {
      return;
    }

    setIsWorking(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      const updatedServer = await upsertRuntimeSidecarMcpServer({
        ...selectedServer,
        enabled: !selectedServer.enabled,
      });
      if (!updatedServer) {
        throw new Error('Node runtime sidecar 未启动，无法更新 MCP server。');
      }
      await loadServers(updatedServer.id);
      setStatusMessage(updatedServer.enabled ? 'MCP server 已启用。' : 'MCP server 已停用。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedServer || isBuiltinServer) {
      return;
    }

    if (!window.confirm(`删除 MCP server「${selectedServer.name}」？`)) {
      return;
    }

    setIsWorking(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      const result = await deleteRuntimeSidecarMcpServer(selectedServer.id);
      if (!result) {
        throw new Error('Node runtime sidecar 未启动，无法删除 MCP server。');
      }
      await loadServers(null);
      setStatusMessage('MCP server 已删除。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  };

  const handleRunTool = async () => {
    if (!threadId || !selectedServer || selectedServer.toolNames.length === 0) {
      return;
    }

    setIsWorking(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      const toolCall = await invokeRuntimeSidecarMcpTool({
        threadId,
        serverId: selectedServer.id,
        toolName: selectedServer.toolNames[0],
      });
      if (!toolCall) {
        throw new Error('Node runtime sidecar 未启动，无法执行 MCP 工具。');
      }
      setStatusMessage(`已运行 ${selectedServer.toolNames[0]}。`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  };

  const updateArgs = (id: string, value: string) => {
    setDraft((current) => ({
      ...current,
      args: current.args.map((row) => (row.id === id ? { ...row, value } : row)),
    }));
  };

  const updateKeyValueRows = (
    key: 'env' | 'headers',
    id: string,
    field: 'key' | 'value',
    value: string,
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: current[key].map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    }));
  };

  const addRow = (key: 'args' | 'env' | 'headers') => {
    setDraft((current) => ({
      ...current,
      [key]: [
        ...current[key],
        key === 'args' ? createStringRow() : createKeyValueRow(),
      ],
    }));
  };

  const removeRow = (key: 'args' | 'env' | 'headers', id: string) => {
    setDraft((current) => {
      const nextRows = current[key].filter((row) => row.id !== id);
      return {
        ...current,
        [key]:
          nextRows.length > 0 ? nextRows : [key === 'args' ? createStringRow() : createKeyValueRow()],
      };
    });
  };

  const toolCount = parseLineList(draft.toolNamesText).length;

  return (
    <div className="chat-settings-mcp-page">
      <section className="chat-settings-surface chat-settings-mcp-toolbar-bar">
        <div className="chat-settings-mcp-toolbar-copy">
          <div className="chat-settings-eyebrow">Runtime MCP</div>
          <strong>MCP Library</strong>
          <p>把 MCP server 的查看、创建、编辑、启停和关键连接参数统一收进一个运行时资源面板。</p>
        </div>
        <div className="chat-settings-mcp-toolbar-actions">
          <button
            className="chat-settings-apply-btn secondary"
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isWorking}
          >
            刷新列表
          </button>
          <button
            className="chat-settings-apply-btn"
            type="button"
            onClick={handleCreateServer}
            disabled={isWorking}
          >
            新建服务器
          </button>
        </div>
      </section>

      <div className="chat-settings-mcp-layout">
        <aside className="chat-settings-mcp-list">
          <div className="chat-settings-mcp-panel-header chat-settings-mcp-list-head">
            <div>
              <strong>服务器列表</strong>
              <span>内置能力保留只读，自定义 server 在这里统一维护。</span>
            </div>
            <div className="chat-settings-mcp-list-meta">
              <span>{servers.length} 总数</span>
              <span>{enabledServerCount} 已启用</span>
              <span>{remoteServerCount} 远程</span>
              <span>{customServerCount} 自定义</span>
            </div>
          </div>

          <div className="chat-settings-mcp-server-items">
            {servers.map((server) => {
              const isActive = selectedServerId === server.id;
              return (
                <button
                  key={server.id}
                  type="button"
                  className={`chat-settings-mcp-server-item${isActive ? ' active' : ''}`}
                  onClick={() => handleSelectServer(server)}
                >
                  <div className="chat-settings-mcp-server-item-top">
                    <strong>{server.name}</strong>
                    <span className={`chat-settings-mcp-status ${server.enabled ? 'enabled' : 'disabled'}`}>
                      {server.enabled ? '启用中' : '已停用'}
                    </span>
                  </div>
                  <span>{server.id}</span>
                  <span>
                    {transportLabel(server.transport)} · {server.toolNames.length} 个工具
                  </span>
                  {server.description ? <span>{server.description}</span> : null}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="chat-settings-surface chat-settings-mcp-editor">
          <div className="chat-settings-mcp-panel-header chat-settings-detail-header">
            <div>
              <strong>{isCreating ? '新建 MCP server' : draft.name || '选择一个 MCP server'}</strong>
              <span>
                {isBuiltinServer
                  ? '内置 server 仅展示能力，不允许直接修改。'
                  : isCreating
                    ? '尽量按 haha 的字段习惯填写，保存后立即成为运行时配置。'
                    : '在这里维护 transport、工具、环境变量、请求头和 OAuth 参数。'}
              </span>
            </div>
            <div className="chat-settings-actions">
              {threadId && selectedServer?.toolNames.length ? (
                <button
                  className="chat-settings-apply-btn secondary"
                  type="button"
                  onClick={() => void handleRunTool()}
                  disabled={isWorking}
                >
                  运行首个工具
                </button>
              ) : null}
              {!isBuiltinServer && !isCreating ? (
                <button
                  className="chat-settings-apply-btn secondary"
                  type="button"
                  onClick={() => void handleToggleEnabled()}
                  disabled={isWorking}
                >
                  {selectedServer?.enabled ? '停用' : '启用'}
                </button>
              ) : null}
              {!isBuiltinServer ? (
                <button
                  className="chat-settings-apply-btn secondary"
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isWorking}
                >
                  保存
                </button>
              ) : null}
              {!isBuiltinServer && !isCreating ? (
                <button
                  className="chat-settings-apply-btn danger"
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isWorking}
                >
                  删除
                </button>
              ) : null}
            </div>
          </div>

          <section className="chat-settings-mcp-detail-section">
            <div className="chat-settings-section-header">
              <strong>基本信息</strong>
              <span>先确认 transport、启用状态和当前工具数量。</span>
            </div>
            <div className="chat-settings-mcp-chip-row">
              <span className="chat-settings-mcp-chip">{transportLabel(draft.transport)}</span>
              <span className="chat-settings-mcp-chip">{toolCount} 个工具</span>
              <span className="chat-settings-mcp-chip">{draft.enabled ? '已启用' : '已停用'}</span>
              <span className="chat-settings-mcp-chip">{selectedServer?.status || 'disconnected'}</span>
            </div>
            <div className="chat-settings-mcp-kv">
              <div>
                <span>Server ID</span>
                <code>{draft.id || '未填写'}</code>
              </div>
              <div>
                <span>名称</span>
                <strong>{draft.name || '未命名 MCP server'}</strong>
              </div>
              <div>
                <span>Transport</span>
                <strong>{transportLabel(draft.transport)}</strong>
              </div>
              <div>
                <span>启用状态</span>
                <strong>{draft.enabled ? '启用' : '停用'}</strong>
              </div>
            </div>
          </section>

          <section className="chat-settings-mcp-detail-section">
            <div className="chat-settings-section-header">
              <strong>连接配置</strong>
              <span>编辑 server 标识、描述、transport 和工具清单。</span>
            </div>
            <div className="chat-settings-grid">
              <label className="chat-settings-field">
                <span>Server ID</span>
                <input
                  value={draft.id}
                  onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))}
                  placeholder="例如：design-inspect"
                  disabled={Boolean(isBuiltinServer)}
                />
              </label>

              <label className="chat-settings-field">
                <span>名称</span>
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="例如：Design Inspect"
                  disabled={Boolean(isBuiltinServer)}
                />
              </label>

              <label className="chat-settings-field">
                <span>Transport</span>
                <select
                  className="chat-settings-select"
                  value={draft.transport}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      transport: event.target.value as RuntimeMcpTransport,
                    }))
                  }
                  disabled={Boolean(isBuiltinServer)}
                >
                  {isBuiltinServer ? <option value="builtin">Built-in</option> : null}
                  <option value="stdio">STDIO</option>
                  <option value="http">HTTP</option>
                  <option value="sse">SSE</option>
                </select>
              </label>

              <label className="chat-settings-field">
                <span>状态</span>
                <input value={selectedServer?.status || 'disconnected'} disabled />
              </label>

              <label className="chat-settings-field">
                <span>启用状态</span>
                <select
                  className="chat-settings-select"
                  value={draft.enabled ? 'enabled' : 'disabled'}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      enabled: event.target.value === 'enabled',
                    }))
                  }
                  disabled={Boolean(isBuiltinServer)}
                >
                  <option value="enabled">启用</option>
                  <option value="disabled">停用</option>
                </select>
              </label>

              <label className="chat-settings-field chat-settings-field-full">
                <span>描述</span>
                <textarea
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  rows={3}
                  placeholder="说明这个 MCP server 暴露什么能力。"
                  disabled={Boolean(isBuiltinServer)}
                />
              </label>

              <label className="chat-settings-field chat-settings-field-full">
                <span>Tools</span>
                <textarea
                  value={draft.toolNamesText}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, toolNamesText: event.target.value }))
                  }
                  rows={4}
                  placeholder={'一行一个 tool，例如：\ninspect\nsearch\nlist'}
                  disabled={Boolean(isBuiltinServer)}
                />
              </label>
            </div>
          </section>

          {draft.transport === 'stdio' ? (
            <section className="chat-settings-mcp-detail-section chat-settings-mcp-stack">
              <div className="chat-settings-section-header">
                <strong>STDIO 参数</strong>
                <span>维护 command、启动参数和环境变量。</span>
              </div>
              <label className="chat-settings-field">
                <span>Command</span>
                <input
                  value={draft.command}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, command: event.target.value }))
                  }
                  placeholder="例如：npx"
                  disabled={Boolean(isBuiltinServer)}
                />
              </label>

              <ArraySection
                title="Args"
                addLabel="添加参数"
                disabled={Boolean(isBuiltinServer)}
                rows={draft.args}
                onAdd={() => addRow('args')}
                onRemove={(id) => removeRow('args', id)}
              >
                {draft.args.map((row) => (
                  <div key={row.id} className="chat-settings-mcp-array-row single">
                    <input
                      value={row.value}
                      onChange={(event) => updateArgs(row.id, event.target.value)}
                      placeholder="例如：-y 或 @modelcontextprotocol/server"
                      disabled={Boolean(isBuiltinServer)}
                    />
                    <button
                      type="button"
                      className="chat-settings-inline-btn"
                      onClick={() => removeRow('args', row.id)}
                      disabled={Boolean(isBuiltinServer)}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </ArraySection>

              <ArraySection
                title="环境变量"
                addLabel="添加环境变量"
                disabled={Boolean(isBuiltinServer)}
                rows={draft.env}
                onAdd={() => addRow('env')}
                onRemove={(id) => removeRow('env', id)}
              >
                {draft.env.map((row) => (
                  <div key={row.id} className="chat-settings-mcp-array-row">
                    <input
                      value={row.key}
                      onChange={(event) => updateKeyValueRows('env', row.id, 'key', event.target.value)}
                      placeholder="KEY"
                      disabled={Boolean(isBuiltinServer)}
                    />
                    <input
                      value={row.value}
                      onChange={(event) => updateKeyValueRows('env', row.id, 'value', event.target.value)}
                      placeholder="VALUE"
                      disabled={Boolean(isBuiltinServer)}
                    />
                    <button
                      type="button"
                      className="chat-settings-inline-btn"
                      onClick={() => removeRow('env', row.id)}
                      disabled={Boolean(isBuiltinServer)}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </ArraySection>
            </section>
          ) : null}

          {isRemoteTransport ? (
            <section className="chat-settings-mcp-detail-section chat-settings-mcp-stack">
              <div className="chat-settings-section-header">
                <strong>远程连接参数</strong>
                <span>维护 URL、OAuth 和请求头来源。</span>
              </div>
              <div className="chat-settings-grid">
                <label className="chat-settings-field chat-settings-field-full">
                  <span>{draft.transport === 'http' ? 'URL' : 'SSE URL'}</span>
                  <input
                    value={draft.url}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, url: event.target.value }))
                    }
                    placeholder={
                      draft.transport === 'http'
                        ? 'https://example.com/mcp'
                        : 'https://example.com/sse'
                    }
                    disabled={Boolean(isBuiltinServer)}
                  />
                </label>

                <label className="chat-settings-field">
                  <span>OAuth Client ID</span>
                  <input
                    value={draft.oauthClientId}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, oauthClientId: event.target.value }))
                    }
                    placeholder="可选"
                    disabled={Boolean(isBuiltinServer)}
                  />
                </label>

                <label className="chat-settings-field">
                  <span>OAuth Callback Port</span>
                  <input
                    value={draft.oauthCallbackPort}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, oauthCallbackPort: event.target.value }))
                    }
                    placeholder="例如：8788"
                    disabled={Boolean(isBuiltinServer)}
                  />
                </label>

                <label className="chat-settings-field chat-settings-field-full">
                  <span>Headers Helper</span>
                  <input
                    value={draft.headersHelper}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, headersHelper: event.target.value }))
                    }
                    placeholder="用于说明请求头来源或拼装方式"
                    disabled={Boolean(isBuiltinServer)}
                  />
                </label>
              </div>

              <ArraySection
                title="请求头"
                addLabel="添加请求头"
                disabled={Boolean(isBuiltinServer)}
                rows={draft.headers}
                onAdd={() => addRow('headers')}
                onRemove={(id) => removeRow('headers', id)}
              >
                {draft.headers.map((row) => (
                  <div key={row.id} className="chat-settings-mcp-array-row">
                    <input
                      value={row.key}
                      onChange={(event) => updateKeyValueRows('headers', row.id, 'key', event.target.value)}
                      placeholder="Authorization"
                      disabled={Boolean(isBuiltinServer)}
                    />
                    <input
                      value={row.value}
                      onChange={(event) => updateKeyValueRows('headers', row.id, 'value', event.target.value)}
                      placeholder="Bearer ..."
                      disabled={Boolean(isBuiltinServer)}
                    />
                    <button
                      type="button"
                      className="chat-settings-inline-btn"
                      onClick={() => removeRow('headers', row.id)}
                      disabled={Boolean(isBuiltinServer)}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </ArraySection>
            </section>
          ) : null}

          {statusMessage ? <div className="chat-settings-test-note success">{statusMessage}</div> : null}
          {errorMessage ? <div className="chat-settings-test-note error">{errorMessage}</div> : null}

          {selectedServer ? (
            <section className="chat-settings-mcp-tool-history chat-settings-mcp-detail-section">
              <div className="chat-settings-section-header">
                <strong>最近工具调用</strong>
                <span>{threadId ? '展示当前会话里这个 server 的最近结果。' : '当前没有活跃会话。'}</span>
              </div>
              <div className="chat-settings-mcp-tool-call-list">
                {activeToolCalls.length > 0 ? (
                  activeToolCalls.map((toolCall) => (
                    <article key={toolCall.id} className="chat-settings-mcp-tool-call">
                      <div className="chat-settings-mcp-tool-call-top">
                        <strong>{toolCall.toolName}</strong>
                        <span>{toolCall.status}</span>
                      </div>
                      <span>{toolCall.summary}</span>
                      {toolCall.resultPreview ? <pre>{toolCall.resultPreview}</pre> : null}
                    </article>
                  ))
                ) : (
                  <div className="chat-settings-mcp-empty">还没有工具调用记录。</div>
                )}
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </div>
  );
};

const ArraySection: React.FC<{
  title: string;
  addLabel: string;
  disabled?: boolean;
  rows: Array<StringRow | KeyValueRow>;
  onAdd: () => void;
  onRemove: (id: string) => void;
  children: React.ReactNode;
}> = ({ title, addLabel, disabled = false, rows, onAdd, onRemove: _onRemove, children }) => (
  <section className="chat-settings-mcp-array-section">
    <div className="chat-settings-section-header">
      <strong>{title}</strong>
      <span>{rows.length} 项</span>
    </div>
    <div className="chat-settings-mcp-array-list">{children}</div>
    <button
      type="button"
      className="chat-settings-apply-btn secondary"
      onClick={onAdd}
      disabled={disabled}
    >
      {addLabel}
    </button>
  </section>
);
