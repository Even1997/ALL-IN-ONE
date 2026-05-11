---
type: "query"
date: "2026-05-11T00:29:15.483162+00:00"
question: "Why does AIService connect so many communities?"
contributor: "graphify"
source_nodes: ["AIService", "ToolExecutor", "AIChat.tsx", "agentRuntimeClient.ts", "executeRuntimeBuiltInAgentTurn.ts", "ClaudeRuntime.ts", "CodexRuntime.ts"]
---

# Q: Why does AIService connect so many communities?

## Answer

AIService is a high-degree bridge centered in Community 19 because it links the older chat/service surface to runtime orchestration, provider runtimes, tool execution, settings state, and UI entry points. The graph shows direct extracted connections from AIService to ToolExecutor, AIChat.tsx, executeRuntimeBuiltInAgentTurn.ts, agentRuntimeClient.ts, runtimeToolLoop.ts, globalAIStore.ts, runAgentTurn(), runtimeChatTurnStreaming.ts, ClaudeRuntime.ts, CodexRuntime.ts, AIPanel.tsx, and useAIChatSettingsState.ts. In practice it sits at the seam between UI chat flows, runtime execution flows, and provider-specific backends, so many communities route through it.

## Source Nodes

- AIService
- ToolExecutor
- AIChat.tsx
- agentRuntimeClient.ts
- executeRuntimeBuiltInAgentTurn.ts
- ClaudeRuntime.ts
- CodexRuntime.ts