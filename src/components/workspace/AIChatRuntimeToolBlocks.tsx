import React from 'react';
import type { StoredChatRuntimeEvent } from '../../modules/ai/store/aiChatStore';
import type { RuntimeEventRenderModel, RuntimeToolGroupType } from './runtimeEventRenderModel';
import type { RuntimeStatus, RuntimeToolHelpers } from './AIChatRuntimeToolTypes';

const WRAPPER_TOOL_NAMES = new Set(['project_file_flow', 'project_file_apply']);
const OUTPUT_VISIBLE_TOOL_NAMES = new Set(['bash', 'powershell', 'ls', 'glob', 'grep']);

const getToolUseStatus = (
  toolUse: Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>,
  renderModel: RuntimeEventRenderModel
): RuntimeStatus => (renderModel.resultMap.get(toolUse.toolCallId)?.status || toolUse.status) as RuntimeStatus;

const getGroupRuntimeStatus = (
  toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>,
  renderModel: RuntimeEventRenderModel
): RuntimeStatus => {
  if (toolUses.some((toolUse) => getToolUseStatus(toolUse, renderModel) === 'failed')) {
    return 'failed';
  }
  if (toolUses.some((toolUse) => getToolUseStatus(toolUse, renderModel) === 'blocked')) {
    return 'blocked';
  }
  if (toolUses.some((toolUse) => getToolUseStatus(toolUse, renderModel) === 'running')) {
    return 'running';
  }
  return 'completed';
};

const buildCollapsedGroupHeadline = ({
  status,
  groupType,
  groupLabel,
  itemCount,
  singleHeadline,
  helpers,
}: {
  status: RuntimeStatus;
  groupType: RuntimeToolGroupType;
  groupLabel?: string;
  itemCount: number;
  singleHeadline?: string;
  helpers: RuntimeToolHelpers;
}) => {
  if (status === 'running') {
    return '执行中';
  }
  if (status === 'blocked') {
    return singleHeadline === '等待输入' ? singleHeadline : '等待确认';
  }
  if (status === 'failed') {
    return '执行失败';
  }
  if (itemCount === 1) {
    return singleHeadline || (groupType === 'input' ? '等待输入' : '工具执行');
  }
  if (groupLabel) {
    return groupLabel;
  }
  return helpers.getRuntimeCommandCountLabel(itemCount);
};

const buildGroupMetaText = ({
  status,
  groupLabel,
  itemCount,
  previewText,
  helpers,
}: {
  status: RuntimeStatus;
  groupLabel?: string;
  itemCount: number;
  previewText?: string;
  helpers: RuntimeToolHelpers;
}) => {
  if (previewText) {
    return previewText;
  }
  if (itemCount === 1) {
    return '';
  }
  if (status !== 'completed') {
    return groupLabel || helpers.getRuntimeCommandCountLabel(itemCount);
  }
  if (groupLabel && itemCount > 1) {
    return `共 ${itemCount} 步`;
  }
  return '';
};

const shouldCollapseRuntimeWrapper = (input: {
  toolName: string;
  childCount: number;
  approvalCount: number;
  questionCount: number;
  hasFileChanges: boolean;
  hasOutput: boolean;
}) =>
  WRAPPER_TOOL_NAMES.has(input.toolName) &&
  input.childCount === 1 &&
  input.approvalCount === 0 &&
  input.questionCount === 0 &&
  !input.hasFileChanges &&
  !input.hasOutput;

const getToolUseContext = (
  toolUse: Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>,
  renderModel: RuntimeEventRenderModel
) => {
  const resultEvent = renderModel.resultMap.get(toolUse.toolCallId);
  const approvalEvents = renderModel.approvalsByToolCallId.get(toolUse.toolCallId) || [];
  const questionEvents = renderModel.questionsByToolCallId.get(toolUse.toolCallId) || [];
  const childToolUses = renderModel.childToolUsesByParent.get(toolUse.toolCallId) || [];
  const status = getToolUseStatus(toolUse, renderModel);

  return {
    resultEvent,
    approvalEvents,
    questionEvents,
    childToolUses,
    status,
    hasOutput: Boolean(resultEvent?.output?.trim()),
    hasFileChanges: Boolean(resultEvent?.fileChanges?.length),
  };
};

const isCollapsibleWrapperToolUse = (
  toolUse: Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>,
  renderModel: RuntimeEventRenderModel
) => {
  const { approvalEvents, questionEvents, childToolUses, hasFileChanges, hasOutput } = getToolUseContext(toolUse, renderModel);
  return shouldCollapseRuntimeWrapper({
    toolName: toolUse.toolName,
    childCount: childToolUses.length,
    approvalCount: approvalEvents.length,
    questionCount: questionEvents.length,
    hasFileChanges,
    hasOutput,
  });
};

const getVisibleToolUse = (
  toolUse: Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>,
  renderModel: RuntimeEventRenderModel
): Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }> => {
  if (!isCollapsibleWrapperToolUse(toolUse, renderModel)) {
    return toolUse;
  }

  const childToolUse = (renderModel.childToolUsesByParent.get(toolUse.toolCallId) || [])[0];
  return childToolUse ? getVisibleToolUse(childToolUse, renderModel) : toolUse;
};

const buildToolUsePreviewText = (
  toolUse: Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>,
  renderModel: RuntimeEventRenderModel,
  helpers: RuntimeToolHelpers
) => {
  const { resultEvent, approvalEvents, questionEvents, status } = getToolUseContext(toolUse, renderModel);
  const headline = helpers.getRuntimeToolHeadline(toolUse.toolName, toolUse.input);
  const summary = helpers.summarizeRuntimeToolCall(toolUse.toolName, toolUse.input).trim();

  if (questionEvents.length > 0) {
    return `${questionEvents.length} 个问题等待你补充`;
  }
  if (approvalEvents.length > 0 && status !== 'completed') {
    return `${approvalEvents.length} 个权限确认待处理`;
  }
  if (summary && summary !== headline) {
    return summary;
  }
  if (resultEvent?.fileChanges?.length) {
    return helpers.summarizeRuntimeFileChanges(resultEvent.fileChanges);
  }
  if ((status === 'failed' || status === 'blocked') && resultEvent?.output) {
    return helpers.summarizeRuntimeOutput(resultEvent.output, 140);
  }
  return '';
};

const shouldRenderToolResultDetail = (
  event: Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>,
  renderModel: RuntimeEventRenderModel
) => {
  const toolName = renderModel.toolUseByToolCallId.get(event.toolCallId)?.toolName || event.toolName;
  const hasVisibleOutput =
    event.status === 'completed' &&
    Boolean(event.output?.trim()) &&
    Boolean(toolName && OUTPUT_VISIBLE_TOOL_NAMES.has(toolName));

  return Boolean(event.fileChanges?.length) || event.status === 'failed' || event.status === 'blocked' || hasVisibleOutput;
};

const collectGroupToolCallIds = (
  toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>,
  renderModel: RuntimeEventRenderModel
) => {
  const groupToolCallIds = new Set<string>();

  const visit = (toolUse: Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>) => {
    if (groupToolCallIds.has(toolUse.toolCallId)) {
      return;
    }

    groupToolCallIds.add(toolUse.toolCallId);
    const childToolUses = renderModel.childToolUsesByParent.get(toolUse.toolCallId) || [];
    childToolUses.forEach(visit);
  };

  toolUses.forEach(visit);
  return groupToolCallIds;
};

const buildGroupTimelineEvents = (
  toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>,
  renderModel: RuntimeEventRenderModel
) => {
  const groupToolCallIds = collectGroupToolCallIds(toolUses, renderModel);

  return renderModel.orderedRuntimeEvents.filter((event) => {
    if (event.kind === 'tool_use') {
      return groupToolCallIds.has(event.toolCallId) && !isCollapsibleWrapperToolUse(event, renderModel);
    }
    if (event.kind === 'tool_result') {
      return groupToolCallIds.has(event.toolCallId) && shouldRenderToolResultDetail(event, renderModel);
    }
    if (event.kind === 'approval') {
      return Boolean(event.toolCallId && groupToolCallIds.has(event.toolCallId));
    }
    return Boolean(event.payload.toolCallId && groupToolCallIds.has(event.payload.toolCallId));
  });
};

const shouldHideToolUseDetailLine = (
  toolUse: Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>,
  renderModel: RuntimeEventRenderModel
) => {
  const visibleToolUse = getVisibleToolUse(toolUse, renderModel);
  const resultEvent = renderModel.resultMap.get(visibleToolUse.toolCallId);
  if (!resultEvent || resultEvent.status !== 'completed') {
    return false;
  }

  return Boolean(resultEvent.output?.trim()) && OUTPUT_VISIBLE_TOOL_NAMES.has(visibleToolUse.toolName);
};

const TraceLineCopy: React.FC<{
  headline: string;
  previewText?: string;
}> = ({ headline, previewText }) => (
  <div className="chat-tool-trace-line-copy">
    <strong title={headline}>{headline}</strong>
    {previewText ? <span title={previewText}>{previewText}</span> : null}
  </div>
);

const ToolUseTimelineLine: React.FC<{
  toolUse: Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>;
  renderModel: RuntimeEventRenderModel;
  helpers: RuntimeToolHelpers;
}> = ({ toolUse, renderModel, helpers }) => {
  const visibleToolUse = getVisibleToolUse(toolUse, renderModel);
  const status = getToolUseStatus(visibleToolUse, renderModel);
  const headline = helpers.getRuntimeToolHeadline(visibleToolUse.toolName, visibleToolUse.input);
  const previewText = buildToolUsePreviewText(visibleToolUse, renderModel, helpers);

  return (
    <article className={`chat-tool-trace-detail-line ${status}`} data-runtime-line="tool">
      <span className={`chat-tool-step-dot ${status}`} aria-hidden="true" />
      <TraceLineCopy headline={headline} previewText={previewText ? `· ${previewText}` : undefined} />
    </article>
  );
};

const ToolResultTimelineLine: React.FC<{
  event: Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>;
  renderRuntimeFileChanges: (
    fileChanges: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']>
  ) => React.ReactNode;
  helpers: RuntimeToolHelpers;
}> = ({ event, renderRuntimeFileChanges, helpers }) => {
  const headline = event.fileChanges?.length ? '文件变更' : helpers.getRuntimeStatusLabel(event.status as RuntimeStatus);
  const previewText = event.fileChanges?.length
    ? helpers.summarizeRuntimeFileChanges(event.fileChanges)
    : helpers.summarizeRuntimeOutput(event.output, 140);
  const shouldShowSummaryLine =
    Boolean(event.fileChanges?.length) || event.status === 'failed' || event.status === 'blocked' || !event.output?.trim();

  return (
    <div className="chat-tool-trace-detail-stack" data-runtime-line="result">
      {shouldShowSummaryLine ? (
        <article className={`chat-tool-trace-detail-line ${event.status}`} data-runtime-line="result-summary">
          <span className={`chat-tool-step-dot ${event.status as RuntimeStatus}`} aria-hidden="true" />
          <TraceLineCopy headline={headline} previewText={previewText ? `· ${previewText}` : undefined} />
        </article>
      ) : null}
      {event.fileChanges?.length ? (
        <div className="chat-tool-trace-detail-card">{renderRuntimeFileChanges(event.fileChanges)}</div>
      ) : null}
      {!event.fileChanges?.length && event.output?.trim() ? (
        <pre className="chat-tool-trace-detail-pre">{event.output}</pre>
      ) : null}
    </div>
  );
};

export const RuntimeToolGroup = React.memo(function RuntimeToolGroup({
  toolUses,
  renderModel,
  groupId,
  groupType,
  groupLabel,
  renderApprovalEvent,
  renderQuestionEvent,
  renderRuntimeFileChanges,
  helpers,
}: {
  toolUses: Array<Extract<StoredChatRuntimeEvent, { kind: 'tool_use' }>>;
  renderModel: RuntimeEventRenderModel;
  groupId: string;
  groupType: RuntimeToolGroupType;
  groupLabel?: string;
  renderApprovalEvent: (event: Extract<StoredChatRuntimeEvent, { kind: 'approval' }>) => React.ReactNode;
  renderQuestionEvent: (event: Extract<StoredChatRuntimeEvent, { kind: 'question' }>) => React.ReactNode;
  renderRuntimeFileChanges: (
    fileChanges: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']>
  ) => React.ReactNode;
  helpers: RuntimeToolHelpers;
}) {
  const visibleFirstToolUse = toolUses[0] ? getVisibleToolUse(toolUses[0], renderModel) : null;
  const singleHeadline = visibleFirstToolUse
    ? helpers.getRuntimeToolHeadline(visibleFirstToolUse.toolName, visibleFirstToolUse.input)
    : '';
  const groupStatus = getGroupRuntimeStatus(toolUses, renderModel);
  const groupHeadline = buildCollapsedGroupHeadline({
    status: groupStatus,
    groupType,
    groupLabel,
    itemCount: toolUses.length,
    singleHeadline,
    helpers,
  });
  const groupPreviewText =
    toolUses.length === 1 && visibleFirstToolUse
      ? buildToolUsePreviewText(visibleFirstToolUse, renderModel, helpers)
      : '';
  const groupMetaText = buildGroupMetaText({
    status: groupStatus,
    groupLabel,
    itemCount: toolUses.length,
    previewText: groupPreviewText,
    helpers,
  });
  const detailEvents = buildGroupTimelineEvents(toolUses, renderModel);

  return (
    <details
      key={groupId}
      className={`chat-tool-trace-group ${groupStatus}`}
      open={helpers.shouldOpenRuntimeToolGroup(toolUses, renderModel)}
    >
      <summary className="chat-inline-disclosure chat-tool-trace-group-summary">
        <div className="chat-tool-trace-group-main">
          <span className={`chat-tool-step-dot ${groupStatus}`} aria-hidden="true" />
          <div className="chat-tool-trace-group-copy">
            <strong title={groupHeadline}>{groupHeadline}</strong>
            {groupMetaText ? <span className="chat-tool-trace-group-meta" title={groupMetaText}>{groupMetaText}</span> : null}
          </div>
        </div>
        <span className="chat-tool-trace-caret" aria-hidden="true" />
      </summary>
      <div className="chat-tool-trace-group-detail">
        {detailEvents.map((event) => {
          if (event.kind === 'tool_use') {
            if (shouldHideToolUseDetailLine(event, renderModel)) {
              return null;
            }

            return (
              <ToolUseTimelineLine
                key={event.id}
                toolUse={event}
                renderModel={renderModel}
                helpers={helpers}
              />
            );
          }

          if (event.kind === 'tool_result') {
            return (
              <ToolResultTimelineLine
                key={event.id}
                event={event}
                renderRuntimeFileChanges={renderRuntimeFileChanges}
                helpers={helpers}
              />
            );
          }

          if (event.kind === 'approval') {
            return (
              <div key={event.id} className="chat-tool-trace-detail-card">
                {renderApprovalEvent(event)}
              </div>
            );
          }

          return (
            <div key={event.id} className="chat-tool-trace-detail-card">
              {renderQuestionEvent(event)}
            </div>
          );
        })}
      </div>
    </details>
  );
});

export const RuntimeStandaloneResultBlock: React.FC<{
  event: Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>;
  renderRuntimeFileChanges: (
    fileChanges: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']>
  ) => React.ReactNode;
  helpers: RuntimeToolHelpers;
}> = ({ event, renderRuntimeFileChanges, helpers }) => (
  <ToolResultTimelineLine
    event={event}
    renderRuntimeFileChanges={renderRuntimeFileChanges}
    helpers={helpers}
  />
);
