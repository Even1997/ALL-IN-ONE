---
type: "architecture"
date: "2026-05-11T00:33:34.250440+00:00"
question: "What is the real execution chain around AIService, runAgentTurn, ClaudeRuntime, and CodexRuntime?"
contributor: "graphify"
source_nodes: ["AIService", "runAgentTurn()", "submitRuntimeChatTurn()", "agentRuntimeClient.ts", "ClaudeRuntime.ts", "CodexRuntime.ts"]
---

# Q: What is the real execution chain around AIService, runAgentTurn, ClaudeRuntime, and CodexRuntime?

## Answer

Graph + source cross-check: the real runtime path is submitRuntimeChatTurn() -> executeRuntimeBuiltInAgentTurn() -> runAgentTurn(), where runAgentTurn is a provider-agnostic agent kernel that builds context and runs the runtime tool loop. Provider selection happens outside the kernel: runtimeChatTurnCoordinator injects executeModel, then ports.executeRuntimePrompt routes into agentRuntimeClient.executePrompt, which dispatches to ClaudeRuntime or CodexRuntime when providerId is claude/codex, or falls back to aiService.completeText for generic built-in execution. AIService is therefore partly an intended seam, but mainly as a shared provider adapter/service reused by multiple layers, not the top-level orchestrator of the whole runtime stack. Its graph centrality is inflated because the main AIService node came from dist-test/modules/ai/core/AIService.js and the graph appears to merge or reverse some relationships around that symbol, so use AIService reachability as a clue but rely on source flow for exact ownership.

## Source Nodes

- AIService
- runAgentTurn()
- submitRuntimeChatTurn()
- agentRuntimeClient.ts
- ClaudeRuntime.ts
- CodexRuntime.ts