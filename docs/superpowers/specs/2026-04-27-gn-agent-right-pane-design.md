# GN Agent Right-Pane Design

日期：2026-04-27

## Goal

把当前右侧 AI 工作台升级为 `GN Agent`，让它不再像“带聊天能力的工具侧栏”，而是一个真正成立的右侧 AI Agent 控制台。

这套产品需要同时满足三件事：

1. 看起来像一个正常、成熟的 AI 产品
2. 用起来像一个有执行感的 Codex 式 Agent 控制台
3. 能自然挂载 PM 专属能力，例如 `@整理`、`@需求`、`@草图`、`@UI`、`@变更同步`

## Product Positioning

`GN Agent` 的主定位不是“产品经理专用 workflow 页面”，而是一个通用 AI Agent 控制台。

它默认驻留在桌面端右侧，替代当前右侧 AI 工作台。用户第一眼看到的是一个强聊天主屏，而不是多个 tab、workflow 页面或者后台工具导航。

产品心智分三层：

- 表层：像 ChatGPT / Claude 一样自然聊天
- 中层：像 Codex / Cursor Agent 一样具备执行感、步骤感、产物感
- 能力层：挂接 PM 场景能力，而不是单独开辟一个 PM 工作流产品

## Product Rules

1. 右侧默认永远以聊天主屏作为第一视图
2. workflow 是内部编排，不是产品主入口
3. 普通用户路径优先自然语言，`@skill` 是高级精准入口
4. 复杂能力不能靠新增 tab 解决，要优先融入消息流
5. 用户要同时看得见“AI 看到了什么”“AI 做了什么”“AI 产出了什么”
6. PM 超能力必须建立在通用 Agent 壳稳定的前提上

## Target Shape

`GN Agent` 采用 `1 个主屏 + 3 个二级层`。

### Main Screen

主屏就是聊天控制台，由三段组成：

- 顶部控制栏
- 中间消息流
- 底部强 Composer

### Secondary Layers

不再以 `chat / skills / activity / workflow` 这种平铺 tab 作为主结构，而是改成按需展开的二级层：

- `Context Drawer`
- `Run Drawer`
- `Artifacts Drawer`
- `Model / Agent Sheet`

默认情况下，用户只看主聊天屏。只有当用户想检查上下文、执行过程或产物时，才展开二级层。

## Main Screen Details

### 1. Top Control Bar

顶部控制栏保持极简，不做后台导航。

从左到右建议为：

- `GN Agent` 标题
- 当前 agent pill：`Built-in / Claude / Codex`
- 当前模型 pill
- 上下文占用 pill：例如 `12k / 200k`
- 会话入口
- 更多菜单入口

这一层回答四个问题：

- 现在是谁在执行
- 当前用的什么模型
- 当前上下文压力有多大
- 当前处于哪个会话

### 2. Message Stream

消息流不只承载“用户消息”和“AI 文本回答”，而是统一承载对话、执行和结果。

建议建立统一消息块协议，至少支持：

- `user-message`
- `assistant-text`
- `thinking-state`
- `tool-step-card`
- `reference-block`
- `artifact-card`
- `file-change-card`
- `review-card`
- `error-card`
- `success-summary-card`

这意味着聊天区本身就是执行区，不再要求用户跳转到别的页面查看运行过程。

示例：一轮 `@整理` 的消息流可以自然表现为：

- 用户消息：`@整理 帮我整理当前项目`
- thinking state
- tool step：读取知识库
- tool step：分析需求与页面
- artifact card：生成 `项目总览.md`
- artifact card：生成 `功能清单.md`
- success summary：本轮新增 4 个知识文档

### 3. Strong Composer

Composer 是 `GN Agent` 最重要的操作面。

建议分成三层：

- 输入层：多行输入，回车发送，Shift+Enter 换行
- 快捷能力层：引用、上下文、技能、模型、Agent、停止/发送
- 已选上下文层：显示当前挂上的文件、知识文档、页面、风格、当前页面

Composer 需要像一个成熟 AI 产品，而不是“输入框附近塞满设置入口”。

## Secondary Layer Details

### Context Drawer

作用：回答“AI 看到了什么”。

展示：

- 当前轮挂载的文件
- 当前轮挂载的知识文档
- 当前轮引用的页面
- 当前启用的风格包
- 上下文预算占用明细

### Run Drawer

作用：回答“AI 做了什么”。

展示：

- 当前轮执行步骤
- 工具调用记录
- 执行状态：`thinking / running / waiting / done / failed`
- 每一步耗时
- 当前失败点

### Artifacts Drawer

作用：回答“AI 留下了什么”。

展示：

- 本轮生成的需求文档
- wiki 文档
- 原型结果
- HTML 页面
- 同步提案
- 文件变更摘要

### Model / Agent Sheet

作用：统一模型和 Agent 切换心智。

展示：

- Agent 选择：`Built-in / Claude / Codex`
- 当前模型
- 可切换模型
- 配置状态
- 本地与远程模式的真实差异说明

## Capability Stack

`GN Agent` 的能力分三层。

### Layer 1: Normal AI Product Capabilities

这是成熟聊天产品的基本能力：

- 多会话与会话搜索
- 模型切换
- 流式输出
- 停止生成
- 重试
- 继续生成
- 上下文窗口与占用提示
- 文件 / 知识 / 页面引用
- 多轮记忆与会话标题自动总结
- 引用块 / 代码块 / 产物块
- 错误恢复与失败提示

### Layer 2: Agent Console Capabilities

这是 `GN Agent` 与普通 AI 聊天产品拉开差距的能力：

- Agent 切换：`Built-in / Claude / Codex`
- 执行步骤流
- 工具调用卡片
- 运行状态
- 本轮产物卡片
- 文件变更卡片
- 可确认动作
- 活动回放
- 一条消息可对应一次执行任务

### Layer 3: PM Agent Capabilities

这是产品差异化能力：

- `@整理`
- `@需求`
- `@草图`
- `@UI`
- `@变更同步`
- 页面级 truth doc
- 知识库长期上下文

## Visual And Interaction Direction

视觉上不要做成花哨 AI 风，而要做成“专业、克制、执行感强”的右侧控制台。

建议方向：

- 更像控制台，不像营销页
- 顶部状态 pill 克制、稳定
- 消息卡片边界清楚
- tool step 用轻量状态色，不抢主文本
- artifact card 更像结果面板
- 输入区有重量感
- 动效以展开、流入、状态切换为主

行为上要更像 Codex：

- 默认聚焦当前轮
- 细节按需展开
- 过程和结果都可见
- 不让用户跳离聊天主线

## Mapping To Current Codebase

### Step 1: Replace the current right-pane shell with a real GN Agent surface

主要文件：

- `src/components/workspace/AIChat.tsx`
- `src/components/workspace/AIChat.css`
- `src/components/ai/gn-agent/GNAgentEmbeddedPieces.tsx`
- `src/modules/ai/store/aiChatStore.ts`

目标：

- 把当前“聊天组件”升级成 `GN Agent` 主控制台
- 把当前右侧视觉从工具侧栏改成 AI 产品主屏
- 让 store 从“消息 + 活动”升级为“会话 + 运行态 + 产物 + UI 状态”

### Step 2: Unify the message protocol

主要文件：

- `src/modules/ai/store/aiChatStore.ts`
- `src/components/workspace/aiChatMessageParts.ts`
- `src/components/workspace/AIChat.tsx`
- 新消息卡片组件

目标：

- 聊天区能承载执行态、引用、产物、文件变更、确认卡片

### Step 3: Replace flat tabs with secondary drawers

需要收编的信息：

- `Skills`
- `Activity`
- `Settings` 中的部分运行态信息
- workflow 的可见感

目标：

- 默认永远是主聊天屏
- 引用、运行、产物变成按需展开的二级层

### Step 4: Add Codex-like agent feel

主要能力：

- 顶部实时状态
- 流式步骤感
- 可展开工具卡
- 产物卡片化
- 停止 / 重试 / 继续 / 确认 / 拒绝闭环

### Step 5: Mount PM superpowers on the stable shell

能力顺序：

- `@整理`
- `@变更同步`
- `@需求`
- `@草图`
- `@UI`

原则：

- 通用 Agent 壳先成立
- PM 超能力作为高级能力层接入
- 不再继续扩张主导航

## Release Scope

### V1

V1 目标是先让 `GN Agent` 成立。

必须包含：

- `GN Agent` 右侧主屏壳
- 正常 AI 产品核心能力
- Agent 执行感
- `Built-in / Claude / Codex` 统一体验
- `@整理`
- `@变更同步`
- 产物可见

### V1.5

V1.5 增强 PM 工作链：

- `@需求`
- `@草图`
- 页面级 truth doc
- 更强的组合引用
- 更好的会话检索

### V2

V2 再上更重的能力：

- `@UI`
- 更复杂的多轮任务编排
- 批量页面同步
- 跨页面 flow sync
- 更重的技能系统可视化
- 更完整的任务队列
- 产物版本对比

## Scope Guardrails

第一版明确不做：

- 把右侧做成一个很重的 IDE 子系统
- 重新引入 first-class workflow page 作为主入口
- 用新增 tab 来堆能力
- 在 V1 就做重型批量同步
- 在 V1 就做完整的高保真 UI 设计流水线

## Success Criteria

如果设计落地成功，用户会获得下面的体验：

1. 右侧第一眼就是一个成熟 AI 产品，而不是后台面板
2. 正常聊天时，它像一个自然 AI
3. 执行任务时，它像一个可观察的 Agent 控制台
4. 使用 PM 能力时，感觉是在同一个产品里解锁高级能力，而不是跳到另一个系统
5. 用户能同时理解上下文、执行过程和最终产物

## Recommendation

推荐先按下面顺序落地：

1. 先重做 `GN Agent` 壳和信息架构
2. 再统一消息协议和卡片体系
3. 再补 Codex 式 Agent 执行感
4. 再接 `@整理` 和 `@变更同步`
5. 最后补 `@需求`、`@草图`、`@UI`

这样可以保证：

- 产品壳先成立
- 能力往里挂时自然、不发散
- 不会继续走“每来一个新能力就再加一个入口”的老路
