# AI Settings Save And Model Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the duplicate save action from the AI settings drawer while keeping a single explicit `保存` action and preserving per-provider model switching.

**Architecture:** Keep the existing `settingsDraft -> handleApplySettings -> updateConfig` flow intact, and simplify only the settings drawer UI so there is one save entry point. Preserve the current model input, model-chip selection, and provider-scoped model catalog behavior instead of introducing new data structures.

**Tech Stack:** React 19, TypeScript, Zustand, Node `node:test`, source-file assertions

---

### Task 1: Lock The New Settings Drawer Contract With Tests

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\global-ai-settings.test.mjs`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\global-ai-settings.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('ai settings drawer keeps a single explicit save action and preserves model switching hooks', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.doesNotMatch(source, /淇濆瓨閰嶇疆/);

  const saveMatches = source.match(/>\s*淇濆瓨\s*</g) || [];
  assert.equal(saveMatches.length, 1);

  assert.match(source, /onClick=\{handleApplySettings\}/);
  assert.match(source, /value=\{settingsDraft\.model\}/);
  assert.match(source, /model:\s*event\.target\.value/);
  assert.match(source, /model:\s*candidate/);
  assert.match(source, /syncModelCatalog\(settingsDraft\.provider,\s*settingsDraft\.baseURL,\s*settingsModelOptions\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ai/global-ai-settings.test.mjs`
Expected: FAIL because `AIChat.tsx` still contains `淇濆瓨閰嶇疆`, and there are two save buttons in the drawer markup.

- [ ] **Step 3: Keep existing selector coverage**

```js
test('ai chat renders an enabled-only AI selector above the composer', async () => {
  const source = await readFile(chatPath, 'utf8');

  assert.match(source, /className="chat-ai-select"/);
  assert.match(source, /enabledConfigs\.map\(\(config\)/);
  assert.match(source, /selectConfig\(event\.target\.value \|\| null\)/);
  assert.match(source, /handleToggleEnabled/);
});
```

- [ ] **Step 4: Run test file again after adding the new assertion block**

Run: `node --test tests/ai/global-ai-settings.test.mjs`
Expected: FAIL only in the new save/model-switch test, while the existing selector/store assertions still execute.

- [ ] **Step 5: Commit**

```bash
git add tests/ai/global-ai-settings.test.mjs
git commit -m "test: cover ai settings single save flow"
```

### Task 2: Remove The Duplicate Save Button In The Drawer Header

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\workspace\AIChat.tsx`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\global-ai-settings.test.mjs`

- [ ] **Step 1: Write the minimal markup change**

```tsx
<div className="chat-settings-detail-header">
  <div>
    <strong>{settingsDraft.name || '鏈懡鍚?AI'}</strong>
    <span>淇濆瓨涓烘湰鍦伴厤缃」锛屽彧鏈夊惎鐢ㄥ悗鎵嶄細鍑虹幇鍦ㄨ亰澶╅€夋嫨閲屻€?/span>
  </div>
</div>
```

- [ ] **Step 2: Keep the existing single save implementation in the action row**

```tsx
<div className="chat-settings-actions">
  <button className="chat-settings-apply-btn secondary" type="button" onClick={handleApplySettings}>
    淇濆瓨
  </button>
  <button className="chat-settings-apply-btn" type="button" onClick={handleToggleEnabled}>
    {settingsDraft.enabled ? '鍏抽棴' : '鍚敤'}
  </button>
  <button className="chat-settings-apply-btn" type="button" onClick={() => void handleTestConnection()}>
    {testState === 'testing' ? '娴嬭瘯涓€? : '娴嬭瘯杩炴帴'}
  </button>
</div>
```

- [ ] **Step 3: Preserve model switching behavior untouched**

```tsx
<input
  value={settingsDraft.model}
  onChange={(event) =>
    setSettingsDraft((current) => ({
      ...current,
      model: event.target.value,
    }))
  }
/>

{settingsModelOptions.map((candidate) => (
  <button
    key={candidate}
    type="button"
    onClick={() =>
      setSettingsDraft((current) => ({
        ...current,
        model: candidate,
      }))
    }
  >
    {candidate}
  </button>
))}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --test tests/ai/global-ai-settings.test.mjs`
Expected: PASS, confirming the drawer now exposes one save action and still supports model editing and candidate selection.

- [ ] **Step 5: Commit**

```bash
git add src/components/workspace/AIChat.tsx tests/ai/global-ai-settings.test.mjs
git commit -m "fix: simplify ai settings save actions"
```

### Task 3: Verify No Regression In The Current Frontend Checks

**Files:**
- Verify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\global-ai-settings.test.mjs`
- Verify: `C:\Users\Even\Documents\ALL-IN-ONE\tests\ai\ai-config-list.test.mjs`
- Verify: `C:\Users\Even\Documents\ALL-IN-ONE\package.json`

- [ ] **Step 1: Run the settings-specific tests**

Run: `node --test tests/ai/global-ai-settings.test.mjs tests/ai/ai-config-list.test.mjs`
Expected: PASS with zero failures.

- [ ] **Step 2: Run the frontend build**

Run: `npm run build`
Expected: exit code 0 and a successful Vite build output.

- [ ] **Step 3: Review the changed files before handoff**

```bash
git diff -- src/components/workspace/AIChat.tsx tests/ai/global-ai-settings.test.mjs
```

Expected: only the duplicate save button removal and the matching test updates appear in the diff.

- [ ] **Step 4: Commit**

```bash
git add src/components/workspace/AIChat.tsx tests/ai/global-ai-settings.test.mjs
git commit -m "test: verify ai settings drawer save flow"
```
