# Dyad 全局 UI 与右侧 AI 统一化设计

## 目标

把当前产品收敛回一套全局统一的 `dyad` 风格工作台 UI。

本次设计解决三个已经确认的问题：

- `AI` 被做成了独立一级页面，偏离了“AI 只是工作台右侧协作区”的定位
- `ClaudePage / ClaudianShell / ProviderWorkspace` 形成了与主工作台并行的第二套页面外壳
- 右侧 AI 区存在大量说明文案、示例卡片、占位状态和未落地能力，干扰真实使用

最终目标不是继续做“独立 AI 产品页”，而是让整个平台回到：

- 一套全局工作台骨架
- 一套统一的视觉与交互规范
- 一个真实可用、默认停靠在右侧的 AI 协作面板

## 已确认决策

- 取消顶部 `AI` 一级入口
- 不再保留独立的 `ClaudePage`
- 不再让 `ClaudianShell` 作为完整页面外壳存在于主导航体系中
- 全局继续使用工作台结构：`header + left pane + center pane + right pane`
- 右侧栏是 AI 的唯一主入口
- 右侧 AI 只保留真实可用能力，不保留展示型占位内容

## 产品结果

改造完成后，产品应当表现为：

- 用户在任一主视图中，都处于同一套 `dyad` 工作台骨架内
- AI 永远在右侧协作区出现，而不是跳转到另一套大页面
- 产品、设计、开发、测试、运维等主视图共享同一套容器语言和层级规则
- 右侧 AI 默认聚焦“提问、引用上下文、查看执行结果、打开配置”
- 任何没有真实能力支撑的徽章、说明块、示例会话、平台自述卡片都不再出现

## 非目标

- 不重做整个产品的信息架构
- 不把全应用改造成另一个独立 AI 产品
- 不在本次设计里重写底层 Claude/Codex runtime
- 不为未来可能出现的 provider 预先设计新的大页面结构
- 不做与当前偏航问题无关的全局重构

## 问题复盘

当前偏离主要来自两个方向：

### 1. AI 被页面化

`App.tsx` 当前仍把 `ai` 视为一级 role，并通过 `ClaudePage` 进入 `ClaudianShell`。

这意味着：

- 用户从全局工作台跳进了另一套 AI 页面
- AI 获得了自己完整的 hero、header、runtime strip、workspace 概念层
- 主应用与 AI 子系统出现双重外壳

这违背了本项目当前确认的产品定位：`dyad` 是全局 UI，不是独立 AI 页的视觉参考。

### 2. 右侧 AI 被展示化

当前 Claude/Codex workspace 中包含大量展示型内容，例如：

- 示例 session 卡片
- Runtime / Context / Behavior 说明卡
- Host / Provider / Mode pills
- Claude Workspace / Codex Workspace 自我介绍文案
- 不能直接帮助当前任务的 overview 信息块

这类内容让右侧 AI 更像“概念样机”而不是“工具面板”。

## 核心设计原则

### 1. AI 是协作能力，不是独立页面

AI 的主职责是辅助当前工作区，而不是替代当前工作区。

因此：

- AI 不拥有一级导航地位
- AI 不拥有独立页面骨架
- AI 的所有入口都应服务当前工作上下文

### 2. 全局只保留一套工作台语言

应用只保留一套工作台布局语法：

- 左栏负责导航、树、列表、结构浏览
- 中栏负责主内容、编辑、预览、操作结果
- 右栏负责协作、辅助、AI、上下文动作

任何主视图都不能再长出第二套“完整平台外壳”。

### 3. 默认展示真实能力

右侧 AI 的每个一级元素都必须能够直接支持以下至少一种行为：

- 提问
- 引用上下文
- 切换或确认运行时
- 发起执行
- 查看消息与结果
- 打开必要配置

如果一个元素只能“解释系统是什么”，而不能帮助当前任务，则不应成为默认 UI。

### 4. 规范优先于风格堆叠

统一 `dyad` 的重点不是做更重的视觉效果，而是统一：

- 布局层级
- 面板关系
- 容器尺寸
- 信息优先级
- 状态反馈

## 信息架构

### 顶层导航

移除顶部 `AI` role tab。

保留现有主视图，例如：

- `product`
- `design`
- `develop`
- `test`
- `operations`

是否保留具体命名由现有产品导航决定，但不再出现 `AI` 顶层入口。

### 全局布局

全应用统一为：

- 顶部全局 header
- 左侧主导航 / 结构导航
- 中央主内容区
- 右侧 AI 协作区

对于已经使用 `Allotment` 的桌面工作台模式，继续沿用可调节分栏，但要把 AI 右栏视为全局固定结构的一部分，而不是某个页面自带的特例。

### AI 右栏定位

右侧 AI 区成为唯一默认 AI 入口，职责是：

- 读取当前项目上下文
- 接收用户输入
- 展示 AI 消息流
- 暴露必要的引用与配置操作

它不承担：

- 平台介绍页
- provider 产品展示页
- 概念验证式 demo workspace

## 组件边界调整

### 顶层路由与页面职责

`App.tsx` 需要收敛为：

- 不再渲染 `ClaudePage`
- 不再把 `currentRole === 'ai'` 作为主内容分支
- 始终使用主工作台内容 + 右侧 AI 面板组合

### AI 外壳收敛

当前这条链路需要被收敛：

- `ClaudePage`
- `ClaudianShell`
- `ClaudianChatPage`
- `ProviderWorkspaceLayout`
- `ClaudeWorkspace`
- `CodexWorkspace`
- `ClassicWorkspace`

收敛目标不是一次性删除全部 runtime 代码，而是删除“页面化壳层”和“展示型壳层”：

- 去掉独立页面 header / hero / runtime strip / overview 区
- 去掉 provider demo sidebar
- 去掉示例 session 卡
- 去掉说明性状态卡和品牌自述

保留并复用真正可用的能力：

- `AIChat`
- 当前可用的 runtime 切换
- 配置抽屉
- 引用范围控制
- 消息流与结果渲染

### 建议的右侧 AI 结构

右侧 AI 面板应收敛成三层：

1. 顶部轻量工具条

- 当前 runtime 名称
- 必要的切换入口
- 设置入口
- 必要状态提示

2. 中部消息主视图

- 消息流
- 工具执行结果
- 错误信息
- 系统反馈

3. 底部输入与上下文条

- 输入框
- 引用文件/页面 chips
- scope / skill / context 操作
- 发送与停止

## 右侧 AI 默认保留内容

保留：

- 真实聊天会话
- 历史会话
- 引用文件/文档/页面
- scope 控制
- provider/runtime 切换
- AI 配置抽屉
- 必要错误和连接状态
- 工具执行反馈

## 右侧 AI 默认删除内容

删除以下默认 UI：

- `Claude Workspace`
- `Codex Workspace`
- `Classic AI Chat`
- `Claudian Host`
- `Host / Provider / Mode`
- `Runtime / Context / Behavior`
- 示例会话卡片
- 平台介绍文案
- 与当前任务无关的 branding pills
- 任何未落地能力对应的占位卡

这些内容若未来确有需要，应转移到文档或设置区域，而不是占据右侧默认工作面。

## 视觉与交互统一规范

### 布局规范

- 左、中、右三个面始终属于同一套外层网格
- 右栏不再拥有独立的大圆角外壳和强风格背景，避免与主工作台形成两套系统
- 各 pane 使用同一组边框、分隔线和内边距规则

### 容器规范

所有 pane、card、toolbar、drawer 使用共享 token：

- surface
- panel
- panel-alt
- border
- radius
- spacing
- shadow

AI 区可以更紧凑，但不能使用完全不同的容器语法。

### 标题规范

页面标题只描述当前任务，不描述系统自我身份。

允许：

- 当前文档名
- 当前会话名
- 当前运行状态

不鼓励默认出现：

- Workspace 名称口号
- Host 概念文案
- provider 自我介绍副标题

### 信息优先级规范

一级：

- 当前任务内容
- 当前输入与输出

二级：

- 当前上下文
- 当前状态

三级：

- 配置
- 诊断
- 扩展能力

当前 AI 区的主要问题是把大量三级信息提升到了一级，本次需要反转回来。

### 真假标准

以后新增 UI 时，每个默认展示模块都必须回答：

- 它是否有真实功能？
- 它是否帮助完成当前任务？
- 它是否比当前内容更重要？

任意一个答案是否定，就不应该进入默认面板。

## 数据流与状态边界

本次设计不要求统一 Claude/Codex/Classic 的底层 runtime，也不要求清空现有 store。

但要求它们的 UI 出口收敛到同一个右栏表面。

换句话说：

- 底层 runtime 可以继续分开
- 顶层展示必须统一
- provider 差异只体现为运行时选择和实际响应行为
- provider 差异不再体现为三套页面结构

## 错误处理

统一以“任务友好”的方式呈现错误：

- AI 未配置时，直接在右栏给出可操作提示
- provider 连接失败时，在聊天区域或配置抽屉中给出明确错误
- 不再用大量状态卡间接表达错误
- 错误优先告诉用户下一步怎么做，而不是展示平台概念

## 测试要求

至少补足以下验证：

- 顶部导航不再渲染 `AI` tab
- `App.tsx` 不再渲染独立 `ClaudePage`
- 右侧 AI 面板仍在桌面工作台中稳定挂载
- AI 右栏不再依赖示例 session 卡和 provider 展示文案
- `ClaudianShell` 若保留内部实现，其默认 UI 不再包含 hero / runtime strip / overview 类展示块
- 聊天主流程、配置抽屉、引用菜单仍可访问
- 现有桌面工作台布局测试继续通过

## 迁移步骤

### Phase 1: 顶层入口收敛

- 移除 `AI` 顶层导航
- 移除 `ClaudePage` 页面接入
- 确保所有主视图仍可通过右栏使用 AI

### Phase 2: 右栏 AI 去页面化

- 收掉 `ClaudianShell` 的独立页面 header、hero、runtime strip
- 去掉 provider 级示例 session 和展示卡
- 让右栏默认直接进入可用聊天界面

### Phase 3: UI 规范统一

- 对齐 AI 区与主工作台的 token、容器、标题层级、间距
- 去掉过重或孤立的视觉壳层

### Phase 4: 测试与回归

- 更新 source-level tests
- 验证桌面工作台分栏布局
- 验证 AI 基础功能未被删坏

## 与旧方向的关系

本设计明确替代以下方向中的“页面化 AI”部分：

- `docs/superpowers/specs/2026-04-26-dyad-style-claudian-platform-ai-design.md`
- `docs/superpowers/plans/2026-04-26-dedicated-claude-page.md`

保留其中仍然有效的部分：

- AI 运行时可切换
- Claude / Codex / Classic 兼容思路
- 配置与上下文能力继续存在

废弃其中不再符合当前目标的部分：

- AI 独立一级页面
- provider 各自完整 workspace 展示页
- 展示型平台说明卡和样例内容

## 最终决策

这次改造的正确方向是：

- `dyad` 作为全局 UI 规范，而不是 AI 独立页面风格
- AI 作为右侧协作面板，而不是一级产品页
- 顶层结构统一，底层 runtime 可继续分离
- 默认只展示真实能力，不展示假功能和解释型文案

一句话总结：

让 AI 回到右侧，让 `dyad` 回到全局，让界面只保留真正能工作的部分。
