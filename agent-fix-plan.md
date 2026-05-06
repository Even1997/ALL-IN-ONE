# gnagent Agent 吞文字修复 + 执行流对齐

## 任务概述

修复 agent 在使用过程中文字被吞的问题（输出一段就停、思考内容消失、工具执行期间正文看不见）。问题出在 2 个后端文件 + 1 个前端文件。

## Fix 1（后端，P0）：工具循环最终文本只保留最后一轮

**文件**: `src/modules/ai/runtime/tools/runtimeToolLoop.ts`

**问题**: 第 370 行 `finalContent = sanitizeAgentVisibleText(assistantContent)` 每轮直接覆盖，当模型在多个 round 之间穿插文本 + 工具调用时，只有最后 round 的文本被返回。

**当前代码**（约第 138 行）：
```typescript
let finalContent = '';
```

**当前代码**（第 370 行）：
```typescript
finalContent = sanitizeAgentVisibleText(assistantContent);
```

**修改为**：

初始化改为累积数组（约第 138 行，`let finalContent = ''` 替换）：
```typescript
const visibleTextPerRound: string[] = [];
```

每轮追加而非覆盖（第 370 行替换）：
```typescript
// 原: finalContent = sanitizeAgentVisibleText(assistantContent);
// 改为:
const roundVisibleText = sanitizeAgentVisibleText(assistantContent);
if (roundVisibleText) {
  visibleTextPerRound.push(roundVisibleText);
}
```

所有 return 语句改为拼接累积文本（搜索文件中的 `finalContent,` 替换为 `visibleTextPerRound.join('\n\n') || `）：

位置 1（约第 407 行，正常返回）：
```typescript
// 原:
return {
  finalContent,
  transcript: messages,
  toolCalls,
};
// 改为:
return {
  finalContent: visibleTextPerRound.join('\n\n') || finalContent,
  transcript: messages,
  toolCalls,
};
```

位置 2（约第 437 行，耗尽返回）：
```typescript
// 原:
return {
  finalContent: createExhaustedMessage(options.maxRounds),
  transcript: messages,
  toolCalls,
};
// 改为:
return {
  finalContent: visibleTextPerRound.join('\n\n') || createExhaustedMessage(options.maxRounds),
  transcript: messages,
  toolCalls,
};
```

注意：`finalContent` 变量（原始 `let finalContent = ''`）仍然需要保留，因为有其他代码引用它（如 tool protocol markers 检测中的 `finalContent &&` 判断）。改为 `const visibleTextPerRound: string[] = []` 后，把原来的 `finalContent` 替换逻辑改为 `visibleTextPerRound.push()`，同时保留一个局部变量 `finalContent` 指向最后一轮的 sanitized 值，供后续条件判断使用。最简单的做法是：

```typescript
// 约第 138 行:
const visibleTextPerRound: string[] = [];
// 保留这一行供条件判断用:
let lastRoundContent = '';

// 第 370 行替换:
lastRoundContent = sanitizeAgentVisibleText(assistantContent);
if (lastRoundContent) {
  visibleTextPerRound.push(lastRoundContent);
}

// 条件判断处（如第 406 行的 if (finalContent && ...)）改为:
if (lastRoundContent && !REPAIRABLE_TOOL_PROTOCOL_PATTERN.test(assistantContent)) {

// 两处 return 改为:
finalContent: visibleTextPerRound.join('\n\n') || lastRoundContent,
```

## Fix 2（后端，P0）：sanitize 行级正则过于激进

**文件**: `src/modules/ai/runtime/dispatch/agentEvents.ts`

**问题**: 第 112-113 行 `RAW_PROTOCOL_LINE_PATTERN` 使用 `^.*<marker>.*$` 匹配整行，导致包含工具标记关键词的正常用户可见文本被整行删除。

**当前代码**（约第 112-113 行）：
```typescript
const RAW_PROTOCOL_LINE_PATTERN =
  /^.*(?:DSML|tool_calls>|invoke name=|parameter name=|string="true"|string="false"|<tool name=|<\/tool>|<tool_params>|<\/tool_params>|<tool_use>|<\/tool_use>|<tool_result|<\/tool_result>|<bash>|<\/bash>|<cmd>|<\/cmd>).*\s*$/gim;
```

**修改为**（去掉前后的 `.*`，只匹配纯标记行）：
```typescript
const RAW_PROTOCOL_LINE_PATTERN =
  /^\s*(?:DSML|tool_calls>|invoke name=|parameter name=|string="true"|string="false"|<tool name=|<\/tool>|<tool_params>|<\/tool_params>|<tool_use>|<\/tool_use>|<tool_result|<\/tool_result>|<bash>|<\/bash>|<cmd>|<\/cmd>)\s*$/gim;
```

变化：`^.*<marker>.*$` → `^\s*<marker>\s*$`。只删除行内容几乎**全是**标记文本的行，不会误删像 `"这个函数被 <tool name="edit"> 调用"` 这样的正常内容。

## Fix 3（前端，P0）：streaming 期间 thinking 阶段丢弃已累积的 answer 文本

**文件**: `src/modules/ai/runtime/orchestration/agentTurnRunner.ts`

**问题**: 第 334 行 `buildDraft` 函数中 `state === 'answer' ? answerContentRaw : ''`，当模型进入新 round 的 thinking 阶段时 `state` 变为 `'thinking'`，`visibleAnswerContent` 被设为空字符串。此时 `buildRuntimeStreamingMessage` 产出的 content 中不包含之前累积的 answer 文本。前端的 `buildAssistantTimelineUpdate` 会用这个残缺的 content 完全替换 timeline 中的叙事事件，导致之前显示的正文从界面上消失。

**当前代码**（第 334 行）：
```typescript
const buildDraft = (completeThinking: boolean): RuntimeStreamingAssistantDraft => {
  const visibleAnswerContent = sanitizeStreamingVisibleText(state === 'answer' ? answerContentRaw : '');
```

**修改为**（去掉 state 条件，始终使用已累积的 answerContentRaw）：
```typescript
const buildDraft = (completeThinking: boolean): RuntimeStreamingAssistantDraft => {
  const visibleAnswerContent = sanitizeStreamingVisibleText(answerContentRaw);
```

## Fix 4（已完成，无需操作）：maxRounds

已经是 `maxRounds: input.maxRounds ?? 100`，无需再改。

## 验证方法

改完后运行以下测试：

```bash
# 工具循环测试
node --test tests/ai/runtime-tool-loop.test.mjs

# 权限测试（验证 maxRounds 配置）
node --test tests/ai/runtime-permissions.test.mjs

# 直接聊天 prompt 测试
node --test tests/ai/direct-chat-prompt.test.mjs
```

手动验证场景（启动 dev server 后逐一测试）：

1. 输入 "帮我在 src/utils 下找一下有没有日期相关的函数" → 应看到模型先输出思考，再输出查找说明，再执行 view 工具，再输出查找结果
2. 输入 "把这个文件里的 moment 替换成 dayjs" → 每一步的文字说明都应累积显示，不应只看到最后一步的内容
3. 输入 "总结一下当前项目" → 多次工具调用之间的说明文字都应完整展示
