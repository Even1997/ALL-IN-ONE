import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pagePath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentSkillsPage.tsx');
const cssPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentSkillsPage.css');
const libraryPath = path.resolve(__dirname, '../../src/modules/ai/skills/skillLibrary.ts');
const dialogPath = path.resolve(__dirname, '../../src/components/ui/MacDialog.tsx');
const appCssPath = path.resolve(__dirname, '../../src/App.css');

test('gnAgent skills page exposes a global skill management surface', async () => {
  const pageSource = await readFile(pagePath, 'utf8');
  const librarySource = await readFile(libraryPath, 'utf8');

  assert.match(pageSource, /discoverLocalSkills/);
  assert.match(pageSource, /importLocalSkill/);
  assert.match(pageSource, /importGitHubSkill/);
  assert.match(pageSource, /deleteLibrarySkill/);
  assert.match(pageSource, /让 GoodNight 按你的方式工作/);
  assert.match(pageSource, /\.goodnight/);
  assert.match(pageSource, /搜索技能/);
  assert.match(pageSource, /推荐/);
  assert.match(pageSource, /系统/);
  assert.match(pageSource, /个人/);
  assert.match(pageSource, /全部/);
  assert.match(pageSource, /gn-agent-skills-hero/);
  assert.match(pageSource, /gn-agent-skills-search/);
  assert.match(pageSource, /gn-agent-skills-section/);
  assert.match(pageSource, /gn-agent-skills-card-status/);
  assert.match(pageSource, /MacDialog/);
  assert.match(pageSource, /readSkillFile/);
  assert.match(pageSource, /查看/);
  assert.match(pageSource, /技能内容/);
  assert.match(pageSource, /gn-agent-skills-preview/);
  assert.match(pageSource, /管理/);
  assert.match(pageSource, /导入本地技能/);
  assert.match(pageSource, /GitHub 下载/);
  assert.match(pageSource, /移除/);
  assert.match(pageSource, /skill\.category === 'system'/);
  assert.match(pageSource, /skill\.source === 'GoodNight recommended'/);
  assert.doesNotMatch(pageSource, /syncSkillToRuntime/);
  assert.doesNotMatch(pageSource, /Sync to Codex/);
  assert.doesNotMatch(pageSource, /Sync to Claude/);

  assert.match(librarySource, /category:\s*string/);
  assert.match(librarySource, /builtin:\s*boolean/);
  assert.match(librarySource, /deletable:\s*boolean/);
  assert.match(librarySource, /read_text_file/);
  assert.match(librarySource, /readSkillFile/);
  assert.match(librarySource, /delete_library_skill/);
});

test('gnAgent skills page styles follow the current light and dark theme system', async () => {
  const cssSource = await readFile(cssPath, 'utf8');

  assert.match(cssSource, /--gn-skills-text:\s*var\(--mode-text/);
  assert.match(cssSource, /--gn-skills-muted:\s*var\(--mode-muted/);
  assert.match(cssSource, /--gn-skills-border:\s*var\(--mode-border/);
  assert.match(cssSource, /--gn-skills-chip:\s*var\(--mode-chip/);
  assert.match(cssSource, /--gn-skills-input:\s*var\(--mode-input/);
  assert.match(cssSource, /\.gn-agent-skills-preview\s*\{/);
  assert.match(cssSource, /\.gn-agent-skills-preview-body\s*\{/);
  assert.match(cssSource, /:root\[data-theme='light'\]\s+\.gn-agent-skills-page/);
  assert.match(cssSource, /:root\[data-theme='dark'\]\s+\.gn-agent-skills-page/);
});

test('gnAgent skills preview dialog can opt into a wider content width without overflowing its body', async () => {
  const pageSource = await readFile(pagePath, 'utf8');
  const cssSource = await readFile(cssPath, 'utf8');
  const dialogSource = await readFile(dialogPath, 'utf8');
  const appCssSource = await readFile(appCssPath, 'utf8');

  assert.match(pageSource, /contentClassName="gn-agent-skills-preview-dialog"/);
  assert.match(dialogSource, /contentClassName\?: string/);
  assert.match(dialogSource, /className=\{contentClassName \? `mac-dialog-content \$\{contentClassName\}` : 'mac-dialog-content'\}/);
  assert.match(appCssSource, /\.mac-dialog-content\.gn-agent-skills-preview-dialog\s*\{/);
  assert.match(appCssSource, /width:\s*min\(960px,\s*calc\(100vw - 32px\)\)/);
  assert.match(cssSource, /\.gn-agent-skills-preview\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(cssSource, /\.gn-agent-skills-preview\s*\{[\s\S]*width:\s*min\(72vw,\s*920px\);/);
  assert.match(cssSource, /\.gn-agent-skills-preview\s*\{[\s\S]*max-width:\s*100%;/);
  assert.match(cssSource, /\.gn-agent-skills-preview-body\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(cssSource, /\.gn-agent-skills-preview-body\s*\{[\s\S]*max-width:\s*100%;/);
  assert.match(cssSource, /\.gn-agent-skills-preview-body\s*\{[\s\S]*box-sizing:\s*border-box;/);
});

