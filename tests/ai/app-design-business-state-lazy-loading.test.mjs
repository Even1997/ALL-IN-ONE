import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');

test('app delegates design business state and persistence orchestration to the lazy design module', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.doesNotMatch(source, /const \[defaultStylePresets, setDefaultStylePresets\] = useState/);
  assert.doesNotMatch(source, /const \[builtinStylePackPaths, setBuiltinStylePackPaths\] = useState/);
  assert.doesNotMatch(source, /const \[stylePresets, setStylePresets\] = useState/);
  assert.doesNotMatch(source, /const \[selectedDesignPageId, setSelectedDesignPageId\] = useState/);
  assert.doesNotMatch(source, /const \[designCanvasSelection, setDesignCanvasSelection\] = useState/);
  assert.doesNotMatch(source, /const \[designSelectionIds, setDesignSelectionIds\] = useState/);
  assert.doesNotMatch(source, /const \[styleInspectorMode, setStyleInspectorMode\] = useState/);
  assert.doesNotMatch(source, /const \[styleMarkdownDraft, setStyleMarkdownDraft\] = useState/);

  assert.doesNotMatch(source, /const designPages = useMemo\(/);
  assert.doesNotMatch(source, /const sketchLibraryTree = useMemo\(/);
  assert.doesNotMatch(source, /const selectedDesignContextItems = useMemo/);
  assert.doesNotMatch(source, /const linkedStyleNodesForSelectedPage = useMemo/);
  assert.doesNotMatch(source, /const handleGenerateDesignDraft = useCallback\(/);
  assert.doesNotMatch(source, /const appendEdge = useCallback\(/);
  assert.doesNotMatch(source, /const updateCanvasNodePosition = useCallback\(/);
  assert.doesNotMatch(source, /const handleAddDesignPage = useCallback\(/);
  assert.doesNotMatch(source, /const handleAddPageReferenceNode = useCallback\(/);
  assert.doesNotMatch(source, /const handleAddFlowNode = useCallback\(/);
  assert.doesNotMatch(source, /const handleAddTextNode = useCallback\(/);
  assert.doesNotMatch(source, /const handleAddStyleNode = useCallback\(/);

  assert.doesNotMatch(source, /loadProjectStylePackPresets\(/);
  assert.doesNotMatch(source, /saveProjectStylePackFile\(/);
  assert.doesNotMatch(source, /writeSketchPageFile\(/);
  assert.doesNotMatch(source, /loadStylePackModule\(\)/);
});
