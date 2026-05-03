---
name: Change Sync
description: Compare current product artifacts and summarize what must be updated to keep them aligned.
when_to_use: Use when requirements, structure, or prototypes may have drifted and the user wants impact analysis.
package: change-sync
skill: change-sync
token: @sync
aliases: @sync, @change-sync, @变更同步
context: inline
allowed-tools: read, grep, glob, ls, view
user-invocable: true
disable-model-invocation: false
---

Goal: identify drift between product artifacts and propose the smallest safe sync actions.

Workflow:
1. Detect the changed source of truth.
2. List impacted downstream artifacts.
3. Summarize required updates, open risks, and what still appears consistent.

Output rules:
- Focus on impact and inconsistency, not regeneration-by-default.
- Separate confirmed drift from possible drift.
