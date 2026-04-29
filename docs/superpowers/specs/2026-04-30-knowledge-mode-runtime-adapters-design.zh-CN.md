# GoodNight 知识模式运行时适配设计

## 背景

当前项目已经在项目配置里提供了三种知识检索模式：

- `m-flow`
- `llmwiki`
- `rag`

但当前实现里，这三种模式并没有真正形成三套独立的运行时行为。现状更接近：

1. 项目保存了 `knowledgeRetrievalMethod`
2. 索引刷新阶段会拿到这个值
3. AI 问答阶段仍然复用统一的索引和统一的 prompt 组装方式

这会带来两个问题：

- 用户切换模式后，AI 的实际行为差异不明显，模式更像配置名而不是真实策略
- `llmwiki` 和 `m-flow` 没有形成可见、可检查、可复用的中间产物，不符合它们参考实现的核心工作方式

本设计的目标，是在尽量尊重上游模式语义的前提下，让 GoodNight 真正“按模式运行”。

## 设计原则

### 1. 模式在运行时入口直接分流

不把三种模式混在一个 prompt 里用文本规则区分。

应当在 AI 运行入口读取当前项目的 `knowledgeRetrievalMethod`，然后直接选择对应的模式运行时：

- `m-flow` -> `m-flow runtime`
- `llmwiki` -> `llmwiki runtime`
- `rag` -> `rag runtime`

每个运行时独立决定：

- 生成哪些中间产物
- 读取哪些中间产物
- 如何构造上下文
- 如何构造 prompt policy

### 2. Upstream 语义保持只读参考

参考实现尽量按原语义理解，不在 GoodNight 内部把上游模式逻辑和平台逻辑混写。

也就是说：

- 上游模式的结构、产物类型、工作方式是“参考源”
- GoodNight 负责平台适配、路径映射、产物落地、UI 入口和 AI 消费

这意味着 GoodNight 不去“重命名一个统一索引”为 `m-flow` 或 `llmwiki`，而是分别适配它们的实际工作方式。

### 3. 通用索引只做兜底层

现有 `.goodnight/base-index/*` 不删除。

它继续承担：

- 通用 source 清单
- 通用 chunk 数据
- 基础 topics / doc intents

但它不再代表某一种知识模式本身，只作为：

- 模式产物构建时的底层素材
- 某一模式产物缺失时的兜底检索来源

## 参考实现对齐

## `llmwiki`

参考来源：

- Karpathy 的 LLM Wiki 公开思路
- 社区实现 `karpathy-llm-wiki`

其核心不是“临时检索”，而是先把原始资料整理成稳定、结构化、可读、可持续积累的 wiki 页面。

因此 GoodNight 中 `llmwiki` 的核心应当是：

- ingest 后生成 `raw/`
- 在 `raw/` 基础上沉淀 `wiki/`
- AI 优先消费 `wiki/`

## `m-flow`

参考来源：

- `FlowElement-ai/m_flow`

其核心不是普通 chunk 检索，而是：

- 先定位相关入口
- 再沿 evidence path 组织上下文
- 强调“相关性优先、路径化理解”

因此 GoodNight 中 `m-flow` 的核心应当是：

- 把项目资料组织成 episode / facet / entity / path
- AI 优先消费 path 和 path 上的证据链

## `rag`

`rag` 保持最传统的 retrieval 语义：

- chunk
- rank
- cite

它的目标不是知识沉淀或路径理解，而是快速、标准化、证据优先的片段召回。

## 目录与模块边界

### 文档参考层

新增只读参考文档目录：

- `docs/upstream/llmwiki/`
- `docs/upstream/m-flow/`

它们用于保存：

- 上游模式的结构说明
- 核心术语
- 产物约定
- GoodNight 适配时必须遵守的原则

这层不参与运行时执行，只承担语义锚点作用。

### 运行时代码层

新增运行时与适配层：

- `src/modules/knowledge/runtime/`
- `src/modules/knowledge/adapters/llmwiki/`
- `src/modules/knowledge/adapters/m-flow/`
- `src/modules/knowledge/adapters/rag/`

建议职责如下：

#### `runtime/`

负责：

- 根据 `knowledgeRetrievalMethod` 选择对应模式
- 暴露统一接口给 `AIChat` 和其他入口
- 协调“构建模式产物 -> 读取模式上下文 -> 生成模式 prompt 输入”

不负责：

- 具体某一种模式的产物生成细节
- 模式专属 prompt 规则

#### `adapters/llmwiki/`

负责：

- 生成 llmwiki 可见中间产物
- 读取 llmwiki 中间产物
- 输出 llmwiki 专属上下文
- 输出 llmwiki 专属 prompt policy

#### `adapters/m-flow/`

负责：

- 生成 m-flow 可见中间产物
- 构建 path / graph / anchor 索引
- 读取 m-flow 中间产物
- 输出 m-flow 专属上下文
- 输出 m-flow 专属 prompt policy

#### `adapters/rag/`

负责：

- 生成 rag 可见说明页和 retrieval digest
- 构建 rag 检索上下文
- 输出 rag 专属 prompt policy

## 中间产物设计

### `llmwiki` 可见产物

目录：

- `_goodnight/outputs/llmwiki/raw/`
- `_goodnight/outputs/llmwiki/wiki/`
- `_goodnight/outputs/llmwiki/index.md`
- `_goodnight/outputs/llmwiki/log.md`

说明：

- `raw/` 存放从原始资料整理出的中间文稿，按主题或来源分组
- `wiki/` 存放结构化知识页，是 AI 的主消费层
- `index.md` 提供 wiki 页总索引
- `log.md` 记录本次整理输入、生成时间、覆盖范围和异常

隐藏状态目录：

- `.goodnight/skills/llmwiki/`

用于保存：

- 生成状态
- 内容指纹
- source -> raw/wiki 的映射关系

### `m-flow` 可见产物

目录：

- `_goodnight/outputs/m-flow/episodes/`
- `_goodnight/outputs/m-flow/facets/`
- `_goodnight/outputs/m-flow/entities/`
- `_goodnight/outputs/m-flow/paths/`
- `_goodnight/outputs/m-flow/index.md`

说明：

- `episodes/`：表示一段相对完整的事件、任务、流程或主题单元
- `facets/`：从 episode 中抽取出来的维度、切面、问题域
- `entities/`：关键对象、角色、系统、页面、模块、术语
- `paths/`：把“问题 -> 相关 facet -> 相关 entity -> 相关证据”串起来的可读路径文档
- `index.md`：提供 episode / facet / entity / path 的入口导航

隐藏状态目录：

- `.goodnight/skills/m-flow/`

用于保存：

- `graph.json`
- `anchors.jsonl`
- `path-index.json`
- 内容指纹与依赖关系

### `rag` 可见产物

目录：

- `_goodnight/outputs/rag/retrieval-guide.md`
- `_goodnight/outputs/rag/source-digests/`

说明：

- `retrieval-guide.md` 用于说明 rag 当前覆盖的来源、chunk 统计、更新时间
- `source-digests/` 用于保存每个来源的摘要和可引用范围，帮助用户理解 rag 正在检索什么

隐藏状态目录：

- `.goodnight/skills/rag/`

用于保存：

- rag 专属 chunks
- manifest
- fingerprint

## AI 消费策略

### `llmwiki` 运行时

问答时的上下文构造顺序：

1. 优先命中 `wiki/` 页面
2. 不足时回落到 `raw/`
3. 再不足时回落到 `.goodnight/base-index/*`

其 prompt policy 应强调：

- 优先引用结构化知识页
- 把 wiki 页视为已经整理过的稳定知识
- 允许回看 raw/source，但要尽量避免把未整理原文当成第一事实来源

### `m-flow` 运行时

问答时的上下文构造顺序：

1. 先用 query 匹配 anchors / facets / entities
2. 从图中找最相关 evidence path
3. 把 path 上的关键节点和支撑证据拼成上下文
4. 必要时再回落到 `.goodnight/base-index/*`

其 prompt policy 应强调：

- 先解释“为什么这些内容相关”
- 尽量保留路径感和因果链
- 回答时优先组织跨文档的理解，而不是只贴高分 chunk

### `rag` 运行时

问答时的上下文构造顺序：

1. 直接基于 chunk 做标准召回
2. 选取高相关片段
3. 保留明确来源和引用线索

其 prompt policy 应强调：

- 证据优先
- 简洁引用
- 不做过度结构化推理

## 运行时数据流

统一入口数据流建议为：

1. 用户在项目中切换 `knowledgeRetrievalMethod`
2. AI 入口读取当前模式
3. 运行时协调器选择对应 adapter
4. adapter 确认该模式中间产物是否需要刷新
5. 如需刷新，则生成或更新可见产物与隐藏状态
6. adapter 生成模式专属上下文
7. adapter 生成模式专属 policy
8. AI 只拿当前模式的上下文和 policy 进行回答

这里最关键的是第 8 步：

AI 不能再收到“混合三种模式的信息”，而只能收到当前模式应当看到的上下文。

## UI 与用户感知

当前项目里已经存在模式切换入口，因此本次不新增新的主切换机制。

本次 UI 层只需增强两点：

1. 用户刷新或进入某模式时，明确告诉用户本模式产物写到了哪里
2. 用户在知识区或文件树中，能快速看到：
   - 当前模式
   - 当前模式最新产物目录
   - 当前模式最近一次刷新状态

这可以避免“切了模式但不知道实际发生了什么”的问题。

## 错误处理

### 产物缺失

如果模式已选中，但该模式产物尚未生成：

- 运行时应自动尝试刷新
- 刷新失败时返回明确错误，而不是静默回退成统一模式

### 产物部分损坏

如果可见产物还在，但隐藏状态缺失或损坏：

- 允许整模式重建
- 不要求用户手动清理目录

### Upstream 参考缺失

如果参考文档目录还未补齐：

- 不应阻塞运行时
- 但应阻止后续维护时误改模式语义

因此参考层是“设计约束”，不是“运行时依赖”。

## 测试策略

至少补以下测试：

### 1. 模式分流测试

验证：

- `m-flow` 不会走 `llmwiki` context builder
- `llmwiki` 不会走 `rag` context builder
- `rag` 不会走 `m-flow` path builder

### 2. 产物生成测试

验证：

- `llmwiki` 会生成 `raw/`、`wiki/`、`index.md`
- `m-flow` 会生成 `episodes/`、`facets/`、`entities/`、`paths/`
- `rag` 会生成 `retrieval-guide.md` 和 `source-digests/`

### 3. AI 消费顺序测试

验证：

- `llmwiki` 优先消费 `wiki/`
- `m-flow` 优先消费 `path`
- `rag` 优先消费 chunk

### 4. 回退行为测试

验证：

- 模式专属产物缺失时，会先尝试刷新
- 刷新失败时有明确错误
- 只有兜底层读取，不会伪装成另一种模式

## 分阶段实施建议

### 第一阶段

- 建立 runtime 分流骨架
- 建立三种 adapter 的最小实现骨架
- 完成 `llmwiki` 与 `m-flow` 的可见产物目录落地
- 让 AI 入口真正按模式切运行时

### 第二阶段

- 丰富 `llmwiki` 的 `wiki/` 页面组织
- 丰富 `m-flow` 的 path 与 graph 构建质量
- 完善 `rag` 的 digest 与 citation 表现

### 第三阶段

- 优化模式切换后的缓存策略
- 做增量更新，而不是全量重建

## 不做的事

本设计明确不做以下事情：

- 不把三种模式揉成一个通用 prompt 再靠文本规则区分
- 不把 `m-flow` 简化成“普通索引换名字”
- 不把 `llmwiki` 简化成“多一个输出目录”
- 不删除现有 `.goodnight/base-index/*`
- 不在第一阶段引入过重的外部服务依赖

## 成功标准

当以下条件成立时，说明本设计达成目标：

1. 用户切换模式后，AI 运行时真正切换到不同上下文构造逻辑
2. `llmwiki` 和 `m-flow` 都能生成可见、可检查的中间产物
3. 用户能在项目目录里直观看到当前模式沉淀出的内容
4. 模式差异体现在 AI 的输入构造和引用方式上，而不是只体现在配置值上
5. 现有通用索引体系仍可作为底层兜底，不影响系统稳定性
