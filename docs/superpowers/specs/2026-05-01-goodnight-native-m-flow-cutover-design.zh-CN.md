# GoodNight 原生 M-Flow 一次性切换设计

> Status: Current architecture reference after the native `m-flow` cutover.
> This document supersedes the earlier multi-engine / `base-index` design docs from 2026-04-29 and 2026-04-30.

## 结论

GoodNight 的知识内核从当前“通用 system index + 多 skill 运行时”的结构，一次性切换为“单一原生 `m-flow` 内核”。

这次不是把现有 `systemIndex` 重新命名成 `m-flow`，而是按官方 `m-flow` 的核心检索范式重建：

- 单一用户心智：用户只使用 `m-flow`
- 单一内部主索引：`.goodnight/m-flow/`
- 单一检索范式：anchor -> graph projection -> bundle scoring
- 单一核心模型：`Episode / Facet / FacetPoint / Entity / Edge`

`llmwiki` 和 `rag` 退出当前主架构，不再影响本次设计。旧 `.goodnight/base-index/` 及其相关语义废弃。

## 背景

当前项目已经实现了：

- `m-flow`
- `llmwiki`
- `rag`

三个知识模式的入口、部分适配器和共享 `systemIndex`。

但当前 `m-flow` 实现并不是真正意义上的官方 `m-flow`。它更接近：

1. 扫描文件得到 `Source / Chunk / Topic / DocIntent`
2. 用 token 命中做平面检索
3. 再把命中的 source 包装成 `episode / facet / entity / path` 风格文档

这种实现的问题不是“还不够精细”，而是**检索范式就不对**：

- 主模型仍然是 chunk 检索模型
- `facet/entity/path` 只是投影产物，不是检索主结构
- `edge_text` 没有成为一等检索信号
- `Episode` 不是 bundle scoring 的最终 recall landing point

如果继续在这个基础上打补丁，最终会得到一个“看起来像 m-flow”的系统，而不是“真正按 m-flow 工作”的系统。

## 设计目标

### 目标

1. 让 GoodNight 的知识内核与官方 `m-flow` 的核心检索思想一致，而不是只借术语。
2. 让用户只感知一个知识引擎，不再切换检索模式。
3. 用本地 Vault + Markdown 产物的方式重建官方 `m-flow` 的核心能力。
4. 让内部状态、运行时上下文、可见产物都围绕 `m-flow` 组织。
5. 为后续继续逼近官方 `m-flow` 留下稳定的结构边界。

### 非目标

1. 本次不保留多检索模式并列产品心智。
2. 本次不兼容旧 `.goodnight/base-index/` 目录和 `SystemIndexData` 数据格式。
3. 本次不重新设计 `llmwiki` 或 `rag`。
4. 本次不照搬官方整套 Python 服务架构、图数据库、向量数据库和 worker 体系。
5. 本次不追求 1:1 复刻官方所有能力，只追求核心模型和检索范式正确。

## 对官方 M-Flow 的理解

本设计基于对官方仓库和关键实现的直接阅读，而不是只看 README 摘要。

主要参考来源：

- `README.md`
- `docs/RETRIEVAL_ARCHITECTURE.md`
- `m_flow/core/domain/models/Episode.py`
- `m_flow/core/domain/models/Facet.py`
- `m_flow/core/domain/models/FacetPoint.py`
- `m_flow/core/domain/models/Entity.py`
- `m_flow/knowledge/graph_ops/m_flow_graph/MemoryGraphElements.py`
- `m_flow/retrieval/episodic/bundle_scorer.py`
- `m_flow/memory/episodic/edge_text_generators.py`
- `m_flow/memory/episodic/episode_builder/step35_node_edge_creation.py`

### 官方中必须继承的核心语义

#### 1. 图不是辅助物，图就是评分引擎

向量检索只负责“广撒网找到入口点”，最终相关性由图传播和路径成本决定。

不能再把图当作检索后的解释层。

#### 2. 检索拓扑是倒锥体

官方的核心层级是：

- `Episode`
- `Facet`
- `FacetPoint`
- `Entity`

但它不是普通的自上而下层级浏览。

真正的检索方向是：

- query 命中最合适粒度的 anchor
- 从尖端进入图
- 向 Episode 这个 bundle landing point 传播

#### 3. Episode 是最终 recall 单元

用户真正拿到的不是散落的 chunk，而是以 `Episode` 为中心的 bundle。

`Facet`、`FacetPoint`、`Entity` 是路径中的证据锚点，不是最终返回单位。

#### 4. Edge 是一等信号

官方里 `edge_text` 会被索引，会参与路径成本计算。

这意味着：

- edge 不能只是结构连接
- edge 必须有自然语言语义
- edge 的语义相关性会影响路径是否成立

#### 5. 评分是 minimum path，不是平均分

一个 Episode 只要存在一条足够强的低成本路径，就应该被召回。

不能把一个 Episode 下所有 facet 或 point 的信号做平均，否则会被大量无关信息稀释。

#### 6. Direct Episode Hit 要被惩罚

官方明确偏好：

- 如果存在更精确的 `FacetPoint / Entity / Facet` 路径
- 就不应该让宽泛的 Episode summary 命中轻易胜出

因此 broad summary match 不能天然优先。

### 官方中不应直接照搬的部分

#### 1. 图数据库与向量数据库基础设施

官方实现依赖独立图数据库、向量库和服务化运行时。

GoodNight 当前是本地 Vault 产品，不适合在这次切换里直接引入同等复杂度的基础设施。

#### 2. API / worker / 多租户体系

这些是官方平台化能力，不是当前本地知识库产品的核心需求。

#### 3. 所有 ingest 与 memorize 细节

我们需要的是：

- 理解其模型和检索边界
- 继承核心抽象
- 再按 GoodNight 本地文件系统和现有 UI 进行重写

## 产品决策

### 1. 用户只使用一个知识引擎

用户侧不再看到：

- `m-flow`
- `llmwiki`
- `rag`

三选一的模式切换。

对用户来说，系统只有一个知识引擎：`m-flow`。

### 2. `m-flow` 成为唯一知识内核目录

内部隐藏状态目录切换为：

```text
.goodnight/
  m-flow/
```

不再保留：

- `.goodnight/base-index/`
- `.goodnight/skills/m-flow/`

### 3. 旧多 skill 主架构退出

以下内容不再作为本次主架构的一部分：

- `KnowledgeRetrievalMethod` 多模式主心智
- base-index 作为公共底座
- `llmwiki/rag` 的运行时并列关系

它们后续如需重启，必须重新围绕新的 `m-flow` 内核决策，而不是继续绑定旧结构。

## Upstream Copy 策略

这次不是只“参考一下”官方仓库，而是要把关键 upstream reference 固化到本仓库里，避免后续实现逐步偏离。

### 原则

1. 拷贝的是只读参考，不是直接运行时代码。
2. 保留原始路径、来源、提交信息或版本说明。
3. 只拷关键文件，不整仓 vendoring。
4. 所有本地适配都必须能追溯到对应 upstream reference。

### 建议目录

```text
docs/
  references/
    upstream/
      m-flow/
        README.md
        docs/
          RETRIEVAL_ARCHITECTURE.md
        m_flow/
          core/domain/models/
            Episode.py
            Facet.py
            FacetPoint.py
            Entity.py
          knowledge/graph_ops/m_flow_graph/
            MemoryGraphElements.py
          retrieval/episodic/
            bundle_scorer.py
          memory/episodic/
            edge_text_generators.py
            episode_builder/step35_node_edge_creation.py
```

### 作用

这层 reference 用于：

- 术语对齐
- 模型对齐
- 检索逻辑对齐
- code review 时比对实现偏差

它不参与运行时加载，也不作为业务模块 import 源。

## 新的内部模型

旧核心模型：

- `SystemIndexSourceRecord`
- `SystemIndexChunk`
- `SystemIndexTopic`
- `SystemIndexDocIntent`

退出主模型。

新的核心模型以 `m-flow` 原生结构为中心。

### `MFlowManifest`

记录：

- 构建时间
- vault 路径指纹
- schema version
- source count
- episode count
- facet count
- facet point count
- entity count
- edge count

### `MFlowSource`

这是 ingest 阶段的原始来源记录，不是最终检索主单位。

它承担：

- 文件路径
- 标题
- 更新时间
- 原文内容
- 规范化文本
- source spans / paragraphs
- 指纹

它是 `m-flow` 的 ingest 输入，不是用户问答时的主要检索对象。

### `Episode`

字段建议：

- `id`
- `name`
- `summary`
- `sourceIds`
- `status`
- `signature`
- `displayOnly`

语义：

- Episode 是最终 recall bundle 的 landing point
- Episode summary 可以被命中，但 direct hit 要惩罚

### `Facet`

字段建议：

- `id`
- `episodeId`
- `name`
- `facetType`
- `searchText`
- `anchorText`
- `description`

语义：

- Facet 是 Episode 的中层切面
- `searchText` 是短而尖锐的检索入口
- `anchorText` 是中层 richer retrieval field

### `FacetPoint`

字段建议：

- `id`
- `facetId`
- `name`
- `searchText`
- `description`

语义：

- FacetPoint 是最细粒度的 atomic assertion
- 它不是 chunk 本身，而是从内容里抽出的可独立命中点

### `Entity`

字段建议：

- `id`
- `name`
- `description`
- `canonicalName`
- `sourceIds`

语义：

- Entity 是跨 Episode 的桥接点
- 可以用于跨 source / 跨 Episode 召回

### `MFlowEdge`

字段建议：

- `id`
- `fromId`
- `toId`
- `relationshipName`
- `edgeText`
- `vectorDistanceDefault`

关系类型至少包括：

- `has_facet`
- `has_point`
- `involves_entity`

必要时可额外保留：

- `same_entity_as`
- `supported_by`
- `includes_chunk`

但它们不一定参与第一阶段主检索。

## 新的构建流程

### 总体流程

```text
Vault files
  -> ingest normalized sources
  -> build Episode candidates
  -> derive Facets
  -> derive FacetPoints
  -> derive Entities
  -> build semantic edges with edge_text
  -> persist .goodnight/m-flow/*.json
  -> render _goodnight/outputs/m-flow/*.md
```

### 1. Ingest

职责：

- 扫描 Vault 原始文件
- 过滤 `.goodnight/`、`_goodnight/`
- 读取 Markdown / text / code 文件
- 规范化换行与空白
- 形成 source records
- 计算文件指纹

注意：

- 这一步只做“原料整理”
- 不再把这层命名为 `base-index`

### 2. Build Episodes

Episode 不是 chunk。

第一阶段可以采用“source -> episode”为主的保守策略：

- 一个文档或一个稳定 section group 形成一个 Episode

后续再向更细粒度的多 Episode/source 演进。

关键是：

- Episode 是 bounded semantic focus
- 必须能承接 Facet / FacetPoint / Entity

### 3. Build Facets

Facet 不是 tags[0]。

Facet 应当从 source 的语义结构中抽取：

- 决策
- 风险
- 约束
- 功能点
- 需求面
- 流程面
- 设计面
- Bug / 问题面

第一阶段允许采用：

- 标题层级
- 段落模式
- 规则抽取
- 受控 LLM 抽取

但输出必须落成 `Facet` 节点，而不是停留在 prompt 解释层。

### 4. Build FacetPoints

FacetPoint 是这次适配里最关键的新层。

它来自 Facet description 中可以独立命中的信息点，例如：

- 一个明确判断
- 一个具体指标
- 一个约束句
- 一个原子事实
- 一个行动结论

FacetPoint 必须满足：

- 可以独立检索
- 可以单独解释
- 可以挂到具体 facet 下

### 5. Build Entities

Entity 不只是文件名。

Entity 应从文本中识别：

- 功能名
- 页面名
- 文件/模块名
- 用户角色
- API/模型/库名
- 重要概念
- 指标 / 数值对象

并建立：

- Episode -> Entity
- 必要时 Facet -> Entity

### 6. Build Semantic Edges

每条边都必须有：

- `relationshipName`
- `edgeText`

`edgeText` 要像官方一样，使用简洁但有语义的自然语言格式，而不是结构化调试串。

例如：

- `Facet searchText: description`
- `Facet -> Point: point description`
- `Entity | context`

## 新的检索流程

新的检索主流程必须从平面 chunk 检索切换为 graph-routed bundle search。

### Phase 1: Multi-granularity anchor search

查询会同时对以下入口做命中：

- Episode summary
- Facet searchText
- Facet anchorText
- FacetPoint searchText
- Entity name
- Edge edgeText

注意：

- 这一步只找入口，不直接决定最终答案

### Phase 2: Graph projection

把命中的入口点投影到本地 `m-flow` graph：

- 找到相关节点
- 找到相邻边
- 构造局部 subgraph

### Phase 3: Bundle scoring

对每个 Episode 计算路径成本。

至少支持这些路径：

- `direct_episode`
- `facet -> episode`
- `point -> facet -> episode`
- `entity -> episode`
- `entity -> facet -> episode`

规则：

- 使用最小路径成本
- direct episode hit 加惩罚
- 每 hop 增加 hop cost
- edge 命中弱时增加 edge miss cost

### Phase 4: Assemble output bundle

返回给 AI 的上下文以 Episode bundle 为中心：

- Episode summary
- best path
- matched facet
- matched facet points
- relevant entities
- path explanation

而不是返回松散 chunk 列表。

## 新的目录结构

### 内部状态

```text
.goodnight/
  m-flow/
    manifest.json
    sources.json
    episodes.json
    facets.json
    facet-points.json
    entities.json
    edges.json
    search-index.json
```

说明：

- `search-index.json` 表示本地多字段检索的派生索引
- 这层服务于 anchor search，不再叫 base index

### 用户可见产物

```text
_goodnight/
  outputs/
    m-flow/
      index.md
      episodes/
      facets/
      facet-points/
      entities/
      paths/
```

说明：

- `episodes/*.md` 给用户和 AI 看完整 bundle
- `facets/*.md` 给用户看主题切面
- `facet-points/*.md` 给用户看精细信息点
- `entities/*.md` 给用户看跨 Episode 实体
- `paths/*.md` 给用户看某次问答形成的证据路径

## 代码结构重组

旧 `systemIndex.ts` 已移除，不再继续扩展。

建议拆分为新的 `m-flow` 内核目录：

```text
src/modules/knowledge/m-flow/
  model.ts
  ingest.ts
  buildEpisodes.ts
  buildFacets.ts
  buildFacetPoints.ts
  buildEntities.ts
  buildEdges.ts
  searchAnchors.ts
  scoreBundles.ts
  renderArtifacts.ts
  persistence.ts
  runtime.ts
```

职责建议：

### `model.ts`

定义：

- manifest
- source
- episode
- facet
- facet point
- entity
- edge
- bundle result

### `ingest.ts`

负责：

- source 扫描
- 文本规范化
- 指纹
- 初始 source spans

### `buildEpisodes.ts`

负责：

- 从 source 形成 Episode

### `buildFacets.ts`

负责：

- 从 Episode/source 结构提取 Facet

### `buildFacetPoints.ts`

负责：

- 从 Facet 提取可独立命中的点

### `buildEntities.ts`

负责：

- 抽取实体并形成 canonical entity records

### `buildEdges.ts`

负责：

- 生成 `has_facet`
- 生成 `has_point`
- 生成 `involves_entity`
- 写入 `edgeText`

### `searchAnchors.ts`

负责：

- 多字段 anchor search
- 输出入口点及其初始距离

### `scoreBundles.ts`

负责：

- graph projection
- min path scoring
- direct hit penalty
- bundle ranking

### `renderArtifacts.ts`

负责：

- 输出 episodes/facets/facet-points/entities/paths Markdown

### `runtime.ts`

负责：

- 给 AIChat 和其他入口提供统一 `m-flow` 运行时接口

## 旧结构退出方案

这是一次性切换，不做长期兼容。

### 删除或废弃的概念

- `base-index`
- `SystemIndexData`
- `SystemIndexChunk`
- `SystemIndexTopic`
- `SystemIndexDocIntent`
- 用户可切换 `knowledgeRetrievalMethod`

### 行为变化

- 刷新 = 重建 `.goodnight/m-flow/`
- 问答 = 基于 `m-flow` graph 检索
- 模式切换 UI = 移除

### 旧目录处理

如果检测到以下目录：

- `.goodnight/base-index/`
- `.goodnight/skills/llmwiki/`
- `.goodnight/skills/rag/`
- `.goodnight/skills/m-flow/`

系统不尝试兼容读取。

处理方式：

- 显示“知识索引结构已升级，需要重建”
- 用户执行一次刷新后生成新 `m-flow` 结构

## 测试策略

### 单元测试

至少覆盖：

1. source ingest 与 `_goodnight/.goodnight` 过滤
2. Episode 生成
3. Facet 生成
4. FacetPoint 生成
5. Entity 生成
6. edgeText 生成
7. anchor search
8. bundle scoring
9. direct episode penalty
10. min path 优先于平均信号

### 集成测试

至少覆盖：

1. 刷新后生成 `.goodnight/m-flow/*.json`
2. 刷新后生成 `_goodnight/outputs/m-flow/*`
3. 提问命中 FacetPoint 时能返回对应 Episode bundle
4. 提问命中 Entity 时能跨 source 找到相关 Episode
5. 旧目录存在时提示重建

### 对齐测试

需要增加一类“upstream 对齐测试”，确保本地实现不跑偏：

1. 核心关系名与官方一致
2. `edgeText` 参与 anchor search
3. bundle scorer 支持 `point / facet / entity / direct_episode`
4. direct episode hit 被惩罚

## 风险与约束

### 1. Facet / FacetPoint 抽取质量决定上限

如果写入侧不能生成稳定的 Facet / FacetPoint，检索范式再对也会退化。

所以这次切换里，写入侧不是附属工程，而是核心工程。

### 2. 本地 JSON graph 不会等价于官方 DB 投影

这是可接受的。

我们要对齐的是：

- 模型
- 路径
- 评分哲学

而不是底层存储介质。

### 3. 第一期不要试图完整复刻官方所有高级能力

例如：

- 多租户
- 时间奖励
- 自适应 collection confidence
- 程序性记忆并行体系

这些都不应阻挡第一版内核切换。

## 分阶段建议

虽然产品切换是一次性的，但工程上仍建议内部按两个阶段做。

### 第一阶段：范式切对

目标：

- 新目录
- 新模型
- 新检索
- 能生成 Episode / Facet / FacetPoint / Entity / Edge
- 能按 bundle score 回答

### 第二阶段：继续逼近官方

目标：

- 更好的 FacetPoint 抽取
- 更好的 Entity canonicalization
- Facet -> Entity 路径优化
- adaptive weights / time bonus 等增强

## 最终决策

GoodNight 本次知识架构改造的核心不是“优化索引”，而是：

**放弃旧通用索引中心结构，改为按官方 `m-flow` 的倒锥图检索思想重建唯一知识内核。**

落实到工程上就是：

1. copy 官方关键 reference 到仓库
2. 废弃 `base-index`
3. 废弃多 skill 并列主架构
4. 建立 `.goodnight/m-flow/`
5. 用 `Episode / Facet / FacetPoint / Entity / Edge` 重写内核
6. 用 anchor search + bundle scoring 重写检索
