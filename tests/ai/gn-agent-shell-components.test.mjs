import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shellPath = path.resolve(__dirname, '../../src/components/ai/gn-agent-shell/GNAgentShell.tsx');

test('gnAgent shell keeps runtime switching and exposes a dedicated skills page', async () => {
  const shellSource = await readFile(shellPath, 'utf8');
  assert.match(
    shellSource,
    /className="gn-agent-header-actions"[\s\S]*<GNAgentModeSwitch\s+compact\s*\/>/
  );
  assert.match(shellSource, /GNAgentTabBadges/);
  assert.match(shellSource, /className="gn-agent-header"/);
  assert.match(shellSource, /className="gn-agent-tab-content-container"/);
  assert.doesNotMatch(shellSource, /gn-agent-launcher-rail/);
  assert.doesNotMatch(shellSource, /clau\dian-launcher-hero|gn-agent-launcher-hero/);
  assert.doesNotMatch(shellSource, /gn-agent-header-runtime-strip/);
  assert.match(shellSource, /currentMode === 'config'/);
  assert.match(shellSource, /currentMode === 'skills'/);
  assert.match(shellSource, /currentMode === 'claude'/);
  assert.match(shellSource, /currentMode === 'codex'/);
  assert.match(shellSource, /GNAgentSkillsPage/);
});

