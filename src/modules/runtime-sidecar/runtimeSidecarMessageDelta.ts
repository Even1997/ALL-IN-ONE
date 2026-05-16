// 文件作用：文本增量重建层，位于runtime sidecar 桥接层。
// 所在链路：负责把 sidecar 事件、快照与前端多个 store 接起来。
// 排查入口：先看这个文件对外导出的状态、投影、协调或执行入口，再顺着上下游模块继续追。
// 这个文件负责根据 canonical 流式事件重建 sidecar 消息正文，是“消息文本投影层”。
// 它主要服务于 snapshot 恢复与尾部增量拼接，确保前端拿到的是去重后的最终文本，而不是重复 delta。
// 如果你在排查“恢复后消息内容重复 / 少字 / 顺序错乱”，优先从这里检查 delta 回放逻辑。
import type { CanonicalEvent } from '@goodnight/runtime-protocol';

// snapshot 恢复时需要知道“哪些文本已经通过 canonical 流式事件投影过了”，
// 这样才能只补上真正缺失的尾部增量，避免重复渲染。
const belongsToMessage = (event: CanonicalEvent, messageId: string) =>
  event.messageId === messageId || event.runId === messageId;

const sortCanonicalEvents = (events: CanonicalEvent[]) =>
  [...events].sort((left, right) => {
    if (left.ts !== right.ts) {
      return left.ts - right.ts;
    }

    return left.seq - right.seq;
  });

export const resolveRuntimeSidecarProjectedMessageText = (
  canonicalEvents: CanonicalEvent[] = [],
  messageId: string,
) => {
  // 这里根据 canonical message.delta / message.completed 重放一遍文本，
  // 得到“前端理论上已经投影出来的消息正文”。
  let projectedText = '';

  for (const event of sortCanonicalEvents(canonicalEvents)) {
    if (!belongsToMessage(event, messageId)) {
      continue;
    }

    if (event.type === 'message.delta') {
      if (event.payload.phase === 'commentary') {
        continue;
      }

      projectedText += event.payload.textChunk;
      continue;
    }

    if (event.type === 'message.completed') {
      if (event.payload.phase === 'commentary') {
        continue;
      }

      projectedText = event.payload.finalText;
    }
  }

  return projectedText;
};

export const resolveRuntimeSidecarSnapshotMessageDelta = (
  canonicalEvents: CanonicalEvent[] = [],
  messageId: string,
  snapshotText: string,
) => {
  // 给 snapshot 文本和 canonical 已投影文本做差，只返回还没显示过的尾部部分。
  // 如果两边不满足“快照是已投影文本的追加”这个关系，就保守地返回空串，不猜测中间差异。
  if (!snapshotText) {
    return '';
  }

  const projectedText = resolveRuntimeSidecarProjectedMessageText(canonicalEvents, messageId);
  if (!projectedText) {
    return snapshotText;
  }

  if (snapshotText === projectedText) {
    return '';
  }

  return snapshotText.startsWith(projectedText) ? snapshotText.slice(projectedText.length) : '';
};
