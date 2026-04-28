# macOS Workbench UI System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable macOS-style UI foundation for GoodNight and apply it to the top-level workbench shell, toolbar, primary navigation, and project manager surfaces.

**Architecture:** Add a shared UI foundation layer with macOS theme tokens and Radix-backed primitives, then wire the desktop shell and project entry surfaces into that layer without rewriting deep business content. Keep visual rules centralized and reuse wrappers from `src/components/ui`.

**Tech Stack:** React 19, TypeScript, Vite, Tauri, CSS, Radix UI Primitives, Node test runner

---

### Task 1: Lock the UI-system contract with a failing regression test

**Files:**
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\tests\macos-ui-system.test.mjs`
- Read: `C:\Users\Even\Documents\ALL-IN-ONE\package.json`
- Read: `C:\Users\Even\Documents\ALL-IN-ONE\src\App.tsx`
- Read: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\project\ProjectSetup.tsx`
- Read: `C:\Users\Even\Documents\ALL-IN-ONE\src\App.css`

- [ ] **Step 1: Write the failing test**

```js
test('macOS UI system is wired into desktop shell and project manager', async () => {
  assert.match(packageJson, /@radix-ui\/react-dialog/);
  assert.match(appSource, /MacIconButton/);
  assert.match(projectSetupSource, /MacButton/);
  assert.match(appCss, /--macos-window-bg/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/macos-ui-system.test.mjs`
Expected: FAIL because the Radix dependencies, component imports, and macOS tokens are not present yet

- [ ] **Step 3: Commit the red test only after verifying failure**

```bash
git add tests/macos-ui-system.test.mjs
git commit -m "test: add macOS ui system regression"
```

### Task 2: Add the UI foundation and shared primitives

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\package.json`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\package-lock.json`
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\ui\MacButton.tsx`
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\ui\MacPanel.tsx`
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\ui\MacField.tsx`
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\ui\MacDialog.tsx`
- Create: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\ui\index.ts`

- [ ] **Step 1: Add Radix primitive dependencies**

```json
{
  "dependencies": {
    "@radix-ui/react-dialog": "...",
    "@radix-ui/react-dropdown-menu": "...",
    "@radix-ui/react-tooltip": "..."
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: lockfile updated with Radix packages

- [ ] **Step 3: Create minimal shared wrappers**

```tsx
export const MacButton = ({ variant = 'secondary', size = 'md', ...props }) => (
  <button className={`mac-button mac-button-${variant} mac-button-${size}`} {...props} />
);
```

```tsx
export const MacPanel = ({ className, ...props }) => (
  <section className={['mac-panel', className].filter(Boolean).join(' ')} {...props} />
);
```

- [ ] **Step 4: Re-export the UI layer**

```ts
export * from './MacButton';
export * from './MacPanel';
export * from './MacField';
export * from './MacDialog';
```

### Task 3: Apply the foundation to the top-level workbench shell

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\App.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\App.css`

- [ ] **Step 1: Swap desktop shell chrome to shared primitives**

```tsx
<MacIconButton className="desktop-rail-icon-btn" ...>
  <WorkbenchIcon name="moon" />
</MacIconButton>
```

- [ ] **Step 2: Add macOS theme tokens and shell classes**

```css
:root {
  --macos-window-bg: ...;
  --macos-panel-bg: ...;
}
```

- [ ] **Step 3: Re-skin the desktop rail, topbar, feature pill, select shell, and workbench panes**

```css
.desktop-primary-rail { ... }
.desktop-workbench-topbar { ... }
.app-workbench-pane { ... }
```

### Task 4: Apply the foundation to the project manager surface

**Files:**
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\components\project\ProjectSetup.tsx`
- Modify: `C:\Users\Even\Documents\ALL-IN-ONE\src\App.css`

- [ ] **Step 1: Replace primary and secondary actions with shared button primitives**

```tsx
<MacButton variant="primary" type="submit">创建项目</MacButton>
```

- [ ] **Step 2: Wrap storage and project cards in the shared panel surface**

```tsx
<MacPanel className="project-manager-panel">...</MacPanel>
```

- [ ] **Step 3: Use the shared field shell for text inputs and selects**

```tsx
<MacField label="项目名称">
  <input ... />
</MacField>
```

### Task 5: Verify the UI foundation and shell integration

**Files:**
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\macos-ui-system.test.mjs`
- Test: `C:\Users\Even\Documents\ALL-IN-ONE\tests\desktop-workbench-ui.test.mjs`

- [ ] **Step 1: Run the new UI-system regression test**

Run: `node --test tests/macos-ui-system.test.mjs`
Expected: PASS

- [ ] **Step 2: Run existing desktop shell regression coverage**

Run: `node --test tests/desktop-workbench-ui.test.mjs`
Expected: PASS

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: exit code 0

- [ ] **Step 4: Commit the implementation**

```bash
git add package.json package-lock.json src/App.tsx src/App.css src/components/ui src/components/project/ProjectSetup.tsx tests/macos-ui-system.test.mjs
git commit -m "feat: add macOS workbench ui foundation"
```
