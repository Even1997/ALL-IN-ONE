# Streaming Answer Chronology Boundary Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 AI 聊天在流式输出期间把正文自动拼成一个持续增长的块、并因此脱离真实时间顺序展示的问题，同时保持最终完成态正文正确。

**Architecture:** 这不是单一 UI 样式问题，而是一次跨层边界修复。要先恢复 `feedback/commentary` 与 `final answer` 的契约，再让 timeline projection 只把真正的 `final_answer` 当成 streaming answer lane，最后由 render model 按时序展示过程项与最终正文。

**Tech Stack:** React, TypeScript, Zustand, runtime sidecar, canonical runtime events, timeline composer, assistant render model, Node test runner

---

## Root Cause Summary

当前问题来自同一条错误假设在多层被连续放大：

1. `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
   - `createRuntimeStreamingMessageAssembler()` 会把工具调用前出现的可见文本保留为 `text` part。
   - `markToolBoundary()` 不会把这段文本标成 commentary / feedback，只是强制下一段文本新开 part。

2. `apps/runtime/src/index.ts`
   - `persistAssistantMessage()` 每次草稿同步都用 `getAssistantTimelineText(assistantTimeline)` 回写 `message.content`。
   - 这让运行中的 `message.content` 暴露出“当前所有 text part 的拼接结果”。

3. `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
   - live `message.delta` 快照被无条件转换成 canonical `message.delta`，并且固定 `phase: 'final_answer'`。
   - 于是本该属于过程反馈的文本，也被当成正文增量送进 projection。

4. `src/modules/ai/runtime/composer/timelineComposer.ts`
   - `projection.activeMessage.text += event.payload.textChunk`
   - active response 在工具边界之间不会重置，只会持续追加。

5. `src/components/workspace/assistantStreamingDraftProjection.ts`
   - streaming draft 始终把当前 `projection.activeMessage.text` 当成同一个正在增长的 text event。
   - 这个 event 的时间锚点保留为第一次可见字符时间，所以后续更晚出现的正文仍显示在更早的位置。

这就是“结束是对的，但过程里正文会自动拼接、并且看起来不按时间顺序”的最终原因。

---

### Task 1: 先把回归用例写对，锁定真实目标行为

**Files:**
- Modify: `tests/ai/runtime-streaming-assembler.test.mjs`
- Modify: `tests/ai/runtime-tool-loop.test.mjs`
- Modify: `tests/ai/runtime-sidecar-session-bridge.test.mjs`
- Modify: `tests/ai/runtime-timeline-composer.test.mjs`
- Modify: `tests/ai/assistant-streaming-draft-projection.test.mjs`
- Add: `tests/ai/streaming-answer-chronology.test.mjs`

- [ ] **Step 1: 新增端到端症状测试，描述“工具前文本不应该粘进 streaming 正文”**

测试目标：
- 先出现一段可见过程文本
- 然后发生 tool 边界
- 然后继续出现真正的最终回答文本
- streaming UI 应展示为：
  - 过程项在前
  - 工具项在中
  - 正文项只包含工具后的最终回答

- [ ] **Step 2: 改写当前错误固化的断言**

重点改这些现有假设：
- `runtime-streaming-assembler.test.mjs`
  - 当前把“工具前可见文本继续保留为 answerContent”当成正确行为，要改成“保留为过程段，不并入最终正文段”。
- `runtime-tool-loop.test.mjs`
  - 当前把多轮工具前可见文本 `join('\n\n')` 当 `finalContent`，要改成只返回最终完成态正文。

- [ ] **Step 3: 增加 projection 回归测试**

断言点：
- `timelineComposer` 在工具边界前后的正文不能继续共用同一个 active response accumulation。
- `assistantStreamingDraftProjection` 输出的最后一个 text block 只能是当前 final-answer 段，不能包含更早过程文本。

- [ ] **Step 4: 跑定向测试确认先红**

Run:
```bash
node --test tests/ai/runtime-streaming-assembler.test.mjs tests/ai/runtime-tool-loop.test.mjs tests/ai/runtime-sidecar-session-bridge.test.mjs tests/ai/runtime-timeline-composer.test.mjs tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/streaming-answer-chronology.test.mjs
```

Expected:
- 至少有与当前错误行为直接相关的失败用例

---

### Task 2: 修正运行时边界，让过程文本不再进入 durable final body

**Files:**
- Modify: `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
- Modify: `src/modules/ai/runtime/tools/runtimeToolLoop.ts`
- Modify: `src/modules/ai/runtime/dispatch/agentEvents.ts`
- Modify: `src/modules/ai/runtime/provider/runtimeProviderEvents.ts`

- [ ] **Step 1: 给运行时 streaming narrative 明确区分 process / final**

实现方向：
- 不再把工具前可见文本默认视为最终正文的一部分。
- `createRuntimeStreamingMessageAssembler()` 内部要能保留“早期 text part 是过程段，当前尾部 text part 才是 final-answer 候选段”的语义。

- [ ] **Step 2: 修正 tool loop 的最终文本归约规则**

当前错误点：
- `visibleTextPerRound` 会把多轮工具前文本全部累加进 `finalContent`。

目标行为：
- 工具前轮次产生的可见文本，只作为过程反馈事件消费。
- `finalContent` 只来自真正完成轮次的最终正文。

- [ ] **Step 3: 修正 agent event state 的可见文本聚合**

当前错误点：
- `reduceAgentEvent()` 里 `text_delta` 与 `final_text` 都被追加进同一个 `visibleText`。

目标行为：
- `final_text` 才进入 durable final body。
- streaming 过程反馈走独立路径，不再污染 `visibleText`。

- [ ] **Step 4: 保留兼容性约束**

兼容要求：
- 纯文本、无工具调用的单轮回答，仍然应该边流式边展示正文。
- 有工具调用的回答，工具前文字进入过程 lane；最终正文在合适时机单独展示。

---

### Task 3: 修正 sidecar live bridge，停止把运行中快照强制标记成 `final_answer`

**Files:**
- Modify: `apps/runtime/src/index.ts`
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Modify: `src/modules/runtime-sidecar/runtimeSidecarMessageDelta.ts`
- Modify: `src/modules/runtime-sidecar/runtimeSidecarCanonical.ts`

- [ ] **Step 1: 明确 sidecar live 期间的数据源职责**

职责调整：
- `turn.delta` 负责 live text streaming。
- `message.delta` 快照不再粗暴表示“当前完整 final answer”。
- `turn.finished` / `message.completed` 才负责最终正文落盘与 handoff。

- [ ] **Step 2: 去掉运行中 snapshot -> `phase: final_answer` 的硬编码**

当前错误位置：
- `runtimeSidecarSessionBridge.ts` 中 `type: 'message.delta'` 的 canonical 化逻辑固定写死 `phase: 'final_answer'`。

目标行为：
- 运行中快照若只是在同步持久态，不应继续驱动 live final answer accumulation。
- 如果确实需要保留 live narrative canonical event，也要带正确 phase，而不是一律 final。

- [ ] **Step 3: 校正 suffix-delta 推导策略**

当前错误点：
- `resolveRuntimeSidecarSnapshotMessageDelta()` 假设 snapshotText 是“final_answer 的前缀扩展”。

目标行为：
- 当快照代表 durable message state 时，只在语义一致时补 suffix。
- 当语义不一致或属于过程段时，不允许把它继续塞进 active final answer。

---

### Task 4: 修正 projection / render，让 streaming 正文按真实时序落位

**Files:**
- Modify: `src/modules/ai/runtime/composer/timelineComposer.ts`
- Modify: `src/components/workspace/assistantStreamingDraftProjection.ts`
- Modify: `src/components/workspace/assistantRenderModel.ts`
- Modify: `src/components/workspace/assistantMessageOutputModel.ts`

- [ ] **Step 1: 修正 active response accumulation 边界**

目标行为：
- `timelineComposer` 不应跨工具边界、跨 phase 错误地继续复用同一个 `activeMessage.text`。
- 只有当前 final-answer 段的 delta 才能进入当前 active response。

- [ ] **Step 2: streaming draft 只替换尾部 active final block**

目标行为：
- 早期过程 text block 留在 process lane。
- 当前 live final block 仅替换最后一个真正的 final candidate block。

- [ ] **Step 3: 保持当前 UI 宽度与卡片布局不回退**

注意：
- 本任务不改现有宽度框架与 timeline card 的窄屏折叠策略。
- 只修正文案内容归属与时序排序。

---

### Task 5: 全链路验证

**Files:**
- Verify only

- [ ] **Step 1: 跑 AI 聊天相关测试集**

Run:
```bash
node --test tests/ai/runtime-streaming-assembler.test.mjs tests/ai/runtime-tool-loop.test.mjs tests/ai/runtime-sidecar-session-bridge.test.mjs tests/ai/runtime-timeline-composer.test.mjs tests/ai/assistant-streaming-draft-projection.test.mjs tests/ai/assistant-render-model.test.mjs tests/ai/ai-chat-direct-streaming-display-source.test.mjs tests/ai/streaming-answer-chronology.test.mjs
```

Expected:
- 全部通过

- [ ] **Step 2: 构建项目**

Run:
```bash
npm run build
```

Expected:
- build 成功

- [ ] **Step 3: 启动本地页面做人工复现**

人工验证点：
- 触发“先说明要查文件 -> 调工具 -> 再输出总结”的对话
- 流式过程中：
  - 过程文本出现在 process lane
  - 工具卡按时间顺序插入
  - 正文块只显示当前最终回答段
  - 不再出现“正文越流越长但位置还停在最前面”的现象

- [ ] **Step 4: 更新知识图**

Run:
```bash
graphify update .
```

Expected:
- 图更新成功；若因现有 graphify 数据问题失败，记录失败信息但不回退代码

---

## Implementation Notes

- 这次修复的主责层是：
  1. runtime narrative boundary
  2. sidecar canonical projection
  3. streaming draft projection

- 不建议继续在 CSS / bubble 布局层打补丁，因为现在的问题不是“正文太宽”，而是“正文被错误归类成一个持续增长的 final-answer block”。

- 修完后要重点回归这三类场景：
  1. 无工具的纯文本 streaming
  2. 有工具、且工具前有可见过程文本
  3. 工具后正文被重写、改写早先措辞的场景
