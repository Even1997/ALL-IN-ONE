# 技能模块

## 模块目标

`技能` 负责统一管理平台可发现、可导入、可预览、可删除的技能资产，并明确哪些技能已进入 GoodNight 全局库、哪些还只是外部来源。

这部分需要优先对齐当前 `SkillDiscoveryEntry` 数据结构。

## 范围边界

`技能` 负责：

- 技能发现
- 分类与筛选
- 本地 / GitHub 导入
- 详情与 SKILL.md 预览
- 删除与同步状态展示

`技能` 不负责：

- MCP Server 配置，归 `MCP 服务器`
- AI Provider 配置，归 `AI`
- Chat 运行时技能调用结果展示

## 子分组

1. 技能列表
2. 分类与筛选
3. 导入
4. 详情与预览
5. 库管理与同步

## 字段总表

| 字段 | 名称 | 类型 | 作用域 | 默认值 / 候选 | 当前状态 | 来源 | 控件 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `skills[]` | 技能发现结果集合 | `SkillDiscoveryEntry[]` | 全局技能库视图 | 运行时扫描结果 | 已存在 | `src/modules/ai/skills/skillLibrary.ts` | 列表 | 设置页主数据源。 |
| `id` | 技能 ID | `string` | 单个技能 | 由技能定义提供 | 已存在 | `SkillDiscoveryEntry.id` | 只读信息 | 用于命令触发与唯一标识。 |
| `name` | 技能名称 | `string` | 单个技能 | 由技能定义提供 | 已存在 | `SkillDiscoveryEntry.name` | 只读信息 | 用于列表展示。 |
| `category` | 技能分类 | `string` | 单个技能 | 当前已见 `system` 等 | 已存在 | `SkillDiscoveryEntry.category` | Badge / Filter | 决定系统技能、推荐技能、个人技能的分区逻辑。 |
| `source` | 技能来源 | `string` | 单个技能 | 如 `GoodNight system`、`GoodNight recommended`、本地来源 | 已存在 | `SkillDiscoveryEntry.source` | Badge / Filter | 是推荐、系统还是外部导入的重要依据。 |
| `path` | 技能根路径 | `string` | 单个技能 | 扫描结果 | 已存在 | `SkillDiscoveryEntry.path` | 只读信息 | 支持定位本地目录或虚拟内置路径。 |
| `manifestPath` | 清单路径 | `string` | 单个技能 | 扫描结果 | 已存在 | `SkillDiscoveryEntry.manifestPath` | 只读信息 | 用于推导 `SKILL.md` 路径。 |
| `imported` | 是否已导入全局库 | `boolean` | 单个技能 | 由扫描结果决定 | 已存在 | `SkillDiscoveryEntry.imported` | Badge / 状态文案 | 区分“可导入”与“已安装”。 |
| `builtin` | 是否内置技能 | `boolean` | 单个技能 | 内置技能为 `true` | 已存在 | `SkillDiscoveryEntry.builtin` | Badge | 内置技能默认存在，不可删除。 |
| `deletable` | 是否可删除 | `boolean` | 单个技能 | 由来源与内置状态决定 | 已存在 | `SkillDiscoveryEntry.deletable` | 危险按钮显隐 | 系统技能不可删除。 |
| `syncedToCodex` | 是否同步到 Codex | `boolean` | 单个技能 | 内置系统技能当前为 `true` | 已存在 | `SkillDiscoveryEntry.syncedToCodex` | 状态徽标 | 用于说明技能是否已同步到目标运行环境。 |
| `syncedToClaude` | 是否同步到 Claude | `boolean` | 单个技能 | 内置系统技能当前为 `true` | 已存在 | `SkillDiscoveryEntry.syncedToClaude` | 状态徽标 | 与上同。 |
| `searchQuery` | 搜索词 | `string` | 页面视图态 | 空字符串 | 已存在 | `GNAgentSkillsPage.tsx` | Search Input | 按名称、ID、来源、路径过滤。 |
| `activeFilter` | 当前筛选器 | `string` enum | 页面视图态 | 默认 `all`；`all / recommended / system / personal` | 已存在 | `GNAgentSkillsPage.tsx` | Tabs / Segmented | 控制列表分组与空态文案。 |
| `selectedSkillKey` | 当前选中技能 | `string \| null` | 页面视图态 | `null` | 已存在 | `GNAgentSkillsPage.tsx` | 列表选中态 | 由 `source:id:path` 组合而成。 |
| `promptContent` | SKILL.md 正文 | `string` | 页面详情态 | 空字符串 | 已存在 | `readSkillFile()` | 预览面板 | 用于详情预览与弹窗全览。 |
| `sourcePath` | 本地导入源路径 | `string` | 导入动作载荷 | 无默认值 | 已存在 | `importLocalSkill()` | 文件 / 目录选择器 | 本地导入时提交给桌面运行时。 |
| `repo` | GitHub 仓库 | `string` | 导入动作载荷 | 无默认值 | 已存在 | `importGitHubSkill()` | Input | 例如 `owner/repo`。 |
| `path`（导入参数） | GitHub 子路径 | `string` | 导入动作载荷 | 无默认值 | 已存在 | `GitHubSkillImportParams.path` | Input | 仓库内技能目录。 |
| `gitRef` | Git 引用 | `string \| undefined` | 导入动作载荷 | 可为空 | 已存在 | `GitHubSkillImportParams.gitRef` | Input | 分支、tag 或 commit。 |
| `version` | 技能版本 | `string \| undefined` | 单个技能详情 | 前置于 frontmatter | 部分存在 | `parseSkillMarkdown()` / runtime skill 定义 | 只读信息 | 当前发现结果未显式展示，后续可增强。 |
| `conflictGroup` | 冲突分组 | `string \| null` | 单个技能诊断 | 默认 `null` | 新增 | 新索引规则 | 只读诊断 | 用于识别同名或同 token 技能冲突。 |
| `conflictReason` | 冲突原因 | `string \| null` | 单个技能诊断 | 默认 `null` | 新增 | 新索引规则 | 只读诊断 | 说明为什么冲突、谁覆盖了谁。 |

## 关键行为补充

- `imported`、`builtin`、`deletable` 是三个不同维度，不能混成一个“已安装”状态。
- 当前页面已经有 `syncedToCodex`、`syncedToClaude` 对应的数据位，文档里需要保留，后续 UI 可决定先不展示或只做只读状态。
- 推荐技能和系统技能的分组逻辑当前并不完全来自 `category`，还依赖 `source`。
- 导入参数中的 `path` 与技能发现结果中的 `path` 语义不同，开发时要避免同名混淆。
- `version`、冲突提示更适合作为只读诊断信息，而不是核心编辑字段。

## 功能清单

1. 技能列表：展示可发现技能、来源、分类、安装状态和同步状态。
2. 分类与搜索：支持推荐、系统、个人、全部等筛选，以及名称 / ID / 路径搜索。
3. 导入：支持本地导入、GitHub 导入和对推荐技能的一键导入。
4. 详情与预览：支持查看元信息、读取 `SKILL.md`、弹窗全览。
5. 库管理：支持删除可删除技能、刷新技能索引，并为后续冲突提示留接口。

## 关联代码

- `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
- `src/modules/ai/skills/skillLibrary.ts`
- `src/modules/ai/skills/parseSkillMarkdown.ts`

## 当前建议优先级

- P0：`skills[]`、`searchQuery`、`activeFilter`、本地 / GitHub 导入、`promptContent` 预览、删除
- P1：`syncedToCodex`、`syncedToClaude`、`version`、显式刷新入口
- P2：`conflictGroup`、`conflictReason`
