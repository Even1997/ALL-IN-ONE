# 外观模块

## 模块目标

`外观` 负责管理视觉表现、阅读密度、布局记忆和 AI 内容的显示偏好。

这部分需要明确哪些是已经真实持久化的外观字段，哪些还只是运行态状态或规划字段。

## 范围边界

`外观` 负责：

- 主题
- 布局与面板记忆
- 阅读密度与字号
- 动画偏好
- AI 时间线显示偏好

`外观` 不负责：

- 应用语言，归 `常规`
- 存储路径，归 `存储`
- AI Provider 配置，归 `AI`

## 子分组

1. 主题
2. 布局
3. 阅读
4. 动画
5. AI 展示

## 字段总表

| 字段 | 名称 | 类型 | 作用域 | 默认值 / 候选 | 当前状态 | 来源 | 控件 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `themeMode` | 主题模式 | `string` enum | 全局 | 当前默认 `light`；已支持 `light / dark` | 部分存在 | `src/App.tsx`，`goodnight-theme-mode` | Segmented | 切换后立即生效；后续可补 `system`。 |
| `appStyle` | 整体 UI 风格 | `string` enum | 全局 | 当前固定 `workbench` | 部分存在 | `src/appTheme.ts`，`goodnight-app-style` | Select | 现阶段只有一个合法值，但字段已存在。 |
| `desktopAiPaneWidth` | AI 面板宽度 | `number` | 全局布局偏好 | 默认 `360`，范围 `280-560` | 已存在 | `src/App.tsx`、`layoutPreferences.ts` | Slider / Number Input | 记忆桌面 AI 伴随面板宽度。 |
| `desktopAiPaneCollapsedByDefault` | AI 面板默认折叠 | `boolean` | 全局布局偏好 | 建议默认 `false` | 部分存在 | 当前只有运行态 `isDesktopAiCollapsed` | Switch | 需要从运行态提升为用户偏好。 |
| `uiDensity` | 界面密度 | `string` enum | 全局 | 建议默认 `standard`；`compact / standard` | 新增 | 新设置模型 | Segmented | 控制列表、表单、卡片间距。 |
| `defaultSidebarState` | 左侧栏默认状态 | `string` enum | 全局 | 建议默认 `expanded` | 新增 | 新设置模型 | Segmented | 控制工作区进入时侧栏默认展开或收起。 |
| `readingWidth` | 阅读宽度 | `string` enum | 全局 | 建议默认 `standard`；`narrow / standard / wide` | 新增 | 新设置模型 | Segmented | 面向 note surface、长文、设置说明区域。 |
| `fontSize` | 默认字号 | `string` / `number` | 全局 | 建议默认 `medium` | 新增 | 新设置模型 | Select | 可做成语义档位，也可做成数值。 |
| `animationsEnabled` | 动画开关 | `boolean` | 全局 | 建议默认 `true` | 新增 | 新设置模型 | Switch | 控制过渡动画是否启用。 |
| `reducedMotion` | 低动态偏好 | `string` enum | 全局 | 建议默认 `follow-system` | 新增 | 新设置模型 | Select | `follow-system / on / off`。 |
| `timelineDensity` | AI 时间线密度 | `string` enum | 全局 AI 展示偏好 | 建议默认 `standard` | 新增 | 新设置模型 | Segmented | 决定 thinking / tool / final 卡片的紧凑程度。 |
| `showThinkingByDefault` | 默认展开 Thinking | `boolean` | 全局 AI 展示偏好 | 建议默认 `false` | 新增 | 新设置模型 | Switch | 符合“thinking 是过程信息”的产品边界。 |
| `showToolCardsByDefault` | 默认显示工具卡片 | `boolean` | 全局 AI 展示偏好 | 建议默认 `true` | 新增 | 新设置模型 | Switch | 决定工具执行信息默认是否可见。 |
| `showFinalAnswerExpandedByDefault` | 默认展开 Final | `boolean` | 全局 AI 展示偏好 | 建议默认 `true` | 新增 | 新设置模型 | Switch | `final` 应保持主可读面。 |

## 关键行为补充

- `themeMode` 和 `appStyle` 都已经有持久化键，但含义不同：前者是明暗模式，后者是整体视觉体系。
- `desktopAiPaneWidth` 是现有最明确的布局偏好字段，应优先按真实默认值和边界落文档。
- `desktopAiPaneCollapsedByDefault` 目前并未持久化为用户设置，文档里要明确这是“部分存在”。
- `showThinkingByDefault`、`showToolCardsByDefault`、`showFinalAnswerExpandedByDefault` 要遵守项目的 AI 输出边界，不要反向修改 runtime 语义。
- 若未来引入 `system` 主题，需要保证 light / dark / system 共享同一层级结构而不是做三套 UI。

## 功能清单

1. 主题：切换明暗模式，并保留后续接入系统主题的能力。
2. 布局：记忆 AI 面板宽度，并补充面板默认折叠等缺失偏好。
3. 阅读：提供阅读宽度、字号、界面密度等基础阅读控制。
4. 动画：支持总开关和 reduced motion 偏好。
5. AI 展示：控制时间线密度，以及 Thinking / Tool / Final 的默认可见性。
6. App Style：保留当前 `workbench` 风格字段，为后续风格扩展留位。

## 关联代码

- `src/App.tsx`
- `src/appTheme.ts`
- `src/utils/layoutPreferences.ts`

## 当前建议优先级

- P0：`themeMode`、`desktopAiPaneWidth`、`readingWidth`、`timelineDensity`
- P1：`desktopAiPaneCollapsedByDefault`、`uiDensity`、`fontSize`、`animationsEnabled`、`reducedMotion`
- P2：`appStyle`、Thinking / Tool / Final 展示偏好
