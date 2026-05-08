# GoodNight Agent Shell 高保真复刻 cc-haha 前端设计

Date: 2026-05-08

## 摘要

本设计定义一次以“前端高保真复刻”为目标的 Agent 工作台改造。目标不是重做 GoodNight 的 runtime、会话存储和工具执行，而是在现有 `src/features/agent-shell` 子系统基础上，把 `cc-haha` 的主聊天页、侧边栏、右侧检查区、空态、输入区，以及 `Settings` 左侧分栏与二级页面结构尽量完整迁入 GoodNight。

这次改造优先级明确为：

1. 页面结构和视觉层尽量与 `cc-haha` 高度一致
2. 现有会话、消息、工具、审批与运行链路尽量保留
3. 没有现成功能支撑的设置页先用高保真占位页承接，而不是跳过

## 目标

- 让 GoodNight 的 `Agent` 主页面在第一眼观感、信息层级和交互分区上尽量接近 `cc-haha`
- 主页面形成清晰的 `Sidebar -> Active Session -> Inspector` 三段式工作台
- `Settings` 页面整体采用 `cc-haha` 的左侧分栏和二级页组织
- 对已有能力尽量直接接现有 GoodNight 组件或 store
- 对缺失能力提供风格一致的“暂无功能”页面，避免空白页、死链或半成品入口

## 非目标

- 本次不重做底层 runtime、WebSocket、消息 contract 或 tool execution
- 本次不追求把 `AIChat` 内部所有消息块完全改写成 `cc-haha` 的实现
- 本次不要求所有 `Settings` 二级页都拥有完整业务能力
- 本次不改造旧 `AIWorkspace` 或其它非 `agent-shell` 主路径页面

## 用户确认的设计前提

- 目标是“尽量高度一致”，后续再逐步优化细节和缺失功能
- 文案风格优先贴近 `cc-haha`
- `Settings` 内二级页即使当前无功能，也可以先按 `cc-haha` 风格复制结构并显示“暂无功能”
- 可以接受前端侧高保真、底层实现先复用 GoodNight 现有链路的折中方案

## 参考源与复刻边界

主要参考 `cc-haha-main/desktop/src` 中以下页面与组件：

- `pages/ActiveSession.tsx`
- `components/layout/Sidebar.tsx`
- `pages/Settings.tsx`
- `pages/ToolInspection.tsx`
- `pages/*Settings.tsx`
- `components/chat/ChatInput.tsx`
- `components/chat/MessageList.tsx`

复刻边界分两层：

### 1. 必须高保真复刻的部分

- 页面骨架
- 左右栏比例和层级关系
- 标题区、空态、工具栏、输入区、底部动作区
- `Settings` 的导航结构、页面命名、说明文字风格、卡片布局
- 按钮、边框、留白、背景、信息卡、状态区的整体视觉语言

### 2. 允许先复用 GoodNight 现有实现的部分

- 会话数据来源
- 消息发送与流式输出机制
- 工具调用结果来源
- 审批状态来源
- 已实现的技能页、配置页、知识搜索等底层行为

## 总体方案

采用“高保真前端复刻，低侵入底层复用”方案。

### 核心原则

- 不直接搬运 `cc-haha` 的 store、API 和 runtime
- 不把现有 `AIChat` 整体推翻重写
- 先让外层页面结构、视觉层级和信息架构尽量一致
- 能接现有能力的地方优先适配，不为了一次性对齐而重做底层
- 无法对齐的功能用明确占位补齐体验，而不是留空

## 页面信息架构

### Agent 主页面

主页面改造成接近 `cc-haha` 的三段式布局：

```text
AgentShellPage
  ├─ Sidebar
  │   ├─ Brand / 顶部操作
  │   ├─ New Session
  │   ├─ Search
  │   ├─ Session List
  │   └─ Settings entry
  ├─ Active Session
  │   ├─ Session header
  │   ├─ Empty state / Message area
  │   ├─ Inline task / status area
  │   └─ Composer
  └─ Inspector
      ├─ Review / Tool / Timeline tabs
      ├─ Tool call detail
      ├─ Approval summary
      └─ Placeholder inspection surfaces
```

### Settings 页面

`Settings` 采用与 `cc-haha` 接近的左侧纵向分栏：

- Providers
- Permissions
- General
- Adapters
- Terminal
- MCP
- Agents
- Skills
- Plugins
- Computer Use
- Diagnostics
- About

其中：

- 已有能力页优先复用现有实现并包装到新样式中
- 无现成能力页使用统一的占位页框架

## 前端结构设计

重点文件继续集中在现有 `agent-shell` 子系统：

```text
src/features/agent-shell/
  pages/
    AgentShellPage.tsx
  components/
    AgentWorkbenchLayout.tsx
    AgentWorkbenchSidebar.tsx
    AgentChatStage.tsx
    AgentWorkbenchInspector.tsx
    AgentFloatingPlanCard.tsx
    agentWorkbench.css
```

同时扩展或包装现有 GN Agent 页面：

```text
src/components/ai/gn-agent-shell/
  GNAgentConfigPage.tsx
  GNAgentSkillsPage.tsx
  ...
```

### 结构决策

#### 1. `AgentShellPage`

职责：

- 作为 `Agent` 一级页签的唯一主入口
- 负责组织 sidebar、center stage、inspector 和 settings 打开逻辑
- 保持现有 session hook 与搜索弹窗逻辑可用

#### 2. `AgentWorkbenchSidebar`

职责：

- 复刻 `cc-haha` Sidebar 的视觉和入口布局
- 管理新建会话、搜索、会话切换、折叠状态、settings 入口
- 如果会话分组逻辑短期无法完全对齐，则先用现有数据结构渲染近似分组或列表

#### 3. `AgentChatStage`

职责：

- 充当 `ActiveSession` 风格的主聊天区容器
- 接管会话标题、状态摘要、空态、输入区外层结构
- 现阶段继续内嵌或包裹现有 `AIChat`，避免一次性重写聊天逻辑

#### 4. `AgentWorkbenchInspector`

职责：

- 接近 `ToolInspection`、审批和 review 面的视觉层次
- 展示已有 `toolCalls`、审批数、最近执行信息
- 对缺失的数据面板提供统一占位卡片

#### 5. `Agent Settings Pages`

职责：

- 提供与 `cc-haha` 一致的分栏和页面标题体系
- 通过“包装现有功能组件 + 新增占位页”的方式快速补齐结构

## 交互设计

### 主页面

- 左上保留品牌区与折叠控制
- 左侧提供 `新对话`、`搜索`、`Settings` 等核心入口
- 中间区域显示会话标题、最近状态、空态说明与消息流
- 底部 composer 尽量接近 `cc-haha` 的宽度、边框、分层和按钮布局
- 右侧 inspector 显示 review / tool / timeline 之类的二级视图

### 空态

空态应更接近 `cc-haha` 的大图标/品牌标题/说明文字式布局，而不是普通空白聊天框。

### Settings

- 左侧分栏固定
- 右侧为页面内容区
- 每个二级页都有标题、简短说明和内容卡片
- 暂无功能页也必须具备完整壳子，包括：
  - 页面标题
  - 描述
  - 当前状态
  - 后续规划或说明

## 功能映射策略

### 已有能力直接接入

以下页面或能力优先复用现有 GoodNight 实现：

- 当前 agent 会话列表与切换
- 聊天发送与响应
- inspector 中现有工具调用信息
- `GNAgentSkillsPage`
- `GNAgentConfigPage`
- 现有搜索弹窗与知识索引

### 需要包装接入的能力

- Settings 左侧导航与内容容器
- Config / Skills 页的标题、层级和卡片样式
- Terminal、MCP、Diagnostics 等如果已有部分能力，则包进新的 `cc-haha` 风格页面壳中

### 先占位的能力

如果当前仓库没有对应实现，则先生成占位页：

- Providers 的完整编辑能力
- Adapters
- Agents
- Plugins
- Computer Use
- About 的完整版本信息块

这些占位页不应该只写一句“暂无功能”，而应该呈现为接近真实产品页的说明性面板。

## 视觉设计原则

- 优先贴近 `cc-haha` 的浅色工作台感
- 保留左栏、主栏、右栏的清晰分区
- 增强标题层级、会话头部信息密度、按钮状态和 hover 反馈
- 控制圆角、边框、背景层级，让视觉更加接近 `cc-haha`
- 如果现有 GoodNight token 与 `cc-haha` 风格冲突，优先在 `agentWorkbench.css` 内局部定义变量覆盖，不全局改主题

## 实现策略

### 方案选择

最终采用“混合复刻”方案：

1. 布局、样式、信息架构尽量对齐 `cc-haha`
2. 聊天主路径继续复用 GoodNight 现有会话和运行能力
3. `Settings` 用“现有能力接入 + 高保真占位页”完成结构对齐

该方案优于纯换皮，也显著低风险于整套代码搬迁。

### 分阶段落地

#### 阶段 1：主聊天工作台高保真复刻

- 重做 sidebar
- 重做 active session 外层结构
- 重做 inspector 外层和 tab 层级
- 收口整体样式

#### 阶段 2：Settings 分栏与二级页对齐

- 补齐左侧导航
- 接现有 config / skills / terminal 等页面
- 为缺失页面建立统一占位模板

## 测试策略

### 结构验证

- 校验 `AgentShellPage` 仍由左、中、右三段组成
- 校验 `Settings` 至少拥有目标分栏项
- 校验 `Sidebar` 保留新建会话、搜索、设置入口

### 回归验证

- 进入 `Agent` 页仍可切换会话
- 发送消息不回退
- inspector 仍能展示已有工具调用信息
- 搜索弹窗仍可打开

### 视觉验证

- 主页面与 `cc-haha` 的骨架明显接近
- settings 页面不是旧 GN 风格残片拼接
- 占位页视觉与真实页一致，不突兀

## 风险与取舍

### 1. `AIChat` 封装过深

风险：

- 聊天区内部消息块不一定一次就能完全长得像 `cc-haha`

取舍：

- 先做外层结构和 composer 形态对齐
- 如果后续要继续高保真，再拆内部消息块

### 2. `cc-haha` Settings 页依赖自身 store

风险：

- 不能直接照搬交互逻辑

取舍：

- 本次只复刻信息架构、页面壳和已存在能力
- 缺失逻辑先占位

### 3. 范围膨胀

风险：

- “高度一致”容易滑向 runtime 重构

取舍：

- 把复刻范围严格限定在前端页面、样式与分栏结构
- 明确不进入底层链路重构

## 验收标准

- `Agent` 主页面第一眼明显接近 `cc-haha`
- 左侧栏、中间会话区、右侧检查区分层清晰
- `Settings` 具有与 `cc-haha` 接近的完整左侧二级导航
- 已有聊天和会话能力无回退
- 无能力页也有完整占位，不出现空白区或坏入口

## 后续演进

如果本次前端复刻完成且体验达标，下一阶段再考虑：

- 继续拆 `AIChat`，把消息块和 tool block 更深地贴近 `cc-haha`
- 补齐 Providers / Plugins / Agents 等页面的真实能力
- 逐步把 inspector、diff、workspace preview 与 tool inspection 做得更完整
