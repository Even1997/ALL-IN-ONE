import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const chatPath = path.resolve(testDir, '../../src/components/workspace/AIChat.tsx');
const cssPath = path.resolve(testDir, '../../src/components/workspace/AIChat.css');
const piecesPath = path.resolve(testDir, '../../src/components/ai/claudian/ClaudianEmbeddedPieces.tsx');

test('AIChat exposes chat, skills, and activity views in the shell', async () => {
  const source = await readFile(chatPath, 'utf8');
  const css = await readFile(cssPath, 'utf8');
  const pieces = await readFile(piecesPath, 'utf8');

  assert.match(source, /chat-shell-view-tabs/);
  assert.match(source, /Skills/);
  assert.match(source, /Activity/);
  assert.match(source, /discoverLocalSkills/);
  assert.match(source, /syncSkillToRuntime/);
  assert.match(source, /importGitHubSkill/);
  assert.match(pieces, /GitHub Repo/);
  assert.match(pieces, /Import from GitHub/);
  assert.match(pieces, /Sync to Codex/);
  assert.match(pieces, /Sync to Claude/);
  assert.match(css, /\.chat-skill-library/);
  assert.match(css, /\.chat-activity-log/);
  assert.match(css, /\.chat-skill-sync-row/);
  assert.match(css, /\.chat-skill-github-form/);
});
