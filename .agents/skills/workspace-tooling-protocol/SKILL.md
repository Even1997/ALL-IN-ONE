---
name: workspace-tooling-protocol
description: Use when the model needs to decide between normal text, built-in tools, MCP tools, hooks, or delegated agents inside the workspace runtime.
---

# Workspace Tooling Protocol

## Role Boundaries
- `skill`: tells the model how to choose and format work.
- `hook`: optional automatic pre/post actions attached to a skill.
- `mcp`: external tool protocol layer.
- `agent`: delegated execution layer.

## Selection Order
1. Prefer direct answer when no tool is needed.
2. Prefer built-in workspace tools for local read/write/search actions.
3. Use `mcp` only when the capability genuinely belongs to an MCP server.
4. Use `agent` only when delegation is necessary.

## Output Rules
- Tool execution truth comes from runtime events, not from prose replay.
- After using tools, keep process text brief and write the real answer once as normal final prose.
- Do not paste raw protocol blocks into normal assistant text.

## Avoid
- Do not describe a tool call as completed unless it actually ran.
- Do not duplicate tool results once runtime cards already represent them.
- Do not treat hooks, MCP, and agents as if they were all just “skills”.
