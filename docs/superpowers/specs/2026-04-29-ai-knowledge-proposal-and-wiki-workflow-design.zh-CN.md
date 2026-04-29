# AI 知识库提案与 Wiki 工作流设计

日期：2026-04-29

## 摘要

本设计为 GoodNight 当前知识库补上一层稳定的 AI 操作规则，并把 Wiki 从“一次性整理产物”提升为“可持续维护的结构化知识层”。

核心结论如下：

- AI 默认对知识库只读，不能静默写入。
- AI 可以在聊天中主动提出知识库维护建议，但只能以“提案”形式出现。
- 用户全程可控：可以整体批准、逐条取消、或完全拒绝提案。
- 删除不作为 AI 的直接动作；删除需求统一降级为归档候选、合并候选、或待清理标记。
- 新事实和原始材料优先进入普通 note，稳定的结构化结论优先进入 wiki。
- Wiki 更新入口先统一放在聊天中，知识库面板第一版只负责展示结果，不承担审批职责。

## 背景

当前仓库已经具备知识库基础能力：

- `knowledgeClient` / `knowledgeStore` 已支持查询、新增、更新、删除、相似笔记、邻域图等能力。
- `ProductWorkbench` 已具备知识笔记编辑、搜索、图谱和附件上下文展示能力。
- `AIChat` 已具备知识上下文注入能力，并已有 `knowledge-organize` lane 用于整理知识库和生成 Wiki 文档。

但当前系统仍缺少两块关键能力：

1. AI 如何操作知识库的统一规则。
2. 普通 note 与 wiki 文档之间持续、可追溯、可控的维护工作流。

结果是：

- AI 能看到知识库，但不能稳定地“正确使用知识库”。
- Wiki 更像一次整理结果，而不是长期维护的结构化层。
- 新结论、新素材、重复内容、过时内容缺少统一处理方式。

## 目标

- 为普通聊天、整理 lane、后续 AI skill 提供统一的知识库操作规则。
- 让 AI 能在聊天中主动提出知识库维护建议，但不越过用户直接执行。
- 明确 note 与 wiki 的职责边界，避免内容重复和职责打架。
- 为 Wiki 建立从证据到结论、从原始 note 到结构化页面的持续维护工作流。
- 尽量复用现有 `knowledgeStore`、`knowledgeClient`、`AIChat`、`ProductWorkbench`，用最小改动落地。

## 非目标

- 第一版不做知识库面板内的审批中心。
- 第一版不做复杂的权限系统或多角色审批流。
- 第一版不做真正的“删除”自动化。
- 第一版不引入重型图数据库或复杂 schema 迁移。
- 第一版不开放任意无限制的 wiki 页面类型生成。

## 产品原则

### 1. AI 默认只读

AI 在没有用户批准前，只能观察和分析知识库，不能直接改写知识内容。

### 2. 建议先于执行

AI 可以主动建议，但必须先把意图表达成结构化提案，再等待用户决定。

### 3. 用户全程可控

用户必须始终拥有最终决定权：

- 可以整体批准
- 可以逐条取消
- 可以完全拒绝

### 4. 删除降级

AI 不直接做删除动作。所有删除倾向统一降级为：

- 归档候选
- 合并候选
- 待清理标记

### 5. 事实与结论分层

- 原始事实、素材、会话沉淀优先进入 note。
- 稳定结论、结构化概览、索引和术语优先进入 wiki。

### 6. 证据必须可追溯

任何 AI 提案和 Wiki 更新都必须说明依据来源，避免“看起来合理但无法核实”的写入。

## 信息模型

### Note 的职责

普通 note 承担原始知识容器角色，适合存放：

- 用户原话
- 会议纪要
- 临时分析
- 导入的 Markdown
- 某一项具体发现
- 某次对话中的局部结论

### Wiki 的职责

Wiki 承担稳定知识和结构化认知角色，适合存放：

- 项目总览
- 功能清单
- 页面清单
- 术语表
- 决策记录
- 待确认问题

### 第一版固定 Wiki 类型

第一版将 Wiki 页面类型限制为以下集合：

- `project-overview`
- `feature-inventory`
- `page-inventory`
- `terminology`
- `decision-log`
- `open-questions`

这样可以保证 AI 输出不发散，也便于后续 UI 和 graph 稳定识别。

## AI 操作规则

### 观察阶段

AI 可以：

- 查询当前知识上下文
- 搜索 note
- 查看相似 note
- 查看邻域图
- 分析当前对话与知识库之间的差异

AI 不可以：

- 新增 note
- 改写 note
- 改写 wiki
- 删除或归档任何内容

### 提案阶段

当 AI 判断知识库存在可维护项时，只能生成提案。提案通过聊天消息展现，不直接落库。

AI 可以提出的第一版操作类型：

- `create_note`
- `update_note`
- `create_wiki`
- `update_wiki`
- `link_notes`
- `merge_candidate`
- `archive_candidate`
- `mark_stale`

AI 不可提出的第一版操作：

- `delete_note`
- `delete_wiki`
- 自动重命名大批文件
- 自动移动文件夹
- 自动重构整个知识树

### 执行阶段

只有在用户批准后，系统才把提案中的操作映射成真实的数据写入。

执行层必须满足：

- 仅执行用户保留的操作项
- 执行前再次校验目标对象是否仍存在
- 执行后将结果回填到当前聊天上下文
- 执行失败时给出逐条反馈，不做静默吞错

## 提案模型

### 提案对象

第一版新增 `KnowledgeProposal` 模型，建议至少包含：

- `id`
- `projectId`
- `summary`
- `trigger`
- `operations`
- `createdAt`
- `status`

其中 `trigger` 用于记录提案来源，例如：

- `answer-gap`
- `wiki-stale`
- `duplicate-notes`
- `knowledge-organize`

### 提案操作对象

每条操作建议至少包含：

- `id`
- `type`
- `targetId`
- `targetTitle`
- `reason`
- `evidence`
- `draftContent`
- `riskLevel`
- `selected`

字段要求：

- `reason` 说明为什么要做这项操作。
- `evidence` 列出支撑判断的 note、wiki、聊天片段或系统上下文。
- `draftContent` 用于预览 AI 建议写入的内容。
- `selected` 默认为 `true`，允许用户逐条取消。

### 聊天中的提案表现

聊天中的提案卡片应至少展示：

- 标题：例如“知识库更新建议”
- 摘要：例如“发现 3 项可维护内容”
- 每条操作的目标位置
- 每条操作的原因
- 每条操作的证据来源
- 每条操作的内容预览

提案底部操作建议为：

- `全部批准`
- `选择后执行`
- `忽略`

知识库面板第一版不承担审批职责，只展示最终执行后的结果。

## Wiki 工作流

### Note 到 Wiki 的分流规则

当 AI 发现新信息时，按以下规则分流：

- 新事实、新素材、新上下文：优先 `create_note` 或 `update_note`
- 已有多条 note 可沉淀成稳定结论：优先 `create_wiki` 或 `update_wiki`
- wiki 与近期 note 冲突：优先 `update_wiki`
- 多条 note 重复表达同一主题：优先 `merge_candidate`
- 内容过时但不该删除：优先 `archive_candidate` 或 `mark_stale`

### AI 主动提出提案的时机

第一版 AI 主动提案只在以下场景触发：

1. 回答完成后发现知识缺口。
2. 回答时综合了多篇 note，并已经形成稳定总结。
3. 发现 wiki 内容与近期 note 明显冲突。
4. 发现多篇 note 高度重复或碎片化严重。

AI 不应主动提案的场景：

- 用户只是随意闲聊
- 证据不足，只是猜测
- 改动范围过大但收益不明确
- 用户当前目标是快速问答，而非整理知识

### 提案触发判断

建议新增统一判断逻辑，将提案触发归纳为四类信号：

- `gap`：当前回答形成了新结论，但库中没有对应 note/wiki
- `stale`：wiki 与近期 note 或当前事实冲突
- `duplicate`：两篇以上 note 高相似且职责不清
- `distillable`：三篇以上相关 note 可沉淀为稳定 wiki 页面

只有出现这些信号之一，且证据足够时，AI 才生成提案。

### Wiki 更新必须可追溯

所有 `create_wiki` 和 `update_wiki` 操作都必须附带来源证据：

- 源 note 列表
- 相关聊天结论
- 可选的旧版 wiki 页面

这样 wiki 不会成为孤立结论，而是可追溯的知识汇总层。

## 落地到当前代码的实现切分

### 1. 规则层

新增统一规则模块，例如：

- `src/modules/ai/knowledge/knowledgeOperationPolicy.ts`

职责：

- 输出 AI 可读的知识库操作规则
- 被普通聊天与 `knowledge-organize` lane 复用
- 统一“只读默认、提案先行、删除降级、事实/结论分层”的行为边界

### 2. 提案模型与状态层

建议新增：

- `src/features/knowledge/model/knowledgeProposal.ts`
- `src/features/knowledge/store/knowledgeProposalStore.ts`

职责：

- 持有当前项目中的待执行提案
- 记录提案状态
- 管理用户逐条选择结果

### 3. 提案生成层

建议新增：

- `src/modules/ai/knowledge/shouldSuggestKnowledgeProposal.ts`
- `src/modules/ai/knowledge/buildKnowledgeProposal.ts`

职责拆分：

- `shouldSuggestKnowledgeProposal` 只负责判断值不值得提案
- `buildKnowledgeProposal` 只负责生成结构化提案内容

### 4. 聊天集成层

主要接入点为：

- `src/components/workspace/AIChat.tsx`

接入方式：

1. AI 先正常回答用户问题。
2. 回答完成后检查是否应触发提案。
3. 如果应触发，则在同一轮回复后追加一条提案卡片。
4. 用户在聊天中批准后，再调用执行层。

### 5. 执行层

建议新增统一执行入口，例如：

- `executeKnowledgeProposal(projectId, proposalId, selectedOperationIds)`

执行层尽量复用现有 `knowledgeStore` 能力：

- `createProjectNote`
- `updateProjectNote`
- `deleteProjectNote` 仅供非 AI 路径保留
- `searchNotes`
- `loadSimilarNotes`
- `loadNeighborhoodGraph`

第一版为了减少 schema 改动，归档和待清理可以先通过 tag 表达，例如：

- `status/archived`
- `status/stale`
- `candidate/merge`
- `kind/wiki`
- `kind/note`

### 6. Wiki lane 对齐

现有 `runKnowledgeOrganizeLane` 已能批量生成 wiki 类文档，但应改造成与提案系统对齐：

- lane 负责生成“建议写入的 wiki 草稿”
- 不再默认把 lane 结果视为应立即写入的最终结果
- lane 产物应能转换为 `KnowledgeProposal`

这样普通聊天和批量整理都会走同一套治理规则。

## UI 设计范围

### 聊天侧

第一版新增知识库提案卡片：

- 支持展开查看 draft 内容
- 支持逐条取消
- 支持整体执行
- 支持忽略

### 知识库侧

第一版知识库工作台只做以下增强：

- 执行完成后刷新 note / wiki 列表
- 在 note / wiki 元信息中展示归档、待清理、wiki 类型等状态
- 继续展示相似内容、邻域图和附件

不新增独立审批区，不引入第二套操作入口。

## 失败处理与风险控制

### 风险 1：AI 提案过多，打扰用户

控制方式：

- 严格限制提案触发条件
- 只在回答后且证据充分时提示
- 同一轮对话最多追加一份提案

### 风险 2：AI 把猜测写成知识

控制方式：

- 提案必须附 evidence
- 没有明确 evidence 时不得生成结构化写入建议
- Wiki 更新必须引用来源 note 或对话结论

### 风险 3：重复 note 越来越多

控制方式：

- 第一版支持 `merge_candidate`
- 支持对重复内容打待清理标记
- 不做自动删除

### 风险 4：Wiki 和 note 职责再次混乱

控制方式：

- 固定第一版 wiki 类型
- 明确事实进 note、结论进 wiki
- 普通聊天和 organize lane 共用同一 policy

## 分阶段落地

### Phase 1

- 新增知识库操作 policy
- 新增 proposal model/store
- 在聊天回答后支持生成提案
- 支持 `create_note`、`update_note`、`create_wiki`、`update_wiki`

### Phase 2

- 支持 `merge_candidate`、`archive_candidate`、`mark_stale`
- 让 `knowledge-organize` lane 输出提案而不是直接落库

### Phase 3

- 加强 wiki 图谱和反向证据展示
- 优化提案触发阈值和频率控制

## 验证标准

本设计成功的标准是：

- AI 在普通聊天中可以稳定区分“回答用户”和“建议维护知识库”。
- AI 不会在未经批准的情况下直接写入知识库。
- 用户可以在聊天中整体批准或逐条取消知识库提案。
- 新事实优先进 note，稳定结论优先进 wiki。
- Wiki 更新可以追溯到 note 或对话证据。
- 删除类需求不会被 AI 直接执行。
- `knowledge-organize` lane 与普通聊天最终遵循同一套知识治理规则。
