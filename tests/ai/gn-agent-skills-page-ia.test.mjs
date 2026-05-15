import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx');
const cssPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentSkillsPage.css');
const backendPath = path.resolve(__dirname, '../../src-tauri/src/lib.rs');
const presentationPath = path.resolve(
  __dirname,
  '../../src/modules/ai/skills/skillLibraryPresentation.ts'
);

test('skills page uses system and personal tabs with a compact single-column list and detail dialog', async () => {
  const [pageSource, cssSource] = await Promise.all([
    readFile(pagePath, 'utf8'),
    readFile(cssPath, 'utf8'),
  ]);

  assert.match(pageSource, /type SkillLibraryTab = 'system' \| 'personal'/);
  assert.match(pageSource, /推荐/);
  assert.match(pageSource, /已装/);
  assert.match(pageSource, /查看详情|技能详情|detail dialog/i);
  assert.match(pageSource, /className="gn-agent-skills-tab-list"/);
  assert.match(pageSource, /className="gn-agent-skills-compact-list"/);
  assert.match(pageSource, /className="gn-agent-skills-section-block"/);
  assert.match(pageSource, /MacDialog/);
  assert.match(pageSource, /卸载/);
  assert.match(pageSource, /删除/);
  assert.match(pageSource, /查看全文/);
  assert.match(pageSource, /使用/);
  assert.doesNotMatch(pageSource, /type SkillLibraryFilter = 'all'/);
  assert.doesNotMatch(pageSource, /selectedPromptContent/);
  assert.doesNotMatch(pageSource, /gn-agent-skills-detail-panel/);
  assert.doesNotMatch(pageSource, /grid-template-columns: minmax\(0, 0\.94fr\) minmax\(0, 1\.06fr\)/);

  assert.match(cssSource, /\.gn-agent-skills-tab-list/);
  assert.match(cssSource, /\.gn-agent-skills-compact-list/);
  assert.match(cssSource, /\.gn-agent-skills-row/);
  assert.match(cssSource, /\.gn-agent-skills-detail-dialog/);
  assert.match(cssSource, /\.gn-agent-skills-detail-actions/);
});

test('skills backend exposes remembered sources plus separate uninstall and delete flows', async () => {
  const backendSource = await readFile(backendPath, 'utf8');

  assert.match(backendSource, /fn\s+uninstall_library_skill/);
  assert.match(backendSource, /fn\s+delete_library_skill/);
  assert.match(backendSource, /SkillSourceRegistryEntry/);
  assert.match(backendSource, /source_registry|sources\.json/i);
  assert.match(backendSource, /recommended/i);
  assert.match(backendSource, /builtin/);
  assert.match(backendSource, /imported/);
  assert.match(backendSource, /remembered_source|source_registry/i);
});

test('skills frontend uses presentation helpers for tabs buckets and action rules', async () => {
  const presentationSource = await readFile(presentationPath, 'utf8');

  assert.match(presentationSource, /type SkillLibraryTab = 'system' \| 'personal'/);
  assert.match(presentationSource, /type SystemSkillBucket = 'recommended' \| 'installed'/);
  assert.match(presentationSource, /getSkillPrimaryAction/);
  assert.match(presentationSource, /canDeleteSkill/);
  assert.match(presentationSource, /canUninstallSkill/);
});
