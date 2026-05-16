// 文件作用：流式控制层，位于turn 编排层。
// 所在链路：负责单轮执行的路由、流式控制、工具调用和收口。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
import type { AITextStreamEvent } from '../../core/AIService.ts';
// 这个文件负责 turn 里的流式输出控制。
// 它会把模型流事件同时写入 canonical events、assistant timeline draft 和 runtime live state。
// 如果你在排查“thinking/text 流式显示为什么不对”，先看这里。
import type { RuntimeToolStep } from '../agent-kernel/agentKernelTypes.ts';
import { createBuiltinRuntimeAdapter } from '../adapters/builtinRuntimeAdapter.ts';
import {
  applyAssistantReasoningProgress,
  buildAssistantStreamingTimeline,
  buildAssistantTimelineUpdate,
  getAssistantTimelineReasoning,
  syncAssistantTimelineWithToolCalls,
  type AssistantTimelineEvent,
} from '../../store/assistantTimeline.ts';
import { createRuntimeStreamingMessageAssembler } from './agentTurnRunner.ts';
import type { RuntimeChatMessageBridge, RuntimeChatStateBridge } from './runtimeChatTurnStoreBridge.ts';

// 这个 controller 负责把模型流式事件同时送进三条链：
// 1. canonical events
// 2. assistant timeline draft / final timeline
// 3. runtime live state（连接态、token、streaming text）
// 如果你在查“流式 thinking / text 为什么显示不对”，这 usually 是首个入口。
export const createRuntimeChatStreamingController = (input: {
  assistantMessageId: string;
  runId: string;
  bridge: RuntimeChatMessageBridge & Pick<RuntimeChatStateBridge, 'patchLiveState'>;
  runtimeStoreThreadId: string;
  baseTimeline: AssistantTimelineEvent[];
  pushStreamingDraft?: (assistantMessageId: string, draft: { timeline: AssistantTimelineEvent[] }) => void;
  clearStreamingDraft?: (assistantMessageId: string) => void;
  estimateTokenCount?: (content: string) => number;
}) => {
  const streamingAssembler = createRuntimeStreamingMessageAssembler();
  const adapter = createBuiltinRuntimeAdapter({
    sessionId: input.runtimeStoreThreadId,
    runId: input.runId,
    turnId: input.runId,
  });

  return {
    onModelEvent(event: AITextStreamEvent): void {
      if (event.kind !== 'thinking' && event.kind !== 'text') {
        return;
      }

      // provider 流事件先落成 canonical truth，再同步更新临时渲染草稿和 live state。
      adapter.onProviderEvent(
        event.kind === 'thinking'
          ? { kind: 'thinking', delta: event.delta }
          : { kind: 'text', delta: event.delta },
        (canonicalEvent) => input.bridge.appendCanonicalEvent(input.assistantMessageId, canonicalEvent),
      );

      const draftState = streamingAssembler.append(event);
      input.bridge.patchLiveState(input.runtimeStoreThreadId, (state) => ({
        ...state,
        connectionState: 'connected',
        statusVerb: event.kind === 'thinking' ? 'Reasoning' : 'Streaming response',
        activeThinking: event.kind === 'thinking',
        streamingToolInput: event.kind === 'thinking' ? state.streamingToolInput : '',
        streamingText: event.kind === 'text' ? `${state.streamingText}${event.delta}` : state.streamingText,
        tokenUsage: {
          ...state.tokenUsage,
          outputTokens: state.tokenUsage.outputTokens + (input.estimateTokenCount?.(event.delta) || 0),
        },
      }));
      input.pushStreamingDraft?.(input.assistantMessageId, {
        timeline: applyAssistantReasoningProgress(
          buildAssistantStreamingTimeline(draftState.content, input.baseTimeline, {
            fallbackThinkingContent: draftState.thinkingContent,
            preferredAssistantParts: draftState.assistantParts,
          }),
          {
            active: event.kind === 'thinking',
            referenceTime: Date.now(),
          },
        ),
      });
    },
    markToolBoundary(): void {
      // 当模型切到工具执行边界时，提前把当前草稿固化一次，
      // 避免 tool 阶段把上一段 thinking / text 的流式状态拖得太长。
      const boundaryDraft = streamingAssembler.markToolBoundary();
      input.pushStreamingDraft?.(input.assistantMessageId, {
        timeline: applyAssistantReasoningProgress(
          buildAssistantStreamingTimeline(boundaryDraft.content, input.baseTimeline, {
            fallbackThinkingContent: boundaryDraft.thinkingContent,
            preferredAssistantParts: boundaryDraft.assistantParts,
          }),
          {
            active: false,
            referenceTime: Date.now(),
          },
        ),
      });
    },
    finalize(finalContent: string, toolCalls: RuntimeToolStep[]): string {
      // finalize 会关闭草稿态，并把最终文本 + 工具生命周期合并回正式 assistant timeline。
      const finalDraft = streamingAssembler.buildFinal(finalContent);
      adapter.onProviderEvent(
        { kind: 'done', finalText: finalContent },
        (canonicalEvent) => input.bridge.appendCanonicalEvent(input.assistantMessageId, canonicalEvent),
      );
      input.clearStreamingDraft?.(input.assistantMessageId);
      input.bridge.updateAssistantTimeline(input.assistantMessageId, (timeline) =>
        applyAssistantReasoningProgress(
          buildAssistantTimelineUpdate(
            finalDraft.content,
            syncAssistantTimelineWithToolCalls(timeline, toolCalls),
            {
              fallbackThinkingContent: getAssistantTimelineReasoning(timeline),
              preferredAssistantParts: finalDraft.assistantParts,
            },
          ),
          {
            active: false,
            referenceTime: Date.now(),
          },
        ),
      );
      return finalDraft.content;
    },
    clear(): void {
      // 失败、中断或提前退出时清空 streaming draft，避免旧草稿残留在 UI。
      input.clearStreamingDraft?.(input.assistantMessageId);
    },
  };
};
