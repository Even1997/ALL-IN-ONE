import React from 'react';
import type { RuntimeToolStep } from '../../../modules/ai/runtime/agent-kernel/agentKernelTypes';
import type { RuntimeMcpToolCall } from '../../../modules/ai/runtime/mcp/runtimeMcpTypes';

const toolStatusLabels: Record<RuntimeToolStep['status'], string> = {
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  blocked: '已阻止',
};

const mcpStatusLabels: Record<RuntimeMcpToolCall['status'], string> = {
  running: '执行中',
  completed: '已完成',
  error: '失败',
};

const summarizeToolCall = (toolCall: RuntimeToolStep) => {
  const input = toolCall.input;
  if (toolCall.name === 'view' && typeof input.file_path === 'string') {
    return `读取 ${input.file_path}`;
  }
  if ((toolCall.name === 'write' || toolCall.name === 'edit') && typeof input.file_path === 'string') {
    return `${toolCall.name === 'write' ? '写入' : '编辑'} ${input.file_path}`;
  }
  if (toolCall.name === 'bash' && typeof input.command === 'string') {
    return input.command;
  }
  if (toolCall.name === 'fetch' && typeof input.url === 'string') {
    return input.url;
  }
  if (toolCall.name === 'grep' && typeof input.pattern === 'string') {
    return `搜索 ${input.pattern}`;
  }
  if (toolCall.name === 'glob' && typeof input.pattern === 'string') {
    return `匹配 ${input.pattern}`;
  }
  if (toolCall.name === 'ls' && typeof input.path === 'string') {
    return `列出 ${input.path}`;
  }
  if (toolCall.name === 'AskUserQuestion') {
    return '等待用户输入';
  }
  return toolStatusLabels[toolCall.status];
};

const summarizeFileChange = (change: NonNullable<RuntimeToolStep['fileChanges']>[number]) => {
  if (change.beforeContent === null && change.afterContent !== null) {
    return '新建';
  }
  if (change.beforeContent !== null && change.afterContent === null) {
    return '删除';
  }
  return '修改';
};

const formatToolCounter = (toolCalls: RuntimeToolStep[], mcpToolCalls: RuntimeMcpToolCall[]) => {
  const total = toolCalls.length + mcpToolCalls.length;
  const completed =
    toolCalls.filter((toolCall) => toolCall.status === 'completed').length +
    mcpToolCalls.filter((toolCall) => toolCall.status === 'completed').length;
  const failed =
    toolCalls.filter((toolCall) => toolCall.status === 'failed' || toolCall.status === 'blocked').length +
    mcpToolCalls.filter((toolCall) => toolCall.status === 'error').length;

  return `${total} calls · 完成 ${completed}${failed > 0 ? ` · 异常 ${failed}` : ''}`;
};

export const GNAgentToolCallPanel: React.FC<{
  toolCalls: RuntimeToolStep[];
  mcpToolCalls?: RuntimeMcpToolCall[];
}> = ({ toolCalls, mcpToolCalls = [] }) => (
  <section className="gn-agent-runtime-panel">
    <div className="gn-agent-runtime-panel-head">
      <strong>Tools</strong>
      <span>{formatToolCounter(toolCalls, mcpToolCalls)}</span>
    </div>
    {toolCalls.length === 0 && mcpToolCalls.length === 0 ? (
      <p className="gn-agent-runtime-panel-empty">No tool calls have been recorded for this thread yet.</p>
    ) : (
      <div className="gn-agent-runtime-panel-list">
        {toolCalls.map((toolCall, index) => (
          <details
            key={toolCall.id}
            className={`gn-agent-runtime-card gn-agent-runtime-card-${toolCall.status}`}
            open={toolCall.status === 'running' || toolCall.status === 'failed' || toolCall.status === 'blocked'}
          >
            <summary className="gn-agent-runtime-details-summary">
              <strong>{index + 1}. {toolCall.name}</strong>
              <span>{summarizeToolCall(toolCall)}</span>
              <code>{toolStatusLabels[toolCall.status]}</code>
            </summary>
            <div className="gn-agent-runtime-details">
              <div className="gn-agent-runtime-subcard">
                <strong>Input</strong>
                <pre className="gn-agent-runtime-pre">{JSON.stringify(toolCall.input, null, 2)}</pre>
              </div>
              {toolCall.fileChanges && toolCall.fileChanges.length > 0 ? (
                <div className="gn-agent-runtime-subcard">
                  <strong>Files</strong>
                  <div className="gn-agent-runtime-file-list">
                    {toolCall.fileChanges.map((change) => (
                      <div key={`${toolCall.id}-${change.path}`} className="gn-agent-runtime-file-item">
                        <span>{change.path}</span>
                        <code>{summarizeFileChange(change)}</code>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {(toolCall.resultContent || toolCall.resultPreview) ? (
                <div className="gn-agent-runtime-subcard">
                  <strong>Result</strong>
                  <pre className="gn-agent-runtime-pre">{toolCall.resultContent || toolCall.resultPreview}</pre>
                </div>
              ) : null}
            </div>
          </details>
        ))}
        {mcpToolCalls.map((toolCall, index) => (
          <details
            key={toolCall.id}
            className={`gn-agent-runtime-card gn-agent-runtime-card-${toolCall.status === 'error' ? 'failed' : toolCall.status}`}
            open={toolCall.status === 'running' || toolCall.status === 'error'}
          >
            <summary className="gn-agent-runtime-details-summary">
              <strong>{toolCalls.length + index + 1}. MCP / {toolCall.toolName}</strong>
              <span>{toolCall.summary || `${toolCall.serverId}/${toolCall.toolName}`}</span>
              <code>{mcpStatusLabels[toolCall.status]}</code>
            </summary>
            <div className="gn-agent-runtime-details">
              <div className="gn-agent-runtime-subcard">
                <strong>Server</strong>
                <pre className="gn-agent-runtime-pre">{toolCall.serverId}</pre>
              </div>
              {toolCall.argumentsText ? (
                <div className="gn-agent-runtime-subcard">
                  <strong>Arguments</strong>
                  <pre className="gn-agent-runtime-pre">{toolCall.argumentsText}</pre>
                </div>
              ) : null}
              <div className="gn-agent-runtime-subcard">
                <strong>{toolCall.error ? 'Error' : 'Result'}</strong>
                <pre className="gn-agent-runtime-pre">{toolCall.error || toolCall.resultPreview || 'No output yet.'}</pre>
              </div>
            </div>
          </details>
        ))}
      </div>
    )}
  </section>
);
