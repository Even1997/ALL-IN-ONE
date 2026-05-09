import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../../src/App.tsx');

test('app delegates design board state and persistence to the lazy design module', async () => {
  const source = await readFile(appPath, 'utf8');

  assert.doesNotMatch(source, /const \[designPageNodes, setDesignPageNodes\] = useState/);
  assert.doesNotMatch(source, /const \[designFlowNodes, setDesignFlowNodes\] = useState/);
  assert.doesNotMatch(source, /const \[designTextNodes, setDesignTextNodes\] = useState/);
  assert.doesNotMatch(source, /const \[designAINodes, setDesignAINodes\] = useState/);
  assert.doesNotMatch(source, /const \[designStyleNodes, setDesignStyleNodes\] = useState/);
  assert.doesNotMatch(source, /const \[designFlowEdges, setDesignFlowEdges\] = useState/);

  assert.doesNotMatch(source, /const readPersistedDesignBoardState = \(projectId: string\)/);
  assert.doesNotMatch(source, /loadDesignBoardStateFromDisk\(/);
  assert.doesNotMatch(source, /saveDesignBoardStateToDisk\(/);

  assert.doesNotMatch(source, /designPageNodes,/);
  assert.doesNotMatch(source, /designFlowNodes,/);
  assert.doesNotMatch(source, /designTextNodes,/);
  assert.doesNotMatch(source, /designAINodes,/);
  assert.doesNotMatch(source, /designStyleNodes,/);
  assert.doesNotMatch(source, /designFlowEdges,/);
  assert.doesNotMatch(source, /setDesignPageNodes,/);
  assert.doesNotMatch(source, /setDesignFlowNodes,/);
  assert.doesNotMatch(source, /setDesignTextNodes,/);
  assert.doesNotMatch(source, /setDesignAINodes,/);
  assert.doesNotMatch(source, /setDesignStyleNodes,/);
  assert.doesNotMatch(source, /setDesignFlowEdges,/);
});
