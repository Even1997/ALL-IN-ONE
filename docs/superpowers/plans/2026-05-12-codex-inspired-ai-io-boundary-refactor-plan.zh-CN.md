# Codex-Inspired AI I/O Boundary Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 参照 OpenAI Codex 的协议式做法，彻底把 AI 聊天的“思考 / 工具 / 过程反馈 / 最终正文”边界从 skill/XML 提示约束迁回 runtime protocol + canonical events + projection，完全删除旧标签链路与历史兼容分支，消除过程与结果不一致、上一条消息被下一条污染、正文重复渲染、流式时间线失真等问题。

**Architecture:** 保持既有层级顺序：`provider protocol adapters -> canonical runtime events -> timeline composer / conversation projection -> assistant render model / UI composition`。核心改动不是继续修 UI 症状，而是把“输出边界”做成协议与投影的一等公民，skill 只保留行为约束与工具使用说明，不再承担最终正文语义。

**Tech Stack:** TypeScript, React, Zustand, `@goodnight/runtime-protocol`, 本地 runtime sidecar, AI chat timeline/render pipeline

---

## 1. 结论先行

这次必须按 Codex 官方思路收敛，不能再维持“两套真相并存”。

- Codex 官方的主真相源不是 skill，也不是正文里的 `<final>` / `<feedback>` 标签。
- Codex 官方把输入输出定义在协议层：结构化 `input`、结构化 `ThreadItem`、结构化 streaming delta、结构化 `phase`。
- Codex 官方的 `final_response` 是由 `agentMessage.phase == final_answer` 和完成态 item 推导出来的，不是从正文字符串二次切标签。
- 我们当前系统仍然同时保留了：
  - `skill -> prompt -> <final>/<feedback>/<think>` 这条旧链路
  - `canonical events -> timelineProjection -> UI` 这条新链路
- 这正是当前问题的根源：过程展示和最终结果不是同一个真相源。

### 1.1 Codex 参考锚点

后续执行时，以这些官方代码语义为准，不以我们现有 skill/XML 习惯为准。

- `codex-rs/app-server-protocol/src/protocol/v2/item.rs`
  - `AgentMessage { text, phase }`
  - `Reasoning { summary, content }`
- `sdk/python/tests/test_app_server_run.py`
  - `commentary` 不会被提升成 `final_response`
  - `final_answer` 才会成为最终正文
- `sdk/python/docs/getting-started.md`
  - `final_response` 来源于完成态 final-answer 或兼容 fallback

纯净版目标就是把我们本地系统收敛到这类结构，而不是继续维护 `<final>/<feedback>/<think>`。

## 2. 当前系统诊断

### 2.1 已确认的现状

- `src/modules/ai/chat/directChatPrompt.ts`
  - 仍然明确要求模型输出 `<final>...</final>` 与 `<feedback>...</feedback>`。
- `.agents/skills/ai-chat-output-boundary/SKILL.md`
  - 仍然把 `<final>` / `<feedback>` 当作主输出契约。
- `src/modules/ai/runtime/output/parseStructuredAssistantOutput.ts`
  - 仍然承担 live runtime 的正文边界解析。
- `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
  - 仍然把流式草稿和最终正文建立在 `parseStructuredAssistantOutput()` 上。
- `src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts`
  - 仍然先走旧的 `createRuntimeStreamingMessageAssembler()`，再把结果投到 timeline。
- `packages/runtime-protocol/src/canonicalEvents.ts`
  - 只有 `message.started / delta / completed` 文本事件，没有 `message phase`，也没有协议级 reasoning 事件。
- `src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts`
  - `thinking` 仍被映射成 `progress.updated`，不是独立 reasoning item。

### 2.2 这会导致的具体问题

- 过程与结果可能不一致
  - 过程区吃的是“流式拼接草稿 + timeline 补丁”，最终区吃的是“最终正文 + UI 收口逻辑”。
- 上一条消息会被下一条影响
  - 因为 live draft、message timeline、projection 之间存在复用与补写，不是单向冻结。
- 正文排序在过程里容易跑偏
  - 因为正文不是 canonical timeline 的原生 item，而是后补的 answer render item。
- 工具、思考、正文边界不清
  - thinking 有时来自 `<think>`，有时来自 timeline reasoning event，有时来自 `progress.updated`。
- skill 被写重
  - 把协议职责放进 skill，系统越改越散，提示词和 UI 互相兜底。

### 2.3 已跑的本地验证

- `node --test tests/ai/structured-assistant-output.test.mjs`
  - 通过，说明旧的 `<final>/<feedback>` 解析链路仍然被正式维护。
- `node --test tests/ai/gn-agent-message-item.test.mjs`
  - 通过，说明 UI 已经在做“过程/结果分离”，但仍是建立在现有双链路之上。

结论：现在不是“没改”，而是“改了一半且双轨并存”。

## 3. 目标架构

### 3.1 目标边界定义

- `reasoning`
  - 模型思考内容，只能来自协议级 reasoning 事件或 reasoning item。
- `tool`
  - 工具调用与工具结果，只能来自 canonical tool events。
- `commentary`
  - 用户可见但非最终落盘正文的过程说明；如果 provider 不支持，允许没有这层。
- `final_answer`
  - 唯一 durable 的最终正文。

### 3.2 目标真相源

唯一真相源改为：

`provider events -> canonical events(with phase/reasoning) -> timeline projection -> message render model -> UI`

不再允许：

`skill/prompt XML -> 字符串 parser -> 再反推 runtime truth`

### 3.3 切断原则

- 不保留 `<think>` / `<final>` / `<feedback>` 的历史兼容解析。
- 不做“旧标签消息继续语义还原”的兜底。
- 新旧会话之间做版本切断；旧持久化聊天数据允许失效、清空或不再语义恢复。
- 新消息、新运行态、新流式展示一律走结构化协议。

## 4. 文件级删改清单

### 4.1 必改文件

- `packages/runtime-protocol/src/canonicalEvents.ts`
- `packages/runtime-protocol/src/canonicalEventValidators.ts`
- `src/modules/ai/runtime/provider/runtimeProviderEvents.ts`
- `src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts`
- `src/modules/runtime-sidecar/runtimeSidecarCanonical.ts`
- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- `src/modules/ai/runtime/composer/timelineComposer.ts`
- `src/modules/ai/runtime/composer/timelineComposerTypes.ts`
- `src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts`
- `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
- `src/modules/ai/store/aiChatStore.ts`
- `src/modules/ai/store/assistantTimeline.ts`
- `src/components/workspace/assistantStreamingDraftProjection.ts`
- `src/components/workspace/assistantRenderModel.ts`
- `src/components/workspace/assistantMessageOutputModel.ts`
- `src/components/workspace/timeline/chatMessageTimelineRenderModel.ts`
- `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- `src/components/workspace/AIChat.tsx`
- `src/modules/ai/chat/directChatPrompt.ts`
- `src/modules/ai/chat/conversationHistoryPrompt.ts`
- `.agents/skills/ai-chat-output-boundary/SKILL.md`
- `.agents/skills/workspace-tooling-protocol/SKILL.md`

### 4.2 建议新增文件

- `src/modules/ai/runtime/output/messagePhaseTypes.ts`
  - 统一定义 `commentary | final_answer | unknown`。
- `src/modules/ai/runtime/timeline/canonicalNarrativeProjection.ts`
  - 把 canonical events 投影成 assistant narrative timeline。
- `tests/ai/runtime-message-phase-protocol.test.mjs`
- `tests/ai/runtime-reasoning-protocol.test.mjs`
- `tests/ai/canonical-narrative-projection.test.mjs`
- `tests/ai/ai-chat-store-cutover.test.mjs`

### 4.3 必删或降级的旧路径

- 从 live runtime 主链路删除：
  - `src/modules/ai/runtime/output/parseStructuredAssistantOutput.ts`
  - `src/modules/ai/runtime/output/assistantOutputTypes.ts`
  - `tests/ai/structured-assistant-output.test.mjs`
- 从主 prompt 删除：
  - `directChatPrompt.ts` 中的 `STRUCTURED_OUTPUT_POLICY`
- 从 skill 删除：
  - `<final>` / `<feedback>` 作为主契约的规则
- 从 live streaming 删除：
  - `agentTurnRunner.ts` 中基于 `<think>/<final>/<feedback>` 的草稿拼接主逻辑
- 从历史/回放层删除：
  - `src/components/workspace/aiChatMessageParts.ts` 中与 `<think>/<final>/<feedback>/<tool_use>/<tool_result>` 强绑定的解析分支
  - `conversationHistoryPrompt.ts` 中对旧标签的特殊清洗假设
  - `tests/ai/ai-chat-message-parts.test.mjs` 里依赖旧标签协议的断言

### 4.4 版本切断与数据处理

- `src/modules/ai/store/aiChatStore.ts`
  - 持久化版本必须升级。
  - `migrate()` 不再尝试恢复旧标签语义。
  - 对旧版本聊天数据，直接执行“丢弃旧 assistant timeline / 清空旧消息 / 重建为空会话”三选一中的一种明确策略。

推荐策略：

- 升级 store version
- 对旧 assistant 历史直接丢弃并新建空白会话

原因：

- 这最符合“纯净版”
- 不会把旧标签脏数据继续带进新协议系统

## 5. 执行任务

### Task 1: 把 message phase 和 reasoning 提升为协议一等公民

**Files:**
- Modify: `packages/runtime-protocol/src/canonicalEvents.ts`
- Modify: `packages/runtime-protocol/src/canonicalEventValidators.ts`
- Create: `src/modules/ai/runtime/output/messagePhaseTypes.ts`
- Test: `tests/ai/runtime-message-phase-protocol.test.mjs`
- Test: `tests/ai/runtime-reasoning-protocol.test.mjs`

- [ ] 给 `message.started / message.delta / message.completed` payload 增加 `phase`
  - phase 至少支持：`commentary`、`final_answer`、`unknown`
  - `message.completed.finalText` 保留，但其语义必须受 `phase` 约束

- [ ] 新增 reasoning canonical event
  - 最小集合建议为：`reasoning.started`、`reasoning.delta`、`reasoning.completed`
  - 如果不想扩过多类型，也至少要有可稳定增量聚合的 `reasoning.delta`

- [ ] 更新协议校验器
  - 所有新增 payload 都必须纳入 `canonicalEventValidators.ts`

- [ ] 新增协议测试
  - 覆盖 `phase` 合法值
  - 覆盖 reasoning 事件校验
  - 覆盖没有 phase 时的兼容值 `unknown`

**完成标准**

- runtime protocol 可以原生表达 “思考 / 过程正文 / 最终正文”
- 后续层不需要再从正文字符串猜 phase

### Task 2: 让 provider adapter 和 sidecar 发出结构化 narrative 事件

**Files:**
- Modify: `src/modules/ai/runtime/provider/runtimeProviderEvents.ts`
- Modify: `src/modules/ai/runtime/adapters/builtinRuntimeAdapter.ts`
- Modify: `src/modules/runtime-sidecar/runtimeSidecarCanonical.ts`
- Modify: `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- Test: `tests/ai/runtime-provider-events.test.mjs`
- Test: `tests/ai/runtime-sidecar-turn-submit.test.mjs`

- [ ] 扩展 provider-native event 定义
  - 允许 provider event 区分 `thinking`、`commentary_text`、`final_text`
  - 对不支持 phase 的 provider，明确落到 `unknown`

- [ ] 重写 `builtinRuntimeAdapter`
  - `thinking` 不再映射成 `progress.updated`
  - 直接映射成 reasoning canonical events
  - `text` 必须带 phase；无法判断时先标 `unknown`
  - `done.finalText` 只负责完成最终正文，不再负责“顺便修正文边界”

- [ ] 改 sidecar canonical 映射
  - sidecar 收到的 narrative 增量必须进入 canonical message/reasoning 事件
  - 不再把 narrative 退化成纯字符串流

**完成标准**

- canonical events 足以独立恢复 narrative timeline
- `progress.updated` 仅用于系统进度，不再冒充 thinking

### Task 3: 删掉 skill / prompt 驱动的 XML 主协议

**Files:**
- Modify: `src/modules/ai/chat/directChatPrompt.ts`
- Modify: `.agents/skills/ai-chat-output-boundary/SKILL.md`
- Modify: `.agents/skills/workspace-tooling-protocol/SKILL.md`
- Modify: `src/modules/ai/chat/conversationHistoryPrompt.ts`
- Test: `tests/ai/direct-chat-prompt.test.mjs`
- Test: `tests/ai/project-file-planning-prompt.test.mjs`

- [ ] 删除 `STRUCTURED_OUTPUT_POLICY`
  - 移除 `<final>`、`<feedback>` 的强制输出要求

- [ ] 新 prompt 政策改成 Codex 风格
  - 思考留在 reasoning channel
  - 工具调用走 tool protocol
  - 用户可见过程说明可选且简短
  - 最终答案给自然正文，不要 XML 包裹

- [ ] 重写 `ai-chat-output-boundary` skill
  - 只保留边界定义与禁止项
  - 不再要求任何 XML 标签格式

- [ ] 重写 `workspace-tooling-protocol` skill
  - 只说明 skill / hook / MCP / agent / built-in tool 的职责
  - 删除“把真实答案放进 `<final>`”这类协议越界规则

**完成标准**

- skill 只做能力约束，不做输出协议
- prompt 只负责行为方向，不负责正文语义切分

### Task 4: 用 canonical narrative projection 取代 live XML 草稿拼装

**Files:**
- Modify: `src/modules/ai/runtime/orchestration/runtimeChatTurnStreaming.ts`
- Modify: `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`
- Modify: `src/modules/ai/store/assistantTimeline.ts`
- Create: `src/modules/ai/runtime/timeline/canonicalNarrativeProjection.ts`
- Test: `tests/ai/canonical-narrative-projection.test.mjs`
- Test: `tests/ai/runtime-streaming-assembler.test.mjs`
- Test: `tests/ai/runtime-streaming-message-assembler.test.mjs`

- [ ] 废弃 live runtime 对 `parseStructuredAssistantOutput()` 的依赖
  - `agentTurnRunner.ts` 不再以 `<think>/<final>/<feedback>` 生成草稿

- [ ] 新增 canonical -> assistant timeline projection
  - reasoning canonical events -> `AssistantTimelineReasoningEvent`
  - message events with `phase=commentary` -> narrative commentary item
  - message events with `phase=final_answer` -> answer item
  - tool/approval/question 继续走现有 runtime event lane

- [ ] `runtimeChatTurnStreaming.ts` 改为纯 canonical 驱动
  - 收 chunk -> append canonical event
  - draft UI 只从 projection 读取，不再从 assembler 反组装字符串

- [ ] `assistantTimeline.ts` 收缩责任
  - live path 不再把原始 content 字符串重新 parse 成 timeline
  - 删除旧标签 narrative 重建入口

**完成标准**

- 流式过程和最终结果来自同一条 canonical 叙事链
- 不再需要“先拼 `<think>` 再拆 `<think>`”

### Task 5: 统一 UI 到单一 timeline source

**Files:**
- Modify: `src/components/workspace/assistantStreamingDraftProjection.ts`
- Modify: `src/components/workspace/assistantRenderModel.ts`
- Modify: `src/components/workspace/assistantMessageOutputModel.ts`
- Modify: `src/components/workspace/timeline/chatMessageTimelineRenderModel.ts`
- Modify: `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Test: `tests/ai/assistant-streaming-draft-projection.test.mjs`
- Test: `tests/ai/assistant-render-model.test.mjs`
- Test: `tests/ai/gn-agent-message-item.test.mjs`
- Test: `tests/ai/ai-chat-direct-streaming-display-source.test.mjs`

- [ ] `assistantStreamingDraftProjection.ts`
  - draft 只消费 projection，不再混合老 timeline 内容做正文恢复

- [ ] `assistantRenderModel.ts`
  - 直接消费“已投影的 narrative timeline”
  - thinking / commentary / final_answer 各自有明确 render item

- [ ] `assistantMessageOutputModel.ts`
  - process timeline 与 final answer 继续共用同一 ordered source
  - 但过程区只能展示 `reasoning + commentary + tool cards`
  - 完成后 final answer 单独显示一次

- [ ] `GNAgentMessageItem.tsx`
  - 运行中：按统一时间线流下展示
  - 完成后：过程折叠，左侧仅显示 `已处理 X 秒`
  - 不再显示 process/status 冗余标记

- [ ] `AIChat.tsx`
  - 冻结上一条消息的 completed projection
  - 下一个 turn 开始时不得回写已完成消息

**完成标准**

- 过程区和结果区只是一份 projection 的两种展示态
- final answer 永远只渲染一次
- 下一轮不会改写上一轮

### Task 6: 彻底删除旧标签协议与历史兼容

**Files:**
- Modify: `src/modules/ai/store/aiChatStore.ts`
- Modify: `src/components/workspace/aiChatMessageParts.ts`
- Modify: `src/modules/ai/chat/conversationHistoryPrompt.ts`
- Modify: `tests/ai/ai-chat-store.test.mjs`
- Create: `tests/ai/ai-chat-store-cutover.test.mjs`
- Delete: `tests/ai/structured-assistant-output.test.mjs`

- [ ] 从 `aiChatMessageParts.ts` 删除旧标签协议分支
  - 删除 `<think>`
  - 删除 `<final>`
  - 删除 `<feedback>`
  - 删除 `<tool_use>`
  - 删除 `<tool_result>`
  - 删除 legacy bash / DSML 协议残留解析

- [ ] 删除 live runtime 对 `<final>/<feedback>` parser 的 import

- [ ] 升级 `aiChatStore` 持久化版本
  - 旧版本数据不做语义迁移
  - 明确切断旧 assistant timeline 的恢复路径
  - 为旧数据建立“清空或丢弃”的单向 cutover

**完成标准**

- 新系统完全不再依赖旧 markup
- 旧标签历史不再被解析为结构化 thinking/tool/final
- 本地持久化数据完成版本切断

### Task 7: 回归测试与验收

**Files:**
- Modify: `tests/ai/runtime-timeline-composer.test.mjs`
- Modify: `tests/ai/ai-chat-timeline-view.test.mjs`
- Modify: `tests/ai/ai-chat-view-state.test.mjs`
- Modify: `tests/ai/runtime-provider-events.test.mjs`
- Modify: `tests/ai/runtime-streaming-assembler.test.mjs`
- Modify: `tests/ai/assistant-timeline-events.test.mjs`

- [ ] 覆盖以下关键场景
  - reasoning streaming -> tool start -> tool result -> final answer
  - 无工具直答
  - commentary only 不得被提升为 final answer
  - `unknown` phase 的兼容策略
  - 同一时间戳下顺序稳定
  - 完成后 process 折叠，final 只显示一次
  - 新问题开始时旧消息完全冻结
  - 旧持久化聊天数据不会再触发 `<think>/<final>/<feedback>` 恢复逻辑

- [ ] 执行验证
  - `node --test tests/ai/runtime-message-phase-protocol.test.mjs`
  - `node --test tests/ai/runtime-reasoning-protocol.test.mjs`
  - `node --test tests/ai/canonical-narrative-projection.test.mjs`
  - `node --test tests/ai/ai-chat-store-cutover.test.mjs`
  - `node --test tests/ai/assistant-streaming-draft-projection.test.mjs`
  - `node --test tests/ai/assistant-render-model.test.mjs`
  - `node --test tests/ai/gn-agent-message-item.test.mjs`
  - `node --test tests/ai/ai-chat-direct-streaming-display-source.test.mjs`
  - `node --test tests/ai/runtime-timeline-composer.test.mjs tests/ai/ai-chat-timeline-view.test.mjs tests/ai/ai-chat-view-state.test.mjs`
  - `npm run build`
  - `graphify update .`

**验收标准**

- 运行中时间线和完成后时间线顺序一致
- 运行中正文刷新速度接近真实到达速度
- 已完成消息不会被后续 turn 改写
- thinking、tool、final_answer 三者边界清晰
- 无工具时直接正常回答，不出现额外过程 UI
- 旧 XML 标签消息不会再被系统当成结构化协议恢复

## 6. 绝对不要再做的事

- 不要继续在 skill 里定义 `<final>` / `<feedback>` 主协议
- 不要再把 `thinking` 映射成 `progress.updated`
- 不要继续维护“正文字符串 parser + canonical projection”双链路真相
- 不要为了 UI 好看，把 phase 语义偷偷塞回 prompt 或 skill
- 不要让已完成消息继续依赖 live draft buffer
- 不要再为旧标签历史做语义兼容补丁

## 7. 实施顺序建议

严格按下面顺序做，不能跳：

1. 先改 protocol 和 canonical event 类型
2. 再改 provider adapter / sidecar 映射
3. 再删 prompt/skill 的 XML 约束
4. 再切掉 live runtime assembler/parser
5. 再做 store version cutover
6. 最后统一 UI render source
7. 最后做删除旧链路后的回归

原因：

- 如果先改 UI，不改协议，只会继续补症状
- 如果先删 skill，不改 runtime，现网会短时间失去边界
- 如果不先冻结 canonical truth，上一条消息被污染的问题还会反复出现
- 如果不做 store version cutover，旧标签脏数据还会继续回流

## 8. 预期结果

做完后，系统应表现为：

- 思考、工具、正文、最终答案都来自结构化 runtime truth
- 过程区和结果区是同一 source 的不同展示态
- final answer 就是最终正文，不再重复渲染
- skill 变轻，协议变重，系统复杂度显著下降
- 旧标签协议被彻底删除，不再拖累主链路
- 这套结构会更接近 Codex 官方，而不是“提示词硬约束 + UI 猜测补洞”

## 9. 自检

- 覆盖性检查
  - 用户关心的 4 个核心问题都已覆盖：过程速度、前后不一致、半段正文残留、边界不清。
- 占位符检查
  - 本计划没有使用 `TODO`、`以后再说`、`适当处理` 这类空话。
- 架构检查
  - 所有关键决策都遵守了本仓库 `AGENTS.md` 里的层级约束，没有把显示策略下沉到 provider truth。

Plan complete and saved to `docs/superpowers/plans/2026-05-12-codex-inspired-ai-io-boundary-refactor-plan.zh-CN.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
