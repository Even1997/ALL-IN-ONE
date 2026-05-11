---
type: "architecture"
date: "2026-05-11T00:40:12.976575+00:00"
question: "What is ToolExecutor's real role in the AI runtime architecture?"
contributor: "graphify"
source_nodes: ["ToolExecutor", "submitRuntimeChatTurn()", "AIService", "runtimeChatTurnCoordinator.ts", "nodeRuntimeToolExecutor.ts"]
---

# Q: What is ToolExecutor's real role in the AI runtime architecture?

## Answer

ToolExecutor is primarily a shared low-level tool execution primitive, not the main orchestrator. In src/modules/ai/runtime/tools/toolExecutor.ts it owns path confinement, dispatch for glob/grep/ls/view/write/edit/bash/fetch, and mutation verification metadata. It is reused by legacy AIService tool loops, direct UI actions like AIPanel, and runtime chat execution via createRuntimeChatToolExecutor. Higher-level orchestration, provider routing, skill preparation, approval policy, and special handling for agent/ask-user tools live outside it in runtimeChatTurnCoordinator and related runtime layers. So it is a healthy shared primitive with broad reuse, though graph centrality is amplified by re-exports, dist-test artifacts, and adjacent sidecar executors such as apps/runtime/src/nodeRuntimeToolExecutor.ts that represent a separate execution surface.

## Source Nodes

- ToolExecutor
- submitRuntimeChatTurn()
- AIService
- runtimeChatTurnCoordinator.ts
- nodeRuntimeToolExecutor.ts