---
name: ai-chat-output-boundary
description: Use when AI chat responses need a stable boundary between thinking, tool execution, process feedback, and the final answer.
---

# AI Chat Output Boundary

## Goal
Keep the assistant output easy to render by keeping each kind of content in its own runtime lane.

## Boundary Rules
- `thinking`: internal reasoning or reasoning summary. It belongs to runtime reasoning events, not the final answer body.
- `tool`: tool calls and tool results. They belong to runtime tool events, not prose replay.
- `feedback`: optional short user-visible process note. Use it only when it helps the user understand ongoing work.
- `final_answer`: the durable answer body. Write it once as natural prose.

## Writing Rules
- Do not wrap the final answer in XML or custom tags.
- Do not paste raw tool protocol, shell transcripts, or runtime envelopes into the final answer.
- Do not repeat the same final answer as both process feedback and final prose.
- If no tool or long-running work is involved, answer normally with no process feedback.
