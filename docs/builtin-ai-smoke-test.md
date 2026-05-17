# Built-in AI Smoke Test

This runbook preserves the exact route used to verify GoodNight's built-in AI runtime.

## What this checks

- Uses the real GoodNight WebView2 profile at `C:\Users\Even\AppData\Local\com.goodnight.app\EBWebView`
- Opens the app origin `http://localhost:1420`
- Reads the active `goodnight-ai-store` record from browser `localStorage`
- Uses the selected built-in config to send one minimal inference request

## One-command path

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-builtin-ai-smoke.ps1
```

The script will:

- Start `vite` on `http://localhost:1420` if it is not already running
- Reuse the persisted built-in config from the GoodNight profile
- Print the selected config id, provider, base URL, model, masked API key, HTTP status, and returned assistant text
- Stop the temporary dev server after the check unless `-LeaveDevServerRunning` is passed

## Current known config route

- Config store key: `goodnight-ai-store`
- Config source: WebView `localStorage`, not Tauri `agent-runtime`
- Current selected config during verification on 2026-05-06:
  `preset-deepseek`
  `provider=anthropic`
  `baseURL=https://api.deepseek.com/anthropic`
  `model=deepseek-v4-flash`

## Important caveat

For `provider=anthropic`, the current built-in UI `testConnection()` path is preset-only and may report success without a real network call. The smoke test script intentionally performs a real inference request so we can verify the runtime end to end.

## Real user prompt path

For realistic built-in turn testing, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-builtin-ai-turns.ps1
```

Or:

```powershell
npm run test:builtin-ai-turns
```

This path:

- Uses the same persisted built-in config from `goodnight-ai-store`
- Runs the real built-in runtime orchestration in Node via `executeRuntimeBuiltInAgentTurn`
- Replays several realistic user prompts and prints tool calls plus final visible answers
- Boots `vite` on `http://localhost:1420` automatically if needed
- If the runtime passes a structured message array instead of a plain prompt string, the script must call `AIService.completeMessages()` instead of flattening the array into `completeText()`

## Why this route exists

- Opening `http://localhost:1420` in a plain browser is **not** a full built-in end-to-end test because the page does not have the Tauri runtime bridge and will surface `Tauri runtime unavailable`
- The turn smoke script avoids that false negative by reusing the real persisted config and driving the built-in orchestration path directly
- This is the fastest repeatable route for “simulate a real user asking built-in AI questions and inspect the output”
## Project file approval path

For built-in project file operation checks, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-builtin-ai-file-ops.ps1
```

Or:

```powershell
npm run test:builtin-ai-file-ops
```

This route now covers both file operation correctness and approval-flow correctness:

- delete planning reaches `approval-required`
- approval denial leaves the target file untouched
- approval grant resumes and finishes the delete execution
- approval backend resolution keeps the same `toolCallId`

If the script fails before printing a JSON report and the error mentions `playwright-core`, classify it as a local verification dependency issue first. In that case, fix the Playwright runtime resolution before treating the result as an AI/runtime regression.
