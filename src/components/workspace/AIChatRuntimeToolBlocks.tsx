import React from 'react';
import type { RuntimeToolStep } from '../../modules/ai/runtime/agent-kernel/agentKernelTypes';
import type { StoredChatRuntimeEvent } from '../../modules/ai/store/aiChatStore';
import type { RuntimeEventRenderModel } from './runtimeEventRenderModel';
import type { RuntimeStatus, RuntimeToolHelpers } from './AIChatRuntimeToolTypes';

type ToolBlockProps = {
  toolUse: Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>;
  renderModel: RuntimeEventRenderModel;
  indexLabel?: string;
  compact?: boolean;
  renderApprovalEvent: (event: Extract<StoredChatRuntimeEvent, { kind: 'approval' }>) => React.ReactNode;
  renderQuestionEvent: (event: Extract<StoredChatRuntimeEvent, { kind: 'question' }>) => React.ReactNode;
  renderRuntimeFileChanges: (
    fileChanges: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']>
  ) => React.ReactNode;
  helpers: RuntimeToolHelpers;
};

export const RuntimeToolTree = React.memo(function RuntimeToolTree(props: ToolBlockProps) {
  return <RuntimeToolBlock {...props} />;
});

const RuntimeToolBlock: React.FC<ToolBlockProps> = ({
  toolUse,
  renderModel,
  indexLabel,
  compact = false,
  renderApprovalEvent,
  renderQuestionEvent,
  renderRuntimeFileChanges,
  helpers,
}) => {
  const resultEvent = renderModel.resultMap.get(toolUse.toolCallId);
  const approvalEvents = renderModel.approvalsByToolCallId.get(toolUse.toolCallId) || [];
  const questionEvents = renderModel.questionsByToolCallId.get(toolUse.toolCallId) || [];
  const childToolUses = renderModel.childToolUsesByParent.get(toolUse.toolCallId) || [];
  const effectiveStatus = (resultEvent?.status || toolUse.status) as RuntimeStatus;
  const requestSummary = helpers.summarizeRuntimeToolCall(toolUse.toolName, toolUse.input);
  const headline = helpers.getRuntimeToolHeadline(toolUse.toolName, toolUse.input);
  const previewText = helpers.buildRuntimeToolStepPreview({
    status: effectiveStatus,
    summary: requestSummary,
    output: resultEvent?.output,
    fileChanges: resultEvent?.fileChanges,
    approvalCount: approvalEvents.length,
    questionCount: questionEvents.length,
    childCount: childToolUses.length,
  });

  return (
    <details
      key={toolUse.id}
      className={`chat-tool-trace-step ${effectiveStatus}`}
      open={helpers.shouldOpenRuntimeToolStep({
        status: effectiveStatus,
        approvalCount: approvalEvents.length,
        questionCount: questionEvents.length,
      })}
    >
      <summary>
        <div className="chat-tool-trace-summary-copy">
          <strong>{indexLabel ? `${indexLabel}. ` : ''}{headline}</strong>
          <span>{helpers.getRuntimeStatusLabel(effectiveStatus)}</span>
          {previewText && previewText !== requestSummary ? (
            <div className="chat-tool-trace-preview">{previewText}</div>
          ) : null}
        </div>
        <span className={`chat-tool-trace-status ${effectiveStatus}`}>{helpers.getRuntimeStatusLabel(effectiveStatus)}</span>
      </summary>
      {helpers.shouldShowRuntimeToolBrief(toolUse.toolName, requestSummary, headline) ? (
        <div className="chat-tool-trace-brief">
          <span>{requestSummary}</span>
        </div>
      ) : null}
      {approvalEvents.length > 0 ? (
        <div className="chat-tool-trace-attached-list">
          {approvalEvents.map((event) => renderApprovalEvent(event))}
        </div>
      ) : null}
      {questionEvents.length > 0 ? (
        <div className="chat-tool-trace-attached-list">
          {questionEvents.map((event) => renderQuestionEvent(event))}
        </div>
      ) : null}
      {childToolUses.length > 0 ? (
        <div className={`chat-tool-trace-children ${compact ? 'compact' : ''}`}>
          {childToolUses.map((childToolUse) => (
            <RuntimeToolTree
              key={childToolUse.id}
              toolUse={childToolUse}
              renderModel={renderModel}
              compact
              renderApprovalEvent={renderApprovalEvent}
              renderQuestionEvent={renderQuestionEvent}
              renderRuntimeFileChanges={renderRuntimeFileChanges}
              helpers={helpers}
            />
          ))}
        </div>
      ) : null}
      {resultEvent?.fileChanges?.length ? renderRuntimeFileChanges(resultEvent.fileChanges) : null}
      {helpers.shouldShowRuntimeToolTechnicalDetails({
        toolName: toolUse.toolName,
        status: effectiveStatus,
        toolInput: toolUse.input,
        output: resultEvent?.output,
      }) ? (
        <details className="chat-tool-trace-detail-toggle">
          <summary>{'\u6280\u672f\u7ec6\u8282'}</summary>
          {Object.keys(toolUse.input).length > 0 ? <pre>{JSON.stringify(toolUse.input, null, 2)}</pre> : null}
          {resultEvent?.output?.trim() ? <pre className="chat-tool-trace-result">{resultEvent.output}</pre> : null}
        </details>
      ) : null}
    </details>
  );
};

export const RuntimeToolGroup = React.memo(function RuntimeToolGroup({
  toolUses,
  renderModel,
  index,
  groupId,
  groupLabel,
  renderApprovalEvent,
  renderQuestionEvent,
  renderRuntimeFileChanges,
  helpers,
}: {
  toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>;
  renderModel: RuntimeEventRenderModel;
  index: number;
  groupId: string;
  groupLabel?: string;
  renderApprovalEvent: (event: Extract<StoredChatRuntimeEvent, { kind: 'approval' }>) => React.ReactNode;
  renderQuestionEvent: (event: Extract<StoredChatRuntimeEvent, { kind: 'question' }>) => React.ReactNode;
  renderRuntimeFileChanges: (fileChanges: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']>) => React.ReactNode;
  helpers: RuntimeToolHelpers;
}) {
  if (toolUses.length === 1) {
    return (
      <RuntimeToolTree
        toolUse={toolUses[0]!}
        renderModel={renderModel}
        indexLabel={String(index + 1)}
        renderApprovalEvent={renderApprovalEvent}
        renderQuestionEvent={renderQuestionEvent}
        renderRuntimeFileChanges={renderRuntimeFileChanges}
        helpers={helpers}
      />
    );
  }

  const groupSummary = helpers.buildRuntimeEventGroupSummary(toolUses, renderModel.resultMap);

  return (
    <details key={groupId} className="chat-tool-trace-phase" open={helpers.shouldOpenRuntimeToolGroup(toolUses, renderModel)}>
      <summary>
        <div className="chat-tool-trace-inline-copy">
          <span className="chat-tool-trace-glyph" aria-hidden="true" />
          <strong>{groupLabel || `${index + 1}. ${'\u6267\u884c\u6b65\u9aa4'}`}</strong>
          <span className="chat-tool-trace-caret" aria-hidden="true">⌄</span>
        </div>
        <span>{groupSummary}</span>
      </summary>
      <div className="chat-tool-trace-members">
        {toolUses.map((toolUse) => (
          <RuntimeToolTree
            key={toolUse.id}
            toolUse={toolUse}
            renderModel={renderModel}
            renderApprovalEvent={renderApprovalEvent}
            renderQuestionEvent={renderQuestionEvent}
            renderRuntimeFileChanges={renderRuntimeFileChanges}
            helpers={helpers}
          />
        ))}
      </div>
    </details>
  );
});

export const RuntimeStandaloneResultBlock: React.FC<{
  event: Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>;
  index: number;
  renderRuntimeFileChanges: (
    fileChanges: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']>
  ) => React.ReactNode;
  helpers: RuntimeToolHelpers;
}> = ({ event, index, renderRuntimeFileChanges, helpers }) => (
  <details
    key={event.id}
    className={`chat-tool-trace-step ${event.status}`}
    open={event.status === 'failed' || event.status === 'blocked'}
  >
    <summary>
      <div className="chat-tool-trace-summary-copy">
        <strong>{index + 1}. {helpers.getRuntimeStatusLabel(event.status as RuntimeStatus)}</strong>
        <span>{helpers.summarizeRuntimeFileChanges(event.fileChanges) || helpers.summarizeRuntimeOutput(event.output) || helpers.getRuntimeStatusLabel(event.status as RuntimeStatus)}</span>
      </div>
      <span className={`chat-tool-trace-status ${event.status}`}>{helpers.getRuntimeStatusLabel(event.status as RuntimeStatus)}</span>
    </summary>
    {event.fileChanges?.length ? renderRuntimeFileChanges(event.fileChanges) : null}
    {event.output?.trim() ? (
      <details className="chat-tool-trace-detail-toggle">
        <summary>{'\u6280\u672f\u7ec6\u8282'}</summary>
        <pre className="chat-tool-trace-result">{event.output}</pre>
      </details>
    ) : null}
  </details>
);

const FallbackToolTreeInner: React.FC<{ toolCall: RuntimeToolStep; indexLabel?: string; compact?: boolean; childToolCallsByParent: Map<string, RuntimeToolStep[]>; helpers: RuntimeToolHelpers; }> = ({ toolCall, indexLabel, compact = false, childToolCallsByParent, helpers }) => {
  const childToolCalls = childToolCallsByParent.get(toolCall.id) || [];

  return (
    <details
      key={toolCall.id}
      className={`chat-tool-trace-step ${toolCall.status}`}
      open={toolCall.status === 'running' || toolCall.status === 'failed'}
    >
      <summary>
        <strong>{indexLabel ? `${indexLabel}. ` : ''}{toolCall.name}</strong>
        <span>
          {helpers.summarizeRuntimeToolCall(toolCall.name, toolCall.input) || (
            toolCall.status === 'completed'
              ? '\u5df2\u5b8c\u6210'
              : toolCall.status === 'failed'
                ? '\u5931\u8d25'
                : toolCall.status === 'blocked'
                  ? '\u5df2\u963b\u6b62'
                  : '\u6267\u884c\u4e2d'
          )}
        </span>
      </summary>
      <pre>{JSON.stringify(toolCall.input, null, 2)}</pre>
      {childToolCalls.length > 0 ? (
        <div className={`chat-tool-trace-children ${compact ? 'compact' : ''}`}>
          {childToolCalls.map((childToolCall) => (
            <RuntimeFallbackToolTree
              key={childToolCall.id}
              toolCall={childToolCall}
              compact
              childToolCallsByParent={childToolCallsByParent}
              helpers={helpers}
            />
          ))}
        </div>
      ) : null}
      {toolCall.fileChanges && toolCall.fileChanges.length > 0 ? (
        <div className="chat-tool-trace-file-list">
          {toolCall.fileChanges.map((change) => (
            <div key={`${toolCall.id}-${change.path}`} className="chat-tool-trace-file-item">
              <strong>{helpers.summarizeProjectFilePath(change.path)}</strong>
              <span>
                {change.beforeContent === null && change.afterContent !== null
                  ? '\u65b0\u5efa'
                  : change.beforeContent !== null && change.afterContent === null
                    ? '\u5220\u9664'
                    : '\u4fee\u6539'}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {toolCall.resultContent || toolCall.resultPreview ? (
        <pre className="chat-tool-trace-result">{toolCall.resultContent || toolCall.resultPreview}</pre>
      ) : null}
    </details>
  );
};

export const RuntimeFallbackToolTree = React.memo(FallbackToolTreeInner);
