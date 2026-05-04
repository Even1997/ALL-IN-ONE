import React from 'react';
import type { RuntimeToolStep } from '../../modules/ai/runtime/agent-kernel/agentKernelTypes';
import type { StoredChatRuntimeEvent } from '../../modules/ai/store/aiChatStore';
import {
  RuntimeFallbackToolTree,
  RuntimeStandaloneResultBlock,
  RuntimeToolGroup,
} from './AIChatRuntimeToolBlocks';
import type { RuntimeToolHelpers } from './AIChatRuntimeToolTypes';
import { buildRuntimeToolStreamModel } from './runtimeEventRenderModel';

export const AIChatRuntimeToolExecutionCard: React.FC<{
  toolCalls: RuntimeToolStep[];
  runtimeEvents: StoredChatRuntimeEvent[];
  renderApprovalEvent: (event: Extract<StoredChatRuntimeEvent, { kind: 'approval' }>) => React.ReactNode;
  renderQuestionEvent: (event: Extract<StoredChatRuntimeEvent, { kind: 'question' }>) => React.ReactNode;
  renderRuntimeFileChanges: (
    fileChanges: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']>
  ) => React.ReactNode;
  helpers: RuntimeToolHelpers;
}> = ({ toolCalls, runtimeEvents, renderApprovalEvent, renderQuestionEvent, renderRuntimeFileChanges, helpers }) => {
  if (runtimeEvents.length > 0) {
    const renderModel = buildRuntimeToolStreamModel(runtimeEvents);

    return (
      <div className="chat-tool-trace-stream">
        {renderModel.items.map((item, index) => {
          if (item.kind === 'tool_group') {
            return (
              <RuntimeToolGroup
                key={item.id}
                toolUses={item.toolUses}
                renderModel={renderModel}
                index={index}
                groupId={item.id}
                groupLabel={item.groupLabel}
                renderApprovalEvent={renderApprovalEvent}
                renderQuestionEvent={renderQuestionEvent}
                renderRuntimeFileChanges={renderRuntimeFileChanges}
                helpers={helpers}
              />
            );
          }

          if (item.kind === 'standalone_result') {
            return (
              <RuntimeStandaloneResultBlock
                key={item.event.id}
                event={item.event}
                index={index}
                renderRuntimeFileChanges={renderRuntimeFileChanges}
                helpers={helpers}
              />
            );
          }

          return item.event.kind === 'approval' ? renderApprovalEvent(item.event) : renderQuestionEvent(item.event);
        })}
      </div>
    );
  }

  const completedCount = toolCalls.filter((toolCall) => toolCall.status === 'completed').length;
  const failedCount = toolCalls.filter((toolCall) => toolCall.status === 'failed').length;
  const blockedCount = toolCalls.filter((toolCall) => toolCall.status === 'blocked').length;
  const childToolCallsByParent = toolCalls.reduce<Map<string, RuntimeToolStep[]>>((accumulator, toolCall) => {
    if (!toolCall.parentToolCallId) {
      return accumulator;
    }

    const bucket = accumulator.get(toolCall.parentToolCallId) || [];
    bucket.push(toolCall);
    accumulator.set(toolCall.parentToolCallId, bucket);
    return accumulator;
  }, new Map<string, RuntimeToolStep[]>());
  const rootToolCalls = toolCalls.filter(
    (toolCall) => !toolCall.parentToolCallId || !toolCalls.some((candidate) => candidate.id === toolCall.parentToolCallId)
  );

  return (
    <div
      className="chat-tool-trace-stream"
      aria-label={`${helpers.getRuntimeCommandCountLabel(toolCalls.length)}: ${'\u5b8c\u6210'} ${completedCount}${failedCount > 0 ? `, \u5931\u8d25 ${failedCount}` : ''}${blockedCount > 0 ? `, \u5df2\u62e6\u622a ${blockedCount}` : ''}`}
    >
      {rootToolCalls.map((toolCall, index) => (
        <RuntimeFallbackToolTree
          key={toolCall.id}
          toolCall={toolCall}
          indexLabel={String(index + 1)}
          childToolCallsByParent={childToolCallsByParent}
          helpers={helpers}
        />
      ))}
    </div>
  );
};
