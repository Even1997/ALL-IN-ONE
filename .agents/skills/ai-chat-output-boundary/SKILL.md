---
name: ai-chat-output-boundary
description: Use when AI chat responses need a stable boundary between thinking, tool execution, process feedback, and the final answer.
---

# AI Chat Output Boundary

## Goal
Keep chat output stable and easy to render.

## Rules
- `thinking` is internal progress only. Do not put chain-of-thought into the final answer body.
- `tool` execution is shown by runtime events, not by repeating raw tool protocol in prose.
- `feedback` is optional process text. Keep it short, human-readable, and temporary.
- `final` is the only durable answer body for a completed turn.

## Output Format
- No tool used:
```xml
<final>
直接回答用户
</final>
```

- Tool used and a short process note is helpful:
```xml
<feedback>
正在检查相关文件并整理结果。
</feedback>
<final>
这里给出最终答案。
</final>
```

## Hard Limits
- Never put raw `<tool_use>`, `<tool_result>`, shell transcript, or protocol chatter inside `<final>`.
- Do not output the same正文 twice.
- If there is nothing useful to say during process, skip `<feedback>` and output only `<final>`.
