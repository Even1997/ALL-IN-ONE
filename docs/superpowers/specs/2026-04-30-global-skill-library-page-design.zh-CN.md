# GoodNight 全局技能页与聊天分离设计

## 结论

本次改动把技能管理从聊天窗口中拿掉，恢复聊天页为普通对话入口；技能继续通过 `@skill` 在聊天中触发；新增一个全局二级 `Skills` 页面，专门管理 GoodNight 自己的全局技能库。

技能的唯一真源放在用户级 `.goodnight` 全局目录中，而不是挂靠在 `Claude`、`Codex` 或其他运行时目录上。技能页只讨论 GoodNight 技能本身，不混入代理、运行时或同步控制。

## 用户已确认的产品约束

- 聊天窗口保持普通聊天，不内嵌技能管理面板。
- 技能在聊天中通过 `@skill` 使用，而不是切到某个“技能聊天模式”。
- 技能库是全局的，不按项目隔离。
- 技能管理放在 GN Agent 壳层里的单独二级页面。
- 技能只服务 GoodNight，本身放在用户级 `.goodnight` 全局目录中。
- 支持两类导入来源：
  - 本地上传 / GitHub 下载
  - 从外部目录导入后纳入 GoodNight 管理
- 内置技能需要显示出来，但不可删除。
- 非内置技能可以从 GoodNight 技能库删除。
- 删除只影响 GoodNight 自己的库，不删除外部原始目录。

## 范围

### 本次实现

- 从聊天页移除 `Skills` lane 和对应的嵌入式技能面板。
- 在 GN Agent 壳层中新增 `Skills` 模式与独立页面。
- 技能页展示全局技能列表，至少区分：
  - GoodNight built-in
  - GoodNight recommended
  - GoodNight personal
- 技能页提供最小可用操作：
  - 本地导入
  - GitHub 导入
  - 删除 GoodNight 中的非内置技能
- 聊天页保留 `@skill` 提示与已有 skill routing。

### 本次不做

- 不做项目级技能启用开关。
- 不做技能市场、评分、审核流程。
- 不做 `Claude / Codex` 运行时同步入口。
- 不做代理配置与技能管理的混合页面。

## 交互设计

### 1. 聊天页

- 保留现有普通聊天体验。
- 保留 `@skill` 相关提示文案。
- 不再显示技能 lane、技能卡片网格、技能快捷面板。

### 2. Skills 页面

页面分为两部分：

- 顶部操作区
  - `Import Local Skill`
  - `Download from GitHub`
  - 刷新技能列表
- 列表区
  - 每个 skill 卡片展示名称、描述、来源、安装状态、是否内置
  - 内置技能显示 `Built-in` 标记
  - 非内置且已进入 GoodNight 库的技能显示 `Delete`
  - 技能卡主层不显示任何 `Claude / Codex` 运行时动作

### 3. 分类语义

- `GoodNight built-in`
  - GoodNight 自带技能，已在全局库中
  - 可见，不可删除
- `GoodNight recommended`
  - GoodNight 官方推荐技能
  - 可以尚未安装，也可以已纳入全局库
- `GoodNight imported`
  - 已导入到 GoodNight 全局库
  - 可删除
- `External discovered`
  - 从外部目录发现，但还未纳入 GoodNight
  - 仅表示“可导入来源”，不是 GoodNight 技能真源

## 数据与命令边界

### 前端 skill entry 字段

现有 `SkillDiscoveryEntry` 扩展为足够支持页面渲染和动作门控的形状，至少包含：

- `id`
- `name`
- `source`
- `path`
- `manifestPath`
- `imported`
- `builtin`
- `deletable`

### 后端命令

保留并继续使用：

- `discover_local_skills`
- `import_local_skill`
- `import_github_skill`

新增：

- `delete_library_skill`

删除规则：

- 只允许删除 GoodNight imported 中的技能
- 内置技能删除直接报错
- 外部目录发现的技能如果未导入，不提供删除

## 实现路径

### 前端

- GN Agent shell 增加 `skills` 模式
- 新建独立 `GNAgentSkillsPage`
- `AIChat` 删除 skill lane，但保留 `@skill` 路由和提示
- 技能页主层不再展示任何 `Claude / Codex` 同步按钮

### 后端

- GoodNight 继续以 `.goodnight` 全局目录为技能真源
- discovery entry 返回 built-in / deletable 等页面所需信息
- 增加删除 GoodNight imported skill 的命令

## 验收标准

- 聊天窗口中不再出现 `Skills` lane 或内嵌技能面板。
- GN Agent 壳层里能看到单独的 `Skills` 页面入口。
- `Skills` 页面围绕 GoodNight 自己的全局技能库组织，而不是围绕外部运行时组织。
- 内置技能可见但没有删除入口。
- 非内置且已导入 GoodNight 的技能可以删除。
- 技能页主层不出现 `Claude / Codex` 运行时控制。
- 聊天输入仍保留 `@skill` 使用提示。
