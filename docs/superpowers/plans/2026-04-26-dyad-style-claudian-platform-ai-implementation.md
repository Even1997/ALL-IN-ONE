# Dyad Style Claudian Platform AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the app into a dyad-style polished workbench with independent Claude/Codex/Classic AI workspaces, official provider-native message flows, and platform-wide AI capability bridges.

**Architecture:** Keep the existing left-middle-right product structure, replace the current faux Claudian chat host with independent provider workspaces, preserve Classic as compatibility mode, and add shared platform capability bridges above separate Claude/Codex runtimes.

**Tech Stack:** React, TypeScript, Zustand, Tauri, existing workbench stores, Claudian runtime scaffolding, dyad-inspired design system and layout patterns

---

## File Structure Map

### Existing files to keep and narrow

- `src/components/workspace/AIChat.tsx`
  - keep as Classic-only compatibility chat
- `src/components/workspace/AIChat.css`
  - keep only for Classic styling after migration
- `src/components/ai/claudian-shell/ClaudianShell.tsx`
  - keep as AI workspace host
- `src/components/ai/claudian-shell/ClaudianShell.css`
  - evolve into the main AI shell style host

### New workspace files

- `src/components/ai/workspaces/ClaudeWorkspace.tsx`
- `src/components/ai/workspaces/CodexWorkspace.tsx`
- `src/components/ai/workspaces/ClassicWorkspace.tsx`
- `src/components/ai/workspaces/ProviderWorkspaceLayout.tsx`
- `src/components/ai/workspaces/ProviderWorkspaceLayout.css`

### New provider chat UI files

- `src/components/ai/provider-chat/SessionSidebar.tsx`
- `src/components/ai/provider-chat/MessageViewport.tsx`
- `src/components/ai/provider-chat/ComposerToolbar.tsx`
- `src/components/ai/provider-chat/RuntimeStatusBar.tsx`
- `src/components/ai/provider-chat/PlatformCapabilityStrip.tsx`
- `src/components/ai/provider-chat/providerChat.css`

### New provider session/runtime state files

- `src/modules/ai/provider-sessions/claudeSessionStore.ts`
- `src/modules/ai/provider-sessions/codexSessionStore.ts`
- `src/modules/ai/provider-sessions/types.ts`
- `src/modules/ai/provider-sessions/persistence.ts`

### New platform bridge files

- `src/modules/ai/platform-bridges/SkillBridge.ts`
- `src/modules/ai/platform-bridges/ContextBridge.ts`
- `src/modules/ai/platform-bridges/WorkspaceBridge.ts`
- `src/modules/ai/platform-bridges/ActivityBridge.ts`
- `src/modules/ai/platform-bridges/types.ts`

### Existing provider runtime files to extend

- `src/modules/ai/claudian/runtime/claude/ClaudeRuntime.ts`
- `src/modules/ai/claudian/runtime/codex/CodexRuntime.ts`

### New tests

- `tests/ai/provider-workspaces.test.mjs`
- `tests/ai/provider-session-stores.test.mjs`
- `tests/ai/platform-bridges.test.mjs`
- `tests/ai/dyad-style-ai-shell.test.mjs`
- `tests/ai/classic-workspace-compat.test.mjs`

---

### Task 1: Replace the AI shell with explicit provider workspaces

**Files:**
- Create: `src/components/ai/workspaces/ClaudeWorkspace.tsx`
- Create: `src/components/ai/workspaces/CodexWorkspace.tsx`
- Create: `src/components/ai/workspaces/ClassicWorkspace.tsx`
- Create: `src/components/ai/workspaces/ProviderWorkspaceLayout.tsx`
- Create: `src/components/ai/workspaces/ProviderWorkspaceLayout.css`
- Modify: `src/components/ai/claudian-shell/ClaudianShell.tsx`
- Test: `tests/ai/provider-workspaces.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shellPath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianShell.tsx');

test('claudian shell mounts dedicated provider workspaces instead of a single generic chat page', async () => {
  const source = await readFile(shellPath, 'utf8');
  assert.match(source, /ClaudeWorkspace/);
  assert.match(source, /CodexWorkspace/);
  assert.match(source, /ClassicWorkspace/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/provider-workspaces.test.mjs`
Expected: FAIL because `ClaudianShell.tsx` still mounts `ClaudianChatPage`

- [ ] **Step 3: Write minimal implementation**

```tsx
import { ClaudeWorkspace } from '../workspaces/ClaudeWorkspace';
import { CodexWorkspace } from '../workspaces/CodexWorkspace';
import { ClassicWorkspace } from '../workspaces/ClassicWorkspace';

{currentMode === 'claude' ? <ClaudeWorkspace mode={mode} localSnapshot={localSnapshot} /> : null}
{currentMode === 'codex' ? <CodexWorkspace mode={mode} localSnapshot={localSnapshot} /> : null}
{currentMode === 'classic' ? <ClassicWorkspace mode={mode} /> : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/provider-workspaces.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/claudian-shell/ClaudianShell.tsx src/components/ai/workspaces tests/ai/provider-workspaces.test.mjs
git commit -m "feat: split ai shell into provider workspaces"
```

### Task 2: Split Claude and Codex session state from Classic

**Files:**
- Create: `src/modules/ai/provider-sessions/types.ts`
- Create: `src/modules/ai/provider-sessions/claudeSessionStore.ts`
- Create: `src/modules/ai/provider-sessions/codexSessionStore.ts`
- Create: `src/modules/ai/provider-sessions/persistence.ts`
- Test: `tests/ai/provider-session-stores.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const claudeStorePath = path.resolve(__dirname, '../../src/modules/ai/provider-sessions/claudeSessionStore.ts');
const codexStorePath = path.resolve(__dirname, '../../src/modules/ai/provider-sessions/codexSessionStore.ts');

test('provider session stores are independent for claude and codex', async () => {
  const claudeSource = await readFile(claudeStorePath, 'utf8');
  const codexSource = await readFile(codexStorePath, 'utf8');
  assert.match(claudeSource, /createClaudeSession/);
  assert.match(codexSource, /createCodexSession/);
  assert.doesNotMatch(claudeSource, /StoredChatMessage/);
  assert.doesNotMatch(codexSource, /StoredChatMessage/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/provider-session-stores.test.mjs`
Expected: FAIL because the provider session stores do not exist

- [ ] **Step 3: Write minimal implementation**

```ts
export type ClaudeMessage = { id: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt: number };
export type ClaudeSession = { id: string; title: string; messages: ClaudeMessage[]; active: boolean };

export const createClaudeSession = (title = 'New Claude Session'): ClaudeSession => ({
  id: `claude_${Date.now()}`,
  title,
  messages: [],
  active: false,
});
```

```ts
export type CodexMessage = { id: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt: number };
export type CodexSession = { id: string; title: string; messages: CodexMessage[]; active: boolean };

export const createCodexSession = (title = 'New Codex Session'): CodexSession => ({
  id: `codex_${Date.now()}`,
  title,
  messages: [],
  active: false,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/provider-session-stores.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/ai/provider-sessions tests/ai/provider-session-stores.test.mjs
git commit -m "feat: split provider session stores"
```

### Task 3: Build a reusable provider workspace UI skeleton

**Files:**
- Create: `src/components/ai/provider-chat/SessionSidebar.tsx`
- Create: `src/components/ai/provider-chat/MessageViewport.tsx`
- Create: `src/components/ai/provider-chat/ComposerToolbar.tsx`
- Create: `src/components/ai/provider-chat/RuntimeStatusBar.tsx`
- Create: `src/components/ai/provider-chat/providerChat.css`
- Modify: `src/components/ai/workspaces/ProviderWorkspaceLayout.tsx`
- Test: `tests/ai/dyad-style-ai-shell.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const layoutPath = path.resolve(__dirname, '../../src/components/ai/workspaces/ProviderWorkspaceLayout.tsx');

test('provider workspace layout exposes dyad-style session sidebar, message viewport, and composer zones', async () => {
  const source = await readFile(layoutPath, 'utf8');
  assert.match(source, /SessionSidebar/);
  assert.match(source, /MessageViewport/);
  assert.match(source, /ComposerToolbar/);
  assert.match(source, /RuntimeStatusBar/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/dyad-style-ai-shell.test.mjs`
Expected: FAIL because the provider workspace UI skeleton does not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
export const ProviderWorkspaceLayout: React.FC<{
  sidebar: React.ReactNode;
  status: React.ReactNode;
  messages: React.ReactNode;
  composer: React.ReactNode;
}> = ({ sidebar, status, messages, composer }) => (
  <section className="provider-workspace-layout">
    <aside className="provider-workspace-sidebar">{sidebar}</aside>
    <div className="provider-workspace-main">
      <div className="provider-workspace-status">{status}</div>
      <div className="provider-workspace-messages">{messages}</div>
      <div className="provider-workspace-composer">{composer}</div>
    </div>
  </section>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/dyad-style-ai-shell.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/provider-chat src/components/ai/workspaces/ProviderWorkspaceLayout.tsx src/components/ai/workspaces/ProviderWorkspaceLayout.css tests/ai/dyad-style-ai-shell.test.mjs
git commit -m "feat: add provider workspace ui skeleton"
```

### Task 4: Move Classic onto an explicit compatibility workspace

**Files:**
- Modify: `src/components/ai/workspaces/ClassicWorkspace.tsx`
- Modify: `src/components/workspace/AIChat.tsx`
- Test: `tests/ai/classic-workspace-compat.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const classicPath = path.resolve(__dirname, '../../src/components/ai/workspaces/ClassicWorkspace.tsx');

test('classic workspace keeps AIChat as compatibility mode only', async () => {
  const source = await readFile(classicPath, 'utf8');
  assert.match(source, /AIChat/);
  assert.match(source, /classic/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/classic-workspace-compat.test.mjs`
Expected: FAIL because `ClassicWorkspace.tsx` does not exist or does not mount `AIChat`

- [ ] **Step 3: Write minimal implementation**

```tsx
import { AIChat } from '../../workspace/AIChat';

export const ClassicWorkspace: React.FC<{ mode?: 'panel' | 'full-page' }> = ({ mode = 'full-page' }) => (
  <section className={`classic-workspace classic-workspace-${mode}`}>
    <AIChat variant={mode === 'full-page' ? 'default' : 'claudian-embedded'} />
  </section>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/classic-workspace-compat.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/workspaces/ClassicWorkspace.tsx src/components/workspace/AIChat.tsx tests/ai/classic-workspace-compat.test.mjs
git commit -m "refactor: isolate classic ai chat workspace"
```

### Task 5: Add platform capability bridge contracts

**Files:**
- Create: `src/modules/ai/platform-bridges/types.ts`
- Create: `src/modules/ai/platform-bridges/SkillBridge.ts`
- Create: `src/modules/ai/platform-bridges/ContextBridge.ts`
- Create: `src/modules/ai/platform-bridges/WorkspaceBridge.ts`
- Create: `src/modules/ai/platform-bridges/ActivityBridge.ts`
- Test: `tests/ai/platform-bridges.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillBridgePath = path.resolve(__dirname, '../../src/modules/ai/platform-bridges/SkillBridge.ts');
const contextBridgePath = path.resolve(__dirname, '../../src/modules/ai/platform-bridges/ContextBridge.ts');

test('platform bridges define provider-independent skill and context injection points', async () => {
  const skillSource = await readFile(skillBridgePath, 'utf8');
  const contextSource = await readFile(contextBridgePath, 'utf8');
  assert.match(skillSource, /SkillBridge/);
  assert.match(skillSource, /executeSkill/);
  assert.match(contextSource, /ContextBridge/);
  assert.match(contextSource, /buildPromptContext/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/platform-bridges.test.mjs`
Expected: FAIL because the bridge files do not exist yet

- [ ] **Step 3: Write minimal implementation**

```ts
export interface SkillBridge {
  listSkills(): Promise<Array<{ id: string; name: string }>>;
  executeSkill(skillId: string, input: string): Promise<{ summary: string }>;
}
```

```ts
export interface ContextBridge {
  buildPromptContext(): Promise<{ labels: string[]; content: string }>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/platform-bridges.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/ai/platform-bridges tests/ai/platform-bridges.test.mjs
git commit -m "feat: add platform capability bridge contracts"
```

### Task 6: Attach capability strip to Claude and Codex workspaces

**Files:**
- Create: `src/components/ai/provider-chat/PlatformCapabilityStrip.tsx`
- Modify: `src/components/ai/workspaces/ClaudeWorkspace.tsx`
- Modify: `src/components/ai/workspaces/CodexWorkspace.tsx`
- Test: `tests/ai/platform-bridges.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const claudeWorkspacePath = path.resolve(__dirname, '../../src/components/ai/workspaces/ClaudeWorkspace.tsx');
const codexWorkspacePath = path.resolve(__dirname, '../../src/components/ai/workspaces/CodexWorkspace.tsx');

test('provider workspaces expose a platform capability strip instead of embedding skills directly in the runtime core', async () => {
  const claudeSource = await readFile(claudeWorkspacePath, 'utf8');
  const codexSource = await readFile(codexWorkspacePath, 'utf8');
  assert.match(claudeSource, /PlatformCapabilityStrip/);
  assert.match(codexSource, /PlatformCapabilityStrip/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/platform-bridges.test.mjs`
Expected: FAIL because the provider workspaces do not expose the shared capability strip yet

- [ ] **Step 3: Write minimal implementation**

```tsx
<RuntimeStatusBar />
<PlatformCapabilityStrip providerId="claude" />
<MessageViewport />
<ComposerToolbar />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/platform-bridges.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/provider-chat/PlatformCapabilityStrip.tsx src/components/ai/workspaces/ClaudeWorkspace.tsx src/components/ai/workspaces/CodexWorkspace.tsx tests/ai/platform-bridges.test.mjs
git commit -m "feat: attach platform capability strip to provider workspaces"
```

### Task 7: Move Claude runtime off generic chat messages

**Files:**
- Modify: `src/modules/ai/claudian/runtime/claude/ClaudeRuntime.ts`
- Modify: `src/components/ai/workspaces/ClaudeWorkspace.tsx`
- Test: `tests/ai/provider-session-stores.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const claudeRuntimePath = path.resolve(__dirname, '../../src/modules/ai/claudian/runtime/claude/ClaudeRuntime.ts');

test('claude runtime exposes provider-native execution and session primitives', async () => {
  const source = await readFile(claudeRuntimePath, 'utf8');
  assert.match(source, /executePrompt/);
  assert.match(source, /providerId = 'claude'/);
  assert.doesNotMatch(source, /StoredChatMessage/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/provider-session-stores.test.mjs`
Expected: FAIL once the test begins checking for provider-native runtime/session separation

- [ ] **Step 3: Write minimal implementation**

```ts
export class ClaudeRuntime {
  readonly providerId = 'claude' as const;

  async executePrompt(options: {
    sessionId: string;
    prompt: string;
    systemPrompt?: string;
    onChunk?: (text: string) => void;
  }) {
    return '';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/provider-session-stores.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/ai/claudian/runtime/claude/ClaudeRuntime.ts src/components/ai/workspaces/ClaudeWorkspace.tsx tests/ai/provider-session-stores.test.mjs
git commit -m "feat: move claude workspace onto provider-native runtime contract"
```

### Task 8: Move Codex runtime off generic chat messages

**Files:**
- Modify: `src/modules/ai/claudian/runtime/codex/CodexRuntime.ts`
- Modify: `src/components/ai/workspaces/CodexWorkspace.tsx`
- Test: `tests/ai/provider-session-stores.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRuntimePath = path.resolve(__dirname, '../../src/modules/ai/claudian/runtime/codex/CodexRuntime.ts');

test('codex runtime exposes provider-native execution and session primitives', async () => {
  const source = await readFile(codexRuntimePath, 'utf8');
  assert.match(source, /executePrompt/);
  assert.match(source, /providerId = 'codex'/);
  assert.doesNotMatch(source, /StoredChatMessage/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/provider-session-stores.test.mjs`
Expected: FAIL once the test begins checking for Codex provider-native runtime/session separation

- [ ] **Step 3: Write minimal implementation**

```ts
export class CodexRuntime {
  readonly providerId = 'codex' as const;

  async executePrompt(options: {
    sessionId: string;
    prompt: string;
    systemPrompt?: string;
    onChunk?: (text: string) => void;
  }) {
    return '';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/provider-session-stores.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/ai/claudian/runtime/codex/CodexRuntime.ts src/components/ai/workspaces/CodexWorkspace.tsx tests/ai/provider-session-stores.test.mjs
git commit -m "feat: move codex workspace onto provider-native runtime contract"
```

### Task 9: Introduce dyad-style global visual primitives for the AI area

**Files:**
- Modify: `src/App.css`
- Modify: `src/components/ai/AIWorkspace.css`
- Modify: `src/components/ai/claudian-shell/ClaudianShell.css`
- Modify: `src/components/ai/provider-chat/providerChat.css`
- Test: `tests/ai/dyad-style-ai-shell.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shellCssPath = path.resolve(__dirname, '../../src/components/ai/claudian-shell/ClaudianShell.css');

test('ai shell css defines unified panel surfaces and provider workspace layout tokens', async () => {
  const source = await readFile(shellCssPath, 'utf8');
  assert.match(source, /--claudian-bg/);
  assert.match(source, /provider-workspace-layout/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/dyad-style-ai-shell.test.mjs`
Expected: FAIL until the dyad-style provider layout classes and tokens are present

- [ ] **Step 3: Write minimal implementation**

```css
.provider-workspace-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 12px;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ai/dyad-style-ai-shell.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.css src/components/ai/AIWorkspace.css src/components/ai/claudian-shell/ClaudianShell.css src/components/ai/provider-chat/providerChat.css tests/ai/dyad-style-ai-shell.test.mjs
git commit -m "style: apply dyad-inspired ai workspace primitives"
```

### Task 10: Verify the full migration baseline before deeper feature work

**Files:**
- No code changes required unless verification fails

- [ ] **Step 1: Run focused AI tests**

Run: `node --test tests/ai/claudian-provider-lock.test.mjs tests/ai/claudian-runtime-status.test.mjs tests/ai/claudian-chat-structure.test.mjs tests/ai/claudian-shell-components.test.mjs tests/ai/claudian-config-page.test.mjs tests/ai/ai-workspace.test.mjs tests/ai/claude-page.test.mjs tests/ai/claudian-shell-state.test.mjs tests/ai/claudian-mode-switch-placement.test.mjs tests/ai/claudian-provider-registry.test.mjs tests/ai/claudian-runtime-scaffold.test.mjs tests/ai/provider-workspaces.test.mjs tests/ai/provider-session-stores.test.mjs tests/ai/platform-bridges.test.mjs tests/ai/dyad-style-ai-shell.test.mjs tests/ai/classic-workspace-compat.test.mjs`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run Tauri verification**

Run: `cargo check`
Expected: PASS from `src-tauri`

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: verify dyad-style claudian ai migration baseline"
```
