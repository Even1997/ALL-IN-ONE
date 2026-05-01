import assert from 'node:assert/strict';
import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
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
  'goodnight-m-flow',
  'goodnight-llmwiki',
  'goodnight-rag',
];

test('goodnight ships official built-in skill source files and seeds them from tauri', async () => {
  const libSource = await readFile(libPath, 'utf8');

  assert.match(libSource, /ensure_builtin_skills_installed/);
  assert.match(libSource, /goodnight-boundary/);
  assert.match(libSource, /goodnight-workspace-context/);
  assert.match(libSource, /goodnight-sketch-output/);
  assert.match(libSource, /goodnight-design-output/);
  assert.match(libSource, /goodnight-m-flow/);
  assert.match(libSource, /goodnight-llmwiki/);
  assert.match(libSource, /goodnight-rag/);

  for (const skillId of skillIds) {
    const skillDir = path.join(builtinRoot, skillId);
    const skillMd = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    const manifest = await readFile(path.join(skillDir, 'skill.json'), 'utf8');

    assert.match(skillMd, /^---/);
    assert.match(skillMd, /description:/);
    assert.match(manifest, /"source"\s*:\s*\{\s*"type"\s*:\s*"built-in"/);
  }
});

test('knowledge built-in skills keep m-flow visible and legacy methods hidden', async () => {
  const manifests = await Promise.all(
    ['goodnight-m-flow', 'goodnight-llmwiki', 'goodnight-rag'].map(async (skillId) =>
      JSON.parse(await readFile(path.join(builtinRoot, skillId, 'skill.json'), 'utf8'))
    )
  );

  assert.deepEqual(
    manifests.map((manifest) => manifest.runtime.knowledgeMethod).sort(),
    ['llmwiki', 'm-flow', 'rag']
  );

  for (const manifest of manifests) {
    assert.equal(typeof manifest.runtime.contextSection, 'string');
    assert.equal(manifest.runtime.visibleOutputs.length > 0, true);
    assert.equal(manifest.runtime.promptPolicy.includes('runtime policy'), true);
  }

  const mFlowManifest = manifests.find((manifest) => manifest.runtime.knowledgeMethod === 'm-flow');
  const llmwikiManifest = manifests.find((manifest) => manifest.runtime.knowledgeMethod === 'llmwiki');
  const ragManifest = manifests.find((manifest) => manifest.runtime.knowledgeMethod === 'rag');

  assert.equal(mFlowManifest.install.visibleByDefault, true);
  assert.equal(mFlowManifest.install.enabledByDefault, true);
  assert.equal(mFlowManifest.runtime.stateOutputs.every((output) => output.endsWith('.json')), true);
  assert.equal(mFlowManifest.runtime.visibleOutputs.some((output) => /\.(json|jsonl)$/i.test(output)), false);

  assert.equal(llmwikiManifest.install.visibleByDefault, false);
  assert.equal(llmwikiManifest.install.enabledByDefault, false);
  assert.equal(ragManifest.install.visibleByDefault, false);
  assert.equal(ragManifest.install.enabledByDefault, false);
});

test('built-in skills encode goodnight boundary and output contracts', async () => {
  const boundary = await readFile(path.join(builtinRoot, 'goodnight-boundary', 'SKILL.md'), 'utf8');
  const workspace = await readFile(path.join(builtinRoot, 'goodnight-workspace-context', 'SKILL.md'), 'utf8');
  const sketch = await readFile(path.join(builtinRoot, 'goodnight-sketch-output', 'SKILL.md'), 'utf8');
  const design = await readFile(path.join(builtinRoot, 'goodnight-design-output', 'SKILL.md'), 'utf8');
  const mFlow = await readFile(path.join(builtinRoot, 'goodnight-m-flow', 'SKILL.md'), 'utf8');
  const llmwiki = await readFile(path.join(builtinRoot, 'goodnight-llmwiki', 'SKILL.md'), 'utf8');
  const rag = await readFile(path.join(builtinRoot, 'goodnight-rag', 'SKILL.md'), 'utf8');

  assert.match(boundary, /Knowledge Zone/);
  assert.match(boundary, /Sketch Zone/);
  assert.match(boundary, /Design Zone/);
  assert.match(boundary, /activity log/i);
  assert.match(boundary, /\.goodnight\//);
  assert.match(boundary, /_goodnight\/outputs/);

  assert.match(workspace, /sketch\/pages/);
  assert.match(workspace, /design\/prototypes/);
  assert.match(workspace, /design\/styles/);
  assert.match(workspace, /\.goodnight\/m-flow/);
  assert.match(workspace, /_goodnight\/outputs\/<skill>/i);
  assert.match(workspace, /vault/i);

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
  assert.match(design, /_goodnight\/outputs\/goodnight-design-output/i);
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

  assert.match(mFlow, /m-flow/i);
  assert.match(mFlow, /manual refresh/i);
  assert.match(mFlow, /\.goodnight\/m-flow/i);
  assert.match(mFlow, /manifest\.json/i);
  assert.match(mFlow, /episodes\.json/i);
  assert.match(mFlow, /FacetPoint/i);
  assert.match(mFlow, /inverted cone/i);
  assert.match(mFlow, /Bundle/i);
  assert.match(mFlow, /Path cost/i);
  assert.match(mFlow, /raw dumps/i);

  assert.match(llmwiki, /llmwiki/i);
  assert.match(llmwiki, /hidden compatibility skill/i);
  assert.match(llmwiki, /Karpathy/i);
  assert.match(llmwiki, /Ingest/i);
  assert.match(llmwiki, /Compile/i);
  assert.match(llmwiki, /Lint/i);
  assert.match(llmwiki, /reference-style Markdown/i);
  assert.match(llmwiki, /raw\/\*\.md/);

  assert.match(rag, /rag/i);
  assert.match(rag, /hidden compatibility skill/i);
  assert.match(rag, /retrieval/i);
  assert.match(rag, /chunk/i);
});

test('deep knowledge skills ship method references for progressive disclosure', async () => {
  await access(path.join(builtinRoot, 'goodnight-llmwiki', 'references', 'llmwiki-method.md'));
  await access(path.join(builtinRoot, 'goodnight-llmwiki', 'references', 'raw-template.md'));
  await access(path.join(builtinRoot, 'goodnight-llmwiki', 'references', 'article-template.md'));
  await access(path.join(builtinRoot, 'goodnight-llmwiki', 'references', 'index-template.md'));
  await access(path.join(builtinRoot, 'goodnight-llmwiki', 'references', 'archive-template.md'));
  await access(path.join(builtinRoot, 'goodnight-m-flow', 'references', 'm-flow-method.md'));

  const llmwikiReference = await readFile(
    path.join(builtinRoot, 'goodnight-llmwiki', 'references', 'llmwiki-method.md'),
    'utf8'
  );
  const mFlowReference = await readFile(
    path.join(builtinRoot, 'goodnight-m-flow', 'references', 'm-flow-method.md'),
    'utf8'
  );

  assert.match(llmwikiReference, /Raw Captures/i);
  assert.match(llmwikiReference, /Compilation Heuristics/i);
  const articleTemplate = await readFile(
    path.join(builtinRoot, 'goodnight-llmwiki', 'references', 'article-template.md'),
    'utf8'
  );
  assert.match(articleTemplate, /> Sources:/);
  assert.match(articleTemplate, /> Raw:/);
  assert.match(mFlowReference, /Graph Vocabulary/i);
  assert.match(mFlowReference, /Bundle Search/i);
});

test('repo vendors the reviewed upstream m-flow reference tree', async () => {
  const upstreamRoot = path.resolve(testDir, '../../docs/references/upstream/m-flow');

  await access(path.join(upstreamRoot, 'README.md'));
  await access(path.join(upstreamRoot, 'docs', 'RETRIEVAL_ARCHITECTURE.md'));
  await access(path.join(upstreamRoot, 'm_flow', 'core', 'domain', 'models', 'Episode.py'));
  await access(path.join(upstreamRoot, 'm_flow', 'core', 'domain', 'models', 'Facet.py'));
  await access(path.join(upstreamRoot, 'm_flow', 'core', 'domain', 'models', 'FacetPoint.py'));
  await access(path.join(upstreamRoot, 'm_flow', 'core', 'domain', 'models', 'Entity.py'));
  await access(path.join(upstreamRoot, 'm_flow', 'knowledge', 'graph_ops', 'm_flow_graph', 'MemoryGraphElements.py'));
  await access(path.join(upstreamRoot, 'm_flow', 'retrieval', 'episodic', 'bundle_scorer.py'));
  await access(path.join(upstreamRoot, 'm_flow', 'memory', 'episodic', 'edge_text_generators.py'));
  await access(path.join(upstreamRoot, 'm_flow', 'memory', 'episodic', 'episode_builder', 'step35_node_edge_creation.py'));
  await access(path.join(upstreamRoot, 'SOURCE.md'));
});
