# GoodNight x Obsidian Skills 适配方案

## 结论

GoodNight 不应该继续把 `wiki` 当成知识系统的主产物。

更合适的方向是：

1. 用户维护自己的真实内容。
2. 系统自动维护一套只供系统使用的内部索引资产。
3. AI 先读索引，再按需取原文，最后输出需求文档、功能文档或其他正式文档。

这条路线更接近 `obsidian-skills` 的真正价值：不是“多生成一些文档”，而是先定义好 AI 应该读写的资产类型，再约束它如何更新这些资产。

## 从 Obsidian Skills 学到什么

### 1. 文件类型是一等公民

`obsidian-skills` 不是泛泛地说“整理知识”，而是按 Markdown、Bases、JSON Canvas 这类具体资产来约束 AI 的行为。

GoodNight 对应的启发是：

- 不要让 AI 直接“整理 wiki”
- 要让 AI 明确知道它在处理什么
- 用户文档、系统索引、正式输出文档，应该是三类不同资产

### 2. 技能的核心是约束，不是炫技

`obsidian-skills` 的强项是告诉 AI：

- 该读哪些文件
- 该写哪些文件
- 写出来的结构应该长什么样
- 什么时候该跳过，不要重复生成

GoodNight 现在最缺的也是这个。

当前 `@整理` 的问题不是能力不够，而是目标太模糊，导致它把“整理”做成了“重复生成 wiki”。

### 3. Progressive disclosure 很适合 GoodNight

Agent Skills 规范强调 progressive disclosure：默认只暴露当前任务需要的最少规则，细节按需展开。

GoodNight 可以照这个思路做：

- 用户只看到“输出需求文档 / 输出功能文档”
- 系统内部再决定是否需要刷新索引、读取哪些证据、补哪些推测

不要把内部索引、同步提案、wiki 合并策略这些中间机制直接暴露给用户。

## GoodNight 的目标模型

### 用户可编辑层

这层是真实知识来源：

- 项目内 Markdown 文档
- 知识库笔记
- 页面说明
- 设计说明
- 功能清单
- 代码与配置文件
- 生成产物的说明文本

用户只维护这层。

### 系统只读层

系统自动生成一个用户无需编辑的内部目录，建议放在：

`<project>/.goodnight/system-index/`

这一层只给系统自己看，不需要用户维护，也不应该让用户被迫理解它。

建议包含：

- `manifest.json`
  记录被纳入索引的文件、哈希、更新时间、分类
- `chunks.jsonl`
  记录分块后的内容摘要、关键词、来源路径
- `topics.json`
  记录主题、别名、术语、关联来源
- `coverage.json`
  记录哪些主题证据充分，哪些主题证据不足
- `doc-intents.json`
  记录“需求文档 / 功能文档 / 方案文档”各自最相关的证据入口
- `generated-context/requirements.md`
  系统拼装给 AI 的需求文档上下文
- `generated-context/feature-spec.md`
  系统拼装给 AI 的功能文档上下文

### 正式输出层

这一层是用户真正会看和修改的结果：

- `requirements.md`
- `feature-spec.md`
- `solution.md`

输出方式保留两种：

- 聊天里直接返回
- 同时自动落盘成正式文档

## 核心交互

### 1. 手动触发

保留聊天触发和按钮触发两种方式：

- `@索引` 或旧别名 `@整理`
- “输出需求文档”
- “输出功能文档”

### 2. 系统先判定要不要刷新索引

这是最关键的产品规则：

- 如果知识源文件没有变化，就不要重新整理
- 如果没有变化，就不要再耗 token
- 如果有变化，再决定刷新哪些索引资产

这是你前面提到的核心诉求，必须变成硬规则，而不是体验优化。

### 3. 文档生成时允许补全，但必须显式标注

根据你的选择，GoodNight 应该支持“合理补全”，但要把推测内容单独标出来。

建议统一使用两个区块：

- `## Based on source`
- `## Inferred by AI`

或者在段落级别加标记：

- `[Source-backed]`
- `[Inferred]`

这样既能生成完整文档，又不会把推测伪装成事实。

## 对现有 Wiki 方案的调整建议

### 应该下线的东西

- 把 `wiki` 当成主要知识产物
- 让用户反复审批“wiki 更新建议”
- 每次整理都重新生成一批 overview / inventory 文档

### 应该保留的东西

- 现有 knowledge store / search / similar notes / neighborhood graph 这些基础能力
- 现有 `@整理` 入口，作为过渡别名
- 现有 AIChat 技能路由机制

### 应该改名的东西

面向用户的文案应从：

- “整理知识库并生成 wiki”

改成：

- “刷新系统索引”
- “准备文档上下文”
- “生成需求文档 / 功能文档”

## 推荐的第一阶段落地

### Phase 1: 改方向，不大改架构

目标：

- 不再强调 wiki
- 把 `@整理` 改成“系统索引刷新”
- 为后续文档生成准备上下文

建议复用现有能力：

- `knowledgeStore`
- `searchNotes`
- `runKnowledgeOrganizeLane`
- `knowledgeProposal`

但把输出语义改成“系统索引资产”，而不是“Wiki 提案”。

### Phase 2: 加入变更判定

加入指纹和跳过逻辑：

- 计算索引源文件 hash
- 与 `manifest.json` 比较
- 无变化时直接复用旧索引

这一步是省 token 的关键。

### Phase 3: 文档生成工作流

新增两个稳定入口：

- `@需求文档`
- `@功能文档`

或对应按钮。

内部流程：

1. 检查系统索引是否过期
2. 需要时刷新索引
3. 读取对应的 `generated-context/*`
4. 生成正式文档
5. 聊天返回 + 落盘保存

## 成功标准

这个方向是否正确，可以用 4 个问题判断：

1. 没有文件变化时，系统是否会安静跳过整理？
2. 用户是否不再需要理解或维护 wiki？
3. 用户是否能一句话生成“像样的文档”？
4. 生成文档里，推测内容是否有明确标记？

只要这 4 点成立，GoodNight 的知识系统方向就已经从“自动写 wiki”纠正成“自动维护索引并生成文档”了。

## 对当前代码的最小映射

当前代码里最接近新方向的入口有：

- `src/components/workspace/AIChat.tsx`
- `src/components/product/ProductWorkbench.tsx`
- `src/modules/ai/workflow/skillRouting.ts`
- `src/modules/ai/knowledge/runKnowledgeOrganizeLane.ts`
- `src/features/knowledge/store/knowledgeStore.ts`

建议下一步优先做：

1. 改用户文案，从 `wiki` 改成 `系统索引`
2. 给 `@整理` 增加 `@索引` 别名
3. 给整理流程加“无变化跳过”的指纹判断
4. 新增“输出需求文档 / 输出功能文档”的正式入口
