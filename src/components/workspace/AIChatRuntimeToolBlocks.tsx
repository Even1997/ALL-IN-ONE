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

const StepCopy: React.FC<{
  headline: string;
  previewText?: string;
  dotStatus: RuntimeStatus;
  prefix?: string;
}> = ({ headline, previewText, dotStatus, prefix }) => (
  <>
    <span className={`chat-tool-step-dot ${dotStatus}`} aria-hidden="true" />
    <div className="chat-tool-trace-summary-copy">
      <strong>{prefix ? `${prefix}${headline}` : headline}</strong>
      {previewText ? <span>{previewText}</span> : null}
    </div>
  </>
);

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
  const hasBrief = helpers.shouldShowRuntimeToolBrief(toolUse.toolName, requestSummary, headline);
  const hasTechnicalDetails = helpers.shouldShowRuntimeToolTechnicalDetails({
    toolName: toolUse.toolName,
    status: effectiveStatus,
    toolInput: toolUse.input,
    output: resultEvent?.output,
  });
  const hasDetails =
    hasBrief ||
    approvalEvents.length > 0 ||
    questionEvents.length > 0 ||
    childToolUses.length > 0 ||
    Boolean(resultEvent?.fileChanges?.length) ||
    hasTechnicalDetails;

  if (!hasDetails) {
    return (
      <article className={`chat-tool-trace-step ${effectiveStatus}`} data-has-details="false">
        <div className="chat-tool-step-shell static">
          <StepCopy
            dotStatus={effectiveStatus}
            headline={headline}
            previewText={previewText && previewText !== headline ? previewText : undefined}
            prefix={indexLabel ? `${indexLabel}. ` : undefined}
          />
        </div>
      </article>
    );
  }

  return (
    <details
      key={toolUse.id}
      className={`chat-tool-trace-step ${effectiveStatus}`}
      data-has-details="true"
      open={helpers.shouldOpenRuntimeToolStep({
        status: effectiveStatus,
        approvalCount: approvalEvents.length,
        questionCount: questionEvents.length,
      })}
    >
      <summary className="chat-tool-step-shell">
        <StepCopy
          dotStatus={effectiveStatus}
          headline={headline}
          previewText={previewText && previewText !== headline ? previewText : undefined}
          prefix={indexLabel ? `${indexLabel}. ` : undefined}
        />
      </summary>
      <div className="chat-tool-step-detail">
        {hasBrief ? (
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
        {hasTechnicalDetails ? (
          <details className="chat-tool-trace-detail-toggle">
            <summary>更多细节</summary>
            {Object.keys(toolUse.input).length > 0 ? <pre>{JSON.stringify(toolUse.input, null, 2)}</pre> : null}
            {resultEvent?.output?.trim() ? <pre className="chat-tool-trace-result">{resultEvent.output}</pre> : null}
          </details>
        ) : null}
      </div>
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
  renderRuntimeFileChanges: (
    fileChanges: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']>
  ) => React.ReactNode;
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
    <details
      key={groupId}
      className="chat-tool-trace-phase"
      data-has-details="true"
      open={helpers.shouldOpenRuntimeToolGroup(toolUses, renderModel)}
    >
      <summary className="chat-tool-step-shell">
        <StepCopy
          dotStatus="completed"
          headline={groupLabel || `${index + 1}. 执行步骤`}
          previewText={groupSummary}
        />
      </summary>
      <div className="chat-tool-step-detail">
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
}> = ({ event, index, renderRuntimeFileChanges, helpers }) => {
  const preview =
    helpers.summarizeRuntimeFileChanges(event.fileChanges) ||
    helpers.summarizeRuntimeOutput(event.output) ||
    helpers.getRuntimeStatusLabel(event.status as RuntimeStatus);
  const hasDetails = Boolean(event.fileChanges?.length) || Boolean(event.output?.trim());

  if (!hasDetails) {
    return (
      <article className={`chat-tool-trace-step ${event.status}`} data-has-details="false">
        <div className="chat-tool-step-shell static">
          <StepCopy
            dotStatus={event.status as RuntimeStatus}
            headline={`${index + 1}. ${helpers.getRuntimeStatusLabel(event.status as RuntimeStatus)}`}
            previewText={preview}
          />
        </div>
      </article>
    );
  }

  return (
    <details
      key={event.id}
      className={`chat-tool-trace-step ${event.status}`}
      data-has-details="true"
      open={event.status === 'failed' || event.status === 'blocked'}
    >
      <summary className="chat-tool-step-shell">
        <StepCopy
          dotStatus={event.status as RuntimeStatus}
          headline={`${index + 1}. ${helpers.getRuntimeStatusLabel(event.status as RuntimeStatus)}`}
          previewText={preview}
        />
      </summary>
      <div className="chat-tool-step-detail">
        {event.fileChanges?.length ? renderRuntimeFileChanges(event.fileChanges) : null}
        {event.output?.trim() ? (
          <details className="chat-tool-trace-detail-toggle">
            <summary>更多细节</summary>
            <pre className="chat-tool-trace-result">{event.output}</pre>
          </details>
        ) : null}
      </div>
    </details>
  );
};

const FallbackToolTreeInner: React.FC<{
  toolCall: RuntimeToolStep;
  indexLabel?: string;
  compact?: boolean;
  childToolCallsByParent: Map<string, RuntimeToolStep[]>;
  helpers: RuntimeToolHelpers;
}> = ({ toolCall, indexLabel, compact = false, childToolCallsByParent, helpers }) => {
  const childToolCalls = childToolCallsByParent.get(toolCall.id) || [];
  const headline = helpers.getRuntimeToolHeadline(toolCall.name, toolCall.input);
  const requestSummary = helpers.summarizeRuntimeToolCall(toolCall.name, toolCall.input);
  const previewText =
    toolCall.fileChanges?.length
      ? helpers.summarizeRuntimeFileChanges(toolCall.fileChanges)
      : toolCall.resultPreview || toolCall.resultContent
        ? helpers.summarizeRuntimeOutput(toolCall.resultPreview || toolCall.resultContent || '')
        : requestSummary;
  const hasDetails =
    childToolCalls.length > 0 ||
    Boolean(toolCall.fileChanges?.length) ||
    Boolean(toolCall.resultContent || toolCall.resultPreview) ||
    Object.keys(toolCall.input).length > 0;

  if (!hasDetails) {
    return (
      <article className={`chat-tool-trace-step ${toolCall.status}`} data-has-details="false">
        <div className="chat-tool-step-shell static">
          <StepCopy
            dotStatus={toolCall.status}
            headline={headline}
            previewText={previewText && previewText !== headline ? previewText : undefined}
            prefix={indexLabel ? `${indexLabel}. ` : undefined}
          />
        </div>
      </article>
    );
  }

  return (
    <details
      key={toolCall.id}
      className={`chat-tool-trace-step ${toolCall.status}`}
      data-has-details="true"
      open={toolCall.status === 'failed' || toolCall.status === 'blocked'}
    >
      <summary className="chat-tool-step-shell">
        <StepCopy
          dotStatus={toolCall.status}
          headline={headline}
          previewText={previewText && previewText !== headline ? previewText : undefined}
          prefix={indexLabel ? `${indexLabel}. ` : undefined}
        />
      </summary>
      <div className="chat-tool-step-detail">
        {requestSummary && requestSummary !== headline ? (
          <div className="chat-tool-trace-brief">
            <span>{requestSummary}</span>
          </div>
        ) : null}
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
                    ? '新建'
                    : change.beforeContent !== null && change.afterContent === null
                      ? '删除'
                      : '修改'}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {Object.keys(toolCall.input).length > 0 || toolCall.resultContent || toolCall.resultPreview ? (
          <details className="chat-tool-trace-detail-toggle">
            <summary>更多细节</summary>
            {Object.keys(toolCall.input).length > 0 ? <pre>{JSON.stringify(toolCall.input, null, 2)}</pre> : null}
            {toolCall.resultContent || toolCall.resultPreview ? (
              <pre className="chat-tool-trace-result">{toolCall.resultContent || toolCall.resultPreview}</pre>
            ) : null}
          </details>
        ) : null}
      </div>
    </details>
  );
};

export const RuntimeFallbackToolTree = React.memo(FallbackToolTreeInner);
