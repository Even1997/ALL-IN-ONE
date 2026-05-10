import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const sidecarIndexPath = path.join(repoRoot, 'apps/runtime/src/index.ts');
const runtimePolicyPath = path.join(repoRoot, 'src/modules/ai/runtime/tools/runtimeToolPolicy.ts');

test('runtime sidecar imports shared allowed-tool policy instead of declaring its own list', async () => {
  const sidecarSource = await readFile(sidecarIndexPath, 'utf8');
  assert.doesNotMatch(sidecarSource, /const SIDE_EFFECT_TOOLS\s*=/);
  assert.match(sidecarSource, /getTurnAllowedRuntimeTools/);
});

test('shared runtime tool policy file exists and exports powershell-aware command policy', async () => {
  const policySource = await readFile(runtimePolicyPath, 'utf8');
  assert.match(policySource, /powershell/);
  assert.match(policySource, /READ_ONLY_RUNTIME_TOOLS/);
  assert.match(policySource, /getTurnAllowedRuntimeTools/);
});
