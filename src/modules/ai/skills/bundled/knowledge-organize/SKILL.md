---
name: Knowledge Organize
description: Organize current project context into stable facts before answering.
when_to_use: Use when the user wants indexing, organization, or a stable fact base before acting.
package: knowledge-organize
skill: knowledge-organize
token: @index
aliases: @organize, @index, @整理, @索引
context: inline
allowed-tools: read, grep, glob, ls, view
user-invocable: true
disable-model-invocation: false
---

Goal: turn scattered project context into a concise, reliable fact base before producing advice or downstream artifacts.

Workflow:
1. Identify the smallest set of files or notes that contain the authoritative facts.
2. Separate stable facts from open questions and assumptions.
3. Summarize the result in a way that downstream skills can reuse.

Output rules:
- Prefer stable facts over guesses.
- Mark missing information as assumptions or open questions.
- Do not claim files were updated unless a real file operation succeeded.
