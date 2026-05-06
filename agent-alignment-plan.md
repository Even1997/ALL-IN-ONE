# gnagent → cc-haha 执行流对齐方案

## 一、真实情况：差距没有想象中大

经过完整代码追踪，**内置 Agent（built-in）的普通用户对话路径已经和 cc-haha 很接近了**。

### 普通用户请求的实际路径

```
用户输入 → executeRuntimeBuiltInAgentTurn → runAgentTurn → runRuntimeToolLoop → 结果
```

`decideAgentTurnMode` 的分类逻辑（第 5104 行）只在以下情况触发 plan_then_execute：
- 非 built-in agent（codex、本地 agent）
- MCP 命令
- 有显式 skill intent

**普通聊天请求直接走 direct 通道，不会进入 plan/审批流程。**

### 工具循环内部对比（核心相似）

| 机制 | cc-haha (`query.ts`) | gnagent (`runtimeToolLoop.ts`) |
|------|---------------------|-------------------------------|
| 流式工具检测 | `StreamingToolExecutor` | `createStreamingToolDetector` |
| 只读工具并行执行 | `Promise.all` | `Promise.all`（glob/grep/ls/view） |
| 写入工具串行执行 | 逐个执行 | 逐个执行 |
| 协议修复重试 | 有 | 有（XML 格式修复） |
| Length 续推 | 有 | 有（finish_reason='length'） |
| 上下文压缩 | Auto/Micro/Snip | tool result trimming + 旧轮移除 |
| 循环退出条件 | 无 tool_call → 返回文本 | 无 tool_call → 返回文本 |
| maxRounds | 无硬限制（模型自停） | 已改为 100（等同于无限制） |

## 二、仍然存在的架构差异

### 差异 1：System Prompt 规模

**cc-haha**：~800 行系统提示词，包含详细的 tool 使用指南、memory 规则、planning 流程、多 agent 协作规范、输出格式约束等。

**gnagent**：`GOODNIGHT_AGENT_SYSTEM_PROMPT` 只有 ~45 行，较精简。

**影响**：模型行为的稳定性、tool 调用格式的遵循度、边界情况处理。

**改动**：不需要完全复制 cc-haha 的 prompt，但应该扩充 gnagent 的 prompt，至少包含：
- `end_turn` 信号规则（模型何时应停止调用工具）
- 工具调用前不要发用户文本的规则
- 文件修改成功必须有 tool result 验证的规则
- 更多 tool 使用示例

### 差异 2：工具数量

**cc-haha**：60+ 工具
**gnagent**：~12 个核心工具

**影响**：gnagent 缺少 Task（后台任务）、Agent（子 agent 分发）、TodoWrite、WebSearch、WebFetch、Cron 等工具。

**改动**：按优先级逐步添加：
- P0：Agent（子 agent 分发，复用已有的 teamOrchestrator）
- P1：WebSearch、WebFetch
- P2：TodoWrite、TaskCreate/TaskList

### 差异 3：Tool 调用协议（最根本的差异）

**cc-haha**：用 Anthropic 原生 `tool_use` API（JSON function calling），同时流式检测文本中的 tool 调用以便提前执行只读工具。

**gnagent**：纯 XML 文本协议（模型在回复文本中写 `<tool_use>` 标签，代码解析）。

**影响**：
- 原生 function calling 的 tool 调用成功率更高
- 但 XML 文本协议与模型无关，可对接任何 LLM

**改动**：**不建议改**。XML 协议是 gnagent 的跨 provider 优势。如果要改，意味着整个 tool loop 需要重写为 Anthropic SDK 原生调用，工作量巨大且失去 provider 无关性。而且 XML 协议在实际使用中足够稳定。

### 差异 4：Plan 模式触发条件

**cc-haha**：`EnterPlanMode` 是一个 tool，由**模型主动决定**是否进入规划模式。

**gnagent**：非 built-in agent 时**系统强制**进入 plan_then_execute。

**影响**：用户使用 codex/本地 agent 时会多一次 plan 确认步骤。

**改动**：把 codex/本地 agent 的 plan 触发从强制改为可选（和 built-in 一样默认 direct），让模型通过 tool 调用来触发。

文件：[AIChat.tsx:5104](src/components/workspace/AIChat.tsx#L5104)
```typescript
// 当前：非 built-in 强制 plan
riskyWriteDetected: runtimeExecutionAgentId !== 'built-in',
// 改为：始终 false，让模型决定
riskyWriteDetected: false,
```

### 差异 5：后处理回退链

**cc-haha**：tool loop 结束后直接返回，有限的重试逻辑。

**gnagent**：tool loop 结束后有 4 层回退：
1. 项目访问失败 → 让模型不用工具直接回答
2. tool loop 耗尽 → 用摘要让模型直接回答
3. 只输出过程叙述（"让我先..."）→ 让模型输出完整答案
4. 非独立回答（引用了上文隐藏内容）→ 让模型输出独立答案

**影响**：gnagent 的回复质量实际上**更高**（因为有这 4 层兜底）。

**改动**：**保留不改**。这是 gnagent 的优势。

## 三、模拟：一个正常 Agent 应该长什么样

以用户请求 "帮我在 src/utils 下创建一个 formatDate.ts" 为例。

### 理想的正常 Agent 行为（cc-haha 风格）

| 步骤 | 用户看到的 | 内部发生的事 |
|------|-----------|-------------|
| 1 | 用户发送消息 | - |
| 2 | 状态栏显示 "思考中..." | 发起 API 调用 |
| 3 | 状态栏显示 "Running view" | 流式检测到 view 调用，提前执行，读取目录结构 |
| 4 | 状态栏显示 "Running edit" | 模型决定创建文件，执行 edit |
| 5 | 看到完整回复 "已创建..." | 模型输出最终文本 |

整个流程：**无额外确认、无 plan 审批弹窗、模型自主决定每一步。**

### gnagent 当前行为（built-in agent 路径）

| 步骤 | 用户看到的 | 内部发生的事 |
|------|-----------|-------------|
| 1 | 用户发送消息 | - |
| 2 | 状态栏显示 "正在思考..." | Skill 准备 → 上下文组装 → API 调用 |
| 3 | 状态栏显示 "Running view" | 流式检测到 view 调用，提前执行 |
| 4 | 状态栏显示 "Running edit" | 执行 edit |
| 5 | 看到完整回复 | 后处理（sanitize、claim guard、memory extract） |

**结论：built-in agent 路径已经和 cc-haha 用户体验基本一致。** 第 2 步多出的 Skill 准备和上下文组装是必要的固定开销（<100ms），用户感知不到。

### 非 built-in agent 的当前行为（有问题）

| 步骤 | 用户看到的 | 问题 |
|------|-----------|------|
| 1 | 用户发送消息 | - |
| 2 | 显示 plan 审批卡片 | ⚠️ 需要用户确认才能继续 |
| 3 | 用户点批准后 → 执行 | 多了 1 步用户交互 |

**这就是需要改的地方。** 非 built-in agent 不应该强制走 plan 审批。

---

## 四、3 个吞文字的 Bug（根源分析）

这是当前最影响用户体验的问题。工具循环的**结构**是对的（思考 → 执行 → 循环），但**文本累积**环节有 3 个具体 bug。

### Bug 1（主因）：`finalContent` 每轮被覆盖，中间文本全部丢失

**文件**：[runtimeToolLoop.ts:370](src/modules/ai/runtime/tools/runtimeToolLoop.ts#L370)

**问题代码**：
```typescript
// Line 370 — 每轮都覆盖，不累积
finalContent = sanitizeAgentVisibleText(assistantContent);
```

**追踪一次真实的模型交互**：

```
Round 1: 模型输出 "我先看下这个文件。\n\n<tool_use>\n<tool name=\"view\">\n..."
         → sanitize 后 finalContent = "我先看下这个文件。"  ← 暂存在变量里
         → 检测到 tool → 执行 view → continue  ← 跳到下一轮，finalContent 被丢弃

Round 2: 模型输出 "文件里有 formatDate 函数，用的是 moment。\n\n<tool_use>\n<tool name=\"edit\">\n..."
         → sanitize 后 finalContent = "文件里有 formatDate 函数，用的是 moment。"  ← 覆盖了 Round 1 的内容！
         → 检测到 tool → 执行 edit → continue  ← 又跳到下一轮，再次丢弃

Round 3: 模型输出 "改好了，已经把 moment 替换成 dayjs。"
         → sanitize 后 finalContent = "改好了，已经把 moment 替换成 dayjs。"  ← 又覆盖了 Round 2！
         → 无 tool → return "改好了，已经把 moment 替换成 dayjs。"

用户只看到: "改好了，已经把 moment 替换成 dayjs。"
丢失的文本: "我先看下这个文件。"  ← Round 1 的可见文字
           "文件里有 formatDate 函数，用的是 moment。"  ← Round 2 的可见文字
```

**这就是"输出一段就停了"的根本原因**——模型每次 tool 调用前的说明文字，在下一轮被覆盖掉了。用户只能看到最后一轮的输出。

**修复**（[runtimeToolLoop.ts](src/modules/ai/runtime/tools/runtimeToolLoop.ts)）：

```diff
  // 初始化（约 line 138）
- let finalContent = '';
+ const visibleTextPerRound: string[] = [];

  // 每轮计算（line 370）
- finalContent = sanitizeAgentVisibleText(assistantContent);
+ const roundVisibleText = sanitizeAgentVisibleText(assistantContent);
+ if (roundVisibleText) {
+   visibleTextPerRound.push(roundVisibleText);
+ }

  // 返回时（多处 return）
- return { finalContent, ... };
+ return { finalContent: visibleTextPerRound.join('\n\n') || finalContent, ... };
```

### Bug 2：`sanitizeAgentVisibleText` 行级过滤太激进

**文件**：[agentEvents.ts:112-128](src/modules/ai/runtime/dispatch/agentEvents.ts#L112-L128)

**问题代码**：
```typescript
const RAW_PROTOCOL_LINE_PATTERN =
  /^.*(?:DSML|tool_calls>|invoke name=|parameter name=|string="true"|string="false"|
         <tool name=|<\/tool>|<tool_params>|<\/tool_params>|<tool_use>|<\/tool_use>|
         <tool_result|<\/tool_result>|<bash>|<\/bash>|<cmd>|<\/cmd>).*\s*$/gim;
```

这个正则用 `gim` 标志匹配**整行**。只要某一行文本中出现了以上任意关键词，**整行都会被删除**。

**举例**——模型如果输出这些正常的用户文本，会被错误删除：

```
这个函数被 <tool name="edit"> 调用后会修改文件    ← 被删（含 <tool name=）
你需要用 </tool> 标签来结束                          ← 被删（含 </tool>）
In the bash terminal, run npm install                ← 被删（含 <bash>）
```

**修复**：拆分为两个职责不同的过滤函数：

1. **块级过滤**（保留）——移除完整的 `<tool_use>`、`<tool_result>`、`<bash>` XML 块
2. **碎片过滤**（缩小范围）——只移除纯粹的 XML 碎片行（行内只有 XML 标签），不要匹配包含正常文本的行

具体改动：把 `RAW_PROTOCOL_LINE_PATTERN` 从 `^.*<marker>.*$` 改为 `^\s*<marker>\s*$` 或 `^\s*</marker>\s*$`，即只有当行的主要内容就是该标记本身时才删除。

```diff
  const RAW_PROTOCOL_LINE_PATTERN =
-   /^.*(?:DSML|tool_calls>|invoke name=|parameter name=|string="true"|string="false"|
-          <tool name=|<\/tool>|<tool_params>|<\/tool_params>|<tool_use>|<\/tool_use>|
-          <tool_result|<\/tool_result>|<bash>|<\/bash>|<cmd>|<\/cmd>).*\s*$/gim;
+   /^\s*(?:DSML|tool_calls>|invoke name=|parameter name=|string="true"|string="false"|
+           <tool name=|<\/tool>|<tool_params>|<\/tool_params>|<tool_use>|<\/tool_use>|
+           <tool_result|<\/tool_result>|<bash>|<\/bash>|<cmd>|<\/cmd>)\s*$/gim;
```

关键变化：`^.*<marker>.*$` → `^\s*<marker>\s*$`。移除了前后的 `.*`，所以只有当该行**几乎只有**标记本身时才会被删除。

### Bug 3（思考丢失）：`markToolBoundary` 丢弃未分类文本

**文件**：[agentTurnRunner.ts](src/modules/ai/runtime/orchestration/agentTurnRunner.ts) 中的 `markToolBoundary`

**问题代码**：
```typescript
markToolBoundary: (): RuntimeStreamingAssistantDraft => {
  discardPendingText();  // ← 直接清空 initial 状态积累的文字
  state = 'answer';
  forceNewPart = true;
  return buildDraft(false);
},
```

**追踪问题场景**：

```
1. 模型开始输出，流式事件到达：
   event: { kind: 'text', delta: '好的，' }     → state='initial', pendingText='好的，'
   event: { kind: 'text', delta: '让我先检查一下' } → state='initial', pendingText='好的，让我先检查一下'

2. 流式检测到 tool call → 调用 beforeToolCall → 触发 markToolBoundary()
   → discardPendingText() → '好的，让我先检查一下' 全部丢失！

3. 工具执行完毕，模型继续：
   event: { kind: 'thinking', delta: '文件内容是...' } → state='thinking', thinkingContent='文件内容是...'

4. 最终 buildFinal:
   用户的 answerContent 为空（因为前置文字被丢了），只有 thinking
   → 如果 thinking 完模型也没再输出 answer 就调了下一个 tool
   → 用户看到的内容可能只剩 thinking 摘要或空
```

**修复**：`markToolBoundary` 不应该丢弃 pendingText，而应该 flush 到 answer 中：

```diff
  markToolBoundary: (): RuntimeStreamingAssistantDraft => {
-   discardPendingText();
+   flushPendingText('answer');  // 把 initial 状态积累的文字 flush 到 answer，而不是丢弃
    state = 'answer';
    forceNewPart = true;
    return buildDraft(false);
  },
```

**补充检查**：`append` 方法中的 `discardPendingText()` 也需要审查。当模型从 initial 状态进入 thinking 状态时，pendingText 被丢弃——这是合理的（thinking 开始前的杂讯可以丢弃）。但当进入 answer 状态时，pendingText 应该被 flush 而不是丢弃：

```diff
  append: (event) => {
    if (event.kind === 'thinking') {
      discardPendingText();  // thinking 前丢弃，合理
      state = 'thinking';
      ...
-   } else if (state === 'thinking') {
+   } else if (state === 'thinking') {
      answerContentRaw += event.delta;
      ...
-   } else {
+   } else if (state === 'answer') {
+     answerContentRaw += event.delta;
+     ...
+   } else {
      pendingText += event.delta;  // initial 状态，积累
    }
  },
```

current 逻辑中，当 state 从 initial 跳到 answer 时（模型不发 thinking 直接输出 answer），pendingText 不会被 flush。`buildFinal` 中虽然会 flush，但**流式过程中**用户看不到 pendingText 的内容。应该也在 `append` 中处理：

```diff
  append: (event) => {
    if (event.kind === 'thinking') {
      discardPendingText();
      state = 'thinking';
      thinkingContent += event.delta;
      ...
    } else if (state === 'thinking') {
      answerContentRaw += event.delta;
      ...
      state = 'answer';
    } else if (state === 'answer') {
      answerContentRaw += event.delta;
      ...
    } else {
+     // initial → answer 直接转换时，先 flush pending
+     flushPendingText('answer');
+     state = 'answer';
      answerContentRaw += event.delta;
      ...
    }
  },
```

---

## 五、具体改动清单

### 改动 0（新增，P0 紧急）：修复 3 个吞文字 Bug

| # | 文件 | 行号 | 改动 | 影响 |
|---|------|------|------|------|
| 0a | `runtimeToolLoop.ts` | ~138, 370, 407-413 | `finalContent` 覆盖 → 按轮累积拼接 | 修复"输出一段就停了" |
| 0b | `agentEvents.ts` | 112-128 | `RAW_PROTOCOL_LINE_PATTERN`: `^.*<m>.*$` → `^\s*<m>\s*$` | 修复正常文本被误删 |
| 0c | `agentTurnRunner.ts` | markToolBoundary | `discardPendingText()` → `flushPendingText('answer')` | 修复"思考被吞" |
| 0d | `agentTurnRunner.ts` | append | initial→answer 转换时先 flush pendingText | 修复流式过程中文字不显示 |

### 改动 1（已完成）：maxRounds 对齐

- [x] `runAgentTurn.ts`: `maxRounds: 8` → `maxRounds: input.maxRounds ?? 100`
- [x] `executeRuntimeBuiltInAgentTurn.ts`: 新增 `maxRounds?` 参数并转发
- [x] `runtime-permissions.test.mjs`: 更新测试

### 改动 2：非 built-in agent 取消强制 plan

**文件**：[AIChat.tsx:5104-5110](src/components/workspace/AIChat.tsx#L5104-L5110)

```diff
  const turnModeDecision = decideAgentTurnMode({
    prompt: cleanedContent,
    suggestedPlanMode: Boolean(skillIntent),
-   riskyWriteDetected: runtimeExecutionAgentId !== 'built-in',
-   bashDetected: Boolean(mcpCommand),
-   multiStepDetected: Boolean(mcpCommand || runtimeExecutionAgentId !== 'built-in'),
+   riskyWriteDetected: false,
+   bashDetected: Boolean(mcpCommand),
+   multiStepDetected: Boolean(mcpCommand),
  });
```

**效果**：codex/本地 agent 的请求也走 direct 通道，不再弹 plan 审批卡片。

### 改动 3：扩充 System Prompt

**文件**：[runAgentTurn.ts](src/modules/ai/runtime/agent-kernel/runAgentTurn.ts) `GOODNIGHT_AGENT_SYSTEM_PROMPT`

新增以下规则：

```
- When no tool is needed, answer the user directly without calling any tools.
- Before a tool batch, either call the tool immediately or give at most one short progress sentence.
- Do not emit repeated process narration such as "让我先...", "好的，我来..." across multiple replies.
- When a tool is obviously needed, call it immediately without a user-facing preamble.
- A file mutation is successful only after a write/edit tool result reports success and verification.
- Never claim you changed files unless a write/edit tool actually succeeded.
- For straightforward writing, drafting, or questions that do not depend on project files, answer directly.
- If the answer depends on project facts not already in context, inspect with read-only tools first.
```

### 改动 4：添加 Agent 子分发工具

**文件**：新增 `src/modules/ai/runtime/tools/agentTool.ts`

将已有的 `teamOrchestrator.ts` / `teamPlanner.ts` 包装为 tool 调用接口，让模型可以分发子任务、并行查询、后台执行。

### 不改的部分

| 模块 | 原因 |
|------|------|
| `runtimeToolLoop.ts`（除 Bug 0a 外） | 循环结构已经正确 |
| `executeRuntimeBuiltInAgentTurn.ts` 的 4 层回退 | gnagent 优势，保留 |
| XML tool 协议 | 跨 provider 能力，保留 |
| `runtimeLocalAgentFlow.ts` | 本地 agent 审批流是安全特性，保留 |

## 六、改动后的最终执行流

### 修复 Bug 后的正确流程

```
用户输入
  → 上下文组装（<50ms）
  → 工具循环（模型自主驱动）:
      │
      Round 1:  模型输出 "我先看下这个文件。\n<tool_use>view</tool_use>"
                ├─ 流式渲染: 用户看到 "我先看下这个文件。"   ← Bug 0c/d 修复后，文字正常显示
                ├─ 流式检测到 view → 提前执行
                ├─ sanitize → roundVisibleText = "我先看下这个文件。"
                ├─ push 到 visibleTextPerRound                  ← Bug 0a 修复后，文字被累积
                ├─ 执行 view，结果回传
                └─ continue 下一轮
      │
      Round 2:  模型输出 "文件里有 formatDate。\n<tool_use>edit</tool_use>"
                ├─ 流式渲染: 用户看到 "文件里有 formatDate。"
                ├─ sanitize → roundVisibleText = "文件里有 formatDate。"
                ├─ push 到 visibleTextPerRound
                ├─ 执行 edit，结果回传
                └─ continue 下一轮
      │
      Round 3:  模型输出 "改好了。"
                ├─ 流式渲染: 用户看到 "改好了。"
                ├─ 无 tool → 退出循环
                └─ return visibleTextPerRound.join('\n\n')
                   = "我先看下这个文件。\n\n文件里有 formatDate。\n\n改好了。"
  
  → 后处理回退链（按需触发）
  → 记忆提取（非阻塞）
  → 返回完整结果
```

### 和 cc-haha 的剩余差异（可接受的）

| 差异点 | cc-haha | gnagent | 是否可接受 |
|--------|---------|---------|-----------|
| Tool 协议 | 原生 function calling | XML 文本解析 | ✅ 跨 provider 的代价 |
| 工具数量 | 60+ | ~15 | ⚠️ 逐步扩充 |
| 后处理回退 | 基础 | 4 层兜底 | ✅ gnagent 更优 |
| Plan 触发 | 模型 tool 调用 | 模型 tool 调用 | ✅ 改动后一致 |
| 多 Agent | AgentTool 成熟 | 基础 team 编排 | ⚠️ 改动 4 补齐 |
| 文本累积 | 流式 UI 层累积 | 按轮累积拼接 | ✅ Bug 0a 修复后一致 |

## 七、实施顺序

1. **改动 0（P0 紧急）**— 修复 3 个吞文字 Bug（2-3 小时）
   - 0a: `runtimeToolLoop.ts` finalContent 累积
   - 0b: `agentEvents.ts` 行级过滤收窄
   - 0c: `agentTurnRunner.ts` markToolBoundary 改 flush
   - 0d: `agentTurnRunner.ts` append 中 initial→answer 转换
2. **改动 2**（30 分钟）— 取消非 built-in 强制 plan
3. **改动 3**（30 分钟）— 扩充 system prompt
4. **改动 4**（1 天）— Agent 子分发工具
5. **验证**（半天）— 跑测试 + 手动测试 10 个典型场景
