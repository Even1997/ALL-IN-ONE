import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx');
const libraryPath = path.resolve(__dirname, '../../src/modules/ai/skills/skillLibrary.ts');

test('gnAgent skills page exposes a global skill management surface', async () => {
  const pageSource = await readFile(pagePath, 'utf8');
  const librarySource = await readFile(libraryPath, 'utf8');

  assert.match(pageSource, /discoverLocalSkills/);
  assert.match(pageSource, /importLocalSkill/);
  assert.match(pageSource, /importGitHubSkill/);
  assert.match(pageSource, /syncSkillToRuntime/);
  assert.match(pageSource, /deleteLibrarySkill/);
  assert.match(pageSource, /Built-in/);
  assert.match(pageSource, /Sync to Codex/);
  assert.match(pageSource, /Sync to Claude/);
  assert.match(pageSource, /Delete/);
  assert.match(pageSource, /Import Local Skill/);
  assert.match(pageSource, /Download from GitHub/);

  assert.match(librarySource, /builtin:\s*boolean/);
  assert.match(librarySource, /deletable:\s*boolean/);
  assert.match(librarySource, /delete_library_skill/);
});

