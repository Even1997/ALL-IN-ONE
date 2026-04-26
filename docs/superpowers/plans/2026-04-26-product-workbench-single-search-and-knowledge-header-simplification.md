# Product Workbench Single Search And Knowledge Header Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the product workbench left-nav project title with a single tab-aware search box, remove duplicate in-panel search inputs, and simplify the knowledge markdown header chrome.

**Architecture:** Keep the change inside the existing `ProductWorkbench` shell. Reuse the current `knowledgeSearch` and `pageSearch` state, remove duplicate JSX branches instead of refactoring structure, and verify behavior with source-level regression tests that match the repo's current testing style.

**Tech Stack:** React 19, TypeScript, existing `ProductWorkbench.tsx` UI structure, Node built-in `node:test` source assertions.

---

### Task 1: Lock The UI Contract With Regression Tests

**Files:**
- Modify: `tests/product-workbench.test.mjs`
- Read for context: `src/components/product/ProductWorkbench.tsx`

- [ ] **Step 1: Write the failing test**

```javascript
test('product workbench uses one left-nav search input and removes duplicate in-panel knowledge chrome', async () => {
  const source = await readFile(productWorkbenchPath, 'utf8');

  assert.match(source, /className="product-input pm-nav-header-search"/);
  assert.match(source, /value=\{sidebarTab === 'requirement' \? knowledgeSearch : pageSearch\}/);
  assert.match(source, /placeholder=\{sidebarTab === 'requirement' \? '搜索文档' : '搜索页面'\}/);
  assert.doesNotMatch(source, /className="product-input pm-knowledge-search-input"/);
  assert.doesNotMatch(source, /className="product-input pm-page-search-input"/);
  assert.doesNotMatch(source, /selectedKnowledgeEntry\.status/);
  assert.doesNotMatch(source, /new Date\(selectedKnowledgeEntry\.updatedAt\)\.toLocaleString\(\)/);
  assert.doesNotMatch(source, /handleCreateKnowledgeFile\('project'\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/product-workbench.test.mjs`
Expected: FAIL in the new regression because the left nav still renders the project title, both in-panel search inputs still exist, and the knowledge header still contains the old metadata/new button structure.

- [ ] **Step 3: Write minimal implementation**

```tsx
<div className="pm-nav-header">
  <input
    className="product-input pm-nav-header-search"
    type="search"
    value={sidebarTab === 'requirement' ? knowledgeSearch : pageSearch}
    onChange={(event) => {
      if (sidebarTab === 'requirement') {
        setKnowledgeSearch(event.target.value);
        return;
      }

      setPageSearch(event.target.value);
    }}
    placeholder={sidebarTab === 'requirement' ? '搜索文档' : '搜索页面'}
  />
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/product-workbench.test.mjs`
Expected: PASS for the new regression and the existing product workbench assertions.

- [ ] **Step 5: Commit**

```bash
git add tests/product-workbench.test.mjs src/components/product/ProductWorkbench.tsx src/App.css docs/superpowers/plans/2026-04-26-product-workbench-single-search-and-knowledge-header-simplification.md
git commit -m "feat: simplify product workbench search chrome"
```

### Task 2: Apply The JSX And CSS Cleanup

**Files:**
- Modify: `src/components/product/ProductWorkbench.tsx`
- Modify: `src/App.css`
- Test: `tests/product-workbench.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
test('product workbench left-nav search keeps the header compact in css', async () => {
  const source = await readFile(appCssPath, 'utf8');

  assert.match(source, /\.pm-nav-header-search\s*{/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/product-workbench.test.mjs`
Expected: FAIL because `.pm-nav-header-search` does not exist in `src/App.css`.

- [ ] **Step 3: Write minimal implementation**

```css
.pm-nav-header-search {
  width: 100%;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/product-workbench.test.mjs`
Expected: PASS with the new CSS assertion and the earlier JSX regression.

- [ ] **Step 5: Commit**

```bash
git add tests/product-workbench.test.mjs src/components/product/ProductWorkbench.tsx src/App.css docs/superpowers/plans/2026-04-26-product-workbench-single-search-and-knowledge-header-simplification.md
git commit -m "feat: simplify product workbench search chrome"
```

## Verification Commands

- `node --test tests/product-workbench.test.mjs`
- `npm run build`

## Spec Coverage Check

- Single left-nav search replaces project title: Task 1 implementation.
- Knowledge/page in-panel searches removed: Task 1 regression plus implementation.
- Knowledge markdown header metadata removed: Task 1 regression plus implementation.
- Knowledge top-level "new" button removed while keeping upload/edit/delete core actions: Task 1 regression plus implementation.
- Minimal CSS support for the new header input: Task 2.
