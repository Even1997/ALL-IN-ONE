# GoodNight Skills Library Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the current skills experience so the product clearly treats skills as GoodNight-only assets stored in `.goodnight`, not as mixed Codex/Claude runtime controls.

**Architecture:** Keep the existing GoodNight skill registry and import/delete commands, but remove runtime-sync language from the skills page surface. Update source tests to lock the `.goodnight` root and GoodNight-owned command surface, then update the page UI so the main interaction is import/manage/delete rather than sync-to-runtime. This is a narrow first slice, not a backend rewrite.

**Tech Stack:** React, TypeScript, Tauri command wrappers, Node source tests

---

## File Structure

### Specs and planning

- Modify: `docs/superpowers/specs/2026-04-26-goodnight-unified-skill-library-and-runtime-sync-design.zh-CN.md`
- Modify: `docs/superpowers/specs/2026-04-30-global-skill-library-page-design.zh-CN.md`
- Modify: `docs/superpowers/specs/2026-05-01-goodnight-skills-library-visual-redesign.zh-CN.md`

### Skills page source and wrappers

- Modify: `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
- Modify: `src/modules/ai/skills/skillLibrary.ts`

### Tests

- Modify: `tests/ai/gn-agent-skills-page.test.mjs`
- Modify: `tests/ai/skill-library-source.test.mjs`

## Task 1: Lock the GoodNight-only product boundary in source tests

**Files:**
- Modify: `tests/ai/gn-agent-skills-page.test.mjs`
- Modify: `tests/ai/skill-library-source.test.mjs`

- [ ] **Step 1: Write the failing page-source test**

Replace the current runtime-oriented assertions in `tests/ai/gn-agent-skills-page.test.mjs` with:

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx');
const libraryPath = path.resolve(__dirname, '../../src/modules/ai/skills/skillLibrary.ts');

test('gnAgent skills page exposes a GoodNight-owned global skill library surface', async () => {
  const pageSource = await readFile(pagePath, 'utf8');
  const librarySource = await readFile(libraryPath, 'utf8');

  assert.match(pageSource, /discoverLocalSkills/);
  assert.match(pageSource, /importLocalSkill/);
  assert.match(pageSource, /importGitHubSkill/);
  assert.match(pageSource, /deleteLibrarySkill/);
  assert.match(pageSource, /GoodNight Skills/);
  assert.match(pageSource, /\\.goodnight/);
  assert.match(pageSource, /Import Local Skill/);
  assert.match(pageSource, /Download from GitHub/);
  assert.match(pageSource, /Delete/);

  assert.doesNotMatch(pageSource, /syncSkillToRuntime/);
  assert.doesNotMatch(pageSource, /Sync to Codex/);
  assert.doesNotMatch(pageSource, /Sync to Claude/);

  assert.match(librarySource, /builtin:\\s*boolean/);
  assert.match(librarySource, /deletable:\\s*boolean/);
  assert.match(librarySource, /delete_library_skill/);
});
```

- [ ] **Step 2: Write the failing backend-source test**

Replace the current runtime-mixing assertions in `tests/ai/skill-library-source.test.mjs` with:

```javascript
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const libPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src-tauri/src/lib.rs');

test('tauri owns a GoodNight skill root and exposes discovery, import, github import, and delete commands', async () => {
  const source = await readFile(libPath, 'utf8');

  assert.match(source, /goodnight/i);
  assert.match(source, /ensure_builtin_skills_installed/);
  assert.match(source, /goodnight-skills/);
  assert.match(source, /builtin:\\s*bool/);
  assert.match(source, /deletable:\\s*bool/);
  assert.match(source, /fn\\s+discover_local_skills/);
  assert.match(source, /fn\\s+import_local_skill/);
  assert.match(source, /fn\\s+import_github_skill/);
  assert.match(source, /fn\\s+delete_library_skill/);

  assert.match(source, /tauri::generate_handler!\\[[\\s\\S]*discover_local_skills/);
  assert.match(source, /tauri::generate_handler!\\[[\\s\\S]*import_local_skill/);
  assert.match(source, /tauri::generate_handler!\\[[\\s\\S]*import_github_skill/);
  assert.match(source, /tauri::generate_handler!\\[[\\s\\S]*delete_library_skill/);
});
```

- [ ] **Step 3: Run the focused tests to verify RED**

Run: `node --test tests/ai/gn-agent-skills-page.test.mjs tests/ai/skill-library-source.test.mjs`

Expected: FAIL because the current page still references `syncSkillToRuntime`, `Sync to Codex`, and `Sync to Claude`.

- [ ] **Step 4: Commit the red tests**

```bash
git add tests/ai/gn-agent-skills-page.test.mjs tests/ai/skill-library-source.test.mjs
git commit -m "test: lock goodnight-only skills boundary"
```

## Task 2: Remove runtime-sync language from the skills page and center it on `.goodnight`

**Files:**
- Modify: `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx`
- Modify: `src/modules/ai/skills/skillLibrary.ts`

- [ ] **Step 1: Write the minimal implementation**

Update `src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx` to remove runtime-sync imports, status chips, and buttons. Keep discovery/import/delete behavior, but rewrite the copy around the `.goodnight` global library:

```tsx
import React, { useEffect, useState } from 'react';
import {
  deleteLibrarySkill,
  discoverLocalSkills,
  importGitHubSkill,
  importLocalSkill,
  type SkillDiscoveryEntry,
} from '../../../modules/ai/skills/skillLibrary';

const formatSourceBadge = (skill: SkillDiscoveryEntry) => {
  if (skill.builtin) {
    return 'Built-in';
  }

  if (skill.imported) {
    return 'In Library';
  }

  return 'Import Source';
};

export const GNAgentSkillsPage: React.FC = () => {
  const [skills, setSkills] = useState<SkillDiscoveryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadSkills = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const entries = await discoverLocalSkills();
      setSkills(entries);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSkills();
  }, []);

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setIsWorking(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await action();
      setStatusMessage(successMessage);
      await loadSkills();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorking(false);
    }
  };

  const handleImportLocal = async () => {
    const sourcePath = window.prompt('Import Local Skill: enter a local skill file or folder path.')?.trim();
    if (!sourcePath) {
      return;
    }

    await runAction(() => importLocalSkill(sourcePath), 'Skill imported into the GoodNight library.');
  };

  const handleImportGitHub = async () => {
    const repo = window.prompt('Download from GitHub: enter owner/repo.')?.trim();
    if (!repo) {
      return;
    }

    const path = window.prompt('Download from GitHub: enter the skill path in that repo.')?.trim();
    if (!path) {
      return;
    }

    const gitRef = window.prompt('Optional git ref (branch, tag, or commit). Leave blank for main.')?.trim() || undefined;
    await runAction(() => importGitHubSkill({ repo, path, gitRef }), 'GitHub skill imported into the GoodNight library.');
  };

  const handleDeleteSkill = async (skill: SkillDiscoveryEntry) => {
    if (!skill.deletable) {
      return;
    }

    if (!window.confirm(`Delete ${skill.name} from the GoodNight library?`)) {
      return;
    }

    await runAction(() => deleteLibrarySkill(skill.id), 'Skill deleted from the GoodNight library.');
  };

  return (
    <section className="gn-agent-shell-page gn-agent-skills-page">
      <header className="gn-agent-shell-page-header gn-agent-shell-page-header-stack">
        <div className="gn-agent-shell-page-header-copy">
          <span className="gn-agent-context-badge">GN Agent</span>
          <h3>GoodNight Skills</h3>
          <p>GoodNight keeps its global skills in the user-level `.goodnight` library. Manage skills here, then call them from chat with `@skill`.</p>
        </div>
        <div className="gn-agent-skills-toolbar">
          <button type="button" className="gn-agent-skills-action-btn" onClick={() => void handleImportLocal()} disabled={isWorking}>
            Import Local Skill
          </button>
          <button type="button" className="gn-agent-skills-action-btn" onClick={() => void handleImportGitHub()} disabled={isWorking}>
            Download from GitHub
          </button>
          <button type="button" className="gn-agent-skills-action-btn secondary" onClick={() => void loadSkills()} disabled={isWorking || isLoading}>
            Refresh
          </button>
        </div>
      </header>

      {statusMessage ? <div className="gn-agent-skills-banner success">{statusMessage}</div> : null}
      {errorMessage ? <div className="gn-agent-skills-banner error">{errorMessage}</div> : null}

      <div className="gn-agent-skills-grid">
        {isLoading ? (
          <article className="gn-agent-skills-card">
            <strong>Loading skills...</strong>
            <span>Scanning the GoodNight global library and available import sources.</span>
          </article>
        ) : null}

        {!isLoading && skills.length === 0 ? (
          <article className="gn-agent-skills-card">
            <strong>No skills found</strong>
            <span>Import a local skill or download one from GitHub to populate `.goodnight`.</span>
          </article>
        ) : null}

        {!isLoading
          ? skills.map((skill) => (
              <article key={`${skill.source}-${skill.id}-${skill.path}`} className="gn-agent-skills-card">
                <div className="gn-agent-skills-card-header">
                  <div>
                    <strong>{skill.name}</strong>
                    <span>{skill.id}</span>
                  </div>
                  <span className={`gn-agent-skills-source-badge${skill.builtin ? ' builtin' : ''}`}>{formatSourceBadge(skill)}</span>
                </div>

                <div className="gn-agent-skills-meta">
                  <code>{skill.path}</code>
                  <div className="gn-agent-skills-tags">
                    {skill.builtin ? <span>System skill</span> : null}
                    {skill.imported && !skill.builtin ? <span>Stored in .goodnight</span> : null}
                    {!skill.imported ? <span>Available to import</span> : null}
                  </div>
                </div>

                <div className="gn-agent-skills-actions">
                  {skill.deletable ? (
                    <button
                      type="button"
                      className="gn-agent-skills-card-btn danger"
                      disabled={isWorking}
                      onClick={() => void handleDeleteSkill(skill)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          : null}
      </div>
    </section>
  );
};
```

- [ ] **Step 2: Remove the now-unused runtime wrapper export**

Edit `src/modules/ai/skills/skillLibrary.ts` so the page-facing wrapper no longer exports sync helpers from this module surface:

```ts
import { invoke } from '@tauri-apps/api/core';

export type SkillDiscoveryEntry = {
  id: string;
  name: string;
  source: string;
  path: string;
  manifestPath: string;
  imported: boolean;
  builtin: boolean;
  deletable: boolean;
  syncedToCodex: boolean;
  syncedToClaude: boolean;
};

export type SkillDeleteResult = {
  skillId: string;
  deletedPath: string;
  deleted: boolean;
};

export type GitHubSkillImportParams = {
  repo: string;
  path: string;
  gitRef?: string;
};

export const discoverLocalSkills = (params?: { projectRoot?: string | null }) =>
  invoke<SkillDiscoveryEntry[]>('discover_local_skills', params ? { params } : undefined);

export const importLocalSkill = (sourcePath: string) =>
  invoke<SkillDiscoveryEntry>('import_local_skill', { params: { sourcePath } });

export const importGitHubSkill = (params: GitHubSkillImportParams) =>
  invoke<SkillDiscoveryEntry>('import_github_skill', { params });

export const deleteLibrarySkill = (skillId: string) =>
  invoke<SkillDeleteResult>('delete_library_skill', { params: { skillId } });
```

- [ ] **Step 3: Run the focused tests to verify GREEN**

Run: `node --test tests/ai/gn-agent-skills-page.test.mjs tests/ai/skill-library-source.test.mjs`

Expected: PASS

- [ ] **Step 4: Commit the UI alignment**

```bash
git add src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx src/modules/ai/skills/skillLibrary.ts
git commit -m "feat: align skills page to goodnight library"
```

## Task 3: Run the broader regression checks for the current slice

**Files:**
- Modify: none unless failures require minimal fixes

- [ ] **Step 1: Run the existing GN Agent shell checks**

Run: `node --test tests/ai/gn-agent-shell-components.test.mjs tests/ai/gn-agent-shell-state.test.mjs`

Expected: PASS

- [ ] **Step 2: Run the related skills and chat UI checks**

Run: `node --test tests/ai/ai-chat-skills-and-activity-ui.test.mjs tests/ai/gn-agent-skills-page.test.mjs tests/ai/skill-library-source.test.mjs`

Expected: PASS

- [ ] **Step 3: Run the frontend build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 4: Commit any directly-related follow-up fixes**

```bash
git add .
git commit -m "chore: verify goodnight skills alignment"
```

## Self-Review

### Spec coverage

- Skills are GoodNight-only and anchored to `.goodnight`: covered by Task 1 and Task 2 UI copy changes.
- Skills page no longer mixes runtime controls: covered by Task 1 red tests and Task 2 implementation.
- Chat remains `@skill`-based: guarded by Task 3 regression checks rather than direct edits in this slice.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- All verification commands are concrete.

### Type consistency

- `SkillDiscoveryEntry`, `discoverLocalSkills`, `importLocalSkill`, `importGitHubSkill`, and `deleteLibrarySkill` stay consistent across test and implementation tasks.

Plan complete and saved to `docs/superpowers/plans/2026-05-01-goodnight-skills-library-alignment-implementation.md`.
