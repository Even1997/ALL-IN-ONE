import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const libPath = path.resolve(testDir, '../../src-tauri/src/lib.rs');
const builtinRoot = path.resolve(testDir, '../../goodnight-skills/built-in');

const skillIds = [
  'goodnight-boundary',
  'goodnight-workspace-context',
  'goodnight-sketch-output',
  'goodnight-design-output',
];

test('goodnight ships official built-in skill source files and seeds them from tauri', async () => {
  const libSource = await readFile(libPath, 'utf8');

  assert.match(libSource, /ensure_builtin_skills_installed/);
  assert.match(libSource, /goodnight-boundary/);
  assert.match(libSource, /goodnight-workspace-context/);
  assert.match(libSource, /goodnight-sketch-output/);
  assert.match(libSource, /goodnight-design-output/);

  for (const skillId of skillIds) {
    const skillDir = path.join(builtinRoot, skillId);
    const skillMd = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    const manifest = await readFile(path.join(skillDir, 'skill.json'), 'utf8');

    assert.match(skillMd, /^---/);
    assert.match(skillMd, /description:/);
    assert.match(manifest, /"source"\s*:\s*\{\s*"type"\s*:\s*"built-in"/);
  }
});

test('built-in skills encode goodnight boundary and output contracts', async () => {
  const boundary = await readFile(path.join(builtinRoot, 'goodnight-boundary', 'SKILL.md'), 'utf8');
  const workspace = await readFile(path.join(builtinRoot, 'goodnight-workspace-context', 'SKILL.md'), 'utf8');
  const sketch = await readFile(path.join(builtinRoot, 'goodnight-sketch-output', 'SKILL.md'), 'utf8');
  const design = await readFile(path.join(builtinRoot, 'goodnight-design-output', 'SKILL.md'), 'utf8');

  assert.match(boundary, /Knowledge Zone/);
  assert.match(boundary, /Sketch Zone/);
  assert.match(boundary, /Design Zone/);
  assert.match(boundary, /activity log/i);

  assert.match(workspace, /sketch\/pages/);
  assert.match(workspace, /design\/prototypes/);
  assert.match(workspace, /design\/styles/);
  assert.match(workspace, /\.devflow/);

  assert.match(sketch, /sketch\/pages/);
  assert.match(sketch, /wireframe/i);
  assert.match(sketch, /route/i);
  assert.match(sketch, /##\s*新页面 1/);
  assert.match(sketch, /- route:\s*\/pages\/新页面-1/);
  assert.match(sketch, /- frame:\s*1280x800/);
  assert.match(sketch, /- modules:/);
  assert.match(sketch, /position:\s*0,\s*0/);
  assert.match(sketch, /size:\s*80,\s*60/);
  assert.match(sketch, /sketch\/pages\/<page-slug>\.md/i);
  assert.match(sketch, /\/pages\/<page-slug>/i);
  assert.match(sketch, /Use integers only for `position` and `size`/i);
  assert.match(sketch, /top-left origin/i);

  assert.match(design, /design\/styles/);
  assert.match(design, /design\/prototypes/);
  assert.match(design, /tokens/i);
  assert.match(design, /responsive/i);
  assert.match(design, /style-output\.md/);
  assert.match(design, /prototype-output\.md/);
  assert.match(design, /##\s*Visual Direction/i);
  assert.match(design, /##\s*Design Tokens/i);
  assert.match(design, /##\s*Prototype Spec/i);
  assert.match(design, /##\s*Responsive Behavior/i);
  assert.match(design, /design\/styles\/<style-slug>\.md/i);
  assert.match(design, /design\/prototypes\/<page-slug>\.html/i);
  assert.match(design, /color-bg-page/i);
  assert.match(design, /font-heading-primary/i);
  assert.match(design, /space-16/i);
  assert.match(design, /radius-card/i);
});
