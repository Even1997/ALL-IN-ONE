# Local Agent Tabs Design

## Summary

The AI chat entry should support three direct agent tabs: Claude, Codex, and the product's own AI. Users choose the active agent at the composer instead of going through the settings drawer. Claude and Codex run as local CLI tools from the current project directory so they can use their existing skills and local toolchains.

## Goals

- Add a compact three-tab agent switcher near the chat composer.
- Let users choose Claude CLI, Codex CLI, or the built-in AI before sending a message.
- Run Claude and Codex through a local agent runtime, not through the existing HTTP provider path.
- Preserve the current API provider settings for the product's own AI and existing model providers.
- Show clear running, completed, failed, and cancelled states in chat.
- Allow local Claude/Codex agents to read and write inside the active project directory.

## Non-Goals

- Do not move Claude/Codex selection into the settings page.
- Do not build multi-agent parallel execution in the first version.
- Do not add file diff approval or per-command permission prompts in the first version.
- Do not replace the existing OpenAI-compatible and Anthropic HTTP provider support.
- Do not require users to configure API keys for Claude CLI or Codex CLI.

## User Experience

The chat composer gets a small segmented tab control with three entries:

- `Claude`
- `Codex`
- `AI`

The active tab is visually highlighted. Each tab has a short tooltip or title that describes its runtime:

- Claude: `Claude CLI`
- Codex: `Codex CLI`
- AI: `Built-in AI`

Sending a message uses the active tab:

- Claude tab sends the prompt to the local `claude` command.
- Codex tab sends the prompt to the local `codex` command.
- AI tab uses the existing `aiService` HTTP/provider path.

If a local CLI is missing, the message should fail with a clear error such as `Claude CLI was not found. Install it or make sure it is available on PATH.` The tab remains selectable so the user can retry after fixing their environment.

## Runtime Design

Add a local agent runtime boundary for command-based agents.

The frontend calls a Tauri command with:

- `agent`: `claude` or `codex`
- `prompt`
- `projectRoot`
- optional prompt context already assembled by the chat flow

The Tauri backend executes the command from `projectRoot` and pipes the prompt into stdin or passes it through the CLI's non-interactive prompt argument, depending on the command contract chosen during implementation.

The command result maps into a common shape:

```ts
type LocalAgentResult = {
  success: boolean;
  content: string;
  error: string | null;
  exitCode: number | null;
};
```

The chat store records local agent messages the same way it records built-in AI messages, with extra metadata for the selected agent and status.

## Agent Selection State

The active agent should be lightweight UI state, not an AI settings entry.

Suggested type:

```ts
type ChatAgentId = 'claude' | 'codex' | 'built-in';
```

The selected agent can persist in the chat store or local UI storage so the user's last choice survives reloads. It should not create or mutate `AIConfigEntry`.

## Data Flow

1. User selects one of the three agent tabs.
2. User sends a prompt.
3. Chat builds the existing project/reference context.
4. If the selected agent is `built-in`, the prompt goes through the current `aiService.chat` path.
5. If the selected agent is `claude` or `codex`, the prompt goes through the local agent runtime Tauri command.
6. Chat appends the agent response or error state to the current session.

## Error Handling

- Missing CLI: show a concise setup/path error in the assistant message.
- Non-zero exit: include stderr if present, otherwise show a generic failure with the exit code.
- Empty output: show `The local agent finished without output.`
- Cancelled run: mark the assistant message as cancelled.

The first version may use request-level completion instead of streaming. Streaming can be added after the command boundary is stable.

## Testing

Add focused tests for:

- The chat UI source exposes exactly three direct agent tabs.
- Claude and Codex tabs route to the local agent path.
- Built-in AI tab keeps using the existing AI service path.
- Local agent command results map success, failure, and empty output consistently.
- Existing AI config/provider tests continue passing.

## Open Decisions

- Exact CLI invocation flags for `claude` and `codex` need verification during implementation because command-line contracts can vary by installed version.
- The first implementation should prefer the simplest non-interactive invocation that works locally.

