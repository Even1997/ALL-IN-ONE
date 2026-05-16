// 文件作用：模块实现文件，位于应用支持层。
// 所在链路：负责承接当前模块在整体链路中的实现职责。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。

import type { CanonicalEvent } from '@goodnight/runtime-protocol';
import type { AssistantTimelineEvent } from '../../store/assistantTimeline.ts';

const getMessageKey = (event: CanonicalEvent) => event.messageId || event.runId;

const sortCanonicalEvents = (events: CanonicalEvent[]) =>
  [...events].sort((left, right) => left.ts - right.ts || left.seq - right.seq);

export const projectCanonicalEventsToAssistantTimeline = (
  events: CanonicalEvent[],
): AssistantTimelineEvent[] => {
  const timeline: AssistantTimelineEvent[] = [];
  const reasoningByMessage = new Map<string, Extract<AssistantTimelineEvent, { kind: 'reasoning' }>>();
  const textByMessage = new Map<string, Extract<AssistantTimelineEvent, { kind: 'text' }>>();
  const toolNameById = new Map<string, string>();

  for (const event of sortCanonicalEvents(events)) {
    if (event.type === 'reasoning.started') {
      const key = getMessageKey(event);
      if (!reasoningByMessage.has(key)) {
        const reasoning: Extract<AssistantTimelineEvent, { kind: 'reasoning' }> = {
          id: `reasoning_${key}`,
          kind: 'reasoning',
          content: event.payload.summary || '',
          collapsed: true,
          status: 'streaming',
          createdAt: event.ts,
        };
        reasoningByMessage.set(key, reasoning);
        timeline.push(reasoning);
      }
      continue;
    }

    if (event.type === 'reasoning.delta') {
      const key = getMessageKey(event);
      let reasoning = reasoningByMessage.get(key);
      if (!reasoning) {
        reasoning = {
          id: `reasoning_${key}`,
          kind: 'reasoning',
          content: '',
          collapsed: true,
          status: 'streaming',
          createdAt: event.ts,
        };
        reasoningByMessage.set(key, reasoning);
        timeline.push(reasoning);
      }
      reasoning.content += event.payload.textChunk;
      continue;
    }

    if (event.type === 'reasoning.completed') {
      const key = getMessageKey(event);
      let reasoning = reasoningByMessage.get(key);
      if (!reasoning) {
        reasoning = {
          id: `reasoning_${key}`,
          kind: 'reasoning',
          content: event.payload.finalText || event.payload.summary || '',
          collapsed: true,
          status: 'completed',
          createdAt: event.ts,
        };
        reasoningByMessage.set(key, reasoning);
        timeline.push(reasoning);
      }
      if (event.payload.finalText && !reasoning.content.trim()) {
        reasoning.content = event.payload.finalText;
      }
      reasoning.status = 'completed';
      continue;
    }

    if (event.type === 'message.delta') {
      if (event.payload.phase === 'commentary') {
        continue;
      }

      const key = getMessageKey(event);
      let text = textByMessage.get(key);
      if (!text) {
        text = {
          id: `text_${key}`,
          kind: 'text',
          content: '',
          createdAt: event.ts,
        };
        textByMessage.set(key, text);
        timeline.push(text);
      }
      text.content += event.payload.textChunk;
      continue;
    }

    if (event.type === 'message.completed') {
      if (event.payload.phase === 'commentary') {
        continue;
      }

      const key = getMessageKey(event);
      let text = textByMessage.get(key);
      if (!text) {
        text = {
          id: `text_${key}`,
          kind: 'text',
          content: '',
          createdAt: event.ts,
        };
        textByMessage.set(key, text);
        timeline.push(text);
      }
      text.content = event.payload.finalText;
      continue;
    }

    if (event.type === 'tool.started') {
      toolNameById.set(event.payload.toolCallId, event.payload.toolName);
      timeline.push({
        id: `tool_use_${event.payload.toolCallId}`,
        kind: 'tool_use',
        toolCallId: event.payload.toolCallId,
        parentToolCallId: event.payload.parentToolCallId ?? null,
        toolName: event.payload.toolName,
        input: event.payload.input || {},
        status: 'running',
        createdAt: event.ts,
      });
      continue;
    }

    if (event.type === 'tool.completed') {
      timeline.push({
        id: `tool_result_${event.payload.toolCallId}`,
        kind: 'tool_result',
        toolCallId: event.payload.toolCallId,
        toolName: toolNameById.get(event.payload.toolCallId) || event.source.name || 'tool',
        status: event.payload.ok ? 'completed' : 'failed',
        output: event.payload.outputText || event.payload.summary || '',
        fileChanges: event.payload.fileChanges,
        createdAt: event.ts,
      });
    }
  }

  return timeline
    .filter((event) => event.kind !== 'text' || event.content.trim())
    .filter((event) => event.kind !== 'reasoning' || event.content.trim())
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
};
