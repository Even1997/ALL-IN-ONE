# Agent Workbench 类 Codex 布局改造设计

## 摘要

本次改造目标是在不新增左侧主导航入口的前提下，把现有 `Agent` 角色页重构成更接近截图所示的独立 AI 工作台，同时确保后续全项目只维护一套 AI 主体。页面采用“三段式工作区”：

- 左侧：可收缩导航与会话侧栏
- 中间：独立聊天主舞台
- 右侧：可折叠审查/文件/工具/记忆面板

与截图不同的是，本项目需要继续兼容现有浅色/深色主题，不引入只服务于深色模式的一套单独视觉系统。

## 目标

- 让 `Agent` 页成为一个独立、持续可用的 AI 工作台，而不是当前偏演示型的标签页入口。
- 全项目只维护一套 AI 核心舞台，避免后续出现“完整页一套、收缩页一套”的分叉实现。
- 布局尽量复刻截图的信息分区和使用路径。
- `进度 / 计划` 卡片悬浮在中间聊天区右上角，而不是塞进右侧检查栏。
- 左侧栏和右侧栏都支持收缩，减少对聊天主区的挤压。
- 优先复用现有 `GN Agent` 和 `AIChat` 能力，避免重写 runtime、会话和工具链。
- 控制代码体量，把“布局壳”和“业务内容”分层，避免单文件继续膨胀。

## 非目标

- 不新增新的顶层 `agent` 导航按钮。
- 不重写 `AIChat` 的消息渲染、输入框和 turn runtime。
- 不在本轮做全新的会话存储模型。
- 不把右侧面板扩展成完整 IDE。
- 不因为这次改造抽出一个全项目复用的通用三栏框架。
- 不长期保留两套完整 AI 页面壳。

## 当前现状

当前项目已经具备完成这次改造所需的大部分业务能力：

- `src/features/agent-shell/pages/AgentShellPage.tsx`
  - 负责 `Agent` 角色入口，但目前仍是头部 + tab 的轻页面。
- `src/components/ai/gn-agent-shell/GNAgentChatPage.tsx`
  - 已经拥有 thread、主聊天区、计划、上下文、工具调用、记忆等运行时能力。
- `src/components/workspace/AIChat.tsx`
  - 已具备主消息流、输入区、runtime 输出渲染与工具过程展示。
- 现有 `GNAgentThreadList`、`GNAgentPlanPanel`、`GNAgentToolCallPanel`、`GNAgentMemoryPanel` 等面板
  - 可作为右侧检查栏和悬浮卡的直接复用基础。

真正欠缺的不是能力，而是一个合理的工作台壳层，以及把现有能力重新组织到更合适的位置。更重要的是，这个壳层必须建立在唯一的聊天核心之上，而不是再派生出第二套 AI 页面。

## 核心方案

### 1. 单核心结构

本次改造采用“单核心聊天舞台 + 可插拔工作台壳”的结构：

- 最内层核心：`AgentChatStage`
  - 是唯一的 AI 主体
  - 负责会话标题、消息流、输入区、少量运行状态
- 外挂壳层：`AgentWorkbenchShell`
  - 负责左侧导航/会话栏、悬浮计划卡、右侧检查栏
  - 不拥有 runtime，会话能力全部来自核心舞台

因此不同场景不是两套页面，而是同一套核心的不同展开密度：

- `full`
  - 完整工作台，用于 `Agent` 角色页
- `stage-plus`
  - 保留聊天舞台和少量浮层入口，用于需要轻工作流的页面
- `stage-only`
  - 只保留聊天主体，用于最紧凑的嵌入面板

### 2. 页面结构

新的 `Agent` 页面分成四层信息：

1. 左侧窄导航栏
   - 放 `新对话`、`搜索`、`技能`、`插件`、`自动化`
   - 底部固定 `设置`
   - 支持整栏收缩为仅图标模式
2. 左侧内容栏
   - 放当前项目标题、会话列表、快捷筛选
   - 与导航栏一起构成截图中的左侧区域
   - 支持折叠/展开
3. 中间聊天主舞台
   - 顶部工具栏：标题、provider/model、快捷动作
   - 主消息流：复用现有 `AIChat`
   - 底部输入区：沿用现有 composer
4. 中间悬浮计划卡 + 右侧检查栏
   - `进度 / 计划` 作为主舞台上的悬浮卡，默认停靠在右上角
   - 右侧检查栏只承载 `审查 / 文件 / 工具 / 记忆 / 上下文` 等辅助信息

### 3. 代码分层

为避免把逻辑继续塞进 `AgentShellPage` 或 `GNAgentChatPage`，本次改造分成两层：

- 核心舞台层
  - 只负责聊天主体、会话切换、状态动作和必要的顶部工具区
- 布局壳层
  - 只负责三栏布局、收缩状态、工具栏和面板切换
- 业务内容层
  - 继续复用当前 GN agent 的 conversation、thread、plan、tool、memory 数据

建议的拆分方式：

- `AgentShellPage`
  - 页面入口，只负责拼装和少量页面级状态
- `AgentChatStage`
  - 唯一聊天主体
- `AgentWorkbenchLayout`
  - 三栏/浮层壳
- `AgentWorkbenchSidebar`
  - 左侧导航和会话栏
- `AgentWorkbenchInspector`
  - 右侧折叠检查栏
- `AgentFloatingPlanCard`
  - 中间悬浮计划卡
- `useGNAgentWorkbenchSession`
  - 从 `GNAgentChatPage` 中抽出共享的 session/conversation/action 逻辑

### 4. 为什么不保留两套 AI 页面

如果保留“完整工作台页”和“其他地方另一套收缩 AI 页”，会出现三个问题：

- 消息区、输入区、状态区会逐步分叉
- 任意一次 AI 能力改动都要在两套页面同步
- 后续很难判断哪些 bug 属于核心、哪些 bug 属于壳层差异

因此本次更合理的方向是：

- 只保留一个聊天核心
- 工作台只是这个核心的展开形态
- 其他地方的 AI 都退化为这个核心的收缩态

`GNAgentChatPage` 也不再被视为第二套完整页面壳。它要么降级为对 `AgentChatStage` 的兼容封装，要么最终被新壳替代。

## 组件设计

### AgentShellPage

职责：

- 作为 `App.tsx` 中 `agent` 角色的唯一入口
- 持有页面级 UI 状态：
  - 左侧导航是否收缩
  - 左侧内容栏是否显示
  - 右侧检查栏是否显示
  - 当前右侧检查 tab
  - 悬浮计划卡是否收起
- 组合工作台布局与各面板

不负责：

- 直接管理 runtime conversation 数据
- 直接拼接计划、工具调用、memory 保存逻辑

### AgentChatStage

职责：

- 作为全项目唯一 AI 主舞台
- 负责承载：
  - 会话标题
  - 主消息流
  - 输入区
  - 少量状态与快捷动作
- 在 `full / stage-plus / stage-only` 三种密度下复用

不负责：

- 决定左栏是否存在
- 决定右侧 inspector 是否存在
- 决定悬浮计划卡的位置和样式

### AgentWorkbenchSidebar

职责：

- 复刻截图式左栏结构
- 顶部快捷入口：
  - 新对话
  - 搜索
  - 技能
  - 插件
  - 自动化
- 中部项目区：
  - 当前项目
  - 会话列表
- 底部：
  - 设置

交互要求：

- 整栏可收缩
- 会话列表区可单独隐藏
- 点击技能/设置时，在左侧内容区切换到相应内容，而不挤占中间聊天舞台

### 中间聊天舞台

职责：

- 承载完整聊天体验
- 显示会话标题和状态
- 在不改动 `AIChat` runtime 能力的前提下适配新的壳层样式
- 为悬浮计划卡预留固定的停靠区域

与整体架构的关系：

- 它不是 `Agent` 页面专属组件
- 它是未来所有 AI 入口都要复用的唯一核心
- `Agent` 页只是给它套上最完整的工作台外壳

视觉要求：

- 容器边界弱化，优先让消息流成为主角
- 兼容浅色/深色主题变量
- 窄屏时计划卡退化为顶部抽屉或可展开浮层

### AgentFloatingPlanCard

职责：

- 将 `最新 turn` 的计划信息提炼成一张常驻悬浮卡
- 展示：
  - 当前状态
  - plan summary
  - step 数量/风险等级
  - 最近步骤
  - 快捷动作（例如聚焦详情、收起）

设计原则：

- 只展示“当前轮最有用”的信息
- 不把完整右侧面板内容全部复制进来
- 详细信息仍在右侧检查栏查看

### AgentWorkbenchInspector

职责：

- 提供右侧辅助信息区
- 支持整体收缩
- 支持 tab 切换，建议初始包含：
  - `review`
  - `files`
  - `tools`
  - `memory`
  - `context`

数据来源建议：

- `review`
  - 先复用 `GNAgentPlanPanel` 和 `GNAgentStatusPanel` 的详细视图
- `files`
  - 优先展示工具产物、文件改动、相关路径
- `tools`
  - 复用 `GNAgentToolCallPanel`
- `memory`
  - 复用 `GNAgentMemoryPanel`
- `context`
  - 复用 `GNAgentContextPanel`

## 数据流

### 会话数据

会话、线程、context、tool calls、memory candidates、latest turn 等数据继续来自现有 runtime conversation 通道，不另建一套 store。

建议把 `GNAgentChatPage.tsx` 中这部分数据汇总和行为回调抽到新的 hook：

- `useGNAgentWorkbenchSession`

它向布局层暴露：

- `threads`
- `activeSessionId`
- `latestTurnSession`
- `contextSnapshot`
- `toolCalls`
- `mcpToolCalls`
- `memoryCandidates`
- `memoryEntries`
- `status`
- `actions`
  - 切换线程
  - 恢复线程
  - 保存/忽略 memory
  - 预填 prompt
  - pause / resume / retry

### 视图状态

纯 UI 状态不进入 runtime store，保留在页面壳层本地：

- 左/右栏开关
- 当前 inspector tab
- 悬浮卡开合
- 左侧内容模式（会话 / 技能 / 设置）

这样可以避免把布局偏好污染到 agent 运行时状态。

## 迁移原则

从现有代码迁移到新结构时，遵守下面三条：

1. 先抽核心，再换外壳
   - 先把聊天主体和 session 行为抽成可复用舞台
   - 再让 `AgentShellPage` 变成它的完整工作台壳
2. 旧页面只允许降级，不允许并行长期存在
   - `GNAgentChatPage` 只可作为过渡兼容层
   - 不允许再继续长成另一套完整 AI 页
3. 其他 AI 面板以后统一走收缩态
   - 不再新建第二套“轻量 AI 页面”
   - 统一复用 `AgentChatStage`

## 错误处理

- 如果当前没有项目：
  - 中间区显示空状态，引导返回项目工作区
- 如果没有 active session：
  - 中间区显示欢迎态，并支持点击 `新对话`
- 如果 plan 数据为空：
  - 悬浮卡显示轻量空状态，不报错
- 如果右侧某个面板没有内容：
  - 使用空卡片，不导致整体面板塌陷
- 如果窗口宽度不足：
  - 优先保证中间聊天区可用
  - 左栏和右栏退化为收起状态
  - 悬浮计划卡切成抽屉模式

## 测试策略

本次改造以“布局重组 + 能力复用”为主，测试重点放在三个层面：

1. 源码边界测试
   - 确认 `AgentShellPage` 改为使用新工作台壳
   - 确认旧的 tab 导航不再是主入口结构
2. 组件拼装测试
   - 确认左栏、聊天区、悬浮计划卡、右侧检查栏都被挂载
   - 确认聊天区来自统一的 `AgentChatStage`
3. 构建验证
   - `npm run build`

必要时再补充针对收缩状态和默认 inspector tab 的轻量测试。

## 验收标准

- 进入 `Agent` 角色后，页面呈现为类截图的独立 AI 工作台，而不是当前 tab 页。
- 左侧包含快捷入口、项目会话区和底部设置，且可收缩。
- 中间聊天舞台可正常使用现有 `AIChat` 能力。
- `进度 / 计划` 以悬浮卡形式固定在中间区，而不是在右侧栏。
- 右侧检查栏支持折叠，并能切换审查/文件/工具/记忆/上下文。
- 浅色和深色主题都保持可读且结构稳定。
- 代码改造以“唯一聊天核心 + 可插拔工作台壳”为主，不保留两套完整 AI 页面。
- 代码改造以新增布局壳和抽取共享 hook 为主，不出现超大单文件继续膨胀。
