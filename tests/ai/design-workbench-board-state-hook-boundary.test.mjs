import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const designWorkbenchViewPath = path.resolve(__dirname, '../../src/components/design/DesignWorkbenchView.tsx');

test('design workbench delegates board state and persistence into a dedicated hook', async () => {
  const source = await readFile(designWorkbenchViewPath, 'utf8');

  assert.doesNotMatch(source, /const \[designPageNodes, setDesignPageNodes\] = useState/);
  assert.doesNotMatch(source, /const \[designFlowNodes, setDesignFlowNodes\] = useState/);
  assert.doesNotMatch(source, /const \[designTextNodes, setDesignTextNodes\] = useState/);
  assert.doesNotMatch(source, /const \[designAINodes, setDesignAINodes\] = useState/);
  assert.doesNotMatch(source, /const \[designStyleNodes, setDesignStyleNodes\] = useState/);
  assert.doesNotMatch(source, /const \[designFlowEdges, setDesignFlowEdges\] = useState/);

  assert.doesNotMatch(source, /const readPersistedDesignBoardState = \(projectId: string\)/);
  assert.doesNotMatch(source, /loadDesignBoardStateFromDisk\(/);
  assert.doesNotMatch(source, /saveDesignBoardStateToDisk\(/);
  assert.doesNotMatch(source, /const \[defaultStylePresets, setDefaultStylePresets\] = useState/);
  assert.doesNotMatch(source, /const \[builtinStylePackPaths, setBuiltinStylePackPaths\] = useState/);
  assert.doesNotMatch(source, /const \[stylePresets, setStylePresets\] = useState/);
  assert.doesNotMatch(source, /const \[styleInspectorMode, setStyleInspectorMode\] = useState/);
  assert.doesNotMatch(source, /const \[styleMarkdownDraft, setStyleMarkdownDraft\] = useState/);
  assert.doesNotMatch(source, /loadProjectStylePackPresets\(/);
  assert.doesNotMatch(source, /saveProjectStylePackFile\(/);
});
