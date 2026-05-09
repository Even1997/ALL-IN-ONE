import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');

test('app delegates design canvas controller state and interactions to the lazy design module', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.doesNotMatch(source, /const \[connectionDraft, setConnectionDraft\] = useState/);
  assert.doesNotMatch(source, /const \[designZoom, setDesignZoom\] = useState/);
  assert.doesNotMatch(source, /const \[designCamera, setDesignCamera\] = useState/);
  assert.doesNotMatch(source, /const \[isCanvasPanning, setIsCanvasPanning\] = useState/);
  assert.doesNotMatch(source, /const \[isSpacePressed, setIsSpacePressed\] = useState/);
  assert.doesNotMatch(source, /const \[designCanvasMode, setDesignCanvasMode\] = useState/);
  assert.doesNotMatch(source, /const \[designCanvasContextMenu, setDesignCanvasContextMenu\] = useState/);
  assert.doesNotMatch(source, /const \[designBoardViewport, setDesignBoardViewport\] = useState/);
  assert.doesNotMatch(source, /const connectionDraftPath = useMemo\(/);
  assert.doesNotMatch(source, /const designBoardBounds = useMemo\(/);
  assert.doesNotMatch(source, /const designGridMetrics = useMemo\(/);
  assert.doesNotMatch(source, /const designSelectionRect = useMemo\(/);
  assert.doesNotMatch(source, /const handleConnectorPointerDown = useCallback\(/);
  assert.doesNotMatch(source, /const handleDesignNodePointerDown = useCallback\(/);
  assert.doesNotMatch(source, /const handleDesignBoardWheel = useCallback\(/);
  assert.doesNotMatch(source, /const handleDesignBoardContextMenu = useCallback\(/);
  assert.doesNotMatch(source, /const handleDesignBoardPointerDown = useCallback\(/);
});
