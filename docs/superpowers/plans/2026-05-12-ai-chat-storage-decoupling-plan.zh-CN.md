# 2026-05-12 AI Chat 存储解耦与流式性能收敛计划

## 目标

把 AI 聊天从“流式展示时高频改持久化 store”收敛为“三层分工”：

- 内存态：只负责当前运行中的正文、思考、工具状态，优先保证实时刷新
- 会话态：只负责已完成消息、关键边界事件、会话列表
- 恢复态：只负责刷新恢复、崩溃恢复、回放、checkpoint

最终目标：

- 过程输出更实时，不再因为本地持久化拖慢
- 过程和结果继续共用同一条时间线真相源
- 刷新后能恢复最终结果和关键过程节点
- 不再让下一轮流式影响上一轮已完成内容

---

## 当前检测结论

### 1. 现在是本地双存，不是单一真相源

- 前端聊天 store 在 `localStorage` 持久化
  - `src/modules/ai/store/aiChatStore.ts`
  - key: `goodnight-ai-chat-store`
- sidecar 也会把 session snapshot 写到本地 JSON
  - `apps/runtime/src/index.ts`
  - 文件：`sidecar-runtime-state.json`

这本身不是问题，问题在于：

- 流式消息更新会持续触发前端 store 更新
- 前端 store 又挂了 `persist(localStorage)`
- 于是“展示刷新”和“本地落盘”耦合在一起

### 2. sidecar 已经尽量避免每个 chunk 都落盘

`apps/runtime/src/index.ts` 中流式草稿已经使用：

- `await persistAssistantMessage(false, { persist: false })`

说明 sidecar 端的文本流式磁盘写入已经被压低了。

### 3. 前端仍然在高频改持久化会话

高风险位置：

- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
  - `applyRuntimeSidecarMessageNow()`
  - `applyRuntimeSidecarSnapshot()`
- `src/modules/ai/store/aiChatStore.ts`
  - `updateMessage()`
  - `appendMessage()`
  - `replaceSessionMessages()`
  - `persist(createJSONStorage(() => localStorage))`

现在的现象是：

- 流式中每次消息变化都可能触发 `set()`
- `persist` 会同步把整段 project chat state 写回 `localStorage`
- 主线程卡顿、渲染节奏发虚、历史会话也容易被重投影影响

---

## 目标架构

```text
provider / sidecar event
  -> canonical events / snapshot
  -> projection
  -> live memory draft
  -> UI render

完成态边界:
  live memory draft
    -> commit to chat session store
    -> optional sidecar snapshot persistence

恢复链路:
  sidecar snapshot / replay / checkpoint
    -> session restore
    -> projection rebuild
```

### 分层职责

#### A. 内存态

只保留运行中的高频数据：

- streaming text
- streaming reasoning
- tool running state
- pending approval / question 的即时状态

要求：

- 不接 `persist(localStorage)`
- 不做历史会话重排
- 不写完成态摘要

建议继续使用：

- `useAgentRuntimeStore.liveStateByThread`
- `streamingDraftBufferRef`
- `timelineProjectionByRunId / timelineProjectionByMessageId`

#### B. 会话态

只保留稳定结果：

- 用户消息
- assistant 最终正文
- 完成后的 assistant timeline
- 会话标题
- 关键结构卡片

要求：

- 只在“消息完成”“显式替换”“新建会话”“删会话”时写入
- 不承担流式逐字更新职责

#### C. 恢复态

只保留恢复与回放真相：

- sidecar snapshot
- replay events
- checkpoints
- background tasks

要求：

- 继续本地落盘
- 不直接参与高频前端逐字渲染

---

## 核心改造方向

### Task 1: 停止把流式正文高频写入 `aiChatStore`

目标：

- 运行中正文、思考、工具状态全部只走内存态
- `aiChatStore` 只接最终 commit

修改文件：

- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- `src/components/workspace/AIChat.tsx`
- `src/modules/ai/store/aiChatStore.ts`

具体动作：

- `message.delta` 到来时，不再优先 `updateMessage()`/`appendMessage()`
- 运行中 assistant 内容只更新：
  - `liveStateByThread`
  - `streamingDraftBufferRef`
  - projection 依赖的数据
- `turn.finished` 或 `session.snapshot` 到来时，再一次性提交最终 assistant message 到 `aiChatStore`

预期收益：

- 显著减少 `localStorage` 同步写频率
- 流式刷新更接近实际收到 chunk 的速度

---

### Task 2: 明确 `aiChatStore` 只存稳定会话，不存流式草稿

目标：

- 把 store 语义从“实时消息容器”收窄为“稳定会话容器”

修改文件：

- `src/modules/ai/store/aiChatStore.ts`
- `src/modules/ai/store/chatSessionEventLog.ts`

具体动作：

- 保留：
  - `upsertSession`
  - `appendMessage`
  - `replaceSessionMessages`
  - `renameSession`
  - `removeSession`
- 限制：
  - `updateMessage()` 不再用于高频流式正文
  - `message_updated` 只用于低频修正，不再承接逐字变化
- 检查 `eventLog` 是否还在因流式 update 被频繁重放

需要删除或弱化的使用方式：

- 所有“边流式边 `updateMessage`”的主路径

---

### Task 3: 固定单一渲染真相源

目标：

- 运行中和完成后都吃同一条 timeline source
- 区别只在显示态，不在数据态

修改文件：

- `src/components/workspace/AIChat.tsx`
- `src/components/workspace/AIChatConversationMessagesPane.tsx`
- `src/components/ai/gn-agent/GNAgentMessageItem.tsx`
- `src/components/workspace/assistantNativeMessageOutputModel.ts`

具体动作：

- 运行中：
  - process timeline 从 projection + live memory draft 组合得出
- 完成后：
  - process timeline 折叠
  - final answer 单独显示一次
- 禁止：
  - 运行中正文直接改写已完成 message
  - 下一轮开始时回补上一轮正文

---

### Task 4: 把恢复链路绑定到 sidecar，不绑定到前端流式草稿

目标：

- 刷新后恢复最终结果和关键过程边界
- 不尝试恢复“某一瞬间尚未完成的逐字流式草稿”

修改文件：

- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
- `apps/runtime/src/index.ts`
- `src/modules/ai/runtime/conversation/runtimeConversationGateway.ts`

具体动作：

- 保留：
  - `session.snapshot`
  - `turn.finished`
  - replay
  - checkpoint
- 放弃：
  - 从前端 `localStorage` 恢复运行中的临时吐字状态
- 如果刷新时 turn 还在运行：
  - 由 sidecar 当前 snapshot 重新投影
  - 不读取旧前端草稿缓存去拼正文

---

### Task 5: 给 `localStorage` 持久化做减负

目标：

- chat store 继续持久化，但只保存真正需要的稳定数据

修改文件：

- `src/modules/ai/store/aiChatStore.ts`
- 相关测试文件

具体动作：

- 检查 `partialize()` 是否还能进一步减小体积
- 避免把无意义的运行态字段写入 `goodnight-ai-chat-store`
- 如有必要：
  - 对 assistant message 只保存完成态 timeline
  - 不保存 live draft 派生字段

说明：

- 这里不是去掉持久化
- 是把持久化限制在“对恢复有价值的稳定数据”

---

## 计划删除 / 停用的内容

### 删除的主逻辑方向

- “流式过程中持续把 assistant message 写回持久化会话 store”
- “用会话持久化 store 充当实时吐字缓存”

### 需要重点排查并清理的入口

- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`
  - `applyRuntimeSidecarMessageNow()`
- `src/components/workspace/AIChat.tsx`
  - 依赖 `updateMessage()` 回灌流式正文的路径
- `src/modules/ai/store/chatSessionEventLog.ts`
  - `message_updated` 在流式场景的职责

### 明确保留

- sidecar snapshot persistence
- replay persistence
- checkpoint persistence
- completed message session persistence

---

## 验证方案

### 自动化测试

新增或修改测试：

- `tests/ai/ai-chat-store.test.mjs`
  - 断言流式路径不再高频持久化 message update
- `tests/ai/runtime-sidecar-session-bridge.test.mjs`
  - 断言 `message.delta` 主要更新内存态，不直接提交最终消息
- `tests/ai/runtime-sidecar-streaming-persistence-source.test.mjs`
  - 继续锁住 sidecar 流式不每 chunk 落盘
- `tests/ai/runtime-conversation-gateway.test.mjs`
  - 断言刷新恢复后消息不会污染上一轮
- `tests/ai/ai-chat-direct-streaming-display-source.test.mjs`
  - 断言过程展示与完成展示同源

### 人工回归

重点看这几项：

1. 流式正文是否明显更跟手
2. 思考、工具、正文顺序是否和完成态一致
3. 完成后是否只展示一份最终正文
4. 切到下一轮时，上一轮内容是否保持不变
5. 刷新后是否能恢复最终结果与工具节点

### 命令

执行后统一跑：

```bash
node --test tests/ai/ai-chat-store.test.mjs tests/ai/runtime-sidecar-session-bridge.test.mjs tests/ai/runtime-conversation-gateway.test.mjs tests/ai/runtime-sidecar-streaming-persistence-source.test.mjs tests/ai/ai-chat-direct-streaming-display-source.test.mjs
npm run build
graphify update .
```

---

## 最终收敛原则

这次之后，AI 聊天应遵守下面这套规则：

- 流式展示只走内存，不走持久化会话
- 完成结果才进入持久化会话
- 恢复只信 sidecar snapshot / replay / checkpoint
- 过程和结果只允许一条时间线真相源
- UI 只能决定“怎么显示”，不能决定“什么是真相”

如果后面还要继续做得更像 Codex，也应该只在这套边界上继续收样式和交互，不再回到“边流式边重写持久化历史”的旧路。
