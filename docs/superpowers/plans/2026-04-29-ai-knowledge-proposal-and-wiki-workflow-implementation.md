# AI Knowledge Proposal And Wiki Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-controlled knowledge proposal flow so AI can suggest note/wiki maintenance in chat without silently mutating the knowledge base.

**Architecture:** Keep the current knowledge note store and AI chat shell, then layer a small policy module, a structured proposal model/store, proposal generation helpers, and chat-side execution hooks on top. The first slice supports proposal generation and user-approved `create/update note/wiki` execution, while delete-like operations stay as non-destructive candidate tags.

**Tech Stack:** React 19, TypeScript, Zustand, node:test, Vite

---

### Task 1: Add failing tests for policy and proposal helper behavior

**Files:**
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-proposal-policy.test.mjs`
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-proposal-builders.test.mjs`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-proposal-policy.test.mjs`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-proposal-builders.test.mjs`

- [ ] **Step 1: Write the failing tests**

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadModule = async (relativePath) => {
  const modulePath = path.resolve(__dirname, `../src/${relativePath}`);
  const source = await readFile(modulePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: pathToFileURL(modulePath).href,
  });

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled.outputText)}`);
};

test('knowledge operation policy keeps AI read-only before approval', async () => {
  const { buildKnowledgeOperationPolicy } = await loadModule('modules/ai/knowledge/knowledgeOperationPolicy.ts');
  const policy = buildKnowledgeOperationPolicy();

  assert.match(policy, /默认只读/);
  assert.match(policy, /不能直接删除/);
  assert.match(policy, /用户批准/);
});
```

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadModule = async (relativePath) => {
  const modulePath = path.resolve(__dirname, `../src/${relativePath}`);
  const source = await readFile(modulePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: pathToFileURL(modulePath).href,
  });

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled.outputText)}`);
};

test('buildKnowledgeProposal creates a wiki update proposal from distilled evidence', async () => {
  const { buildKnowledgeProposal } = await loadModule('modules/ai/knowledge/buildKnowledgeProposal.ts');

  const proposal = buildKnowledgeProposal({
    projectId: 'project-1',
    summary: '发现一条项目总览已过时',
    trigger: 'wiki-stale',
    operations: [
      {
        type: 'update_wiki',
        targetTitle: '项目总览.md',
        reason: '当前对话总结出的 onboarding 流程与 wiki 不一致',
        evidence: ['note:需求讨论.md', 'chat:最近一轮问答'],
        draftContent: '# 项目总览\n\n更新后的 onboarding 流程',
      },
    ],
  });

  assert.equal(proposal.projectId, 'project-1');
  assert.equal(proposal.operations.length, 1);
  assert.equal(proposal.operations[0].selected, true);
  assert.equal(proposal.operations[0].type, 'update_wiki');
});

test('executeable proposal signal only triggers for supported reasons', async () => {
  const { shouldSuggestKnowledgeProposal } = await loadModule('modules/ai/knowledge/shouldSuggestKnowledgeProposal.ts');

  assert.equal(shouldSuggestKnowledgeProposal({ hasGap: true, hasStaleWiki: false, hasDuplicates: false, canDistill: false }), true);
  assert.equal(shouldSuggestKnowledgeProposal({ hasGap: false, hasStaleWiki: false, hasDuplicates: false, canDistill: false }), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/knowledge-proposal-policy.test.mjs tests/knowledge-proposal-builders.test.mjs`

Expected: FAIL because the knowledge proposal modules do not exist yet.

- [ ] **Step 3: Write minimal helper implementations**

Create:

- `src/modules/ai/knowledge/knowledgeOperationPolicy.ts`
- `src/modules/ai/knowledge/buildKnowledgeProposal.ts`
- `src/modules/ai/knowledge/shouldSuggestKnowledgeProposal.ts`

with the exported functions used by the tests.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/knowledge-proposal-policy.test.mjs tests/knowledge-proposal-builders.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/knowledge-proposal-policy.test.mjs tests/knowledge-proposal-builders.test.mjs src/modules/ai/knowledge/knowledgeOperationPolicy.ts src/modules/ai/knowledge/buildKnowledgeProposal.ts src/modules/ai/knowledge/shouldSuggestKnowledgeProposal.ts
git commit -m "test: add knowledge proposal policy helpers"
```

### Task 2: Add the knowledge proposal model and store

**Files:**
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\features\knowledge\model\knowledgeProposal.ts`
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\features\knowledge\store\knowledgeProposalStore.ts`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-proposal-builders.test.mjs`

- [ ] **Step 1: Define the proposal types**

Create types for:

- `KnowledgeProposal`
- `KnowledgeProposalOperation`
- `KnowledgeProposalTrigger`
- `KnowledgeProposalStatus`
- `KnowledgeProposalOperationType`

- [ ] **Step 2: Add a small Zustand store**

Support:

- upsert proposal
- dismiss proposal
- select/deselect operation
- mark executing
- mark executed

- [ ] **Step 3: Cover the default selection behavior in tests**

Extend `tests/knowledge-proposal-builders.test.mjs` so proposal operations must default to `selected: true`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/knowledge-proposal-builders.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/knowledge/model/knowledgeProposal.ts src/features/knowledge/store/knowledgeProposalStore.ts tests/knowledge-proposal-builders.test.mjs
git commit -m "feat: add knowledge proposal store"
```

### Task 3: Add execution helpers on top of the existing knowledge store

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\features\knowledge\store\knowledgeStore.ts`
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\knowledge\executeKnowledgeProposal.ts`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-proposal-builders.test.mjs`

- [ ] **Step 1: Add an execution helper that maps selected operations to note writes**

Support first-version execution for:

- `create_note`
- `update_note`
- `create_wiki`
- `update_wiki`
- `archive_candidate`
- `mark_stale`

Use tags for non-destructive state:

- `status/archived`
- `status/stale`
- `kind/wiki`

- [ ] **Step 2: Keep delete out of the execution path**

Reject:

- `delete_note`
- `delete_wiki`

if they ever appear.

- [ ] **Step 3: Add a test for unsupported delete-like operations**

Extend `tests/knowledge-proposal-builders.test.mjs` with a small pure helper test proving delete operations are not execution candidates.

- [ ] **Step 4: Run tests**

Run: `node --test tests/knowledge-proposal-builders.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/knowledge/store/knowledgeStore.ts src/modules/ai/knowledge/executeKnowledgeProposal.ts tests/knowledge-proposal-builders.test.mjs
git commit -m "feat: add knowledge proposal execution helpers"
```

### Task 4: Integrate proposal suggestion into AI chat

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\modules\ai\store\aiChatStore.ts`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\ai\claudian\ClaudianEmbeddedPieces.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.css`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-proposal-chat-ui.test.mjs`

- [ ] **Step 1: Add a failing chat UI regression test**

Create `tests/knowledge-proposal-chat-ui.test.mjs` that checks:

- chat messages can carry proposal metadata
- AIChat renders proposal controls for assistant messages with a proposal payload

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/knowledge-proposal-chat-ui.test.mjs`

Expected: FAIL because chat messages do not yet support proposal payloads.

- [ ] **Step 3: Extend stored chat messages with optional proposal metadata**

Add an optional `knowledgeProposal` field to `StoredChatMessage`.

- [ ] **Step 4: Render proposal cards in the chat message list**

Show:

- proposal summary
- operations
- evidence
- draft preview
- buttons for execute, dismiss, toggle

- [ ] **Step 5: Suggest proposals after normal AI answers**

After a normal answer completes, inspect the answer and current knowledge context. If a supported signal exists, attach a proposal card to the assistant message instead of silently writing to the knowledge base.

- [ ] **Step 6: Run the targeted tests**

Run: `node --test tests/knowledge-proposal-policy.test.mjs tests/knowledge-proposal-builders.test.mjs tests/knowledge-proposal-chat-ui.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/workspace/AIChat.tsx src/modules/ai/store/aiChatStore.ts src/components/ai/claudian/ClaudianEmbeddedPieces.tsx src/components/workspace/AIChat.css tests/knowledge-proposal-chat-ui.test.mjs
git commit -m "feat: surface knowledge proposals in AI chat"
```

### Task 5: Wire chat approvals to real execution and refresh the workspace

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\product\ProductWorkbench.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\features\knowledge\store\knowledgeStore.ts`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\knowledge-proposal-chat-ui.test.mjs`

- [ ] **Step 1: Add execute and dismiss handlers in AIChat**

Execute only selected operations and update the proposal status in both chat and proposal store.

- [ ] **Step 2: Refresh knowledge notes after proposal execution**

Reload the project notes so the knowledge workspace reflects new note/wiki content immediately.

- [ ] **Step 3: Add a chat UI regression check for status changes**

Extend the chat UI test so executed proposals render a completed state and dismissed proposals disappear or become inactive.

- [ ] **Step 4: Run the targeted tests**

Run: `node --test tests/knowledge-proposal-policy.test.mjs tests/knowledge-proposal-builders.test.mjs tests/knowledge-proposal-chat-ui.test.mjs`

Expected: PASS

- [ ] **Step 5: Run the build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/workspace/AIChat.tsx src/components/product/ProductWorkbench.tsx src/features/knowledge/store/knowledgeStore.ts tests/knowledge-proposal-chat-ui.test.mjs
git commit -m "feat: execute approved knowledge proposals"
```

## Self-Review

Spec coverage:

- The plan covers the read-only default rule via Task 1.
- The plan covers structured proposal types and status via Task 2.
- The plan covers non-destructive execution boundaries via Task 3.
- The plan covers chat-only proposal presentation and approval flow via Task 4 and Task 5.
- The plan covers first-version note/wiki execution and refresh behavior via Task 3 and Task 5.
- The plan intentionally does not implement a knowledge-panel approval center because the spec marked that out of scope.

Placeholder scan:

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Each code-bearing task names exact files and verification commands.

Type consistency:

- `KnowledgeProposal` and `KnowledgeProposalOperation` are defined before store and chat integration tasks use them.
- `shouldSuggestKnowledgeProposal`, `buildKnowledgeProposal`, and `executeKnowledgeProposal` are introduced before integration tasks depend on them.
