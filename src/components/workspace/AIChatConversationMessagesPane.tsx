import React, { useCallback, useMemo } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { GNAgentMessageList, type MessageBubbleCard } from '../ai/gn-agent/GNAgentEmbeddedPieces';
import { useApprovalStore } from '../../modules/ai/runtime/approval/approvalStore.ts';
import type { ApprovalRecord } from '../../modules/ai/runtime/approval/approvalTypes.ts';
import { applyAssistantReasoningProgress } from '../../modules/ai/store/assistantTimeline.ts';
import type { StoredChatMessage } from '../../modules/ai/store/aiChatStore.ts';
import type { AIChatMessagePart } from './aiChatMessageParts';
import type { AssistantDraftState } from './assistantRenderModel.ts';
import {
  AIChatRuntimeApprovalList,
  AIChatRuntimeTimelineInteractionEvent,
} from './AIChatRuntimeInteractionCards.tsx';
import { useActiveConversationApprovals, useActiveConversationLiveState, useActiveConversationMessages } from '../../modules/ai/runtime/conversation/useRuntimeConversationGateway.ts';
import type { RuntimePendingApprovalAction } from '../../modules/ai/runtime/orchestration/runtimeApprovalCoordinator.ts';
import { getLatestPendingRuntimeApprovalEvent } from './runtimeInteractionSelectors.ts';

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
  renderTimelineProjection: (message: StoredChatMessage) => ReactNode;
  renderToolExecutionCard: (message: StoredChatMessage) => MessageBubbleCard[] | null;
  renderRunSummaryCard: (message: StoredChatMessage) => ReactNode;
  renderRuntimeQuestion: (message: StoredChatMessage) => ReactNode;
  messageListRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  leadingContent?: ReactNode;
  pendingApprovalActionsRef: MutableRefObject<Record<string, RuntimePendingApprovalAction | undefined>>;
  summarizeProjectFilePath: (path: string) => string;
  onApprove: (approvalId: string) => void | Promise<void>;
  onDeny: (approvalId: string) => void | Promise<void>;
  approvalStatusLabelMap: Record<ApprovalRecord['status'], string>;
  approvalRiskLabelMap: Record<ApprovalRecord['riskLevel'], string>;
  approvalActionLabelMap: Record<string, string>;
};

const EMPTY_APPROVALS: ApprovalRecord[] = [];

export const AIChatConversationMessagesPane = React.memo(function AIChatConversationMessagesPane({
  projectId,
  draftContents,
  formatTimestamp,
  parseMessageParts,
  renderMessagePart,
  renderStructuredCards,
  renderProjectFileProposal,
  renderTimelineProjection,
  renderToolExecutionCard,
  renderRunSummaryCard,
  renderRuntimeQuestion,
  messageListRef,
  messagesEndRef,
  leadingContent,
  pendingApprovalActionsRef,
  summarizeProjectFilePath,
  onApprove,
  onDeny,
  approvalStatusLabelMap,
  approvalRiskLabelMap,
  approvalActionLabelMap,
}: AIChatConversationMessagesPaneProps) {
  const { messages } = useActiveConversationMessages({ projectId });
  const { approvalThreadId } = useActiveConversationApprovals({ projectId });
  const { liveState } = useActiveConversationLiveState({ projectId });
  const approvals = useApprovalStore((state) =>
    approvalThreadId ? state.approvalsByThread[approvalThreadId] || EMPTY_APPROVALS : EMPTY_APPROVALS,
  );

  const effectiveStreamingDraftContents = useMemo(() => {
    if (!liveState?.activeThinking) {
      return draftContents;
    }

    const reasoningReferenceTime = Date.now();
    return Object.fromEntries(
      Object.entries(draftContents).map(([messageId, draftState]) => [
        messageId,
        {
          ...draftState,
          timeline: applyAssistantReasoningProgress(draftState.timeline, {
            active: true,
            referenceTime: reasoningReferenceTime,
          }),
        },
      ]),
    );
  }, [draftContents, liveState?.activeThinking]);

  const handleIgnoredQuestionAnswer = useCallback(() => undefined, []);

  const renderRuntimeApproval = useCallback(
    (message: StoredChatMessage) => {
      if (message.role !== 'assistant' || message.projectFileProposal) {
        return null;
      }

      const approvalEvent = getLatestPendingRuntimeApprovalEvent(message);
      if (approvalEvent) {
        return (
          <AIChatRuntimeTimelineInteractionEvent
            messageId={message.id}
            event={approvalEvent}
            summarizeProjectFilePath={summarizeProjectFilePath}
            onApprove={(approvalId) => void onApprove(approvalId)}
            onDeny={(approvalId) => void onDeny(approvalId)}
            onAnswerQuestion={handleIgnoredQuestionAnswer}
            approvalStatusLabelMap={approvalStatusLabelMap}
            approvalRiskLabelMap={approvalRiskLabelMap}
            approvalActionLabelMap={approvalActionLabelMap}
          />
        );
      }

      if (!approvalThreadId) {
        return null;
      }

      const messageApprovals = approvals.filter((approval) => approval.messageId === message.id);
      if (messageApprovals.length === 0) {
        return null;
      }

      return (
        <AIChatRuntimeApprovalList
          approvals={messageApprovals}
          pendingApprovalDisplays={Object.fromEntries(
            messageApprovals.map((approval) => [approval.id, pendingApprovalActionsRef.current[approval.id]?.display]),
          )}
          summarizeProjectFilePath={summarizeProjectFilePath}
          onApprove={(approvalId) => void onApprove(approvalId)}
          onDeny={(approvalId) => void onDeny(approvalId)}
          approvalStatusLabelMap={approvalStatusLabelMap}
          approvalRiskLabelMap={approvalRiskLabelMap}
          approvalActionLabelMap={approvalActionLabelMap}
        />
      );
    },
    [
      approvalActionLabelMap,
      approvalRiskLabelMap,
      approvalStatusLabelMap,
      approvalThreadId,
      approvals,
      handleIgnoredQuestionAnswer,
      onApprove,
      onDeny,
      pendingApprovalActionsRef,
      summarizeProjectFilePath,
    ],
  );

  return (
    <GNAgentMessageList
      messages={messages}
      draftContents={effectiveStreamingDraftContents}
      formatTimestamp={formatTimestamp}
      parseMessageParts={parseMessageParts}
      renderMessagePart={renderMessagePart}
      renderStructuredCards={renderStructuredCards}
      renderProjectFileProposal={renderProjectFileProposal}
      renderTimelineProjection={renderTimelineProjection}
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
