import React, { useCallback } from 'react';
import type { ReactNode } from 'react';
import { GNAgentMessageList, type MessageBubbleCard } from '../ai/gn-agent/GNAgentEmbeddedPieces';
import type { ApprovalRecord } from '../../modules/ai/runtime/approval/approvalTypes.ts';
import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';
import type { AIChatMessagePart } from './aiChatMessageParts';
import type { AssistantDraftState } from './assistantRenderModel.ts';
import { AIChatRuntimeTimelineInteractionEvent } from './AIChatRuntimeInteractionCards.tsx';
import { useActiveConversationMessages } from '../../modules/ai/runtime/conversation/useRuntimeConversationGateway.ts';
import { getRuntimeApprovalRenderEntries } from './runtimeInteractionRenderModel.ts';

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
      thinkingExpanded?: boolean;
      onToggleThinking?: () => void;
    },
  ) => ReactNode;
  renderStructuredCards: (message: StoredChatMessage) => ReactNode;
  renderProjectFileProposal: (message: StoredChatMessage) => ReactNode;
  renderTimelineCards: (message: StoredChatMessage) => MessageBubbleCard[] | null;
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

  const handleIgnoredQuestionAnswer = useCallback(() => undefined, []);

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
