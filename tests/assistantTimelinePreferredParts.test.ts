import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssistantTimelineUpdate, getAssistantTimelineText } from '../src/modules/ai/store/assistantTimeline.ts';
import type { AIChatMessagePart } from '../src/components/workspace/aiChatMessageParts.ts';

test('final timeline prefers corrected content over stale preferred assistant parts', () => {
  const correctedFinalContent =
    '我还没有拿到成功的项目文件变更结果，因此不能确认已保存、已修改或已删除。请明确目标文件后我会通过文件变更流程执行。';
  const stalePreferredParts: AIChatMessagePart[] = [
    {
      type: 'text',
      content: '我已经把配置写入到 src/config.ts 了。',
      createdAt: 1,
    },
  ];

  const timeline = buildAssistantTimelineUpdate(correctedFinalContent, [], {
    preferredAssistantParts: stalePreferredParts,
  });

  assert.equal(getAssistantTimelineText(timeline), correctedFinalContent);
});
