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
  assert.match(pageSource, /uninstallLibrarySkill/);
  assert.match(pageSource, /技能库/);
  assert.match(pageSource, /搜索技能/);
  assert.match(pageSource, /推荐/);
  assert.match(pageSource, /系统/);
  assert.match(pageSource, /个人/);
  assert.match(pageSource, /已装/);
  assert.match(pageSource, /gn-agent-skills-toolbar-bar/);
  assert.match(pageSource, /gn-agent-skills-tab-list/);
  assert.match(pageSource, /gn-agent-skills-compact-list/);
  assert.match(pageSource, /gn-agent-skills-section-block/);
  assert.match(pageSource, /gn-agent-skills-row/);
  assert.match(pageSource, /gn-agent-skills-detail-dialog/);
  assert.match(pageSource, /gn-agent-skills-search/);
  assert.match(pageSource, /gn-agent-skills-detail-actions/);
  assert.match(pageSource, /MacDialog/);
  assert.match(pageSource, /readSkillFile/);
  assert.match(pageSource, /技能内容/);
  assert.match(pageSource, /gn-agent-skills-preview/);
  assert.match(pageSource, /刷新列表/);
  assert.match(pageSource, /导入本地技能/);
  assert.match(pageSource, /GitHub 下载/);
  assert.match(pageSource, /卸载/);
  assert.match(pageSource, /删除/);
  assert.match(pageSource, /查看全文/);
  assert.match(pageSource, /已写入聊天框/);
  assert.match(pageSource, /\/skill/);
  assert.match(pageSource, /getSkillTab/);
  assert.match(pageSource, /getSystemSkillBucket/);
  assert.doesNotMatch(pageSource, /gn-agent-skills-hero/);
  assert.doesNotMatch(pageSource, /gn-agent-skills-summary-card/);
  assert.doesNotMatch(pageSource, /让 GoodNight 按你的方式工作/);
  assert.doesNotMatch(pageSource, /@skill/);
  assert.doesNotMatch(pageSource, /syncSkillToRuntime/);
  assert.doesNotMatch(pageSource, /type SkillLibraryFilter = 'all'/);
  assert.doesNotMatch(pageSource, /gn-agent-skills-detail-panel/);

  assert.match(librarySource, /category:\s*string/);
  assert.match(librarySource, /builtin:\s*boolean/);
  assert.match(librarySource, /deletable:\s*boolean/);
  assert.match(librarySource, /read_text_file/);
  assert.match(librarySource, /readSkillFile/);
  assert.match(librarySource, /uninstall_library_skill/);
  assert.match(librarySource, /delete_library_skill/);
});

test('gnAgent skills page styles follow the current light and dark theme system', async () => {
  const cssSource = await readFile(cssPath, 'utf8');

  assert.match(cssSource, /--gn-skills-text:\s*var\(--mode-text/);
  assert.match(cssSource, /--gn-skills-muted:\s*var\(--mode-muted/);
  assert.match(cssSource, /--gn-skills-border:\s*var\(--mode-border/);
  assert.match(cssSource, /--gn-skills-chip:\s*var\(--mode-chip/);
  assert.match(cssSource, /--gn-skills-input:\s*var\(--mode-input/);
  assert.match(cssSource, /\.gn-agent-skills-toolbar-bar\s*\{/);
  assert.match(cssSource, /\.gn-agent-skills-tab-list\s*\{/);
  assert.match(cssSource, /\.gn-agent-skills-compact-list\s*\{/);
  assert.match(cssSource, /\.gn-agent-skills-row\s*\{/);
  assert.match(cssSource, /\.gn-agent-skills-detail-dialog\s*\{/);
  assert.match(cssSource, /\.gn-agent-skills-preview\s*\{/);
  assert.match(cssSource, /\.gn-agent-skills-preview-body\s*\{/);
  assert.doesNotMatch(cssSource, /\.gn-agent-skills-hero\s*\{/);
  assert.doesNotMatch(cssSource, /\.gn-agent-skills-summary-card\s*\{/);
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

test('skill library falls back cleanly outside the Tauri runtime', async () => {
  const librarySource = await readFile(libraryPath, 'utf8');

  assert.match(librarySource, /isTauriRuntimeAvailable/);
  assert.match(librarySource, /buildSystemSkillDiscoveryEntries/);
  assert.match(librarySource, /if \(!isTauriRuntimeAvailable\(\)\)/);
  assert.match(librarySource, /Promise\.resolve\(buildSystemSkillDiscoveryEntries\(\)\)/);
  assert.match(librarySource, /readSystemSkillFile/);
  assert.match(librarySource, /goodnight:\/\/system-skills/);
  assert.match(librarySource, /Promise\.reject\(new Error\('GoodNight desktop runtime is required/);
});
