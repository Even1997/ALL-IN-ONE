# GoodNight 统一技能库与多运行时同步设计

## 摘要

本设计为 GoodNight 引入一套本机优先的统一技能层，用来管理三类技能来源：

- GoodNight 官方内置技能
- GitHub 上游技能
- 用户本地已有技能

系统不直接把 `Codex CLI`、`Claude CLI` 或内置 AI 的技能目录当作权威来源，而是在 GoodNight 自己的目录中维护一份 canonical skill registry，再按目标运行时导出或同步。

第一版范围明确收敛为：

- 只做本机使用，不做账号云同步和团队共享
- 提供可视化技能面板
- 支持导入本地已有 skill
- 支持从 GitHub 安装与更新 skill
- 支持同步到 `Built-in AI`、`Codex CLI`、`Claude CLI`
- 允许不同运行时的支持能力不完全一致，但必须在 UI 中明确显示支持矩阵

## 目标

- 为 GoodNight 建立一套独立于外部 CLI 的统一技能真源
- 让用户可以在可视化面板中浏览、导入、安装、启用、同步、更新技能
- 支持把用户本机已有的 `Codex` / `Claude` 技能纳入 GoodNight 管理
- 让 GoodNight 内置 AI、`Codex CLI`、`Claude CLI` 可以复用同一份技能语义，而不是分别维护三套逻辑
- 为知识库、草图、设计、交付等不同工作区建立清晰的 AI 边界与输出格式契约
- 允许 GoodNight 后续新增官方内置技能，并通过技能目录机制更新给用户

## 非目标

- 不做云端账号同步
- 不做团队级共享技能仓库
- 不追求所有 skill 在 `Built-in AI`、`Codex CLI`、`Claude CLI` 上 100% 等价
- 不自动接管用户本机所有技能目录
- 不在第一版构建完整插件生态、权限市场或在线执行沙箱
- 不把所有外部 skill 直接视为 GoodNight 内置技能

## 核心原则

### Canonical First

GoodNight 必须维护自己的 canonical skill 包格式。外部技能只能作为来源，不应直接成为系统真源。

### Installed != Activated

技能已安装到本机不等于每次对话都注入 prompt。只有显式启用或被路由命中时，系统才按需加载对应 skill 内容，避免 token 爆炸。

### Import != Enable != Sync

导入、启用、同步是三个独立动作：

- `Import`：纳入 GoodNight 管理
- `Enable`：允许内置 AI 使用
- `Sync`：导出到 `Codex CLI` 或 `Claude CLI`

### Zone Contracts Over Global Rigidity

GoodNight 不应使用单一全局边界约束所有对话。知识库应保持开放；草图、设计、交付应使用更强的输入输出格式约束。

## 统一架构

统一技能层由五部分组成：

### 1. Skill Sources

技能来源层，负责发现与拉取：

- GoodNight 官方目录
- GitHub repo/path
- 用户手动导入的本地目录
- 已知运行时目录中的已有 skill

### 2. Canonical Registry

GoodNight 的技能注册表，是唯一真源。每个导入 skill 都会被规范化为 canonical package，并写入统一索引。

### 3. Runtime Adapters

把 canonical skill 转成目标运行时可消费的格式：

- `built-in adapter`
- `codex adapter`
- `claude adapter`

### 4. Installation State

记录技能在本机的真实状态，而不是临时扫描后猜测：

- 是否已发现
- 是否已导入
- 是否已审核
- 是否已启用给 built-in
- 是否已同步到 codex
- 是否已同步到 claude
- 当前版本与上游版本
- 是否有更新

### 5. Activation Layer

聊天运行时只加载当前需要的 skill 内容：

- 默认只读取 skill 摘要和 manifest
- 命中 skill 后再读取 prompt、模板、样例
- 不全量注入所有 `SKILL.md`、examples、assets

## 目录设计

### 用户级目录

GoodNight 新增自己的用户级目录，作为统一技能层主目录：

```text
C:\Users\Even\.goodnight\
  skills\
    registry.json
    sources.json
    packages\
      goodnight-boundary\
      goodnight-workspace-context\
      research-synthesizer\
  runtimes\
    built-in\
    codex\
    claude\
  cache\
    github\
    imports\
  logs\
```

目录职责：

- `skills/packages/*`
  canonical skill 包，唯一真源
- `runtimes/built-in`
  导出给 GoodNight 内置 AI 的运行时结果
- `runtimes/codex`
  导出给 Codex 的适配结果
- `runtimes/claude`
  导出给 Claude 的适配结果
- `cache/*`
  临时缓存 GitHub 下载与导入扫描

### 项目级目录

项目目录只存偏好与锁定信息，不存完整技能包：

```text
<project>\.goodnight\
  skills.lock.json
  skills.preferences.json
  zones\
    knowledge.json
    sketch.json
    design.json
    delivery.json
```

项目级目录职责：

- 记录当前项目默认启用哪些 skill
- 记录技能版本锁定
- 记录 zone 级边界覆盖

## 当前已知相关目录

当前环境中已存在的相关目录包括：

- 项目内 Claude skills：`C:\Users\Even\Documents\ALL-IN-ONE\.claude\skills`
- 项目内 Codex 相关：`C:\Users\Even\Documents\ALL-IN-ONE\.codex\agents`
- 项目内 superpowers：`C:\Users\Even\Documents\ALL-IN-ONE\.superpowers\brainstorm`
- 用户级 Codex skills：`C:\Users\Even\.codex\skills`

第一版应把这些目录视为可发现来源，而不是 GoodNight 的权威技能目录。

## Canonical Skill 数据模型

每个 canonical skill 至少包含以下字段：

```json
{
  "id": "goodnight-boundary",
  "name": "GoodNight Boundary",
  "version": "1.0.0",
  "category": "system",
  "source": {
    "type": "built-in",
    "upstream": null
  },
  "zones": ["global", "knowledge", "sketch", "design"],
  "capabilities": ["prompt"],
  "entry": {
    "prompt": "prompt.md"
  },
  "support": {
    "built-in": "full",
    "codex": "partial",
    "claude": "partial"
  },
  "install": {
    "visibleByDefault": true,
    "enabledByDefault": true,
    "syncTargets": ["built-in"]
  },
  "reviewStatus": "reviewed",
  "riskFlags": []
}
```

补充字段约定：

- `source.type`
  `built-in | github | local-import`
- `source.upstream`
  repo、path、ref、commit 等上游信息
- `reviewStatus`
  `raw | normalized | reviewed | builtin-candidate`
- `riskFlags`
  `writes-files`、`shell`、`network`、`external-dependency` 等

## 可视化技能面板

技能管理不应藏在聊天设置里，而应有独立的 `Skills` 面板。

### 面板结构

- `Library`
  展示官方推荐技能、GitHub 技能、本地可导入技能
- `Installed`
  展示已导入到 GoodNight 的 canonical skills
- `Runtime Sync`
  展示 `Built-in / Codex / Claude` 同步状态
- `Review Queue`
  展示待审核、待升级为内置候选的技能

### 技能卡信息

每张技能卡至少显示：

- 名称
- 描述
- 来源
- 版本
- 作者或组织
- `Built-in / Codex / Claude` 支持矩阵
- 是否为官方推荐
- 是否需要审核
- 是否有更新
- 是否包含高风险能力

### 技能卡动作

- `Import`
- `Enable for Built-in`
- `Sync to Codex`
- `Sync to Claude`
- `Check Updates`
- `Review`

## 动作模型

### Import

把 skill 纳入 GoodNight 管理，但不直接改动目标 runtime。

支持来源：

- 本地目录导入
- `C:\Users\Even\.codex\skills\*`
- 项目内 `.claude\skills\*`
- GitHub repo/path

导入后系统应：

- 读取 `SKILL.md`、manifest、资源文件
- 生成 canonical package
- 写入 `registry.json`
- 生成初始 support matrix
- 标记 `reviewStatus`

### Enable

允许 GoodNight built-in AI 使用该 skill。

分两种状态：

- `Visible`
  在技能库中可见、可搜索、可查看
- `Active for Built-in`
  内置 AI 可以在路由中使用

### Sync

把 canonical skill 导出到指定运行时。

支持：

- `Sync to Codex`
- `Sync to Claude`

同步规则：

- 只做单向导出
- 目标目录已存在同名 skill 时显示冲突
- 不默认覆盖用户手动修改

### Update

只对存在上游来源的 skill 启用。

更新流程：

- 检查 GitHub 或官方 catalog 上游版本
- 下载到 cache
- 重新 normalize 为 canonical skill
- 比较 prompt、资源、支持矩阵变化
- 用户确认后覆盖当前版本
- 决定是否重新同步到 Codex 与 Claude

## 本地已有技能导入策略

第一版不自动全盘接管本地已有 skill，而是：

- 扫描已知目录
- 展示为 `discovered`
- 由用户手动点击 `Import into GoodNight`

这样可以避免：

- 误接管用户私人技能
- 误覆盖用户对 `Codex` 或 `Claude` 的手工配置
- 把未经审核的外部技能直接暴露给 built-in AI

## 多运行时支持策略

同一 skill 不要求三端完全一致，而是通过 support matrix 明确声明：

- `full`
- `partial`
- `unsupported`

推荐策略：

- Built-in AI 直接消费 canonical package
- Codex 通过 codex adapter 导出
- Claude 通过 claude adapter 导出

如果某个运行时不支持 skill 所需能力，应明确显示为部分支持或不支持，而不是静默失败。

## 分区边界与格式契约

GoodNight 的 AI 边界分为三层：

### 1. Global Contract

全局最小约束：

- GoodNight 不是通用操作系统代理
- 默认尊重当前项目目录和本机配置
- 不隐式执行高风险写入
- 保持统一语言、确认、引用规则

### 2. Zone Contract

按工作区覆盖：

- `Knowledge Zone`
  最开放，允许泛知识问答，不强制进入产品工作流
- `Sketch Zone`
  强约束输入输出格式，结果必须满足草图 schema
- `Design Zone`
  强约束设计任务类型、结构化输出、交互说明字段
- `Delivery Zone`
  强约束路径、交付格式、确认节点

### 3. Skill Contract

每个 skill 在所属 zone 下进一步定义自己的输出格式与行为边界。

## 官方内置技能策略

内置技能分两类：

### 基础系统技能

这些技能属于 GoodNight 基础设施，应随应用发版：

- `goodnight-boundary`
- `goodnight-workspace-context`
- `goodnight-safety-guard`
- `goodnight-handoff-router`

### 产品化通用技能

这些技能适合以内置推荐或可启用方式出现：

- `knowledge-organizer`
- `product-spec-writer`
- `feature-breakdown`
- `ui-critic`
- `implementation-planner`
- `research-synthesizer`

## 外部技能纳入内置的建议

适合优先参考、改写或内置的方向：

- `superpowers` 的流程型能力
- `andrej-karpathy-skills` 的行为约束与工作方式
- `llm-wiki` 的轻量研究整合能力

适合先作为可导入或可见来源，但不建议第一版直接内置运行：

- `gstack`
- `ui-ux-pro`
- `gbrain`
- `claude-mem`

原则是：

- 行为准则型与方法论型 skill 更适合内置
- 强依赖外部脚本、子系统或长期状态的 skill 不适合直接内置

## 官方技能发布与更新

GoodNight 官方技能不应只依赖应用整包升级，也不应完全无约束热更新。建议使用混合模式：

### 随应用内置

系统底座技能随应用安装包一起发，保证离线可用与版本确定。

### 官方技能目录

维护一份官方 skill catalog，记录：

- `id`
- `name`
- `version`
- `channel`
- `description`
- `downloadUrl`
- `minAppVersion`
- `supportMatrix`
- `visibleByDefault`
- `enabledByDefault`
- `releaseNotes`

### 用户端更新流程

- 应用启动后静默检查一次
- 打开 `Skills` 面板时检查一次
- 用户可手动点刷新

显示结果：

- 新 skill：`可安装`
- 已安装 skill 有新版本：`可更新`
- 客户端版本过低：`不兼容，需要升级应用`

### 更新策略

- 强绑定系统底座的 skill 跟应用版本走，不热更新
- 普通官方 skill 允许在线更新
- 实验性官方 skill 默认仅可见，不默认启用

## 状态机

第一版技能状态建议保持简单：

- `discovered`
- `imported`
- `reviewed`
- `enabled`
- `synced`
- `update-available`
- `conflict`

## 验收标准

- 用户可以在独立 `Skills` 面板中看到技能库，而不是只能通过目录手工管理
- 用户可以把本机已有 `Codex` 或 `Claude` skill 导入 GoodNight
- 用户可以从 GitHub 安装 skill 并在本机更新
- 用户可以明确看到每个 skill 对 `Built-in / Codex / Claude` 的支持矩阵
- built-in AI 不会默认加载所有本地 skill 内容
- 知识库工作区保持开放对话体验
- 草图与设计工作区具备明确的格式契约和输出规范
- GoodNight 可以新增官方 skill 并通过目录机制分发给用户

## 推荐实施顺序

### Phase 1

- 建立 `C:\Users\Even\.goodnight` 用户级目录
- 建立 canonical skill 数据模型
- 实现本地目录扫描与手动导入
- 实现技能面板基础 UI

### Phase 2

- 实现 built-in adapter
- 实现 codex / claude 同步
- 实现 support matrix 与冲突处理

### Phase 3

- 实现 GitHub 安装与更新
- 实现官方 skill catalog
- 实现内置技能发布与升级流程

## 结论

GoodNight 的技能体系应以自身 canonical registry 为中心，而不是以某个外部 CLI 的目录结构为中心。系统需要同时做到三件事：

- 对用户可见，可管理，可更新
- 对内置 AI 有统一边界与格式契约
- 对 `Codex CLI`、`Claude CLI` 提供稳定的同步与适配能力

第一版先做本机统一技能层，是复杂度和长期收益之间最合理的切入点。
