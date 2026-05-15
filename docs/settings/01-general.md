# 常规模块

## 模块目标

`常规` 承载最基础、最容易被用户理解的全局偏好，重点解决“应用用什么语言、启动到哪里、更新怎么走、版本信息在哪里看”这类问题。

它不承载 AI Provider、运行权限、存储路径、实验功能等专业设置。

## 范围边界

`常规` 负责：

- 语言
- 启动行为
- 更新行为
- 新窗口默认行为
- 关于与版本信息

`常规` 不负责：

- 主题、布局、时间线显示，归 `外观`
- AI 配置，归 `AI`
- Runtime 权限与审批，归 `权限`
- 本地路径与缓存，归 `存储`
- Shell / 诊断 / 实验开关，归 `高级`

## 子分组

1. 语言
2. 启动
3. 更新
4. 窗口与基础行为
5. 关于

## 字段总表

| 字段 | 名称 | 类型 | 作用域 | 默认值 / 候选 | 当前状态 | 来源 | 控件 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `uiLanguage` | 应用语言 | `string` enum | 全局 | `system` / `zh-CN` / `en-US` | 新增 | 新设置模型，前端 i18n 层 | Select | 单一语言入口；选择 `system` 时自动跟随系统语言，选择显式值时立即使用该语言。 |
| `startupPage` | 启动页 | `string` enum | 全局 | 建议默认 `last-opened` | 部分存在 | `src/App.tsx` 的角色页切换能力 | Select | 启动后优先进入的一级工作区。 |
| `restoreLastSessionOnLaunch` | 启动时恢复上次会话 | `boolean` | 全局 | 建议默认 `true` | 新增 | 新设置模型 | Switch | 恢复最近项目、最近视图、最近上下文；和 `权限` 模块的 runtime 自动恢复不同层。 |
| `openRecentWorkspaceOnLaunch` | 优先打开最近工作区 | `boolean` | 全局 | 建议默认 `true` | 新增 | 新设置模型 | Switch | 与 `startupPage` 联动；最近工作区缺失时回退到安全页。 |
| `autoUpdateEnabled` | 自动检查更新 | `boolean` | 全局 | 建议默认 `true` | 新增 | Tauri 更新层待接入 | Switch | 关闭后仍保留“手动检查更新”。 |
| `updateChannel` | 更新通道 | `string` enum | 全局 | 建议默认 `stable` | 新增 | Tauri 更新层待接入 | Segmented / Select | `stable` 与 `preview`；切换时需告知风险。 |
| `newWindowBehavior` | 新窗口默认行为 | `string` enum | 全局 | 建议默认 `project-picker` | 新增 | 新设置模型 | Select | 新开窗口时默认进入项目选择器、最近项目或空白页。 |
| `appVersion` | 应用版本 | `string` | 只读全局 | 运行时注入 | 部分存在 | Tauri / 包信息 / About 入口 | 只读信息 | 用于版本展示与问题排查。 |
| `buildChannel` | 构建通道 | `string` | 只读全局 | 运行时注入 | 部分存在 | 构建元信息 | 只读信息 | 区分 stable / preview / dev 等发行形态。 |
| `runtimeInfo` | 运行环境信息 | `object` / `string` | 只读全局 | 运行时注入 | 部分存在 | Tauri / 前端环境探测 | 只读信息 | 展示平台、架构、桌面运行时等基础信息。 |

## 关键行为补充

- `uiLanguage` 是唯一的语言入口，不再额外拆出“跟随系统语言”开关，避免同一意图出现双重控制。
- `restoreLastSessionOnLaunch` 属于产品层恢复；`autoResumeOnLaunch` 属于 agent runtime 恢复，后者仍放在 `权限`。
- `startupPage` 若指向不存在或无权限页面，必须安全回退，不能卡启动。
- `updateChannel` 需要配套清晰文案，避免用户误以为只是“速度更快”。
- `appVersion`、`buildChannel`、`runtimeInfo` 均为只读，不应混入“可编辑设置”数据流。

## 功能清单

1. 语言设置：支持显式选择中文、英文或跟随系统，并在语言包不完整时回退到默认文案。
2. 启动设置：支持定义启动页、是否恢复最近工作状态、是否优先打开最近工作区。
3. 更新设置：支持自动更新开关、更新通道切换和手动检查更新入口。
4. 新窗口行为：定义多窗口场景下的默认落点，和项目选择器逻辑保持一致。
5. 关于信息：展示版本、构建通道、运行环境，并支持复制用于反馈问题。

## 关联代码

- `src/App.tsx`
- `src/components/workspace/globalSettingsPageShared.ts`

## 当前建议优先级

- P0：`uiLanguage`、`startupPage`、`restoreLastSessionOnLaunch`
- P1：`openRecentWorkspaceOnLaunch`、`autoUpdateEnabled`、`updateChannel`、`newWindowBehavior`
- P2：`appVersion`、`buildChannel`、`runtimeInfo`
