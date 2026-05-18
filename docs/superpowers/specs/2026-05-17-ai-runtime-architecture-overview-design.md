# AI Runtime Architecture Overview Design

**目标**

- 生成一份简洁的 AI 架构总览 HTML，帮助团队快速理解当前 AI 体系的主要分层、关键模块、真实执行链路与排查入口。

**设计取向**

- 页面采用“总览优先”结构，先讲分层，再讲关键模块，最后用流程图补充主链路与 provider 差异。
- 内容全部使用中文标注，但保留真实代码文件路径，方便从页面直接回到代码。
- 图示只表达当前仓库里的真实实现，不引入理想化架构或未来规划。

**页面结构**

1. 顶部摘要：一句话说明 AI 主链路与页面用途。
2. 分层总览：按层说明每层职责、关键文件、排查重点。
3. 关键模块：列出当前最核心的模块与它们在链路里的位置。
4. 流程图：
   - 主执行链路图
   - Built-in GPT / Claude / Codex 路线差异图
5. 常见排查入口：把 thinking、tool、final、sidecar、持久化几个常见问题的入口文件收口。

**展示原则**

- 尽量简单，不做复杂交互。
- 使用 Mermaid 画图，减少维护成本。
- 重点强调当前架构边界：
  `provider protocol adapters -> canonical runtime events -> timeline / projection -> render / UI`
- 明确区分 4 条运行路线：
  1. built-in runtime
  2. ClaudeRuntime app-config 壳层
  3. CodexRuntime app-config 壳层
  4. 本地 Claude / Codex CLI 的 local-agent 链路
