import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const designWorkbenchScreenPath = path.resolve(__dirname, '../../src/components/design/DesignWorkbenchScreen.tsx');
const designCanvasControllerHookPath = path.resolve(__dirname, '../../src/components/design/useDesignCanvasController.ts');

test('design workbench screen delegates canvas controller state and pointer interactions into a dedicated hook', async () => {
  const [screenSource, hookSource] = await Promise.all([
    readFile(designWorkbenchScreenPath, 'utf8'),
    readFile(designCanvasControllerHookPath, 'utf8'),
  ]);

  assert.match(screenSource, /useDesignCanvasController\(/);
  assert.doesNotMatch(screenSource, /const \[designMarqueeSelection, setDesignMarqueeSelection\] = useState/);
  assert.doesNotMatch(screenSource, /const \[designNodeLayers, setDesignNodeLayers\] = useState/);
  assert.doesNotMatch(screenSource, /const \[connectionDraft, setConnectionDraft\] = useState/);
  assert.doesNotMatch(screenSource, /const \[designZoom, setDesignZoom\] = useState/);
  assert.doesNotMatch(screenSource, /const \[designCamera, setDesignCamera\] = useState/);
  assert.doesNotMatch(screenSource, /const \[isCanvasPanning, setIsCanvasPanning\] = useState/);
  assert.doesNotMatch(screenSource, /const \[isSpacePressed, setIsSpacePressed\] = useState/);
  assert.doesNotMatch(screenSource, /const \[designCanvasMode, setDesignCanvasMode\] = useState/);
  assert.doesNotMatch(screenSource, /const \[designCanvasContextMenu, setDesignCanvasContextMenu\] = useState/);
  assert.doesNotMatch(screenSource, /const \[designBoardViewport, setDesignBoardViewport\] = useState/);
  assert.doesNotMatch(screenSource, /const designBoardBounds = useMemo\(/);
  assert.doesNotMatch(screenSource, /const designGridMetrics = useMemo\(/);
  assert.doesNotMatch(screenSource, /const connectionDraftPath = useMemo\(/);
  assert.doesNotMatch(screenSource, /const designSelectionRect = useMemo\(/);
  assert.doesNotMatch(screenSource, /const handleConnectorPointerDown = useCallback\(/);
  assert.doesNotMatch(screenSource, /const handleDesignNodePointerDown = useCallback\(/);
  assert.doesNotMatch(screenSource, /const handleDesignBoardWheel = useCallback\(/);
  assert.doesNotMatch(screenSource, /const handleDesignBoardContextMenu = useCallback\(/);
  assert.doesNotMatch(screenSource, /const handleDesignBoardPointerDown = useCallback\(/);

  assert.match(hookSource, /export const useDesignCanvasController = \(/);
  assert.match(hookSource, /const \[designZoom, setDesignZoom\] = useState/);
  assert.match(hookSource, /const handleConnectorPointerDown = useCallback\(/);
  assert.match(hookSource, /const handleDesignBoardPointerDown = useCallback\(/);
});
