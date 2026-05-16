// 文件作用：消息列表面板组件，位于聊天工作台前端展示层。
// 所在链路：负责把 runtime 与 store 投影结果组织成聊天界面。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import React, { useCallback } from 'react';
// 这个文件负责把会话消息渲染成消息列表区域。
// 它更偏展示编排层：把 render model、过程摘要、消息卡片和交互回调接到消息列表组件上。
// 如果你在排查“消息为什么这样显示/排序/分组”，先看这里和对应 render model。
import type { ReactNode } from 'react';
import {
  GNAgentMessageList,
  type MessageBubbleCard,
  type MessageProcessSummary,
} from '../ai/gn-agent/GNAgentEmbeddedPieces';
import type { StreamingLatencyTrace } from '../../modules/ai/runtime/streamingLatencyTrace.ts';
import type { ApprovalRecord } from '../../modules/ai/runtime/approval/approvalTypes.ts';
import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';
import type { AIChatMessagePart } from './aiChatMessageParts';
import type { AssistantDraftState } from './assistantRenderModel.ts';
import { AIChatRuntimeTimelineInteractionEvent } from './AIChatRuntimeInteractionCards.tsx';
import { useActiveConversationMessages } from '../../modules/ai/runtime/conversation/useRuntimeConversationGateway.ts';
import { getRuntimeApprovalRenderEntries } from './runtimeInteractionRenderModel.ts';

// 这个组件是聊天消息区的装配层：
// - 它不自己维护消息状态，而是从 active conversation 里取当前消息。
// - 它主要负责把“普通消息渲染”和“runtime 交互卡片渲染”拼成同一条消息流。
type AIChatConversationMessagesPaneProps = {
  projectId: string | null;
  draftContents: Record<string, AssistantDraftState>;
  formatTimestamp: (value: number) => string;
  parseMessageParts: (content: string) => AIChatMessagePart[];
  renderMessagePart: (
    message: StoredChatMessage,
    messageId: string,
    part: AIChatMessagePart,
    index: number,
    options?: {
      content: string;
      isStreaming: boolean;
      streamingLatencyTrace?: StreamingLatencyTrace | null;
      onFirstVisibleChar?: () => void;
      onFinalVisibleDone?: () => void;
    },
  ) => ReactNode;
  renderStructuredCards: (message: StoredChatMessage) => ReactNode;
  renderProjectFileProposal: (message: StoredChatMessage) => ReactNode;
  renderTimelineCards: (message: StoredChatMessage) => MessageBubbleCard[] | null;
  renderTimelineProcessSummary: (message: StoredChatMessage) => MessageProcessSummary | null;
  renderToolExecutionCard: (message: StoredChatMessage) => MessageBubbleCard[] | null;
  renderRunSummaryCard: (message: StoredChatMessage) => ReactNode;
  renderRuntimeQuestion: (message: StoredChatMessage) => MessageBubbleCard[] | null;
  messageListRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  leadingContent?: ReactNode;
  summarizeProjectFilePath: (path: string) => string;
  onApprove: (approvalId: string) => void | Promise<void>;
  onDeny: (approvalId: string) => void | Promise<void>;
  approvalStatusLabelMap: Record<ApprovalRecord['status'], string>;
  approvalRiskLabelMap: Record<ApprovalRecord['riskLevel'], string>;
  approvalActionLabelMap: Record<string, string>;
};

export const AIChatConversationMessagesPane = React.memo(function AIChatConversationMessagesPane({
  projectId,
  draftContents,
  formatTimestamp,
  parseMessageParts,
  renderMessagePart,
  renderStructuredCards,
  renderProjectFileProposal,
  renderTimelineCards,
  renderTimelineProcessSummary,
  renderToolExecutionCard,
  renderRunSummaryCard,
  renderRuntimeQuestion,
  messageListRef,
  messagesEndRef,
  leadingContent,
  summarizeProjectFilePath,
  onApprove,
  onDeny,
  approvalStatusLabelMap,
  approvalRiskLabelMap,
  approvalActionLabelMap,
}: AIChatConversationMessagesPaneProps) {
  const { messages } = useActiveConversationMessages({ projectId });

  // 这个 pane 只负责审批卡片；
  // 问题卡片在别的渲染入口处理，所以这里显式忽略 answer 事件回调。
  const handleIgnoredQuestionAnswer = useCallback(() => undefined, []);

  // runtime approval 并不是独立消息，而是从 assistant message 的 timeline 中抽出来，
  // 再转成插入消息流的交互卡片。
  const renderRuntimeApproval = useCallback(
    (message: StoredChatMessage) => {
      if (message.role !== 'assistant' || message.projectFileProposal) {
        return null;
      }

      const approvalEntries = getRuntimeApprovalRenderEntries(message);
      if (approvalEntries.length === 0) {
        return null;
      }

      return approvalEntries.map(({ event, createdAt, timelineOrder }) => ({
        node: (
          <AIChatRuntimeTimelineInteractionEvent
            messageId={message.id}
            event={event}
            summarizeProjectFilePath={summarizeProjectFilePath}
            onApprove={(approvalId) => void onApprove(approvalId)}
            onDeny={(approvalId) => void onDeny(approvalId)}
            onAnswerQuestion={handleIgnoredQuestionAnswer}
            approvalStatusLabelMap={approvalStatusLabelMap}
            approvalRiskLabelMap={approvalRiskLabelMap}
            approvalActionLabelMap={approvalActionLabelMap}
          />
        ),
        createdAt,
        timelineOrder,
      }));
    },
    [
      approvalActionLabelMap,
      approvalRiskLabelMap,
      approvalStatusLabelMap,
      handleIgnoredQuestionAnswer,
      onApprove,
      onDeny,
      summarizeProjectFilePath,
    ],
  );

  return (
    <GNAgentMessageList
      messages={messages}
      draftContents={draftContents}
      formatTimestamp={formatTimestamp}
      parseMessageParts={parseMessageParts}
      renderMessagePart={renderMessagePart}
      renderStructuredCards={renderStructuredCards}
      renderProjectFileProposal={renderProjectFileProposal}
      renderTimelineCards={renderTimelineCards}
      renderTimelineProcessSummary={renderTimelineProcessSummary}
      renderToolExecutionCard={renderToolExecutionCard}
      renderRunSummaryCard={renderRunSummaryCard}
      renderRuntimeApproval={renderRuntimeApproval}
      renderRuntimeQuestion={renderRuntimeQuestion}
      listRef={messageListRef}
      messagesEndRef={messagesEndRef}
      leadingContent={leadingContent}
    />
  );
});
