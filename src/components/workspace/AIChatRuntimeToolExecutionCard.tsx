import React from 'react';
import type { StoredChatRuntimeEvent } from '../../modules/ai/store/aiChatStore';
import type { AssistantTimelineEvent } from '../../modules/ai/store/assistantTimeline.ts';
import { RuntimeStandaloneResultBlock, RuntimeToolGroup } from './AIChatRuntimeToolBlocks';
import type { RuntimeToolHelpers } from './AIChatRuntimeToolTypes';
import { buildRuntimeTimelineModelFromAssistantTimeline, buildRuntimeToolStreamModel } from './runtimeEventRenderModel';

export type RuntimeExecutionTimelineCard = {
  key: string;
  node: React.ReactNode;
  createdAt?: number;
  timelineOrder?: number;
};

type RuntimeExecutionRenderInput = {
  runtimeEvents: StoredChatRuntimeEvent[];
  timelineEvents?: AssistantTimelineEvent[];
  renderApprovalEvent: (event: Extract<StoredChatRuntimeEvent, { kind: 'approval' }>) => React.ReactNode;
  renderQuestionEvent: (event: Extract<StoredChatRuntimeEvent, { kind: 'question' }>) => React.ReactNode;
  renderRuntimeFileChanges: (
    fileChanges: NonNullable<Extract<StoredChatRuntimeEvent, { kind: 'tool_result' }>['fileChanges']>
  ) => React.ReactNode;
  helpers: RuntimeToolHelpers;
};

export const buildRuntimeExecutionTimelineCards = ({
  runtimeEvents,
  timelineEvents,
  renderApprovalEvent,
  renderQuestionEvent,
  renderRuntimeFileChanges,
  helpers,
}: RuntimeExecutionRenderInput): RuntimeExecutionTimelineCard[] => {
  if (runtimeEvents.length === 0) {
    return [];
  }

  const timelineOrderByEventId = new Map(
    (timelineEvents || []).map((event, index) => [event.id, index] as const)
  );

  const renderModel = Array.isArray(timelineEvents)
    ? buildRuntimeTimelineModelFromAssistantTimeline(timelineEvents)
    : buildRuntimeToolStreamModel(runtimeEvents);

  return renderModel.items.map((item) => {
    if (item.kind === 'tool_group') {
      return {
        key: item.id,
        createdAt: item.toolUses[0]?.createdAt,
        timelineOrder: item.toolUses.reduce<number>(
          (earliest, toolUse) => Math.min(earliest, timelineOrderByEventId.get(toolUse.id) ?? Number.MAX_SAFE_INTEGER),
          Number.MAX_SAFE_INTEGER,
        ),
        node: (
          <RuntimeToolGroup
            key={item.id}
            toolUses={item.toolUses}
            renderModel={renderModel}
            groupId={item.id}
            groupType={item.groupType}
            groupLabel={item.groupLabel}
            renderApprovalEvent={renderApprovalEvent}
            renderQuestionEvent={renderQuestionEvent}
            renderRuntimeFileChanges={renderRuntimeFileChanges}
            helpers={helpers}
          />
        ),
      };
    }

    if (item.kind === 'standalone_result') {
      return {
        key: item.event.id,
        createdAt: item.event.createdAt,
        timelineOrder: timelineOrderByEventId.get(item.event.id),
        node: (
          <RuntimeStandaloneResultBlock
            key={item.event.id}
            event={item.event}
            renderRuntimeFileChanges={renderRuntimeFileChanges}
            helpers={helpers}
          />
        ),
      };
    }

    return {
      key: item.id,
      createdAt: item.event.createdAt,
      timelineOrder: timelineOrderByEventId.get(item.event.id),
      node: item.event.kind === 'approval' ? renderApprovalEvent(item.event) : renderQuestionEvent(item.event),
    };
  });
};

export const AIChatRuntimeToolExecutionCard: React.FC<RuntimeExecutionRenderInput> = (props) => {
  const cards = buildRuntimeExecutionTimelineCards(props);

  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="chat-tool-trace-stream compact" data-runtime-trace="compact">
      {cards.map((card) => (
        <React.Fragment key={card.key}>{card.node}</React.Fragment>
      ))}
    </div>
  );
};
