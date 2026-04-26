import React, { useState, useEffect, useRef } from 'react';
import { useGlobalAIStore, AIRequestRecord } from '../../modules/ai/store/globalAIStore';
import { aiService, CodeBlock } from '../../modules/ai/core/AIService';
import { PROVIDER_PRESETS } from '../../modules/ai/providerPresets';
import { isAbsoluteFilePath, joinFileSystemPath } from '../../utils/fileSystemPaths.ts';
import { ToolExecutor } from '../workspace/tools';
import './AIPanel.css';

export const AIPanel: React.FC = () => {
  const {
    isPanelOpen,
    panelPosition,
    isStreaming,
    error,
    codeBlocks,
    currentRequestId,
    requestHistory,
    togglePanel,
    setPanelPosition,
    clearHistory,
    provider,
    setProvider,
    setApiKey,
    apiKey,
    baseURL,
    setBaseURL,
    model,
    setModel,
    customHeaders,
    setCustomHeaders,
  } = useGlobalAIStore();

  const [localPrompt, setLocalPrompt] = useState('');
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'output' | 'history' | 'settings'>('output');
  const [providerSearch, setProviderSearch] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState('openrouter');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [modelList, setModelList] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  const filteredProviders = PROVIDER_PRESETS.filter((item) =>
    item.label.toLowerCase().includes(providerSearch.trim().toLowerCase())
  );
  const selectedProvider =
    PROVIDER_PRESETS.find((item) => item.id === selectedProviderId) || PROVIDER_PRESETS[0];

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [isStreaming, codeBlocks]);

  useEffect(() => {
    setModelList((current) => (current.length > 0 ? current : selectedProvider.models));
  }, [selectedProvider]);

  useEffect(() => {
    const matched = PROVIDER_PRESETS.find(
      (item) => item.type === provider && item.baseURL === baseURL
    );

    if (matched) {
      setSelectedProviderId(matched.id);
    }
  }, [provider, baseURL]);

  // Close panel when clicking overlay
  const handleOverlayClick = () => {
    togglePanel();
  };

  const currentRequest = requestHistory.find((r: AIRequestRecord) => r.id === currentRequestId);
  const selectedRequest = requestHistory.find((r: AIRequestRecord) => r.id === selectedHistoryId);
  const displayRequest = selectedRequest || currentRequest;

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        className={`ai-trigger-btn ${isStreaming ? 'streaming' : ''}`}
        onClick={togglePanel}
        title="打开 AI 助手"
      >
        {isStreaming ? '◐' : '◎'}
      </button>

      {/* Overlay Background */}
      <div
        className={`ai-panel-overlay ${isPanelOpen ? 'visible' : ''}`}
        onClick={handleOverlayClick}
      />

      {/* Collapsible Sidebar Panel */}
      <div className={`ai-panel ${panelPosition} ${isPanelOpen ? 'open' : ''} ${activeTab === 'settings' ? 'settings-mode' : ''}`}>
        {/* Header */}
        <div className="ai-panel-header">
          <div className="ai-panel-title">
            <span style={{ fontSize: '18px' }}>{isStreaming ? '◐' : '◎'}</span>
            <span>AI 协作中心</span>
            {isStreaming && <span className="streaming-dot" />}
          </div>
          <div className="ai-panel-actions">
            <select
              value={panelPosition}
              onChange={(e) => setPanelPosition(e.target.value as 'right' | 'bottom')}
              className="ai-position-select"
            >
              <option value="right">侧边</option>
              <option value="bottom">底部</option>
            </select>
            <button onClick={togglePanel} className="ai-close-btn">✕</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="ai-tabs">
          <button
            className={`ai-tab ${activeTab === 'output' ? 'active' : ''}`}
            onClick={() => setActiveTab('output')}
          >
            输出
          </button>
          <button
            className={`ai-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            历史 ({requestHistory.length})
          </button>
          <button
            className={`ai-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            设置
          </button>
        </div>

        {/* Content */}
        <div className="ai-panel-content">
          {activeTab === 'output' && (
            <div className="ai-output">
              {error && (
                <div className="ai-error">
                  <span>✕</span>
                  <span>{error}</span>
                </div>
              )}

              {displayRequest ? (
                <>
                  <div className="ai-request-summary">
                    <span className="module-badge">{displayRequest.module}</span>
                    <span className="action-badge">{displayRequest.action}</span>
                  </div>
                  <div className="ai-response" ref={outputRef}>
                    <pre>{displayRequest.responseContent}</pre>
                  </div>
                </>
              ) : (
                <div className="ai-empty">
                  <div className="ai-empty-icon">◎</div>
                  <p>AI 助手已就绪</p>
                  <p className="ai-hint">在任何模块中点击 ◎ 按钮发起 AI 请求</p>
                </div>
              )}

              {/* Code Blocks */}
              {codeBlocks.length > 0 && (
                <div className="code-blocks-section">
                  <h4>生成的代码</h4>
                  {codeBlocks.map((block: CodeBlock, index: number) => (
                    <CodeBlockViewer key={index} block={block} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="ai-history">
              {requestHistory.length === 0 ? (
                <div className="ai-empty">
                  <div className="ai-empty-icon">📋</div>
                  <p>暂无历史记录</p>
                </div>
              ) : (
                requestHistory.map((record: AIRequestRecord) => (
                  <div
                    key={record.id}
                    className={`history-item ${selectedHistoryId === record.id ? 'selected' : ''}`}
                    onClick={() => setSelectedHistoryId(record.id)}
                  >
                    <div className="history-header">
                      <span className="module-badge">{record.module}</span>
                      <span className="history-time">
                        {new Date(record.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="history-prompt">{record.prompt}</div>
                    <div className="history-meta">
                      <span>{record.codeBlocks.length} 个代码块</span>
                      <span className={`status-${record.status}`}>{record.status}</span>
                    </div>
                  </div>
                ))
              )}
              {requestHistory.length > 0 && (
                <button className="ai-clear-btn" onClick={clearHistory}>
                  清空历史
                </button>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="ai-settings-shell">
              <aside className="provider-sidebar">
                <div className="provider-search-box">
                  <input
                    value={providerSearch}
                    onChange={(e) => setProviderSearch(e.target.value)}
                    placeholder="搜索模型平台..."
                    className="provider-search-input"
                  />
                </div>
                <div className="provider-list">
                  {filteredProviders.length > 0 ? (
                    filteredProviders.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`provider-list-item ${selectedProviderId === item.id ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedProviderId(item.id);
                          setProvider(item.type);
                          setBaseURL(item.baseURL);
                          setModel(item.models[0]);
                          setModelList(item.models);
                          setTestState('idle');
                          setTestMessage('');
                        }}
                      >
                        <div className={`provider-badge provider-badge-${item.accent}`}>{item.iconText}</div>
                        <div className="provider-meta">
                          <strong>{item.label}</strong>
                        </div>
                        <span className={`provider-status ${item.enabled ? 'on' : 'off'}`}>
                          {item.enabled ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="provider-empty-state">没有匹配的平台</div>
                  )}
                </div>
                <button className="provider-add-btn" type="button">
                  ＋ 添加
                </button>
              </aside>

              <section className="provider-detail">
                <div className="provider-detail-header">
                  <div className="provider-detail-title">
                    <h3>{selectedProvider.label}</h3>
                    <a href={selectedProvider.docsUrl} target="_blank" rel="noreferrer">
                      ↗
                    </a>
                  </div>
                  <button
                    className={`provider-toggle ${selectedProvider.enabled ? 'active' : ''}`}
                    type="button"
                    onClick={() => {
                      const newEnabled = !selectedProvider.enabled;
                      const idx = PROVIDER_PRESETS.findIndex(p => p.id === selectedProviderId);
                      if (idx !== -1) {
                        PROVIDER_PRESETS[idx].enabled = newEnabled;
                        setProvider(selectedProvider.type);
                      }
                    }}
                  >
                    <span />
                  </button>
                </div>

                <div className="provider-form">
                  <div className="provider-field">
                    <div className="provider-field-header">
                      <label>API 密钥</label>
                      <button
                        type="button"
                        className="ghost-icon-btn"
                        onClick={() => setShowApiKey((value) => !value)}
                      >
                        {showApiKey ? '隐藏' : '显示'}
                      </button>
                    </div>
                    <div className="provider-input-row">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={selectedProvider.keyHint}
                        className="provider-strong-input api-key-input"
                      />
                      <button
                        className="provider-action-btn"
                        type="button"
                        onClick={async () => {
                          setTestState('testing');
                          setTestMessage('');
                          const result = await aiService.testConnection({
                            provider,
                            apiKey,
                            baseURL,
                            model,
                            customHeaders,
                          });
                          setTestState(result.ok ? 'success' : 'error');
                          setTestMessage(result.message);
                        }}
                      >
                        {testState === 'testing' ? '检测中' : '检测'}
                      </button>
                    </div>
                    <div className="provider-field-footer">
                      <a href={selectedProvider.docsUrl} target="_blank" rel="noreferrer">
                        点击这里获取密钥
                      </a>
                      <span>多个密钥使用逗号分隔</span>
                    </div>
                    {testMessage && (
                      <div className={`provider-test-note ${testState}`}>
                        {testMessage}
                      </div>
                    )}
                  </div>

                  <div className="provider-field">
                    <div className="provider-field-header">
                      <label>API 地址</label>
                      <button
                        type="button"
                        className="ghost-icon-btn"
                        onClick={() => setBaseURL(selectedProvider.baseURL)}
                      >
                        重置
                      </button>
                    </div>
                    <div className="provider-input-row">
                      <input
                        type="text"
                        value={baseURL}
                        onChange={(e) => setBaseURL(e.target.value)}
                        className="provider-strong-input api-key-input"
                      />
                    </div>
                    <div className="provider-preview-url">
                      预览：{baseURL.replace(/\/+$/, '')}/{provider === 'anthropic' ? 'messages' : 'chat/completions'}
                    </div>
                  </div>

                  <div className="provider-field">
                    <div className="provider-field-header">
                      <label>模型</label>
                      <div className="provider-model-actions">
                        <button
                          className="provider-outline-btn"
                          type="button"
                          onClick={async () => {
                            setIsLoadingModels(true);
                            try {
                              const list = await aiService.listModels({
                                provider,
                                apiKey,
                                baseURL,
                                model,
                                customHeaders,
                              });
                              setModelList(list);
                              if (list[0]) {
                                setModel(list[0]);
                              }
                            } finally {
                              setIsLoadingModels(false);
                            }
                          }}
                        >
                          {isLoadingModels ? '获取中' : '获取模型列表'}
                        </button>
                        <button
                          className="provider-icon-square"
                          type="button"
                          onClick={() => setModelList((current) => [model, ...current.filter((item) => item !== model)])}
                        >
                          ＋
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={selectedProvider.models[0]}
                      className="provider-strong-input api-key-input"
                    />

                    <div className="provider-model-board">
                      <div className="provider-model-group">
                        <div className="provider-model-group-title">{selectedProvider.label}</div>
                        <div className="provider-model-list">
                          {(modelList.length > 0 ? modelList : selectedProvider.models).map((item) => (
                            <button
                              key={item}
                              type="button"
                              className={`provider-model-row ${model === item ? 'active' : ''}`}
                              onClick={() => setModel(item)}
                            >
                              <div className={`provider-badge provider-badge-${selectedProvider.accent}`}>{selectedProvider.iconText}</div>
                              <span>{item}</span>
                              <div className="provider-model-row-actions">
                                <span
                                  className="mini-dot"
                                  title="查看详情"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModel(item);
                                  }}
                                />
                                <span
                                  className="mini-dot wrench"
                                  title="配置"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModel(item);
                                  }}
                                />
                                <span
                                  className="mini-gear"
                                  title="设置"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModel(item);
                                  }}
                                />
                                <span
                                  className="mini-minus"
                                  title="删除"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setModelList((prev) => prev.filter((m) => m !== item));
                                  }}
                                />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="provider-doc-note">
                      查看 <a href={selectedProvider.docsUrl} target="_blank" rel="noreferrer">{selectedProvider.label} 文档</a> 和模型获取更多详情
                    </div>
                  </div>

                  <div className="provider-field">
                    <div className="provider-field-header">
                      <label>自定义 Headers</label>
                    </div>
                    <textarea
                      value={customHeaders}
                      onChange={(e) => setCustomHeaders(e.target.value)}
                      placeholder='{"HTTP-Referer":"https://your-app.com","X-Title":"GoodNight"}'
                      className="provider-headers-input api-key-input"
                    />
                    <div className="setting-info provider-setting-note">
                      <p>{selectedProvider.note}</p>
                      <p>推荐优先使用第三方 OpenAI-compatible 平台；AI 会按 OpenCode 风格优先结合本地工具上下文完成任务。</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Footer with Quick Prompt */}
        <div className="ai-panel-footer">
          <input
            type="text"
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            placeholder="快速 AI 请求..."
            className="ai-quick-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && localPrompt.trim()) {
                handleQuickRequest(localPrompt);
              }
            }}
          />
          <button
            onClick={() => handleQuickRequest(localPrompt)}
            disabled={!localPrompt.trim() || isStreaming}
            className="ai-send-btn"
          >
            {isStreaming ? '◐' : '▶'}
          </button>
        </div>
      </div>
    </>
  );

  function handleQuickRequest(prompt: string) {
    if (prompt.trim()) {
      useGlobalAIStore.getState().generateForModule(
        'feature-tree',
        'generate',
        {
          target: { type: 'component', id: 'quick', filePath: 'quick.tsx' },
          change: { type: 'modify', after: prompt },
          related: { files: [], elements: [] },
        },
        prompt
      );
      setLocalPrompt('');
    }
  }
};

const CodeBlockViewer: React.FC<{ block: CodeBlock }> = ({ block }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [applyState, setApplyState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  return (
    <div className="code-block-viewer">
      <div className="code-block-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="code-action">{block.action}</span>
        <span className="code-path">{block.filePath || '未指定路径'}</span>
        <span className="code-lang">{block.language}</span>
        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
      </div>
      {isExpanded && (
        <div className="code-block-content">
          <pre>{block.code}</pre>
          <div className="code-block-actions">
            <button
              onClick={() => {
                navigator.clipboard.writeText(block.code);
              }}
              className="copy-btn"
            >
              📋 复制
            </button>
            <button
              onClick={async () => {
                if (!block.filePath) {
                  return;
                }

                try {
                  setApplyState('saving');
                  const projectRoot = aiService.getConfig().projectRoot || '.';
                  const toolExecutor = new ToolExecutor(projectRoot);
                  const normalizedPath = isAbsoluteFilePath(block.filePath)
                    ? block.filePath
                    : joinFileSystemPath(projectRoot, block.filePath);

                  await toolExecutor.execute({
                    id: `write_${Date.now()}`,
                    name: 'write',
                    input: {
                      file_path: normalizedPath,
                      content: block.code,
                    },
                  });
                  setApplyState('saved');
                } catch {
                  setApplyState('error');
                }
              }}
              className="download-btn"
              disabled={!block.filePath}
            >
              {applyState === 'saving'
                ? '写入中'
                : applyState === 'saved'
                  ? '已写入'
                  : applyState === 'error'
                    ? '写入失败'
                    : '应用到文件'}
            </button>
            <button
              onClick={() => {
                const blob = new Blob([block.code], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = block.filePath?.split('/').pop() || 'code.txt';
                a.click();
              }}
              className="download-btn"
            >
              💾 保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
