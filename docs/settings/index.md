# 设置页模块总览

更新时间：2026-05-15

## 目的

这组文档只回答一件事：设置页每个模块到底要管什么、暴露什么字段、支持什么操作。

这里先不写开发排期，不写实现步骤，也不写任务拆分。开发计划应在这些模块文档确认后再单独编写。

## 当前产品方向

- 设置页采用 `Codex 式单主内容区`
- 左侧是短名称目录，不做右侧 companion
- `AI` 保持一级重点分组
- `Git / 环境 / 浏览器 / worktree` 这类工具域设置，第一阶段先收进 `高级`
- `语言` 明确纳入 `常规`

## 一级模块

1. [常规](./01-general.md)
2. [AI](./02-ai.md)
3. [权限](./03-permissions.md)
4. [MCP 服务](./04-mcp-servers.md)
5. [技能](./05-skills.md)
6. [外观](./06-appearance.md)
7. [存储](./07-storage.md)
8. [高级](./08-advanced.md)

## 跨模块文档

- [设置字段矩阵](./09-field-matrix.md)
- [设置页开发计划](./10-development-plan.md)
- [阶段 1 执行任务清单](./11-phase-1-task-list.md)

## 文档阅读方式

每个模块文档统一包含以下内容：

- 模块目标
- 范围边界
- 子分组
- 字段总表
- 关键行为补充
- 具体功能清单
- 当前平台状态：`已存在 / 部分存在 / 新增`
- 关联代码或现有实现入口

字段总表统一至少覆盖以下列：

- `字段`
- `名称`
- `类型`
- `作用域`
- `默认值 / 候选值`
- `当前状态`
- `来源`
- `控件`
- `说明`

## 当前代码现状摘要

这份总览只记录与设置直接相关的现状，用来帮助判断哪些是已有能力，哪些是新增能力。

- 全局设置页骨架：`src/components/workspace/GlobalSettingsPage.tsx`
- 设置 tab 定义：`src/components/workspace/globalSettingsPageShared.ts`
- AI 设置状态：`src/components/workspace/useAIChatSettingsState.ts`
- MCP 设置页：`src/components/workspace/RuntimeMcpSettingsPage.tsx`
- 技能页：`src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
- 主题与布局偏好：`src/App.tsx`、`src/utils/layoutPreferences.ts`
- 项目存储设置：`src/utils/projectPersistence.ts`、`src-tauri/src/lib.rs`
- Runtime 权限设置：`src-tauri/src/agent_runtime/settings_store.rs`
- Shell 模式与 provider 绑定：`src-tauri/src/agent_shell/settings_store.rs`

## 后续顺序建议

在这些模块文档确认后，再做下面三件事：

1. 输出一份跨模块去重后的字段总表
2. 单独写设置页开发计划
3. 在开发计划基础上继续拆阶段执行任务清单
