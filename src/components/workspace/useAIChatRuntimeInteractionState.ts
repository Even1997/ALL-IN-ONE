import { useCallback, useRef } from 'react';
import { buildRuntimeEventId } from '../../modules/ai/runtime/dispatch/agentEvents';
import { buildCapabilityApprovalLifecycleDescriptor } from '../../modules/ai/runtime/dispatch/runtimeCapabilityLifecycle.ts';
import { type AgentProviderId } from '../../modules/ai/runtime/agentRuntimeTypes';
import { type RuntimePendingApprovalAction, requestRuntimeApproval, resolveRuntimeApproval } from '../../modules/ai/runtime/orchestration/runtimeApprovalCoordinator';
import { type ApprovalRecord, type ApprovalStatus } from '../../modules/ai/runtime/approval/approvalTypes';
import { useApprovalStore } from '../../modules/ai/runtime/approval/approvalStore';
import { createReplayRecoveryController } from '../../modules/ai/runtime/replay/runtimeReplayRecovery';
import { useAgentRuntimeStore } from '../../modules/ai/runtime/agentRuntimeStore';
import {
  answerAssistantRuntimeQuestionEvent,
  mapAssistantRuntimeTimelineEvents,
  upsertAssistantRuntimeApprovalEvent,
  type AssistantTimelineEvent,
} from '../../modules/ai/store/assistantTimeline.ts';
import { type RuntimeQuestionPayload } from '../../modules/ai/store/aiChatStore';
import {
  answerRuntimeSidecarQuestion,
  resolveRuntimeSidecarApproval,
} from '../../modules/runtime-sidecar/runtimeSidecarSessionBridge.ts';

type RuntimePendingQuestionAction = {
  messageId: string;
  questionId: string;
  resolve: (answers: Record<string, string>) => void;
  reject: (reason?: string) => void;
};

type UseAIChatRuntimeInteractionStateInput = {
  activeSessionId: string | null;
  enqueueAgentApproval: (payload: {
    threadId: string;
    actionType: string;
    riskLevel: ApprovalRecord['riskLevel'];
    summary: string;
    messageId?: string | null;
  }) => Promise<ApprovalRecord>;
  enqueueApproval: ReturnType<typeof useApprovalStore.getState>['enqueueApproval'];
  resolveStoredApproval: ReturnType<typeof useApprovalStore.getState>['resolveApproval'];
  resolveAgentApproval: (payload: { approvalId: string; status: ApprovalStatus }) => Promise<unknown>;
  patchLiveState: ReturnType<typeof useAgentRuntimeStore.getState>['patchLiveState'];
  appendRuntimeTimelineEvent: ReturnType<typeof useAgentRuntimeStore.getState>['appendTimelineEvent'];
  persistRuntimeTimelineEvent: (input: {
    threadId: string;
    providerId: AgentProviderId;
    summary: string;
  }) => Promise<unknown>;
  replayRecoveryController: ReturnType<typeof createReplayRecoveryController>;
  updateAssistantMessageTimeline: (
    messageId: string,
    updater: (timeline: AssistantTimelineEvent[]) => AssistantTimelineEvent[]
  ) => void;
};

const createRuntimeEventId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const useAIChatRuntimeInteractionState = ({
  activeSessionId,
  enqueueAgentApproval,
  enqueueApproval,
  resolveStoredApproval,
  resolveAgentApproval,
  patchLiveState,
  appendRuntimeTimelineEvent,
  persistRuntimeTimelineEvent,
  replayRecoveryController,
  updateAssistantMessageTimeline,
}: UseAIChatRuntimeInteractionStateInput) => {
  const pendingApprovalActionsRef = useRef<Record<string, RuntimePendingApprovalAction>>({});
  const pendingQuestionActionsRef = useRef<Record<string, RuntimePendingQuestionAction>>({});

  const waitForRuntimeApproval = useCallback(
    async (input: RuntimePendingApprovalAction) => {
      const {
        threadId,
        runtimeStoreThreadId,
        replayThreadId,
        providerId,
        actionType,
        riskLevel,
        summary,
        messageId,
        toolCallId,
        onApprove,
        onDeny,
        display,
      } = input;
      if (
        !threadId
        || !runtimeStoreThreadId
        || !replayThreadId
        || !providerId
        || !actionType
        || !riskLevel
        || !summary
      ) {
        throw new Error('Runtime approval requests must include thread, provider, action, risk, and summary.');
      }

      let settled = false;
      const resolveApproval = async (approved: boolean) => {
        if (settled) {
          return approved;
        }
        settled = true;
        if (approved) {
          await onApprove();
          return true;
        }
        await onDeny?.();
        return false;
      };

      patchLiveState(threadId, (state) => ({
        ...state,
        connectionState: 'connected',
        statusVerb: 'Waiting for approval',
        pendingApprovalSummary: summary,
        pendingPermissionCount: state.pendingPermissionCount + 1,
      }));

      const approval = await requestRuntimeApproval({
        threadId,
        runtimeStoreThreadId,
        replayThreadId,
        providerId,
        actionType,
        riskLevel,
        summary,
        messageId,
        toolCallId,
        onApprove: async () => {
          await resolveApproval(true);
        },
        onDeny: async () => {
          await resolveApproval(false);
        },
        display,
        enqueueAgentApproval,
        enqueueApproval,
        pendingApprovalActions: pendingApprovalActionsRef.current,
      });

      const approvalLifecycle = buildCapabilityApprovalLifecycleDescriptor({
        approvalId: approval.id,
        actionType,
        riskLevel,
        summary,
        status: 'pending',
        toolCallId,
      });

      appendRuntimeTimelineEvent(runtimeStoreThreadId, {
        id: createRuntimeEventId('approval'),
        threadId: runtimeStoreThreadId,
        providerId: providerId as AgentProviderId,
        summary: approvalLifecycle.timelineSummary,
        createdAt: Date.now(),
      });
      await persistRuntimeTimelineEvent({
        threadId: replayThreadId,
        providerId: providerId as AgentProviderId,
        summary: approvalLifecycle.timelineSummary,
      });
      await replayRecoveryController.appendAndSync({
        runtimeStoreThreadId,
        replayThreadId,
        eventType: approvalLifecycle.replayEventType,
        payload: approvalLifecycle.replayPayload,
      });

      if (messageId) {
        updateAssistantMessageTimeline(messageId, (timeline) =>
          upsertAssistantRuntimeApprovalEvent(timeline, {
            id: buildRuntimeEventId('approval', approval.id),
            kind: 'approval',
            approvalId: approval.id,
            toolCallId,
            actionType,
            summary,
            riskLevel,
            status: 'pending',
            display,
            createdAt: Date.now(),
          }),
        );
      }

      return new Promise<boolean>((resolve) => {
        pendingApprovalActionsRef.current[approval.id] = {
          ...pendingApprovalActionsRef.current[approval.id],
          onApprove: async () => {
            resolve(await resolveApproval(true));
          },
          onDeny: async () => {
            resolve(await resolveApproval(false));
          },
        };
      });
    },
    [
      appendRuntimeTimelineEvent,
      enqueueAgentApproval,
      enqueueApproval,
      patchLiveState,
      persistRuntimeTimelineEvent,
      replayRecoveryController,
      updateAssistantMessageTimeline,
    ],
  );

  const waitForRuntimeQuestionAnswer = useCallback(
    async ({
      assistantMessageId,
      question,
    }: {
      assistantMessageId: string;
      question: RuntimeQuestionPayload;
    }) =>
      new Promise<Record<string, string>>((resolve, reject) => {
        pendingQuestionActionsRef.current[question.id] = {
          messageId: assistantMessageId,
          questionId: question.id,
          resolve,
          reject,
        };
      }),
    [],
  );

  const updateApprovalStatusInMessage = useCallback(
    (messageId: string, approvalId: string, status: 'approved' | 'denied') => {
      updateAssistantMessageTimeline(messageId, (timeline) =>
        mapAssistantRuntimeTimelineEvents(
          timeline,
          (event) => event.kind === 'approval' && event.approvalId === approvalId,
          (event) =>
            event.kind === 'approval'
              ? { ...event, status, resolvedAt: event.resolvedAt ?? Date.now() }
              : event,
        ),
      );
    },
    [updateAssistantMessageTimeline],
  );

  const settleApprovalLifecycle = useCallback(
    async (approvalId: string, status: 'approved' | 'denied') => {
      const pendingAction = await resolveRuntimeApproval({
        approvalId,
        status,
        pendingApprovalActions: pendingApprovalActionsRef.current,
        resolveStoredApproval,
        resolveAgentApproval,
      });

      if (pendingAction?.messageId) {
        updateApprovalStatusInMessage(pendingAction.messageId, approvalId, status);
      }

      if (
        pendingAction?.actionType
        && pendingAction.riskLevel
        && pendingAction.summary
        && pendingAction.runtimeStoreThreadId
        && pendingAction.replayThreadId
        && pendingAction.providerId
      ) {
        const lifecycle = buildCapabilityApprovalLifecycleDescriptor({
          approvalId,
          actionType: pendingAction.actionType,
          riskLevel: pendingAction.riskLevel,
          summary: pendingAction.summary,
          status,
          toolCallId: pendingAction.toolCallId,
        });
        appendRuntimeTimelineEvent(pendingAction.runtimeStoreThreadId, {
          id: createRuntimeEventId('approval'),
          threadId: pendingAction.runtimeStoreThreadId,
          providerId: pendingAction.providerId as AgentProviderId,
          summary: lifecycle.timelineSummary,
          createdAt: Date.now(),
        });
        await persistRuntimeTimelineEvent({
          threadId: pendingAction.replayThreadId,
          providerId: pendingAction.providerId as AgentProviderId,
          summary: lifecycle.timelineSummary,
        });
        await replayRecoveryController.appendAndSync({
          runtimeStoreThreadId: pendingAction.runtimeStoreThreadId,
          replayThreadId: pendingAction.replayThreadId,
          eventType: lifecycle.replayEventType,
          payload: lifecycle.replayPayload,
        });
      }

      return pendingAction;
    },
    [
      appendRuntimeTimelineEvent,
      persistRuntimeTimelineEvent,
      replayRecoveryController,
      resolveAgentApproval,
      resolveStoredApproval,
      updateApprovalStatusInMessage,
    ],
  );

  const handleApproveRuntimeApproval = useCallback(
    async (approvalId: string) => {
      const pendingAction = await settleApprovalLifecycle(approvalId, 'approved');
      if (pendingAction) {
        await pendingAction.onApprove();
        return;
      }

      if (activeSessionId) {
        await resolveRuntimeSidecarApproval({
          sessionId: activeSessionId,
          approvalId,
          status: 'approved',
        });
      }
    },
    [activeSessionId, settleApprovalLifecycle],
  );

  const handleDenyRuntimeApproval = useCallback(
    async (approvalId: string) => {
      const pendingAction = await settleApprovalLifecycle(approvalId, 'denied');
      if (pendingAction?.onDeny) {
        await pendingAction.onDeny();
        return;
      }

      if (activeSessionId) {
        await resolveRuntimeSidecarApproval({
          sessionId: activeSessionId,
          approvalId,
          status: 'denied',
        });
      }
    },
    [activeSessionId, settleApprovalLifecycle],
  );

  const handleAnswerRuntimeQuestion = useCallback(
    async (messageId: string, question: RuntimeQuestionPayload, answers: Record<string, string>) => {
      if (!activeSessionId) {
        return;
      }

      updateAssistantMessageTimeline(messageId, (timeline) =>
        answerAssistantRuntimeQuestionEvent(timeline, question.id, answers),
      );
      patchLiveState(activeSessionId, (state) => ({
        ...state,
        pendingQuestionSummary: null,
        statusVerb: state.pendingPermissionCount > 0 ? 'Waiting for approval' : '',
        activeToolName: state.pendingPermissionCount > 0 ? state.activeToolName : null,
        streamingToolInput: state.pendingPermissionCount > 0 ? state.streamingToolInput : '',
      }));

      const pendingAction = pendingQuestionActionsRef.current[question.id];
      if (pendingAction) {
        delete pendingQuestionActionsRef.current[question.id];
        pendingAction.resolve(answers);
        return;
      }

      await answerRuntimeSidecarQuestion({
        sessionId: activeSessionId,
        questionId: question.id,
        answers,
      });
    },
    [activeSessionId, patchLiveState, updateAssistantMessageTimeline],
  );

  const clearPendingApprovalAction = useCallback((approvalId: string) => {
    delete pendingApprovalActionsRef.current[approvalId];
  }, []);

  const stopPendingRuntimeInteractions = useCallback(() => {
    for (const [questionId, pendingQuestion] of Object.entries(pendingQuestionActionsRef.current)) {
      pendingQuestion.reject('Generation stopped.');
      delete pendingQuestionActionsRef.current[questionId];
    }
    for (const [approvalId, pendingApproval] of Object.entries(pendingApprovalActionsRef.current)) {
      void pendingApproval.onDeny?.();
      resolveStoredApproval(approvalId, 'denied');
      void resolveAgentApproval({ approvalId, status: 'denied' });
      delete pendingApprovalActionsRef.current[approvalId];
    }
  }, [resolveAgentApproval, resolveStoredApproval]);

  return {
    pendingApprovalActionsRef,
    waitForRuntimeApproval,
    waitForRuntimeQuestionAnswer,
    handleApproveRuntimeApproval,
    handleDenyRuntimeApproval,
    handleAnswerRuntimeQuestion,
    clearPendingApprovalAction,
    stopPendingRuntimeInteractions,
  };
};
