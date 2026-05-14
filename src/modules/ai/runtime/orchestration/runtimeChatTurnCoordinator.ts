import type { ChatAgentId, LocalAgentCommandResult } from '../../chat/chatAgents.ts';
import type { AIChatMessagePart } from '../../../../components/workspace/aiChatMessageParts.ts';
import type { RuntimeToolStep } from '../agent-kernel/agentKernelTypes.ts';
import type { AgentTurnSession } from '../session/agentSessionTypes.ts';
import { invoke } from '@tauri-apps/api/core';
import {
  createRuntimeReplayExecutionController,
  createRuntimeStreamingMessageAssembler,
} from './agentTurnRunner.ts';
import {
  executeRuntimeBuiltInAgentTurn,
  type ExecuteRuntimeBuiltInAgentTurnInput,
} from './executeRuntimeBuiltInAgentTurn.ts';
import { executeRuntimeMcpTurn } from './executeRuntimeMcpTurn.ts';
import { createBuiltinRuntimeAdapter } from '../adapters/builtinRuntimeAdapter.ts';
import { useAIChatStore } from '../../store/aiChatStore.ts';
import { useAgentRuntimeStore } from '../agentRuntimeStore.ts';
import { useRuntimeMcpStore } from '../mcp/runtimeMcpStore.ts';
import { useApprovalStore } from '../approval/approvalStore.ts';
import { permissionModeToSandboxPolicy } from '../approval/permissionMode.ts';
import type { SkillIntent } from '../../workflow/skillRouting.ts';
import type { RuntimeQuestionPayload, StoredChatMessage } from '../../store/aiChatStore.ts';
import type {
  RuntimeChatInteractionPort,
  RuntimeChatTurnPorts,
  RuntimeChatTurnRequest,
  RuntimeChatTurnResult,
} from './runtimeChatTurnTypes.ts';
import {
  upsertAssistantRuntimeToolResultEvent as upsertRuntimeToolResultInMessage,
  upsertAssistantRuntimeToolUseEvent as upsertRuntimeToolUseInMessage,
} from '../../store/assistantTimeline.ts';
import type { ToolCall, ToolResult } from '../tools/toolExecutor.ts';
import {
  ASK_USER_TOOL_NAME,
  getTurnAllowedRuntimeTools,
  RISKY_RUNTIME_TOOLS,
} from '../tools/runtimeToolPolicy.ts';
import { createRuntimeChatToolExecutor } from './runtimeChatTurnTools.ts';
import { isWindowsHost } from '../../../../utils/hostPlatform.ts';
export { createRuntimeChatToolExecutor };

export const runRuntimeChatBuiltInAgentTurn = (input: ExecuteRuntimeBuiltInAgentTurnInput) =>
  executeRuntimeBuiltInAgentTurn(input);

export const runRuntimeChatMcpTurn = (input: Parameters<typeof executeRuntimeMcpTurn>[0]) =>
  executeRuntimeMcpTurn(input);

export type RuntimeChatTurnLegacyDependencies = Record<string, unknown>;

export type RuntimeChatTurnCoordinatorInput = {
  request: RuntimeChatTurnRequest;
  ports: RuntimeChatTurnPorts;
  interactionPort: RuntimeChatInteractionPort;
  legacy: RuntimeChatTurnLegacyDependencies;
};

export const submitRuntimeChatTurn = async (input: RuntimeChatTurnCoordinatorInput): Promise<RuntimeChatTurnResult | void> => {
  const { request, ports, interactionPort, legacy } = input;
  const {
    abortControllerRef,
    activeSession,
    activeSkillsByThread,
    agentAvailability,
    applyAssistantReasoningProgress,
    applyRuntimeTurnBlocked,
    applyRuntimeTurnClassifying,
    applyRuntimeTurnCompleted,
    applyRuntimeTurnExecuting,
    applyRuntimeTurnFailed,
    buildAIConfigurationError,
    buildAgentContext,
    buildAssistantContentState,
    buildAssistantStreamingTimeline,
    buildAssistantTimelineUpdate,
    buildBuiltInToolApprovalActionType,
    buildBuiltInToolApprovalDisplay,
    buildBuiltInToolApprovalSummary,
    buildMcpLifecycleStartDescriptor,
    buildMemoryReadLifecycleDescriptor,
    buildProjectMemoryEntry,
    buildRuntimeAgentToolResult,
    buildRuntimeChangedPathActivityEntry,
    buildRuntimeEventId,
    buildRuntimeLocalAgentDecisionState,
    buildRuntimeLocalAgentPlan,
    buildRuntimeReplayTurnStartPayload,
    buildRuntimeTurnReviewPlan,
    buildRuntimeWriteRecoveryProposal,
    buildSessionPreview,
    buildSkillActivationLifecycleDescriptor,
    buildSkillHookLifecycleDescriptor,
    buildSyntheticRuntimeToolCallId,
    captureCheckpointFilesFromPaths,
    classifyRuntimeActionRisk,
    clearAssistantContentState,
    clearStreamingDraft,
    commitStreamingDraft,
    contextSnapshot,
    createActivityEntryId,
    createEmptyAgentTurnSession,
    createExecutionAgentRunRecord,
    createExecutionRunRecord,
    createExecutionTaskId,
    createExecutionTaskRecord,
    createLocalAgentExecutionAgentRunId,
    createLocalAgentExecutionRunId,
    createRootExecutionRunId,
    createRunId,
    createRuntimeEventId,
    createStoredChatMessage,
    createWelcomeSession,
    decideAgentTurnMode,
    denyRuntimeLocalAgentApproval,
    deriveTaskStatusFromRuns,
    enqueueAgentApproval,
    estimateTokenCount,
    explicitReferenceLabels,
    extractCheckpointFilesFromToolCalls,
    findLatestPendingProjectFileProposalAction,
    findRuntimeMcpToolDefinition,
    getAssistantRuntimeTimelineEvents,
    getAssistantTimelineReasoning,
    handleCancelProjectFileProposal,
    handleExecuteProjectFileProposal,
    handleRuntimeLocalAgentDecision,
    invokeRuntimeMcpTool,
    isLoading,
    isRuntimeConfigured,
    isShortPendingActionAffirmation,
    isShortPendingActionRejection,
    loadProjectInstructionReferences,
    memory,
    normalizeErrorMessage,
    notifyProjectFilesChanged,
    parseRuntimeMcpCommand,
    parseRuntimeQuestionInput,
    patchExecutionRunStatus,
    persistRuntimeTimelineEvent,
    persistTurnCheckpointForRun,
    preferredForkAgentId,
    prepareRuntimeLocalAgentFlow,
    pushStreamingDraft,
    reduceAgentTurnSession,
    replaceAssistantRuntimeTimelineEvents,
    replayRecoveryController,
    resolveAgentApproval,
    resolveRuntimeAgentToolInput,
    resolveRuntimeLocalAgentDecisionFeedback,
    resolveSkillIntent,
    resolveStoredApproval,
    resolvedReferenceContextFiles,
    runAgentTeamTurn,
    runRuntimeLocalAgentExecution,
    runningSubmissionRef,
    runtimeMcpServers,
    runtimeSkillRegistryRef,
    setIsLoading,
    setStallFP,
    shouldAutoApproveRuntimeAction,
    shouldDenyRuntimeAction,
    stopRequestedRef,
    streamingDraftBufferRef,
    summarizeLiveToolInput,
    summarizeSessionTitle,
    syncAssistantTimelineWithToolCalls,
    syncTeamExecutionGraph,
    syncTeamRunRuntimeEvents,
    toConversationHistoryMessages,
    updateAssistantMessageTimeline,
    updateRuntimeLocalAgentPlanApprovalStatus,
    upsertAgentBackgroundTask,
    upsertAssistantRuntimeQuestionEvent,
  } = legacy as Record<string, any>;
  const sandboxPolicy = permissionModeToSandboxPolicy(request.permissionMode);
  const runtimeProviderId = request.providerId;
  const promptValue = request.rawUserInput;
  const effectiveChatAgentId = request.selectedChatAgentId;
  const fallbackToBuiltInMessage = request.fallbackToBuiltInMessage;
  const {
    appendCanonicalEvent,
    appendActivityEntry,
    appendMessage,
    bindRuntimeThread,
    renameSession,
    setActiveSession,
    updateMessage,
    upsertSession,
  } = useAIChatStore.getState();
  const {
    appendTimelineEvent: appendRuntimeTimelineEvent,
    createThread: recordRuntimeThread,
    failRun: failRuntimeRun,
    finishRun: finishRuntimeRun,
    patchLiveState,
    patchTurnSession,
    setExecutionAgentRuns,
    setExecutionRuns,
    setMemoryEntries: setRuntimeMemoryEntries,
    setRuntimeBinding,
    setThreadContext,
    setThreadMemoryCandidates,
    setThreadToolCalls,
    setActiveSkills,
    startRun: startRuntimeRun,
    submitTurn: submitRuntimeTurn,
    upsertBackgroundTask,
    upsertExecutionAgentRun,
    upsertExecutionRun,
    upsertExecutionTask,
    upsertTeamRun,
    upsertTurnSession,
  } = useAgentRuntimeStore.getState();
  const { appendToolCall: appendRuntimeMcpToolCall } = useRuntimeMcpStore.getState();
  const { enqueueApproval } = useApprovalStore.getState();
  void [abortControllerRef, activeSession, activeSkillsByThread, agentAvailability, applyAssistantReasoningProgress, applyRuntimeTurnBlocked, applyRuntimeTurnClassifying, applyRuntimeTurnCompleted, applyRuntimeTurnExecuting, applyRuntimeTurnFailed, buildAIConfigurationError, buildAgentContext, buildAssistantContentState, buildAssistantStreamingTimeline, buildAssistantTimelineUpdate, buildBuiltInToolApprovalActionType, buildBuiltInToolApprovalDisplay, buildBuiltInToolApprovalSummary, buildMcpLifecycleStartDescriptor, buildMemoryReadLifecycleDescriptor, buildProjectMemoryEntry, buildRuntimeAgentToolResult, buildRuntimeChangedPathActivityEntry, buildRuntimeEventId, buildRuntimeLocalAgentDecisionState, buildRuntimeLocalAgentPlan, buildRuntimeReplayTurnStartPayload, buildRuntimeTurnReviewPlan, buildRuntimeWriteRecoveryProposal, buildSessionPreview, buildSkillActivationLifecycleDescriptor, buildSkillHookLifecycleDescriptor, buildSyntheticRuntimeToolCallId, captureCheckpointFilesFromPaths, classifyRuntimeActionRisk, clearAssistantContentState, clearStreamingDraft, commitStreamingDraft, contextSnapshot, createActivityEntryId, createEmptyAgentTurnSession, createExecutionAgentRunRecord, createExecutionRunRecord, createExecutionTaskId, createExecutionTaskRecord, createLocalAgentExecutionAgentRunId, createLocalAgentExecutionRunId, createRootExecutionRunId, createRunId, createRuntimeEventId, createStoredChatMessage, createWelcomeSession, decideAgentTurnMode, denyRuntimeLocalAgentApproval, deriveTaskStatusFromRuns, enqueueAgentApproval, estimateTokenCount, explicitReferenceLabels, extractCheckpointFilesFromToolCalls, findLatestPendingProjectFileProposalAction, findRuntimeMcpToolDefinition, getAssistantRuntimeTimelineEvents, getAssistantTimelineReasoning, handleCancelProjectFileProposal, handleExecuteProjectFileProposal, handleRuntimeLocalAgentDecision, invokeRuntimeMcpTool, isLoading, isRuntimeConfigured, isShortPendingActionAffirmation, isShortPendingActionRejection, loadProjectInstructionReferences, memory, normalizeErrorMessage, notifyProjectFilesChanged, parseRuntimeMcpCommand, parseRuntimeQuestionInput, patchExecutionRunStatus, persistRuntimeTimelineEvent, persistTurnCheckpointForRun, preferredForkAgentId, prepareRuntimeLocalAgentFlow, pushStreamingDraft, reduceAgentTurnSession, replaceAssistantRuntimeTimelineEvents, replayRecoveryController, resolveAgentApproval, resolveRuntimeAgentToolInput, resolveRuntimeLocalAgentDecisionFeedback, resolveSkillIntent, resolveStoredApproval, resolvedReferenceContextFiles, runAgentTeamTurn, runRuntimeLocalAgentExecution, runningSubmissionRef, runtimeMcpServers, runtimeSkillRegistryRef, setIsLoading, setStallFP, shouldAutoApproveRuntimeAction, shouldDenyRuntimeAction, stopRequestedRef, streamingDraftBufferRef, summarizeLiveToolInput, summarizeSessionTitle, syncAssistantTimelineWithToolCalls, syncTeamExecutionGraph, syncTeamRunRuntimeEvents, updateAssistantMessageTimeline, updateRuntimeLocalAgentPlanApprovalStatus, upsertAgentBackgroundTask, upsertAssistantRuntimeQuestionEvent];

  if (!promptValue.trim() || isLoading || !request.projectId) {
    return;
  }

  let targetSessionId = request.targetSessionId || activeSession?.id || '';
  let targetSession = activeSession;
  if (!targetSessionId) {
    const session = createWelcomeSession(request.projectId, runtimeProviderId);
    upsertSession(request.projectId, session);
    setActiveSession(request.projectId, session.id);
    targetSessionId = session.id;
    targetSession = session;
  }

  const rawContent = promptValue.trim();
  const pendingProjectFileAction = findLatestPendingProjectFileProposalAction(targetSession?.messages || []);
  if (
    pendingProjectFileAction &&
    (isShortPendingActionAffirmation(rawContent) || isShortPendingActionRejection(rawContent))
  ) {
    const runId = createRunId();
    appendMessage(request.projectId, targetSessionId, createStoredChatMessage('user', rawContent, 'default', { runId }));

    if (!targetSession || targetSession.title === '新对话') {
      renameSession(request.projectId, targetSessionId, summarizeSessionTitle(rawContent));
    }

    setIsLoading(true);
    try {
      if (isShortPendingActionAffirmation(rawContent)) {
        await handleExecuteProjectFileProposal(
          pendingProjectFileAction.messageId,
          pendingProjectFileAction.proposal
        );
      } else {
        await handleCancelProjectFileProposal(pendingProjectFileAction.messageId);
      }
    } finally {
      setIsLoading(false);
    }
    return;
  }

  const routeableSkills = runtimeSkillRegistryRef.current
    .listAllSkills()
    .filter((skill: any) => skill.userInvocable);
  const skillIntent: SkillIntent | null = resolveSkillIntent(rawContent, routeableSkills);
  const resolvedSkill = skillIntent?.skill || null;
  const mcpCommand = parseRuntimeMcpCommand(rawContent, runtimeMcpServers);
  const cleanedContent = skillIntent?.cleanedInput.trim()
    ? skillIntent.cleanedInput.trim()
    : rawContent;
  const runId = createRunId();
  const userMessage = createStoredChatMessage('user', rawContent, 'default', { runId });

  appendMessage(request.projectId, targetSessionId, userMessage);
  if (fallbackToBuiltInMessage) {
    appendMessage(
      request.projectId,
      targetSessionId,
      createStoredChatMessage('system', fallbackToBuiltInMessage)
    );
  }

  if (!targetSession || targetSession.title === '新对话') {
    renameSession(request.projectId, targetSessionId, summarizeSessionTitle(rawContent));
  }

  const assistantMessage = createStoredChatMessage('assistant', '', 'default', { runId });
  const assistantBaseTimeline = assistantMessage.role === 'assistant' ? assistantMessage.timeline : [];
  appendMessage(request.projectId, targetSessionId, assistantMessage);
  setIsLoading(true);
  stopRequestedRef.current = false;
  abortControllerRef.current = new AbortController();
  const canonicalAdapter = createBuiltinRuntimeAdapter({
    sessionId: targetSessionId,
    runId,
    turnId: runId,
    providerId: runtimeProviderId,
  });
  let canonicalEventCounter = 0;
  const canonicalEventsForTurn: any[] = [];
  const appendCanonicalEventToSession = (event: any) => {
    canonicalEventsForTurn.push(event);
    appendCanonicalEvent(request.projectId, targetSessionId, event);
  };
  const emitCanonicalProviderEvent = (event: any) =>
    canonicalAdapter.onProviderEvent(event, appendCanonicalEventToSession);
  const seenToolStatuses = new Map<string, RuntimeToolStep['status']>();
  const emitCanonicalToolLifecycle = (toolCalls: RuntimeToolStep[]) => {
    for (const toolCall of toolCalls) {
      const previousStatus = seenToolStatuses.get(toolCall.id);

      if (!previousStatus) {
        appendCanonicalEventToSession({
          eventId: `evt_tool_${runId}_${++canonicalEventCounter}`,
          runId,
          turnId: runId,
          sessionId: targetSessionId,
          messageId: assistantMessage.id,
          correlationId: toolCall.id,
          type: 'tool.started',
          ts: Date.now(),
          seq: 0,
          source: { kind: 'tool', provider: runtimeProviderId, name: toolCall.name },
          payload: {
            toolCallId: toolCall.id,
            parentToolCallId: toolCall.parentToolCallId ?? null,
            toolName: toolCall.name,
            input: toolCall.input,
            inputSummary: summarizeLiveToolInput(toolCall.input),
          },
        });
      }

      if (previousStatus !== toolCall.status && toolCall.status !== 'running') {
        appendCanonicalEventToSession({
          eventId: `evt_tool_${runId}_${++canonicalEventCounter}`,
          runId,
          turnId: runId,
          sessionId: targetSessionId,
          messageId: assistantMessage.id,
          correlationId: toolCall.id,
          type: 'tool.completed',
          ts: Date.now(),
          seq: 0,
          source: { kind: 'tool', provider: runtimeProviderId, name: toolCall.name },
          payload: {
            toolCallId: toolCall.id,
            ok: toolCall.status === 'completed',
            summary: toolCall.resultPreview || toolCall.name,
            outputText: toolCall.resultContent,
            fileChanges: toolCall.fileChanges,
          },
        });
      }

      seenToolStatuses.set(toolCall.id, toolCall.status);
    }
  };

  let runtimeThreadId = targetSession?.runtimeThreadId || null;
  let runtimeStoreThreadId = targetSessionId;
  let runtimeTurnSessionId: string | null = null;
  let executionController: ReturnType<typeof createRuntimeReplayExecutionController> | null = null;

  try {
    runningSubmissionRef.current = { assistantMessageId: assistantMessage.id, runtimeStoreThreadId };
    const projectMemoryEntries = (memory?.memoryEntries || []).map((entry: any) =>
      buildProjectMemoryEntry(entry)
    );
    setRuntimeMemoryEntries(request.projectId, projectMemoryEntries);

    if (!runtimeThreadId) {
      const persistedThread = await ports.persistRuntimeThread({
        projectId: request.projectId,
        title: targetSession?.title || '新对话',
        providerId: runtimeProviderId,
      });
      runtimeThreadId = persistedThread.id;
      bindRuntimeThread(request.projectId, targetSessionId, runtimeProviderId, runtimeThreadId);
    }

    recordRuntimeThread(request.projectId, {
      id: targetSessionId,
      providerId: runtimeProviderId,
      title: targetSession?.title || summarizeSessionTitle(rawContent),
      createdAt: targetSession?.createdAt || Date.now(),
      updatedAt: Date.now(),
    });
    setRuntimeBinding(runtimeStoreThreadId, {
      providerId: runtimeProviderId,
      configId: request.selectedRuntimeConfigId,
      externalThreadId: runtimeThreadId,
    });
    const replayThreadId = runtimeThreadId || targetSessionId;
    let memoryReadLogged = false;
    const emitLifecycleToolEvent = async (input: {
      toolCallId: string;
      toolName: string;
      toolInput: Record<string, unknown>;
      output: string;
      timelineSummary: string;
      replayEventType: string;
      replayPayload: string;
      status?: RuntimeToolStep['status'];
    }) => {
      const status = input.status || 'completed';
      upsertRuntimeToolUseInMessage(assistantMessage.id, {
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        toolInput: input.toolInput,
        status,
      });
      upsertRuntimeToolResultInMessage(assistantMessage.id, {
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        status,
        output: input.output,
      });
      appendRuntimeTimelineEvent(runtimeStoreThreadId, {
        id: createRuntimeEventId(input.toolName),
        threadId: runtimeStoreThreadId,
        providerId: runtimeProviderId,
        summary: input.timelineSummary,
        createdAt: Date.now(),
      });
      await persistRuntimeTimelineEvent({
        threadId: replayThreadId,
        providerId: runtimeProviderId,
        summary: input.timelineSummary,
      });
      await replayRecoveryController.appendAndSync({
        runtimeStoreThreadId,
        replayThreadId,
        eventType: input.replayEventType,
        payload: input.replayPayload,
      });
    };
    const emitMemoryReadLifecycle = async () => {
      if (memoryReadLogged) {
        return;
      }
      memoryReadLogged = true;
      const lifecycle = buildMemoryReadLifecycleDescriptor({
        threadId: runtimeStoreThreadId,
        memoryEntries: projectMemoryEntries.map((entry: any) => ({
          id: entry.id,
          title: entry.title || entry.label,
          kind: entry.kind,
        })),
      });
      await emitLifecycleToolEvent(lifecycle);
    };
    const emitSkillHookLifecycle = async (event: any) => {
      const lifecycle = buildSkillHookLifecycleDescriptor({
        toolCallId: createRuntimeEventId('skill-hook'),
        skillId: event.skillId,
        skillName: event.skillName,
        eventName: event.eventName,
        toolName: event.toolName,
        matcher: event.matcher,
        command: event.command,
        status: event.status,
        error: event.error,
      });
      await emitLifecycleToolEvent({
        ...lifecycle,
        status: event.status === 'failed' ? 'failed' : 'completed',
      });
    };
    appendRuntimeTimelineEvent(runtimeStoreThreadId, {
      id: createRuntimeEventId('user'),
      threadId: runtimeStoreThreadId,
      providerId: runtimeProviderId,
      summary: `User: ${buildSessionPreview(cleanedContent)}`,
      createdAt: Date.now(),
    });
    const runtimeSkillThreadId = runtimeStoreThreadId;
    const discoverableSkillsForTurn = runtimeSkillRegistryRef.current
      .listSkills(runtimeSkillThreadId)
      .filter((skill: any) => skill.modelInvocable);
    let activeSkillsForTurn = activeSkillsByThread[runtimeSkillThreadId] || [];
    if (resolvedSkill) {
      runtimeSkillRegistryRef.current.activateSkill(runtimeSkillThreadId, resolvedSkill);
      activeSkillsForTurn = runtimeSkillRegistryRef.current.listActiveSkills(runtimeSkillThreadId);
      setActiveSkills(runtimeSkillThreadId, activeSkillsForTurn);
    }
    const visibleSkillsForTurn =
      activeSkillsForTurn.length > 0
        ? [
            ...activeSkillsForTurn,
            ...discoverableSkillsForTurn.filter(
              (skill: any) => !activeSkillsForTurn.some((activeSkill: any) => activeSkill.id === skill.id)
            ),
          ]
        : discoverableSkillsForTurn;
    const forkSkillsForTurn = visibleSkillsForTurn.filter(
      (skill: any) => skill.executionContext === 'fork' && skill.modelInvocable
    );
    const shouldRunForkSkill = forkSkillsForTurn.length > 0;
    const preferredForkSkillAgent = (
      forkSkillsForTurn.find((skill: any) => skill.agent === 'codex' || skill.agent === 'claude')?.agent || null
    ) as ChatAgentId | null;
    const forkAgentId = shouldRunForkSkill
      ? preferredForkSkillAgent || preferredForkAgentId
      : null;
    const requiresForkAgentExecution = shouldRunForkSkill && Boolean(forkAgentId);
    const runtimeExecutionAgentId: ChatAgentId =
      requiresForkAgentExecution && forkAgentId ? forkAgentId : effectiveChatAgentId;
    const runtimeVisibleSkillsForTurn =
      shouldRunForkSkill && !forkAgentId
        ? visibleSkillsForTurn.map((skill: any) =>
            skill.executionContext === 'fork'
              ? {
                  ...skill,
                  executionContext: 'inline' as const,
                }
              : skill
          )
        : visibleSkillsForTurn;
    executionController = createRuntimeReplayExecutionController({
      turnId: `turn_${runId}`,
      threadId: runtimeStoreThreadId,
      providerId: runtimeProviderId,
      prompt: cleanedContent,
      replayStartPayload: buildRuntimeReplayTurnStartPayload({
        rawPrompt: rawContent,
        normalizedPrompt: cleanedContent,
        skillIntent,
        activeSkillIds: runtimeVisibleSkillsForTurn.map((skill: any) => skill.id),
      }),
      createdAt: Date.now(),
      submitTurn: submitRuntimeTurn,
      startRun: startRuntimeRun,
      finishRun: finishRuntimeRun,
      failRun: failRuntimeRun,
      runtimeStoreThreadId,
      replayThreadId,
      appendAndSyncReplayEvent: replayRecoveryController.appendAndSync,
    });
    const invokedRuntimeSkill = resolvedSkill
      ? runtimeVisibleSkillsForTurn.find((skill: any) => skill.id === resolvedSkill) ||
        routeableSkills.find((skill: any) => skill.id === resolvedSkill) ||
        null
      : null;
    const inlineModelOverride =
      runtimeExecutionAgentId === 'built-in' && invokedRuntimeSkill?.model
        ? invokedRuntimeSkill.model
        : null;
    if (shouldRunForkSkill && !forkAgentId) {
      appendMessage(
        request.projectId,
        targetSessionId,
        createStoredChatMessage(
          'system',
          '检测到需要隔离执行的 skill，但当前没有可用本地 Agent，已临时回退为 inline 执行。'
        )
      );
    }
    if (runtimeExecutionAgentId === 'built-in' && !isRuntimeConfigured) {
      appendMessage(
        request.projectId,
        targetSessionId,
        createStoredChatMessage('system', normalizeErrorMessage(buildAIConfigurationError()), 'error')
      );
      return;
    }
    const contextProjectRoot = await ports.resolveProjectRootById(request.projectId);
    const conversationHistory = toConversationHistoryMessages(targetSession?.messages || activeSession?.messages || []);
    const projectInstructionReferences = await loadProjectInstructionReferences(contextProjectRoot);
    const agentInstructions = [
      contextSnapshot.primaryLabel,
      contextSnapshot.secondaryLabel,
      contextSnapshot.currentFileLabel,
      contextSnapshot.vaultLabel,
      projectInstructionReferences.length > 0
        ? `项目规则文件 / ${projectInstructionReferences.map((item: any) => item.path.split(/[/\\]/).pop()).join(', ')}`
        : null,
      ...explicitReferenceLabels,
    ].filter((item): item is string => Boolean(item));
    const contextLabels = [
      request.selectedRuntimeConfigName ? `当前 AI / ${request.selectedRuntimeConfigName}` : null,
      ...agentInstructions,
    ].filter((item): item is string => Boolean(item));
    const agentContextSnapshot = buildAgentContext({
      projectId: request.projectId,
      projectName: request.projectName,
      threadId: targetSessionId,
      userInput: cleanedContent,
      contextWindowTokens: request.contextWindowTokens,
      conversationHistory,
      instructions: agentInstructions,
      referenceFiles: [
        ...projectInstructionReferences,
        ...resolvedReferenceContextFiles.map((file: any) => ({
          path: file.path,
          summary: file.summary,
          content: file.content || file.summary || file.title,
        })),
      ],
      memoryEntries: projectMemoryEntries,
      activeSkills: runtimeVisibleSkillsForTurn,
    });
    setThreadContext(targetSessionId, agentContextSnapshot);
    patchLiveState(runtimeStoreThreadId, (state: any) => ({
      ...state,
      connectionState: 'connected',
      statusVerb: 'Thinking',
      elapsedSeconds: 0,
      startedAt: Date.now(),
      activeThinking: true,
      activeToolName: null,
      streamingToolInput: '',
      streamingText: '',
      tokenUsage: {
        inputTokens: estimateTokenCount(
          `${cleanedContent}\n${agentInstructions.join('\n')}\n${agentContextSnapshot.prompt}`
        ),
        outputTokens: 0,
      },
    }));
    await executionController.start();
    if (!executionController) {
      throw new Error('Failed to initialize runtime execution controller.');
    }
    const activeExecutionController = executionController;
    runtimeTurnSessionId = `turn_${runId}`;
    const executionTaskId = createExecutionTaskId(runId);
    const rootExecutionRunId = createRootExecutionRunId(executionTaskId);
    upsertTurnSession(
      runtimeStoreThreadId,
      createEmptyAgentTurnSession({
        id: runtimeTurnSessionId,
        threadId: runtimeStoreThreadId,
        providerId: runtimeProviderId,
        userPrompt: cleanedContent,
      })
    );
    upsertExecutionTask(
      runtimeStoreThreadId,
      createExecutionTaskRecord({
        runId,
        threadId: runtimeStoreThreadId,
        turnId: runtimeTurnSessionId,
        providerId: runtimeProviderId,
        title: cleanedContent.slice(0, 80) || 'AI task',
        prompt: cleanedContent,
        summary: rawContent.slice(0, 160) || cleanedContent.slice(0, 160),
        status: 'planning',
      })
    );
    upsertExecutionRun(
      runtimeStoreThreadId,
      createExecutionRunRecord({
        id: rootExecutionRunId,
        threadId: runtimeStoreThreadId,
        taskId: executionTaskId,
        turnId: runtimeTurnSessionId,
        providerId: runtimeProviderId,
        kind: 'turn',
        title: cleanedContent.slice(0, 80) || 'Turn run',
        summary: 'Preparing execution',
        status: 'planning',
      })
    );
    const patchExecutionTaskFromRuns = () => {
      const currentTask = (useAgentRuntimeStore.getState().tasksByThread[runtimeStoreThreadId] || []).find(
        (task: any) => task.id === executionTaskId
      );
      const currentRuns = useAgentRuntimeStore.getState().runsByThread[runtimeStoreThreadId] || [];
      if (!currentTask) {
        return;
      }
      upsertExecutionTask(runtimeStoreThreadId, deriveTaskStatusFromRuns(currentTask, currentRuns));
    };
    const patchRootExecutionRun = (status: 'planning' | 'running' | 'completed' | 'failed' | 'blocked', summary: string) => {
      const currentRun = (useAgentRuntimeStore.getState().runsByThread[runtimeStoreThreadId] || []).find(
        (run: any) => run.id === rootExecutionRunId
      );
      if (!currentRun) {
        return;
      }
      upsertExecutionRun(runtimeStoreThreadId, patchExecutionRunStatus(currentRun, status, summary));
      patchExecutionTaskFromRuns();
    };
    const syncExecutionGraph = (input: {
      runs: ReturnType<typeof useAgentRuntimeStore.getState>['runsByThread'][string];
      agentRuns: ReturnType<typeof useAgentRuntimeStore.getState>['agentRunsByThread'][string];
    }) => {
      setExecutionRuns(runtimeStoreThreadId, input.runs || []);
      setExecutionAgentRuns(runtimeStoreThreadId, input.agentRuns || []);
      patchExecutionTaskFromRuns();
    };
    const patchCurrentTurnSession = (updater: (session: AgentTurnSession) => AgentTurnSession) => {
      patchTurnSession(runtimeStoreThreadId, runtimeTurnSessionId!, updater);
    };
    const markTurnExecutionStep = (input: {
      title: string;
      status: 'running' | 'completed' | 'failed' | 'blocked';
      userVisibleDetail: string;
      resultSummary: string;
      toolName?: string | null;
    }) => {
      patchCurrentTurnSession((session) =>
        input.status === 'running'
          ? applyRuntimeTurnExecuting({
              session,
              turnId: runtimeTurnSessionId!,
              title: input.title,
              detail: input.userVisibleDetail,
              toolName: input.toolName,
            })
          : input.status === 'completed'
            ? applyRuntimeTurnCompleted({
                session,
                turnId: runtimeTurnSessionId!,
                finalContent: input.userVisibleDetail,
              })
            : input.status === 'failed'
              ? applyRuntimeTurnFailed({
                  session,
                  turnId: runtimeTurnSessionId!,
                  message: input.userVisibleDetail,
                })
              : applyRuntimeTurnBlocked({
                  session,
                  turnId: runtimeTurnSessionId!,
                  reason: input.userVisibleDetail,
                })
      );
    };
    const markTurnExecuting = (title: string, detail: string, toolName: string | null = null) => {
      patchRootExecutionRun('running', detail || title);
      patchCurrentTurnSession((session) =>
        applyRuntimeTurnExecuting({
          session,
          turnId: runtimeTurnSessionId!,
          title,
          detail,
          toolName,
        })
      );
    };
    const completeTurnSession = async (finalContent: string) => {
      patchRootExecutionRun('completed', finalContent);
      patchCurrentTurnSession((session) =>
        applyRuntimeTurnCompleted({
          session,
          turnId: runtimeTurnSessionId!,
          finalContent,
        })
      );
      await activeExecutionController.completeWithReplay(finalContent);
    };
    const failTurnSession = async (message: string) => {
      patchRootExecutionRun('failed', message);
      patchCurrentTurnSession((session) =>
        applyRuntimeTurnFailed({
          session,
          turnId: runtimeTurnSessionId!,
          message,
        })
      );
      await activeExecutionController.failWithReplay(message);
    };
    const blockTurnSession = async (reason: string, replaySummary: string, actionLabel: string | null = null) => {
      patchRootExecutionRun('blocked', reason);
      patchCurrentTurnSession((session) =>
        applyRuntimeTurnBlocked({
          session,
          turnId: runtimeTurnSessionId!,
          reason,
          actionLabel,
        })
      );
      await activeExecutionController.completeWithReplay(replaySummary);
    };
    patchCurrentTurnSession((session) => applyRuntimeTurnClassifying(session));
    const turnModeDecision = decideAgentTurnMode({
      prompt: cleanedContent,
      suggestedPlanMode: Boolean(skillIntent),
      riskyWriteDetected: false,
      bashDetected: Boolean(mcpCommand),
      multiStepDetected: Boolean(mcpCommand),
    });
    if (turnModeDecision.mode === 'plan_then_execute') {
      patchCurrentTurnSession((session) => ({
        ...reduceAgentTurnSession(session, { type: 'enter_planning' }),
        plan: buildRuntimeTurnReviewPlan({
          turnId: runtimeTurnSessionId!,
          summary:
            runtimeExecutionAgentId !== 'built-in'
              ? `Review and run ${runtimeExecutionAgentId === 'codex' ? 'the Codex agent' : 'the local agent'} request`
              : mcpCommand
                ? `Review MCP tool call: ${mcpCommand.toolName}`
                : 'Plan the current request before execution',
          reason: turnModeDecision.reason,
          riskLevel:
            runtimeExecutionAgentId !== 'built-in'
              ? 'high'
              : mcpCommand
                ? 'medium'
                : 'low',
          executeKind:
            runtimeExecutionAgentId !== 'built-in'
              ? 'tool'
              : 'reply',
          needsApproval: runtimeExecutionAgentId !== 'built-in',
        }),
      }));
    }

    if (invokedRuntimeSkill) {
      const activatedSkillDescriptor = buildSkillActivationLifecycleDescriptor({
        sourceId: buildSyntheticRuntimeToolCallId('skill-activate', runId, invokedRuntimeSkill.id),
        skill: invokedRuntimeSkill,
        invocationKind: skillIntent?.invocationKind || 'tag',
        prompt: cleanedContent,
      });
      upsertRuntimeToolUseInMessage(assistantMessage.id, {
        toolCallId: activatedSkillDescriptor.toolCallId,
        toolName: activatedSkillDescriptor.toolName,
        toolInput: activatedSkillDescriptor.toolInput,
        status: 'completed',
      });
      upsertRuntimeToolResultInMessage(assistantMessage.id, {
        toolCallId: activatedSkillDescriptor.toolCallId,
        toolName: activatedSkillDescriptor.toolName,
        status: 'completed',
        output: activatedSkillDescriptor.output,
      });
      appendRuntimeTimelineEvent(runtimeStoreThreadId, {
        id: createRuntimeEventId('assistant'),
        threadId: runtimeStoreThreadId,
        providerId: runtimeProviderId,
        summary: activatedSkillDescriptor.timelineSummary,
        createdAt: Date.now(),
      });
      await persistRuntimeTimelineEvent({
        threadId: replayThreadId,
        providerId: runtimeProviderId,
        summary: activatedSkillDescriptor.timelineSummary,
      });
      await replayRecoveryController.appendAndSync({
        runtimeStoreThreadId,
        replayThreadId,
        eventType: activatedSkillDescriptor.replayEventType,
        payload: activatedSkillDescriptor.replayPayload,
      });
    }

    if (mcpCommand) {
      const mcpToolEventKey = `mcp:${mcpCommand.serverId}:${mcpCommand.toolName}:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const mcpLifecycleStart = buildMcpLifecycleStartDescriptor({
        toolCallId: mcpToolEventKey,
        serverId: mcpCommand.serverId,
        toolName: mcpCommand.toolName,
        argumentsText: mcpCommand.argumentsText || '',
      });
      upsertRuntimeToolUseInMessage(assistantMessage.id, {
        toolCallId: mcpLifecycleStart.toolCallId,
        toolName: mcpLifecycleStart.toolName,
        toolInput: mcpLifecycleStart.toolInput,
        status: 'running',
      });
      const mcpToolDefinition = findRuntimeMcpToolDefinition(
        runtimeMcpServers,
        mcpCommand.serverId,
        mcpCommand.toolName
      );
      if (mcpToolDefinition?.requiresApproval) {
        const actionType = 'mcp_tool_call';
        const riskLevel = classifyRuntimeActionRisk(actionType);

        if (shouldDenyRuntimeAction({ riskLevel, sandboxPolicy })) {
          const blockedMessage = `当前 sandbox policy 为 ${sandboxPolicy}，已阻止 MCP 工具 ${mcpCommand.serverId}/${mcpCommand.toolName}。`;
          upsertRuntimeToolResultInMessage(assistantMessage.id, {
            toolCallId: mcpToolEventKey,
            toolName: `${mcpCommand.serverId}/${mcpCommand.toolName}`,
            status: 'blocked',
            output: blockedMessage,
          });
          updateMessage(request.projectId, targetSessionId, assistantMessage.id, (currentMessage: any) => ({
            ...currentMessage,
            role: 'system',
            tone: 'error',
            content: blockedMessage,
            ...clearAssistantContentState(),
          }));
          await failTurnSession(blockedMessage);
          return;
        }

        if (!shouldAutoApproveRuntimeAction({ riskLevel, sandboxPolicy })) {
          const approved = await interactionPort.waitForApproval({
              threadId: runtimeThreadId || targetSessionId,
              runtimeStoreThreadId,
              replayThreadId,
              providerId: runtimeProviderId,
              actionType,
              riskLevel,
              summary: `允许执行 MCP 工具: ${mcpCommand.serverId}/${mcpCommand.toolName}`,
              messageId: assistantMessage.id,
              toolCallId: mcpToolEventKey,
              display: {
                toolName: mcpCommand.toolName,
                inputJson: JSON.stringify(
                  {
                    serverId: mcpCommand.serverId,
                    toolName: mcpCommand.toolName,
                    arguments: mcpCommand.argumentsText || '',
                  },
                  null,
                  2
                ),
              },
              onApprove: async () => {},
              onDeny: async () => {},
            });

          if (!approved) {
            const deniedMessage = `已取消 MCP 工具 ${mcpCommand.serverId}/${mcpCommand.toolName}。`;
            upsertRuntimeToolResultInMessage(assistantMessage.id, {
              toolCallId: mcpToolEventKey,
              toolName: `${mcpCommand.serverId}/${mcpCommand.toolName}`,
              status: 'blocked',
              output: deniedMessage,
            });
            updateMessage(request.projectId, targetSessionId, assistantMessage.id, (currentMessage: any) => ({
              ...currentMessage,
              role: 'system',
              tone: 'error',
              content: deniedMessage,
              ...clearAssistantContentState(),
            }));
            await failTurnSession(deniedMessage);
            return;
          }
        }
      }

      markTurnExecuting(
        `Run MCP tool: ${mcpCommand.toolName}`,
        `Preparing ${mcpCommand.serverId}/${mcpCommand.toolName}`,
        mcpCommand.toolName
      );
      upsertRuntimeToolUseInMessage(assistantMessage.id, {
        toolCallId: mcpLifecycleStart.toolCallId,
        toolName: mcpLifecycleStart.toolName,
        toolInput: mcpLifecycleStart.toolInput,
        status: 'running',
      });
      appendRuntimeTimelineEvent(runtimeStoreThreadId, {
        id: createRuntimeEventId('mcp-start'),
        threadId: runtimeStoreThreadId,
        providerId: runtimeProviderId,
        summary: mcpLifecycleStart.timelineSummary,
        createdAt: Date.now(),
      });
      await persistRuntimeTimelineEvent({
        threadId: replayThreadId,
        providerId: runtimeProviderId,
        summary: mcpLifecycleStart.timelineSummary,
      });
      await replayRecoveryController.appendAndSync({
        runtimeStoreThreadId,
        replayThreadId,
        eventType: mcpLifecycleStart.replayEventType,
        payload: mcpLifecycleStart.replayPayload,
      });

      const mcpResult = await runRuntimeChatMcpTurn({
        command: mcpCommand,
        servers: runtimeMcpServers,
        threadId: runtimeThreadId || targetSessionId,
        invokeTool: invokeRuntimeMcpTool,
      });

      if (mcpResult.status === 'failed') {
        const message = mcpResult.message;
        upsertRuntimeToolResultInMessage(assistantMessage.id, {
          toolCallId: mcpToolEventKey,
          toolName: `${mcpCommand.serverId}/${mcpCommand.toolName}`,
          status: 'failed',
          output: message,
        });
        updateMessage(request.projectId, targetSessionId, assistantMessage.id, (currentMessage: any) => ({
          ...currentMessage,
          role: 'system',
          tone: 'error',
          content: message,
          ...clearAssistantContentState(),
        }));
        await failTurnSession(message);
        appendRuntimeTimelineEvent(runtimeStoreThreadId, {
          id: createRuntimeEventId('mcp-error'),
          threadId: runtimeStoreThreadId,
          providerId: runtimeProviderId,
          summary: `Error: ${message}`,
          createdAt: Date.now(),
        });
        return;
      }

      const { toolCall } = mcpResult;
      appendRuntimeMcpToolCall(toolCall.threadId, toolCall);
      upsertRuntimeToolResultInMessage(assistantMessage.id, {
        toolCallId: mcpToolEventKey,
        toolName: `${toolCall.serverId}/${toolCall.toolName}`,
        status: toolCall.error ? 'failed' : 'completed',
        output: toolCall.error || toolCall.resultPreview || mcpResult.content,
      });
      updateMessage(request.projectId, targetSessionId, assistantMessage.id, (currentMessage: any) => {
        if (toolCall.error) {
          return {
            id: currentMessage.id,
            role: 'system',
            content: mcpResult.content,
            tone: 'error',
            runId: currentMessage.runId,
            teamRun: currentMessage.teamRun,
            structuredCards: currentMessage.structuredCards,
            projectFileProposal: currentMessage.projectFileProposal,
            createdAt: currentMessage.createdAt,
          };
        }

        return currentMessage.role === 'assistant'
          ? {
              ...currentMessage,
              timeline: buildAssistantTimelineUpdate(mcpResult.content, currentMessage.timeline).map((event: any) =>
                event.kind === 'tool_use' && event.toolCallId === mcpToolEventKey
                  ? {
                      ...event,
                      status: 'completed' as const,
                    }
                  : event
              ),
            }
          : currentMessage;
      });
      appendRuntimeTimelineEvent(runtimeStoreThreadId, {
        id: createRuntimeEventId(toolCall.error ? 'mcp-error' : 'mcp-complete'),
        threadId: runtimeStoreThreadId,
        providerId: runtimeProviderId,
        summary: mcpResult.timelineSummary,
        createdAt: Date.now(),
      });
      await persistRuntimeTimelineEvent({
        threadId: replayThreadId,
        providerId: runtimeProviderId,
        summary: mcpResult.timelineSummary,
      });
      await replayRecoveryController.appendAndSync({
        runtimeStoreThreadId,
        replayThreadId,
        eventType: toolCall.error ? 'mcp_failed' : 'mcp_completed',
        payload: mcpResult.replayPayload,
      });
      if (toolCall.error) {
        await failTurnSession(toolCall.error);
      } else {
        await completeTurnSession(mcpResult.content);
      }
      return;
    }

    if (runtimeExecutionAgentId !== 'built-in') {
      const localExecutionAgentId = runtimeExecutionAgentId;
      const preferredTeamAgent =
        preferredForkAgentId === 'claude' || preferredForkAgentId === 'codex'
          ? preferredForkAgentId
          : agentAvailability.codex.ready
            ? 'codex'
            : 'claude';
      const localAgentConversationHistory = shouldRunForkSkill ? [] : conversationHistory;
      const localAgentSkillsForTurn = shouldRunForkSkill ? forkSkillsForTurn : runtimeVisibleSkillsForTurn;
      const approvalThreadId = runtimeThreadId || targetSessionId;
      const localAgentFlow = prepareRuntimeLocalAgentFlow({
        agentId: localExecutionAgentId,
        sandboxPolicy,
      });
      const localAgentDecisionState =
        localAgentFlow.decision === 'auto-execute' ? null : buildRuntimeLocalAgentDecisionState(localAgentFlow);
      const localAgentDecisionFeedback = resolveRuntimeLocalAgentDecisionFeedback({
        decisionState: localAgentDecisionState,
        summary: localAgentFlow.summary,
      });
      const localAgentToolCallId = buildSyntheticRuntimeToolCallId('local-agent', assistantMessage.id);
      const localAgentExecutionRunId = createLocalAgentExecutionRunId(executionTaskId, localExecutionAgentId);
      upsertExecutionRun(
        runtimeStoreThreadId,
        createExecutionRunRecord({
          id: localAgentExecutionRunId,
          threadId: runtimeStoreThreadId,
          taskId: executionTaskId,
          turnId: runtimeTurnSessionId!,
          parentRunId: rootExecutionRunId,
          providerId: localExecutionAgentId === 'team' ? 'team' : localExecutionAgentId,
          kind: localExecutionAgentId === 'team' ? 'team' : 'local_agent',
          title: localAgentFlow.summary,
          summary: localAgentFlow.summary,
          status: localAgentFlow.decision === 'blocked' ? 'blocked' : 'planning',
        })
      );
      if (localExecutionAgentId !== 'team') {
        upsertExecutionAgentRun(
          runtimeStoreThreadId,
          createExecutionAgentRunRecord({
            id: createLocalAgentExecutionAgentRunId(localAgentExecutionRunId, localExecutionAgentId),
            threadId: runtimeStoreThreadId,
            taskId: executionTaskId,
            runId: localAgentExecutionRunId,
            kind: 'local_agent',
            agentId: localExecutionAgentId,
            role: shouldRunForkSkill ? 'fork_skill' : 'executor',
            title: localAgentFlow.summary,
            summary: localAgentFlow.summary,
            status: localAgentFlow.decision === 'blocked' ? 'blocked' : 'planning',
          })
        );
      }
      patchExecutionTaskFromRuns();
      upsertRuntimeToolUseInMessage(assistantMessage.id, {
        toolCallId: localAgentToolCallId,
        toolName: localExecutionAgentId === 'team' ? 'run_agent_team' : 'run_local_agent',
        toolInput: {
          agent: localExecutionAgentId,
          summary: localAgentFlow.summary,
        },
        status: localAgentFlow.decision === 'blocked' ? 'blocked' : 'running',
      });
      patchCurrentTurnSession((session) => ({
        ...reduceAgentTurnSession(session, { type: 'enter_planning' }),
        plan: buildRuntimeLocalAgentPlan({
          turnId: runtimeTurnSessionId,
          flow: localAgentFlow,
        }),
      }));
      const executeLocalAgentFlow = async (finalizeReplay = true) => {
        const currentLocalExecutionRun = (useAgentRuntimeStore.getState().runsByThread[runtimeStoreThreadId] || []).find(
          (run: any) => run.id === localAgentExecutionRunId
        );
        if (currentLocalExecutionRun) {
          upsertExecutionRun(
            runtimeStoreThreadId,
            patchExecutionRunStatus(currentLocalExecutionRun, 'running', localAgentFlow.summary)
          );
        }
        if (localExecutionAgentId !== 'team') {
          const currentAgentRun = (
            useAgentRuntimeStore.getState().agentRunsByThread[runtimeStoreThreadId] || []
          ).find((run: any) => run.id === createLocalAgentExecutionAgentRunId(localAgentExecutionRunId, localExecutionAgentId));
          if (currentAgentRun) {
            upsertExecutionAgentRun(runtimeStoreThreadId, {
              ...currentAgentRun,
              status: 'running',
              updatedAt: Date.now(),
            });
          }
        }
        patchExecutionTaskFromRuns();
        markTurnExecuting(
          localExecutionAgentId === 'team'
            ? 'Run multi-agent team'
            : shouldRunForkSkill
            ? `Run forked skill with ${localExecutionAgentId === 'codex' ? 'Codex' : 'local'} agent`
            : localExecutionAgentId === 'codex'
              ? 'Run Codex agent'
              : 'Run local agent',
          localAgentFlow.summary
        );
        const projectRoot = await ports.resolveProjectRootById(request.projectId);
        const runPrompt = async ({
          agent,
          projectRoot,
          prompt,
        }: {
          agent: string;
          projectRoot: string;
          prompt: string;
        }) =>
          invoke<LocalAgentCommandResult>('run_local_agent_prompt', {
            params: {
              agent,
              projectRoot,
              prompt,
            },
          });
        await emitMemoryReadLifecycle();
        const executionResult =
          localExecutionAgentId === 'team'
            ? await (async () => {
                const teamResult = await runAgentTeamTurn({
                  projectId: request.projectId,
                  projectName: request.projectName,
                  threadId: runtimeStoreThreadId,
                  turnId: runtimeTurnSessionId || `turn_${runId}`,
                  userInput: cleanedContent,
                  projectRoot,
                  preferredAgent: preferredTeamAgent,
                  contextWindowTokens: request.contextWindowTokens,
                  conversationHistory: localAgentConversationHistory,
                  agentInstructions,
                  referenceFiles: resolvedReferenceContextFiles.map((file: any) => ({
                    path: file.path,
                    summary: file.summary,
                    content: file.content || file.summary || file.title,
                  })),
                  memoryEntries: projectMemoryEntries,
                  onTeamRunUpdate: (teamRun: any) => {
                    patchLiveState(runtimeStoreThreadId, (state: any) => ({
                      ...state,
                      connectionState: 'connected',
                      statusVerb:
                        teamRun.status === 'running'
                          ? 'Running team tasks'
                          : teamRun.status === 'failed'
                            ? 'Team run failed'
                            : '',
                      activeThinking: false,
                      activeToolName: 'team',
                      streamingToolInput: '',
                    }));
                    upsertTeamRun(runtimeStoreThreadId, teamRun);
                    upsertBackgroundTask(runtimeStoreThreadId, {
                      id: teamRun.id,
                      threadId: runtimeStoreThreadId,
                      runKind: 'team',
                      title: teamRun.summary,
                      status: teamRun.status,
                      summary: teamRun.finalSummary || teamRun.strategy,
                      payloadJson: JSON.stringify(teamRun),
                      createdAt: teamRun.createdAt,
                      updatedAt: teamRun.updatedAt,
                    });
                    void upsertAgentBackgroundTask({
                      id: teamRun.id,
                      threadId: runtimeStoreThreadId,
                      runKind: 'team',
                      title: teamRun.summary,
                      status: teamRun.status,
                      summary: teamRun.finalSummary || teamRun.strategy,
                      payloadJson: JSON.stringify(teamRun),
                      createdAt: teamRun.createdAt,
                    });
                    updateMessage(request.projectId, targetSessionId, assistantMessage.id, (message: any) => ({
                      ...message,
                      teamRun,
                    }));
                    updateAssistantMessageTimeline(assistantMessage.id, (timeline: any) =>
                      replaceAssistantRuntimeTimelineEvents(
                        timeline,
                        syncTeamRunRuntimeEvents(
                          getAssistantRuntimeTimelineEvents(timeline),
                          localAgentToolCallId,
                          teamRun
                        )
                      )
                    );
                    syncExecutionGraph(
                      syncTeamExecutionGraph(
                        useAgentRuntimeStore.getState().runsByThread[runtimeStoreThreadId] || [],
                        useAgentRuntimeStore.getState().agentRunsByThread[runtimeStoreThreadId] || [],
                        {
                          threadId: runtimeStoreThreadId,
                          taskId: executionTaskId,
                          turnId: runtimeTurnSessionId!,
                          parentRunId: rootExecutionRunId,
                          teamRun,
                        }
                      )
                    );
                  },
                  runPrompt,
                });

                return {
                  status: 'completed' as const,
                  finalContent: teamResult.finalContent,
                  teamRun: teamResult.teamRun,
                  successOutcome: {
                    activityEntry: buildRuntimeChangedPathActivityEntry({
                      createId: createActivityEntryId,
                      runId,
                      content: teamResult.finalContent,
                      changedPaths: teamResult.changedPaths,
                      runtime: 'local',
                      skill: resolvedSkill,
                    }),
                    timelineSummary: `Team completed: ${teamResult.teamRun.phases.length} phases / ${teamResult.teamRun.members.length} agents`,
                    replaySummary: teamResult.finalContent,
                  },
                  completedStep: {
                    title: 'Completed team turn',
                    status: 'completed' as const,
                    userVisibleDetail: teamResult.finalContent,
                    resultSummary: teamResult.finalContent,
                  },
                };
              })()
            : await runRuntimeLocalAgentExecution({
                projectId: request.projectId,
                projectName: request.projectName,
                threadId: targetSessionId,
                userInput: cleanedContent,
                contextWindowTokens: request.contextWindowTokens,
                conversationHistory: localAgentConversationHistory,
                agentInstructions,
                referenceFiles: resolvedReferenceContextFiles,
                memoryEntries: projectMemoryEntries,
                activeSkills: localAgentSkillsForTurn,
                skillIntent,
                contextLabels,
                allowedTools: getTurnAllowedRuntimeTools({
                  sandboxPolicy,
                  isWindows: isWindowsHost(),
                }),
                agentId: localExecutionAgentId,
                projectRoot,
                runPrompt,
                createActivityId: createActivityEntryId,
                runId,
                skill: resolvedSkill,
                normalizeErrorMessage,
                buildErrorPreview: buildSessionPreview,
              });

        if (executionResult.status === 'completed') {
          const currentLocalExecutionRun = (useAgentRuntimeStore.getState().runsByThread[runtimeStoreThreadId] || []).find(
            (run: any) => run.id === localAgentExecutionRunId
          );
          if (currentLocalExecutionRun) {
            upsertExecutionRun(
              runtimeStoreThreadId,
              patchExecutionRunStatus(currentLocalExecutionRun, 'completed', executionResult.finalContent)
            );
          }
          if (localExecutionAgentId !== 'team') {
            const currentAgentRun = (
              useAgentRuntimeStore.getState().agentRunsByThread[runtimeStoreThreadId] || []
            ).find((run: any) => run.id === createLocalAgentExecutionAgentRunId(localAgentExecutionRunId, localExecutionAgentId));
            if (currentAgentRun) {
              upsertExecutionAgentRun(runtimeStoreThreadId, {
                ...currentAgentRun,
                status: 'completed',
                summary: executionResult.finalContent,
                updatedAt: Date.now(),
                completedAt: currentAgentRun.completedAt || Date.now(),
              });
            }
          }
          patchExecutionTaskFromRuns();
          patchLiveState(runtimeStoreThreadId, (state: any) => ({
            ...state,
            connectionState: 'connected',
            statusVerb: '',
            activeThinking: false,
            activeToolName: null,
            streamingToolInput: '',
            streamingText: '',
            tokenUsage: {
              ...state.tokenUsage,
              outputTokens: state.tokenUsage.outputTokens + estimateTokenCount(executionResult.finalContent),
            },
          }));
          upsertRuntimeToolResultInMessage(assistantMessage.id, {
            toolCallId: localAgentToolCallId,
            toolName: localExecutionAgentId === 'team' ? 'run_agent_team' : 'run_local_agent',
            status: 'completed',
            output: executionResult.finalContent,
          });
          updateMessage(request.projectId, targetSessionId, assistantMessage.id, (message: any) => ({
            ...message,
            ...buildAssistantContentState(executionResult.finalContent),
            teamRun: ('teamRun' in executionResult ? executionResult.teamRun : null) as StoredChatMessage['teamRun'],
          }));
          if (executionResult.successOutcome.activityEntry) {
            appendActivityEntry(request.projectId, executionResult.successOutcome.activityEntry);
            notifyProjectFilesChanged(executionResult.successOutcome.activityEntry.changedPaths);
            const checkpointFiles = await captureCheckpointFilesFromPaths(
              request.projectId,
              executionResult.successOutcome.activityEntry.changedPaths
            );
            await persistTurnCheckpointForRun({
              threadId: approvalThreadId,
              runId: executionResult.successOutcome.activityEntry.runId,
              messageId: assistantMessage.id,
              summary: executionResult.successOutcome.activityEntry.summary,
              files: checkpointFiles,
            });
          }
          appendRuntimeTimelineEvent(runtimeStoreThreadId, {
            id: createRuntimeEventId('local-agent'),
            threadId: runtimeStoreThreadId,
            providerId: runtimeProviderId,
            summary: executionResult.successOutcome.timelineSummary,
            createdAt: Date.now(),
          });
          if (finalizeReplay) {
            await completeTurnSession(executionResult.successOutcome.replaySummary);
          } else {
            markTurnExecutionStep(executionResult.completedStep);
          }
          return;
        }

        patchLiveState(runtimeStoreThreadId, (state: any) => ({
          ...state,
          connectionState: 'connected',
          statusVerb: 'Failed',
          activeThinking: false,
          activeToolName: null,
          streamingToolInput: '',
          streamingText: '',
        }));
        const failedLocalExecutionRun = (useAgentRuntimeStore.getState().runsByThread[runtimeStoreThreadId] || []).find(
          (run: any) => run.id === localAgentExecutionRunId
        );
        if (failedLocalExecutionRun) {
          upsertExecutionRun(
            runtimeStoreThreadId,
            patchExecutionRunStatus(failedLocalExecutionRun, 'failed', executionResult.message)
          );
        }
        if (localExecutionAgentId !== 'team') {
          const currentAgentRun = (
            useAgentRuntimeStore.getState().agentRunsByThread[runtimeStoreThreadId] || []
          ).find((run: any) => run.id === createLocalAgentExecutionAgentRunId(localAgentExecutionRunId, localExecutionAgentId));
          if (currentAgentRun) {
            upsertExecutionAgentRun(runtimeStoreThreadId, {
              ...currentAgentRun,
              status: 'failed',
              summary: executionResult.message,
              updatedAt: Date.now(),
              completedAt: currentAgentRun.completedAt || Date.now(),
            });
          }
        }
        patchExecutionTaskFromRuns();
        upsertRuntimeToolResultInMessage(assistantMessage.id, {
          toolCallId: localAgentToolCallId,
          toolName: localExecutionAgentId === 'team' ? 'run_agent_team' : 'run_local_agent',
          status: 'failed',
          output: executionResult.message,
        });
        updateMessage(request.projectId, targetSessionId, assistantMessage.id, (currentMessage: any) => ({
          ...currentMessage,
          role: 'system',
          tone: 'error',
          content: executionResult.message,
          ...clearAssistantContentState(),
        }));
        appendActivityEntry(request.projectId, executionResult.failureOutcome.activityEntry);
        if (finalizeReplay) {
          await failTurnSession(executionResult.failureOutcome.replaySummary);
        } else {
          markTurnExecutionStep(executionResult.failedStep);
        }
        appendRuntimeTimelineEvent(runtimeStoreThreadId, {
          id: createRuntimeEventId('local-agent-error'),
          threadId: runtimeStoreThreadId,
          providerId: runtimeProviderId,
          summary: executionResult.failureOutcome.timelineSummary,
          createdAt: Date.now(),
        });
      };

      await handleRuntimeLocalAgentDecision({
        flow: localAgentFlow,
        onBlocked: async () => {
          patchLiveState(runtimeStoreThreadId, (state: any) => ({
            ...state,
            connectionState: 'connected',
            statusVerb: 'Blocked',
            activeThinking: false,
            activeToolName: null,
            streamingToolInput: '',
          }));
          updateMessage(request.projectId, targetSessionId, assistantMessage.id, (message: any) => ({
            ...message,
            role: 'system',
            tone: 'error',
            content: localAgentDecisionState?.messageContent || '已阻止本地 Agent 执行。',
            ...clearAssistantContentState(),
          }));
          await denyRuntimeLocalAgentApproval({
            flow: localAgentFlow,
            threadId: approvalThreadId,
            messageId: assistantMessage.id,
            enqueueAgentApproval,
            enqueueApproval,
            resolveStoredApproval,
            resolveAgentApproval,
          });
          appendRuntimeTimelineEvent(runtimeStoreThreadId, {
            id: createRuntimeEventId('local-agent-blocked'),
            threadId: runtimeStoreThreadId,
            providerId: runtimeProviderId,
            summary: localAgentDecisionFeedback.timelineSummary,
            createdAt: Date.now(),
          });
          upsertRuntimeToolResultInMessage(assistantMessage.id, {
            toolCallId: localAgentToolCallId,
            toolName: localExecutionAgentId === 'team' ? 'run_agent_team' : 'run_local_agent',
            status: 'blocked',
            output: localAgentDecisionFeedback.blockedReason,
          });
          await blockTurnSession(
            localAgentDecisionFeedback.blockedReason,
            localAgentDecisionFeedback.replaySummary,
            localAgentDecisionFeedback.blockedActionLabel
          );
        },
        onApprovalRequired: async () => {
          patchCurrentTurnSession((session) => ({
            ...reduceAgentTurnSession(session, { type: 'plan_waiting_approval' }),
            plan: updateRuntimeLocalAgentPlanApprovalStatus(
              session.plan,
              localAgentDecisionFeedback.approvalStatus
            ),
          }));
          updateMessage(request.projectId, targetSessionId, assistantMessage.id, (message: any) => ({
            ...message,
            ...buildAssistantContentState(localAgentDecisionFeedback.messageContent),
          }));
          const approved = await interactionPort.waitForApproval({
            threadId: approvalThreadId,
            runtimeStoreThreadId,
            replayThreadId,
            providerId: runtimeProviderId,
            actionType: localAgentFlow.actionType,
            riskLevel: localAgentFlow.riskLevel,
            summary: localAgentFlow.summary,
            messageId: assistantMessage.id,
            toolCallId: localAgentToolCallId,
            onApprove: async () => {
              await executeLocalAgentFlow(false);
            },
            onDeny: async () => {
              upsertRuntimeToolResultInMessage(assistantMessage.id, {
                toolCallId: localAgentToolCallId,
                toolName: localExecutionAgentId === 'team' ? 'run_agent_team' : 'run_local_agent',
                status: 'blocked',
                output: localAgentDecisionFeedback.deniedReason,
              });
              updateMessage(request.projectId, targetSessionId, assistantMessage.id, (message: any) => ({
                ...message,
                role: 'system',
                tone: 'error',
                content: localAgentDecisionFeedback.deniedMessageContent,
                ...clearAssistantContentState(),
              }));
              patchCurrentTurnSession((session) => ({
                ...reduceAgentTurnSession(session, {
                  type: 'execution_blocked',
                  reason: localAgentDecisionFeedback.deniedReason,
                  actionLabel: localAgentDecisionFeedback.deniedActionLabel,
                }),
                plan: updateRuntimeLocalAgentPlanApprovalStatus(session.plan, 'denied'),
              }));
            },
            display: {
              toolName: 'agent',
              inputJson: JSON.stringify(
                {
                  agent: localExecutionAgentId,
                  projectRoot,
                  summary: localAgentFlow.summary,
                },
                null,
                2
              ),
            },
          });
          if (!approved) {
            const deniedApprovalSummary = `Approval denied: ${localAgentFlow.summary}`;
            patchLiveState(runtimeStoreThreadId, (state: any) => ({
              ...state,
              connectionState: 'connected',
              statusVerb: 'Blocked',
              activeThinking: false,
              activeToolName: null,
              streamingToolInput: '',
              streamingText: '',
            }));
            appendRuntimeTimelineEvent(runtimeStoreThreadId, {
              id: createRuntimeEventId('local-agent-denied'),
              threadId: runtimeStoreThreadId,
              providerId: runtimeProviderId,
              summary: deniedApprovalSummary,
              createdAt: Date.now(),
            });
            await blockTurnSession(
              localAgentDecisionFeedback.deniedReason,
              deniedApprovalSummary,
              localAgentDecisionFeedback.deniedActionLabel
            );
            return;
          }
          appendRuntimeTimelineEvent(runtimeStoreThreadId, {
            id: createRuntimeEventId('local-agent-approval'),
            threadId: runtimeStoreThreadId,
            providerId: runtimeProviderId,
            summary: localAgentDecisionFeedback.timelineSummary,
            createdAt: Date.now(),
          });
          await activeExecutionController.completeWithReplay(localAgentDecisionFeedback.replaySummary);
        },
        onAutoExecute: async () => {
          await executeLocalAgentFlow();
        },
      });
      return;
    }

    const projectRoot = await ports.resolveProjectRootById(request.projectId);
    markTurnExecuting('Run built-in agent turn', buildSessionPreview(cleanedContent));
    const toolExecutor = createRuntimeChatToolExecutor(projectRoot);
    const builtInAllowedTools = getTurnAllowedRuntimeTools({
      sandboxPolicy,
      isWindows: isWindowsHost(),
    });
    const runBuiltInQuestionTool = async (call: ToolCall): Promise<ToolResult> => {
      const questions = parseRuntimeQuestionInput(call.input);
      if (questions.length === 0) {
        return {
          type: 'text',
          content: 'AskUserQuestion requires a question or questions payload.',
          is_error: true,
        };
      }

      const questionId = `runtime-question_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const payload: RuntimeQuestionPayload = {
        id: questionId,
        toolCallId: call.id,
        status: 'pending',
        questions,
        createdAt: Date.now(),
      };

      updateAssistantMessageTimeline(assistantMessage.id, (timeline: any) =>
        upsertAssistantRuntimeQuestionEvent(timeline, {
          id: buildRuntimeEventId('question', questionId),
          kind: 'question',
          questionId,
          payload,
          createdAt: Date.now(),
        })
      );
      patchLiveState(runtimeStoreThreadId, (state: any) => ({
        ...state,
        connectionState: 'connected',
        statusVerb: 'Waiting for input',
        activeThinking: false,
        activeToolName: call.name,
        pendingQuestionSummary: questions[0]?.question || null,
      }));

        const answers = await interactionPort.waitForQuestionAnswer({
          assistantMessageId: assistantMessage.id,
          question: payload,
        });

      return {
        type: 'text',
        content: `User answers:\n${JSON.stringify(answers, null, 2)}`,
      };
    };
    const runBuiltInAgentTool = async (call: ToolCall): Promise<ToolResult> => {
      const delegatedInput = resolveRuntimeAgentToolInput(call.input);
      if (!delegatedInput) {
        return {
          type: 'text',
          content: 'agent requires a prompt/task/request string and optional preferred_agent of codex or claude.',
          is_error: true,
        };
      }

      const preferredTeamAgent =
        delegatedInput.preferredAgent ||
        (preferredForkAgentId === 'claude' || preferredForkAgentId === 'codex'
          ? preferredForkAgentId
          : agentAvailability.codex.ready
            ? 'codex'
            : 'claude');
      const runPrompt = async ({
        agent,
        projectRoot,
        prompt,
      }: {
        agent: string;
        projectRoot: string;
        prompt: string;
      }) =>
        invoke<LocalAgentCommandResult>('run_local_agent_prompt', {
          params: {
            agent,
            projectRoot,
            prompt,
          },
        });

      const teamResult = await runAgentTeamTurn({
        projectId: request.projectId,
        projectName: request.projectName,
        threadId: runtimeStoreThreadId,
        turnId: runtimeTurnSessionId || `turn_${runId}`,
        userInput: delegatedInput.prompt,
        projectRoot,
        preferredAgent: preferredTeamAgent,
        contextWindowTokens: request.contextWindowTokens,
        conversationHistory,
        agentInstructions,
        referenceFiles: resolvedReferenceContextFiles.map((file: any) => ({
          path: file.path,
          summary: file.summary,
          content: file.content || file.summary || file.title,
        })),
        memoryEntries: projectMemoryEntries,
        onTeamRunUpdate: (teamRun: any) => {
          patchLiveState(runtimeStoreThreadId, (state: any) => ({
            ...state,
            connectionState: 'connected',
            statusVerb:
              teamRun.status === 'running'
                ? 'Running team tasks'
                : teamRun.status === 'failed'
                  ? 'Team run failed'
                  : '',
            activeThinking: false,
            activeToolName: 'agent',
            streamingToolInput: summarizeLiveToolInput(call.input),
          }));
          upsertTeamRun(runtimeStoreThreadId, teamRun);
          updateAssistantMessageTimeline(assistantMessage.id, (timeline: any) =>
            replaceAssistantRuntimeTimelineEvents(
              timeline,
              syncTeamRunRuntimeEvents(
                getAssistantRuntimeTimelineEvents(timeline),
                call.id,
                teamRun
              )
            )
          );
        },
        runPrompt,
      });

      return buildRuntimeAgentToolResult({
        finalContent: teamResult.finalContent,
        changedPaths: teamResult.changedPaths,
      });
    };
    const requestBuiltInToolApproval = async (call: ToolCall) => {
      if (!RISKY_RUNTIME_TOOLS.has(call.name)) {
        return;
      }

      const actionType = buildBuiltInToolApprovalActionType(call.name);
      const riskLevel = classifyRuntimeActionRisk(actionType);

      if (shouldDenyRuntimeAction({ riskLevel, sandboxPolicy })) {
        throw new Error(`Current sandbox policy (${sandboxPolicy}) blocks ${call.name}.`);
      }

      if (shouldAutoApproveRuntimeAction({ riskLevel, sandboxPolicy })) {
        return;
      }

      const approved = await interactionPort.waitForApproval({
          threadId: runtimeThreadId || targetSessionId,
          runtimeStoreThreadId,
          replayThreadId,
          providerId: runtimeProviderId,
          actionType,
          riskLevel,
          summary: buildBuiltInToolApprovalSummary(call.name, call.input),
          messageId: assistantMessage.id,
          toolCallId: call.id,
          display: buildBuiltInToolApprovalDisplay(call.name, call.input),
          onApprove: async () => {},
          onDeny: async () => {},
        });

      if (!approved) {
        throw new Error(`User denied ${call.name}.`);
      }
    };
    setThreadToolCalls(targetSessionId, []);
    let toolStartTime = 0;
    let toolTimerInterval: ReturnType<typeof setInterval> | null = null;
    const streamingAssembler = createRuntimeStreamingMessageAssembler();
    pushStreamingDraft(assistantMessage.id, {
      timeline: applyAssistantReasoningProgress(
        buildAssistantStreamingTimeline('', assistantBaseTimeline, {
          fallbackThinkingContent: '正在思考...',
        }),
        {
          active: true,
          referenceTime: Date.now(),
        }
      ),
    });
    await emitMemoryReadLifecycle();
    // Provider-embedded pages intentionally keep the codex-like runAgentTurn shape:
    // executeModel: (prompt: any) => executeRuntimePrompt({ providerId: runtimeProviderId, ... }).
    const agentTurn = await runRuntimeChatBuiltInAgentTurn({
      projectId: request.projectId,
      projectName: request.projectName,
      threadId: targetSessionId,
      projectRoot,
      userInput: cleanedContent,
      rawUserInput: rawContent,
      contextWindowTokens: request.contextWindowTokens,
      conversationHistory,
      agentInstructions,
      referenceFiles: resolvedReferenceContextFiles,
      memoryEntries: projectMemoryEntries,
      activeSkills: runtimeVisibleSkillsForTurn,
      skillIntent,
      contextLabels,
      allowedTools: builtInAllowedTools,
      onSkillHookEvent: emitSkillHookLifecycle,
      onToolCallsChange: (toolCalls: any) => {
        setStallFP((n: any) => n + 1);
        setThreadToolCalls(targetSessionId, toolCalls);
        emitCanonicalToolLifecycle(toolCalls);
        const runningToolCall = [...toolCalls].reverse().find((toolCall) => toolCall.status === 'running') || null;

        if (runningToolCall && toolStartTime === 0) {
          toolStartTime = Date.now();
          toolTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - toolStartTime) / 1000);
            if (elapsed >= 3) {
              patchLiveState(runtimeStoreThreadId, (state: any) => ({
                ...state,
                statusVerb: state.activeToolName ? `Running ${state.activeToolName} (${elapsed}s)` : state.statusVerb,
              }));
            }
          }, 1000);
        } else if (!runningToolCall) {
          toolStartTime = 0;
          if (toolTimerInterval) {
            clearInterval(toolTimerInterval);
            toolTimerInterval = null;
          }
        }

        patchLiveState(runtimeStoreThreadId, (state: any) => ({
          ...state,
          activeToolName: runningToolCall?.name || null,
          streamingToolInput: summarizeLiveToolInput(runningToolCall?.input),
          statusVerb: runningToolCall?.name
            ? `Running ${runningToolCall.name}${toolStartTime && Date.now() - toolStartTime > 3000 ? ` (${Math.floor((Date.now() - toolStartTime) / 1000)}s)` : ''}`
            : state.statusVerb,
        }));
        updateAssistantMessageTimeline(assistantMessage.id, (timeline: any) =>
          syncAssistantTimelineWithToolCalls(timeline, toolCalls)
        );
      },
      onModelEvent: (event: any) => {
        setStallFP((n: any) => n + 1);
        emitCanonicalProviderEvent(
          event.kind === 'thinking'
            ? { kind: 'thinking', delta: event.delta }
            : { kind: 'text', delta: event.delta }
        );
        const draftState = streamingAssembler.append(event);
        const currentDraftTimeline =
          streamingDraftBufferRef.current[assistantMessage.id]?.timeline || assistantBaseTimeline;
        const reasoningReferenceTime = Date.now();
        const reasoningProgress = {
          active: event.kind === 'thinking',
          referenceTime: reasoningReferenceTime,
        };
        const draft = {
          timeline: applyAssistantReasoningProgress(
            buildAssistantStreamingTimeline(draftState.content, currentDraftTimeline, {
              fallbackThinkingContent: draftState.thinkingContent,
              preferredAssistantParts: draftState.assistantParts as AIChatMessagePart[],
            }),
            reasoningProgress
          ),
        };
        patchLiveState(runtimeStoreThreadId, (state: any) => ({
          ...state,
          connectionState: 'connected',
          statusVerb: event.kind === 'thinking' ? 'Reasoning' : 'Streaming response',
          activeThinking: event.kind === 'thinking',
          streamingToolInput: event.kind === 'thinking' ? state.streamingToolInput : '',
          streamingText:
            event.kind === 'text' ? `${state.streamingText}${event.delta}` : state.streamingText,
          tokenUsage: {
            ...state.tokenUsage,
            outputTokens: state.tokenUsage.outputTokens + estimateTokenCount(event.delta),
          },
        }));
        pushStreamingDraft(assistantMessage.id, draft);
      },
      beforeToolCall: async (call: any) => {
        const boundaryDraft = streamingAssembler.markToolBoundary();
        const currentDraftTimeline =
          streamingDraftBufferRef.current[assistantMessage.id]?.timeline || assistantBaseTimeline;
        const reasoningReferenceTime = Date.now();
        pushStreamingDraft(assistantMessage.id, {
          timeline: applyAssistantReasoningProgress(
            buildAssistantStreamingTimeline(boundaryDraft.content, currentDraftTimeline, {
              fallbackThinkingContent: boundaryDraft.thinkingContent,
              preferredAssistantParts: boundaryDraft.assistantParts as AIChatMessagePart[],
            }),
            {
              active: false,
              referenceTime: reasoningReferenceTime,
            }
          ),
        });
        updateMessage(request.projectId, targetSessionId, assistantMessage.id, (message: any) => ({
          ...message,
          ...(message.role === 'assistant'
            ? {
                timeline: applyAssistantReasoningProgress(
                  buildAssistantTimelineUpdate(boundaryDraft.content, message.timeline, {
                    fallbackThinkingContent: boundaryDraft.thinkingContent,
                    preferredAssistantParts: boundaryDraft.assistantParts,
                  }),
                  {
                    active: false,
                    referenceTime: reasoningReferenceTime,
                  }
                ),
              }
            : {}),
        }));
        await requestBuiltInToolApproval(call);
      },
      executeModel: (prompt: any, systemPrompt: any, onEvent: any) =>
        ports.executeRuntimePrompt({
            providerId: runtimeProviderId,
            sessionId: targetSessionId,
            configId: request.selectedRuntimeConfigId,
            modelOverride: inlineModelOverride,
            systemPrompt,
            prompt,
            onEvent,
          signal: abortControllerRef.current?.signal,
        }),
      executeTool: (call: any) =>
        call.name === 'agent'
          ? runBuiltInAgentTool(call)
          : call.name === ASK_USER_TOOL_NAME
            ? runBuiltInQuestionTool(call)
            : toolExecutor.execute(call),
    });

    const finalDraft = streamingAssembler.buildFinal(agentTurn.finalContent);
    const normalizedFinalContent = finalDraft.content;
    emitCanonicalToolLifecycle(agentTurn.toolCalls);
    const recoveryProposal = await buildRuntimeWriteRecoveryProposal(agentTurn.toolCalls);
    const finalAnswerContent =
      recoveryProposal && !normalizedFinalContent.trim()
        ? recoveryProposal.assistantMessage
        : normalizedFinalContent;
    emitCanonicalProviderEvent({ kind: 'done', finalText: finalAnswerContent });
    if (toolTimerInterval) clearInterval(toolTimerInterval);
    clearStreamingDraft(assistantMessage.id);
    const reasoningReferenceTime = Date.now();
    patchLiveState(runtimeStoreThreadId, (state: any) => ({
      ...state,
      connectionState: 'connected',
      statusVerb: '',
      activeThinking: false,
      activeToolName: null,
      streamingToolInput: '',
      streamingText: '',
    }));
    updateMessage(request.projectId, targetSessionId, assistantMessage.id, (message: any) => ({
      ...message,
      ...(message.role === 'assistant'
        ? {
            timeline: applyAssistantReasoningProgress(
              buildAssistantTimelineUpdate(
                finalAnswerContent,
                syncAssistantTimelineWithToolCalls(message.timeline, agentTurn.toolCalls),
                {
                  fallbackThinkingContent: getAssistantTimelineReasoning(message.timeline),
                  preferredAssistantParts: finalDraft.assistantParts as AIChatMessagePart[],
                }
              ),
              {
                active: false,
                referenceTime: reasoningReferenceTime,
              }
            ),
          }
        : {}),
      projectFileProposal: message.projectFileProposal ?? recoveryProposal ?? undefined,
    }));
    setThreadMemoryCandidates(targetSessionId, agentTurn.memoryCandidates);
    const checkpointFilesFromToolCalls = extractCheckpointFilesFromToolCalls(agentTurn.toolCalls);
    notifyProjectFilesChanged(checkpointFilesFromToolCalls.map((file: any) => file.path));
    const activityEntry = buildRuntimeChangedPathActivityEntry({
      createId: createActivityEntryId,
      runId,
      content: normalizedFinalContent,
      changedPaths: checkpointFilesFromToolCalls.map((file: any) => file.path),
      skill: resolvedSkill,
    });
    if (activityEntry) {
      appendActivityEntry(request.projectId, activityEntry);
      await persistTurnCheckpointForRun({
        threadId: replayThreadId,
        runId: activityEntry.runId,
        messageId: assistantMessage.id,
        summary: activityEntry.summary,
        files:
          checkpointFilesFromToolCalls.length > 0
            ? checkpointFilesFromToolCalls
            : await captureCheckpointFilesFromPaths(request.projectId, activityEntry.changedPaths),
      });
    } else if (checkpointFilesFromToolCalls.length > 0) {
      await persistTurnCheckpointForRun({
        threadId: replayThreadId,
        runId,
        messageId: assistantMessage.id,
        summary: `更新了 ${checkpointFilesFromToolCalls.map((file: any) => file.path).join('、')}`,
        files: checkpointFilesFromToolCalls,
      });
    }
    await persistRuntimeTimelineEvent({
      threadId: replayThreadId,
      providerId: runtimeProviderId,
      summary: `Assistant: ${buildSessionPreview(normalizedFinalContent)}`,
    });
    appendRuntimeTimelineEvent(runtimeStoreThreadId, {
      id: createRuntimeEventId('assistant'),
      threadId: runtimeStoreThreadId,
      providerId: runtimeProviderId,
      summary: `Assistant: ${buildSessionPreview(normalizedFinalContent)}`,
      createdAt: Date.now(),
    });
    await completeTurnSession(normalizedFinalContent);
  } catch (error) {
    if (stopRequestedRef.current) {
      commitStreamingDraft(assistantMessage.id);
      clearStreamingDraft(assistantMessage.id);
      patchLiveState(runtimeStoreThreadId, (state: any) => ({
        ...state,
        connectionState: 'connected',
        statusVerb: '',
        activeThinking: false,
        activeToolName: null,
        streamingToolInput: '',
        streamingText: '',
      }));
    } else {
      const message = normalizeErrorMessage(error);
      appendCanonicalEventToSession({
        eventId: `evt_error_${runId}_${++canonicalEventCounter}`,
        runId,
        turnId: runId,
        sessionId: targetSessionId,
        messageId: assistantMessage.id,
        type: 'error.raised',
        ts: Date.now(),
        seq: 0,
        source: { kind: 'runtime', provider: runtimeProviderId, name: 'runtime' },
        payload: {
          code: 'runtime.turn_failed',
          summary: message,
          source: 'runtime',
        },
      });
      clearStreamingDraft(assistantMessage.id);
      patchLiveState(runtimeStoreThreadId, (state: any) => ({
        ...state,
        connectionState: 'connected',
        statusVerb: 'Failed',
        activeThinking: false,
        activeToolName: null,
        streamingToolInput: '',
        streamingText: '',
      }));
      updateMessage(request.projectId, targetSessionId, assistantMessage.id, (currentMessage: any) => ({
        ...currentMessage,
        role: 'system',
        tone: 'error',
        content: message,
        ...clearAssistantContentState(),
      }));
      appendActivityEntry(request.projectId, {
        id: createActivityEntryId(),
        runId,
        type: 'failed',
        summary: message,
        changedPaths: [],
        runtime: effectiveChatAgentId === 'built-in' ? 'built-in' : 'local',
        skill: resolvedSkill,
        createdAt: Date.now(),
      });
      if (executionController) {
        if (runtimeTurnSessionId) {
          patchTurnSession(runtimeStoreThreadId, runtimeTurnSessionId, (session) =>
            reduceAgentTurnSession(session, { type: 'execution_failed', reason: message })
          );
        }
        await executionController.failWithReplay(message);
      } else {
        failRuntimeRun(runtimeStoreThreadId, message);
      }
      appendRuntimeTimelineEvent(runtimeStoreThreadId, {
        id: createRuntimeEventId('error'),
        threadId: runtimeStoreThreadId,
        providerId: runtimeProviderId,
        summary: `Error: ${buildSessionPreview(message)}`,
        createdAt: Date.now(),
      });
    }
  } finally {
    setIsLoading(false);
    runningSubmissionRef.current = null;
    abortControllerRef.current = null;
  }
    
};
