# AI Chat 性能边界优化设计
- 日期：2026-05-10
- 状态：已确认，待用户 review
- 范围：仅聚焦 `AIChat` 工作台的加载、点击和运行时流式更新卡顿问题；不改运行时单内核架构，不改既有产品交互语义

## 背景

前一阶段已经把运行时执行链收敛到单一 orchestration kernel，后端的正确性和工具调用链路比之前稳定得多。但当前前端聊天工作台仍然存在明显卡顿，用户反馈包括：

- 打开聊天面板时加载偏慢
- 切换会话、展开卡片、切 tab 时有明显延迟
- AI 流式输出、工具执行、审批变化期间，整个界面会一起发涩

这说明当前瓶颈已经不主要是“执行链是否正确”，而是“高频 runtime 事件如何被前端消费”。如果前端继续把不同刷新频率的状态揉进同一个大投影对象里，即使后端单内核更稳定，UI 仍然会被高频事件拖慢。

## 问题定义

当前实现的高概率性能问题来自三类叠加：

1. `AIChat.tsx` 体量过大，直接订阅多个 chat/runtime store，再叠加大量本地派生状态。
2. `useRuntimeConversationGateway` 把会话、消息、live state、审批、任务、skills、replay、memory 等状态聚合成一个大对象，局部变化容易打脏整包引用。
3. runtime sidecar 在流式文本、thinking、tool start/finish、approval、question、usage 更新期间会频繁写入 store，导致大组件反复重渲染。

最终表现不是单点慢，而是以下路径一起慢：

- 首屏加载慢：初始化会话、runtime live state、审批状态时连带重算整棵聊天树
- 点击慢：按钮、tab、详情折叠在高频状态刷新期间也跟着重渲染
- 运行时慢：流式文本和工具状态变化把消息区以外的区域也一起拖动

## 目标

1. 在不改变现有交互语义的前提下，明显改善聊天工作台的加载、点击和运行时流畅度。
2. 让高频 runtime 事件只影响对应的小范围 UI，不再触发整块 `AIChat` 工作台连带更新。
3. 保留当前单一运行时内核与事件流语义，不引入新的第二套运行时消费逻辑。
4. 为后续继续做长列表虚拟化、二阶段懒加载留下清晰边界，但本轮不提前做超出需求的重构。

## 非目标

- 不重写 `AIChat` 产品交互
- 不调整消息结构、审批流程、工具事件语义或 sidecar 通信协议
- 不通过激进节流、批量延迟渲染来改变用户对运行中细节的感知
- 不借本轮性能优化顺手清理无关历史代码
- 不优先引入虚拟列表，除非在实施中确认它是当前瓶颈的直接根因

## 已确认的产品决策

- 优先方案是“拆细 store 订阅 + 渲染隔离”，而不是通过降频掩盖问题。
- 现有交互细节应尽量保持不变。
- 这次优化首先解决“事件一来整棵树都抖”的问题，而不是先做超长消息列表的极端场景优化。
- 允许在 runtime sidecar 到 store 的路径上增加“无变化不写入”的 guard，但不改变 runtime 事件本身的顺序和语义。

## 方案对比

### 方案 A：拆细订阅边界并隔离热区渲染

做法：

- 继续保留现有 runtime/chat store
- 将 `AIChat` 对聚合 `conversation` 对象的依赖拆成多个细粒度 selector/hook
- 将消息区、运行状态、审批区、任务区拆成相互独立的渲染岛

优点：

- 不改变既有交互语义
- 风险最低，和现有实现最兼容
- 能同时改善加载、点击和流式执行时的卡顿
- 与“单内核、单消费链”的长期方向一致

缺点：

- 需要调整 `AIChat.tsx` 与 `useRuntimeConversationGateway` 的边界
- 文件结构会比现在更碎一些

### 方案 B：继续保留大投影对象，只增加 memo/cache

做法：

- 保留 `conversation` 聚合方式
- 在网关和组件内追加更多 `useMemo`、缓存和局部比较

优点：

- 改动可能更集中

缺点：

- 根因没有消失，局部变化仍然容易让整包对象失效
- 会持续堆积“为了保住大对象不抖”的额外复杂度
- 后续维护成本高，不适合作为长期方案

### 方案 C：优先做虚拟列表和更强懒加载

做法：

- 优先优化长消息列表渲染
- 通过延迟挂载更多非首屏区域来减轻压力

优点：

- 对超长会话历史可能有明显收益

缺点：

- 不能直接解决 runtime 高频事件导致的大范围重渲染
- 容易把真正的热路径问题掩盖掉
- 不是当前主问题的第一解

结论：采用方案 A。

## 设计原则

### 高频状态只影响高频区域

`liveState`、`streamingDraftContents`、审批状态、背景任务都属于高频或中高频状态。它们不应该再通过一个大投影对象驱动整个聊天工作台。

### 选择态、消息态、运行态分离

当前会话选择、消息展示、运行状态、审批/提问、任务/团队执行是不同职责，也有不同刷新频率。实现上必须显式拆开，而不是在一个 hook 中一次性返回所有内容。

### 组件边界先于微优化

本轮优先修正订阅边界和渲染边界，而不是先堆 `memo` 或加入更复杂的缓存。边界正确之后，再做局部守门才有价值。

### 不改变运行时语义

thinking、tool use、tool result、approval、question、usage 的语义保持不变。性能优化只发生在“如何消费这些状态”的层面。

## 推荐设计

### 1. 保留总入口，但拆出细粒度会话消费 hook

`useRuntimeConversationGateway` 可以保留给少数真正需要完整投影的场景，但 `AIChat.tsx` 不再默认整包消费。新增细粒度 hook 或 selector，至少覆盖：

- `useActiveConversationSelection`
- `useActiveConversationMessages`
- `useActiveConversationLiveState`
- `useActiveConversationApprovals`
- `useActiveConversationTasks`
- `useActiveConversationSkillsAndRecovery`

这些 hook 的职责应当单一，只暴露当前渲染块真正需要的数据。

### 2. 将 `AIChat` 拆成稳定外壳 + 高频渲染岛

`AIChat` 顶层保留为工作台壳层，只负责：

- 布局
- 会话切换和提交动作
- 必要的初始化副作用
- 向下传递稳定的回调

以下区域应成为独立渲染岛：

- 消息列表区：只订阅 `messages + streamingDraftContents`
- 运行状态条：只订阅 `liveState + latestTurnSession` 所需字段
- 审批/问题区：只订阅当前会话审批与待回答问题
- 任务/团队区：只订阅 `backgroundTasks + teamRuns`

这样 `patchLiveState` 抖动时，不再连带设置区、引用区、会话列表、消息工具卡片以外的内容一起更新。

### 3. 为 sidecar 高频写入增加“无变化不写入”守门

在 runtime sidecar 到 `agentRuntimeStore` 的桥接路径上，允许做最小守门：

- 新值与当前值相同，则不重复 `patchLiveState`
- 工具状态没有变化，则不重复写同一 tool projection
- 审批摘要、问题摘要、token usage 等若未变化，则不触发额外写入

这类 guard 只减少无效更新，不改变真实事件顺序。

## 目标边界

### 当前不推荐的边界

`AIChat.tsx -> useRuntimeConversationGateway() -> conversation 大对象`

问题：

- 任意局部变化都可能让 `conversation` 整体重新构建
- 顶层组件拿到太多数据，导致局部渲染难以稳定

### 本轮目标边界

- `AIChatShell`：布局、提交、初始化、副作用协调
- `ConversationSelection`：只关心 active session 与 thread id
- `ConversationMessages`：只关心消息与流式草稿
- `ConversationLiveState`：只关心状态条和运行时文案
- `ConversationApprovals`：只关心审批与问题
- `ConversationTasks`：只关心 background tasks 与 team runs

这里不要求一次性把 `AIChat.tsx` 完全拆成多个文件，但至少要把订阅边界和渲染边界按以上职责切开。

## 涉及文件边界

本轮预计主要触达：

- `src/components/workspace/AIChat.tsx`
- `src/modules/ai/runtime/conversation/useRuntimeConversationGateway.ts`
- 可能新增与 `AIChat` 同目录的若干轻量 hook 或局部组件
- `src/modules/runtime-sidecar/runtimeSidecarSessionBridge.ts`

如有需要，允许同步补少量测试到现有 runtime/chat 测试目录，但不扩散到与本轮目标无关的模块。

## 实施顺序

1. 先拆 `AIChat` 对 `conversation` 大对象的依赖，建立细粒度选择器与局部订阅。
2. 再把消息区、运行状态区、审批区、任务区变成相互独立的渲染边界。
3. 最后在 sidecar/store 热路径上加最小 guard，减少无效写入。

这样可以先把“根因边界”改对，再做轻量守门，避免倒过来把代码变得更难懂。

## 测试与验证策略

### 功能不回归

- 会话切换、消息发送、流式输出、审批、问题回答、背景任务显示继续正常工作
- 现有运行时单内核逻辑不被破坏

### 性能行为验证

至少验证以下现象明显改善：

1. 首屏打开聊天面板时，不再因 live state 初始化导致整页明显抖动。
2. AI 流式输出和跑工具时，消息区可以持续更新，但切 tab、点按钮、展开卡片不再明显卡顿。
3. 切换会话时，只刷新当前会话相关 slice，不再把无关区域一起重算。
4. runtime sidecar 的重复状态写入减少，没有产生新的显示延迟或状态错乱。

### 自动化验证

- `npm run build`
- 现有 `tests/ai` 中与 runtime chat、sidecar bridge、runtime output flow 相关的测试
- 如新增 selector/hook，可补最小测试确保订阅边界符合预期

## 风险与控制

### 风险 1：边界拆分后出现选择态不一致

控制：

- 所有细粒度 hook 都以同一 active session/thread 解析规则为准
- 不引入第二套 selection 逻辑

### 风险 2：组件拆分后 callback 引用变化反而造成更多渲染

控制：

- 顶层仅向局部组件传递稳定回调
- 避免把大对象 props 继续往下传

### 风险 3：sidecar guard 误吞真实更新

控制：

- guard 只做值相等短路，不做时间窗口节流
- 优先比较明确字段，不做模糊合并

## 成功标准

- 用户主观体验上，聊天工作台“加载、点击、运行中”三类卡顿都明显下降。
- 代码结构上，`AIChat` 不再默认消费一个涵盖所有运行时状态的大对象。
- 高频 runtime 状态变化只影响对应局部区域，而不是整棵聊天工作台。
- 本轮改动保持在性能边界内，不夹带无关重构或产品行为变化。
