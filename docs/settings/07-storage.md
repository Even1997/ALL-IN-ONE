# 存储模块

## 模块目标

`存储` 负责统一管理项目落盘位置、默认项目根目录、索引与附件路径，以及后续的数据维护动作。

这部分必须优先贴近现有 `ProjectStorageSettings` 和 Tauri 命令，避免产品文案与真实字段脱节。

## 范围边界

`存储` 负责：

- 项目存储目录
- 项目目录解析
- 知识 / requirements / 索引路径入口
- 缓存与附件目录
- 清理、重建、备份

`存储` 不负责：

- AI 配置内容，归 `AI`
- 权限与沙箱，归 `权限`
- 调试开关，归 `高级`

## 子分组

1. 项目目录
2. 知识与索引
3. 缓存与附件
4. 数据维护

## 字段总表

| 字段 | 名称 | 类型 | 作用域 | 默认值 / 候选 | 当前状态 | 来源 | 控件 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `rootPath` | 当前项目存储根目录 | `string` | 全局存储设置 | 默认指向系统 `Documents/GoodNight/projects` | 已存在 | `ProjectStorageSettings.rootPath` | 路径选择器 | 当前真实生效的项目根目录。 |
| `defaultPath` | 默认项目存储根目录 | `string` | 只读全局 | 系统 `Documents/GoodNight/projects` | 已存在 | `get_default_projects_root_path()` | 只读信息 | 用于对比当前是否已自定义覆盖。 |
| `isDefault` | 是否使用默认根目录 | `boolean` | 全局存储设置 | 根据 `rootPath === defaultPath` 推导 | 已存在 | `ProjectStorageSettings.isDefault` | Badge / 说明文字 | 决定是否显示“已自定义”状态和重置入口。 |
| `projectStorageRoot` | 项目存储位置概念名 | `string` | 产品语义层 | 对应 `rootPath` | 部分存在 | UI 文案映射 | 路径选择器 | 建议在实现中统一收敛到 `rootPath`，避免双字段。 |
| `projectId` | 项目 ID | `string` | 单个项目 | 无默认值 | 已存在 | `get_project_dir(projectId)` | 隐藏 / 只读 | 用于解析具体项目目录。 |
| `projectDir` | 项目实际目录 | `string` | 单个项目 | 由运行时创建并返回 | 已存在 | `get_project_dir()` | 只读信息 | 实际落盘路径。 |
| `requirementsDir` | Requirements 目录 | `string` | 单个项目 | `<projectDir>/requirements` | 部分存在 | `get_requirements_dir()` | 只读信息 / 跳转入口 | 当前已有命令级支持，尚未形成显式设置面板。 |
| `knowledgeIndexRoot` | 知识 / 索引根目录 | `string` | 全局或项目级 | 待定 | 新增 | 新设置模型 / 后续索引服务 | 路径显示 / 跳转入口 | 用于整理知识索引、图谱、缓存映射等目录。 |
| `attachmentsPath` | 附件目录 | `string` | 全局或项目级 | 待定 | 新增 | 新设置模型 | 路径选择器 | 导入文件、素材、附件的默认落点。 |
| `downloadsPath` | 下载目录 | `string` | 全局 | 待定 | 新增 | 新设置模型 | 路径选择器 | 外部下载物的统一保存位置。 |
| `cacheRoot` | 缓存目录 | `string` | 全局 | 待定 | 新增 | 新设置模型 / Tauri app data | 只读信息 / 路径跳转 | 管理缓存和临时文件的根位置。 |
| `clearCacheScope` | 清理缓存范围 | `string` enum / `string[]` | 维护动作载荷 | 待定 | 新增 | 新维护命令 | Action Select | 定义清理哪些缓存。 |
| `rebuildIndexScope` | 重建索引范围 | `string` enum / `string[]` | 维护动作载荷 | 待定 | 新增 | 新维护命令 | Action Select | 决定重建项目索引、知识索引还是全部。 |
| `projectsSize` | 项目数据占用 | `number` | 只读统计 | 运行时计算 | 新增 | 新统计命令 | 只读信息 | 用于显示项目目录占用。 |
| `cacheSize` | 缓存占用 | `number` | 只读统计 | 运行时计算 | 新增 | 新统计命令 | 只读信息 | 用于显示缓存体积。 |
| `attachmentsSize` | 附件占用 | `number` | 只读统计 | 运行时计算 | 新增 | 新统计命令 | 只读信息 | 用于显示素材 / 附件体积。 |
| `indexSize` | 索引占用 | `number` | 只读统计 | 运行时计算 | 新增 | 新统计命令 | 只读信息 | 用于显示索引体积。 |
| `settingsBackupPath` | 设置备份路径 | `string` | 维护动作载荷 | 无默认值 | 新增 | 新导出 / 恢复命令 | 路径选择器 | 导出本地设置与项目级设置的目标路径。 |

## 关键行为补充

- 当前真实持久化对象是 `ProjectStorageSettings`，字段只有 `rootPath`、`defaultPath`、`isDefault`。
- 产品文案里的“项目存储位置”建议不要再单独引入 `projectStorageRoot` 新字段，避免和 `rootPath` 重复。
- `rootPath` 只有在与默认路径不同的时候才会写入配置文件；恢复默认会直接清空覆盖文件。
- `defaultPath` 当前明确来自系统文档目录下的 `GoodNight/projects`。
- 路径型字段要统一使用绝对路径，并继续沿用现有的 Windows 路径规范化逻辑。

## 功能清单

1. 项目根目录：查看当前项目存储根目录、切换目录、重置回默认目录。
2. 项目目录解析：查看单个项目的真实落盘路径和 requirements 目录。
3. 索引与知识入口：为后续 requirements、知识索引、缓存映射提供显式入口。
4. 缓存与附件：补充缓存目录、附件目录、下载目录等路径配置。
5. 数据维护：支持清理缓存、重建索引、占用统计、设置备份与恢复。

## 当前已存在字段与能力

当前平台已经明确存在：

- `get_project_storage_settings`
- `set_project_storage_root`
- `reset_project_storage_root`
- `get_project_dir`
- `get_requirements_dir`

相关来源：

- `src-tauri/src/lib.rs`
- `src/utils/projectPersistence.ts`
- `tests/project-storage-settings.test.mjs`

## 关联代码

- `src/utils/projectPersistence.ts`
- `src/components/project/ProjectSetup.tsx`
- `src-tauri/src/lib.rs`

## 当前建议优先级

- P0：`rootPath`、`defaultPath`、`isDefault`、`projectDir`
- P1：`requirementsDir`、`knowledgeIndexRoot`、`cacheRoot`、`clearCacheScope`、`rebuildIndexScope`
- P2：占用统计、`attachmentsPath`、`downloadsPath`、`settingsBackupPath`
