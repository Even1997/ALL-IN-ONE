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

const createEmptyDraft = (): McpDraft => ({
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
});

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
  const [draft, setDraft] = useState<McpDraft>(() => createEmptyDraft());
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
      setDraft(createEmptyDraft());
      return;
    }

    const nextServer =
      nextServers.find((server) => server.id === nextSelectedServerId) || null;
    setDraft(nextServer ? createDraftFromServer(nextServer) : createEmptyDraft());
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
    setDraft(createEmptyDraft());
    setStatusMessage('');
    setErrorMessage('');
  };

  const handleRefresh = async () => {
    setIsWorking(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      await loadServers(selectedServerId);
      setStatusMessage('MCP library refreshed.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  };

  const handleSave = async () => {
    if (!draft.id.trim() || !draft.name.trim()) {
      setErrorMessage('Server ID and name are required.');
      return;
    }

    if (draft.transport === 'stdio' && !draft.command.trim()) {
      setErrorMessage('STDIO servers require a command.');
      return;
    }

    if ((draft.transport === 'http' || draft.transport === 'sse') && !draft.url.trim()) {
      setErrorMessage(`${transportLabel(draft.transport)} servers require a URL.`);
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
        throw new Error('Node runtime sidecar is not available.');
      }
      await loadServers(savedServer.id);
      setStatusMessage(isCreating ? 'MCP server created.' : 'MCP server updated.');
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
        throw new Error('Node runtime sidecar is not available.');
      }
      await loadServers(updatedServer.id);
      setStatusMessage(updatedServer.enabled ? 'MCP server enabled.' : 'MCP server disabled.');
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

    if (!window.confirm(`Delete MCP server "${selectedServer.name}"?`)) {
      return;
    }

    setIsWorking(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      const result = await deleteRuntimeSidecarMcpServer(selectedServer.id);
      if (!result) {
        throw new Error('Node runtime sidecar is not available.');
      }
      await loadServers(null);
      setStatusMessage('MCP server deleted.');
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
        throw new Error('Node runtime sidecar is not available.');
      }
      setStatusMessage(`Ran ${selectedServer.toolNames[0]}.`);
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
  const statusLabel = selectedServer?.status || 'disconnected';

  return (
    <div className="chat-settings-mcp-layout">
      <aside className="chat-settings-mcp-list">
        <div className="chat-settings-list-header">
          <div>
            <div className="chat-settings-eyebrow">Runtime MCP</div>
            <strong>MCP Library</strong>
          </div>
          <div className="chat-settings-list-actions">
            <button
              className="chat-settings-apply-btn secondary"
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isWorking}
            >
              Refresh
            </button>
            <button
              className="chat-settings-apply-btn"
              type="button"
              onClick={handleCreateServer}
              disabled={isWorking}
            >
              New Server
            </button>
          </div>
          <div className="chat-settings-mcp-list-meta">
            <span>{servers.length} total</span>
            <span>{enabledServerCount} enabled</span>
            <span>{remoteServerCount} remote</span>
            <span>{customServerCount} custom</span>
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
                    {server.enabled ? 'enabled' : 'disabled'}
                  </span>
                </div>
                <span>{server.id}</span>
                <span>{transportLabel(server.transport)} / {server.toolNames.length} tools</span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="chat-settings-mcp-stage">
        <article className="chat-settings-note-surface">
          <header className="chat-settings-note-header">
            <div>
              <div className="chat-settings-eyebrow">{isBuiltinServer ? 'Built-in' : isCreating ? 'New Server' : 'Server Editor'}</div>
              <strong>{isCreating ? 'New MCP Server' : draft.name || 'Select an MCP server'}</strong>
            </div>
            <div className="chat-settings-status-pills">
              <span>{transportLabel(draft.transport)}</span>
              <span>{toolCount} tools</span>
              <span>{draft.enabled ? 'enabled' : 'disabled'}</span>
              <span>{statusLabel}</span>
            </div>
          </header>

          <div className="chat-settings-note-sections">
            <section className="chat-settings-section-block">
              <div className="chat-settings-grid">
                <label className="chat-settings-field">
                  <span>Server ID</span>
                  <input
                    value={draft.id}
                    onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))}
                    placeholder="design-inspect"
                    disabled={Boolean(isBuiltinServer)}
                  />
                </label>

                <label className="chat-settings-field">
                  <span>Name</span>
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Design Inspect"
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
                  <span>Enabled</span>
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
                    <option value="enabled">enabled</option>
                    <option value="disabled">disabled</option>
                  </select>
                </label>

                <label className="chat-settings-field chat-settings-field-full">
                  <span>Tools</span>
                  <textarea
                    value={draft.toolNamesText}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, toolNamesText: event.target.value }))
                    }
                    rows={4}
                    placeholder={'inspect\nsearch\nlist'}
                    disabled={Boolean(isBuiltinServer)}
                  />
                </label>
              </div>
            </section>

            {draft.transport === 'stdio' ? (
              <section className="chat-settings-section-block">
                <div className="chat-settings-section-header">
                  <strong>STDIO</strong>
                </div>

                <label className="chat-settings-field">
                  <span>Command</span>
                  <input
                    value={draft.command}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, command: event.target.value }))
                    }
                    placeholder="npx"
                    disabled={Boolean(isBuiltinServer)}
                  />
                </label>

                <ArraySection
                  title="Args"
                  addLabel="Add Arg"
                  disabled={Boolean(isBuiltinServer)}
                  rows={draft.args}
                  onAdd={() => addRow('args')}
                >
                  {draft.args.map((row) => (
                    <div key={row.id} className="chat-settings-mcp-array-row single">
                      <input
                        value={row.value}
                        onChange={(event) => updateArgs(row.id, event.target.value)}
                        placeholder="-y"
                        disabled={Boolean(isBuiltinServer)}
                      />
                      <button
                        type="button"
                        className="chat-settings-inline-btn"
                        onClick={() => removeRow('args', row.id)}
                        disabled={Boolean(isBuiltinServer)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </ArraySection>

                <ArraySection
                  title="Env"
                  addLabel="Add Env"
                  disabled={Boolean(isBuiltinServer)}
                  rows={draft.env}
                  onAdd={() => addRow('env')}
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
                        Remove
                      </button>
                    </div>
                  ))}
                </ArraySection>
              </section>
            ) : null}

            {isRemoteTransport ? (
              <section className="chat-settings-section-block">
                <div className="chat-settings-section-header">
                  <strong>Remote</strong>
                </div>

                <div className="chat-settings-grid">
                  <label className="chat-settings-field chat-settings-field-full">
                    <span>{draft.transport === 'http' ? 'URL' : 'SSE URL'}</span>
                    <input
                      value={draft.url}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, url: event.target.value }))
                      }
                      placeholder={draft.transport === 'http' ? 'https://example.com/mcp' : 'https://example.com/sse'}
                      disabled={Boolean(isBuiltinServer)}
                    />
                  </label>
                </div>

                <ArraySection
                  title="Headers"
                  addLabel="Add Header"
                  disabled={Boolean(isBuiltinServer)}
                  rows={draft.headers}
                  onAdd={() => addRow('headers')}
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
                        Remove
                      </button>
                    </div>
                  ))}
                </ArraySection>
              </section>
            ) : null}
          </div>

          <footer className="chat-settings-note-actions">
            {threadId && selectedServer?.toolNames.length ? (
              <button
                className="chat-settings-apply-btn secondary"
                type="button"
                onClick={() => void handleRunTool()}
                disabled={isWorking}
              >
                Run First Tool
              </button>
            ) : null}
            {!isBuiltinServer && !isCreating ? (
              <button
                className="chat-settings-apply-btn secondary"
                type="button"
                onClick={() => void handleToggleEnabled()}
                disabled={isWorking}
              >
                {selectedServer?.enabled ? 'Disable' : 'Enable'}
              </button>
            ) : null}
            {!isBuiltinServer ? (
              <button
                className="chat-settings-apply-btn"
                type="button"
                onClick={() => void handleSave()}
                disabled={isWorking}
              >
                Save
              </button>
            ) : null}
            {!isBuiltinServer && !isCreating ? (
              <button
                className="chat-settings-apply-btn danger"
                type="button"
                onClick={() => void handleDelete()}
                disabled={isWorking}
              >
                Delete
              </button>
            ) : null}
          </footer>
        </article>
      </section>

      <aside className="chat-settings-mcp-companion">
        <section className="chat-settings-companion-panel">
          <strong>Server</strong>
          <span>{draft.name || 'Untitled MCP server'}</span>
          <span>{transportLabel(draft.transport)}</span>
          <span>{toolCount} tools</span>
          <span>{draft.enabled ? 'enabled' : 'disabled'}</span>
        </section>

        {statusMessage ? <section className="chat-settings-companion-panel chat-settings-test-note success">{statusMessage}</section> : null}
        {errorMessage ? <section className="chat-settings-companion-panel chat-settings-test-note error">{errorMessage}</section> : null}

        <section className="chat-settings-companion-panel">
          <strong>Recent tool calls</strong>
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
              <div className="chat-settings-mcp-empty">No tool calls yet.</div>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
};

const ArraySection: React.FC<{
  title: string;
  addLabel: string;
  disabled?: boolean;
  rows: Array<StringRow | KeyValueRow>;
  onAdd: () => void;
  children: React.ReactNode;
}> = ({ title, addLabel, disabled = false, rows, onAdd, children }) => (
  <section className="chat-settings-mcp-array-section">
    <div className="chat-settings-section-header">
      <strong>{title}</strong>
      <span>{rows.length}</span>
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
